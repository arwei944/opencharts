import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCandles,
  aggregateToInterval,
  lastAggregated,
} from "./aggregate.ts";
import type { Candle } from "./types.ts";

const bar = (
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): Candle => ({ time, open, high, low, close, volume });

test("aggregate: groups by step boundary with OHLCV rollup", () => {
  // stepSec 120 (2m): 1-minute bars at 0..240
  const bars = [
    bar(0, 10, 12, 9, 11, 100),
    bar(60, 11, 15, 10, 14, 200),
    bar(120, 14, 16, 13, 15, 300),
    bar(180, 15, 20, 14, 19, 400),
    bar(240, 19, 21, 18, 20, 500),
  ];
  const out = aggregateCandles(bars, 120);
  assert.equal(out.length, 3);
  // group [0,60]: open=first open, high=max, low=min, close=last close, vol=sum
  assert.deepEqual(out[0], {
    time: 0,
    open: 10,
    high: 15,
    low: 9,
    close: 14,
    volume: 300,
    closed: true,
  });
  assert.deepEqual(out[1], {
    time: 120,
    open: 14,
    high: 20,
    low: 13,
    close: 19,
    volume: 700,
    closed: true,
  });
  // last group is still forming
  assert.equal(out[2].closed, false);
  assert.equal(out[2].volume, 500);
});

test("aggregate: empty and single-bar series", () => {
  assert.deepEqual(aggregateCandles([], 60), []);
  const one = aggregateCandles([bar(100, 1, 2, 0.5, 1.5, 7)], 60);
  assert.equal(one.length, 1);
  assert.equal(one[0].time, 60); // floor(100/60)*60
  assert.equal(one[0].closed, false);
});

test("aggregateToInterval: 15m → 1h derivation", () => {
  const bars = [0, 900, 1800, 2700, 3600].map((t, i) =>
    bar(t, i, i + 1, i - 1, i + 0.5, 10),
  );
  const out = aggregateToInterval(bars, "1h"); // stepSec 3600
  assert.equal(out.length, 2);
  assert.equal(out[0].time, 0);
  assert.equal(out[0].volume, 40); // 4 bars of 15m in the 0h candle
  assert.equal(out[0].closed, true);
  assert.equal(out[1].time, 3600);
  assert.equal(out[1].closed, false);
});

test("aggregate: bars not aligned to the boundary still roll up correctly", () => {
  const bars = [123456, 124356, 125256].map((t, i) =>
    bar(t, 10 + i, 11 + i, 9 + i, 10.5 + i, 5),
  );
  const out = aggregateCandles(bars, 3600);
  // 123456 → key 34 (34*3600=122400), 124356 → key 34, 125256 → key 34
  assert.equal(out.length, 1);
  assert.equal(out[0].time, 122400);
  assert.equal(out[0].open, 10);
  assert.equal(out[0].close, 12.5);
  assert.equal(out[0].high, 13);
  assert.equal(out[0].low, 9);
  assert.equal(out[0].volume, 15);
});

test("lastAggregated: returns the live tail group only", () => {
  const bars = [
    bar(0, 10, 12, 9, 11, 100),
    bar(60, 11, 15, 10, 14, 200),
    bar(120, 14, 16, 13, 15, 300),
    bar(180, 15, 20, 14, 19, 400),
  ];
  const last = lastAggregated(bars, 120);
  assert.ok(last);
  assert.equal(last.time, 120);
  assert.equal(last.open, 14);
  assert.equal(last.high, 20);
  assert.equal(last.low, 13);
  assert.equal(last.close, 19);
  assert.equal(last.volume, 700);
  assert.equal(lastAggregated([], 120), null);
});
