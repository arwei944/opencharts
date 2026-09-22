import { INTERVALS } from "./constants.ts";
import type { Interval } from "./types.ts";

/** The next `count` coarser intervals above `iv` — the "higher timeframe
 *  context" row shown over the main chart. Empty when `iv` is already the
 *  coarsest interval. */
export function higherIntervals(iv: Interval, count = 3): Interval[] {
  const idx = INTERVALS.findIndex((x) => x.id === iv);
  if (idx < 0) return [];
  return INTERVALS.slice(idx + 1, idx + 1 + count).map((x) => x.id);
}

/** Map a master-chart visible time range onto a higher-timeframe series:
 *  returns the HTF bar indices covered (inclusive), or null when the range
 *  touches nothing (e.g. before the loaded HTF history). */
export function overlapRange(
  htfBars: Array<{ time: number }> | undefined,
  fromSec: number,
  toSec: number,
): { from: number; to: number } | null {
  if (!htfBars || htfBars.length < 2) return null;
  const first = htfBars[0].time;
  const last = htfBars[htfBars.length - 1].time;
  if (toSec < first || fromSec > last) return null;
  let lo = 0;
  let hi = htfBars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (htfBars[mid].time < fromSec) lo = mid + 1;
    else hi = mid;
  }
  const from = lo;
  lo = 0;
  hi = htfBars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (htfBars[mid].time > toSec) hi = mid - 1;
    else lo = mid;
  }
  return { from, to: Math.max(lo, from) };
}
