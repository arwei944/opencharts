import type { Candle } from "./types";

/**
 * Lightweight data-integrity checks for live market ticks. Pure functions so
 * they are trivially unit-testable and reused by the WS feed.
 */

/** A single bar is anomalous when its numbers are corrupt or its close jumps
 * beyond a hard sanity bound vs the previous bar. Crypto does move fast, so the
 * threshold is deliberately loose (a >60% move inside one bar is effectively a
 * bad tick on any of the supported pairs) — the goal is catching feed garbage,
 * not flagging real volatility. */
export const ANOMALY_MOVE_RATIO = 0.6;

export function isAnomalous(prev: Candle | undefined, bar: Candle): boolean {
  if (
    !Number.isFinite(bar.open) ||
    !Number.isFinite(bar.high) ||
    !Number.isFinite(bar.low) ||
    !Number.isFinite(bar.close) ||
    !Number.isFinite(bar.volume)
  ) {
    return true;
  }
  if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
    return true;
  }
  // Never trust a bar whose high/low don't bracket open/close.
  if (
    bar.high < Math.max(bar.open, bar.close) ||
    bar.low > Math.min(bar.open, bar.close)
  ) {
    return true;
  }
  if (!prev) return false;
  if (prev.close <= 0) return false;
  const move = Math.abs(bar.close - prev.close) / prev.close;
  return move > ANOMALY_MOVE_RATIO;
}

/** Whole bars that would fit between prev.time and bar.time (0 = contiguous). */
export function gapBars(
  prev: Candle | undefined,
  bar: Candle,
  stepSec: number,
): number {
  if (!prev || stepSec <= 0) return 0;
  const dt = bar.time - prev.time;
  if (dt <= 0) return 0;
  return Math.max(0, Math.round(dt / stepSec) - 1);
}

export interface BarCheck {
  gap: number;
  anomaly: boolean;
}

export function checkBar(
  prev: Candle | undefined,
  bar: Candle,
  stepSec: number,
): BarCheck {
  return {
    gap: gapBars(prev, bar, stepSec),
    anomaly: isAnomalous(prev, bar),
  };
}
