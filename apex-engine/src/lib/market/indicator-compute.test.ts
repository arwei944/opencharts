import { test } from "node:test";
import assert from "node:assert/strict";
import { computeIndicator } from "./indicator-compute.ts";

function bars(n = 60) {
  return Array.from({ length: n }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000,
  }));
}

const sub = { value: 1 };

test("MA emits one line per nonzero param", () => {
  const specs = computeIndicator("MA", "ma1", [7, 25, 99], bars(), {}, sub);
  assert.equal(specs.length, 3);
  assert.ok(specs.every((s) => s.type === "line" && s.pane === undefined));
  assert.equal(specs[0].key, "ma1-ma-7");
  assert.ok(specs[0].data.length > 0);
});

test("RSI goes to a fresh sub-pane and advances the pane counter", () => {
  const before = sub.value;
  const specs = computeIndicator("RSI", "r1", [14], bars(60), {}, sub);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].pane, before);
  assert.equal(sub.value, before + 1);
});

test("MACD emits histogram + dif + dea on a shared new pane", () => {
  const specs = computeIndicator("MACD", "m1", [12, 26, 9], bars(60), {}, sub);
  assert.equal(specs.length, 3);
  assert.ok(specs.some((s) => s.type === "hist" && s.key === "m1-hist"));
  assert.equal(specs.filter((s) => s.pane === specs[0].pane).length, 3);
});

test("SUPER is two lines (up/down)", () => {
  const specs = computeIndicator("SUPER", "s1", [10, 3], bars(60), {}, sub);
  assert.equal(specs.length, 2);
  assert.equal(specs[0].key, "s1-su");
  assert.equal(specs[1].key, "s1-sd");
});

test("CUSTOM uses the registered calculator; missing fn yields nothing", () => {
  const fn = (bs: ReturnType<typeof bars>) => bs.map((b) => ({ time: b.time, value: b.close * 2 }));
  const withFn = computeIndicator("CUSTOM", "c1", [], bars(5), { c1: fn }, sub);
  assert.equal(withFn.length, 1);
  assert.equal(withFn[0].data.length, 5);
  const noFn = computeIndicator("CUSTOM", "c1", [], bars(5), {}, sub);
  assert.equal(noFn.length, 0);
  // a throwing script is contained
  const boom = computeIndicator("CUSTOM", "c1", [], bars(5), { c1: () => { throw new Error("x"); } }, sub);
  assert.equal(boom.length, 0);
});

test("unknown kind yields nothing and does not consume panes", () => {
  const before = sub.value;
  const specs = computeIndicator("NOTHING", "x", [], bars(5), {}, sub);
  assert.equal(specs.length, 0);
  assert.equal(sub.value, before);
});