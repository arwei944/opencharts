import { test } from "node:test";
import assert from "node:assert/strict";
import { decideCommit, REVEAL_CHUNK_BARS } from "./data-pipeline.ts";

function bars(n: number, start = 1_700_000_000, step = 60) {
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * step,
    open: 100,
    high: 101,
    low: 99,
    close: 100 + i,
    volume: 1000,
  }));
}

test("same reference is a noop unless frozen cleared with parked history", () => {
  const b = bars(10);
  assert.equal(decideCommit(b, b, true, false, null).kind, "noop");
  // same ref + frozen cleared + pending exists -> schedule the parked commit
  const pending = bars(50);
  const act = decideCommit(b, b, false, false, pending);
  assert.equal(act.kind, "schedule");
  assert.equal(decideCommit(b, b, false, false, null).kind, "noop");
});

test("live tick (append/replace tail) maps to tail", () => {
  const cur = bars(10);
  const appended = bars(11); // one newer bar
  assert.equal(decideCommit(cur, appended, true, false, null).kind, "tail");
  const replaced = bars(10);
  replaced[9] = { ...replaced[9], close: 999 }; // same-length update
  assert.equal(decideCommit(cur, replaced, true, false, null).kind, "tail");
});

function growLeft(base: ReturnType<typeof bars>, extra: number) {
  const step = base[1].time - base[0].time;
  const older = bars(extra, base[0].time - extra * step, step);
  return [...older, ...base];
}

test("left-grow under frozen parks, small grow defers reveal", () => {
  const cur = bars(10);
  const grown = growLeft(cur, 500); // 500 older bars prepended
  const act = decideCommit(cur, grown, true, false, null);
  assert.equal(act.kind, "park");
  if (act.kind === "park") {
    assert.equal(act.reveal, false);
    assert.equal(act.next, grown);
  }
});

test("left-grow under interacting parks even when huge", () => {
  const cur = bars(10);
  const grown = growLeft(cur, REVEAL_CHUNK_BARS + 100);
  const act = decideCommit(cur, grown, true, true, null);
  assert.equal(act.kind, "park");
  if (act.kind === "park") assert.equal(act.reveal, false);
});

test("big left-grow with idle pointer reveals immediately", () => {
  const cur = bars(10);
  const grown = growLeft(cur, REVEAL_CHUNK_BARS + 100);
  const act = decideCommit(cur, grown, true, false, null);
  assert.equal(act.kind, "park");
  if (act.kind === "park") assert.equal(act.reveal, true);
});

test("structural changes (shrink / head moved / right growth) commit", () => {
  const cur = bars(10);
  assert.equal(decideCommit(cur, bars(5), true, false, null).kind, "commit");
  const headMoved = bars(10, 1_700_000_100); // different first time
  assert.equal(decideCommit(cur, headMoved, true, false, null).kind, "commit");
  // right-side growth (prepend) with frozen is a structural commit
  const right = bars(12);
  assert.equal(decideCommit(cur, right, true, false, null).kind, "commit");
  // fresh series (drawn empty)
  assert.equal(decideCommit([], bars(10), true, false, null).kind, "commit");
});
