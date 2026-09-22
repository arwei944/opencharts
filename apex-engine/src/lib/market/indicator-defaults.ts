import type { Interval } from "./types.ts";

/**
 * Interval-aware indicator defaults (P2-C5). Ultra-short live intervals
 * (1s/1m) get shorter lookbacks — a 99-period MA on a 1s chart barely has
 * data yet and the default [7,25,99] looks like noise; medium+ intervals keep
 * the catalog defaults (which is what every mainstream chart app does).
 *
 * Exported for unit tests and for `addIndicator` to consult the live interval.
 */

const OVERRIDES: Record<string, Partial<Record<Interval, number[]>>> = {
  MA: {
    "1s": [3, 10, 25],
    "1m": [5, 20, 60],
  },
  EMA: {
    "1s": [5, 15],
    "1m": [5, 20],
  },
  RSI: {
    "1s": [7],
  },
  BOLL: {
    "1s": [10, 2],
  },
  MACD: {
    "1s": [6, 13, 5],
  },
};

/** Nearest smaller interval override (1m closes the 1s gap for other TFs). */
export function defaultParamsFor(
  kind: string,
  interval: Interval,
  fallback: number[],
): number[] {
  const byIv = OVERRIDES[kind];
  if (!byIv) return fallback;
  return byIv[interval] ?? fallback;
}
