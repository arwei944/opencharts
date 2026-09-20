import { createServerFn } from "@tanstack/react-start";
import { cacheable, guard } from "./api-utils";
import { primaryProvider } from "./market-provider";
import type { BookLevel, Candle, Market, Ticker, WatchItem } from "./types";

const prov = () => primaryProvider();

function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((k: unknown) => {
    const row = k as (string | number)[];
    return {
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    };
  });
}

export const fetchKlines = createServerFn({ method: "GET" })
  .validator((d: { symbol: string; interval: string; market: Market; endTime?: number; limit?: number }) => d)
  .handler(async ({ data }) => {
    const limit = Math.min(Math.max(data.limit ?? 1000, 1), 1000);
    const q = `?symbol=${encodeURIComponent(data.symbol)}&interval=${encodeURIComponent(data.interval)}&limit=${limit}${data.endTime ? `&endTime=${data.endTime}` : ""}`;
    // History pages are idempotent reads — short TTL dedupes concurrent fills
    // of the same page from multiple panes without stale data.
    return cacheable(`k:${data.market}:${data.symbol}:${data.interval}:${data.endTime ?? "now"}:${limit}`, 10_000, () =>
      prov()
        .get<unknown>(data.market, `/api/v3/klines${q}`, `/fapi/v1/klines${q}`)
        .then(parseKlines),
    );
  });

export const fetchTicker = createServerFn({ method: "GET" })
  .validator((d: { symbol: string; market: Market }) => d)
  .handler(async ({ data }): Promise<Ticker> => {
    const q = `?symbol=${encodeURIComponent(data.symbol)}`;
    const t = await cacheable(`t:${data.market}:${data.symbol}`, 1_000, () =>
      prov().get<Record<string, string>>(data.market, `/api/v3/ticker/24hr${q}`, `/fapi/v1/ticker/24hr${q}`),
    );
    const last = Number(t.lastPrice);
    const open = Number(t.openPrice);
    return {
      last,
      open,
      high: Number(t.highPrice),
      low: Number(t.lowPrice),
      volume: Number(t.volume),
      quoteVolume: Number(t.quoteVolume),
      change: last - open,
      changePct: Number(t.priceChangePercent),
    };
  });

export const fetchDepth = createServerFn({ method: "GET" })
  .validator((d: { symbol: string; market: Market }) => d)
  .handler(async ({ data }): Promise<{ bids: BookLevel[]; asks: BookLevel[] }> => {
    const q = `?symbol=${encodeURIComponent(data.symbol)}&limit=20`;
    const j = await cacheable(`d:${data.market}:${data.symbol}`, 1_000, () =>
      prov().get<{ bids: string[][]; asks: string[][] }>(data.market, `/api/v3/depth${q}`, `/fapi/v1/depth${q}`),
    );
    return {
      bids: (j.bids ?? []).map(([p, qv]) => ({ price: Number(p), qty: Number(qv) })),
      asks: (j.asks ?? []).map(([p, qv]) => ({ price: Number(p), qty: Number(qv) })),
    };
  });

export const fetchWatch = createServerFn({ method: "GET" })
  .validator((d: { symbols: string[]; market: Market }) => d)
  .handler(async ({ data }): Promise<WatchItem[]> => {
    if (!data.symbols.length) return [];
    const q = encodeURIComponent(JSON.stringify(data.symbols));
    const raw = await cacheable(`w:${data.market}:${data.symbols.join(",")}`, 8_000, () =>
      prov().get<unknown>(data.market, `/api/v3/ticker/24hr?symbols=${q}`, `/fapi/v1/ticker/24hr`),
    );
    const j = (Array.isArray(raw) ? raw : [raw]) as Record<string, string>[];
    const set = new Set(data.symbols);
    return j
      .filter((t) => set.has(t.symbol))
      .map((t) => ({
        symbol: t.symbol,
        last: Number(t.lastPrice),
        changePct: Number(t.priceChangePercent),
        volume: Number(t.quoteVolume),
      }));
  });

export const fetchPremium = createServerFn({ method: "GET" })
  .validator((d: { symbol: string }) => d)
  .handler(async ({ data }) => {
    const res = await guard(async () => {
      const raw = await cacheable(`p:${data.symbol}`, 2_000, () =>
        prov().get<Record<string, string>>("usdm", `/api/v3/ticker/price?symbol=${encodeURIComponent(data.symbol)}`, `/fapi/v1/premiumIndex?symbol=${encodeURIComponent(data.symbol)}`),
      );
      return {
        mark: Number(raw.markPrice ?? raw.price ?? 0),
        funding: Number(raw.lastFundingRate ?? 0),
        next: Number(raw.nextFundingTime ?? 0),
      };
    });
    return res.ok ? res.data : { mark: 0, funding: 0, next: 0 };
  });

export const searchSymbols = createServerFn({ method: "GET" })
  .validator((d: { q: string; market: Market }) => d)
  .handler(async ({ data }) => {
    const raw = await cacheable(`s:${data.market}`, 60_000, () =>
      prov().get<{ symbols: { symbol: string; status: string; quoteAsset: string }[] }>(data.market, "/api/v3/exchangeInfo", "/fapi/v1/exchangeInfo"),
    );
    const q = data.q.toUpperCase();
    return raw.symbols
      .filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT" && s.symbol.includes(q))
      .slice(0, 40)
      .map((s) => s.symbol);
  });