import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIFECYCLE_POLICIES,
  decideFlush,
  isIdleSince,
  pauseWanted,
} from "./lifecycle.ts";

test("policies ship sensible defaults", () => {
  assert.equal(DEFAULT_LIFECYCLE_POLICIES.idleFlushDelayMs > 0, true);
  assert.equal(DEFAULT_LIFECYCLE_POLICIES.hiddenPause, true);
});

test("isIdleSince: idle once the window has passed", () => {
  const t0 = 100_000;
  assert.equal(isIdleSince(t0, t0 + 3_999, 4_000), false);
  assert.equal(isIdleSince(t0, t0 + 4_000, 4_000), true);
  assert.equal(isIdleSince(t0, t0 + 60_000, 4_000), true);
});

test("decideFlush: debounces to at most one snapshot per gap", () => {
  const lastFlush = 100_000;
  assert.equal(decideFlush(lastFlush + 1_000, lastFlush, 3_000), "hold");
  assert.equal(decideFlush(lastFlush + 2_999, lastFlush, 3_000), "hold");
  assert.equal(decideFlush(lastFlush + 3_000, lastFlush, 3_000), "flush");
  assert.equal(decideFlush(lastFlush + 9_000, lastFlush, 3_000), "flush");
});

test("pauseWanted: only pauses hidden tabs when the policy allows", () => {
  assert.equal(pauseWanted(true, true), true);
  assert.equal(pauseWanted(true, false), false);
  assert.equal(pauseWanted(false, true), false);
  assert.equal(pauseWanted(false, false), false);
});
