import { test } from "node:test";
import assert from "node:assert/strict";
import {
  markHostFailed,
  markHostHealthy,
  nextHostIndex,
} from "./host-picker.ts";

test("nextHostIndex round-robins when all hosts are equal", () => {
  assert.equal(nextHostIndex([0, 0, 0, 0], 0), 1);
  assert.equal(nextHostIndex([0, 0, 0, 0], 3), 0);
});

test("nextHostIndex prefers the least-failed host", () => {
  // host 2 has zero failures; current 0 just failed again.
  const failures = [3, 1, 0, 2];
  assert.equal(nextHostIndex(failures, 0), 2);
  // host 1 lowest after excluding current 2:
  assert.equal(nextHostIndex(failures, 2), 1);
});

test("nextHostIndex never immediately retries the current dead host", () => {
  // Even if current 0 is the only zero-failure one (all others failed once),
  // we still rotate away instead of retrying the one that just dropped.
  assert.equal(nextHostIndex([0, 1, 1, 1], 0), 1);
});

test("markHostHealthy resets the score; markHostFailed accumulates", () => {
  let f = markHostFailed([0, 0, 0, 0], 2);
  f = markHostFailed(f, 2);
  assert.deepEqual(f, [0, 0, 2, 0]);
  assert.deepEqual(markHostHealthy(f, 2), [0, 0, 0, 0]);
});
