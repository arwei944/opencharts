import { colsOf, barsOf } from "./columns.ts";
import type { Candle } from "./types.ts";

/**
 * Runtime invariant probes (P3-D4). DEV-only self-tests run after each engine
 * commit; a violated invariant feeds the telemetry op-log so a subtle data
 * corruption (a non-monotonic bar time, a column/array desync) shows up as a
 * record instead of as a confusing chart glitch. Cheap on 100k bars (columnar
 * encode/decode is the fast I/O path); production never executes them.
 */

export interface InvariantResult {
  monotonic: boolean;
  columns: boolean;
  tailSync: boolean;
  ok: boolean;
  firstBadTime?: number;
}

/** Times must be strictly increasing (gaps are legal, backfills are not). */
export function checkBarsMonotonic(bars: Candle[]): {
  ok: boolean;
  firstBadTime?: number;
} {
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time <= bars[i - 1].time) {
      return { ok: false, firstBadTime: bars[i].time };
    }
  }
  return { ok: true };
}

/** Columnar encode → decode must reproduce the array losslessly. */
export function checkColumnsRoundTrip(bars: Candle[]): boolean {
  if (!bars.length) return true;
  const decoded = barsOf(colsOf(bars));
  if (decoded.length !== bars.length) return false;
  for (let i = 0; i < bars.length; i++) {
    const a = bars[i];
    const b = decoded[i];
    if (
      a.time !== b.time ||
      a.open !== b.open ||
      a.high !== b.high ||
      a.low !== b.low ||
      a.close !== b.close ||
      a.volume !== b.volume
    ) {
      return false;
    }
  }
  return true;
}

/** The engine's indicator tail must end at the same bar as the resident array. */
export function checkTailSync(bars: Candle[], indTail: Candle[]): boolean {
  if (!bars.length) return true;
  return indTail[indTail.length - 1]?.time === bars[bars.length - 1].time;
}

/** Full invariant pass over one commit. */
export function runInvariants(
  bars: Candle[],
  indTail: Candle[],
): InvariantResult {
  const mono = checkBarsMonotonic(bars);
  const columns = checkColumnsRoundTrip(bars);
  const tailSync = checkTailSync(bars, indTail);
  return {
    monotonic: mono.ok,
    columns,
    tailSync,
    ok: mono.ok && columns && tailSync,
    firstBadTime: mono.firstBadTime,
  };
}
