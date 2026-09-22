import type { Candle } from "./types.ts";
import { getIndicator } from "../plugins/registry.ts";
import {
  ao,
  aroon,
  atr,
  bbw,
  boll,
  cci,
  cmf,
  dmi,
  dpo,
  ema,
  heikinAshi,
  kdj,
  macd,
  mfi,
  mom,
  natr,
  obv,
  ppo,
  roc,
  rsi,
  sar,
  sma,
  stoch,
  stochrsi,
  supertrend,
  trima,
  trix,
  tsi,
  vwap,
  vwma,
  wma,
  wr,
} from "./indicators.ts";

/** A series to render: line on main/panel, or a histogram (MACD hist). */
export interface IndicatorSeriesSpec {
  key: string;
  color: string;
  pane?: number;
  type: "line" | "hist";
  data: Array<{ time: number; value: number; color?: string }>;
  /** Per-instance line width (px). */
  width?: number;
  /** Per-instance line style (lw-charts LineStyle: 0..3). */
  lineStyle?: number;
  /** Per-instance price-scale id for sub-pane lines. */
  scale?: string;
}

/** Per-instance presentation overrides carried through `computeIndicator`. */
export interface IndicatorStyleOpts {
  color?: string;
  width?: number;
  lineStyle?: number;
  scale?: string;
}

