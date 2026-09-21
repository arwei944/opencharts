import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineWidth,
  type Logical,
  type LogicalRange,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { intervalSec } from "./bars";
import { CompareManager } from "./compare";
import { fitRange, isValidRange, zoomRange } from "./viewport";
import {
  priceToY as coordPriceToY,
  takeScreenshot,
  timeToX as coordTimeToX,
  xToTime as coordXToTime,
  yToPrice as coordYToPrice,
} from "./export";
import {
  diffTail,
  growsLeft,
  initialLogicalRange,
  trimTail,
} from "./series-ops";
import { lastHeikinAshi, type CustomFn } from "./indicator-compute";
import { IndicatorRenderer } from "./indicator-render";
import {
  CHART_THEME,
  DOWN,
  IND_TAIL_BARS,
  IND_TAIL_GROW,
  UP,
} from "./constants";

/**
 * Length of a left-grow the prefill must accumulate before the resident
 * series is refreshed mid-fill, so a long history populates progressively
 * instead of hiding behind `frozen` until the final page.
 */
const REVEAL_CHUNK_BARS = 20_000;
import type { ThemeMode } from "./constants";
import { formatTime } from "./timefmt";
import { heikinAshi } from "./indicators";
import type { Candle, ChartType, IndicatorInst, Interval } from "./types";
import { DEFAULT_SETTINGS } from "./settings";

type AnySeries = ISeriesApi<
  "Candlestick" | "Bar" | "Line" | "Area" | "Histogram"
>;

export class ChartEngine {
  chart: IChartApi;
  private main: AnySeries | null = null;
  private vol: ISeriesApi<"Histogram"> | null = null;
  private cmp: CompareManager;
  private render: IndicatorRenderer;
  private type: ChartType = "candle";
  private invert = false;
  /** 倒垂视角：价格轴翻转。与 `invert`（红绿互换）是两件事，各开各的。 */
  private mirror = false;
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
  private showVol = true;
  private indicators: IndicatorInst[] = [];
  /** Runtime-only custom calculators keyed by indicator id (see store.customFns). */
  private customFns: Record<string, CustomFn> = {};
  private interval: Interval = "15m";
  private step = 60;
  private suppressRange = false;
  private rangeRaf = 0;
  /** True while the pointer owns the chart — the moment a repaint must not happen. */
  private interacting = false;
  private dragging = false;
  private panSensitivity = 1;
  private cursorHint: "default" | "crosshair" = "default";
  private dragStartX = 0;
  private dragStartRange: { from: number; to: number } | null = null;
  private interactTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly host: HTMLElement;
  private mode: ThemeMode = "dark";
  private dead = false;

