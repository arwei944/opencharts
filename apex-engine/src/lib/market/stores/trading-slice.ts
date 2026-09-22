import type { StateCreator } from "zustand";
import type { Candle } from "../types.ts";

/**
 * Chart-order interaction + feed-telemetry state: the pending order price
 * from a chart click, TP/SL levels, and the live brokerage backend. Slice kept
 * small and non-persisted apart from the fields persist handles explicitly.
 */
export interface TradingSlice {
  overlay: Candle | null;
  /** Price from a chart click, waiting for the OrderTicket to confirm. */
  chartOrderPrice: number | null;
  setChartOrderPrice: (p: number | null) => void;
  feedStats: {
    hostIndex: number;
    base: string;
    reconnects: number;
    lastMsgAt: number;
  };
  setFeedStats: (
    p: Partial<{
      hostIndex: number;
      base: string;
      reconnects: number;
      lastMsgAt: number;
    }>,
  ) => void;
  setOverlay: (c: Candle | null) => void;
}

export const tradingSlice: StateCreator<
  import("../store").TerminalState,
  [],
  [],
  TradingSlice
> = (set, get) => ({
  overlay: null,
  chartOrderPrice: null,
  feedStats: { hostIndex: 0, base: "", reconnects: 0, lastMsgAt: 0 },
  setOverlay: (overlay) => set({ overlay }),
  setChartOrderPrice: (chartOrderPrice) => set({ chartOrderPrice }),
  setFeedStats: (patch) => set({ feedStats: { ...get().feedStats, ...patch } }),
});
