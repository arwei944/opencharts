import { fetchKlines } from "./api.ts";
import { intervalSec } from "./bars.ts";
import {
  BAR_CAP,
  HISTORY_PAGE,
  PREFILL_CACHE_CHECKPOINT,
  PREFILL_CONCURRENCY,
  PREFILL_RETRY_MS,
  VIEWPORT_LOOKAHEAD_BARS,
} from "./constants.ts";
import { horizonOf, type Horizon } from "./horizon.ts";
import { needsOlderData, olderWaveEnds } from "./history-paging.ts";
import {
  decodeBars,
  pruneKlineCache,
  readKlineCache,
  appendKlineCache,
} from "./kline-cache.ts";
import { useTerminal } from "./store.ts";
import type { Candle, Interval, Market } from "./types.ts";

export type SeriesKind = "master" | "pane" | "compare";

/**
 * Identifies one fillable series. `jobKey` is what the mouse/pane waits on
 * (a pane is filled even if another pane shares the same data), `dataKey` is the
 * cache identity (symbol × market × interval).
 */
export interface SeriesRef {
  jobKey: string;
  kind: SeriesKind;
  paneId?: string;
  symbol: string;
  market: Market;
  interval: Interval;
}

export function masterRef(
  symbol: string,
  market: Market,
  interval: Interval,
  paneId = "p0",
): SeriesRef {
  return {
    jobKey: `${paneId}|${market}|${symbol}|${interval}`,
    kind: "master",
    paneId,
    symbol,
    market,
    interval,
  };
}

export function paneRef(
  paneId: string,
  symbol: string,
  market: Market,
  interval: Interval,
): SeriesRef {
  return {
    jobKey: `${paneId}|${market}|${symbol}|${interval}`,
    kind: "pane",
    paneId,
    symbol,
    market,
    interval,
  };
}

export function compareRef(
  symbol: string,
  market: Market,
  interval: Interval,
): SeriesRef {
  return {
    jobKey: `cmp|${market}|${symbol}|${interval}`,
    kind: "compare",
    symbol,
    market,
    interval,
  };
}

function dataKey(ref: SeriesRef): string {
  return historyKey(ref.market, ref.symbol, ref.interval);
}

/** Identity of a filled series in the status map and the IndexedDB cache. */
export function historyKey(
  market: Market,
  symbol: string,
  interval: Interval,
): string {
  return `${market}:${symbol}:${interval}`;
}

function readBars(ref: SeriesRef): Candle[] {
  const st = useTerminal.getState();
  if (ref.kind === "compare") return st.compareBars[ref.symbol] ?? [];
  if (ref.kind === "pane") return st.paneBars[ref.paneId ?? "p0"] ?? [];
  return st.bars;
}

function setAll(ref: SeriesRef, bars: Candle[]): void {
  const st = useTerminal.getState();
  if (ref.kind === "compare") st.setCompareBars(ref.symbol, bars);
  else if (ref.kind === "pane") st.setPaneBars(ref.paneId ?? "p0", bars);
  else st.setBars(bars);
}

function commitOlder(ref: SeriesRef, older: Candle[]): number {
  const st = useTerminal.getState();
  if (ref.kind === "compare")
    return st.appendOlderCompareBars(ref.symbol, older);
  if (ref.kind === "pane")
    return st.appendOlderPaneBars(ref.paneId ?? "p0", older);
  return st.appendOlderBars(older);
}

/** Contiguous right-hand append used to close the gap between a cached tail and now. */
function appendNewer(ref: SeriesRef, newer: Candle[]): void {
  const cur = readBars(ref);
  const last = cur[cur.length - 1];
  if (!last) {
    setAll(ref, newer);
    return;
  }
  const fresh = newer.filter((b) => b.time > last.time);
  if (!fresh.length) return;
  setAll(ref, [...cur, ...fresh].slice(-BAR_CAP));
}

