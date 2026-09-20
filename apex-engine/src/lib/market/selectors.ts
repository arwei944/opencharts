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
