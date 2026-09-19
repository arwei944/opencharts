import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/utils";

export type Side = "buy" | "sell";
export type OrderType = "limit" | "market" | "stop-limit" | "stop-market";
export type OrderStatus = "open" | "filled" | "canceled" | "triggered";

export interface PaperOrder {
  id: string;
  time: number;
  symbol: string;
  market: "spot" | "usdm";
  side: Side;
  type: OrderType;
  price: number;
  stop?: number;
  qty: number;
  status: OrderStatus;
  filledQty: number;
  avgFill: number;
}

export interface Position {
  symbol: string;
  market: "spot" | "usdm";
  qty: number;
  avg: number;
}

export interface Fill {
  id: string;
  time: number;
  orderId: string;
  symbol: string;
  side: Side;
  price: number;
  qty: number;
}

interface PaperState {
  quote: number;
  bases: Record<string, number>;
  leverage: number;
  orders: PaperOrder[];
  fills: Fill[];
  positions: Position[];
  setLeverage: (n: number) => void;
  place: (o: Omit<PaperOrder, "id" | "time" | "status" | "filledQty" | "avgFill">) => string | null;
  cancel: (id: string) => void;
  cancelAll: (symbol?: string) => void;
  onTick: (symbol: string, last: number, bid: number, ask: number) => void;
  reset: () => void;
}

const START = 10_000;

function applyFill(s: PaperState, o: PaperOrder, px: number, qty: number): Partial<PaperState> {
  const fill: Fill = { id: uid(), time: Date.now(), orderId: o.id, symbol: o.symbol, side: o.side, price: px, qty };
  const fills = [fill, ...s.fills].slice(0, 200);
  const bases = { ...s.bases };
  let quote = s.quote;
  const positions = s.positions.map((p) => ({ ...p }));
  if (o.market === "spot") {
    if (o.side === "buy") {
      quote -= px * qty;
      bases[o.symbol] = (bases[o.symbol] ?? 0) + qty;
    } else {
      quote += px * qty;
      bases[o.symbol] = (bases[o.symbol] ?? 0) - qty;
    }
  } else {
    let pos = positions.find((p) => p.symbol === o.symbol && p.market === "usdm");
    if (!pos) {
      pos = { symbol: o.symbol, market: "usdm", qty: 0, avg: 0 };
      positions.push(pos);
    }
    const signed = o.side === "buy" ? qty : -qty;
    const next = pos.qty + signed;
    if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signed)) {
      pos.avg = (Math.abs(pos.qty) * pos.avg + qty * px) / Math.abs(next || 1);
      pos.qty = next;
    } else {
      const closed = Math.min(Math.abs(pos.qty), qty);
      const pnl = (px - pos.avg) * closed * Math.sign(pos.qty);
      quote += pnl;
      pos.qty = next;
      if (Math.sign(pos.qty) !== Math.sign(pos.qty - signed) && pos.qty !== 0) {
        pos.avg = px;
      }
      if (pos.qty === 0) pos.avg = 0;
    }
  }
  const orders = s.orders.map((x) =>
    x.id === o.id
      ? {
          ...x,
          status: "filled" as const,
          filledQty: x.filledQty + qty,
          avgFill: px,
        }
      : x,
  );
  return { quote, bases, fills, positions: positions.filter((p) => p.qty !== 0), orders };
}

export const usePaper = create<PaperState>()(
  persist(
    (set, get) => ({
      quote: START,
      bases: {},
      leverage: 10,
      orders: [],
      fills: [],
      positions: [],
      setLeverage: (leverage) => set({ leverage }),
      reset: () => set({ quote: START, bases: {}, orders: [], fills: [], positions: [] }),
      place: (raw) => {
        const s = get();
        if (raw.type === "market") {
          const id = uid();
          const o: PaperOrder = {
            ...raw,
            id,
            time: Date.now(),
            status: "open",
            filledQty: 0,
            avgFill: 0,
          };
          const px = raw.price;
          if (raw.market === "spot" && raw.side === "buy" && s.quote < px * raw.qty) return "余额不足";
          if (raw.market === "spot" && raw.side === "sell" && (s.bases[raw.symbol] ?? 0) < raw.qty)
            return "持仓不足";
          set({ orders: [o, ...s.orders] });
          set((cur) => applyFill(cur, o, px, raw.qty) as PaperState);
          return null;
        }
        if (raw.market === "spot" && raw.side === "buy" && raw.type === "limit" && s.quote < raw.price * raw.qty)
          return "余额不足";
        if (raw.market === "spot" && raw.side === "sell" && (s.bases[raw.symbol] ?? 0) < raw.qty) return "持仓不足";
        const o: PaperOrder = {
          ...raw,
          id: uid(),
          time: Date.now(),
          status: "open",
          filledQty: 0,
          avgFill: 0,
        };
        set({ orders: [o, ...s.orders] });
        return null;
      },
      cancel: (id) =>
        set({
          orders: get().orders.map((o) => (o.id === id && o.status === "open" ? { ...o, status: "canceled" } : o)),
        }),
      cancelAll: (symbol) =>
        set({
          orders: get().orders.map((o) =>
            o.status === "open" && (!symbol || o.symbol === symbol) ? { ...o, status: "canceled" } : o,
          ),
        }),
      onTick: (symbol, last, bid, ask) => {
        const s = get();
        for (const o of s.orders) {
          if (o.status !== "open" || o.symbol !== symbol) continue;
          if (o.type === "limit") {
            const hit = o.side === "buy" ? ask <= o.price || last <= o.price : bid >= o.price || last >= o.price;
            if (hit) set((cur) => applyFill(cur, o, o.price, o.qty) as PaperState);
          } else if (o.type === "stop-market" || o.type === "stop-limit") {
            const stop = o.stop ?? o.price;
            const trig = o.side === "buy" ? last >= stop : last <= stop;
            if (!trig) continue;
            if (o.type === "stop-market") {
              const px = o.side === "buy" ? ask || last : bid || last;
              set((cur) => applyFill(cur, o, px, o.qty) as PaperState);
            } else {
              set({
                orders: get().orders.map((x) =>
                  x.id === o.id ? { ...x, type: "limit", status: "open", price: o.price } : x,
                ),
              });
            }
          }
        }
      },
    }),
    { name: "apex-paper" },
  ),
);