function setStatus(
  ref: SeriesRef,
  patch: Parameters<
    ReturnType<typeof useTerminal.getState>["setHistoryStatus"]
  >[1],
) {
  useTerminal.getState().setHistoryStatus(dataKey(ref), patch);
}

function getStatus(ref: SeriesRef) {
  return useTerminal.getState().historyStatus[dataKey(ref)];
}

async function page(ref: SeriesRef, endTimeSec?: number): Promise<Candle[]> {
  try {
    return await fetchKlines({
      data: {
        symbol: ref.symbol,
        interval: ref.interval,
        market: ref.market,
        limit: HISTORY_PAGE,
        endTime: endTimeSec == null ? undefined : endTimeSec * 1000 - 1,
      },
    });
  } catch (error) {
    console.error("[History] fetchKlines failed:", error);
    throw error;
  }
}

/** Drop the in-progress live bar: REST can hand back a bar the WS already owns. */
function closedOnly(ref: SeriesRef, bars: Candle[]): Candle[] {
  const live =
    ref.kind === "compare" || ref.kind === "master"
      ? useTerminal.getState().liveOpenTime
      : 0;
  if (!live) return bars;
  const cur = readBars(ref);
  const oldestLoaded = cur[0]?.time ?? Infinity;
  return bars.filter((b) => b.time < oldestLoaded && b.time < live);
}

/** Depth we intend to reach for this series, and the bar count that represents. */
function horizonFor(ref: SeriesRef): Horizon {
  return horizonOf(ref.interval, Math.floor(Date.now() / 1000));
}

type Job = { gen: number; running: boolean };

const jobs = new Map<string, Job>();

function jobFor(jobKey: string): Job {
  let job = jobs.get(jobKey);
  if (!job) {
    job = { gen: 0, running: false };
    jobs.set(jobKey, job);
  }
  return job;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fill one series to its depth limit in the background. Idempotent: a second call
 * while a job runs is ignored, a call after a failure restarts it, and switching
 * symbol/interval cancels the old job by generation.
 */
export function ensureCompleteHistory(ref: SeriesRef): void {
  const job = jobFor(ref.jobKey);
  if (job.running) return;
  if (readBars(ref).length && getStatus(ref)?.phase === "complete") return;
  job.running = true;
  const gen = ++job.gen;
  const alive = () => job.gen === gen;
  void runFill(ref, alive).finally(() => {
    if (alive()) job.running = false;
  });
}

/** Cancel a fill belonging to a pane that went away or changed interval. */
export function cancelHistory(jobKey: string): void {
  const job = jobs.get(jobKey);
  if (!job) return;
  job.gen += 1;
  job.running = false;
}

async function runFill(ref: SeriesRef, alive: () => boolean): Promise<void> {
  const { floorTime, targetBars, stepSec } = horizonFor(ref);
  try {
    const completeFromCache = await hydrateFromCache(ref, alive);
    if (!alive()) return;
    await fillTail(ref, alive, stepSec);
    if (!alive()) return;
    setStatus(ref, { phase: "prefill", target: targetBars, floorTime });
    const added = await fillOlder(ref, alive, floorTime, targetBars, stepSec);
    if (added > 0 || !completeFromCache)
      await snapshot(ref, readBars(ref)[0]?.time ?? floorTime, true);
  } catch {
    if (alive()) setStatus(ref, { phase: "error" });
  }
}

async function hydrateFromCache(
  ref: SeriesRef,
  alive: () => boolean,
): Promise<boolean> {
  if (readBars(ref).length) return false;
  const rec = await readKlineCache(dataKey(ref));
  if (!rec || !alive()) return false;
  const bars = decodeBars(rec);
  if (!bars.length) return false;
  setAll(ref, bars);
  setStatus(ref, {
    cached: true,
    oldest: bars[0].time,
    newest: bars[bars.length - 1].time,
    bars: bars.length,
    floorTime: rec.floorTime,
    phase: "tail",
  });
  return rec.complete;
}

/** Close whatever gap a cached (or truncated first) tail left behind up to now. */
async function fillTail(
  ref: SeriesRef,
  alive: () => boolean,
  stepSec: number,
): Promise<void> {
  let cur = readBars(ref);
  if (!cur.length) {
    const first = await page(ref);
    if (!alive()) return;
    if (!first.length) throw new Error("no data");
    setAll(ref, first);
    cur = first;
  }
  const newest = cur[cur.length - 1].time;
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - newest < stepSec * 2) return;
  // The cached tail is stale (tab was closed, or the fill ran a while ago): walk forward.
  let cursor = newest;
  for (let guard = 0; guard < 40 && alive(); guard++) {
    const next = await page(ref, cursor + HISTORY_PAGE * stepSec);
    if (!alive()) return;
    const newer = next.filter((b) => b.time > cursor);
    if (!newer.length) return;
    appendNewer(ref, newer);
    cursor = newer[newer.length - 1].time;
    if (cursor >= nowSec || newer.length < HISTORY_PAGE) return;
  }
}

