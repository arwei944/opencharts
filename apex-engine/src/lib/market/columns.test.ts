import { test } from "node:test";
import assert from "node:assert/strict";
import { barsOf, cloneCols, colsOf, concatCols, trimCols } from "./columns.ts";
import type { CandleColumns } from "./columns.ts";

function bars(
  n: number,
  start = 1_700_000_000,
  step = 60,
): import("./types.ts").Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * step,
    open: 100 + i * 0.5,
    high: 102 + i * 0.5,
    low: 99 + i * 0.5,
    close: 101 + i * 0.5,
    volume: 1000 + i * 10,
  }));
}

test("colsOf/barsOf round-trips exactly", () => {
  const b = bars(120);
  const cols = colsOf(b);
  assert.equal(cols.count, 120);
  const back = barsOf(cols);
  assert.deepEqual(back, b);
});

test("barsOf respects an explicit count cap", () => {
  const cols = colsOf(bars(50));
  const head = barsOf(cols, 10);
  assert.equal(head.length, 10);
  assert.deepEqual(head, bars(50).slice(0, 10));
});

test("colsOf handles empty input", () => {
  const cols = colsOf([]);
  assert.equal(cols.count, 0);
  assert.equal(cols.times.length, 0);
  assert.deepEqual(barsOf(cols), []);
});

test("concatCols prepends new rows at the front, preserving order", () => {
  const old = bars(10);
  const added = bars(5, 1_700_000_000 - 5 * 60, 60); // 5 older bars
  const merged = concatCols(colsOf(added), colsOf(old));
  assert.equal(merged.count, 15);
  const back = barsOf(merged);
  assert.equal(back[0].time, added[0].time);
  assert.equal(back[4].time, added[4].time);
  assert.equal(back[5].time, old[0].time);
  assert.deepEqual(back.slice(5), old); // old tail untouched
});

test("concatCols with empty left/right is a no-op copy", () => {
  const l = colsOf([]);
  const r = colsOf(bars(3));
  assert.equal(concatCols(l, r).count, 3);
  assert.equal(concatCols(r, l).count, 3);
});

test("trimCols keeps only the newest cap rows", () => {
  const cols = colsOf(bars(100));
  const t = trimCols(cols, 10);
  assert.equal(t.count, 10);
  assert.deepEqual(barsOf(t), bars(100).slice(-10));
});

test("trimCols no-ops when already within cap", () => {
  const cols = colsOf(bars(4));
  assert.equal(trimCols(cols, 10), cols); // same reference, no copy
});

test("cloneCols copies arrays so mutation of one leaves the other intact", () => {
  const cols = colsOf(bars(3));
  const c2: CandleColumns = cloneCols(cols);
  c2.closes[0] = 999;
  assert.notEqual(cols.closes[0], 999);
  assert.equal(c2.closes[0], 999);
  assert.equal(c2.times.length, 3);
});
