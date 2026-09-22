import type { StateCreator } from "zustand";
import {
  appendCapped,
  intervalSec,
  prependBars as prependContiguous,
} from "../bars.ts";
import { BAR_CAP, PANE_CAP } from "../constants.ts";
import { bumpLineage, type DataSource, type LineageInfo } from "../lineage.ts";
import type {
  BookLevel,
  Candle,
  CrosshairLink,
  HistoryStatus,
  TapeTrade,
  Ticker,
  TimeRange,
  WatchItem,
} from "../types.ts";

/** Standing value for a pane whose feed has not produced bars yet. A fresh `[]`
 * in a selector re-renders the pane forever instead of once. */
export const NO_BARS: Candle[] = [];

/** Monotonic counter making WS trade ids unique as React list keys. */
let tradeSeq = 0;

/**
 * High-frequency market data. Never persisted (bars/ticker/book churn every WS
 * tick; the persist partialize in store.ts excludes this slice entirely).
 */
export interface MarketSlice {
  bars: Candle[];
  /** Tail of `bars` (live, still-open bar) — updated in place on WS ticks so
   * the 100k array reference stays stable and only lightweight subscribers
   * (chart legend / engine live path) re-render. */
  lastBar: Candle | null;
  paneBars: Record<string, Candle[]>;
  compareBars: Record<string, Candle[]>;
  historyStatus: Record<string, HistoryStatus>;
  liveOpenTime: number;
  linkedRange: (TimeRange & { paneId: string }) | null;
  linkedCrosshair: CrosshairLink | null;
  ticker: Ticker | null;
  bids: BookLevel[];
  asks: BookLevel[];
  trades: TapeTrade[];
  watch: WatchItem[];
  watchSymbols: string[];
  live: boolean;
  /** Connection health: connecting | live | degraded | offline */
  conn: "connecting" | "live" | "degraded" | "offline";
  /** Live-feed integrity counters (gaps, anomalous ticks, cross-source skew). */
  dataWarnings: { gaps: number; anomalies: number; skew: number };
  reportDataWarning: (
    patch: Partial<{ gaps: number; anomalies: number; skew: number }>,
  ) => void;
  /** Resident OKX secondary stream status (concurrent dual-source). */
  okxLive: boolean;
  okxLast: { time: number; close: number } | null;
  setOkxLive: (v: boolean) => void;
  setOkxLast: (t: { time: number; close: number }) => void;
  /** Per-series provenance: how many resident bars came from each source. */
  dataLineage: Record<string, LineageInfo>;
  recordSource: (key: string, source: DataSource, n?: number) => void;
  mark: number;
  funding: number;
  nextFunding: number;
  setPremium: (mark: number, funding: number, next: number) => void;
  setBars: (b: Candle[]) => void;
  appendOlderBars: (b: Candle[]) => number;
  /** source tags the accepted tick in the master series' lineage (P1-B2). */
  updateBar: (b: Candle, source?: DataSource) => void;
  setPaneBars: (paneId: string, bars: Candle[]) => void;
  appendOlderPaneBars: (paneId: string, bars: Candle[]) => number;
  updatePaneBar: (paneId: string, bar: Candle) => void;
  setCompareBars: (symbol: string, bars: Candle[]) => void;
  updateCompareBar: (symbol: string, bar: Candle) => void;
  appendOlderCompareBars: (symbol: string, bars: Candle[]) => number;
  setHistoryStatus: (key: string, patch: Partial<HistoryStatus>) => void;
  setLiveOpenTime: (t: number) => void;
  setLinkedRange: (r: (TimeRange & { paneId: string }) | null) => void;
  setLinkedCrosshair: (c: CrosshairLink | null) => void;
  setTicker: (t: Ticker) => void;
  setBook: (bids: BookLevel[], asks: BookLevel[]) => void;
  pushTrade: (t: TapeTrade) => void;
  setWatch: (w: WatchItem[]) => void;
  addWatch: (s: string) => void;
  removeWatch: (s: string) => void;
  setLive: (v: boolean) => void;
  setConn: (c: "connecting" | "live" | "degraded" | "offline") => void;
}

