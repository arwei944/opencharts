import { createChart, type IChartApi, type Time } from "lightweight-charts";
import { intervalSec } from "./bars.ts";
import { CompareManager } from "./compare.ts";
import { buildChartOptions } from "./engine/options.ts";
import { ThemeManager } from "./engine/theme.ts";
import { SeriesManager } from "./engine/series.ts";
import { PointerController } from "./engine/pointer.ts";
import { RangeController } from "./engine/range.ts";
import { yToPrice as coordYToPrice, takeScreenshot } from "./export.ts";
import { diffTail, initialLogicalRange, trimTail } from "./series-ops.ts";
import type { CustomFn } from "./indicator-compute.ts";
import { IndicatorRenderer } from "./indicator-render.ts";
import { decideCommit } from "./data-pipeline.ts";
import { RestQueue } from "./rest-queue.ts";
import { IND_TAIL_BARS, IND_TAIL_GROW } from "./constants.ts";
import { chartTelemetry } from "./telemetry.ts";
import { commitPerf, jobPerf, tailPerf } from "./perf-metrics.ts";
import { runInvariants } from "./invariants.ts";

import type { ThemeMode } from "./constants.ts";
import type { Candle, ChartType, IndicatorInst, Interval } from "./types.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

/**
 * ChartEngine — composition facade over the extracted managers:
 *
 *   SeriesManager   main/vol series lifecycle (engine/series.ts)
 *   PointerController  drag-pan + interaction-priority window (engine/pointer.ts)
 *   RangeController    visible-range forwarding/suppression (engine/range.ts)
 *   CompareManager     compare-line series (compare.ts)
 *   IndicatorRenderer  indicator line pipeline (indicator-render.ts)
 *   RestQueue          one-setData-per-frame cosmetic queue (rest-queue.ts)
 *   data-pipeline      decideCommit pure decision layer (data-pipeline.ts)
 *
 * The engine owns bar data (bars/pending/indTail) and the commit orchestration;
 * every other concern lives in a single-purpose module.
 */
export class ChartEngine {
  chart: IChartApi;
  private series: SeriesManager;
  private pointer: PointerController;
  private range: RangeController;
  private theme: ThemeManager;
  private cmp: CompareManager;
  private render: IndicatorRenderer;
  /** 倒垂时是否连成交量一起翻（默认不翻，保持贴底）。 */
  private mirrorVolume = false;
  /**
   * What the series actually hold. In steady state this is the *complete*
   * resident history, so panning and zooming are pure canvas repaints: no
   * `setData`, no indicator recompute, no frame where something is missing.
   */
  private bars: Candle[] = [];
  /**
   * Backfilled history that is deliberately not on screen yet. While the history
   * job is still running, growing the array to the left must not reach the
   * series — one `setData` per fetched page would stutter every pan. It is
   * committed in a single pass once the fill lands, or the moment the viewport
   * actually needs it.
   */
  private pending: Candle[] | null = null;
  private frozen = false;
  /** Tail slice the per-tick indicator refresh recomputes — never the whole history. */
  private indTail: Candle[] = [];
  private indicators: IndicatorInst[] = [];
  /** Runtime-only custom calculators keyed by indicator id (see store.customFns). */
  private customFns: Record<string, CustomFn> = {};
  private interval: Interval = "15m";
  private step = 60;
  private readonly host: HTMLElement;
  private dead = false;

  /** One-setData-per-frame queue for cosmetic full-history redraws. */
  private queue: RestQueue;

  onViewport?: (fromTime: number, toTime: number) => void;
  onRange?: (from: number, to: number) => void;
  onCrosshair?: (time: number | null, price: number | null) => void;
  /** High-frequency visible-range tick for the minimap strip (canvas-side, no React). */
  onMinimap?: (range: { from: number; to: number } | null) => void;
  /** Settings from Zustand store, applied once at construction then refreshed via applyTypography. */
  private settings: typeof DEFAULT_SETTINGS;

