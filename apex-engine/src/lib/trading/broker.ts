import type { Side } from "./paper";
import { usePaper } from "./paper";

export interface BrokerOrder {
  symbol: string;
  market: "spot" | "usdm";
  side: Side;
  type: "limit" | "market" | "stop-limit" | "stop-market";
  price: number;
  stop?: number;
  qty: number;
  /** Optional take-profit / stop-loss price pair (executed by the broker). */
  tp?: number;
  sl?: number;
}

export interface BrokerFill {
  orderId: string;
  symbol: string;
  side: Side;
  price: number;
  qty: number;
}

/**
 * Broker abstraction so the trading panel works against a paper provider today
 * and can later be swapped for a real exchange adapter without touching the UI.
 */
export interface BrokerProvider {
  readonly name: string;
  /** Place an order; resolves to an error message or null on success. */
  place(o: BrokerOrder): Promise<string | null> | string | null;
  cancel(id: string): void;
  cancelAll(symbol?: string): void;
  /** Notify the broker of a new tick so stop/limit orders can fill. */
  onTick(symbol: string, last: number, bid: number, ask: number): void;
  /** Orders currently open (for the panel list). */
  listOpen(): BrokerOrder[];
  reset(): void;
}

/**
 * Adapter that forwards to the zustand paper store — the current default.
 * Kept separate so an `ExchangeBroker` can replace it with a real API client.
 */
export const paperBroker: BrokerProvider = {
  name: "paper",
  place(o) {
    return usePaper.getState().place({
      symbol: o.symbol,
      market: o.market,
      side: o.side,
      type: o.type,
      price: o.price,
      stop: o.stop,
      qty: o.qty,
    });
  },
  cancel(id) {
    usePaper.getState().cancel(id);
  },
  cancelAll(symbol) {
    usePaper.getState().cancelAll(symbol);
  },
  onTick(symbol, last, bid, ask) {
    usePaper.getState().onTick(symbol, last, bid, ask);
  },
  listOpen() {
    return usePaper
      .getState()
      .orders.filter((o) => o.status === "open")
      .map((o) => ({
        symbol: o.symbol,
        market: o.market,
        side: o.side,
        type: o.type,
        price: o.price,
        stop: o.stop,
        qty: o.qty,
      }));
  },
  reset() {
    usePaper.getState().reset();
  },
};

/** Active broker; swap to a real exchange adapter later. */
export const broker: BrokerProvider = paperBroker;
