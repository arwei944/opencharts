import { intervalSec } from "./bars.ts";
import { chartTelemetry } from "./telemetry.ts";
import { dataSourcePort } from "./ports.ts";
import { useTerminal } from "./store.ts";
import type { Candle, Interval, Market } from "./types.ts";

/**
 * Gap self-heal (P2-C4): resident series can develop holes — a WS drop-out
 * window, or REST page boundaries that missed bars. `findGaps` locates them,
 * `healMasterGaps` walks each gap with endTime-paged REST fetches and merges
 * the authoritative pages into the resident array (full setData → engine
 * commit). Pure parts are unit-tested; the fetch loop is driven from the
 * lifecycle hook on a slow interval so a heal never fights the live feed.
 */

export interface TimeGap {
  /** open time of the last resident bar before the hole */
  fromTime: number;
  /** open time of the first resident bar after the hole */
  toTime: number;
  /** how many bars are missing inside */
  missing: number;
}

/** Holes where two consecutive bars are > minGapSteps × step apart. */
export function findGaps(
  bars: Candle[],
  stepSec: number,
  minGapSteps = 3,
): TimeGap[] {
  const gaps: TimeGap[] = [];
  for (let i = 1; i < bars.length; i++) {
    const diff = bars[i].time - bars[i - 1].time;
    if (diff > minGapSteps * stepSec) {
      gaps.push({
        fromTime: bars[i - 1].time,
        toTime: bars[i].time,
        missing: Math.floor(diff / stepSec) - 1,
      });
    }
  }
  return gaps;
}

/**
 * Insert a fetched page into the resident array, replacing any overlapping
 * bars (the page is authoritative for its window). Returns a NEW array.
 */
export function mergeGapPage(
  bars: Candle[],
  page: Candle[],
  fromTime: number,
  toTime: number,
): Candle[] {
  const fresh = page.filter((b) => b.time > fromTime && b.time <= toTime);
  if (!fresh.length) return bars;
  const first = fresh[0].time;
  const last = fresh[fresh.length - 1].time;
  let lo = 0;
  while (lo < bars.length && bars[lo].time < first) lo += 1;
  let hi = lo;
  while (hi < bars.length && bars[hi].time <= last) hi += 1;
  return [...bars.slice(0, lo), ...fresh, ...bars.slice(hi)];
}

/** Walk one gap with endTime-paged fetches; merges into the resident on progress. */
export async function healGap(
  gap: TimeGap,
  symbol: string,
  market: Market,
  interval: Interval,
  bars: Candle[],
  onResult: (merged: Candle[]) => void,
): Promise<number> {
  // Binance `endTime` paging returns the LIMIT bars ending at/after endTime —
  // i.e. bars OLDER than the cursor, which is the opposite direction from the
  // gap. Ask for the window ending at the gap's far edge in ONE page (gaps we
  // heal are << 1000 bars) and filter to the hole; the authoritative page is
  // merged by time, replacing anything overlapping.
  const page = await dataSourcePort
    .fetchKlines({
      symbol,
      interval,
      market,
      limit: 1000,
      endTime: gap.toTime * 1000 - 1,
    })
    .catch(() => [] as Candle[]);
  const fresh = page.filter(
    (b) => b.time > gap.fromTime && b.time <= gap.toTime,
  );
  if (!fresh.length) return 0;
  onResult(mergeGapPage(bars, fresh, gap.fromTime, gap.toTime));
  return fresh.length;
}

/** Heal the master series' holes (up to maxGaps per run). Returns gaps healed. */
export async function healMasterGaps(maxGaps = 2): Promise<number> {
  const st = useTerminal.getState();
  const bars = st.bars;
  if (!bars.length) return 0;
  const stepSec = intervalSec(st.interval);
  const gaps = findGaps(bars, stepSec).slice(0, maxGaps);
  let healed = 0;
  for (const gap of gaps) {
    const before = useTerminal.getState().bars;
    await healGap(gap, st.symbol, st.market, st.interval, before, (merged) => {
      useTerminal.getState().setBars(merged);
      chartTelemetry.log("healGap", {
        from: gap.fromTime,
        to: gap.toTime,
        missing: gap.missing,
      });
    });
    healed += 1;
  }
  return healed;
}
