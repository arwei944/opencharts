import { intervalSec } from "./bars.ts";
import type { Candle, Interval } from "./types.ts";

/**
 * Multi-timeframe aggregation (P0-C1): derive coarser candles from the
 * resident series locally instead of refetching. This is the primitive behind
 * the HTF context bar (which used to fire one REST request per higher
 * timeframe) and the future multi-TF pane cascade.
 *
 * Alignment: group key = floor(time / stepSec) * stepSec — UTC-aligned open
 * times, matching the exchange convention for sub-day and day multiples
 * (1m→1d all divide evenly). For 1w/1M the floor is an approximation
 * (weekly/monthly boundaries are not uniform), acceptable for a context strip.
 */

export function aggregateCandles(bars: Candle[], stepSec: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curKey = -1;
  for (const b of bars) {
    const key = Math.floor(b.time / stepSec);
    if (key !== curKey) {
      curKey = key;
      cur = {
        time: key * stepSec,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
        closed: true,
      };
      out.push(cur);
    } else if (cur) {
      if (b.high > cur.high) cur.high = b.high;
      if (b.low < cur.low) cur.low = b.low;
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  // The final group is still forming — mark it open (live).
  if (out.length) out[out.length - 1].closed = false;
  return out;
}

/** Aggregate the resident series to a coarser interval (no-op when equal). */
export function aggregateToInterval(
  bars: Candle[],
  target: Interval,
): Candle[] {
  return aggregateCandles(bars, intervalSec(target));
}

/** Only the live (still-forming) aggregated tail group. */
export function lastAggregated(bars: Candle[], stepSec: number): Candle | null {
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const key = Math.floor(last.time / stepSec);
  let i = bars.length - 1;
  const o: Candle = {
    time: key * stepSec,
    open: last.open,
    high: last.high,
    low: last.low,
    close: last.close,
    volume: last.volume,
    closed: false,
  };
  while (i > 0 && Math.floor(bars[i - 1].time / stepSec) === key) {
    i -= 1;
    const b = bars[i];
    o.open = b.open;
    o.high = Math.max(o.high, b.high);
    o.low = Math.min(o.low, b.low);
    // close deliberately keeps the LAST bar's close (walking backwards).
    o.volume += b.volume;
  }
  return o;
}
