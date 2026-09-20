import type { Candle } from "./types.ts";
import {
  atr,
  boll,
  cci,
  ema,
  heikinAshi,
  kdj,
  macd,
  obv,
  rsi,
  sar,
  sma,
  stoch,
  supertrend,
  vwap,
  wr,
} from "./indicators.ts";

/** A series to render: line on main/panel, or a histogram (MACD hist). */
export interface IndicatorSeriesSpec {
  key: string;
  color: string;
  pane?: number;
  type: "line" | "hist";
  data: Array<{ time: number; value: number; color?: string }>;
}

export interface CustomFn {
  (bars: Candle[]): Array<{ time: number; value: number; color?: string }>;
}

/**
 * Pure computation for one indicator instance: given bars, kind and params,
 * produce render specs. The chart engine only turns these into series.
 * Broken/custom calculators return [] instead of throwing.
 */
export function computeIndicator(
  kind: string,
  id: string,
  params: number[],
  bars: Candle[],
  customFns: Record<string, CustomFn>,
  sub: { value: number },
): IndicatorSeriesSpec[] {
  const out: IndicatorSeriesSpec[] = [];
  const line = (key: string, color: string, pane: number | undefined, data: Array<{ time: number; value: number }>) =>
    out.push({ key, color, pane, type: "line", data });

  if (kind === "MA") {
    const colors = ["#f0b90b", "#b7bdc6", "#00d4ff"];
    params.forEach((p, i) => {
      if (!p) return;
      line(`${id}-ma-${p}`, colors[i % 3], undefined, sma(bars, p));
    });
  } else if (kind === "EMA") {
    const colors = ["#f0b90b", "#00d4ff"];
    params.forEach((p, i) => {
      line(`${id}-ema-${p}`, colors[i % 2], undefined, ema(bars, p));
    });
  } else if (kind === "BOLL") {
    const { mid, upper, lower } = boll(bars, params[0] ?? 20, params[1] ?? 2);
    line(`${id}-mid`, "#f0b90b", undefined, mid);
    line(`${id}-up`, "#848e9c", undefined, upper);
    line(`${id}-dn`, "#848e9c", undefined, lower);
  } else if (kind === "SAR") {
    line(`${id}-sar`, "#f6465d", undefined, sar(bars, params[0] ?? 0.02, params[1] ?? 0.2));
  } else if (kind === "VWAP") {
    line(`${id}-vwap`, "#fcd535", undefined, vwap(bars));
  } else if (kind === "SUPER") {
    const { up, dn } = supertrend(bars, params[0] ?? 10, params[1] ?? 3);
    line(`${id}-su`, "#0ecb81", undefined, up);
    line(`${id}-sd`, "#f6465d", undefined, dn);
  } else if (kind === "MACD") {
    const pane = sub.value++;
    const { dif, dea, hist } = macd(bars, params[0] ?? 12, params[1] ?? 26, params[2] ?? 9);
    out.push({ key: `${id}-hist`, color: "", pane, type: "hist", data: hist });
    line(`${id}-dif`, "#f0b90b", pane, dif);
    line(`${id}-dea`, "#00d4ff", pane, dea);
  } else if (kind === "RSI") {
    line(`${id}-rsi`, "#f0b90b", sub.value++, rsi(bars, params[0] ?? 14));
  } else if (kind === "KDJ") {
    const pane = sub.value++;
    const { k, d, j } = kdj(bars, params[0] ?? 9, params[1] ?? 3, params[2] ?? 3);
    line(`${id}-k`, "#f0b90b", pane, k);
    line(`${id}-d`, "#00d4ff", pane, d);
    line(`${id}-j`, "#f6465d", pane, j);
  } else if (kind === "STOCH") {
    const pane = sub.value++;
    const { k, d } = stoch(bars, params[0] ?? 14, params[1] ?? 3);
    line(`${id}-sk`, "#f0b90b", pane, k);
    line(`${id}-sd`, "#00d4ff", pane, d);
  } else if (kind === "WR") {
    line(`${id}-wr`, "#00d4ff", sub.value++, wr(bars, params[0] ?? 14));
  } else if (kind === "CCI") {
    line(`${id}-cci`, "#f0b90b", sub.value++, cci(bars, params[0] ?? 14));
  } else if (kind === "OBV") {
    line(`${id}-obv`, "#b7bdc6", sub.value++, obv(bars));
  } else if (kind === "ATR") {
    line(`${id}-atr`, "#f0b90b", sub.value++, atr(bars, params[0] ?? 14));
  } else if (kind === "CUSTOM") {
    const fn = customFns[id];
    if (fn) {
      try {
        line(`${id}-custom`, "#00d4ff", undefined, fn(bars));
      } catch {
        /* a broken script must never take the chart down */
      }
    }
  }
  return out;
}

/** Last point of a Heikin-Ashi recompute over a growing tail (for live ticks). */
export function lastHeikinAshi(tail: Candle[]): Candle | undefined {
  const ha = heikinAshi(tail);
  return ha[ha.length - 1];
}