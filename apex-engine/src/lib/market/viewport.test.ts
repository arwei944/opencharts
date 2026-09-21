import { test } from "node:test";
import assert from "node:assert/strict";
import { fitRange, isValidRange, zoomRange } from "./viewport.ts";

test("zoomRange keeps the anchor stationary and shrinks the span by factor", () => {
  const from = 100;
  const to = 200;
  const factor = 2;
  const ratio = 0.25; // anchor at 125
  const r = zoomRange(from, to, factor, ratio);
  const span = r.to - r.from;
  assert.equal(span, 50); // 100 / 2
  const anchor = r.from + span * ratio;
  assert.ok(Math.abs(anchor - 125) < 1e-9, "anchor must stay at 125");
});

test("zoomRange at ratio 0.5 zooms around the center symmetrically", () => {
  const r = zoomRange(0, 100, 2, 0.5);
  assert.equal(r.from, 25);
  assert.equal(r.to, 75);
});

test("zoomRange factor < 1 expands and keeps the anchor", () => {
  const from = 10;
  const to = 30;
  const r = zoomRange(from, to, 0.5, 0.5);
  assert.equal(r.to - r.from, 40); // 20 / 0.5
  const anchor = r.from + (r.to - r.from) * 0.5;
  assert.equal(anchor, 20);
});

test("fitRange shows every bar with symmetric margins", () => {
  assert.deepEqual(fitRange(1000), { from: -4, to: 1004 });
  assert.deepEqual(fitRange(0), { from: -4, to: 4 });
  assert.deepEqual(fitRange(50, 10), { from: -10, to: 60 });
});

test("isValidRange rejects degenerate and non-finite ranges", () => {
  assert.equal(isValidRange(1, 2), true);
  assert.equal(isValidRange(2, 1), false);
  assert.equal(isValidRange(1, 1), false);
  assert.equal(isValidRange(NaN, 5), false);
  assert.equal(isValidRange(1, Infinity), false);
});
