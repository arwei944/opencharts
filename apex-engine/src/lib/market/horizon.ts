import { INTERVAL_HORIZON, INTERVAL_MS } from "./constants.ts";
import type { Interval } from "./types.ts";

function stepSecOf(iv: Interval): number {
  return Math.max(1, Math.floor(INTERVAL_MS[iv] / 1000));
}

export interface Horizon {
  floorTime: number;
  targetBars: number;
  stepSec: number;
}

/**
 * Depth we intend to reach for a symbol/interval and the bar count it
 * represents. Pure function of (interval, nowSec) — no store, no clock reads —
 * so it is unit-testable with a fixed timestamp.
 */
export function horizonOf(interval: Interval, nowSec: number): Horizon {
  const stepSec = stepSecOf(interval);
  const h = INTERVAL_HORIZON[interval];
  const timeFloor = h.sinceMs ? Math.floor((nowSec * 1000 - h.sinceMs) / 1000) : 0;
  const countFloor = nowSec - (h.bars - 1) * stepSec;
  const floorTime = Math.max(timeFloor, countFloor, 0);
  const spanBars = Math.floor((nowSec - floorTime) / stepSec) + 1;
  return { floorTime, targetBars: Math.max(1, Math.min(h.bars, spanBars)), stepSec };
}