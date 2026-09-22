import {
  fetchDepth,
  fetchKlines,
  fetchPremium,
  fetchTicker,
  fetchWatch,
  searchSymbols,
} from "./api.ts";
import {
  appendKlineCache,
  decodeBars,
  pruneKlineCache,
  readKlineCache,
  type KlineCacheMeta,
} from "./kline-cache.ts";
import type {
  BookLevel,
  Candle,
  Interval,
  Market,
  Ticker,
  WatchItem,
} from "./types.ts";

/**
 * Port/Adapter contract layer (P0-A2). The data pipeline (history/feed) no
 * longer imports the concrete api.ts / kline-cache.ts functions directly — it
 * consumes these typed ports, so a self-hosted backend, a mock data source, or
 * an alternate cache (memory-only, remote) is one adapter implementation away.
 *
 * `defaultPorts` adapts the built-in serverFn handlers + IndexedDB cache; the
 * plugin registry's `registerDataSource` (P2) plugs in by replacing
 * `dataSourcePort`.
 */

export interface KlineQuery {
  symbol: string;
  interval: string;
  market: Market;
  endTime?: number;
  limit?: number;
}

export interface DataSourcePort {
  fetchKlines(q: KlineQuery): Promise<Candle[]>;
  fetchTicker(symbol: string, market: Market): Promise<Ticker>;
  fetchDepth(
    symbol: string,
    market: Market,
  ): Promise<{ bids: BookLevel[]; asks: BookLevel[] }>;
  fetchWatch(symbols: string[], market: Market): Promise<WatchItem[]>;
  fetchPremium(
    symbol: string,
  ): Promise<{ mark: number; funding: number; next: number }>;
  searchSymbols(q: string, market: Market): Promise<string[]>;
}

export const dataSourcePort: DataSourcePort = {
  fetchKlines: (q) => fetchKlines({ data: q }),
  fetchTicker: (symbol, market) => fetchTicker({ data: { symbol, market } }),
  fetchDepth: (symbol, market) => fetchDepth({ data: { symbol, market } }),
  fetchWatch: (symbols, market) => fetchWatch({ data: { symbols, market } }),
  fetchPremium: (symbol) => fetchPremium({ data: { symbol } }),
  searchSymbols: (q, market) => searchSymbols({ data: { q, market } }),
};

export interface KlineIdent {
  symbol: string;
  market: Market;
  interval: Interval;
}

export interface CacheRead {
  bars: Candle[];
  floorTime: number;
  complete: boolean;
}

export interface CachePort {
  read(key: string): Promise<CacheRead | null>;
  append(
    key: string,
    ident: KlineIdent,
    meta: KlineCacheMeta,
    bars: Candle[],
  ): Promise<void>;
  prune(maxEntries?: number): Promise<void>;
}

export const cachePort: CachePort = {
  read: async (key) => {
    const rec = await readKlineCache(key);
    if (!rec) return null;
    const bars = decodeBars(rec);
    if (!bars.length) return null;
    return { bars, floorTime: rec.floorTime, complete: rec.complete };
  },
  append: (key, ident, meta, bars) => appendKlineCache(key, ident, meta, bars),
  prune: (maxEntries) => pruneKlineCache(maxEntries),
};