  private readonly onPointerDown = (e: PointerEvent) => {
    // Ignore right-click / touch (touch pan is handled natively). Only the
    // left button drags.
    if (e.button !== 0) return;
    const lr = this.chart.timeScale().getVisibleLogicalRange();
    this.dragStartX = e.clientX;
    this.dragStartRange =
      lr && Number.isFinite(lr.from) && Number.isFinite(lr.to)
        ? { from: lr.from, to: lr.to }
        : null;
    this.dragging = this.dragStartRange !== null;
    this.host.style.cursor = "grabbing";
    try {
      this.host.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    this.markInteracting();
  };
  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.dragging || !this.dragStartRange) return;
    const lr = this.chart.timeScale().getVisibleLogicalRange();
    if (!lr || !Number.isFinite(lr.from) || !Number.isFinite(lr.to)) return;
    const span = lr.to - lr.from;
    const pxPerLogical = span / Math.max(1, this.host.clientWidth);
    // Sensitivity >1 means the chart follows the cursor faster than 1:1.
    const dx = (e.clientX - this.dragStartX) * this.panSensitivity;
    const deltaLogical = dx * pxPerLogical;
    this.chart.timeScale().setVisibleLogicalRange({
      from: this.dragStartRange.from - deltaLogical,
      to: this.dragStartRange.to - deltaLogical,
    });
    // keep lock-alive while the pointer moves (same as the timer's intent)
    clearTimeout(this.interactTimer);
    this.interactTimer = setTimeout(() => this.markInteracting(), 150);
  };
  private readonly onPointerUp = (e: PointerEvent) => {
    this.dragging = false;
    this.dragStartRange = null;
    this.host.style.cursor = this.cursorHint;
    try {
      this.host.releasePointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    clearTimeout(this.interactTimer);
    this.releaseInteracting();
  };
  private readonly onWheel = () => {
    this.markInteracting();
  };
  /** Mouse-drag pan sensitivity multiplier (1 = 1:1); >1 faster, <1 slower. */
  setPanSensitivity(v: number) {
    this.panSensitivity = Math.max(0.2, Math.min(5, v || 1));
  }

  /**
   * Cursor hint per active tool: default arrow when idle (drag shows the hand
   * automatically), crosshair while a drawing tool is active.
   */
  setCursor(cursor: "default" | "crosshair") {
    this.cursorHint = cursor;
    if (!this.dragging) this.host.style.cursor = cursor;
  }
  /** Full-history `setData` calls still owed after the candles: one per frame. */
  private restJobs: Array<() => void> = [];
  /** The not-yet-run tail of the last commit's cosmetic queue. An indicator
   * change mid-reveal must not swallow these, or the volume/compare panes stay
   * truncated at whatever the previous commit reached. */
  private owed: Array<() => void> = [];
  private restRaf = 0;

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
    this.mode = mode;
    this.settings = settings;
    this.host = host;
    const pal = CHART_THEME[mode];
    this.chart = createChart(host, {
      layout: {
        background: { type: ColorType.Solid, color: pal.bg },
        textColor: pal.text,
        fontFamily: settings.fontFamily ?? "IBM Plex Sans, sans-serif",
        fontSize: settings.fontSize ?? 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: pal.grid },
        horzLines: { color: pal.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: pal.text,
          width: settings.crosshairWidth as LineWidth,
          style: settings.crosshairLineStyle as any,
          labelBackgroundColor: settings.crosshairLabelBg,
        },
        horzLine: {
          color: pal.text,
          width: settings.crosshairWidth as LineWidth,
          style: settings.crosshairLineStyle as any,
          labelBackgroundColor: settings.crosshairLabelBg,
        },
      },
      // Mouse drag-pan is implemented here (custom sensitivity + grab/grabbing
      // cursor), so disable the library's baked-in 1:1 drag; everything else
      // (wheel, axis scale, pinch) stays native.
      handleScroll: {
        pressedMouseMove: false,
        mouseWheel: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
        mouseWheel: true,
        pinch: true,
      },
      rightPriceScale: {
        borderColor: pal.grid,
        scaleMargins: {
          top: settings.priceScaleMargins[0],
          bottom: settings.priceScaleMargins[1],
        },
      },
      leftPriceScale: {
        visible: false,
        borderColor: pal.grid,
        scaleMargins: {
          top: settings.priceScaleMargins[0],
          bottom: settings.priceScaleMargins[1],
        },
      },
      timeScale: {
        borderColor: pal.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: settings.timeRightOffset,
        barSpacing: settings.barSpacing,
      },
      autoSize: true,
    });
    this.cmp = new CompareManager(
      this.chart,
      () => this.mode,
      () => this.syncMirror(),
    );
    this.render = new IndicatorRenderer(this.chart, () => ({
      bars: this.bars,
      indicators: this.indicators,
      customFns: this.customFns,
    }));
    this.rebuildMain();
    this.host.style.cursor = "default";
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || this.dead) return;
      if (!this.rangeRaf) {
        this.rangeRaf = requestAnimationFrame(() => {
          this.rangeRaf = 0;
          // The minimap strip tracks every frame the viewport moves — including
          // mid-drag — but must not fight a range we are applying remotely.
          if (!this.suppressRange) {
            const tr = this.chart.timeScale().getVisibleRange();
            if (
              tr &&
              typeof tr.from === "number" &&
              typeof tr.to === "number"
            ) {
              this.onMinimap?.({
                from: tr.from as number,
                to: tr.to as number,
              });
            }
          }
          if (this.suppressRange) return;
          // While the pointer is dragging, forwarding every frame to React
          // (linked-range sync, coverage checks) is pure latency: the pan is
          // already canvas-side. Defer until the drag finishes.
          if (this.dragging) return;
          const tr = this.chart.timeScale().getVisibleRange();
          if (tr && typeof tr.from === "number" && typeof tr.to === "number") {
            this.onRange?.(tr.from as number, tr.to as number);
            this.onViewport?.(tr.from as number, tr.to as number);
          }
          this.maybeRevealPending();
        });
      }
    });
    this.chart.subscribeCrosshairMove((param) => {
      /* While the button owns the chart the library still draws the crosshair on
       * canvas, but forwarding it to React here would re-render the board the user
       * is dragging — a per-mousemove render is what makes a pan trail the cursor. */
      if (this.dragging) return;
      const time = typeof param.time === "number" ? param.time : null;
      let price: number | null = null;
      if (this.main && param.seriesData) {
        const raw = param.seriesData.get(this.main) as
          { close?: number; value?: number } | undefined;
        price = raw?.close ?? raw?.value ?? null;
      }
      if (price == null && param.point && this.main) {
        const p = this.main.coordinateToPrice(param.point.y);
        price = p == null ? null : Number(p);
      }
      this.onCrosshair?.(time, price);
    });
    host.addEventListener("pointerdown", this.onPointerDown, {
      capture: true,
      passive: false,
    });
    host.addEventListener("pointermove", this.onPointerMove, {
      capture: true,
      passive: true,
    });
    host.addEventListener("wheel", this.onWheel, {
      passive: true,
      capture: true,
    });
    window.addEventListener("pointerup", this.onPointerUp, { capture: true }); // ✅ Match with pointerdown
    window.addEventListener("pointercancel", this.onPointerUp, {
      capture: true,
    }); // ✅ Match with pointerdown
  }

  /** True from `pointerdown` until the button is lifted: the DOM must keep out of the way. */
  get isDragging() {
    return this.dragging;
  }

  setInterval(interval: Interval) {
    this.interval = interval;
    this.step = intervalSec(interval);
    this.chart.applyOptions({
      timeScale: { secondsVisible: interval === "1s" || interval === "1m" },
    });
  }

  private colors() {
    return this.invert ? { up: DOWN, down: UP } : { up: UP, down: DOWN };
  }

  /** priceFormat options for the main series, from the configured precision. */
  private priceFormatOpts(): Record<string, unknown> {
    const p = this.settings.pricePrecision;
    if (p == null || !Number.isFinite(p) || p < 0 || p > 8) return {};
    return {
      priceFormat: {
        type: "price",
        precision: p,
        minMove: 1 / Math.pow(10, p),
      },
    };
  }

  private rebuildMain() {
    if (this.main) this.chart.removeSeries(this.main);
    const { up, down } = this.colors();
    const fmt = this.priceFormatOpts();
    if (this.type === "bar") {
      this.main = this.chart.addSeries(BarSeries, {
        upColor: up,
        downColor: down,
        ...fmt,
      });
    } else if (this.type === "line") {
      this.main = this.chart.addSeries(LineSeries, {
        color: up,
        lineWidth: 2,
        ...fmt,
      });
    } else if (this.type === "area") {
      this.main = this.chart.addSeries(AreaSeries, {
        lineColor: up,
        topColor: `${up}55`,
        bottomColor: `${up}00`,
        lineWidth: 2,
        ...fmt,
      });
    } else {
      const hollow = this.type === "hollow";
      this.main = this.chart.addSeries(CandlestickSeries, {
        upColor: hollow ? "transparent" : up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
        ...fmt,
      });
    }
    this.applyBars();
    this.syncMirror();
  }

  /** Re-apply typography (font size/family) and price precision live. */
  applyTypography(s: typeof DEFAULT_SETTINGS) {
    this.settings = s;
    this.chart.applyOptions({
      layout: {
        fontSize: s.fontSize ?? 11,
        fontFamily: s.fontFamily ?? "IBM Plex Sans, sans-serif",
      },
    });
    if (this.main) {
      const opts = this.priceFormatOpts();
      if (Object.keys(opts).length) this.main.applyOptions(opts);
    }
    this.setTimezone(s.timezone ?? "local");
  }

  /**
   * Time-axis timezone (incl. DST through Intl). "local" keeps the browser
   * clock; any IANA zone renders axis/legend times in that zone.
   */
  private setTimezone(zone: string) {
    this.chart.applyOptions({
      localization: {
        timeFormatter: (t: UTCTimestamp) => formatTime(t, zone),
      },
    });
  }

  setType(t: ChartType) {
    if (this.type === t) return;
    const wasHollowSwap =
      (this.type === "candle" || this.type === "hollow") &&
      (t === "candle" || t === "hollow");
    this.type = t;
    if (wasHollowSwap && this.main) {
      // candle <-> hollow share the CandlestickSeries type; recolor in place
      // instead of destroying + re-setting 100k bars.
      const { up, down } = this.colors();
      const hollow = t === "hollow";
      this.main.applyOptions({
        upColor: hollow ? "transparent" : up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
      });
      return;
    }
    this.rebuildMain();
  }

  setInvert(v: boolean) {
    this.invert = v;
    this.rebuildMain();
    this.applyVol();
  }

  setLog(v: boolean) {
    this.chart.priceScale("right").applyOptions({ mode: v ? 1 : 0 });
  }

  setShowVol(v: boolean) {
    this.showVol = v;
    this.applyVol();
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
    if (bars === this.bars || bars === this.pending) {
      if (!frozen && this.pending) this.scheduleCommit();
      return;
    }
    if (this.applyTail(bars)) return;
    const drawn = this.bars;
    if (growsLeft(drawn, bars) && (frozen || this.interacting)) {
      this.pending = bars;
      // Progressive reveal: a left-grow fill can take minutes to finish, so
      // once enough new bars have accumulated (and the pointer is idle) land
      // them instead of making the user wait for the whole history. The big
      // final pass then only fills the small remaining gap.
      if (
        this.pending.length - drawn.length >= REVEAL_CHUNK_BARS &&
        !this.interacting
      ) {
        this.commit(bars);
        return;
      }
      this.maybeRevealPending();
      return;
    }
    this.commit(bars);
  }

  private commit(bars: Candle[]) {
    const view = this.chart.timeScale().getVisibleRange();
    const hadData = this.bars.length > 0;
    this.bars = bars;
    this.pending = null;
    this.indTail = bars.slice(-IND_TAIL_BARS);
    this.applyBars();
    // Data arriving after the pane was created (layout switch, lazy fill) can
    // materialize the main series and its brand-new scales — re-assert the
    // mirror so a toggled-on inverted view never comes back un-flipped.
    this.syncMirror();

    if (
      hadData &&
      view &&
      typeof view.from === "number" &&
      typeof view.to === "number"
    ) {
      // Same candles stay under the cursor: only bars the viewport cannot see were added.
      this.setVisibleTimeRange(view.from, view.to);
    } else {
      // New data loaded - default to showing latest bars at right edge
      this.suppressRange = true;

      // If there's no specific zoom preference, show recent ~150 bars
      const { from: fromTime, to: toTime } = initialLogicalRange(bars.length);

      this.chart.timeScale().setVisibleLogicalRange({
        from: fromTime as Logical,
        to: toTime as Logical,
      });

      requestAnimationFrame(() => {
        this.suppressRange = false;
      });
    }

    // Volume, compares and indicator lines each cost another full-history
    // `setData`, so they follow on their own frames. The candles — the answer to
    // "where are my bars" — are already on screen. Extra series are reused
    // across commits (see renderer.jobs) so a progressive reveal only refreshes
    // their data instead of destroying + recreating every pane.
    this.owed = [() => this.applyVol(), () => this.cmp.apply()];
    this.restJobs = [...this.owed, ...this.render.jobs()];
    this.pumpRest();
  }

  /** Run one queued `setData` per frame, so the reveal never becomes a freeze. */
  private pumpRest() {
    if (!this.restRaf) this.restRaf = requestAnimationFrame(this.runRest);
  }

  private runRest = () => {
    this.restRaf = 0;
    if (this.dead) return;
    if (!this.restJobs.length) return;
    if (this.interacting) {
      // The pointer took the chart back mid-reveal: even cosmetic `setData`
      // calls wait for it to lift. Cheap re-check, one frame apart.
      this.pumpRest();
      return;
    }
    const job = this.restJobs.shift();
    // Once it runs the debt is paid; keeping it would replay a `setData` the
    // next queue refill rebuilt on top of this one.
    this.owed = this.owed.filter((j) => j !== job);
    job?.();
    // 指标 job 会 addSeries 到新 pane，新 pane 带着默认（未翻转）标尺进场：
    // 每跑完一个就补一次，倒垂才不会在指标加载完的那一帧丢掉副图。
    this.syncMirror();
    if (this.restJobs.length) this.pumpRest();
  };

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
    if (this.interacting) return;
    const pending = this.pending;
    if (pending) this.commit(pending);
  }

  private markInteracting() {
    this.interacting = true;
    clearTimeout(this.interactTimer);
    this.interactTimer = setTimeout(() => {
      if (this.dragging) {
        // Still mid-drag: keep the pointer-priority window alive.
        this.markInteracting();
        return;
      }
      this.releaseInteracting();
    }, 150);
  }

  /**
   * Zero-latency release: once the pointer is up, stop hiding work behind the
   * 150 ms debounce — the very next animation frame resumes commits (and the
   * restJobs pump). A rAF here is still one frame of safety against a click
   * re-arming dragging before paint.
   */
  private releaseInteracting() {
    this.interacting = false;
    requestAnimationFrame(() => {
      if (this.dead || this.dragging) return;
      // Re-forward the (deferred) viewport change so coverage checks and
      // linked-range sync catch up after the drag.
      const tr = this.chart.timeScale().getVisibleRange();
      if (tr && typeof tr.from === "number" && typeof tr.to === "number") {
        this.onRange?.(tr.from as number, tr.to as number);
        this.onViewport?.(tr.from as number, tr.to as number);
      }
      this.maybeRevealPending();
      this.pumpRest();
    });
  }

  private visibleSpan(): number {
    const lr = this.chart.timeScale().getVisibleLogicalRange();
    return lr && Number.isFinite(lr.to - lr.from)
      ? Math.max(20, lr.to - lr.from)
      : 300;
  }

  /** Live tick: the series gets one `update` — never a re-render, never a stutter. */
  private applyTail(next: Candle[]): boolean {
    const cur = this.bars;
    const diff = diffTail(cur, next);
    if (!diff || diff.kind === "none") return false;
    this.bars = next;
    this.pushIndTail(diff.bar, diff.kind === "append");
    this.updateSeriesBar(diff.bar);
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
    if (!this.main) return;
    const src = this.type === "ha" ? lastHeikinAshi(this.indTail) : bar;
    if (!src) return;
    if (this.type === "line" || this.type === "area") {
      (this.main as ISeriesApi<"Line">).update({
        time: src.time as UTCTimestamp,
        value: src.close,
      });
    } else {
      (this.main as ISeriesApi<"Candlestick">).update({
        time: src.time as UTCTimestamp,
        open: src.open,
        high: src.high,
        low: src.low,
        close: src.close,
      });
    }
    const { up, down } = this.colors();
    this.vol?.update({
      time: bar.time as UTCTimestamp,
      value: bar.volume,
      color: bar.close >= bar.open ? `${up}99` : `${down}99`,
    });
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
    this.restJobs = [
      ...this.owed,
      () => this.render.reset(),
      ...this.render.jobs(),
    ];
    this.pumpRest();
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
    if (mode === this.mode) return;
    this.mode = mode;
    const pal = CHART_THEME[mode];
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: pal.bg },
        textColor: pal.text,
      },
      grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
      crosshair: {
        vertLine: { color: pal.text, labelBackgroundColor: pal.axisLabel },
        horzLine: { color: pal.text, labelBackgroundColor: pal.axisLabel },
      },
      rightPriceScale: { borderColor: pal.grid },
      leftPriceScale: { borderColor: pal.grid },
      timeScale: { borderColor: pal.grid },
    });
    this.cmp.syncScale();
  }

  setVisibleTimeRange(from: number, to: number) {
    if (!isValidRange(from, to)) return;
    this.suppressRange = true;
    try {
      this.chart
        .timeScale()
        .setVisibleRange({ from: from as Time, to: to as Time });
    } catch {
      /* range may not exist on this interval yet */
    }
    requestAnimationFrame(() => {
      this.suppressRange = false;
    });
  }

  /**
   * Double-click zoom: scale the visible logical range by `factor` keeping the
   * logical anchor under the cursor (approx) stationary.
   */
  zoomAt(x: number, width: number, factor = 1.6) {
    const ts = this.chart.timeScale();
    const lr = ts.getVisibleLogicalRange();
    if (!lr || width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    ts.setVisibleLogicalRange(zoomRange(lr.from, lr.to, factor, ratio));
  }

  setCrosshair(time: number | null, price: number | null) {
    if (time == null || price == null || !this.main) {
      this.chart.clearCrosshairPosition();
      return;
    }
    try {
      this.chart.setCrosshairPosition(price, time as Time, this.main);
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
    this.suppressRange = true;
    this.chart
      .timeScale()
      .setVisibleLogicalRange(fitRange(this.bars.length) as LogicalRange);
    requestAnimationFrame(() => {
      this.suppressRange = false;
    });
  }

  /**
   * Heikin-Ashi over the resident series, memoized: WS ticks mutate the tail
   * via updateSeriesBar (lastHeikinAshi over indTail), so a full O(n) recompute
   * is only owed when the series reference actually changes (commit/reveal).
   */
  private haSource(bars: Candle[]): Candle[] {
    if (this.type !== "ha") return bars;
    if (this.haCacheBars !== bars) {
      this.haCache = heikinAshi(bars);
      this.haCacheBars = bars;
    }
    return this.haCache;
  }

  private haCache: Candle[] = [];
  private haCacheBars: Candle[] | null = null;

  private applyBars() {
    if (!this.main) return;
    const src = this.haSource(this.bars);
    if (this.type === "line" || this.type === "area") {
      const line = src.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.close,
      }));
      (this.main as ISeriesApi<"Line">).setData(line);
      return;
    }
    const candles = src.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    (this.main as ISeriesApi<"Candlestick">).setData(candles);
  }

  private applyVol() {
    if (this.vol) {
      this.chart.removeSeries(this.vol);
      this.vol = null;
    }
    if (!this.showVol || this.bars.length === 0) return;
    const { up, down } = this.colors();
    this.vol = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    this.chart.priceScale("vol").applyOptions({
      scaleMargins: { top: this.settings.volumeHeight, bottom: 0 },
    });
    this.vol.setData(
      this.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? `${up}88` : `${down}88`,
      })),
    );
  }

  priceToY(price: number) {
    return coordPriceToY(this.main, price);
  }
  yToPrice(y: number) {
    return coordYToPrice(this.main, y);
  }
  timeToX(time: number) {
    return coordTimeToX(this.chart, time);
  }
  xToTime(x: number) {
    return coordXToTime(this.chart, x);
  }

  /**
   * 倒垂（价格轴翻转）：高价落到底部、低价升到顶部，坐标轴读数仍是真实价格。
   * 用 lightweight-charts 原生的 `invertScale`，而不是伪造的 margin 抖动 ——
   * 后者只是把画面往上挪，K 线形状根本没翻。
   */
  setMirror(v: boolean) {
    if (this.mirror === v) return;
    this.mirror = v;
    this.syncMirror();
  }

  /** 是否把成交量面板也纳入倒垂翻转（独立于主标尺，随设置联动）。 */
  setMirrorVolume(v: boolean) {
    if (this.mirrorVolume === v) return;
    this.mirrorVolume = v;
    this.applyVol();
    this.syncMirror();
  }

  get isMirrored() {
    return this.mirror;
  }

  /**
   * `invertScale` 属于「每个 pane 的每条标尺」，而 pane 和标尺都是随系列创建才出现的：
   * 指标线会新建副图 pane，对比线会新建 left 标尺。所以每次系列结构变化后都要重新
   * 下一道命令，否则「先开倒垂、后加载指标」会有一半画面偷偷正回来。
   *
   * 成交量走独立的 `vol` 标尺，故意为之不翻 —— 它始终贴在底部，与币安/TradingView 一致。
   */
  private syncMirror() {
    const panes = this.chart.panes();
    for (let i = 0; i < panes.length; i++) {
      for (const id of ["right", "left"] as const) {
        try {
          panes[i].priceScale(id).applyOptions({ invertScale: this.mirror });
        } catch {
          /* 这个 pane 没有该标尺（例如没有对比线时的 left） */
        }
      }
    }
    // 成交量独立 vol 标尺：默认不翻（贴底），mirrorVolume 打开时随倒垂一起翻。
    try {
      this.chart
        .priceScale("vol")
        .applyOptions({ invertScale: this.mirror && this.mirrorVolume });
    } catch {
      /* 成交量未创建时没有 vol 标尺 */
    }
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.interactTimer);
    if (this.restRaf) cancelAnimationFrame(this.restRaf);
    this.restRaf = 0;
    this.restJobs = [];
    // ✅ P0 Bug Fix: Use matching options when removing event listeners
    this.host.removeEventListener("pointerdown", this.onPointerDown, {
      capture: true,
    });
    this.host.removeEventListener("pointermove", this.onPointerMove, {
      capture: true,
    });
    this.host.removeEventListener("wheel", this.onWheel, { capture: true });
    window.removeEventListener("pointerup", this.onPointerUp, {
      capture: true,
    });
    window.removeEventListener("pointercancel", this.onPointerUp, {
      capture: true,
    });
    if (this.rangeRaf) cancelAnimationFrame(this.rangeRaf);
    this.rangeRaf = 0;
    this.chart.remove();
  }
}