/**
 * The backwards fill. Waves of `PREFILL_CONCURRENCY` pages are fetched in
 * parallel but committed oldest-gap-first, so the resident array only ever grows
 * by contiguous blocks — which is what keeps every commit a cheap concat and the
 * rendered window untouched.
 */
async function fillOlder(
  ref: SeriesRef,
  alive: () => boolean,
  floorTime: number,
  targetBars: number,
  stepSec: number,
): Promise<number> {
  let addedTotal = 0;
  let committed = 0;
  let failures = 0;
  while (alive()) {
    const cur = readBars(ref);
    const oldest = cur[0]?.time ?? 0;
    if (!oldest) break;
    if (oldest <= floorTime + stepSec || cur.length >= targetBars) break;
    const wave: Promise<Candle[] | null>[] = [];
    for (let i = 0; i < PREFILL_CONCURRENCY; i++) {
      const endTime = oldest - i * HISTORY_PAGE * stepSec;
      if (endTime <= floorTime) break;
      wave.push(page(ref, endTime).catch(() => null));
    }
    const pages = await Promise.all(wave);
    if (!alive()) break;
    let addedThisWave = 0;
    let short = false;
    for (const raw of pages) {
      if (!raw) {
        failures += 1;
        continue;
      }
      if (raw.length < HISTORY_PAGE) short = true;
      const older = closedOnly(ref, raw);
      if (!older.length) {
        short = true;
        continue;
      }
      addedThisWave += commitOlder(ref, older);
    }
    if (!addedThisWave) {
      if (failures >= 3) {
        setStatus(ref, { phase: "error" });
        break;
      }
      await sleep(PREFILL_RETRY_MS * Math.max(1, failures));
      continue;
    }
    failures = 0;
    addedTotal += addedThisWave;
    committed += addedThisWave;
    const after = readBars(ref);
    setStatus(ref, {
      phase: "prefill",
      bars: after.length,
      target: targetBars,
      oldest: after[0]?.time ?? 0,
      newest: after[after.length - 1]?.time ?? 0,
      floorTime,
    });
    if (short) break;
    if (committed >= PREFILL_CACHE_CHECKPOINT) {
      committed = 0;
      await snapshot(ref, after[0]?.time ?? floorTime, false);
    }
  }
  const final = readBars(ref);
  setStatus(ref, {
    phase: "complete",
    bars: final.length,
    target: final.length,
    oldest: final[0]?.time ?? 0,
    newest: final[final.length - 1]?.time ?? 0,
    floorTime,
  });
  return addedTotal;
}

async function snapshot(
  ref: SeriesRef,
  floorTime: number,
  complete: boolean,
): Promise<void> {
  const bars = readBars(ref);
  if (!bars.length) return;
  // Incremental when the previous snapshot is a left-prefix of the resident
  // series (the normal fill pattern); falls back to a full write otherwise.
  await appendKlineCache(
    dataKey(ref),
    { symbol: ref.symbol, market: ref.market, interval: ref.interval },
    { stepSec: intervalSec(ref.interval), floorTime, complete },
    bars,
  );
  if (complete) void pruneKlineCache();
}

