import type { Candle, Interval, Market } from "./types";

const DB_NAME = "apex-kline-cache";
const DB_VERSION = 1;
const STORE = "klines";
const META_INDEX = "fetchedAt";

export interface KlineCacheRecord {
  key: string;
  symbol: string;
  market: Market;
  interval: Interval;
  stepSec: number;
  fetchedAt: number;
  /** Oldest time the prefill was asked to reach (depth floor for this symbol/interval). */
  floorTime: number;
  /** True once prefill reached floorTime or the exchange's first bar — only a tail catch-up is needed. */
  complete: boolean;
  count: number;
  times: Int32Array;
  opens: Float64Array;
  highs: Float64Array;
  lows: Float64Array;
  closes: Float64Array;
  volumes: Float64Array;
}

export interface KlineCacheMeta {
  stepSec: number;
  floorTime: number;
  complete: boolean;
}

/**
 * In-memory mirror of the IDB cache, so switching symbol/interval twice in one
 * session resolves instantly instead of re-hydrating (and re-decoding 3 years
 * of typed-array columns) from IndexedDB every time. Keeps the same capacity
 * as the on-disk prune window. Entries are snapshots: the owner may replace
 * them on completion, never mutate the record in place.
 */
const memCache = new Map<string, KlineCacheRecord>();
const MEM_CACHE_MAX = 8;

function memGet(key: string): KlineCacheRecord | null {
  const rec = memCache.get(key);
  return rec ?? null;
}

function memSet(key: string, rec: KlineCacheRecord): void {
  memCache.set(key, rec);
  if (memCache.size > MEM_CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
}

/** Drop the in-memory copy for a key (e.g. after an explicit invalidation). */
export function forgetKlineCache(key: string): void {
  memCache.delete(key);
}


let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const os = db.createObjectStore(STORE, { keyPath: "key" });
            os.createIndex(META_INDEX, META_INDEX, { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => resolve();
    tx.onerror = () => resolve();
  });
}

export function encodeBars(bars: Candle[]): Pick<
  KlineCacheRecord,
  "count" | "times" | "opens" | "highs" | "lows" | "closes" | "volumes"
> {
  const n = bars.length;
  const times = new Int32Array(n);
  const opens = new Float64Array(n);
  const highs = new Float64Array(n);
  const lows = new Float64Array(n);
  const closes = new Float64Array(n);
  const volumes = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    times[i] = b.time;
    opens[i] = b.open;
    highs[i] = b.high;
    lows[i] = b.low;
    closes[i] = b.close;
    volumes[i] = b.volume;
  }
  return { count: n, times, opens, highs, lows, closes, volumes };
}

export function decodeBars(rec: KlineCacheRecord): Candle[] {
  const n = Math.min(rec.count, rec.times.length);
  const out: Candle[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      time: rec.times[i],
      open: rec.opens[i],
      high: rec.highs[i],
      low: rec.lows[i],
      close: rec.closes[i],
      volume: rec.volumes[i],
    };
  }
  return out;
}

export async function readKlineCache(key: string): Promise<KlineCacheRecord | null> {
  const hit = memGet(key);
  if (hit) return hit;
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE, "readonly");
    const rec = await wrap<KlineCacheRecord>(tx.objectStore(STORE).get(key));
    await done(tx);
    const ok = rec && rec.times && rec.times.length === rec.count ? rec : null;
    if (ok) memSet(key, ok);
    return ok;
  } catch {
    return null;
  }
}

export async function writeKlineCache(
  key: string,
  ident: { symbol: string; market: Market; interval: Interval },
  meta: KlineCacheMeta,
  bars: Candle[],
): Promise<void> {
  const db = await openDb();
  if (!db || !bars.length) return;
  try {
    const rec: KlineCacheRecord = {
      key,
      symbol: ident.symbol,
      market: ident.market,
      interval: ident.interval,
      fetchedAt: Date.now(),
      ...meta,
      ...encodeBars(bars),
    };
    memSet(key, rec);
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    await done(tx);
  } catch {
    /* cache is an optimisation — never surface a write failure */
  }
}

/** A full 3-year 15m series is ~5MB of columns, so the library stays small. */
export async function pruneKlineCache(maxEntries = 8): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const index = tx.objectStore(STORE).index(META_INDEX);
    const cursorReq = index.openCursor(null, "prev");
    let seen = 0;
    await new Promise<void>((resolve) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve();
          return;
        }
        seen += 1;
        if (seen > maxEntries) cursor.delete();
        cursor.continue();
      };
      cursorReq.onerror = () => resolve();
    });
    await done(tx);
  } catch {
    /* ignore */
  }
}
