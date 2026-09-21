/**
 * Pure helpers for the infinite-scroll leftward fill (no store / fetch deps,
 * so they are unit-testable with the plain node runner).
 */

/**
 * endTime (sec) targets for one leftward fill wave. Wave 0 starts at the
 * resident front (`oldestSec`); later waves step back one page each. Overlap
 * with the loaded front is fine — callers filter bars the resident series
 * already owns.
 */
export function olderWaveEnds(
  oldestSec: number,
  stepSec: number,
  pageSize: number,
  waves: number,
): number[] {
  return Array.from(
    { length: Math.max(0, waves) },
    (_, i) => oldestSec - i * pageSize * stepSec,
  );
}

/** True when the visible range has out-panned the loaded history (with a
 *  lookahead margin) so the fill may need to walk further back. */
export function needsOlderData(
  fromTime: number,
  oldestSec: number,
  stepSec: number,
  lookaheadBars: number,
): boolean {
  return fromTime <= oldestSec + lookaheadBars * stepSec;
}
