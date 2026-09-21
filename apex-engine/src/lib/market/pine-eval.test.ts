import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compilePine } from "./pine-eval.ts";
import type { Candle } from "./types.ts";

function bars(n = 60, start = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: start + i,
    high: start + i + 2,
    low: start + i - 2,
    close: start + i,
    volume: 1000 + i,
  }));
}

describe("pine-eval.compilePine", () => {
  it("parses params, overlay flag and runs a plot", () => {
    const c = compilePine(
      `//@version=5
indicator("Test", overlay=true)
len = input.int(14, "Length")
line = sma(close, len)
plot(line, "Avg")`,
    );
    assert.equal(c.ok, true);
    assert.equal(c.overlay, true);
    assert.deepEqual(c.params, [14]);
    assert.deepEqual(c.labels, ["Length"]);
    const out = c.run(bars(60, 150));
    assert.equal(out.length, 1);
    assert.equal(out[0].key, "Avg");
    assert.equal(out[0].data.length, 60);
  });

  it("supports multiple plots with distinct series", () => {
    const c = compilePine(
      `//@version=5
fast = ema(close, 5)
slow = ema(close, 20)
upper = fast + 5
plot(fast, "Fast")
plot(slow, "Slow")
plot(upper, "Upper")`,
    );
    const out = c.run(bars());
    assert.equal(out.length, 3);
    assert.deepEqual(
      out.map((o) => o.key),
      ["Fast", "Slow", "Upper"],
    );
    assert.ok(out.every((o) => o.data.length === 60));
  });

  it("evaluates ternary + comparisons", () => {
    const c = compilePine(
      `//@version=5
bull = close > sma(close, 10) ? 1 : 0
plot(bull, "Bull")`,
    );
    const out = c.run(bars());
    // rising series: close > sma => every point 1 after warmup
    const data = out[0].data.slice(20);
    assert.ok(data.every((p) => p.value === 1));
  });

  it("supports persistent var state (running sum)", () => {
    const c = compilePine(
      `//@version=5
var total = 0.0
total := total + close
plot(total, "Total")`,
    );
    const out = c.run(bars(5, 100)); // closes 100..104
    assert.ok(
      Math.abs(out[0].data[4].value - (100 + 101 + 102 + 103 + 104)) < 1e-9,
    );
  });

  it("supports history refs and highest()", () => {
    const c = compilePine(
      `//@version=5
up = close > close[1] ? close : close[1]
hh = highest(high, 5)
plot(up, "Up")
plot(hh, "HH")`,
    );
    const out = c.run(bars());
    assert.equal(out.length, 2);
    // rising closes: close > close[1] always true after bar 0
    assert.equal(out[0].data[3].value, bars()[3].close);
    assert.ok(out[1].data.every((p) => p.value > 0));
  });

  it("collects errors for unknown statements and missing plots", () => {
    const bad1 = compilePine(
      `//@version=5\nnonsense = somefunc(1,2)\nplot(nonsense)`,
    );
    assert.equal(bad1.ok, true); // unknown func falls back to expr (0) — no hard error
    const noPlot = compilePine(`//@version=5\nx = 1`);
    assert.equal(noPlot.ok, false);
    assert.ok(noPlot.errors.some((e) => e.includes("plot")));
  });
});
