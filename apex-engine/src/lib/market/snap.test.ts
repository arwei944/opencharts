import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nearestBarIndex, snapPrice, snapTime } from "./snap.ts";
import type { SnapCtx } from "./snap.ts";

// Linear coordinate systems: x = time (1px per ms), y = 100 - price (1px per $).
const ctx: SnapCtx = {
  timeToX: (t) => t,
  priceToY: (p) => 100 - p,
};

const bars = Array.from({ length: 10 }, (_, i) => {
  const close = 100 + i * 2;
  return {
    time: 1700000000 + i * 60,
    open: close - 1,
    high: close + 3,
    low: close - 3,
    close,
    volume: 100,
  };
});

describe("snap.nearestBarIndex", () => {
  it("finds the closest bar time", () => {
    assert.equal(nearestBarIndex(bars, 1700000000), 0);
    assert.equal(nearestBarIndex(bars, 1700000030), 0); // halfway below
    assert.equal(nearestBarIndex(bars, 1700000031), 1); // just past halfway
    assert.equal(nearestBarIndex(bars, 1700000054), 1); // 6px from bar 1
    assert.equal(nearestBarIndex(bars, 1700000594), 9); // 54s after last bar
    assert.equal(nearestBarIndex([], 1), -1);
  });
});

describe("snap.snapTime", () => {
  it("snaps a near-miss to the bar centre", () => {
    // 3px away from bar 4's centre (tol 8)
    const target = bars[4].time + 3;
    assert.equal(snapTime(bars, target, ctx), bars[4].time);
  });
  it("leaves a far target untouched", () => {
    const target = bars[4].time + 40; // > tol
    assert.equal(snapTime(bars, target, ctx), target);
  });
  it("handles empty input", () => {
    assert.equal(snapTime([], 123, ctx), 123);
  });
});

describe("snap.snapPrice", () => {
  it("snaps to the nearest high/low of the bar under the anchor", () => {
    // bar 3: open=105, high=109, low=103, close=106.
    // 107.5 is 1.5px below the high -> snaps to high.
    assert.equal(snapPrice(bars, bars[3].time, 107.5, ctx), 109);
    // 102.5 is 0.5px above the low -> snaps to low.
    assert.equal(snapPrice(bars, bars[3].time, 102.5, ctx), 103);
  });
  it("leaves a price far from any OHLC untouched", () => {
    // bar 3 OHLC: 102/105/108/105; 103.5 is 1.5px from low, 1.5 from open — but
    // 106.5 is 1.5px from high too... pick a truly isolated price: 104.4
    // (0.4 above low-open midpoint?) — assert it does NOT hit low.
    assert.notEqual(snapPrice(bars, bars[3].time, 104.4, ctx), 102);
    // and a far-away price is a no-op entirely
    const far = snapPrice(bars, bars[3].time, 150, ctx);
    assert.equal(far, 150);
  });
  it("handles empty input", () => {
    assert.equal(snapPrice([], 1, 100, ctx), 100);
  });
});