  constructor(
    host: HTMLElement,
    mode: ThemeMode = "dark",
    settings: typeof DEFAULT_SETTINGS = DEFAULT_SETTINGS,
  ) {
    this.settings = settings;
    this.host = host;
    this.chart = createChart(host, buildChartOptions(mode, settings));
    this.theme = new ThemeManager(
      this.chart,
      mode,
      () => this.settings,
      () => this.mirrorVolume,
    );
    this.series = new SeriesManager(this.chart, () => this.settings);
    this.cmp = new CompareManager(
      this.chart,
      () => this.theme.current,
      () => this.theme.syncMirror(),
    );
    this.render = new IndicatorRenderer(this.chart, () => ({
      bars: this.bars,
      indicators: this.indicators,
      customFns: this.customFns,
    }));
    this.pointer = new PointerController(host, this.chart, {
      onPointerIdle: () => this.releaseInteracting(),
    });
    this.queue = new RestQueue(
      () => this.pointer.isInteracting,
      () => this.theme.syncMirror(),
      (ms, remaining) => {
        jobPerf.record(ms);
        chartTelemetry.log("queueJob", { remaining }, ms);
      },
    );
    this.range = new RangeController(this.chart, {
      onMinimap: (r) => this.onMinimap?.(r),
      onRangeChange: (from, to) => {
        this.onRange?.(from, to);
        this.onViewport?.(from, to);
        this.maybeRevealPending();
      },
      isDragging: () => this.pointer.isDragging,
    });
    this.series.rebuildMain();
    this.host.style.cursor = "default";
    this.chart.subscribeCrosshairMove((param) => {
      /* While the button owns the chart the library still draws the crosshair on
       * canvas, but forwarding it to React here would re-render the board the user
       * is dragging — a per-mousemove render is what makes a pan trail the cursor. */
      if (this.pointer.isDragging) return;
      const time = typeof param.time === "number" ? param.time : null;
      let price: number | null = null;
      if (this.series.main && param.seriesData) {
        const raw = param.seriesData.get(this.series.main) as
          { close?: number; value?: number } | undefined;
        price = raw?.close ?? raw?.value ?? null;
      }
      if (price == null && param.point && this.series.main) {
        const p = coordYToPrice(this.series.main, param.point.y);
        price = p == null ? null : Number(p);
      }
      this.onCrosshair?.(time, price);
    });
    this.pointer.bind();
  }

  /** True from `pointerdown` until the button is lifted: the DOM must keep out of the way. */
  get isDragging() {
    return this.pointer.isDragging;
  }

  setInterval(interval: Interval) {
    this.interval = interval;
    this.step = intervalSec(interval);
    this.chart.applyOptions({
      timeScale: { secondsVisible: interval === "1s" || interval === "1m" },
    });
  }

  /** Mouse-drag pan sensitivity multiplier (1 = 1:1); >1 faster, <1 slower. */
  setPanSensitivity(v: number) {
    this.pointer.setPanSensitivity(v);
  }

  /** Cursor hint per active tool (crosshair while a drawing tool is active). */
  setCursor(cursor: "default" | "crosshair") {
    this.pointer.setCursor(cursor);
  }

  /** Re-apply typography (font size/family) and price precision live. */
  applyTypography(s: typeof DEFAULT_SETTINGS) {
    this.settings = s;
    this.theme.applyTypography(s);
    this.series.applyPriceFormat();
    this.theme.setTimezone(s.timezone ?? "local");
  }

  setType(t: ChartType) {
    if (this.series.chartType === t) return;
    this.series.setType(t);
    this.theme.syncMirror();
  }

  setInvert(v: boolean) {
    this.series.setInvert(v);
    this.series.applyVol(this.bars);
    this.theme.syncMirror();
  }

  setLog(v: boolean) {
    this.chart.priceScale("right").applyOptions({ mode: v ? 1 : 0 });
  }

  setShowVol(v: boolean) {
    this.series.setShowVol(v);
    this.series.applyVol(this.bars);
  }

  /**
   * Adopt the resident series. Left-hand growth is parked in `pending` rather
   * than pushed into the series: a `setData` per fetched page — or one landed
   * exactly under the pointer — would stutter the pan. It reaches the screen in a
   * single pass once the fill lands *and* the mouse is idle, or the instant the
   * viewport pans past what is drawn.
   */
  setFullData(bars: Candle[], frozen: boolean) {
    this.frozen = frozen;
    const act = decideCommit(
      this.bars,
      bars,
      frozen,
      this.pointer.isInteracting,
      this.pending,
    );
    chartTelemetry.log("commitDecide", {
      kind: act.kind,
      bars: bars.length,
      had: this.bars.length,
      frozen,
      pending: !!this.pending,
    });
    switch (act.kind) {
      case "noop":
        return;
      case "schedule":
        this.scheduleCommit();
        return;
      case "tail":
        this.applyTail(act.next);
        return;
      case "park": {
        this.pending = act.next;
        // Progressive reveal: a left-grow fill can take minutes to finish, so
        // once enough new bars have accumulated (and the pointer is idle) land
        // them instead of making the user wait for the whole history. The big
        // final pass then only fills the small remaining gap.
        if (act.reveal) {
          this.commit(act.next);
          return;
        }
        this.maybeRevealPending();
        return;
      }
      case "commit":
        this.commit(act.next);
        return;
    }
  }

