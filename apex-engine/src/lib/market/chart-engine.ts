import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  PriceScaleMode,
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
import {
  CHART_THEME,
  COMPARE_COLORS,
  DOWN,
  IND_TAIL_BARS,
  IND_TAIL_GROW,
  UP,
} from "./constants";
import type { ThemeMode } from "./constants";
import {
  atr,
  boll,
  cci,
  ema,
  heikinAshi,
  kdj,
  macd,
  obv,
  rsi,
  sar,
  sma,
  stoch,
  supertrend,
  vwap,
  wr,
} from "./indicators";
import type { Candle, ChartType, IndicatorInst, Interval } from "./types";
import { DEFAULT_SETTINGS } from "./settings";

type AnySeries = ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area" | "Histogram">;

type Extra = {
  key: string;
  series: AnySeries;
};

function lastOf<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

export class ChartEngine {
  chart: IChartApi;
  private main: AnySeries | null = null;
  private vol: ISeriesApi<"Histogram"> | null = null;
  private extras: Extra[] = [];
  private compares = new Map<string, ISeriesApi<"Line">>();
  private compareData = new Map<string, { bars: Candle[]; color: string }>();
  private type: ChartType = "candle";
  private invert = false;
  /** 倒垂视角：价格轴翻转。与 `invert`（红绿互换）是两件事，各开各的。 */
  private mirror = false;
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
  private interval: Interval = "15m";
  private step = 60;
  private suppressRange = false;
  private rangeRaf = 0;
  /** True while the pointer owns the chart — the moment a repaint must not happen. */
  private interacting = false;
  private dragging = false;
  private interactTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly host: HTMLElement;
  private mode: ThemeMode = "dark";
  private dead = false;

  private readonly onPointerDown = () => {
    this.dragging = true;
    this.markInteracting();
  };
  private readonly onPointerUp = () => {
    this.dragging = false;
    this.markInteracting();
  };
  private readonly onWheel = () => {
    this.markInteracting();
  };
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
  /** Settings from Zustand store, applied once at construction then never again (for performance). */
  private readonly settings: typeof DEFAULT_SETTINGS;

  constructor(host: HTMLElement, mode: ThemeMode = "dark", settings: typeof DEFAULT_SETTINGS = DEFAULT_SETTINGS) {
    this.mode = mode;
    this.settings = settings;
    this.host = host;
    const pal = CHART_THEME[mode];
    this.chart = createChart(host, {
      layout: {
        background: { type: ColorType.Solid, color: pal.bg },
        textColor: pal.text,
        fontFamily: "IBM Plex Sans, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: pal.grid },
        horzLines: { color: pal.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: pal.text, width: settings.crosshairWidth as LineWidth, style: settings.crosshairLineStyle as any, labelBackgroundColor: settings.crosshairLabelBg },
        horzLine: { color: pal.text, width: settings.crosshairWidth as LineWidth, style: settings.crosshairLineStyle as any, labelBackgroundColor: settings.crosshairLabelBg },
      },
      rightPriceScale: { borderColor: pal.grid, scaleMargins: { top: settings.priceScaleMargins[0], bottom: settings.priceScaleMargins[1] } },
      leftPriceScale: { visible: false, borderColor: pal.grid, scaleMargins: { top: settings.priceScaleMargins[0], bottom: settings.priceScaleMargins[1] } },
      timeScale: { borderColor: pal.grid, timeVisible: true, secondsVisible: false, rightOffset: settings.timeRightOffset, barSpacing: settings.barSpacing },
      autoSize: true,
    });
    this.rebuildMain();
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || this.dead) return;
      if (!this.rangeRaf) {
        this.rangeRaf = requestAnimationFrame(() => {
          this.rangeRaf = 0;
          if (this.suppressRange) return;
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
        const raw = param.seriesData.get(this.main) as { close?: number; value?: number } | undefined;
        price = raw?.close ?? raw?.value ?? null;
      }
      if (price == null && param.point && this.main) {
        const p = this.main.coordinateToPrice(param.point.y);
        price = p == null ? null : Number(p);
      }
      this.onCrosshair?.(time, price);
    });
    host.addEventListener("pointerdown", this.onPointerDown, { capture: true, passive: false });
    host.addEventListener("wheel", this.onWheel, { passive: true, capture: true });
    window.addEventListener("pointerup", this.onPointerUp, { capture: true }); // ✅ Match with pointerdown
    window.addEventListener("pointercancel", this.onPointerUp, { capture: true }); // ✅ Match with pointerdown
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

