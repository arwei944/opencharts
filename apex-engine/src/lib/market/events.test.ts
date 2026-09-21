import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPanSensitivity, dragDelta, panRange } from "./events.ts";

test("dragDelta maps cursor px to logical bars with sensitivity", () => {
  // span 100 bars across 1000px: 1px = 0.1 logical
  assert.equal(dragDelta(100, 110, 1, 100, 1000), 1);
  // sensitivity 2 doubles the travel
  assert.equal(dragDelta(100, 110, 2, 100, 1000), 2);
  // dragging left is negative
  assert.equal(dragDelta(100, 90, 1, 100, 1000), -1);
});

test("dragDelta treats zero/negative width as 1px (original guard)", () => {
  // width 0 -> pxPerLogical = span/1; cursor moved 5px => 5 * 100 logical
  assert.equal(dragDelta(0, 5, 1, 100, 0), 500);
  assert.equal(dragDelta(0, 5, 1, 100, -10), 500);
});

test("panRange shifts both edges by the delta", () => {
  assert.deepEqual(panRange(100, 200, 5), { from: 95, to: 195 });
  assert.deepEqual(panRange(100, 200, -5), { from: 105, to: 205 });
});

test("clampPanSensitivity bounds to [0.2, 5] with 1 default", () => {
  assert.equal(clampPanSensitivity(1), 1);
  assert.equal(clampPanSensitivity(10), 5);
  assert.equal(clampPanSensitivity(0.05), 0.2);
  assert.equal(clampPanSensitivity(0), 1);
  assert.equal(clampPanSensitivity(NaN), 1);
});
