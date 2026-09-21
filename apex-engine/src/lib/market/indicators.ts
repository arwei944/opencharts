import type { Candle } from "./types";

type Line = { time: number; value: number }[];

export function sma(
  bars: Candle[],
  period: number,
  field: keyof Candle = "close",
): Line {
  const out: Line = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += Number(bars[i][field]);
    if (i >= period) sum -= Number(bars[i - period][field]);
    if (i >= period - 1) out.push({ time: bars[i].time, value: sum / period });
  }
  return out;
}

export function ema(bars: Candle[], period: number): Line {
  const k = 2 / (period + 1);
  const out: Line = [];
  let prev = bars[0]?.close ?? 0;
  for (let i = 0; i < bars.length; i++) {
    prev = i === 0 ? bars[i].close : bars[i].close * k + prev * (1 - k);
    if (i >= period - 1) out.push({ time: bars[i].time, value: prev });
  }
  return out;
}

export function boll(bars: Candle[], period: number, mult: number) {
  const mid = sma(bars, period);
  const upper: Line = [];
  const lower: Line = [];
  for (let i = period - 1; i < bars.length; i++) {
    let v = 0;
    const m = mid[i - (period - 1)].value;
    for (let j = 0; j < period; j++) {
      const d = bars[i - period + 1 + j].close - m;
      v += d * d;
    }
    const sd = Math.sqrt(v / period);
    upper.push({ time: bars[i].time, value: m + mult * sd });
    lower.push({ time: bars[i].time, value: m - mult * sd });
  }
  return { mid, upper, lower };
}

export function macd(bars: Candle[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(bars, fast);
  const es = ema(bars, slow);
  const map = new Map(es.map((x) => [x.time, x.value]));
  const dif: Line = [];
  for (const a of ef) {
    const b = map.get(a.time);
    if (b != null) dif.push({ time: a.time, value: a.value - b });
  }
  const fake = dif.map((d) => ({
    time: d.time,
    open: d.value,
    high: d.value,
    low: d.value,
    close: d.value,
    volume: 0,
  }));
  const dea = ema(fake, signal);
  const deaMap = new Map(dea.map((x) => [x.time, x.value]));
  const hist: { time: number; value: number; color?: string }[] = [];
  for (const d of dif) {
    const s = deaMap.get(d.time);
    if (s == null) continue;
    const h = d.value - s;
    hist.push({
      time: d.time,
      value: h,
      color: h >= 0 ? "#0ecb8188" : "#f6465d88",
    });
  }
  return { dif, dea, hist };
}

export function rsi(bars: Candle[], period = 14): Line {
  const out: Line = [];
  let ag = 0;
  let al = 0;
  for (let i = 1; i < bars.length; i++) {
    const ch = bars[i].close - bars[i - 1].close;
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= period) {
      ag += g;
      al += l;
      if (i === period) {
        ag /= period;
        al /= period;
        const rs = al === 0 ? 100 : ag / al;
        out.push({ time: bars[i].time, value: 100 - 100 / (1 + rs) });
      }
    } else {
      ag = (ag * (period - 1) + g) / period;
      al = (al * (period - 1) + l) / period;
      const rs = al === 0 ? 100 : ag / al;
      out.push({ time: bars[i].time, value: 100 - 100 / (1 + rs) });
    }
  }
  return out;
}

export function kdj(bars: Candle[], n = 9, m1 = 3, m2 = 3) {
  const k: Line = [];
  const d: Line = [];
  const j: Line = [];
  let pk = 50;
  let pd = 50;
  for (let i = 0; i < bars.length; i++) {
    const from = Math.max(0, i - n + 1);
    let hh = -Infinity;
    let ll = Infinity;
    for (let t = from; t <= i; t++) {
      hh = Math.max(hh, bars[t].high);
      ll = Math.min(ll, bars[t].low);
    }
    const rsv = hh === ll ? 50 : ((bars[i].close - ll) / (hh - ll)) * 100;
    pk = (pk * (m1 - 1) + rsv) / m1;
    pd = (pd * (m2 - 1) + pk) / m2;
    k.push({ time: bars[i].time, value: pk });
    d.push({ time: bars[i].time, value: pd });
    j.push({ time: bars[i].time, value: 3 * pk - 2 * pd });
  }
  return { k, d, j };
}

