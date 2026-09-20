import { test } from "node:test";
import assert from "node:assert/strict";
import { diffTail, growsLeft, initialLogicalRange, trimTail } from "./series-ops.ts";

function bar(time: number, close = 100): { time: number; open: number; high: number; low: number; close: number; volume: number } {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

// ---------- diffTail ----------

test("diffTail detects a same-length replace (live bar tick)", () => {
  const cur = [bar(1), bar(2), bar(3)];
  const next = [bar(1), bar(2), bar(4)];
  const d = diffTail(cur, next);
  assert.ok(d && d.kind === "replace");
  assert.equal((d as { bar: { time: number } }).bar.time, 4);
});

test("diffTail detects an append of exactly one newer bar", () => {
  const cur = [bar(1), bar(2), bar(3)];
  const next = [bar(1), bar(2), bar(3), bar(4)];
  const d = diffTail(cur, next);
  assert.ok(d && d.kind === "append");
  assert.equal((d as { bar: { time: number } }).bar.time, 4);
});

test("diffTail rejects structural changes (left growth, reset, shrink)", () => {
  const cur = [bar(5), bar(6)];
  assert.equal(diffTail(cur, [bar(4), bar(5), bar(6)]), null); // grows left
  assert.equal(diffTail(cur, [bar(5)]), null); // shrink
  assert.equal(diffTail(cur, [bar(7), bar(8)]), null); // head moved
  assert.equal(diffTail([], []), null);
});

test("diffTail rejects a stale append (new bar not newer than last)", () => {
  const cur = [bar(1), bar(2)];
  assert.equal(diffTail(cur, [bar(1), bar(2), bar(2)]), null);
});

// ---------- growsLeft ----------

test("growsLeft is true only when next starts earlier", () => {
  assert.equal(growsLeft([bar(5), bar(6)], [bar(4), bar(5), bar(6)]), true);
  assert.equal(growsLeft([bar(5), bar(6)], [bar(5), bar(6), bar(7)]), false);
  assert.equal(growsLeft([], [bar(1)]), false);
});

// ---------- initialLogicalRange ----------

test("initialLogicalRange shows recent bars, clamped to the series", () => {
  assert.deepEqual(initialLogicalRange(1000), { from: 850, to: 1005 });
  assert.deepEqual(initialLogicalRange(10), { from: 0, to: 15 }); // fewer than recent
  assert.deepEqual(initialLogicalRange(0), { from: 0, to: 5 });
});

// ---------- trimTail ----------

test("trimTail keeps the most recent cap bars", () => {
  const tail = [bar(1), bar(2), bar(3), bar(4), bar(5)];
  const trimmed = trimTail(tail, 3);
  assert.equal(trimmed.length, 3);
  assert.equal(trimmed[0].time, 3);
  // short tails pass through unchanged
  assert.equal(trimTail(tail, 10), tail);
});