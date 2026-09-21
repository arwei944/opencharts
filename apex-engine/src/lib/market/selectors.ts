import { useTerminal, type TerminalState } from "./store";
import type { Candle, Ticker } from "./types";

/**
 * Centralized store selectors. Naming the subscriptions makes the hot paths
 * explicit: components that must not re-render on every WS tick should select
 * scalars or stable references (e.g. lastBar instead of bars).
 */

export const selectMarket = (s: TerminalState) => s.market;
export const selectSymbol = (s: TerminalState) => s.symbol;
export const selectInterval = (s: TerminalState) => s.interval;
export const selectTheme = (s: TerminalState) => s.theme;
export const selectLayout = (s: TerminalState) => s.layout;

/** Live price etc. — changes every WS tick; only panels that display it subscribe. */
export const selectTicker = (s: TerminalState): Ticker | null => s.ticker;

/** Stable array reference: in-place tail updates do NOT change it. */
export const selectBars = (s: TerminalState): Candle[] => s.bars;

/** The live (still-open) bar; changes on every tick. */
export const selectLastBar = (s: TerminalState): Candle | null => s.lastBar;

export const selectConnection = (
  s: TerminalState,
): "connecting" | "live" | "degraded" | "offline" => s.conn;

/** Hook forms. */
export const useSymbol = () => useTerminal(selectSymbol);
export const useTicker = () => useTerminal(selectTicker);
export const useBars = () => useTerminal(selectBars);
export const useLastBar = () => useTerminal(selectLastBar);
export const useConnection = () => useTerminal(selectConnection);

// ---- High-frequency market data selectors (WS-driven) ----

/** The pane's resident series for a pane id (stable ref; tail updates in place). */
export const selectPaneBars =
  (paneId: string) =>
  (s: TerminalState): Candle[] =>
    s.paneBars[paneId] ?? s.bars;

/** Compare series for a symbol (stable ref). */
export const selectCompareBars =
  (symbol: string) =>
  (s: TerminalState): Candle[] =>
    s.compareBars[symbol] ?? [];

/** Order-book snapshot — changes on every depth update. */
export const selectBook = (s: TerminalState) => ({
  bids: s.bids,
  asks: s.asks,
});

/** Recent trades tape (capped at 80). */
export const selectTrades = (s: TerminalState) => s.trades;

/** Watchlist rows (ticker snapshot per symbol). */
export const selectWatch = (s: TerminalState) => s.watch;
export const selectWatchSymbols = (s: TerminalState) => s.watchSymbols;

/** History-fill progress for a series key. */
export const selectHistoryStatus = (key: string) => (s: TerminalState) =>
  s.historyStatus[key];

/** Live feed integrity counters (gaps / anomalies / cross-source skew). */
export const selectDataWarnings = (s: TerminalState) => s.dataWarnings;

/** OKX secondary stream health (concurrent dual-source). */
export const selectOkxLive = (s: TerminalState) => s.okxLive;

// ---- Hook forms ----

export const usePaneBars = (paneId: string) =>
  useTerminal(selectPaneBars(paneId));
export const useCompareBars = (symbol: string) =>
  useTerminal(selectCompareBars(symbol));
export const useBook = () => useTerminal(selectBook);
export const useTrades = () => useTerminal(selectTrades);
export const useWatch = () => useTerminal(selectWatch);
export const useWatchSymbols = () => useTerminal(selectWatchSymbols);
export const useHistoryStatus = (key: string) =>
  useTerminal(selectHistoryStatus(key));
export const useDataWarnings = () => useTerminal(selectDataWarnings);
export const useOkxLive = () => useTerminal(selectOkxLive);
