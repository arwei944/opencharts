import type { Candle } from "./types";
import { rsi, macd, sma } from "./indicators.ts";

/**
 * Minimal strategy backtester: a strategy is a per-bar desired position
 * (+1 long / -1 short / 0 flat); the engine switches positions at bar closes
 * and realizes PnL, then reports trades, equity curve, win rate, max drawdown
 * and an approximate Sharpe ratio (per-trade returns, not annualized).
 */

export interface BacktestTrade {
  entryIdx: number;
  exitIdx: number;
  side: 1 | -1;
  entryPx: number;
  exitPx: number;
  pnl: number; // per 1 unit of base asset
}

export interface BacktestResult {
  trades: BacktestTrade[];
  /** Cumulative realized equity, starting at `start`. */
  equity: number[];
  pnl: number;
  winRate: number; // 0..100
  maxDrawdown: number;
  sharpe: number; // mean/std of per-trade returns (approx)
  bars: number;
}

export function backtest(
  bars: Candle[],
  dirs: number[],
  start = 10_000,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  const equity = [start];
  let eq = start;
  let pos: 1 | -1 | 0 = 0;
  let entryIdx = 0;
  let entryPx = 0;

  const closeAt = (i: number, px: number) => {
    if (pos === 0) return;
    const pnl = pos === 1 ? px - entryPx : entryPx - px;
    trades.push({
      entryIdx,
      exitIdx: i,
      side: pos,
      entryPx,
      exitPx: px,
      pnl,
    });
    eq += pnl;
    equity.push(eq);
    pos = 0;
  };
  const openAt = (i: number, px: number, d: 1 | -1) => {
    pos = d;
    entryIdx = i;
    entryPx = px;
  };

  for (let i = 0; i < bars.length; i++) {
    const d = (dirs[i] ?? 0) as number;
    if (d === pos) continue;
    closeAt(i, bars[i].close);
    if (d !== 0) openAt(i, bars[i].close, d === 1 ? 1 : -1);
  }
  closeAt(bars.length - 1, bars[bars.length - 1].close);
  if (pos !== 0)
    eq +=
      pos === 1
        ? bars[bars.length - 1].close - entryPx
        : entryPx - bars[bars.length - 1].close;

  const wins = trades.filter((t) => t.pnl > 0).length;
  let peak = start;
  let maxDrawdown = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    maxDrawdown = Math.max(maxDrawdown, peak - e);
  }
  const rets = trades.map(
    (t) => t.pnl / (t.side === 1 ? t.entryPx : t.entryPx),
  );
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const std = rets.length
    ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length)
    : 0;

  return {
    trades,
    equity,
    pnl: eq - start,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    maxDrawdown,
    sharpe: std ? mean / std : 0,
    bars: bars.length,
  };
}

export type StrategyId = "smaCross" | "rsiReversal" | "macdCross";

/** Direction series from a strategy + params over the bars. */
export function strategyDirs(
  id: StrategyId,
  bars: Candle[],
  params: number[],
): number[] {
  if (id === "smaCross") {
    const fast = sma(bars, params[0] ?? 20);
    const slow = sma(bars, params[1] ?? 50);
    const fastMap = new Map(fast.map((x) => [x.time, x.value]));
    const slowMap = new Map(slow.map((x) => [x.time, x.value]));
    return bars.map((b) => {
      const f = fastMap.get(b.time);
      const s = slowMap.get(b.time);
      if (f == null || s == null) return 0;
      return f > s ? 1 : -1;
    });
  }
  if (id === "rsiReversal") {
    const r = rsi(bars, params[0] ?? 14);
    const map = new Map(r.map((x) => [x.time, x.value]));
    const over = params[1] ?? 70;
    const under = params[2] ?? 30;
    let prev = 0;
    return bars.map((b) => {
      const v = map.get(b.time);
      if (v == null) return 0;
      if (v > over) prev = -1;
      else if (v < under) prev = 1;
      return prev;
    });
  }
  // macdCross
  const { dif, dea } = macd(
    bars,
    params[0] ?? 12,
    params[1] ?? 26,
    params[2] ?? 9,
  );
  const difMap = new Map(dif.map((x) => [x.time, x.value]));
  const deaMap = new Map(dea.map((x) => [x.time, x.value]));
  return bars.map((b) => {
    const d = difMap.get(b.time);
    const s = deaMap.get(b.time);
    if (d == null || s == null) return 0;
    return d > s ? 1 : -1;
  });
}

export function runStrategy(
  id: StrategyId,
  bars: Candle[],
  params: number[],
  start = 10_000,
): BacktestResult {
  return backtest(bars, strategyDirs(id, bars, params), start);
}

/**
 * Backtest from an external signal series (e.g. a Pine script's "Signal"
 * plot): the sign of each value becomes the desired position — positive
 * long, negative short, zero flat — aligned to bar times.
 */
export function backtestFromSeries(
  bars: Candle[],
  signal: Array<{ time: number; value: number }>,
  start = 10_000,
): BacktestResult {
  const map = new Map(signal.map((s) => [s.time, s.value]));
  const dirs = bars.map((b) => {
    const v = map.get(b.time) ?? 0;
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  });
  return backtest(bars, dirs, start);
}