  private commit(bars: Candle[]) {
    const t0 = performance.now();
    const view = this.chart.timeScale().getVisibleRange();
    const hadData = this.bars.length > 0;
    this.bars = bars;
    this.pending = null;
    this.indTail = bars.slice(-IND_TAIL_BARS);
    this.series.applyBars(bars);
    // Data arriving after the pane was created (layout switch, lazy fill) can
    // materialize the main series and its brand-new scales — re-assert the
    // mirror so a toggled-on inverted view never comes back un-flipped.
    this.theme.syncMirror();

    if (
      hadData &&
      view &&
      typeof view.from === "number" &&
      typeof view.to === "number"
    ) {
      // Same candles stay under the cursor: only bars the viewport cannot see were added.
      this.range.setVisibleTimeRange(view.from, view.to);
    } else {
      // New data loaded - default to showing latest bars at right edge
      const { from: fromTime, to: toTime } = initialLogicalRange(bars.length);
      this.range.setVisibleLogicalRange(fromTime, toTime);
    }

    // Volume, compares and indicator lines each cost another full-history
    // `setData`, so they follow on their own frames. The candles — the answer to
    // "where are my bars" — are already on screen. Extra series are reused
    // across commits (see renderer.jobs) so a progressive reveal only refreshes
    // their data instead of destroying + recreating every pane.
    this.queue.refill(
      [() => this.series.applyVol(this.bars), () => this.cmp.apply()],
      this.render.jobs(),
    );
    const ms = performance.now() - t0;
    commitPerf.record(ms);
    chartTelemetry.log("commit", { bars: bars.length }, ms);
    // P3-D4: DEV-only runtime invariant self-test — bars monotonic, tail
    // synced, columnar round-trip. A violation becomes a telemetry record
    // instead of a silent chart glitch. Production never runs it.
    if (import.meta.env.DEV) {
      const inv = runInvariants(bars, this.indTail);
      if (!inv.ok) {
        chartTelemetry.log("lifecycle", {
          invariant: "VIOLATION",
          monotonic: inv.monotonic,
          columns: inv.columns,
          tailSync: inv.tailSync,
          firstBadTime: inv.firstBadTime,
        });
      }
    }
  }

  private maybeRevealPending() {
    if (this.dead || !this.pending) return;
    if (!this.frozen) {
      this.scheduleCommit();
      return;
    }
    const view = this.chart.timeScale().getVisibleRange();
    const drawnFirst = this.bars[0]?.time;
    if (view && drawnFirst != null && (view.from as number) < drawnFirst)
      this.scheduleCommit();
  }

  /**
   * A 100k-bar `setData` is the one thing that can drop a frame, so it must never
   * run while the pointer owns the chart. The interaction timer retries the
   * moment the pointer lifts — the bars are already resident, only the paint waits.
   */
  private scheduleCommit() {
    if (this.pointer.isInteracting) return;
    const pending = this.pending;
    if (pending) this.commit(pending);
  }

  /**
   * Zero-latency release: once the pointer is up, stop hiding work behind the
   * 150 ms debounce — the very next animation frame resumes commits (and the
   * restJobs pump). A rAF here is still one frame of safety against a click
   * re-arming dragging before paint.
   */
  private releaseInteracting() {
    requestAnimationFrame(() => {
      if (this.dead || this.pointer.isDragging) return;
      // Re-forward the (deferred) viewport change so coverage checks and
      // linked-range sync catch up after the drag.
      const tr = this.chart.timeScale().getVisibleRange();
      if (tr && typeof tr.from === "number" && typeof tr.to === "number") {
        this.onRange?.(tr.from as number, tr.to as number);
        this.onViewport?.(tr.from as number, tr.to as number);
      }
      this.maybeRevealPending();
      this.queue.pump();
    });
  }

  /** Live tick: the series gets one `update` — never a re-render, never a stutter. */
  private applyTail(next: Candle[]): boolean {
    const t0 = performance.now();
    const cur = this.bars;
    const diff = diffTail(cur, next);
    if (!diff || diff.kind === "none") return false;
    this.bars = next;
    this.pushIndTail(diff.bar, diff.kind === "append");
    this.updateSeriesBar(diff.bar);
    const ms = performance.now() - t0;
    tailPerf.record(ms);
    chartTelemetry.log("tail", { barTime: diff.bar.time }, ms);
    return true;
  }

