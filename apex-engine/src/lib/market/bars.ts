import type { Candle, Interval } from "./types";
import { INTERVAL_MS } from "./constants";

export function intervalSec(iv: Interval): number {
  return Math.max(1, Math.floor(INTERVAL_MS[iv] / 1000));
}

export function barAtTime(bars: Candle[], time: number): Candle | null {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = bars[mid].time;
    if (t === time) return bars[mid];
    if (t < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

export function closedOnly(bars: Candle[], liveOpenTime?: number): Candle[] {
  if (!liveOpenTime) return bars;
  return bars.filter((b) => b.time < liveOpenTime);
}

export function mergeBars(existing: Candle[], incoming: Candle[], cap: number, liveOpenTime?: number): Candle[] {
  if (!incoming.length) return existing;
  const filtered = liveOpenTime ? incoming.filter((b) => b.time < liveOpenTime) : incoming;
  if (!existing.length) return filtered.slice(-cap);
  const map = new Map<number, Candle>();
  for (const b of existing) map.set(b.time, b);
  for (const b of filtered) {
    const prev = map.get(b.time);
    if (prev && liveOpenTime && b.time >= liveOpenTime) continue;
    map.set(b.time, b);
  }
  return [...map.values()].sort((a, b) => a.time - b.time).slice(-cap);
}

/**
 * Front-insert a contiguous block of older bars. The history prefill always hands
 * us the page adjacent to what is already loaded, so the fast path is a plain
 * concat — no Map rebuild and no sort over a 100k-bar series.
 */
export function prependBars(existing: Candle[], incoming: Candle[], cap: number, liveOpenTime?: number): Candle[] {
  if (!incoming.length) return existing;
  const first = existing[0];
  if (!first) return incoming.slice(-cap);
  const newest = incoming[incoming.length - 1];
  const contiguous = newest.time < first.time && newest.time < (liveOpenTime ?? Infinity);
  if (!contiguous) return mergeBars(existing, incoming, cap, liveOpenTime);
  const next = [...incoming, ...existing];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export type PlotPoint =
  | { time: number; open: number; high: number; low: number; close: number; volume: number }
  | { time: number };

export function withTimeGaps(bars: Candle[], step: number): PlotPoint[] {
  if (bars.length < 2 || step <= 0) return bars;
  const maxHole = step * 12;
  const minHole = step * 2;
  const out: PlotPoint[] = [bars[0]];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const cur = bars[i];
    const dt = cur.time - prev.time;
    if (dt >= minHole && dt <= maxHole) {
      for (let t = prev.time + step; t < cur.time; t += step) out.push({ time: t });
    }
    out.push(cur);
  }
  return out;
}
