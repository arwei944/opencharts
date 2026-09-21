import type { Fill } from "../trading/paper.ts";

/**
 * Realized-performance math over the paper account's fill stream:
 *  - spot fills contribute net cash flow (buys spend, sells receive);
 *  - usdm fills only realize PnL on the closing leg (position tracking);
 *  - the equity series is start-capital + cumulative realized PnL.
 */

export interface PerfPoint {
  time: number;
  equity: number;
}

interface UsdmPos {
  qty: number;
  avg: number;
}

export function equitySeries(
  fills: readonly Fill[],
  start = 10_000,
): PerfPoint[] {
  const pts: PerfPoint[] = [{ time: fills[0]?.time ?? 0, equity: start }];
  let eq = start;
  let spotCash = 0;
  const spots = new Map<string, number>();
  const usdm = new Map<string, UsdmPos>();

  for (const f of fills) {
    const signed = f.side === "buy" ? f.qty : -f.qty;
    if (f.market === "spot") {
      const cash = f.side === "buy" ? -f.price * f.qty : f.price * f.qty;
      spots.set(f.symbol, (spots.get(f.symbol) ?? 0) + cash);
      spotCash = 0;
      for (const v of spots.values()) spotCash += v;
      eq = start + spotCash;
    } else {
      const pos = usdm.get(f.symbol) ?? { qty: 0, avg: 0 };
      if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signed)) {
        // opening / adding: no realized PnL, just cost basis
        pos.avg =
          (Math.abs(pos.qty) * pos.avg + f.qty * f.price) /
          Math.abs(pos.qty + signed || 1);
        pos.qty += signed;
      } else {
        // closing (or flipping): realize PnL on the closed size
        const closed = Math.min(Math.abs(pos.qty), Math.abs(signed));
        const pnl = (f.price - pos.avg) * closed * Math.sign(pos.qty);
        eq += pnl;
        pos.qty += signed;
        if (Math.sign(pos.qty) !== Math.sign(pos.qty - signed) && pos.qty !== 0)
          pos.avg = f.price;
        if (pos.qty === 0) pos.avg = 0;
      }
      usdm.set(f.symbol, pos);
    }
    pts.push({ time: f.time, equity: eq });
  }
  return pts;
}

export interface PerfSummary {
  trades: number; // closed legs (usdm closes + spot sells)
  wins: number;
  winRate: number; // 0..100
  pnl: number;
  grossProfit: number;
  grossLoss: number; // negative-going magnitude (reported positive)
  maxDrawdown: number; // peak-to-trough of the equity series
}

export function performance(
  fills: readonly Fill[],
  start = 10_000,
): PerfSummary {
  const series = equitySeries(fills, start);
  const pnl = series.length ? series[series.length - 1].equity - start : 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  // per-symbol closed-leg PnL for win/loss accounting (spot: sell-side only)
  const spotNet = new Map<string, number>();
  const usdm = new Map<string, UsdmPos>();
  let closed = 0;

  for (const f of fills) {
    const signed = f.side === "buy" ? f.qty : -f.qty;
    if (f.market === "spot") {
      if (f.side === "sell") closed += 1;
      spotNet.set(
        f.symbol,
        (spotNet.get(f.symbol) ?? 0) +
          (f.side === "buy" ? -f.price * f.qty : f.price * f.qty),
      );
    } else {
      const pos = usdm.get(f.symbol) ?? { qty: 0, avg: 0 };
      if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signed)) {
        pos.avg =
          (Math.abs(pos.qty) * pos.avg + f.qty * f.price) /
          Math.abs(pos.qty + signed || 1);
        pos.qty += signed;
      } else {
        const closedQty = Math.min(Math.abs(pos.qty), Math.abs(signed));
        const legPnl = (f.price - pos.avg) * closedQty * Math.sign(pos.qty);
        closed += 1;
        if (legPnl >= 0) {
          wins += 1;
          grossProfit += legPnl;
        } else {
          grossLoss += -legPnl;
        }
        pos.qty += signed;
        if (Math.sign(pos.qty) !== Math.sign(pos.qty - signed) && pos.qty !== 0)
          pos.avg = f.price;
        if (pos.qty === 0) pos.avg = 0;
      }
      usdm.set(f.symbol, pos);
    }
  }

  // Spot closed-leg PnL: net cash flow per symbol minus the capital spent on
  // whatever remains open today is unknowable from fills alone — count positive
  // net cash flows as wins on the sell legs.
  let peak = start;
  let maxDrawdown = 0;
  for (const p of series) {
    peak = Math.max(peak, p.equity);
    maxDrawdown = Math.max(maxDrawdown, peak - p.equity);
  }

  return {
    trades: closed,
    wins,
    winRate: closed ? (wins / closed) * 100 : 0,
    pnl,
    grossProfit,
    grossLoss,
    maxDrawdown,
  };
}