  /**
   * The per-tick indicator recompute runs on this slice, not on 100k bars. It
   * only ever grows between commits, so accumulation-based indicators (OBV,
   * VWAP) keep one origin and do not jump on every tick.
   */
  private pushIndTail(bar: Candle, appended: boolean) {
    if (!this.indTail.length) {
      this.indTail = [bar];
      return;
    }
    if (appended || bar.time > this.indTail[this.indTail.length - 1].time)
      this.indTail.push(bar);
    else this.indTail[this.indTail.length - 1] = bar;
    if (this.indTail.length > IND_TAIL_BARS + IND_TAIL_GROW) {
      this.indTail = trimTail(this.indTail, IND_TAIL_BARS);
      this.applyIndicators();
    }
  }

  private updateSeriesBar(bar: Candle) {
    if (!this.series.updateMainBar(bar, this.indTail)) return;
    this.series.updateVolBar(bar);
    this.render.applyTail(this.indTail);
  }

  /**
   * Lightweight in-place update of the live (still-open) bar — the hot path for
   * WS ticks. Unlike setFullData it never re-commits the 100k array; it only
   * replaces the resident last bar and repaints that single point.
   */
  updateLastBar(bar: Candle) {
    if (this.dead) return;
    const cur = this.bars;
    const last = cur[cur.length - 1];
    if (!last || bar.time < last.time) return; // stale
    cur[cur.length - 1] = bar;
    this.updateSeriesBar(bar);
  }

  setIndicators(list: IndicatorInst[]) {
    this.indicators = list;
    this.applyIndicators();
  }

  /** Adopt the session custom calculators; re-render CUSTOM indicators. */
  setCustomFns(fns: Record<string, CustomFn>) {
    this.customFns = fns;
    this.applyIndicators();
  }

  /** Queue the indicator redraw: drop old lines, then repaint one series per frame. */
  private applyIndicators() {
    this.queue.prepend(() => this.render.reset(), this.render.jobs());
  }

  setCompare(symbol: string, bars: Candle[], color?: string) {
    this.cmp.set(symbol, bars, color);
  }

  updateCompare(symbol: string, bar: Candle, all: Candle[]) {
    this.cmp.update(symbol, bar, all);
  }

  hasCompare(symbol: string) {
    return this.cmp.has(symbol);
  }

  compareKeys() {
    return this.cmp.keys();
  }

  removeCompare(symbol: string) {
    this.cmp.remove(symbol);
  }

  clearCompares() {
    this.cmp.clear();
  }

  setTheme(mode: ThemeMode) {
    const changed = this.theme.current !== mode;
    this.theme.setTheme(mode);
    if (changed) this.cmp.syncScale();
  }

  setVisibleTimeRange(from: number, to: number) {
    this.range.setVisibleTimeRange(from, to);
  }

  /**
   * Double-click zoom: scale the visible logical range by `factor` keeping the
   * logical anchor under the cursor (approx) stationary.
   */
  zoomAt(x: number, width: number, factor = 1.6) {
    this.range.zoomAt(x, width, factor);
  }

  setCrosshair(time: number | null, price: number | null) {
    if (time == null || price == null || !this.series.main) {
      this.chart.clearCrosshairPosition();
      return;
    }
    try {
      this.chart.setCrosshairPosition(price, time as Time, this.series.main);
    } catch {
      this.chart.clearCrosshairPosition();
    }
  }

  screenshot() {
    return takeScreenshot(this.chart);
  }

  /** Show every resident bar — backfilled history is released first, so "all" means all. */
  fit() {
    if (this.pending) this.commit(this.pending);
    if (!this.bars.length) return;
    this.range.fitContent();
  }

  priceToY(price: number) {
    return this.series.priceToY(price);
  }
  yToPrice(y: number) {
    return this.series.yToPrice(y);
  }
  timeToX(time: number) {
    return this.series.timeToX(time);
  }
  xToTime(x: number) {
    return this.series.xToTime(x);
  }

  /**
   * 倒垂（价格轴翻转）：高价落到底部、低价升到顶部，坐标轴读数仍是真实价格。
   * 用 lightweight-charts 原生的 `invertScale`，而不是伪造的 margin 抖动 ——
   * 后者只是把画面往上挪，K 线形状根本没翻。
   */
  setMirror(v: boolean) {
    this.theme.setMirror(v);
  }

  /** 是否把成交量面板也纳入倒垂翻转（独立于主标尺，随设置联动）。 */
  setMirrorVolume(v: boolean) {
    if (this.mirrorVolume === v) return;
    this.mirrorVolume = v;
    this.series.applyVol(this.bars);
    this.theme.syncMirror();
  }

  get isMirrored() {
    return this.theme.isMirrored;
  }

  destroy() {
    this.dead = true;
    this.pointer.cancel();
    this.pointer.unbind();
    this.queue.cancel();
    this.range.markDead();
    this.range.cancel();
    this.chart.remove();
  }
}
