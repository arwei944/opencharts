import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterByRange, toCsv, toJson } from "./export-data.ts";
import type { Candle } from "./types.ts";

function bars(n = 10, start = 1700000000, step = 60): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * step,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 1000 + i,
  }));
}

describe("export-data.filterByRange", () => {
  it("keeps everything when no range given", () => {
    assert.equal(filterByRange(bars(), {}).length, 10);
  });
  it("slices by absolute from/to", () => {
    const out = filterByRange(bars(), {
      from: 1700000060,
      to: 1700000120,
    });
    assert.equal(out.length, 2);
    assert.equal(out[0].time, 1700000060);
  });
  it("understands negative offsets as 'recent N seconds'", () => {
    // Bars built relative to *now* so a negative offset makes sense.
    const now = Date.now() / 1000;
    // ~5 hours of minute bars ending just before now.
    const recent = bars(300, Math.floor(now) - 300 * 60, 60);
    const out = filterByRange(recent, { from: -120 * 60 }); // last 2h
    assert.ok(out.length > 0 && out.length <= 200);
    assert.ok(out.every((b) => b.time >= now - 120 * 60));
  });
  it("swaps inverted range inputs", () => {
    const out = filterByRange(bars(), { from: 1700000120, to: 1700000060 });
    assert.equal(out.length, 2);
  });
  it("returns empty when nothing matches", () => {
    assert.equal(filterByRange(bars(), { from: 1, to: 2 }).length, 0);
  });
});

describe("export-data.toCsv", () => {
  it("emits a header row and one row per bar with ISO time", () => {
    const csv = toCsv(bars(2));
    const lines = csv.trim().split("\n");
    assert.equal(lines[0], "time,open,high,low,close,volume");
    assert.equal(lines.length, 3);
    assert.ok(lines[1].includes("2023-11-14T"));
    assert.ok(lines[1].endsWith(",1000"));
  });
  it("handles empty input with just the header", () => {
    assert.equal(toCsv([]).trim(), "time,open,high,low,close,volume");
  });
});

describe("export-data.toJson", () => {
  it("serializes each bar with time/iso/ohlcv", () => {
    const data = JSON.parse(toJson(bars(2))) as Record<string, unknown>[];
    assert.equal(data.length, 2);
    assert.equal(data[0].time, 1700000000);
    assert.ok(typeof data[0].iso === "string");
    assert.equal(data[0].close, 101);
  });
});
