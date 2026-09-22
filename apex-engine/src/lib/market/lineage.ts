/**
 * Data lineage (P1-B2): per-series provenance counters — how many resident
 * bars came from the REST history fill, the WS live stream, the IndexedDB
 * cache, and how many ticks the OKX secondary stream observed. This answers
 * "这根 K 线从哪来" from the health panel instead of by guessing, and gives
 * the future gap-self-heal a basis for "which source dropped bars".
 */

export type DataSource = "rest" | "ws" | "okx" | "cache";

export const DATA_SOURCES: readonly DataSource[] = [
  "rest",
  "ws",
  "okx",
  "cache",
];

export interface LineageInfo {
  sources: Record<DataSource, number>;
  lastSeen: Record<DataSource, number>;
  updatedAt: number;
}

export function emptyLineage(): LineageInfo {
  return {
    sources: { rest: 0, ws: 0, okx: 0, cache: 0 },
    lastSeen: { rest: 0, ws: 0, okx: 0, cache: 0 },
    updatedAt: 0,
  };
}

/** Increment one source's counter (default 1 bar/tick), stamp lastSeen. */
export function bumpLineage(
  cur: LineageInfo | undefined,
  source: DataSource,
  n = 1,
  now = Date.now(),
): LineageInfo {
  const base = cur ?? emptyLineage();
  return {
    sources: { ...base.sources, [source]: base.sources[source] + n },
    lastSeen: { ...base.lastSeen, [source]: now },
    updatedAt: now,
  };
}

/** Panel-facing summary: counts per source + total bars accounted for. */
export function lineageSummary(info: LineageInfo | undefined): {
  rest: number;
  ws: number;
  okx: number;
  cache: number;
  total: number;
} {
  const s = info?.sources ?? emptyLineage().sources;
  const total = s.rest + s.ws + s.okx + s.cache;
  return { rest: s.rest, ws: s.ws, okx: s.okx, cache: s.cache, total };
}