export function stoch(bars: Candle[], kPeriod = 14, dPeriod = 3) {
  const raw: Line = [];
  for (let i = 0; i < bars.length; i++) {
    const from = Math.max(0, i - kPeriod + 1);
    let hh = -Infinity;
    let ll = Infinity;
    for (let t = from; t <= i; t++) {
      hh = Math.max(hh, bars[t].high);
      ll = Math.min(ll, bars[t].low);
    }
    raw.push({
      time: bars[i].time,
      value: hh === ll ? 50 : ((bars[i].close - ll) / (hh - ll)) * 100,
    });
  }
  const d = sma(
    raw.map((x) => ({
      time: x.time,
      open: x.value,
      high: x.value,
      low: x.value,
      close: x.value,
      volume: 0,
    })),
    dPeriod,
  );
  return { k: raw, d };
}

export function wr(bars: Candle[], period = 14): Line {
  const out: Line = [];
  for (let i = 0; i < bars.length; i++) {
    const from = Math.max(0, i - period + 1);
    let hh = -Infinity;
    let ll = Infinity;
    for (let t = from; t <= i; t++) {
      hh = Math.max(hh, bars[t].high);
      ll = Math.min(ll, bars[t].low);
    }
    out.push({
      time: bars[i].time,
      value: hh === ll ? 0 : ((hh - bars[i].close) / (hh - ll)) * -100,
    });
  }
  return out;
}

export function cci(bars: Candle[], period = 14): Line {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const out: Line = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += tp[i - period + 1 + j];
    const ma = sum / period;
    let md = 0;
    for (let j = 0; j < period; j++)
      md += Math.abs(tp[i - period + 1 + j] - ma);
    md /= period;
    out.push({
      time: bars[i].time,
      value: md === 0 ? 0 : (tp[i] - ma) / (0.015 * md),
    });
  }
  return out;
}

export function obv(bars: Candle[]): Line {
  const out: Line = [];
  let v = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) v = bars[i].volume;
    else if (bars[i].close > bars[i - 1].close) v += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) v -= bars[i].volume;
    out.push({ time: bars[i].time, value: v });
  }
  return out;
}

export function atr(bars: Candle[], period = 14): Line {
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) trs.push(bars[i].high - bars[i].low);
    else {
      trs.push(
        Math.max(
          bars[i].high - bars[i].low,
          Math.abs(bars[i].high - bars[i - 1].close),
          Math.abs(bars[i].low - bars[i - 1].close),
        ),
      );
    }
  }
  const out: Line = [];
  let a = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i < period) {
      a += trs[i];
      if (i === period - 1) {
        a /= period;
        out.push({ time: bars[i].time, value: a });
      }
    } else {
      a = (a * (period - 1) + trs[i]) / period;
      out.push({ time: bars[i].time, value: a });
    }
  }
  return out;
}

export function sar(bars: Candle[], step = 0.02, max = 0.2): Line {
  if (bars.length < 2) return [];
  const out: Line = [];
  let long = bars[1].close >= bars[0].close;
  let af = step;
  let ep = long ? bars[0].high : bars[0].low;
  let s = long ? bars[0].low : bars[0].high;
  for (let i = 1; i < bars.length; i++) {
    s = s + af * (ep - s);
    if (long) {
      if (bars[i].low < s) {
        long = false;
        s = ep;
        ep = bars[i].low;
        af = step;
      } else {
        if (bars[i].high > ep) {
          ep = bars[i].high;
          af = Math.min(max, af + step);
        }
      }
    } else {
      if (bars[i].high > s) {
        long = true;
        s = ep;
        ep = bars[i].high;
        af = step;
      } else {
        if (bars[i].low < ep) {
          ep = bars[i].low;
          af = Math.min(max, af + step);
        }
      }
    }
    out.push({ time: bars[i].time, value: s });
  }
  return out;
}

export function vwap(bars: Candle[]): Line {
  const out: Line = [];
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    vol += b.volume;
    out.push({ time: b.time, value: vol === 0 ? b.close : pv / vol });
  }
  return out;
}

export function supertrend(bars: Candle[], period = 10, mult = 3) {
  const a = atr(bars, period);
  const aMap = new Map(a.map((x) => [x.time, x.value]));
  const up: Line = [];
  const dn: Line = [];
  let trend = 1;
  let fu = 0;
  let fd = 0;
  for (let i = 0; i < bars.length; i++) {
    const at = aMap.get(bars[i].time);
    if (at == null) continue;
    const hl = (bars[i].high + bars[i].low) / 2;
    let bu = hl + mult * at;
    let bl = hl - mult * at;
    if (i > 0) {
      bl = bl > fu || bars[i - 1].close < fu ? bl : fu;
      bu = bu < fd || bars[i - 1].close > fd ? bu : fd;
    }
    fu = bl;
    fd = bu;
    if (i > 0) {
      if (trend === 1 && bars[i].close < bl) trend = -1;
      else if (trend === -1 && bars[i].close > bu) trend = 1;
    }
    if (trend === 1) up.push({ time: bars[i].time, value: bl });
    else dn.push({ time: bars[i].time, value: bu });
  }
  return { up, dn };
}

