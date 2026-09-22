import type { Candle } from "./types.ts";

/**
 * Magnetic snap for drawing anchors. Pure helpers operating through a small
 * coordinate context so tests can drive them without a real chart engine:
 *  - snapTime: aligns an anchor's time to the nearest bar (within tolPx).
 *  - snapPrice: aligns an anchor's price to the nearest OHLC of the bar under
 *    the anchor (high/low are the natural magnet points).
 */

export interface SnapCtx {
  timeToX: (t: number) => number | null;
  priceToY: (p: number) => number | null;
}

/** Index of the bar whose time is closest to `time` (binary search). */
export function nearestBarIndex(
  bars: Pick<Candle, "time">[],
  time: number,
): number {
  if (!bars.length) return -1;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const a = bars[lo - 1].time;
  const b = bars[lo].time;
  return time - a <= b - time ? lo - 1 : lo;
}

function inTol(dx: number, tolPx: number): boolean {
  return Number.isFinite(dx) && Math.abs(dx) <= tolPx;
}

/** Snap a time to the nearest bar centre within tolPx (no-op otherwise). */
export function snapTime(
  bars: Pick<Candle, "time">[],
  time: number,
  ctx: SnapCtx,
  tolPx = 8,
): number {
  const i = nearestBarIndex(bars, time);
  if (i < 0) return time;
  const tx = ctx.timeToX(time);
  if (tx == null) return time;
  // Probe the nearest bar plus one neighbour in each direction (bars can be
  // sparse after gap detection, so the closest centre may be a step away).
  const out = time;
  let best: number | null = null;
  let bestDx = Infinity;
  for (let k = i - 1; k <= i + 1; k++) {
    const barT = bars[k]?.time;
    if (barT == null) continue;
    const x = ctx.timeToX(barT);
    if (x == null) continue;
    const dx = x - tx;
    if (inTol(dx, tolPx) && Math.abs(dx) < bestDx) {
      bestDx = Math.abs(dx);
      best = barT;
    }
  }
  return best ?? out;
}

/** Snap a price to the nearest OHLC of the bar at `time` within tolPx. */
export function snapPrice(
  bars: Pick<Candle, "open" | "high" | "low" | "close" | "time">[],
  time: number,
  price: number,
  ctx: SnapCtx,
  tolPx = 8,
): number {
  const i = nearestBarIndex(bars, time);
  if (i < 0) return price;
  const b = bars[i];
  const out = price;
  const py = ctx.priceToY(price);
  if (py == null) return price;
  let best: number | null = null;
  let bestDy = Infinity;
  for (const p of [b.low, b.open, b.high, b.close]) {
    if (!Number.isFinite(p)) continue;
    const y = ctx.priceToY(p);
    if (y == null) continue;
    const dy = y - py;
    if (inTol(dy, tolPx) && Math.abs(dy) < bestDy) {
      bestDy = Math.abs(dy);
      best = p;
    }
  }
  return best ?? out;
}
