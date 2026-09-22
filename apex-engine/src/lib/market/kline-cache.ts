import type { Candle, Interval, Market } from "./types.ts";
import { barsOf, colsOf, concatCols, type CandleColumns } from "./columns.ts";

const DB_NAME = "apex-kline-cache";
const DB_VERSION = 1;
const STORE = "klines";
const META_INDEX = "fetchedAt";

/** The cache record is a CandleColumns record plus identity/metadata. */
export interface KlineCacheRecord extends CandleColumns {
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

export function encodeBars(
  bars: Candle[],
): Pick<
  KlineCacheRecord,
  "count" | "times" | "opens" | "highs" | "lows" | "closes" | "volumes"
> {
  return colsOf(bars);
}

export function decodeBars(rec: KlineCacheRecord): Candle[] {
  return barsOf(rec);
}

export async function readKlineCache(
  key: string,
): Promise<KlineCacheRecord | null> {
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

/**
 * Incremental write: when the in-memory snapshot is a strict prefix of the
 * resident series (the history fill grows leftward one page at a time), only
 * the newly-fetched bars are encoded and spliced onto the old typed arrays —
 * no full 100k-element re-encode per checkpoint.
 */
export async function appendKlineCache(
  key: string,
  ident: { symbol: string; market: Market; interval: Interval },
  meta: KlineCacheMeta,
  bars: Candle[],
): Promise<void> {
  const db = await openDb();
  if (!db || !bars.length) return;
  const prev = memGet(key);
  const hasPrefix =
    !!prev &&
    prev.count <= bars.length &&
    prev.times[0] === bars[bars.length - prev.count].time;
  if (!hasPrefix) {
    // No usable snapshot: fall back to a full write.
    await writeKlineCache(key, ident, meta, bars);
    return;
  }
  const p = prev as KlineCacheRecord;
  const added = bars.slice(0, bars.length - p.count);
  if (!added.length) return;
  const enc = colsOf(added);
  const merged = concatCols(enc, p);
  const rec: KlineCacheRecord = {
    ...p,
    fetchedAt: Date.now(),
    ...meta,
    count: bars.length,
    times: merged.times,
    opens: merged.opens,
    highs: merged.highs,
    lows: merged.lows,
    closes: merged.closes,
    volumes: merged.volumes,
  };
  memSet(key, rec);
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    await done(tx);
  } catch {
    /* ignore */
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
