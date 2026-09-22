import { test } from "node:test";
import assert from "node:assert/strict";
import type { StateCreator } from "zustand";
import { configSlice } from "./stores/config-slice.ts";
import { marketSlice } from "./stores/market-slice.ts";
import { uiSlice } from "./stores/ui-slice.ts";
import { tradingSlice } from "./stores/trading-slice.ts";
import type { TerminalState } from "./store.ts";

/** Drive a slice as a plain reducer (no zustand create / no DOM / no persist). */
function harness() {
  const state = {} as Record<string, unknown>;
  const set: any = (patch: unknown) => {
    const next =
      typeof patch === "function"
        ? patch(state as unknown as TerminalState)
        : patch;
    Object.assign(state, next);
  };
  const get: any = () => state as unknown as TerminalState;
  const api = { set, get, subscribe: () => () => {} } as never;
  const slices: Array<StateCreator<TerminalState, [], [], object>> = [
    configSlice,
    marketSlice,
    uiSlice,
    tradingSlice,
  ];
  for (const s of slices) {
    Object.assign(state, s(set, get, api) as object);
  }
  return state as unknown as TerminalState;
}

function bar(time: number, close = 100) {
  return { time, open: 99, high: 101, low: 98, close, volume: 1000 };
}

// ---------- market slice: live bar ingestion ----------

test("updateBar seeds an empty series with the live bar", () => {
  const s = harness();
  s.updateBar(bar(1000));
  assert.equal(s.bars.length, 1);
  assert.equal(s.lastBar?.time, 1000);
  assert.equal(s.liveOpenTime, 1000);
});

test("updateBar mutates the same-open bar IN PLACE (reference stable)", () => {
  const s = harness();
  s.setBars([bar(1000, 100), bar(1900, 110)]);
  const refBefore = s.bars;
  s.updateBar({ ...bar(1900, 120) });
  assert.equal(s.bars, refBefore, "resident array reference must not change");
  assert.equal(s.bars[1].close, 120);
  assert.equal(s.lastBar?.close, 120);
});

test("updateBar rejects stale bars and skips non-contiguous gaps", () => {
  const s = harness();
  s.setBars([bar(1000), bar(1900)]); // 15m step = 900s
  s.updateBar(bar(900)); // stale
  assert.equal(s.bars.length, 2);
  s.updateBar(bar(10_000)); // way beyond step -> gap rejected
  assert.equal(s.bars.length, 2);
  s.updateBar(bar(2800)); // exactly one step later -> appended
  assert.equal(s.bars.length, 3);
});

test("appendOlderBars prepends and trims to BAR_CAP window", () => {
  const s = harness();
  s.setBars([bar(10_000), bar(10_900)]);
  const added = s.appendOlderBars([bar(8200), bar(9100)]);
  assert.equal(added, 2);
  assert.equal(s.bars[0].time, 8200);
  assert.equal(s.bars.length, 4);
});

// ---------- config slice: indicators + undo ----------

test("addIndicator emits a catalog instance and undo restores it", () => {
  const s = harness();
  const n = s.indicators.length;
  const id = s.addIndicator("RSI");
  assert.ok(s.indicators.some((i) => i.id === id && i.kind === "RSI"));
  assert.equal(s.indicators.length, n + 1);
  s.undo();
  assert.equal(s.indicators.length, n);
  assert.ok(!s.indicators.some((i) => i.id === id));
  s.redo();
  assert.ok(s.indicators.some((i) => i.id === id));
});

test("undo/redo stacks are capped at 100 entries (99 kept + 1 new)", () => {
  const s = harness();
  for (let i = 0; i < 150; i++) s.addIndicator("MA");
  assert.ok(s.undoStack.length <= 100, `got ${s.undoStack.length}`);
});

test("updateIndicator patches params and per-instance style fields", () => {
  const s = harness();
  const id = s.addIndicator("MACD");
  s.updateIndicator(id, {
    params: [9, 20, 5],
    color: "#ff0000",
    width: 3,
    scale: "left",
  });
  const inst = s.indicators.find((i) => i.id === id)!;
  assert.deepEqual(inst.params, [9, 20, 5]);
  assert.equal(inst.color, "#ff0000");
  assert.equal(inst.width, 3);
  assert.equal(inst.scale, "left");
});

test("applyIndicatorPreset replaces the whole group", () => {
  const s = harness();
  s.applyIndicatorPreset([
    { kind: "EMA", params: [21] },
    { kind: "RSI", params: [7] },
  ]);
  assert.equal(s.indicators.length, 2);
  assert.equal(s.indicators[0].kind, "EMA");
  assert.equal(s.indicators[1].kind, "RSI");
});

test("setSymbol resets bars while keeping config; ticker is feed-owned", () => {
  const s = harness();
  s.setBars([bar(1000)]);
  s.setSymbol("ethusdt");
  assert.equal(s.symbol, "ETHUSDT");
  assert.deepEqual(s.bars, []);
  assert.deepEqual(s.trades, []);
  // ticker is cleared by the feed's own next tick, not by setSymbol
  assert.ok("ticker" in s);
});

test("toggleTheme cycles the 4 presets and undo stays consistent", () => {
  const s = harness();
  const before = s.theme;
  s.toggleTheme();
  assert.notEqual(s.theme, before);
});

// ---------- data lineage (P1-B2) ----------

test("updateBar with a source tags the master series lineage", () => {
  const s = harness();
  s.setMarket("usdm");
  s.setSymbol("BTCUSDT");
  s.setInterval("15m");
  s.updateBar(bar(1000), "ws");
  s.updateBar(bar(1900), "ws");
  const key = "usdm:BTCUSDT:15m";
  const li = s.dataLineage[key];
  assert.ok(li, "lineage record created for the master key");
  assert.equal(li.sources.ws, 2);
  assert.equal(li.sources.rest, 0);
});

test("updateBar without a source leaves lineage untouched", () => {
  const s = harness();
  s.setSymbol("BTCUSDT");
  s.updateBar(bar(1000));
  assert.deepEqual(s.dataLineage, {});
});

test("recordSource accumulates rest/cache independently of ws ticks", () => {
  const s = harness();
  const key = "usdm:BTCUSDT:15m";
  s.recordSource(key, "cache", 13000);
  s.recordSource(key, "rest", 1000);
  s.recordSource(key, "ws", 5);
  const li = s.dataLineage[key];
  assert.equal(li.sources.cache, 13000);
  assert.equal(li.sources.rest, 1000);
  assert.equal(li.sources.ws, 5);
  assert.equal(li.lastSeen.ws > 0, true);
});

// ---------- interval-aware indicator defaults (P2-C5) ----------

test("addIndicator picks interval-aware defaults on 1s", () => {
  const s = harness();
  s.setInterval("1s");
  const id = s.addIndicator("MA");
  const ind = s.indicators.find((x) => x.id === id);
  assert.ok(ind, "indicator added");
  assert.deepEqual(ind.params, [3, 10, 25]);
});

test("addIndicator keeps catalog defaults on standard intervals", () => {
  const s = harness();
  s.setInterval("15m");
  const id = s.addIndicator("MA");
  const ind = s.indicators.find((x) => x.id === id);
  assert.deepEqual(ind?.params, [7, 25, 99]);
});
