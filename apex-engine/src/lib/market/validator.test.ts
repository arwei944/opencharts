import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANOMALY_MOVE_RATIO,
  checkBar,
  gapBars,
  isAnomalous,
} from "./validator.ts";
import type { Candle } from "./types.ts";

function bar(time: number, close: number, patch?: Partial<Candle>): Candle {
  return {
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    ...patch,
  };
}

describe("validator.isAnomalous", () => {
  it("accepts a normal sequential bar", () => {
    const prev = bar(1000, 100);
    const next = bar(1060, 101);
    assert.equal(isAnomalous(prev, next), false);
  });

  it("flags NaN/Infinity prices", () => {
    assert.equal(isAnomalous(undefined, bar(1000, NaN)), true);
    assert.equal(isAnomalous(undefined, bar(1000, Infinity)), true);
  });

  it("flags non-positive prices", () => {
    assert.equal(isAnomalous(undefined, bar(1000, 0)), true);
    assert.equal(isAnomalous(undefined, bar(1000, -5)), true);
  });

  it("flags high/low that do not bracket open/close", () => {
    const c = bar(1000, 100, { open: 100, high: 99, low: 98, close: 100 });
    assert.equal(isAnomalous(undefined, c), true);
    const c2 = bar(1000, 100, { open: 100, high: 105, low: 102, close: 100 });
    assert.equal(isAnomalous(undefined, c2), true);
  });

  it("flags an extreme single-bar jump", () => {
    const prev = bar(1000, 100);
    const jump = bar(1060, 100 * (1 + ANOMALY_MOVE_RATIO + 0.1), {
      open: 100,
      high: 100 * (1 + ANOMALY_MOVE_RATIO + 0.1) + 1,
      low: 100,
    });
    assert.equal(isAnomalous(prev, jump), true);
  });

  it("accepts a large-but-plausible jump", () => {
    const prev = bar(1000, 100);
    const big = bar(1060, 130, { open: 100, high: 132, low: 99 });
    assert.equal(isAnomalous(prev, big), false);
  });

  it("treats a bar with no previous as clean (seed)", () => {
    assert.equal(isAnomalous(undefined, bar(1000, 100)), false);
  });
});

describe("validator.gapBars", () => {
  it("returns 0 for contiguous bars", () => {
    assert.equal(gapBars(bar(1000, 1), bar(1060, 1), 60), 0);
  });

  it("counts whole missing bars", () => {
    // 1000 -> 1360 with a 60s step = 6 steps = 5 missing bars
    assert.equal(gapBars(bar(1000, 1), bar(1360, 1), 60), 5);
  });

  it("ignores stale/out-of-order input", () => {
    assert.equal(gapBars(bar(1060, 1), bar(1000, 1), 60), 0);
    assert.equal(gapBars(undefined, bar(1000, 1), 60), 0);
    assert.equal(gapBars(bar(1000, 1), bar(1000, 1), 60), 0);
  });
});

describe("validator.checkBar", () => {
  it("combines gap and anomaly results", () => {
    // 100 -> 1300 is 5 steps of 60s => 4 missing bars; 100->105 is a sane move.
    const r = checkBar(
      bar(1000, 100),
      bar(1300, 105, { open: 100, high: 108, low: 99 }),
      60,
    );
    assert.equal(r.gap, 4);
    assert.equal(r.anomaly, false);
    // A 70% single-bar jump is flagged by the anomaly check too.
    const bad = checkBar(
      bar(1000, 100),
      bar(1060, 170, { open: 100, high: 175, low: 99 }),
      60,
    );
    assert.equal(bad.gap, 0);
    assert.equal(bad.anomaly, true);
  });
});