function trOf(b: Candle, prev: Candle): number {
  return Math.max(
    b.high - b.low,
    Math.abs(b.high - prev.close),
    Math.abs(b.low - prev.close),
  );
}

function dmOf(b: Candle, prev: Candle): { p: number; m: number } {
  const up = b.high - prev.high;
  const dn = prev.low - b.low;
  if (up > dn && up > 0) return { p: up, m: 0 };
  if (dn > up && dn > 0) return { p: 0, m: dn };
  return { p: 0, m: 0 };
}

/** DMI (+DI/-DI) with Wilder's ADX, all in the 0..100 oscillator band. */
export function dmi(bars: Candle[], period = 14) {
  const plus: Line = [];
  const minus: Line = [];
  const adx: Line = [];
  const n = bars.length;
  if (n < period + 1) return { plus, minus, adx };
  let tr = 0;
  let pdm = 0;
  let ndm = 0;
  for (let i = 1; i <= period; i++) {
    tr += trOf(bars[i], bars[i - 1]);
    const { p, m } = dmOf(bars[i], bars[i - 1]);
    pdm += p;
    ndm += m;
  }
  const dxOf = (p: number, m: number) =>
    p + m === 0 ? 0 : (Math.abs(p - m) / (p + m)) * 100;
  let dxSum = dxOf((pdm / tr) * 100, (ndm / tr) * 100);
  plus.push({ time: bars[period].time, value: (pdm / tr) * 100 });
  minus.push({ time: bars[period].time, value: (ndm / tr) * 100 });
  let adxv = 0;
  for (let i = period + 1; i < n; i++) {
    const t = trOf(bars[i], bars[i - 1]);
    const { p, m } = dmOf(bars[i], bars[i - 1]);
    tr = tr - tr / period + t;
    pdm = pdm - pdm / period + p;
    ndm = ndm - ndm / period + m;
    const pi = (pdm / tr) * 100;
    const mi = (ndm / tr) * 100;
    plus.push({ time: bars[i].time, value: pi });
    minus.push({ time: bars[i].time, value: mi });
    const dx = dxOf(pi, mi);
    if (i < period * 2) {
      // First ADX = simple average of the first `period` DX values.
      dxSum += dx;
      if (i === period * 2 - 1) {
        adxv = dxSum / period;
        adx.push({ time: bars[i].time, value: adxv });
      }
    } else {
      adxv = (adxv * (period - 1) + dx) / period;
      adx.push({ time: bars[i].time, value: adxv });
    }
  }
  return { plus, minus, adx };
}

