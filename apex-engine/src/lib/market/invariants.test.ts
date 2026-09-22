import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkBarsMonotonic,
  checkColumnsRoundTrip,
  checkTailSync,
  runInvariants,
} from "./invariants.ts";
import type { Candle } from "./types.ts";

const bar = (time: number, close = 100): Candle => ({
  time,
  open: close - 1,
  high: close + 2,
  low: close - 2,
  close,
  volume: 10,
});

test("checkBarsMonotonic: strictly increasing passes, flat/backward fails", () => {
  assert.equal(checkBarsMonotonic([bar(0), bar(900), bar(1800)]).ok, true);
  assert.equal(checkBarsMonotonic([bar(0), bar(0), bar(900)]).ok, false);
  assert.equal(checkBarsMonotonic([bar(900), bar(0)]).ok, false);
  assert.equal(checkBarsMonotonic([bar(900), bar(0)]).firstBadTime, 0);
  assert.equal(checkBarsMonotonic([]).ok, true);
});

test("checkColumnsRoundTrip: encode → decode reproduces bars losslessly", () => {
  const bars = [bar(0, 100.25), bar(900, 101.75), bar(1800, 99.5)];
  assert.equal(checkColumnsRoundTrip(bars), true);
  assert.equal(checkColumnsRoundTrip([]), true);
});

test("checkTailSync: indTail end must match resident end", () => {
  const bars = [bar(0), bar(900)];
  assert.equal(checkTailSync(bars, [bar(0), bar(900)]), true);
  assert.equal(checkTailSync(bars, [bar(0)]), false);
  assert.equal(checkTailSync([], []), true);
});

test("runInvariants aggregates and reports the first bad time", () => {
  const good = runInvariants([bar(0), bar(900)], [bar(0), bar(900)]);
  assert.equal(good.ok, true);
  const bad = runInvariants([bar(900), bar(0)], [bar(900), bar(0)]);
  assert.equal(bad.ok, false);
  assert.equal(bad.monotonic, false);
  assert.equal(bad.firstBadTime, 0);
});