  private rebuildMain() {
    if (this.main) this.chart.removeSeries(this.main);
    const { up, down } = this.colors();
    if (this.type === "bar") {
      this.main = this.chart.addSeries(BarSeries, { upColor: up, downColor: down });
    } else if (this.type === "line") {
      this.main = this.chart.addSeries(LineSeries, { color: up, lineWidth: 2 });
    } else if (this.type === "area") {
      this.main = this.chart.addSeries(AreaSeries, {
        lineColor: up,
        topColor: `${up}55`,
        bottomColor: `${up}00`,
        lineWidth: 2,
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
      });
    }
    this.applyBars();
    this.syncMirror();
  }

  setType(t: ChartType) {
    if (this.type === t) return;
    this.type = t;
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
    const growsLeft = drawn.length > 0 && bars.length > 0 && bars[0].time < drawn[0].time;
    if (growsLeft && (frozen || this.interacting)) {
      this.pending = bars;
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
    
    if (hadData && view && typeof view.from === "number" && typeof view.to === "number") {
      // Same candles stay under the cursor: only bars the viewport cannot see were added.
      this.setVisibleTimeRange(view.from, view.to);
    } else {
      // New data loaded - default to showing latest bars at right edge
      this.suppressRange = true;
      
      // If there's no specific zoom preference, show recent ~150 bars
      const showRecentBars = Math.min(150, bars.length);
      const fromTime = Math.max(0, bars.length - showRecentBars);
      const toTime = bars.length + 5;
      
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
    // "where are my bars" — are already on screen.
    this.owed = [() => this.applyVol(), () => this.applyCompares(), () => this.dropExtras()];
    this.restJobs = [...this.owed, ...this.indicatorJobs()];
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
    if (view && drawnFirst != null && (view.from as number) < drawnFirst) this.scheduleCommit();
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
        this.markInteracting();
        return;
      }
      this.interacting = false;
      // Long enough that a click-drag-release cannot sandwich a 100k `setData`
      // between its down and up, short enough that the bars land before the
      // user starts the next pan.
      this.maybeRevealPending();
    }, 150);
  }

  private visibleSpan(): number {
    const lr = this.chart.timeScale().getVisibleLogicalRange();
    return lr && Number.isFinite(lr.to - lr.from) ? Math.max(20, lr.to - lr.from) : 300;
  }

  /** Live tick: the series gets one `update` — never a re-render, never a stutter. */
  private applyTail(next: Candle[]): boolean {
    const cur = this.bars;
    if (!cur.length || !next.length) return false;
    const appended = next.length === cur.length + 1;
    if (!appended && next.length !== cur.length) return false;
    if (cur[0].time !== next[0].time) return false;
    const bar = next[next.length - 1];
    if (appended && bar.time <= cur[cur.length - 1].time) return false;
    this.bars = next;
    this.pushIndTail(bar, appended);
    this.updateSeriesBar(bar);
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
    if (appended || bar.time > this.indTail[this.indTail.length - 1].time) this.indTail.push(bar);
    else this.indTail[this.indTail.length - 1] = bar;
    if (this.indTail.length > IND_TAIL_BARS + IND_TAIL_GROW) {
      this.indTail = this.indTail.slice(-IND_TAIL_BARS);
      this.applyIndicators();
    }
  }

  private updateSeriesBar(bar: Candle) {
    if (!this.main) return;
    const src = this.type === "ha" ? lastOf(heikinAshi(this.indTail)) : bar;
    if (!src) return;
    if (this.type === "line" || this.type === "area") {
      (this.main as ISeriesApi<"Line">).update({ time: src.time as UTCTimestamp, value: src.close });
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
    this.applyIndicatorTail();
  }

  setIndicators(list: IndicatorInst[]) {
    this.indicators = list;
    this.applyIndicators();
  }

  setCompare(symbol: string, bars: Candle[], color?: string) {
    if (!bars.length) {
      this.removeCompare(symbol);
      return;
    }
    const col =
      color ?? this.compareData.get(symbol)?.color ?? COMPARE_COLORS[this.compareData.size % COMPARE_COLORS.length];
    this.compareData.set(symbol, { bars, color: col });
    if (!this.compares.has(symbol)) {
      const series = this.chart.addSeries(LineSeries, {
        color: col,
        lineWidth: 1,
        priceScaleId: "left",
        lastValueVisible: true,
        priceLineVisible: false,
        title: symbol.replace("USDT", ""),
      });
      this.compares.set(symbol, series);
    }
    this.applyCompares();
    this.syncLeftScale();
  }

  /**
   * Compare lines carry absolute closes and the left scale runs in percentage
   * mode, so the library re-anchors the ratio to the visible range itself. That
   * keeps the lines aligned while panning without ever re-feeding their data.
   */
  private applyCompares() {
    for (const [symbol, series] of [...this.compares]) {
      const holder = this.compareData.get(symbol);
      if (!holder) {
        series.setData([]);
        continue;
      }
      series.setData(holder.bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })));
    }
  }

  updateCompare(symbol: string, bar: Candle, all: Candle[]) {
    const series = this.compares.get(symbol);
    const holder = this.compareData.get(symbol);
    if (!series || !holder || !all.length) return;
    const drawnLast = holder.bars[holder.bars.length - 1];
    holder.bars = all;
    // Backfill only lengthens the left side; the line is redrawn with the main
    // series when that history is committed, so a pan never waits on it.
    if (drawnLast && all[all.length - 1].time === drawnLast.time) {
      series.update({ time: bar.time as UTCTimestamp, value: bar.close });
    }
  }

  hasCompare(symbol: string) {
    return this.compares.has(symbol);
  }

  compareKeys() {
    return [...this.compares.keys()];
  }

  removeCompare(symbol: string) {
    const series = this.compares.get(symbol);
    if (series) this.chart.removeSeries(series);
    this.compares.delete(symbol);
    this.compareData.delete(symbol);
    this.syncLeftScale();
  }

  clearCompares() {
    for (const s of this.compares.values()) this.chart.removeSeries(s);
    this.compares.clear();
    this.compareData.clear();
    this.syncLeftScale();
  }

  private syncLeftScale() {
    this.chart.applyOptions({
      leftPriceScale: {
        visible: this.compares.size > 0,
        borderColor: CHART_THEME[this.mode].grid,
        mode: PriceScaleMode.Percentage,
      },
    });
    // 对比线的 left 标尺是此刻才存在的，倒垂要马上补上它。
    this.syncMirror();
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
    this.syncLeftScale();
  }

  setVisibleTimeRange(from: number, to: number) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
    this.suppressRange = true;
    try {
      this.chart.timeScale().setVisibleRange({ from: from as Time, to: to as Time });
    } catch {
      /* range may not exist on this interval yet */
    }
    requestAnimationFrame(() => {
      this.suppressRange = false;
    });
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
    return this.chart.takeScreenshot();
  }

  /** Show every resident bar — backfilled history is released first, so "all" means all. */
  fit() {
    if (this.pending) this.commit(this.pending);
    if (!this.bars.length) return;
    this.suppressRange = true;
    this.chart.timeScale().setVisibleLogicalRange({ from: -4, to: this.bars.length + 4 } as LogicalRange);
    requestAnimationFrame(() => {
      this.suppressRange = false;
    });
  }

  private source(): Candle[] {
    return this.type === "ha" ? heikinAshi(this.bars) : this.bars;
  }

  private applyBars() {
    if (!this.main) return;
    const src = this.source();
    if (this.type === "line" || this.type === "area") {
      const line = src.map((b) => ({ time: b.time as UTCTimestamp, value: b.close }));
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
    this.chart.priceScale("vol").applyOptions({ scaleMargins: { top: this.settings.volumeHeight, bottom: 0 } });
    this.vol.setData(
      this.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? `${up}88` : `${down}88`,
      })),
    );
  }

  private addExtra(key: string, series: AnySeries) {
    this.extras.push({ key, series });
    return series;
  }

  private line(key: string, color: string, pane?: number) {
    const s = this.chart.addSeries(
      LineSeries,
      { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
      pane,
    );
    return this.addExtra(key, s);
  }

  private extra(key: string) {
    return this.extras.find((e) => e.key === key);
  }

  /**
   * One closure per indicator line, each of which does a full-history `setData`.
   * They are handed to `queueRest` so a 100k-bar reveal paints one series per
   * frame instead of blocking the main thread for a second and a half.
   */
  private indicatorJobs(): Array<() => void> {
    const bars = this.bars;
    const jobs: Array<() => void> = [];
    if (!bars.length) return jobs;
    let sub = 1;
    for (const ind of this.indicators) {
      if (!ind.visible || ind.kind === "VOL") continue;
      const line = (key: string, color: string, pane: number | undefined, data: { time: number; value: number }[]) =>
        jobs.push(() =>
          this.line(key, color, pane).setData(data.map((x) => ({ time: x.time as UTCTimestamp, value: x.value }))),
        );
      if (ind.kind === "MA") {
        const colors = ["#f0b90b", "#b7bdc6", "#00d4ff"];
        ind.params.forEach((p, i) => {
          if (!p) return;
          line(`${ind.id}-ma-${p}`, colors[i % 3], undefined, sma(bars, p));
        });
      } else if (ind.kind === "EMA") {
        const colors = ["#f0b90b", "#00d4ff"];
        ind.params.forEach((p, i) => {
          line(`${ind.id}-ema-${p}`, colors[i % 2], undefined, ema(bars, p));
        });
      } else if (ind.kind === "BOLL") {
        const { mid, upper, lower } = boll(bars, ind.params[0] ?? 20, ind.params[1] ?? 2);
        line(`${ind.id}-mid`, "#f0b90b", undefined, mid);
        line(`${ind.id}-up`, "#848e9c", undefined, upper);
        line(`${ind.id}-dn`, "#848e9c", undefined, lower);
      } else if (ind.kind === "SAR") {
        line(`${ind.id}-sar`, "#f6465d", undefined, sar(bars, ind.params[0] ?? 0.02, ind.params[1] ?? 0.2));
      } else if (ind.kind === "VWAP") {
        line(`${ind.id}-vwap`, "#fcd535", undefined, vwap(bars));
      } else if (ind.kind === "SUPER") {
        const { up, dn } = supertrend(bars, ind.params[0] ?? 10, ind.params[1] ?? 3);
        line(`${ind.id}-su`, UP, undefined, up);
        line(`${ind.id}-sd`, DOWN, undefined, dn);
      } else if (ind.kind === "MACD") {
        const pane = sub++;
        const { dif, dea, hist } = macd(bars, ind.params[0] ?? 12, ind.params[1] ?? 26, ind.params[2] ?? 9);
        jobs.push(() => {
          const h = this.chart.addSeries(HistogramSeries, { priceLineVisible: false }, pane);
          this.addExtra(`${ind.id}-hist`, h);
          h.setData(hist.map((x) => ({ time: x.time as UTCTimestamp, value: x.value, color: x.color })));
        });
        line(`${ind.id}-dif`, "#f0b90b", pane, dif);
        line(`${ind.id}-dea`, "#00d4ff", pane, dea);
      } else if (ind.kind === "RSI") {
        line(`${ind.id}-rsi`, "#f0b90b", sub++, rsi(bars, ind.params[0] ?? 14));
      } else if (ind.kind === "KDJ") {
        const pane = sub++;
        const { k, d, j } = kdj(bars, ind.params[0] ?? 9, ind.params[1] ?? 3, ind.params[2] ?? 3);
        line(`${ind.id}-k`, "#f0b90b", pane, k);
        line(`${ind.id}-d`, "#00d4ff", pane, d);
        line(`${ind.id}-j`, "#f6465d", pane, j);
      } else if (ind.kind === "STOCH") {
        const pane = sub++;
        const { k, d } = stoch(bars, ind.params[0] ?? 14, ind.params[1] ?? 3);
        line(`${ind.id}-sk`, "#f0b90b", pane, k);
        line(`${ind.id}-sd`, "#00d4ff", pane, d);
      } else if (ind.kind === "WR") {
        line(`${ind.id}-wr`, "#00d4ff", sub++, wr(bars, ind.params[0] ?? 14));
      } else if (ind.kind === "CCI") {
        line(`${ind.id}-cci`, "#f0b90b", sub++, cci(bars, ind.params[0] ?? 14));
      } else if (ind.kind === "OBV") {
        line(`${ind.id}-obv`, "#b7bdc6", sub++, obv(bars));
      } else if (ind.kind === "ATR") {
        line(`${ind.id}-atr`, "#f0b90b", sub++, atr(bars, ind.params[0] ?? 14));
      }
    }
    return jobs;
  }

  private applyIndicators() {
    this.restJobs = [...this.owed, () => this.dropExtras(), ...this.indicatorJobs()];
    this.pumpRest();
  }

  private dropExtras() {
    for (const e of this.extras) this.chart.removeSeries(e.series);
    this.extras = [];
  }

  private applyIndicatorTail() {
    const bars = this.indTail;
    if (!bars.length || !this.extras.length) return;
    const push = (key: string, point?: { time: number; value: number; color?: string }) => {
      if (!point) return;
      const e = this.extra(key);
      if (!e) return;
      e.series.update({ time: point.time as UTCTimestamp, value: point.value, color: point.color });
    };
    for (const ind of this.indicators) {
      if (!ind.visible || ind.kind === "VOL") continue;
      if (ind.kind === "MA") {
        ind.params.forEach((p) => p && push(`${ind.id}-ma-${p}`, lastOf(sma(bars, p))));
      } else if (ind.kind === "EMA") {
        ind.params.forEach((p) => push(`${ind.id}-ema-${p}`, lastOf(ema(bars, p))));
      } else if (ind.kind === "BOLL") {
        const { mid, upper, lower } = boll(bars, ind.params[0] ?? 20, ind.params[1] ?? 2);
        push(`${ind.id}-mid`, lastOf(mid));
        push(`${ind.id}-up`, lastOf(upper));
        push(`${ind.id}-dn`, lastOf(lower));
      } else if (ind.kind === "SAR") {
        push(`${ind.id}-sar`, lastOf(sar(bars, ind.params[0] ?? 0.02, ind.params[1] ?? 0.2)));
      } else if (ind.kind === "VWAP") {
        push(`${ind.id}-vwap`, lastOf(vwap(bars)));
      } else if (ind.kind === "SUPER") {
        const { up, dn } = supertrend(bars, ind.params[0] ?? 10, ind.params[1] ?? 3);
        push(`${ind.id}-su`, lastOf(up));
        push(`${ind.id}-sd`, lastOf(dn));
      } else if (ind.kind === "MACD") {
        const { dif, dea, hist } = macd(bars, ind.params[0] ?? 12, ind.params[1] ?? 26, ind.params[2] ?? 9);
        push(`${ind.id}-hist`, lastOf(hist));
        push(`${ind.id}-dif`, lastOf(dif));
        push(`${ind.id}-dea`, lastOf(dea));
      } else if (ind.kind === "RSI") {
        push(`${ind.id}-rsi`, lastOf(rsi(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "KDJ") {
        const { k, d, j } = kdj(bars, ind.params[0] ?? 9, ind.params[1] ?? 3, ind.params[2] ?? 3);
        push(`${ind.id}-k`, lastOf(k));
        push(`${ind.id}-d`, lastOf(d));
        push(`${ind.id}-j`, lastOf(j));
      } else if (ind.kind === "STOCH") {
        const { k, d } = stoch(bars, ind.params[0] ?? 14, ind.params[1] ?? 3);
        push(`${ind.id}-sk`, lastOf(k));
        push(`${ind.id}-sd`, lastOf(d));
      } else if (ind.kind === "WR") {
        push(`${ind.id}-wr`, lastOf(wr(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "CCI") {
        push(`${ind.id}-cci`, lastOf(cci(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "OBV") {
        push(`${ind.id}-obv`, lastOf(obv(bars)));
      } else if (ind.kind === "ATR") {
        push(`${ind.id}-atr`, lastOf(atr(bars, ind.params[0] ?? 14)));
      }
    }
  }

  priceToY(price: number) {
    return this.main?.priceToCoordinate(price) ?? null;
  }
  yToPrice(y: number) {
    return this.main?.coordinateToPrice(y) ?? null;
  }
  timeToX(time: number) {
    return this.chart.timeScale().timeToCoordinate(time as UTCTimestamp);
  }
  xToTime(x: number) {
    return this.chart.timeScale().coordinateToTime(x) as number | null;
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
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.interactTimer);
    if (this.restRaf) cancelAnimationFrame(this.restRaf);
    this.restRaf = 0;
    this.restJobs = [];
    // ✅ P0 Bug Fix: Use matching options when removing event listeners
    this.host.removeEventListener("pointerdown", this.onPointerDown, { capture: true, passive: false });
    this.host.removeEventListener("wheel", this.onWheel, { passive: true, capture: true });
    window.removeEventListener("pointerup", this.onPointerUp, { capture: true });
    window.removeEventListener("pointercancel", this.onPointerUp, { capture: true });
    if (this.rangeRaf) cancelAnimationFrame(this.rangeRaf);
    this.rangeRaf = 0;
    this.chart.remove();
  }
}
