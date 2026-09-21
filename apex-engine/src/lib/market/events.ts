/**
 * Pure pointer-interaction math for the chart engine (no DOM, so unit-testable
 * with the plain node runner). The drag handlers stay in ChartEngine — they
 * share `interacting`/`dragging` with the render pipeline — but the math they
 * apply is extracted here.
 */

/** Logical-range shift for a mouse-drag pan. `span` is the current logical
 *  range width, `width` the host's CSS pixel width; sensitivity >1 makes the
 *  chart follow the cursor faster than 1:1. */
export function dragDelta(
  startX: number,
  clientX: number,
  sensitivity: number,
  span: number,
  width: number,
): number {
  const pxPerLogical = span / Math.max(1, width);
  return (clientX - startX) * sensitivity * pxPerLogical;
}

/** New visible logical range after panning by `deltaLogical` bars. */
export function panRange(
  from: number,
  to: number,
  deltaLogical: number,
): { from: number; to: number } {
  return { from: from - deltaLogical, to: to - deltaLogical };
}

/** Clamped pan sensitivity (0.2..5), defaulting to 1 on invalid input. */
export function clampPanSensitivity(v: number): number {
  return Math.max(0.2, Math.min(5, v || 1));
}