export const marketSlice: StateCreator<
  import("../store").TerminalState,
  [],
  [],
  MarketSlice
> = (set, get) => ({
  bars: [],
  lastBar: null,
  paneBars: {},
  compareBars: {},
  historyStatus: {},
  liveOpenTime: 0,
  linkedRange: null,
  linkedCrosshair: null,
  ticker: null,
  bids: [],
  asks: [],
  trades: [],
  watch: [],
  watchSymbols: [],
  live: false,
  conn: "connecting",
  dataWarnings: { gaps: 0, anomalies: 0, skew: 0 },
  okxLive: false,
  okxLast: null,
  dataLineage: {},
  recordSource: (key, source, n = 1) =>
    set((s) => ({
      dataLineage: {
        ...s.dataLineage,
        [key]: bumpLineage(s.dataLineage[key], source, n),
      },
    })),
  mark: 0,
  funding: 0,
  nextFunding: 0,
  setBars: (bars) =>
    set({
      bars: bars.slice(-BAR_CAP),
      lastBar: bars.at(-1) ?? null,
      liveOpenTime: bars.at(-1)?.time ?? 0,
    }),
  appendOlderBars: (incoming) => {
    const cur = get().bars;
    const next = prependContiguous(
      cur,
      incoming,
      BAR_CAP,
      get().liveOpenTime || cur[0]?.time,
    );
    set({ bars: next });
    return next.length - cur.length;
  },
  updateBar: (bar, source) => {
    const cur = get().bars;
    const last = cur[cur.length - 1];
    // Tag the accepted tick's source in the master series lineage. The key
    // mirrors historyKey(market, symbol, interval) — see history.ts.
    const lineageKey = () =>
      `${get().market}:${get().symbol}:${get().interval}`;

    // If we have nothing yet (history still loading or failed), accept the
    // live bar as a seed — otherwise a blank store swallows every update.
    if (!last) {
      set({
        bars: [bar].slice(-BAR_CAP),
        lastBar: bar,
        liveOpenTime: bar.time,
      });
      if (source) get().recordSource(lineageKey(), source);
      return;
    }

    if (bar.time < last.time) return; // Outdated

    if (last.time === bar.time) {
      // Same open bar ticking: update the tail IN PLACE — the resident array
      // reference stays stable, so heavy `bars` subscribers don't re-render;
      // only the lightweight lastBar path (legend + engine live update) fires.
      cur[cur.length - 1] = bar;
      set({ lastBar: bar, liveOpenTime: bar.time });
      if (source) get().recordSource(lineageKey(), source);
      return;
    }

    // ✅ Only add as NEW bar if it's at the correct interval
    const stepSec = intervalSec(get().interval);
    // Allow small tolerance for network jitter
    if (Math.abs(bar.time - (last.time + stepSec)) <= stepSec * 0.5) {
      set({
        bars: appendCapped(cur, bar, BAR_CAP),
        lastBar: bar,
        liveOpenTime: bar.time,
      });
      if (source) get().recordSource(lineageKey(), source);
    } else if (bar.time > last.time + stepSec) {
      console.warn(
        "[Store] Skipped gap in bar times:",
        last.time,
        "->",
        bar.time,
      );
      // Don't add intermediate fake bars
    }
  },
  setPaneBars: (paneId, bars) =>
    set({ paneBars: { ...get().paneBars, [paneId]: bars.slice(-PANE_CAP) } }),
  appendOlderPaneBars: (paneId, incoming) => {
    const cur = get().paneBars[paneId] ?? [];
    const live = paneId === "p0" ? get().liveOpenTime : cur.at(-1)?.time;
    const next = prependContiguous(cur, incoming, PANE_CAP, live);
    set({ paneBars: { ...get().paneBars, [paneId]: next } });
    return next.length - cur.length;
  },
  updatePaneBar: (paneId, bar) => {
    const cur = get().paneBars[paneId] ?? [];
    const last = cur[cur.length - 1];
    if (last && bar.time < last.time) return;
    let next: Candle[];
    if (last && last.time === bar.time) {
      next = cur.slice();
      next[next.length - 1] = bar;
    } else {
      next = appendCapped(cur, bar, PANE_CAP);
    }
    set({ paneBars: { ...get().paneBars, [paneId]: next } });
  },
  setCompareBars: (symbol, bars) =>
    set({
      compareBars: { ...get().compareBars, [symbol]: bars.slice(-BAR_CAP) },
    }),
  appendOlderCompareBars: (symbol, incoming) => {
    const cur = get().compareBars[symbol] ?? [];
    const next = prependContiguous(
      cur,
      incoming,
      BAR_CAP,
      get().liveOpenTime || undefined,
    );
    set({ compareBars: { ...get().compareBars, [symbol]: next } });
    return next.length - cur.length;
  },
  updateCompareBar: (symbol, bar) => {
    const cur = get().compareBars[symbol] ?? [];
    const last = cur[cur.length - 1];
    if (last && bar.time < last.time) return;
    let next: Candle[];
    if (last && last.time === bar.time) {
      next = cur.slice();
      next[next.length - 1] = bar;
    } else {
      next = appendCapped(cur, bar, BAR_CAP);
    }
    set({ compareBars: { ...get().compareBars, [symbol]: next } });
  },
  setHistoryStatus: (key, patch) => {
    const prev = get().historyStatus[key];
    const next: HistoryStatus = {
      phase: patch.phase ?? prev?.phase ?? "tail",
      bars: patch.bars ?? prev?.bars ?? 0,
      target: patch.target ?? prev?.target ?? 0,
      oldest: patch.oldest ?? prev?.oldest ?? 0,
      newest: patch.newest ?? prev?.newest ?? 0,
      floorTime: patch.floorTime ?? prev?.floorTime ?? 0,
      cached: patch.cached ?? prev?.cached ?? false,
    };
    set({ historyStatus: { ...get().historyStatus, [key]: next } });
  },
  setLiveOpenTime: (liveOpenTime) => set({ liveOpenTime }),
  setLinkedRange: (linkedRange) => set({ linkedRange }),
  setLinkedCrosshair: (linkedCrosshair) => set({ linkedCrosshair }),
  setTicker: (ticker) => set({ ticker }),
  setBook: (bids, asks) => set({ bids, asks }),
  // Monotonic id so a replayed WS trade (same exchange id + time) never
  // collides as a React list key.
  pushTrade: (t) =>
    set({
      trades: [{ ...t, id: `${t.id}-${tradeSeq++}` }, ...get().trades].slice(
        0,
        80,
      ),
    }),
  setWatch: (watch) => set({ watch }),
  addWatch: (s) => {
    const symbol = s.toUpperCase();
    if (get().watchSymbols.includes(symbol)) return;
    set({ watchSymbols: [symbol, ...get().watchSymbols] });
  },
  removeWatch: (s) =>
    set({ watchSymbols: get().watchSymbols.filter((x) => x !== s) }),
  setLive: (live) => set({ live, conn: live ? "live" : "degraded" }),
  setConn: (conn) => set({ conn }),
  reportDataWarning: (patch) =>
    set((s) => ({
      dataWarnings: {
        gaps: s.dataWarnings.gaps + (patch.gaps ?? 0),
        anomalies: s.dataWarnings.anomalies + (patch.anomalies ?? 0),
        skew: s.dataWarnings.skew + (patch.skew ?? 0),
      },
    })),
  setOkxLive: (okxLive) => set({ okxLive }),
  setOkxLast: (okxLast) => set({ okxLast }),
  setPremium: (mark, funding, nextFunding) =>
    set({ mark, funding, nextFunding }),
});
