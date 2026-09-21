import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { equitySeries, performance } from "./perf.ts";
import type { Fill } from "./paper.ts";

function fill(
  side: "buy" | "sell",
  market: "spot" | "usdm",
  price: number,
  qty: number,
  i: number,
  symbol = "BTCUSDT",
): Fill {
  return {
    id: `f${i}`,
    time: 1700000000 + i * 60,
    orderId: `o${i}`,
    symbol,
    side,
    price,
    qty,
    market,
  } as Fill;
}

describe("perf.equitySeries", () => {
  it("starts at the initial capital and records each fill", () => {
    const fills = [
      fill("buy", "spot", 100, 1, 0),
      fill("sell", "spot", 110, 1, 1),
    ];
    const pts = equitySeries(fills, 10_000);
    assert.equal(pts.length, 3);
    assert.equal(pts[0].equity, 10_000);
    assert.equal(pts[2].equity, 10_010); // +10 profit
  });

  it("tracks usdm closed-leg PnL only (opens are cost basis)", () => {
    const fills = [
      fill("buy", "usdm", 100, 1, 0),
      fill("buy", "usdm", 100, 1, 1),
      fill("sell", "usdm", 120, 1, 2), // closes 1 of 2 @ avg 100 -> +20
    ];
    const pts = equitySeries(fills, 10_000);
    assert.equal(pts[2].equity, 10_000); // open/add: no change
    assert.equal(pts[3].equity, 10_020);
  });

  it("handles a losing close", () => {
    const fills = [
      fill("buy", "usdm", 100, 1, 0),
      fill("sell", "usdm", 90, 1, 1),
    ];
    const pts = equitySeries(fills, 10_000);
    assert.equal(pts[2].equity, 9_990);
  });
});

describe("perf.performance", () => {
  it("counts wins and win-rate on closed legs", () => {
    const fills = [
      fill("buy", "usdm", 100, 1, 0),
      fill("sell", "usdm", 120, 1, 1), // win
      fill("buy", "usdm", 50, 1, 2),
      fill("sell", "usdm", 40, 1, 3), // loss
    ];
    const s = performance(fills, 10_000);
    assert.equal(s.trades, 2);
    assert.equal(s.wins, 1);
    assert.equal(s.winRate, 50);
    assert.ok(Math.abs(s.pnl - 10) < 1e-9);
    assert.ok(Math.abs(s.grossProfit - 20) < 1e-9);
    assert.ok(Math.abs(s.grossLoss - 10) < 1e-9);
  });

  it("reports max drawdown of the equity series", () => {
    const fills = [
      fill("buy", "usdm", 100, 10, 0),
      fill("sell", "usdm", 99, 10, 1), // -10 -> equity 9990
      fill("buy", "usdm", 99, 10, 2),
      fill("sell", "usdm", 105, 10, 3), // +60 -> equity 10050
    ];
    const s = performance(fills, 10_000);
    assert.ok(Math.abs(s.maxDrawdown - 10) < 1e-9);
    assert.ok(s.pnl > 0);
  });

  it("returns zeroed stats for an empty stream", () => {
    const s = performance([], 10_000);
    assert.equal(s.trades, 0);
    assert.equal(s.winRate, 0);
    assert.equal(s.pnl, 0);
    assert.equal(s.maxDrawdown, 0);
  });
});
