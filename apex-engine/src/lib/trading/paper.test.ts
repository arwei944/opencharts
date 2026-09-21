import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { usePaper } from "./paper.ts";

function reset() {
  usePaper.setState({ risk: {} });
  usePaper.getState().reset();
}

beforeEach(reset);

describe("paper risk limits", () => {
  it("rejects orders above maxQty with a message", () => {
    usePaper.getState().setRisk({ maxQty: 2 });
    const err = usePaper.getState().place({
      symbol: "BTCUSDT",
      market: "spot",
      side: "buy",
      type: "limit",
      price: 100,
      qty: 5,
    });
    assert.ok(typeof err === "string" && err.includes("最大下单数量"));
    assert.equal(usePaper.getState().orders.length, 0);
  });

  it("rejects orders above maxNotional", () => {
    usePaper.getState().setRisk({ maxNotional: 500 });
    const err = usePaper.getState().place({
      symbol: "BTCUSDT",
      market: "spot",
      side: "buy",
      type: "limit",
      price: 200,
      qty: 3, // notional 600 > 500
    });
    assert.ok(typeof err === "string" && err.includes("单笔下单额度"));
  });

  it("allows orders within the limits", () => {
    usePaper.getState().setRisk({ maxQty: 10, maxNotional: 5000 });
    const err = usePaper.getState().place({
      symbol: "BTCUSDT",
      market: "spot",
      side: "buy",
      type: "limit",
      price: 100,
      qty: 2, // notional 200
    });
    assert.equal(err, null);
    assert.equal(usePaper.getState().orders.length, 1);
  });

  it("has no risk limits by default", () => {
    // 100 × 50 = 5000 USDT notional, well within the 10k paper balance.
    const err = usePaper.getState().place({
      symbol: "BTCUSDT",
      market: "spot",
      side: "buy",
      type: "limit",
      price: 100,
      qty: 50,
    });
    assert.equal(err, null);
  });
});
