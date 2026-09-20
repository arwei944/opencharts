import { createServerFn } from "@tanstack/react-start";
import { cacheable, guard } from "./api-utils";
import { primaryProvider } from "./market-provider";
import type { BookLevel, Candle, Market, Ticker, WatchItem } from "./types";

const prov = () => primaryProvider();

/* ---------------------------------------------------------------------------
 * Secondary source: OKX. Used only for the core klines/ticker reads; when
 * every Binance host fails, these adapt OKX's candlesticks into the same
 * Candle/Ticker shapes so the rest of the app is unaware of the fallback.
 * ------------------------------------------------------------------------- */
const OKX_HOST = "https://www.okx.com";

const OKX_BAR: Record<string, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2h": "2H",
  "4h": "4H",
  "6h": "6H",
  "12h": "12H",
  "1d": "1Dutc",
  "3d": "3Dutc",
  "1w": "1Wutc",
};

function okxInstId(symbol: string, market: Market): string {
  return `${symbol}-USDT${market === "usdm" ? "-SWAP" : ""}`;
}

async function okxGet<T>(path: string): Promise<T> {
  const res = await fetch(`${OKX_HOST}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`upstream:okx ${res.status}`);
  const j = (await res.json()) as { code: string; data: unknown; msg?: string };
  if (j.code !== "0") throw new Error(`upstream:okx ${j.msg ?? j.code}`);
  return j.data as T;
}

/** Binance kline shape -> our Candle. OKX rows: [ts,o,h,l,c,vol,volCcy,volCcyQuote,confirm] */
function okxToCandles(data: unknown): Candle[] {
  if (!Array.isArray(data)) return [];
  return data.map((row: unknown) => {
    const r = row as string[];
    return {
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    };
  });
}

/** OKX order: newest first; reverse to ascending and cap at `limit`. */
async function okxKlines(
  symbol: string,
  market: Market,
  interval: string,
  limit: number,
): Promise<Candle[]> {
  const bar = OKX_BAR[interval];
  if (!bar) throw new Error("upstream:okx no bar for " + interval);
  const data = await okxGet<unknown>(
    `/api/v5/market/candles?instId=${okxInstId(symbol, market)}&bar=${bar}&limit=${Math.min(limit, 300)}`,
  );
  const bars = okxToCandles(data);
  return bars.sort((a, b) => a.time - b.time);
}

function okxToTicker(data: unknown, symbol: string, market: Market): Ticker {
  const rows = (Array.isArray(data) ? data : []) as Record<string, string>[];
  const t = rows.find((r) => r.instId === okxInstId(symbol, market));
  if (!t) throw new Error("upstream:okx ticker missing " + symbol);
  const last = Number(t.last);
  const open = Number(t.open24h ?? t.last);
  return {
    last,
    open,
    high: Number(t.high24h ?? last),
    low: Number(t.low24h ?? last),
    volume: Number(t.vol24h ?? 0),
    quoteVolume: Number(t.volCcy24h ?? 0),
    change: last - open,
    changePct: open ? ((last - open) / open) * 100 : 0,
  };
}

async function okxTicker(symbol: string, market: Market): Promise<Ticker> {
  const data = await okxGet<unknown>(
    `/api/v5/market/tickers?instType=${market === "usdm" ? "SWAP" : "SPOT"}`,
  );
  return okxToTicker(data, symbol, market);
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
  .validator(
    (d: {
      symbol: string;
      interval: string;
      market: Market;
      endTime?: number;
      limit?: number;
    }) => d,
  )
  .handler(async ({ data }) => {
    const limit = Math.min(Math.max(data.limit ?? 1000, 1), 1000);
    const q = `?symbol=${encodeURIComponent(data.symbol)}&interval=${encodeURIComponent(data.interval)}&limit=${limit}${data.endTime ? `&endTime=${data.endTime}` : ""}`;
    // History pages are idempotent reads — short TTL dedupes concurrent fills
    // of the same page from multiple panes without stale data.
    return cacheable(
      `k:${data.market}:${data.symbol}:${data.interval}:${data.endTime ?? "now"}:${limit}`,
      10_000,
      async () => {
        try {
          return await prov()
            .get<unknown>(
              data.market,
              `/api/v3/klines${q}`,
              `/fapi/v1/klines${q}`,
            )
            .then(parseKlines);
        } catch (err) {
          // Binance down -> OKX candlesticks as a degraded-but-usable series.
          // Note OKX ignores endTime (returns recent bars), which is fine for
          // the tail/initial fill; deep prefill falls back to erroring.
          return okxKlines(
            data.symbol,
            data.market,
            data.interval,
            limit,
          ).catch(() => {
            throw err; // keep the original error if OKX also fails
          });
        }
      },
    );
  });

export const fetchTicker = createServerFn({ method: "GET" })
  .validator((d: { symbol: string; market: Market }) => d)
  .handler(async ({ data }): Promise<Ticker> => {
    const q = `?symbol=${encodeURIComponent(data.symbol)}`;
    return cacheable(`t:${data.market}:${data.symbol}`, 1_000, async () => {
      try {
        const t = await prov().get<Record<string, string>>(
          data.market,
          `/api/v3/ticker/24hr${q}`,
          `/fapi/v1/ticker/24hr${q}`,
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
      } catch (err) {
        const okx = await okxTicker(data.symbol, data.market).catch(() => null);
        if (okx) return okx;
        throw err;
      }
    });
  });

export const fetchDepth = createServerFn({ method: "GET" })
  .validator((d: { symbol: string; market: Market }) => d)
  .handler(
    async ({ data }): Promise<{ bids: BookLevel[]; asks: BookLevel[] }> => {
      const q = `?symbol=${encodeURIComponent(data.symbol)}&limit=20`;
      const j = await cacheable(`d:${data.market}:${data.symbol}`, 1_000, () =>
        prov().get<{ bids: string[][]; asks: string[][] }>(
          data.market,
          `/api/v3/depth${q}`,
          `/fapi/v1/depth${q}`,
        ),
      );
      return {
        bids: (j.bids ?? []).map(([p, qv]) => ({
          price: Number(p),
          qty: Number(qv),
        })),
        asks: (j.asks ?? []).map(([p, qv]) => ({
          price: Number(p),
          qty: Number(qv),
        })),
      };
    },
  );

export const fetchWatch = createServerFn({ method: "GET" })
  .validator((d: { symbols: string[]; market: Market }) => d)
  .handler(async ({ data }): Promise<WatchItem[]> => {
    if (!data.symbols.length) return [];
    const q = encodeURIComponent(JSON.stringify(data.symbols));
    const raw = await cacheable(
      `w:${data.market}:${data.symbols.join(",")}`,
      8_000,
      () =>
        prov().get<unknown>(
          data.market,
          `/api/v3/ticker/24hr?symbols=${q}`,
          `/fapi/v1/ticker/24hr`,
        ),
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
        prov().get<Record<string, string>>(
          "usdm",
          `/api/v3/ticker/price?symbol=${encodeURIComponent(data.symbol)}`,
          `/fapi/v1/premiumIndex?symbol=${encodeURIComponent(data.symbol)}`,
        ),
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
      prov().get<{
        symbols: { symbol: string; status: string; quoteAsset: string }[];
      }>(data.market, "/api/v3/exchangeInfo", "/fapi/v1/exchangeInfo"),
    );
    const q = data.q.toUpperCase();
    return raw.symbols
      .filter(
        (s) =>
          s.status === "TRADING" &&
          s.quoteAsset === "USDT" &&
          s.symbol.includes(q),
      )
      .slice(0, 40)
      .map((s) => s.symbol);
  });
