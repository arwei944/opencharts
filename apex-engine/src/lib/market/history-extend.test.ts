import { test } from "node:test";
import assert from "node:assert/strict";
import { olderWaveEnds, needsOlderData } from "./history-paging.ts";

// ---------- olderWaveEnds (leftward page cursor math) ----------

test("olderWaveEnds starts at the resident front and steps back one page each", () => {
  const ends = olderWaveEnds(1_700_000_000, 900, 1000, 4);
  assert.equal(ends.length, 4);
  // wave 0 is the front itself; each wave is exactly one page of stepSec bars back
  for (let i = 0; i < ends.length; i++) {
    assert.equal(ends[i], 1_700_000_000 - i * 900_000);
  }
});

test("olderWaveEnds is strictly decreasing with constant page spacing", () => {
  const ends = olderWaveEnds(100_000, 60, 500, 3);
  assert.deepEqual(ends, [100_000, 100_000 - 30_000, 100_000 - 60_000]);
});

test("olderWaveEnds handles waves=0 and negative/degenerate inputs", () => {
  assert.deepEqual(olderWaveEnds(10, 60, 500, 0), []);
  assert.deepEqual(olderWaveEnds(10, 60, 500, -2), []);
  // pageSize 0 => all waves target the same front (caller controls page size)
  assert.deepEqual(olderWaveEnds(10, 60, 0, 2), [10, 10]);
});

// ---------- needsOlderData (viewport vs loaded-front decision) ----------

test("needsOlderData is true when the viewport out-pans the loaded history", () => {
  // oldest = 10:00, lookahead 2000 bars of 1m => threshold 10:00 + 2000*60
  assert.equal(needsOlderData(10 * 3600, 11 * 3600, 60, 2000), true);
  assert.equal(needsOlderData(11 * 3600, 11 * 3600, 60, 2000), true);
});

test("needsOlderData is false while the viewport stays inside the lookahead margin", () => {
  const oldest = 1_000_000;
  const step = 60;
  const lookahead = 2000;
  // viewport still ~2h to the right of the front => no backfill needed
  assert.equal(
    needsOlderData(oldest + 5_000_000, oldest, step, lookahead),
    false,
  );
  // exactly at the boundary is still covered (inclusive)
  assert.equal(
    needsOlderData(oldest + lookahead * step, oldest, step, lookahead),
    true,
  );
});

test("needsOlderData edge: empty/far-left viewport always asks for more", () => {
  const oldest = 1_000_000;
  assert.equal(needsOlderData(0, oldest, 60, 2000), true);
  assert.equal(needsOlderData(oldest - 1, oldest, 60, 2000), true);
});
