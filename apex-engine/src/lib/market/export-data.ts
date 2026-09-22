import type { Candle } from "./types.ts";

/**
 * Pure export helpers: time-range filtering + CSV/JSON serialization for the
 * OHLCV series. Tested headless; the UI wrapper (ExportModal) only downloads.
 */

export interface ExportRange {
  from?: number; // seconds
  to?: number; // seconds
}

export function filterByRange(bars: Candle[], range: ExportRange): Candle[] {
  if (!bars.length) return bars;
  const first = bars[0].time;
  const last = bars[bars.length - 1].time;
  const now = Date.now() / 1000;
  let from = range.from ?? first;
  let to = range.to ?? last;
  // "recent" presets are expressed as negative offsets from now.
  if (range.from != null && range.from < 0) from = now + range.from;
  if (range.to != null && range.to < 0) to = now + range.to;
  from = Math.max(from, 0);
  to = Math.max(to, 0);
  if (from > to) [from, to] = [to, from];
  const out = bars.filter((b) => b.time >= from && b.time <= to);
  return out.length ? out : [];
}

export function toCsv(bars: Candle[]): string {
  const rows = [
    "time,open,high,low,close,volume",
    ...bars.map((b) =>
      [
        new Date(b.time * 1000).toISOString(),
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume,
      ].join(","),
    ),
  ];
  return `${rows.join("\n")}\n`;
}

export function toJson(bars: Candle[]): string {
  return JSON.stringify(
    bars.map((b) => ({
      time: b.time,
      iso: new Date(b.time * 1000).toISOString(),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })),
    null,
    2,
  );
}
