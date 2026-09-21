/**
 * Pure viewport math for the chart engine (no lightweight-charts imports, so
 * it is unit-testable with the plain node runner). The engine only turns these
 * into `setVisibleLogicalRange` / `setVisibleRange` calls.
 */

/** Zoom a logical range by `factor` around an anchor at `ratio` (0..1) of the
 *  span, keeping the anchor stationary — this is what makes double-click zoom
 *  feel anchored under the cursor instead of snapping to the middle. */
export function zoomRange(
  from: number,
  to: number,
  factor: number,
  ratio: number,
): { from: number; to: number } {
  const span = to - from;
  const anchor = from + span * ratio;
  const newSpan = span / factor;
  const nextFrom = anchor - (anchor - from) / factor;
  return { from: nextFrom, to: nextFrom + newSpan };
}

/** Logical range that shows every bar plus a small margin on each side. */
export function fitRange(
  barCount: number,
  margin = 4,
): { from: number; to: number } {
  return { from: -margin, to: barCount + margin };
}

/** True when a (time or logical) range request is usable. */
export function isValidRange(from: number, to: number): boolean {
  return Number.isFinite(from) && Number.isFinite(to) && to > from;
}
