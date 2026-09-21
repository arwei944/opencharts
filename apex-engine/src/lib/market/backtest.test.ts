import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backtest, runStrategy, backtestFromSeries } from "./backtest.ts";
import type { Candle } from "./types.ts";

function bars(closes: number[], step = 60): Candle[] {
  return closes.map((c, i) => ({
    time: 1700000000 + i * step,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 1000,
  }));
}

describe("backtest.backtest", () => {
  it("realizes a long trade across a rising series", () => {
    // always long, prices 100 -> 120: one trade, +20
    const r = backtest(bars([100, 110, 120]), [1, 1, 1], 10_000);
    assert.equal(r.trades.length, 1);
    assert.ok(Math.abs(r.pnl - 20) < 1e-9);
    assert.equal(r.winRate, 100);
  });

  it("profits on a short across a falling series", () => {
    const r = backtest(bars([120, 110, 100]), [-1, -1, -1], 10_000);
    assert.ok(Math.abs(r.pnl - 20) < 1e-9);
  });

  it("stays flat and makes nothing without signals", () => {
    const r = backtest(bars([100, 110, 120]), [0, 0, 0], 10_000);
    assert.equal(r.trades.length, 0);
    assert.equal(r.pnl, 0);
  });

  it("tracks drawdown on a losing streak", () => {
    const r = backtest(bars([100, 90, 80]), [1, 1, 1], 10_000);
    assert.ok(r.pnl < 0);
    assert.ok(Math.abs(r.maxDrawdown - 20) < 1e-9);
  });
});

describe("backtest.runStrategy", () => {
  it("smaCross goes long in an uptrend and makes money", () => {
    // strongly trending up: fast SMA stays above slow after warmup
    const up = Array.from({ length: 120 }, (_, i) => 100 + i);
    const r = runStrategy("smaCross", bars(up), [10, 30], 10_000);
    assert.ok(r.pnl > 0, `expected profit, got ${r.pnl}`);
    assert.ok(r.equity.length >= 2);
  });

  it("rsiReversal is bounded and reports sane stats", () => {
    const r = runStrategy(
      "rsiReversal",
      bars(Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 5) * 10)),
      [14, 70, 30],
    );
    assert.ok(r.bars === 200);
    assert.ok(Number.isFinite(r.sharpe));
    assert.ok(r.winRate >= 0 && r.winRate <= 100);
  });

  it("handles empty/short series without crashing", () => {
    const r = runStrategy("smaCross", bars([100]), [10, 30]);
    assert.equal(r.trades.length, 0);
    assert.equal(r.pnl, 0);
  });

  it("backtestFromSeries maps signal sign to position and profits on longs", () => {
    const b = bars([100, 110, 120]);
    const signal = b.map((x) => ({ time: x.time, value: 1 })); // always long
    const r = backtestFromSeries(b, signal, 10_000);
    assert.ok(Math.abs(r.pnl - 20) < 1e-9);
  });

  it("backtestFromSeries treats zero as flat and negative as short", () => {
    const b = bars([120, 110, 100]);
    const signal = b.map((x, i) => ({ time: x.time, value: i === 0 ? 0 : -1 }));
    const r = backtestFromSeries(b, signal, 10_000);
    assert.ok(Math.abs(r.pnl - 10) < 1e-9); // short from 110 -> 100
  });
});
