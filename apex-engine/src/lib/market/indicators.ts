import type { Candle } from "./types";

type Line = { time: number; value: number }[];

export function sma(bars: Candle[], period: number, field: keyof Candle = "close"): Line {
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
  const fake = dif.map((d) => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value, volume: 0 }));
  const dea = ema(fake, signal);
  const deaMap = new Map(dea.map((x) => [x.time, x.value]));
  const hist: { time: number; value: number; color?: string }[] = [];
  for (const d of dif) {
    const s = deaMap.get(d.time);
    if (s == null) continue;
    const h = d.value - s;
    hist.push({ time: d.time, value: h, color: h >= 0 ? "#0ecb8188" : "#f6465d88" });
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
    raw.push({ time: bars[i].time, value: hh === ll ? 50 : ((bars[i].close - ll) / (hh - ll)) * 100 });
  }
  const d = sma(
    raw.map((x) => ({ time: x.time, open: x.value, high: x.value, low: x.value, close: x.value, volume: 0 })),
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
    out.push({ time: bars[i].time, value: hh === ll ? 0 : ((hh - bars[i].close) / (hh - ll)) * -100 });
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
    for (let j = 0; j < period; j++) md += Math.abs(tp[i - period + 1 + j] - ma);
    md /= period;
    out.push({ time: bars[i].time, value: md === 0 ? 0 : (tp[i] - ma) / (0.015 * md) });
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

export function heikinAshi(bars: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < bars.length; i++) {
    const c = (bars[i].open + bars[i].high + bars[i].low + bars[i].close) / 4;
    const o = i === 0 ? (bars[i].open + bars[i].close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
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
