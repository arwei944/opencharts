import type { Candle } from "./types.ts";

/**
 * Columnar OHLCV storage — the interchange format for series data. Compared
 * to `Candle[]` this is compact (one typed array per field, ~1/3 the object
 * overhead), GC-friendly, and IDB-serializes directly. Bars stay object-based
 * in the store (in-place tail updates rely on the stable array reference), so
 * columns serve the I/O and cache layers.
 */
export interface CandleColumns {
  count: number;
  times: Int32Array;
  opens: Float64Array;
  highs: Float64Array;
  lows: Float64Array;
  closes: Float64Array;
  volumes: Float64Array;
}

/** Encode a `Candle[]` in one allocation pass. */
export function colsOf(bars: Candle[]): CandleColumns {
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

/** Decode columns back into `Candle[]` (used at API boundaries). */
export function barsOf(cols: CandleColumns, count = cols.count): Candle[] {
  const n = Math.max(0, Math.min(count, cols.count, cols.times.length));
  const out: Candle[] = new Array(n);
  const { times, opens, highs, lows, closes, volumes } = cols;
  for (let i = 0; i < n; i++) {
    out[i] = {
      time: times[i],
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i],
    };
  }
  return out;
}

/** Shallow-copy a column record (new arrays, same rows). */
export function cloneCols(cols: CandleColumns): CandleColumns {
  return {
    count: cols.count,
    times: cols.times.slice(),
    opens: cols.opens.slice(),
    highs: cols.highs.slice(),
    lows: cols.lows.slice(),
    closes: cols.closes.slice(),
    volumes: cols.volumes.slice(),
  };
}

/** New columns = [left ... right] (header concat for left-grow fills). */
export function concatCols(
  left: CandleColumns,
  right: CandleColumns,
): CandleColumns {
  const ln = left.count;
  const rn = right.count;
  const n = ln + rn;
  const arr = <T extends Int32Array | Float64Array>(
    ctor: new (n: number) => T,
    a: T,
    b: T,
  ): T => {
    const out = new ctor(n);
    (out as unknown as { set: (v: T, o?: number) => void }).set(a, 0);
    (out as unknown as { set: (v: T, o?: number) => void }).set(b, ln);
    return out;
  };
  return {
    count: n,
    times: arr(Int32Array, left.times, right.times),
    opens: arr(Float64Array, left.opens, right.opens),
    highs: arr(Float64Array, left.highs, right.highs),
    lows: arr(Float64Array, left.lows, right.lows),
    closes: arr(Float64Array, left.closes, right.closes),
    volumes: arr(Float64Array, left.volumes, right.volumes),
  };
}

/** Keep only the most recent `cap` rows (drop the oldest, like prependBars). */
export function trimCols(cols: CandleColumns, cap: number): CandleColumns {
  if (cols.count <= cap) return cols;
  const drop = cols.count - cap;
  const sliced: CandleColumns = {
    count: cap,
    times: cols.times.slice(drop),
    opens: cols.opens.slice(drop),
    highs: cols.highs.slice(drop),
    lows: cols.lows.slice(drop),
    closes: cols.closes.slice(drop),
    volumes: cols.volumes.slice(drop),
  };
  return sliced;
}
