import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKline } from "./kline-parser.ts";
import { horizonOf } from "./horizon.ts";
import { encodeBars, decodeBars } from "./kline-cache.ts";
import type { KlineCacheRecord } from "./kline-cache.ts";
import type { Interval, Market } from "./types.ts";

// ---------- kline-parser ----------

test("parseKline decodes a Binance combined-stream kline payload", () => {
  const raw = {
    k: {
      t: 1700000123000,
      o: "100.5",
      h: "105",
      l: "99",
      c: "103.25",
      v: "1234.5",
      x: false,
    },
  };
  const bar = parseKline(raw);
  assert.ok(bar);
  assert.equal(bar.time, 1700000123); // ms -> s
  assert.equal(bar.open, 100.5);
  assert.equal(bar.high, 105);
  assert.equal(bar.low, 99);
  assert.equal(bar.close, 103.25);
  assert.equal(bar.volume, 1234.5);
  assert.equal(bar.closed, false);
});

test("parseKline accepts a bare event (no envelope) and marks closed", () => {
  const bar = parseKline({
    t: 1700000000000,
    o: 1,
    h: 2,
    l: 0.5,
    c: 1.5,
    v: 10,
    x: true,
  });
  assert.ok(bar);
  assert.equal(bar.time, 1700000000);
  assert.equal(bar.closed, true);
});

test("parseKline returns null for malformed payloads", () => {
  assert.equal(parseKline({}), null);
  assert.equal(parseKline({ k: {} }), null);
  assert.equal(parseKline(null as unknown as Record<string, unknown>), null);
});

// ---------- horizon ----------

test("horizonOf caps 1h at its bar budget (sinceMs=0 => count floor wins)", () => {
  const h = horizonOf("1h", 1_700_000_000);
  assert.equal(h.stepSec, 3600);
  assert.equal(h.targetBars, 90_000); // INTERVAL_HORIZON["1h"].bars
});

test("horizonOf 15m respects the 3-year window when it is shallower than the budget", () => {
  const nowSec = 1_800_000_000; // ~2027
  const h = horizonOf("15m", nowSec);
  assert.equal(h.stepSec, 900);
  // 3 years back from now, stepped in 15m increments
  const expected = Math.floor((3 * 365 * 24 * 3600) / 900) + 1;
  assert.ok(h.targetBars <= 105_000);
  assert.equal(h.targetBars, Math.max(1, Math.min(105_000, expected)));
  assert.ok(h.floorTime > 0);
});

test("horizonOf never returns zero target", () => {
  const h = horizonOf("1s", 1_700_000_000);
  assert.ok(h.targetBars >= 1);
  assert.equal(h.stepSec, 1);
});

// ---------- kline-cache encode/decode round trip ----------

test("encodeBars/decodeBars round-trips a series exactly", () => {
  const bars = Array.from({ length: 500 }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100.5 + i * 0.1,
    volume: 1000 + i * 3,
  }));
  const enc = encodeBars(bars);
  assert.equal(enc.count, 500);
  const rec: KlineCacheRecord = {
    key: "spot:BTCUSDT:1m",
    symbol: "BTCUSDT",
    market: "spot" as Market,
    interval: "1m" as Interval,
    stepSec: 60,
    fetchedAt: Date.now(),
    floorTime: bars[0].time,
    complete: true,
    ...enc,
  };
  const dec = decodeBars(rec);
  assert.equal(dec.length, 500);
  for (let i = 0; i < 500; i++) {
    assert.equal(dec[i].time, bars[i].time);
    assert.equal(dec[i].open, bars[i].open);
    assert.equal(dec[i].high, bars[i].high);
    assert.equal(dec[i].low, bars[i].low);
    assert.equal(dec[i].close, bars[i].close);
    assert.equal(dec[i].volume, bars[i].volume);
  }
});

test("decodeBars tolerates a truncated record (count > array length)", () => {
  const bars = Array.from({ length: 10 }, (_, i) => ({
    time: 1700000000 + i,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 10,
  }));
  const enc = encodeBars(bars);
  const rec: KlineCacheRecord = {
    key: "k",
    symbol: "S",
    market: "spot" as Market,
    interval: "1s" as Interval,
    stepSec: 1,
    fetchedAt: 0,
    floorTime: 0,
    complete: false,
    ...enc,
    count: 1000, // lies about length (overrides enc.count)
  };
  const dec = decodeBars(rec);
  assert.equal(dec.length, 10); // clamped to actual arrays
});