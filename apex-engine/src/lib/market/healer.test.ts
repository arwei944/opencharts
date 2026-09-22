import { test } from "node:test";
import assert from "node:assert/strict";
import { findGaps, mergeGapPage } from "./healer.ts";
import type { Candle } from "./types.ts";

const bar = (time: number): Candle => ({
  time,
  open: 1,
  high: 2,
  low: 0.5,
  close: 1.5,
  volume: 10,
});

test("findGaps: contiguous series has no holes", () => {
  const bars = [0, 900, 1800, 2700].map(bar);
  assert.deepEqual(findGaps(bars, 900), []);
});

test("findGaps: flags holes above minGapSteps", () => {
  // 15m bars; a 2-hour hole between 1800 and 9000 (8 bars missing → diff 7200)
  const bars = [0, 900, 1800, 9000, 9900].map(bar);
  const gaps = findGaps(bars, 900);
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0], { fromTime: 1800, toTime: 9000, missing: 7 });
});

test("findGaps: small jitter (≤ minGapSteps) is ignored", () => {
  // one-bar hole (2 steps) at default threshold 3 → not a gap
  const bars = [0, 900, 2700, 3600].map(bar);
  assert.deepEqual(findGaps(bars, 900), []);
  // but visible with a tighter threshold
  assert.equal(findGaps(bars, 900, 1).length, 1);
});

test("mergeGapPage: inserts fetched bars into the hole, dedups edges", () => {
  const resident = [0, 900, 1800, 9000, 9900].map(bar);
  const page = [2700, 3600, 4500, 5400, 6300, 7200, 8100].map(bar);
  const merged = mergeGapPage(resident, page, 1800, 9000);
  assert.equal(merged.length, resident.length + page.length);
  assert.deepEqual(
    merged.map((b) => b.time),
    [0, 900, 1800, 2700, 3600, 4500, 5400, 6300, 7200, 8100, 9000, 9900],
  );
});

test("mergeGapPage: overlapping page replaces resident bars (authoritative)", () => {
  const resident = [0, 900, 1800, 9000].map(bar);
  // page includes bars that already exist before the gap — filtered, plus a
  // bar equal to the gap edge — replaced.
  const page = [0, 900, 2700, 3600, 9000].map((t) => ({
    ...bar(t),
    close: 99,
  }));
  const merged = mergeGapPage(resident, page, 1800, 9000);
  assert.deepEqual(
    merged.map((b) => b.time),
    [0, 900, 1800, 2700, 3600, 9000],
  );
  // the overlapping 9000-edge bar came from the page (close 99)
  assert.equal(merged[5].close, 99);
});

test("mergeGapPage: empty/out-of-window page is a no-op", () => {
  const resident = [0, 900, 9000].map(bar);
  assert.equal(mergeGapPage(resident, [], 900, 9000), resident);
  assert.equal(mergeGapPage(resident, [bar(999999)], 900, 9000), resident);
});
