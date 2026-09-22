import {
  LineSeries,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { CHART_THEME, COMPARE_COLORS, type ThemeMode } from "./constants.ts";
import type { Candle } from "./types.ts";

/**
 * Compare-series lifecycle (symbol comparison lines on the left scale),
 * extracted from ChartEngine so the engine file stays reviewable. Holds all
 * compare state; the engine only forwards public calls and hands back the
 * mirror callback (compare lines appear on a left scale that the mirror pass
 * must flip too).
 */
export class CompareManager {
  private compares = new Map<string, ISeriesApi<"Line">>();
  private data = new Map<string, { bars: Candle[]; color: string }>();

  constructor(
    private chart: IChartApi,
    private modeOf: () => ThemeMode,
    private onSyncMirror: () => void,
  ) {}

  set(symbol: string, bars: Candle[], color?: string): void {
    if (!bars.length) {
      this.remove(symbol);
      return;
    }
    const col =
      color ??
      this.data.get(symbol)?.color ??
      COMPARE_COLORS[this.data.size % COMPARE_COLORS.length];
    this.data.set(symbol, { bars, color: col });
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
    this.apply();
    this.syncScale();
  }

  /**
   * Compare lines carry absolute closes and the left scale runs in percentage
   * mode, so the library re-anchors the ratio to the visible range itself. That
   * keeps the lines aligned while panning without ever re-feeding their data.
   */
  apply(): void {
    for (const [symbol, series] of [...this.compares]) {
      const holder = this.data.get(symbol);
      if (!holder) {
        series.setData([]);
        continue;
      }
      series.setData(
        holder.bars.map((b) => ({
          time: b.time as UTCTimestamp,
          value: b.close,
        })),
      );
    }
  }

  update(symbol: string, bar: Candle, all: Candle[]): void {
    const series = this.compares.get(symbol);
    const holder = this.data.get(symbol);
    if (!series || !holder || !all.length) return;
    const drawnLast = holder.bars[holder.bars.length - 1];
    holder.bars = all;
    // Backfill only lengthens the left side; the line is redrawn with the main
    // series when that history is committed, so a pan never waits on it.
    if (drawnLast && all[all.length - 1].time === drawnLast.time) {
      series.update({ time: bar.time as UTCTimestamp, value: bar.close });
    }
  }

  has(symbol: string): boolean {
    return this.compares.has(symbol);
  }

  keys(): string[] {
    return [...this.compares.keys()];
  }

  remove(symbol: string): void {
    const series = this.compares.get(symbol);
    if (series) this.chart.removeSeries(series);
    this.compares.delete(symbol);
    this.data.delete(symbol);
    this.syncScale();
  }

  clear(): void {
    for (const s of this.compares.values()) this.chart.removeSeries(s);
    this.compares.clear();
    this.data.clear();
    this.syncScale();
  }

  /** Re-apply the left-scale state (border/visibility/percentage + mirror).
   *  Called after theme changes too, so the scale border follows the palette. */
  syncScale(): void {
    this.chart.applyOptions({
      leftPriceScale: {
        visible: this.compares.size > 0,
        borderColor: CHART_THEME[this.modeOf()].grid,
        mode: PriceScaleMode.Percentage,
      },
    });
    // 对比线的 left 标尺是此刻才存在的，倒垂要马上补上它。
    this.onSyncMirror();
  }
}