/** Stochastic of RSI — the classic overbought/oversold refinement. */
export function stochrsi(
  bars: Candle[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3,
) {
  const r = rsi(bars, rsiPeriod);
  const raw: Line = [];
  for (let i = 0; i < r.length; i++) {
    const from = Math.max(0, i - stochPeriod + 1);
    let hh = -Infinity;
    let ll = Infinity;
    for (let t = from; t <= i; t++) {
      hh = Math.max(hh, r[t].value);
      ll = Math.min(ll, r[t].value);
    }
    raw.push({
      time: r[i].time,
      value: hh === ll ? 50 : ((r[i].value - ll) / (hh - ll)) * 100,
    });
  }
  const toCandles = (l: Line) =>
    l.map((x) => ({
      time: x.time,
      open: x.value,
      high: x.value,
      low: x.value,
      close: x.value,
      volume: 0,
    }));
  const k = sma(toCandles(raw), kSmooth);
  const d = sma(toCandles(k), dSmooth);
  return { k, d };
}

/** Money Flow Index — volume-weighted RSI analogue. */
export function mfi(bars: Candle[], period = 14): Line {
  const out: Line = [];
  let pos = 0;
  let neg = 0;
  for (let i = 1; i < bars.length; i++) {
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const ptp = (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3;
    const mf = tp * bars[i].volume;
    if (tp > ptp) pos += mf;
    else if (tp < ptp) neg += mf;
    if (i >= period) {
      const old = i - period + 1;
      const otp = (bars[old].high + bars[old].low + bars[old].close) / 3;
      const potp =
        (bars[old - 1].high + bars[old - 1].low + bars[old - 1].close) / 3;
      const omf = otp * bars[old].volume;
      if (otp > potp) pos -= omf;
      else if (otp < potp) neg -= omf;
      const ratio = neg === 0 ? 100 : pos / neg;
      out.push({ time: bars[i].time, value: 100 - 100 / (1 + ratio) });
    }
  }
  return out;
}

/** Aroon up/down — trend age within a lookback window. */
export function aroon(bars: Candle[], period = 25) {
  const up: Line = [];
  const dn: Line = [];
  for (let i = 0; i < bars.length; i++) {
    const from = Math.max(0, i - period);
    let hh = -Infinity;
    let ll = Infinity;
    let hi = from;
    let li = from;
    for (let t = from; t <= i; t++) {
      if (bars[t].high > hh) {
        hh = bars[t].high;
        hi = t;
      }
      if (bars[t].low < ll) {
        ll = bars[t].low;
        li = t;
      }
    }
    if (i >= period) {
      up.push({
        time: bars[i].time,
        value: ((period - (i - hi)) / period) * 100,
      });
      dn.push({
        time: bars[i].time,
        value: ((period - (i - li)) / period) * 100,
      });
    }
  }
  return { up, dn };
}

/** Heikin-Ashi candles derived from raw OHLC. */
function toCandles(l: Line): Candle[] {
  return l.map((x) => ({
    time: x.time,
    open: x.value,
    high: x.value,
    low: x.value,
    close: x.value,
    volume: 0,
  }));
}

/** Triple-smoothed EMA rate of change (×10000, TradingView convention). */
export function trix(bars: Candle[], period = 15): Line {
  const e1 = ema(toCandles(ema(bars, period)), period);
  const e3 = ema(toCandles(e1), period);
  const v3 = new Map(e3.map((x) => [x.time, x.value]));
  const out: Line = [];
  let prev: number | null = null;
  for (const b of bars) {
    const v = v3.get(b.time);
    if (v == null) continue;
    if (prev != null) {
      out.push({
        time: b.time,
        value: prev === 0 ? 0 : ((v - prev) / prev) * 10000,
      });
    }
    prev = v;
  }
  return out;
}

/** Rate of change: (close - close[n]) / close[n] * 100. */
export function roc(bars: Candle[], period = 12): Line {
  const out: Line = [];
  for (let i = period; i < bars.length; i++) {
    const prev = bars[i - period].close;
    out.push({
      time: bars[i].time,
      value: prev === 0 ? 0 : ((bars[i].close - prev) / prev) * 100,
    });
  }
  return out;
}

/** Momentum: close - close[n]. */
export function mom(bars: Candle[], period = 10): Line {
  const out: Line = [];
  for (let i = period; i < bars.length; i++) {
    out.push({
      time: bars[i].time,
      value: bars[i].close - bars[i - period].close,
    });
  }
  return out;
}

/** PPO: (EMA(fast) - EMA(slow)) / EMA(slow) * 100, plus its signal. */
export function ppo(bars: Candle[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(bars, fast);
  const es = ema(bars, slow);
  const esMap = new Map(es.map((x) => [x.time, x.value]));
  const raw: Line = [];
  for (const a of ef) {
    const b = esMap.get(a.time);
    if (b == null || b === 0) continue;
    raw.push({ time: a.time, value: ((a.value - b) / b) * 100 });
  }
  const sig = ema(toCandles(raw), signal);
  const sigMap = new Map(sig.map((x) => [x.time, x.value]));
  const hist: { time: number; value: number; color?: string }[] = [];
  for (const r of raw) {
    const s = sigMap.get(r.time);
    if (s == null) continue;
    hist.push({
      time: r.time,
      value: r.value - s,
      color: r.value >= s ? "#0ecb8188" : "#f6465d88",
    });
  }
  return { ppo: raw, signal: sig, hist };
}

/** Chaikin Money Flow. */
export function cmf(bars: Candle[], period = 20): Line {
  const out: Line = [];
  let mfv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const hl = b.high - b.low;
    const m = hl === 0 ? 0 : (b.close - b.low - (b.high - b.close)) / hl;
    const rawMfv = m * b.volume;
    mfv += rawMfv;
    vol += b.volume;
    if (i >= period) {
      const ob = bars[i - period];
      const ohl = ob.high - ob.low;
      const om =
        ohl === 0 ? 0 : (ob.close - ob.low - (ob.high - ob.close)) / ohl;
      mfv -= om * ob.volume;
      vol -= ob.volume;
      out.push({ time: b.time, value: vol === 0 ? 0 : (mfv / vol) * 100 });
    }
  }
  return out;
}

/** Heikin-Ashi candles derived from raw OHLC. */
/** Linear-weighted moving average: most recent bar carries the highest weight. */
export function wma(bars: Candle[], period = 9): Line {
  const out: Line = [];
  const wsum = (period * (period + 1)) / 2;
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let k = 0; k < period; k++) {
      sum += bars[i - k].close * (period - k);
    }
    out.push({ time: bars[i].time, value: sum / wsum });
  }
  return out;
}

