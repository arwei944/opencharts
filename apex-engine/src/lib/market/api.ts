import { createServerFn } from "@tanstack/react-start";
import type { BookLevel, Candle, Market, Ticker, WatchItem } from "./types";

const SPOT_HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api.binance.us",
];
const FUT_HOSTS = ["https://fapi.binance.com", ...SPOT_HOSTS];

const HOST_TIMEOUT_MS = 8000;

// Once a host has answered, stick to it: history prefill fires hundreds of page
// requests and racing three mirrors each time triples the traffic against
// Binance's request-weight budget. A sticky host also keeps one warm connection.
const stickyHost: Record<Market, string | null> = { spot: null, usdm: null };

async function fetchFrom(host: string, market: Market, spotPath: string, futPath: string): Promise<unknown> {
  const path = host.includes("fapi") ? futPath : spotPath;
  const res = await fetch(host + path, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(HOST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${host} ${res.status}`);
  return res.json();
}

async function bnGet(market: Market, spotPath: string, futPath: string): Promise<unknown> {
  const hosts = market === "usdm" ? FUT_HOSTS : SPOT_HOSTS;
  const stick = stickyHost[market];
  if (stick) {
    try {
      return await fetchFrom(stick, market, spotPath, futPath);
    } catch {
      stickyHost[market] = null;
    }
  }
  const attempts = hosts.map(async (host) => {
    const json = await fetchFrom(host, market, spotPath, futPath);
    if (!stickyHost[market]) stickyHost[market] = host;
    return json;
  });
  return Promise.any(attempts);
}

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
    let q = `?symbol=${encodeURIComponent(data.symbol)}&interval=${encodeURIComponent(data.interval)}&limit=${limit}`;
    if (data.endTime) q += `&endTime=${data.endTime}`;
    const raw = await bnGet(data.market, `/api/v3/klines${q}`, `/fapi/v1/klines${q}`);
    return parseKlines(raw);
  });

export const fetchTicker = createServerFn({ method: "GET" })
  .validator((d: { symbol: string; market: Market }) => d)
  .handler(async ({ data }): Promise<Ticker> => {
    const q = `?symbol=${encodeURIComponent(data.symbol)}`;
    const t = (await bnGet(data.market, `/api/v3/ticker/24hr${q}`, `/fapi/v1/ticker/24hr${q}`)) as Record<string, string>;
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
    const j = (await bnGet(data.market, `/api/v3/depth${q}`, `/fapi/v1/depth${q}`)) as {
      bids: string[][];
      asks: string[][];
    };
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
    const raw = await bnGet(data.market, `/api/v3/ticker/24hr?symbols=${q}`, `/fapi/v1/ticker/24hr`);
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
    try {
      const raw = await bnGet("usdm", `/api/v3/ticker/price?symbol=${encodeURIComponent(data.symbol)}`, `/fapi/v1/premiumIndex?symbol=${encodeURIComponent(data.symbol)}`);
      const t = raw as Record<string, string>;
      return {
        mark: Number(t.markPrice ?? t.price ?? 0),
        funding: Number(t.lastFundingRate ?? 0),
        next: Number(t.nextFundingTime ?? 0),
      };
    } catch {
      return { mark: 0, funding: 0, next: 0 };
    }
  });

export const searchSymbols = createServerFn({ method: "GET" })
  .validator((d: { q: string; market: Market }) => d)
  .handler(async ({ data }) => {
    const raw = await bnGet(data.market, "/api/v3/exchangeInfo", "/fapi/v1/exchangeInfo");
    const j = raw as { symbols: { symbol: string; status: string; quoteAsset: string }[] };
    const q = data.q.toUpperCase();
    return j.symbols
      .filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT" && s.symbol.includes(q))
      .slice(0, 40)
      .map((s) => s.symbol);
  });
