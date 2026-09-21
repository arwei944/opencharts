import type { Side } from "./paper";
import { usePaper } from "./paper";
import { useTerminal } from "@/lib/market/store";
import { binanceLive } from "@/lib/binance/proxy";

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
  cancel(id: string, symbol?: string): void;
  cancelAll(symbol?: string): void;
  /** Notify the broker of a new tick so stop/limit orders can fill. */
  onTick(symbol: string, last: number, bid: number, ask: number): void;
  /** Orders currently open (for the panel list). */
  listOpen(symbol?: string): BrokerOrder[] | Promise<BrokerOrder[]>;
  /** Check whether live trading is actually configured (live broker only). */
  status?(): Promise<{ enabled: boolean; error?: string }>;
  reset(): void;
}

/**
 * Adapter that forwards to the zustand paper store — the current default.
 * Kept separate so the `liveBroker` can replace it with a real API client.
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

/** Order-type + param mapping to Binance order payloads. */
function binanceOrderParams(o: BrokerOrder): Record<string, string | number> {
  const params: Record<string, string | number> = {
    symbol: o.symbol,
    side: o.side.toUpperCase(),
    type:
      o.type === "market"
        ? "MARKET"
        : o.type === "stop-market"
          ? "STOP_MARKET"
          : o.type === "stop-limit"
            ? "STOP_LIMIT"
            : "LIMIT",
    quantity: o.qty,
  };
  if (o.price > 0) params.price = o.price;
  if (o.stop != null) params.stopPrice = o.stop;
  if (o.type === "limit") params.timeInForce = "GTC";
  return params;
}

/**
 * Live Binance adapter over the signed server-side proxy. Orders go straight
 * to the exchange once BINANCE_API_KEY/SECRET are configured server-side; the
 * UI keeps working through the same BrokerProvider interface.
 */
export const liveBroker: BrokerProvider = {
  name: "binance-live",
  async place(o) {
    const r = await binanceLive({
      data: {
        action: "placeOrder",
        market: o.market,
        params: binanceOrderParams(o),
      },
    });
    return r.ok ? null : r.error;
  },
  cancel(id, symbol) {
    if (!symbol) return;
    void binanceLive({
      data: {
        action: "cancelOrder",
        market: useTerminal.getState().market,
        params: { symbol, origClientOrderId: id },
      },
    });
  },
  cancelAll(symbol) {
    if (!symbol) return;
    void binanceLive({
      data: {
        action: "cancelOrder",
        market: useTerminal.getState().market,
        params: { symbol, cancelAll: 1 },
      },
    });
  },
  onTick() {
    /* the exchange matches orders itself — nothing to simulate */
  },
  async listOpen(symbol) {
    const market = useTerminal.getState().market;
    const r = await binanceLive({
      data: {
        action: "openOrders",
        market,
        params: symbol ? { symbol } : {},
      },
    });
    if (!r.ok) return [];
    const list = JSON.parse(r.raw) as Array<{
      symbol?: string;
      side?: string;
      type?: string;
      price?: string;
      stopPrice?: string;
      origQty?: string;
      origClientOrderId?: string;
    }>;
    return (list ?? []).map((o) => ({
      symbol: o.symbol ?? "",
      market,
      side: (o.side ?? "BUY").toLowerCase() as Side,
      type: (o.type ?? "LIMIT").toLowerCase() as BrokerOrder["type"],
      price: Number(o.price ?? o.stopPrice ?? 0),
      stop: o.stopPrice ? Number(o.stopPrice) : undefined,
      qty: Number(o.origQty ?? 0),
    }));
  },
  async status() {
    const r = await binanceLive({
      data: { action: "balance", market: "spot", params: {} },
    });
    return r.ok ? { enabled: true } : { enabled: false, error: r.error };
  },
  reset() {
    /* live orders live on the exchange — nothing to reset locally */
  },
};

/** Active broker — switchable between paper and live from the settings. */
let activeBroker: BrokerProvider = paperBroker;

export function setActiveBroker(b: BrokerProvider) {
  activeBroker = b;
}

export function getActiveBroker(): BrokerProvider {
  return activeBroker;
}

/** Stable delegating facade so components keep importing `broker`. */
export const broker: BrokerProvider = {
  get name() {
    return activeBroker.name;
  },
  place: (o) => activeBroker.place(o),
  cancel: (id, symbol) => activeBroker.cancel(id, symbol),
  cancelAll: (symbol) => activeBroker.cancelAll(symbol),
  onTick: (s, l, b, a) => activeBroker.onTick(s, l, b, a),
  listOpen: (symbol) => activeBroker.listOpen(symbol),
  status: async () => {
    const s = activeBroker.status;
    // Paper broker has no status() -> always "enabled".
    return s ? s() : { enabled: true };
  },
  reset: () => activeBroker.reset(),
};
