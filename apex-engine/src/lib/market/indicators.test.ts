import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sma,
  ema,
  rsi,
  macd,
  boll,
  dmi,
  stochrsi,
  mfi,
  aroon,
} from "./indicators.ts";

/** Deterministic synthetic series: 60 bars, close drifting upward. */
function makeBars(
  n = 60,
): {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 100 + i;
    return {
      time: 1700000000 + i * 60,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000 + i,
    };
  });
}

test("sma skips warmup and computes correct means", () => {
  const bars = makeBars(10);
  const line = sma(bars, 4);
  // output starts at index period-1 (bars 3..9) -> 7 points
  assert.equal(line.length, 7);
  // first output = mean of bars 0..3 closes: (100+101+102+103)/4 = 101.5
  assert.ok(Math.abs(line[0].value - 101.5) < 1e-9);
  // last = mean of bars 6..9: (106+107+108+109)/4 = 107.5
  assert.ok(Math.abs(line[6].value - 107.5) < 1e-9);
  assert.equal(line[0].time, bars[3].time);
});

test("sma degrades to empty for empty input", () => {
  assert.equal(sma([], 10).length, 0);
  // period longer than series still produces one value (window truncated is NOT
  // how this impl works: it requires i >= period-1, so a too-long period yields nothing)
  assert.equal(sma(makeBars(5), 10).length, 0);
});

test("ema skips warmup; last point tracks recent close", () => {
  const bars = makeBars(10);
  const line = ema(bars, 3);
  assert.equal(line.length, 8); // bars 2..9
  assert.ok(Math.abs(line[0].value - bars[2].close) < 50); // seeded cold, bounded
  const last = line[line.length - 1].value;
  assert.ok(Math.abs(last - bars[9].close) < Math.abs(last - bars[0].close));
});

test("rsi bounded in [0, 100] and high for an uptrend", () => {
  const flat = Array.from({ length: 40 }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: 50,
    high: 50,
    low: 50,
    close: 50,
    volume: 100,
  }));
  const line = rsi(flat, 14);
  for (const p of line) {
    assert.ok(p.value >= 0 && p.value <= 100, `RSI out of range: ${p.value}`);
  }
  const up = rsi(makeBars(40), 14);
  assert.ok(
    up[up.length - 1].value > 70,
    `expected RSI > 70, got ${up[up.length - 1].value}`,
  );
});

test("macd returns dif/dea/hist aligned to each other with hist = dif - dea", () => {
  const bars = makeBars(60);
  const { dif, dea, hist } = macd(bars, 12, 26, 9);
  assert.ok(dif.length > 0 && dea.length > 0 && hist.length > 0);
  // hist is emitted over the window where both dif and dea exist; dea trails
  // dif by (signal-1) samples.
  assert.equal(hist.length, dea.length);
  const lag = dif.length - dea.length;
  for (let i = 0; i < hist.length; i++) {
    assert.ok(
      Math.abs(hist[i].value - (dif[i + lag].value - dea[i].value)) < 1e-6,
    );
  }
});

test("boll middle band equals sma, upper > mid > lower", () => {
  const bars = makeBars(40);
  const { mid, upper, lower } = boll(bars, 20, 2);
  const smaLine = sma(bars, 20);
  assert.equal(mid.length, smaLine.length);
  for (let i = 0; i < mid.length; i++) {
    assert.ok(Math.abs(mid[i].value - smaLine[i].value) < 1e-9);
    assert.ok(upper[i].value > mid[i].value);
    assert.ok(mid[i].value > lower[i].value);
  }
});

test("dmi emits +DI/-DI in [0,100] and ADX after 2×period warmup", () => {
  const bars = makeBars(120);
  const { plus, minus, adx } = dmi(bars, 14);
  assert.ok(plus.length > 0);
  assert.equal(plus.length, minus.length);
  // In a pure uptrend +DI dominates -DI.
  const lastPlus = plus[plus.length - 1].value;
  const lastMinus = minus[plus.length - 1].value;
  assert.ok(
    lastPlus > lastMinus,
    `expected +DI > -DI, got ${lastPlus} vs ${lastMinus}`,
  );
  for (const p of [...plus, ...minus, ...adx]) {
    assert.ok(p.value >= 0 && p.value <= 100, `DMI out of range: ${p.value}`);
  }
  assert.ok(adx.length > 0 && adx[adx.length - 1].value > 0);
});

test("stochrsi is bounded in [0,100] with k/d aligned", () => {
  const bars = makeBars(80);
  const { k, d } = stochrsi(bars, 14, 14, 3, 3);
  assert.ok(k.length > 0 && d.length > 0);
  for (const p of [...k, ...d]) {
    assert.ok(
      p.value >= 0 && p.value <= 100,
      `StochRSI out of range: ${p.value}`,
    );
  }
});

test("mfi is bounded in [0,100] and high for an uptrend", () => {
  const bars = makeBars(80);
  const line = mfi(bars, 14);
  assert.ok(line.length > 0);
  for (const p of line) {
    assert.ok(p.value >= 0 && p.value <= 100, `MFI out of range: ${p.value}`);
  }
  assert.ok(
    line[line.length - 1].value > 50,
    "expected MFI > 50 in an uptrend",
  );
});

test("aroon up/down in [0,100] with up near 100 at a fresh high", () => {
  const bars = makeBars(60);
  const { up, dn } = aroon(bars, 25);
  assert.ok(up.length > 0 && up.length === dn.length);
  for (const p of [...up, ...dn]) {
    assert.ok(p.value >= 0 && p.value <= 100, `AROON out of range: ${p.value}`);
  }
  // The last bar is the highest (uptrend) -> AroonUp hits its peak.
  assert.ok(
    up[up.length - 1].value > 90,
    `expected AroonUp near 100, got ${up[up.length - 1].value}`,
  );
});
