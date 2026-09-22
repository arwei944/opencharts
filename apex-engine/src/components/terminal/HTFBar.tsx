import { useEffect, useRef, useState } from "react";
import { fetchKlines } from "@/lib/market/api";
import { DOWN, INTERVALS, UP } from "@/lib/market/constants";
import { higherIntervals, overlapRange } from "@/lib/market/htf";
import { useTerminal } from "@/lib/market/store";
import type { Candle, Interval, Market } from "@/lib/market/types";

const HTF_BARS = 60;
const BAR_W = 6;
const BAR_GAP = 2;
const CHART_H = 26;
const SEGMENT_W = HTF_BARS * (BAR_W + BAR_GAP) + 12;

interface HTFBarProps {
  symbol: string;
  market: Market;
  interval: Interval;
  /** Visible time range of the master chart (sec) — highlighted on the bars. */
  viewFrom?: number | null;
  viewTo?: number | null;
}

/**
 * Higher-timeframe context bar (TradingView-style): a thin strip above the
 * main chart showing the last ~60 candles of each coarser interval, with the
 * master chart's visible window highlighted. Clicking a segment switches the
 * main interval. Data is fetched independently (lightweight) — it never
 * touches the resident series or its window budget.
 */
export function HTFBar({
  symbol,
  market,
  interval,
  viewFrom,
  viewTo,
}: HTFBarProps) {
  const [barsBy, setBarsBy] = useState<Record<string, Candle[]>>({});
  const fetchGen = useRef(0);

  useEffect(() => {
    const tfs = higherIntervals(interval);
    const gen = ++fetchGen.current;
    let alive = true;
    setBarsBy({});
    Promise.all(
      tfs.map((tf) =>
        fetchKlines({
          data: {
            symbol,
            interval: tf,
            market,
            limit: HTF_BARS,
          },
        })
          .then((bars) => ({ tf, bars }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (!alive || gen !== fetchGen.current) return;
      const next: Record<string, Candle[]> = {};
      for (const r of results) {
        if (r && r.bars.length) next[r.tf] = r.bars;
      }
      setBarsBy(next);
    });
    return () => {
      alive = false;
    };
  }, [symbol, market, interval]);

  const tfs = higherIntervals(interval);
  if (!tfs.length) return null;

  const labelOf = (tf: Interval) =>
    INTERVALS.find((x) => x.id === tf)?.label ?? tf;

  return (
    <div
      className="flex h-8 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border/60 bg-elevated/40 px-1 py-0.5"
      data-testid="htf-bar"
    >
      {tfs.map((tf) => {
        const bars = barsBy[tf];
        const max = bars?.length ? Math.max(...bars.map((b) => b.high)) : 0;
        const min = bars?.length ? Math.min(...bars.map((b) => b.low)) : 0;
        const span = Math.max(max - min, 1e-9);
        const y = (p: number) => 1 + ((max - p) / span) * (CHART_H - 2);
        const over =
          bars && viewFrom != null && viewTo != null
            ? overlapRange(bars, viewFrom, viewTo)
            : null;
        return (
          <button
            key={tf}
            type="button"
            aria-label={`更高周期 ${labelOf(tf)}`}
            title={`点击切换到 ${labelOf(tf)}`}
            className="group relative shrink-0 overflow-hidden rounded-sm border border-border/50 bg-bg/60 transition-colors hover:border-gold/60"
            style={{ width: SEGMENT_W }}
            onClick={() => useTerminal.getState().setInterval(tf)}
          >
            <span className="pointer-events-none absolute left-1 top-0 z-10 text-[9px] leading-3 text-muted group-hover:text-gold">
              {labelOf(tf)}
            </span>
            {bars && bars.length > 1 && (
              <svg
                width={SEGMENT_W}
                height={CHART_H}
                className="mt-3"
                aria-hidden="true"
              >
                {/* master view window highlight */}
                {over && (
                  <rect
                    x={8 + over.from * (BAR_W + BAR_GAP) - 1}
                    width={(over.to - over.from + 1) * (BAR_W + BAR_GAP) + 2}
                    y={0}
                    height={CHART_H}
                    fill="var(--gold, #f0b90b)"
                    opacity={0.18}
                    rx={1}
                  />
                )}
                {bars.map((b, i) => {
                  const up = b.close >= b.open;
                  const x = 8 + i * (BAR_W + BAR_GAP);
                  const bodyTop = y(Math.max(b.open, b.close));
                  const bodyH = Math.max(1, Math.abs(y(b.open) - y(b.close)));
                  const wickX = x + BAR_W / 2;
                  const color = up ? UP : DOWN;
                  return (
                    <g key={i}>
                      <line
                        x1={wickX}
                        y1={y(b.high)}
                        x2={wickX}
                        y2={y(b.low)}
                        stroke={color}
                        strokeWidth={1}
                      />
                      <rect
                        x={x}
                        y={bodyTop}
                        width={BAR_W}
                        height={bodyH}
                        fill={color}
                      />
                    </g>
                  );
                })}
              </svg>
            )}
            {!bars && (
              <div className="mt-3 h-full w-full animate-pulse rounded-sm bg-border/20" />
            )}
          </button>
        );
      })}
    </div>
  );
}
