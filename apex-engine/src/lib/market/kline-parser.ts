import type { Candle } from "./types.ts";

/**
 * Decode a Binance-style kline payload (combined-stream envelope or raw event)
 * into a Candle. Pure and unit-testable; the WS layer only feeds it data.
 */
export function parseKline(data: Record<string, unknown> | null | undefined): Candle | null {
  if (!data || typeof data !== "object") return null;
  const k = (data.k ?? data) as Record<string, string | boolean | number>;
  if (!k || typeof k !== "object" || k.t == null) return null;
  return {
    time: Math.floor(Number(k.t) / 1000),
    open: Number(k.o),
    high: Number(k.h),
    low: Number(k.l),
    close: Number(k.c),
    volume: Number(k.v),
    closed: Boolean(k.x),
  };
}