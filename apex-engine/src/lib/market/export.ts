import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

type AnySeries = ISeriesApi<
  "Candlestick" | "Bar" | "Line" | "Area" | "Histogram"
>;

/** PNG snapshot of the live chart (including drawn overlays). */
export function takeScreenshot(chart: IChartApi): HTMLCanvasElement {
  return chart.takeScreenshot();
}

/** Price (y) coordinate on the main series' price scale, or null when unready. */
export function priceToY(main: AnySeries | null, price: number): number | null {
  return main?.priceToCoordinate(price) ?? null;
}

/** Price at a y coordinate on the main series' price scale. */
export function yToPrice(main: AnySeries | null, y: number): number | null {
  return main?.coordinateToPrice(y) ?? null;
}

/** Time (x) coordinate for a bar open time. */
export function timeToX(chart: IChartApi, time: number): number | null {
  return chart.timeScale().timeToCoordinate(time as UTCTimestamp);
}

/** Bar open time at an x coordinate (null when off-scale). */
export function xToTime(chart: IChartApi, x: number): number | null {
  return chart.timeScale().coordinateToTime(x) as number | null;
}