/**
 * Viewport safety net: only reachable if the mouse out-pans the background fill.
 * The fill itself walks the same frontier, so restarting the job is the correct
 * (and only) response — never a separate request that would race the cursor.
 */
export function ensureCoverage(ref: SeriesRef, fromTime: number): void {
  const bars = readBars(ref);
  const oldest = bars[0]?.time;
  if (oldest == null) {
    ensureCompleteHistory(ref);
    return;
  }
  const stepSec = intervalSec(ref.interval);
  if (!needsOlderData(fromTime, oldest, stepSec, VIEWPORT_LOOKAHEAD_BARS))
    return;
  const status = getStatus(ref);
  const job = jobs.get(ref.jobKey);
  if (job?.running) return;
  if (status?.phase === "complete") {
    // Interval horizon reached — the viewport wants more. Walk further back
    // on demand (infinite scroll) instead of giving up at the 3y budget.
    extendHistory(ref, fromTime);
    return;
  }
  ensureCompleteHistory(ref);
}

/**
 * Extend the left frontier past the interval horizon on demand (infinite
 * scroll). Page-by-page walk from the resident front; the window is capped by
 * `prependBars` (oldest bars fall off the BAR_CAP budget), so memory stays
 * fixed while the visible window keeps sliding left.
 */
export function extendHistory(ref: SeriesRef, untilTime: number): void {
  const job = jobFor(ref.jobKey);
  if (job.running) return;
  const oldest = readBars(ref)[0]?.time;
  // Strict comparison: the viewport resting exactly on the loaded front (the
  // zoomed-out/fit case) must still extend — "show me everything" means
  // "everything available", fetched on demand, not "the 3y budget so far".
  if (oldest == null || oldest < untilTime) return;
  job.running = true;
  const gen = ++job.gen;
  const alive = () => job.gen === gen;
  void runExtend(ref, alive, untilTime).finally(() => {
    if (alive()) job.running = false;
  });
}

async function runExtend(
  ref: SeriesRef,
  alive: () => boolean,
  untilTime: number,
): Promise<void> {
  const stepSec = intervalSec(ref.interval);
  let failures = 0;
  while (alive()) {
    const cur = readBars(ref);
    const oldest = cur[0]?.time;
    if (oldest == null || oldest < untilTime) break;
    const ends = olderWaveEnds(
      oldest,
      stepSec,
      HISTORY_PAGE,
      PREFILL_CONCURRENCY,
    );
    const pages = await Promise.all(
      ends.map((end) => page(ref, end).catch(() => null)),
    );
    if (!alive()) break;
    let addedThisWave = 0;
    let short = false;
    for (const raw of pages) {
      if (!raw) {
        failures += 1;
        continue;
      }
      if (raw.length < HISTORY_PAGE) short = true;
      const older = closedOnly(ref, raw);
      if (!older.length) {
        short = true;
        continue;
      }
      addedThisWave += commitOlder(ref, older);
    }
    if (!addedThisWave) {
      if (failures >= 3) {
        setStatus(ref, { phase: "error" });
        break;
      }
      await sleep(PREFILL_RETRY_MS * Math.max(1, failures));
      continue;
    }
    failures = 0;
    const after = readBars(ref);
    // Keep the phase "complete": ChartPane freezes the series while
    // historyStatus.phase !== "complete" (left-grows park instead of commit),
    // and flipping back to "prefill" here would park every extended page and
    // visually stall the infinite scroll. Progress (oldest/newest/bars) still
    // moves so the health panel reflects the deeper history.
    setStatus(ref, {
      bars: after.length,
      target: after.length,
      oldest: after[0]?.time ?? 0,
      newest: after[after.length - 1]?.time ?? 0,
      floorTime: untilTime,
    });
    if (short) break;
  }
}
