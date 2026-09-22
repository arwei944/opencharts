import { test } from "node:test";
import assert from "node:assert/strict";
import { higherIntervals, overlapRange } from "./htf.ts";

test("higherIntervals returns the next coarser intervals in order", () => {
  assert.deepEqual(higherIntervals("15m"), ["30m", "1h", "2h"]);
  assert.deepEqual(higherIntervals("1m", 2), ["3m", "5m"]);
  assert.deepEqual(higherIntervals("1h"), ["2h", "4h", "6h"]);
});

test("higherIntervals is empty at the coarsest interval", () => {
  assert.deepEqual(higherIntervals("1M"), []);
});

test("higherIntervals respects count beyond available", () => {
  assert.deepEqual(higherIntervals("1d", 5), ["3d", "1w", "1M"]);
});

test("overlapRange finds covered HTF bar indices", () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
  }));
  // covers bars 10..12
  assert.deepEqual(overlapRange(bars, bars[10].time, bars[12].time), {
    from: 10,
    to: 12,
  });
  // range spanning everything
  assert.deepEqual(overlapRange(bars, 0, 2_000_000_000), { from: 0, to: 39 });
});

test("overlapRange returns null when the range is outside the series", () => {
  const bars = Array.from({ length: 10 }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
  }));
  assert.equal(overlapRange(bars, 1, 2), null); // before
  assert.equal(overlapRange(bars, 9_000_000_000, 9_000_000_100), null); // after
  assert.equal(overlapRange(undefined, 1, 2), null); // no data
});

test("overlapRange clamps partial overlaps to the series edges", () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
  }));
  // from before the series, to inside it
  const r = overlapRange(bars, 0, bars[5].time);
  assert.deepEqual(r, { from: 0, to: 5 });
});