/** Triple moving average: sma(sma(sma(close))). */
export function trima(bars: Candle[], period = 20): Line {
  return sma(toCandles(sma(toCandles(sma(bars, period)), period)), period);
}

/** Volume-weighted moving average. */
export function vwma(bars: Candle[], period = 20): Line {
  const out: Line = [];
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    pv += bars[i].close * bars[i].volume;
    vol += bars[i].volume;
    if (i >= period) {
      pv -= bars[i - period].close * bars[i - period].volume;
      vol -= bars[i - period].volume;
    }
    if (i >= period - 1) {
      out.push({
        time: bars[i].time,
        value: vol === 0 ? bars[i].close : pv / vol,
      });
    }
  }
  return out;
}

/** Normalized ATR: ATR / close * 100. */
export function natr(bars: Candle[], period = 14): Line {
  const a = atr(bars, period);
  const closeMap = new Map(bars.map((b) => [b.time, b.close]));
  return a
    .map((x) => ({
      time: x.time,
      value: (x.value / (closeMap.get(x.time) ?? 1)) * 100,
    }))
    .filter((x) => Number.isFinite(x.value));
}

/** Bollinger Band Width: (upper - lower) / mid * 100. */
export function bbw(bars: Candle[], period = 20, mult = 2): Line {
  const { mid, upper, lower } = boll(bars, period, mult);
  const out: Line = [];
  for (let i = 0; i < mid.length; i++) {
    out.push({
      time: mid[i].time,
      value:
        mid[i].value === 0
          ? 0
          : ((upper[i].value - lower[i].value) / mid[i].value) * 100,
    });
  }
  return out;
}

/** Detrended Price Oscillator (approx): close - sma(close, N). */
export function dpo(bars: Candle[], period = 20): Line {
  const s = sma(bars, period);
  const sMap = new Map(s.map((x) => [x.time, x.value]));
  const out: Line = [];
  for (const b of bars) {
    const v = sMap.get(b.time);
    if (v == null) continue;
    out.push({ time: b.time, value: b.close - v });
  }
  return out;
}

/** True Strength Index. */
export function tsi(bars: Candle[], long = 25, short = 13): Line {
  const k1 = 2 / (long + 1);
  const k2 = 2 / (short + 1);
  const out: Line = [];
  let n1 = 0;
  let d1 = 0;
  let n2 = 0;
  let d2 = 0;
  for (let i = 1; i < bars.length; i++) {
    const m = bars[i].close - bars[i - 1].close;
    n1 += k1 * (m - n1);
    d1 += k1 * (Math.abs(m) - d1);
    n2 += k2 * (n1 - n2);
    d2 += k2 * (d1 - d2);
    if (i >= long + short - 1) {
      out.push({ time: bars[i].time, value: d2 === 0 ? 0 : (n2 / d2) * 100 });
    }
  }
  return out;
}

/** Awesome Oscillator: fast SMA of median price minus slow SMA. */
export function ao(bars: Candle[], short = 5, long = 34): Line {
  const med = (b: Candle) => (b.high + b.low) / 2;
  const fast = sma(
    bars.map((b) => ({
      ...b,
      open: med(b),
      high: med(b),
      low: med(b),
      close: med(b),
    })),
    short,
  );
  const slow = sma(
    bars.map((b) => ({
      ...b,
      open: med(b),
      high: med(b),
      low: med(b),
      close: med(b),
    })),
    long,
  );
  const slowMap = new Map(slow.map((x) => [x.time, x.value]));
  const out: Line = [];
  for (const f of fast) {
    const s = slowMap.get(f.time);
    if (s == null) continue;
    out.push({ time: f.time, value: f.value - s });
  }
  return out;
}

/** Heikin-Ashi candles derived from raw OHLC. */
export function heikinAshi(bars: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < bars.length; i++) {
    const c = (bars[i].open + bars[i].high + bars[i].low + bars[i].close) / 4;
    const o =
      i === 0
        ? (bars[i].open + bars[i].close) / 2
        : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({
      time: bars[i].time,
      open: o,
      close: c,
      high: Math.max(bars[i].high, o, c),
      low: Math.min(bars[i].low, o, c),
      volume: bars[i].volume,
    });
  }
  return out;
}
