import {
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { computeIndicator, type CustomFn } from "./indicator-compute.ts";
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
import type { Candle, IndicatorInst } from "./types.ts";

type AnySeries = ISeriesApi<
  "Candlestick" | "Bar" | "Line" | "Area" | "Histogram"
>;

type Extra = {
  key: string;
  series: AnySeries;
};

function lastOf<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

/**
 * Indicator rendering pipeline (full-history jobs + per-tick tail refresh),
 * extracted from ChartEngine. Owns the extra-series registry that the engine's
 * commit pass reuses (same keys are re-setData'd, never recreated), so the
 * engine stays the single owner of bar commits while this class is the single
 * owner of indicator lines.
 */
export class IndicatorRenderer {
  private extras: Extra[] = [];

  constructor(
    private chart: IChartApi,
    private state: () => {
      bars: Candle[];
      indicators: IndicatorInst[];
      customFns: Record<string, CustomFn>;
    },
  ) {}

  private addExtra(key: string, series: AnySeries): AnySeries {
    this.extras.push({ key, series });
    return series;
  }

  private line(
    key: string,
    color: string,
    pane?: number,
    opts?: { width?: number; lineStyle?: number; scale?: string },
  ): AnySeries {
    const s = this.chart.addSeries(
      LineSeries,
      {
        color,
        lineWidth: Math.min(4, Math.max(1, opts?.width ?? 1)) as 1 | 2 | 3 | 4,
        lineStyle: (opts?.lineStyle ?? 0) as any,
        ...(opts?.scale ? { priceScaleId: opts.scale } : {}),
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      pane,
    );
    return this.addExtra(key, s);
  }

  private extra(key: string): Extra | undefined {
    return this.extras.find((e) => e.key === key);
  }

  /**
   * One closure per indicator, each of which computes its lines and does the
   * full-history `setData` in the SAME frame. They are handed to `queueRest` so
   * a 100k-bar reveal paints one series per frame instead of blocking the main
   * thread: previously all indicators were computed synchronously here (8 common
   * indicators on 105k bars ≈ 378ms main-thread block); now each indicator gets
   * one frame, so the batch cost is spread and the first candle is visible
   * immediately while indicator lines fade in progressively (TV-style).
   */
  jobs(): Array<() => void> {
    const { bars, indicators, customFns } = this.state();
    const jobs: Array<() => void> = [];
    if (!bars.length) return jobs;
    const sub = { value: 1 };
    for (const ind of indicators) {
      if (!ind.visible || ind.kind === "VOL") continue;
      jobs.push(() => {
        try {
          for (const spec of computeIndicator(
            ind.kind,
            ind.id,
            ind.params,
            bars,
            customFns,
            sub,
            ind.pane,
            {
              color: ind.color,
              width: ind.width,
              lineStyle: ind.style,
              scale: ind.scale,
            },
          )) {
            if (!spec.data.length) continue;
            // Reuse a series that already exists for this key: progressive
            // reveals re-run jobs while the panes/lines are still live, so
            // rebuilding them means dropping and recreating every pane per
            // commit. A broken script must never take the tab down.
            const existing = this.extra(spec.key);
            if (spec.type === "hist") {
              const h =
                existing?.series &&
                (existing.series as ISeriesApi<"Histogram">).applyOptions
                  ? (existing.series as ISeriesApi<"Histogram">)
                  : this.chart.addSeries(
                      HistogramSeries,
                      { priceLineVisible: false },
                      spec.pane,
                    );
              if (!existing) this.addExtra(spec.key, h as unknown as AnySeries);
              h.setData(
                spec.data.map((x) => ({
                  time: x.time as UTCTimestamp,
                  value: x.value,
                  color: x.color,
                })),
              );
            } else {
              const s =
                existing?.series &&
                (existing.series as ISeriesApi<"Line">).setData
                  ? (existing.series as ISeriesApi<"Line">)
                  : this.line(spec.key, spec.color, spec.pane, {
                      width: spec.width,
                      lineStyle: spec.lineStyle,
                      scale: spec.scale,
                    });
              s.setData(
                spec.data.map((x) => ({
                  time: x.time as UTCTimestamp,
                  value: x.value,
                })),
              );
            }
          }
        } catch {
          /* skip a broken indicator */
        }
      });
    }
    return jobs;
  }

  /** Drop every indicator series so a fresh commit pass can rebuild them. */
  reset(): void {
    for (const e of this.extras) this.chart.removeSeries(e.series);
    this.extras = [];
  }

  /** Tail value updates on live tick — one `series.update` per visible line. */
  applyTail(bars: Candle[]): void {
    if (!bars.length || !this.extras.length) return;
    const { indicators } = this.state();
    const push = (
      key: string,
      point?: { time: number; value: number; color?: string },
    ) => {
      if (!point) return;
      const e = this.extra(key);
      if (!e) return;
      e.series.update({
        time: point.time as UTCTimestamp,
        value: point.value,
        color: point.color,
      });
    };
    for (const ind of indicators) {
      if (!ind.visible || ind.kind === "VOL") continue;
      if (ind.kind === "MA") {
        ind.params.forEach(
          (p) => p && push(`${ind.id}-ma-${p}`, lastOf(sma(bars, p))),
        );
      } else if (ind.kind === "EMA") {
        ind.params.forEach((p) =>
          push(`${ind.id}-ema-${p}`, lastOf(ema(bars, p))),
        );
      } else if (ind.kind === "BOLL") {
        const { mid, upper, lower } = boll(
          bars,
          ind.params[0] ?? 20,
          ind.params[1] ?? 2,
        );
        push(`${ind.id}-mid`, lastOf(mid));
        push(`${ind.id}-up`, lastOf(upper));
        push(`${ind.id}-dn`, lastOf(lower));
      } else if (ind.kind === "SAR") {
        push(
          `${ind.id}-sar`,
          lastOf(sar(bars, ind.params[0] ?? 0.02, ind.params[1] ?? 0.2)),
        );
      } else if (ind.kind === "VWAP") {
        push(`${ind.id}-vwap`, lastOf(vwap(bars)));
      } else if (ind.kind === "SUPER") {
        const { up, dn } = supertrend(
          bars,
          ind.params[0] ?? 10,
          ind.params[1] ?? 3,
        );
        push(`${ind.id}-su`, lastOf(up));
        push(`${ind.id}-sd`, lastOf(dn));
      } else if (ind.kind === "MACD") {
        const { dif, dea, hist } = macd(
          bars,
          ind.params[0] ?? 12,
          ind.params[1] ?? 26,
          ind.params[2] ?? 9,
        );
        push(`${ind.id}-hist`, lastOf(hist));
        push(`${ind.id}-dif`, lastOf(dif));
        push(`${ind.id}-dea`, lastOf(dea));
      } else if (ind.kind === "RSI") {
        push(`${ind.id}-rsi`, lastOf(rsi(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "KDJ") {
        const { k, d, j } = kdj(
          bars,
          ind.params[0] ?? 9,
          ind.params[1] ?? 3,
          ind.params[2] ?? 3,
        );
        push(`${ind.id}-k`, lastOf(k));
        push(`${ind.id}-d`, lastOf(d));
        push(`${ind.id}-j`, lastOf(j));
      } else if (ind.kind === "STOCH") {
        const { k, d } = stoch(bars, ind.params[0] ?? 14, ind.params[1] ?? 3);
        push(`${ind.id}-sk`, lastOf(k));
        push(`${ind.id}-sd`, lastOf(d));
      } else if (ind.kind === "WR") {
        push(`${ind.id}-wr`, lastOf(wr(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "CCI") {
        push(`${ind.id}-cci`, lastOf(cci(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "OBV") {
        push(`${ind.id}-obv`, lastOf(obv(bars)));
      } else if (ind.kind === "ATR") {
        push(`${ind.id}-atr`, lastOf(atr(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "DMI") {
        const { plus, minus, adx } = dmi(bars, ind.params[0] ?? 14);
        push(`${ind.id}-di`, lastOf(plus));
        push(`${ind.id}-dm`, lastOf(minus));
        push(`${ind.id}-adx`, lastOf(adx));
      } else if (ind.kind === "STOCHRSI") {
        const { k, d } = stochrsi(
          bars,
          ind.params[0] ?? 14,
          ind.params[1] ?? 14,
          ind.params[2] ?? 3,
          ind.params[3] ?? 3,
        );
        push(`${ind.id}-srk`, lastOf(k));
        push(`${ind.id}-srd`, lastOf(d));
      } else if (ind.kind === "MFI") {
        push(`${ind.id}-mfi`, lastOf(mfi(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "AROON") {
        const { up, dn } = aroon(bars, ind.params[0] ?? 25);
        push(`${ind.id}-au`, lastOf(up));
        push(`${ind.id}-ad`, lastOf(dn));
      } else if (ind.kind === "TRIX") {
        push(`${ind.id}-trix`, lastOf(trix(bars, ind.params[0] ?? 15)));
      } else if (ind.kind === "ROC") {
        push(`${ind.id}-roc`, lastOf(roc(bars, ind.params[0] ?? 12)));
      } else if (ind.kind === "MOM") {
        push(`${ind.id}-mom`, lastOf(mom(bars, ind.params[0] ?? 10)));
      } else if (ind.kind === "PPO") {
        const {
          ppo: pp,
          signal,
          hist,
        } = ppo(
          bars,
          ind.params[0] ?? 12,
          ind.params[1] ?? 26,
          ind.params[2] ?? 9,
        );
        push(`${ind.id}-hist`, lastOf(hist));
        push(`${ind.id}-ppo`, lastOf(pp));
        push(`${ind.id}-sig`, lastOf(signal));
      } else if (ind.kind === "CMF") {
        push(`${ind.id}-cmf`, lastOf(cmf(bars, ind.params[0] ?? 20)));
      } else if (ind.kind === "WMA") {
        ind.params.forEach((p) =>
          push(`${ind.id}-wma-${p}`, lastOf(wma(bars, p))),
        );
      } else if (ind.kind === "TRIMA") {
        push(`${ind.id}-trima`, lastOf(trima(bars, ind.params[0] ?? 20)));
      } else if (ind.kind === "VWMA") {
        push(`${ind.id}-vwma`, lastOf(vwma(bars, ind.params[0] ?? 20)));
      } else if (ind.kind === "NATR") {
        push(`${ind.id}-natr`, lastOf(natr(bars, ind.params[0] ?? 14)));
      } else if (ind.kind === "BBW") {
        push(
          `${ind.id}-bbw`,
          lastOf(bbw(bars, ind.params[0] ?? 20, ind.params[1] ?? 2)),
        );
      } else if (ind.kind === "DPO") {
        push(`${ind.id}-dpo`, lastOf(dpo(bars, ind.params[0] ?? 20)));
      } else if (ind.kind === "TSI") {
        push(
          `${ind.id}-tsi`,
          lastOf(tsi(bars, ind.params[0] ?? 25, ind.params[1] ?? 13)),
        );
      } else if (ind.kind === "AO") {
        push(
          `${ind.id}-ao`,
          lastOf(ao(bars, ind.params[0] ?? 5, ind.params[1] ?? 34)),
        );
      }
    }
  }
}

// Re-exported so the Heikin-Ashi source path used by the engine stays reachable
// from this module without touching the indicator list.
export { heikinAshi };
