import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { lastHeikinAshi } from "../indicator-compute.ts";
import { heikinAshi } from "../indicators.ts";
import { DOWN, UP } from "../constants.ts";
import {
  priceToY as coordPriceToY,
  timeToX as coordTimeToX,
  xToTime as coordXToTime,
  yToPrice as coordYToPrice,
} from "../export.ts";
import type { Candle, ChartType } from "../types.ts";
import type { DEFAULT_SETTINGS } from "../settings.ts";

type AnySeries = ISeriesApi<
  "Candlestick" | "Bar" | "Line" | "Area" | "Histogram"
>;

export type { AnySeries };

/**
 * Main/volume series lifecycle: creation per chart type, in-place recoloring
 * for the candle<->hollow swap, the volume histogram, and per-tick updates.
 * Extracted from ChartEngine (P0-A1) so the engine stays the single owner of
 * bar commits while this class is the single owner of series appearance.
 *
 * The chart-level options (theme/grid/typography) stay in the engine; this
 * class only shapes the series themselves.
 */
export class SeriesManager {
  main: AnySeries | null = null;
  vol: ISeriesApi<"Histogram"> | null = null;
  private type: ChartType = "candle";
  private invert = false;
  private showVol = true;
  /** Heikin-Ashi source memoized over the resident array (see haSource). */
  private haCache: Candle[] = [];
  private haCacheBars: Candle[] | null = null;

  constructor(
    private chart: IChartApi,
    private getSettings: () => typeof DEFAULT_SETTINGS,
  ) {}

  get chartType(): ChartType {
    return this.type;
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
  }

  setShowVol(v: boolean) {
    this.showVol = v;
  }

  /**
   * Re-apply price-format options to the live main series (called from the
   * engine's applyTypography — price precision edits apply immediately).
   */
  applyPriceFormat() {
    if (!this.main) return;
    const opts = this.priceFormatOpts();
    if (Object.keys(opts).length) this.main.applyOptions(opts);
  }

  /** Recreate the main series for the current type (destroys the old one). */
  rebuildMain() {
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
  }

  /** Apply the resident array to the main series (full setData). */
  applyBars(bars: Candle[]) {
    if (!this.main) return;
    const src = this.haSource(bars);
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

  /** Rebuild the volume histogram for the resident array. */
  applyVol(bars: Candle[]) {
    if (this.vol) {
      this.chart.removeSeries(this.vol);
      this.vol = null;
    }
    if (!this.showVol || bars.length === 0) return;
    const { up, down } = this.colors();
    this.vol = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    this.chart.priceScale("vol").applyOptions({
      scaleMargins: { top: this.getSettings().volumeHeight, bottom: 0 },
    });
    this.vol.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? `${up}88` : `${down}88`,
      })),
    );
  }

  /**
   * Per-tick update of the still-open bar (the hot path for WS ticks). Returns
   * false when there is no main series or no computable source value — the
   * caller then skips the volume/render pass, same as the pre-split engine.
   */
  updateMainBar(bar: Candle, haTail: Candle[]): boolean {
    if (!this.main) return false;
    const src = this.type === "ha" ? lastHeikinAshi(haTail) : bar;
    if (!src) return false;
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
    return true;
  }

  /** Per-tick volume bar update (no-op when the volume pane is hidden). */
  updateVolBar(bar: Candle) {
    if (!this.vol) return;
    const { up, down } = this.colors();
    this.vol.update({
      time: bar.time as UTCTimestamp,
      value: bar.volume,
      color: bar.close >= bar.open ? `${up}99` : `${down}99`,
    });
  }

  private colors() {
    return this.invert ? { up: DOWN, down: UP } : { up: UP, down: DOWN };
  }

  /** priceFormat options for the main series, from the configured precision. */
  private priceFormatOpts(): Record<string, unknown> {
    const p = this.getSettings().pricePrecision;
    if (p == null || !Number.isFinite(p) || p < 0 || p > 8) return {};
    return {
      priceFormat: {
        type: "price",
        precision: p,
        minMove: 1 / Math.pow(10, p),
      },
    };
  }

  /**
   * Heikin-Ashi over the resident series, memoized: WS ticks mutate the tail
   * via updateMainBar (lastHeikinAshi over the tail slice), so a full O(n)
   * recompute is only owed when the series reference actually changes.
   */
  private haSource(bars: Candle[]): Candle[] {
    if (this.type !== "ha") return bars;
    if (this.haCacheBars !== bars) {
      this.haCache = heikinAshi(bars);
      this.haCacheBars = bars;
    }
    return this.haCache;
  }

  // ---- Coordinate mapping (pure-function layer in export.ts) ----

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
}