export interface CustomFn {
  (bars: Candle[]):
    | Array<{ time: number; value: number; color?: string }>
    | Array<{
        key: string;
        color: string;
        data: Array<{ time: number; value: number }>;
      }>;
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
  forcePane?: number,
  opts?: IndicatorStyleOpts,
): IndicatorSeriesSpec[] {
  const out: IndicatorSeriesSpec[] = [];
  // An explicit pane assignment (overlay main = 0, sub-pane = N) overrides the
  // automatic sub-pane counter for EVERY series this indicator emits (MACD's
  // hist+dif+dea all share the pane).
  const paneOf = (auto: number | undefined): number | undefined =>
    forcePane === undefined ? auto : forcePane === 0 ? undefined : forcePane;
  if (forcePane !== undefined) {
    sub.value = Math.max(sub.value, forcePane + 1);
  }
  // Per-instance presentation: user color wins over the catalog palette.
  const col = (auto: string) => opts?.color ?? auto;
  const line = (
    key: string,
    color: string,
    pane: number | undefined,
    data: Array<{ time: number; value: number }>,
  ) =>
    out.push({
      key,
      color: col(color),
      pane: paneOf(pane),
      type: "line",
      data,
      ...(opts?.width ? { width: opts.width } : {}),
      ...(opts?.lineStyle ? { lineStyle: opts.lineStyle } : {}),
      ...(opts?.scale ? { scale: opts.scale } : {}),
    });

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
    line(
      `${id}-sar`,
      "#f6465d",
      undefined,
      sar(bars, params[0] ?? 0.02, params[1] ?? 0.2),
    );
  } else if (kind === "VWAP") {
    line(`${id}-vwap`, "#fcd535", undefined, vwap(bars));
  } else if (kind === "SUPER") {
    const { up, dn } = supertrend(bars, params[0] ?? 10, params[1] ?? 3);
    line(`${id}-su`, "#0ecb81", undefined, up);
    line(`${id}-sd`, "#f6465d", undefined, dn);
  } else if (kind === "MACD") {
    const pane = sub.value++;
    const { dif, dea, hist } = macd(
      bars,
      params[0] ?? 12,
      params[1] ?? 26,
      params[2] ?? 9,
    );
    out.push({
      key: `${id}-hist`,
      color: "",
      pane: paneOf(pane),
      type: "hist",
      data: hist,
    });
    line(`${id}-dif`, "#f0b90b", pane, dif);
    line(`${id}-dea`, "#00d4ff", pane, dea);
  } else if (kind === "RSI") {
    line(`${id}-rsi`, "#f0b90b", sub.value++, rsi(bars, params[0] ?? 14));
  } else if (kind === "KDJ") {
    const pane = sub.value++;
    const { k, d, j } = kdj(
      bars,
      params[0] ?? 9,
      params[1] ?? 3,
      params[2] ?? 3,
    );
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
  } else if (kind === "DMI") {
    const pane = sub.value++;
    const { plus, minus, adx } = dmi(bars, params[0] ?? 14);
    line(`${id}-di`, "#0ecb81", pane, plus);
    line(`${id}-dm`, "#f6465d", pane, minus);
    line(`${id}-adx`, "#f0b90b", pane, adx);
  } else if (kind === "STOCHRSI") {
    const pane = sub.value++;
    const { k, d } = stochrsi(
      bars,
      params[0] ?? 14,
      params[1] ?? 14,
      params[2] ?? 3,
      params[3] ?? 3,
    );
    line(`${id}-srk`, "#f0b90b", pane, k);
    line(`${id}-srd`, "#00d4ff", pane, d);
  } else if (kind === "MFI") {
    line(`${id}-mfi`, "#f0b90b", sub.value++, mfi(bars, params[0] ?? 14));
  } else if (kind === "AROON") {
    const pane = sub.value++;
    const { up, dn } = aroon(bars, params[0] ?? 25);
    line(`${id}-au`, "#0ecb81", pane, up);
    line(`${id}-ad`, "#f6465d", pane, dn);
  } else if (kind === "TRIX") {
    line(`${id}-trix`, "#f0b90b", sub.value++, trix(bars, params[0] ?? 15));
  } else if (kind === "ROC") {
    line(`${id}-roc`, "#00d4ff", sub.value++, roc(bars, params[0] ?? 12));
  } else if (kind === "MOM") {
    line(`${id}-mom`, "#0ecb81", sub.value++, mom(bars, params[0] ?? 10));
  } else if (kind === "PPO") {
    const pane = sub.value++;
    const {
      ppo: pp,
      signal,
      hist,
    } = ppo(bars, params[0] ?? 12, params[1] ?? 26, params[2] ?? 9);
    out.push({
      key: `${id}-hist`,
      color: "",
      pane: paneOf(pane),
      type: "hist",
      data: hist,
    });
    line(`${id}-ppo`, "#f0b90b", pane, pp);
    line(`${id}-sig`, "#00d4ff", pane, signal);
  } else if (kind === "CMF") {
    line(`${id}-cmf`, "#f0b90b", sub.value++, cmf(bars, params[0] ?? 20));
  } else if (kind === "WMA") {
    const colors = ["#f0b90b", "#00d4ff"];
    params.forEach((p, i) => {
      line(`${id}-wma-${p}`, colors[i % 2], undefined, wma(bars, p));
    });
  } else if (kind === "TRIMA") {
    line(`${id}-trima`, "#0ecb81", undefined, trima(bars, params[0] ?? 20));
  } else if (kind === "VWMA") {
    line(`${id}-vwma`, "#c084fc", undefined, vwma(bars, params[0] ?? 20));
  } else if (kind === "NATR") {
    line(`${id}-natr`, "#f0b90b", sub.value++, natr(bars, params[0] ?? 14));
  } else if (kind === "BBW") {
    line(
      `${id}-bbw`,
      "#00d4ff",
      sub.value++,
      bbw(bars, params[0] ?? 20, params[1] ?? 2),
    );
  } else if (kind === "DPO") {
    line(`${id}-dpo`, "#f6465d", sub.value++, dpo(bars, params[0] ?? 20));
  } else if (kind === "TSI") {
    line(
      `${id}-tsi`,
      "#f0b90b",
      sub.value++,
      tsi(bars, params[0] ?? 25, params[1] ?? 13),
    );
  } else if (kind === "AO") {
    line(
      `${id}-ao`,
      "#0ecb81",
      sub.value++,
      ao(bars, params[0] ?? 5, params[1] ?? 34),
    );
  } else if (kind === "CUSTOM") {
    const fn = customFns[id];
    if (fn) {
      try {
        const res = fn(bars);
        // Multi-output (Pine scripts with several plot() calls): a spec array
        // whose first element carries a `key` renders one series per output.
        if (Array.isArray(res) && res[0] && "key" in res[0]) {
          // Multi-output Pine scripts share one dedicated sub-pane (like RSI /
          // MACD) — the same verified render path; a lone overlay series with
          // an extreme value range is what used to hang the canvas.
          const pane = sub.value++;
          for (const spec of res as Array<{
            key: string;
            color: string;
            data: Array<{ time: number; value: number }>;
          }>) {
            if (!spec.data.length) continue; // never render an empty line
            // Guard rails against lw-charts renderer limits on overlay-style
            // multi-series data:
            //  1) a constant series (max == min) collapses a lone scale;
            //  2) a discrete-jump signal line (adjacent |Δ| > half the range)
            //     with 0…1 / 0…100 values hangs the canvas renderer.
            // Smooth series (EMA/SMA-style) pass both checks and render fine.
            let mn = Infinity;
            let mx = -Infinity;
            for (const d of spec.data) {
              mn = Math.min(mn, d.value);
              mx = Math.max(mx, d.value);
            }
            if (mx - mn < 1e-9) continue;
            const range = mx - mn;
            let jumpy = false;
            for (let k = 1; k < spec.data.length; k++) {
              if (
                Math.abs(spec.data[k].value - spec.data[k - 1].value) >
                range * 0.5
              ) {
                jumpy = true;
                break;
              }
            }
            if (jumpy) continue;
            out.push({
              key: `${id}-${spec.key}`,
              color: spec.color,
              pane: paneOf(pane), // dedicated sub-pane
              type: "line",
              data: spec.data,
            });
          }
        } else {
          const single = res as Array<{
            time: number;
            value: number;
            color?: string;
          }>;
          // Same renderer guard as the multi-output path: constant or
          // discrete-jump series (0/1, 0/100 style) can hang the canvas.
          let mn = Infinity;
          let mx = -Infinity;
          for (const d of single) {
            mn = Math.min(mn, d.value);
            mx = Math.max(mx, d.value);
          }
          const range = mx - mn;
          if (range >= 1e-9) {
            let jumpy = false;
            for (let k = 1; k < single.length; k++) {
              if (
                Math.abs(single[k].value - single[k - 1].value) >
                range * 0.5
              ) {
                jumpy = true;
                break;
              }
            }
            if (!jumpy) {
              line(`${id}-custom`, "#00d4ff", undefined, single);
            }
          }
        }
      } catch {
        /* a broken script must never take the chart down */
      }
    }
  } else {
    // P2-A3: plugin-registered indicators dispatch here. A plugin kind never
    // matches the builtin chain above, so reaching this branch is unambiguous.
    const plugin = getIndicator(kind);
    if (plugin) {
      try {
        const res = plugin.compute(bars, params);
        if (!Array.isArray(res)) return out;
        // Same renderer guards as the CUSTOM single-output path: constant or
        // discrete-jump series can hang the lw-charts canvas renderer.
        let mn = Infinity;
        let mx = -Infinity;
        for (const d of res) {
          mn = Math.min(mn, d.value);
          mx = Math.max(mx, d.value);
        }
        const range = mx - mn;
        if (range >= 1e-9) {
          let jumpy = false;
          for (let k = 1; k < res.length; k++) {
            if (Math.abs(res[k].value - res[k - 1].value) > range * 0.5) {
              jumpy = true;
              break;
            }
          }
          if (!jumpy) {
            line(`${id}-plugin`, "#f0b90b", undefined, res);
          }
        }
      } catch {
        /* a broken plugin must never take the chart down */
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
