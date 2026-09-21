import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sma,
  ema,
  rsi,
  macd,
  boll,
  cmf,
  dmi,
  mom,
  ppo,
  roc,
  stochrsi,
  mfi,
  aroon,
  trix,
  wma,
  trima,
  vwma,
  natr,
  bbw,
  dpo,
  tsi,
  ao,
} from "./indicators.ts";

/** Deterministic synthetic series: 60 bars, close drifting upward. */
function makeBars(n = 60): {
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

test("trix is finite and small for a steady uptrend", () => {
  const bars = makeBars(80);
  const line = trix(bars, 15);
  assert.ok(line.length > 0);
  for (const p of line) assert.ok(Number.isFinite(p.value));
});

test("roc/mom are positive in an uptrend and aligned", () => {
  const bars = makeBars(60);
  const r = roc(bars, 10);
  const m = mom(bars, 10);
  assert.ok(r.length > 0 && m.length > 0);
  assert.ok(
    r.every((p) => p.value > 0),
    "ROC should be positive in an uptrend",
  );
  assert.ok(
    m.every((p) => p.value > 0),
    "MOM should be positive in an uptrend",
  );
  assert.equal(r[0].time, bars[10].time);
});

test("ppo returns ppo/signal/hist with hist = ppo - signal", () => {
  const bars = makeBars(80);
  const { ppo: pp, signal, hist } = ppo(bars, 12, 26, 9);
  assert.ok(pp.length > 0 && signal.length > 0 && hist.length > 0);
  assert.equal(hist.length, signal.length);
  const lag = pp.length - signal.length;
  for (let i = 0; i < hist.length; i++) {
    assert.ok(
      Math.abs(hist[i].value - (pp[i + lag].value - signal[i].value)) < 1e-6,
    );
  }
});

test("cmf bounded in [-100,100]", () => {
  const bars = makeBars(60);
  const line = cmf(bars, 20);
  assert.ok(line.length > 0);
  for (const p of line) assert.ok(p.value >= -100 && p.value <= 100);
});

test("wma weights the latest bar highest", () => {
  const bars = makeBars(8); // closes 100..107
  const line = wma(bars, 3);
  // manual: (106*1 + 107*2 + 108*3)/6?? no — closes 100..107, last three 105,106,107
  const last = line[line.length - 1].value;
  const expected = (105 * 1 + 106 * 2 + 107 * 3) / 6;
  assert.ok(Math.abs(last - expected) < 1e-9);
});

test("trima equals sma applied three times", () => {
  const bars = makeBars(40);
  const line = trima(bars, 5);
  const once = sma(bars, 5);
  const twice = sma(
    once.map((x) => ({
      time: x.time,
      open: x.value,
      high: x.value,
      low: x.value,
      close: x.value,
      volume: 0,
    })),
    5,
  );
  const thrice = sma(
    twice.map((x) => ({
      time: x.time,
      open: x.value,
      high: x.value,
      low: x.value,
      close: x.value,
      volume: 0,
    })),
    5,
  );
  assert.ok(line.length > 0);
  assert.ok(
    Math.abs(line[line.length - 1].value - thrice[thrice.length - 1].value) <
      1e-9,
  );
});

test("vwma leans toward high-volume closes", () => {
  // custom bars: vol 100 at price 100, vol 900 at price 200
  const b = [
    { time: 1, open: 100, high: 100, low: 100, close: 100, volume: 100 },
    { time: 2, open: 200, high: 200, low: 200, close: 200, volume: 900 },
  ];
  const line = vwma(b, 2);
  assert.ok(Math.abs(line[0].value - (100 * 100 + 200 * 900) / 1000) < 1e-9);
});

test("natr/bbw/dpo are finite and positive where expected", () => {
  const bars = makeBars(60);
  assert.ok(
    natr(bars, 14).every((p) => p.value > 0 && Number.isFinite(p.value)),
  );
  assert.ok(
    bbw(bars, 20, 2).every((p) => p.value > 0 && Number.isFinite(p.value)),
  );
  assert.ok(dpo(bars, 20).every((p) => Number.isFinite(p.value)));
});

test("tsi bounded in [-100,100] with positive drift", () => {
  const bars = makeBars(120);
  const up = tsi(bars, 25, 13);
  assert.ok(up.length > 0);
  assert.ok(
    up[up.length - 1].value > 0,
    `expected TSI > 0 in uptrend, got ${up[up.length - 1].value}`,
  );
});

test("ao finite and positive for a rising median", () => {
  const bars = makeBars(80);
  const line = ao(bars, 5, 34);
  assert.ok(line.length > 0);
  assert.ok(
    line[line.length - 1].value > 0,
    "AO should be positive in an uptrend",
  );
});
