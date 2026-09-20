import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/utils";
import { prependBars as prependContiguous, intervalSec } from "./bars";
import { BAR_CAP, DEFAULT_PANE_INTERVALS, DEFAULT_WATCH, INDICATOR_CATALOG, PANE_COUNT } from "./constants";
import type { ThemeMode } from "./constants";
import type { ChartSettings } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";
import type {
  BookLevel,
  Candle,
  ChartLayout,
  ChartPaneConfig,
  ChartType,
  CrosshairLink,
  Drawing,
  HistoryStatus,
  IndicatorInst,
  Interval,
  Market,
  TapeTrade,
  Ticker,
  TimeRange,
  Tool,
  WatchItem,
} from "./types";

function makePanes(layout: ChartLayout, prev: ChartPaneConfig[]): ChartPaneConfig[] {
  const n = PANE_COUNT[layout];
  const next: ChartPaneConfig[] = [];
  for (let i = 0; i < n; i++) {
    next.push({
      id: `p${i}`,
      interval: prev[i]?.interval ?? DEFAULT_PANE_INTERVALS[i] ?? "15m",
    });
  }
  return next;
}

interface TerminalState {
  market: Market;
  symbol: string;
  interval: Interval;
  chartType: ChartType;
  invert: boolean;
  /** 倒垂视角：价格轴上下翻转（与 invert 的颜色互换互不干涉）。 */
  mirrorAxis: boolean;
  logScale: boolean;
  showVol: boolean;
  tool: Tool;
  theme: ThemeMode;
  indicators: IndicatorInst[];
  drawings: Drawing[];
  bars: Candle[];
  layout: ChartLayout;
  panes: ChartPaneConfig[];
  paneBars: Record<string, Candle[]>;
  compareSymbols: string[];
  compareBars: Record<string, Candle[]>;
  historyStatus: Record<string, HistoryStatus>;
  liveOpenTime: number;
  syncTime: boolean;
  syncCrosshair: boolean;
  linkedRange: (TimeRange & { paneId: string }) | null;
  linkedCrosshair: CrosshairLink | null;
  ticker: Ticker | null;
  bids: BookLevel[];
  asks: BookLevel[];
  trades: TapeTrade[];
  watch: WatchItem[];
  watchSymbols: string[];
  live: boolean;
  overlay: Candle | null;
  searchOpen: boolean;
  indicatorOpen: boolean;
  settingsOpen: boolean;
  chartSettings: ChartSettings;
  mobileTab: "chart" | "book" | "trade";
  mark: number;
  funding: number;
  nextFunding: number;
  setMarket: (m: Market) => void;
  setSymbol: (s: string) => void;
  setInterval: (i: Interval) => void;
  setChartType: (t: ChartType) => void;
  toggleInvert: () => void;
  toggleMirrorAxis: () => void;
  toggleLog: () => void;
  toggleVol: () => void;
  setTool: (t: Tool) => void;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  addIndicator: (kind: IndicatorInst["kind"]) => void;
  removeIndicator: (id: string) => void;
  setBars: (b: Candle[]) => void;
  appendOlderBars: (b: Candle[]) => number;
  updateBar: (b: Candle) => void;
  setLayout: (layout: ChartLayout) => void;
  setPaneInterval: (paneId: string, interval: Interval) => void;
  setPaneBars: (paneId: string, bars: Candle[]) => void;
  appendOlderPaneBars: (paneId: string, bars: Candle[]) => number;
  updatePaneBar: (paneId: string, bar: Candle) => void;
  addCompare: (symbol: string) => void;
  removeCompare: (symbol: string) => void;
  setCompareBars: (symbol: string, bars: Candle[]) => void;
  updateCompareBar: (symbol: string, bar: Candle) => void;
  setHistoryStatus: (key: string, patch: Partial<HistoryStatus>) => void;
  setLiveOpenTime: (t: number) => void;
  appendOlderCompareBars: (symbol: string, bars: Candle[]) => number;
  setSyncTime: (v: boolean) => void;
  setSyncCrosshair: (v: boolean) => void;
  setLinkedRange: (r: (TimeRange & { paneId: string }) | null) => void;
  setLinkedCrosshair: (c: CrosshairLink | null) => void;
  setTicker: (t: Ticker) => void;
  setBook: (bids: BookLevel[], asks: BookLevel[]) => void;
  pushTrade: (t: TapeTrade) => void;
  setWatch: (w: WatchItem[]) => void;
  addWatch: (s: string) => void;
  removeWatch: (s: string) => void;
  setLive: (v: boolean) => void;
  setOverlay: (c: Candle | null) => void;
  setSearchOpen: (v: boolean) => void;
  setIndicatorOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setMobileTab: (t: TerminalState["mobileTab"]) => void;
  setPremium: (mark: number, funding: number, next: number) => void;
  addDrawing: (d: Drawing) => void;
  clearDrawings: () => void;
  popDrawing: () => void;
}

/** Standing value for a pane whose feed has not produced bars yet. A fresh `[]`
 * in a selector re-renders the pane forever instead of once. */
export const NO_BARS: Candle[] = [];

export const useTerminal = create<TerminalState>()(
  persist(
    (set, get) => ({
      market: "spot",
      symbol: "BTCUSDT",
      interval: "15m",
      chartType: "candle",
      invert: false,
      mirrorAxis: false,
      logScale: false,
      showVol: true,
      tool: "cursor",
      theme: "dark",
      indicators: [
        { id: "ma-default", kind: "MA", params: [7, 25, 99], visible: true },
        { id: "vol-default", kind: "VOL", params: [], visible: true },
      ],
      drawings: [],
      bars: [],
      layout: "1",
      panes: makePanes("1", []),
      paneBars: {},
      compareSymbols: [],
      compareBars: {},
      historyStatus: {},
      liveOpenTime: 0,
      syncTime: true,
      syncCrosshair: true,
      linkedRange: null,
      linkedCrosshair: null,
      ticker: null,
      bids: [],
      asks: [],
      trades: [],
      watch: [],
      watchSymbols: DEFAULT_WATCH,
      live: false,
      overlay: null,
      searchOpen: false,
      indicatorOpen: false,
      settingsOpen: false,
      chartSettings: DEFAULT_SETTINGS,
      mobileTab: "chart",
      mark: 0,
      funding: 0,
      nextFunding: 0,
      setMarket: (market) =>
        set({
          market,
          bars: [],
          paneBars: {},
          compareBars: {},
          liveOpenTime: 0,
        }),
      setSymbol: (symbol) =>
        set({
          symbol: symbol.toUpperCase(),
          bars: [],
          paneBars: {},
          compareBars: {},
          trades: [],
          bids: [],
          asks: [],
          liveOpenTime: 0,
        }),
      setInterval: (interval) =>
        set({
          interval,
          bars: [],
          compareBars: {},
          liveOpenTime: 0,
          panes: get().panes.map((p, i) => (i === 0 ? { ...p, interval } : p)),
        }),
      setChartType: (chartType) => set({ chartType }),
      toggleInvert: () => set({ invert: !get().invert }),
      toggleMirrorAxis: () => set({ mirrorAxis: !get().mirrorAxis }),
      toggleLog: () => set({ logScale: !get().logScale }),
      toggleVol: () => set({ showVol: !get().showVol }),
      setTool: (tool) => set({ tool }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      addIndicator: (kind) => {
        const spec = INDICATOR_CATALOG.find((x) => x.kind === kind);
        if (!spec) return;
        set({
          indicators: [
            ...get().indicators,
            { id: uid(), kind, params: [...spec.defaults], visible: true },
          ],
        });
      },
      removeIndicator: (id) => set({ indicators: get().indicators.filter((i) => i.id !== id) }),
      setBars: (bars) =>
        set({
          bars: bars.slice(-BAR_CAP),
          liveOpenTime: bars.at(-1)?.time ?? 0,
        }),
      appendOlderBars: (incoming) => {
        const cur = get().bars;
        const next = prependContiguous(cur, incoming, BAR_CAP, get().liveOpenTime || cur[0]?.time);
        set({ bars: next });
        return next.length - cur.length;
      },
      updateBar: (bar) => {
        const cur = get().bars;
        const last = cur[cur.length - 1];

        // If we have nothing yet (history still loading or failed), accept the
        // live bar as a seed — otherwise a blank store swallows every update.
        if (!last) {
          set({ bars: [bar].slice(-BAR_CAP), liveOpenTime: bar.time });
          return;
        }

        if (bar.time < last.time) return; // Outdated

        if (last.time === bar.time) {
          // Update current open bar
          const next = cur.slice();
          next[next.length - 1] = bar;
          set({ bars: next, liveOpenTime: bar.time });
          return;
        }

        // ✅ Only add as NEW bar if it's at the correct interval
        const stepSec = intervalSec(get().interval);
        // Allow small tolerance for network jitter
        if (Math.abs(bar.time - (last.time + stepSec)) <= stepSec * 0.5) {
          set({ bars: [...cur, bar].slice(-BAR_CAP), liveOpenTime: bar.time });
        } else if (bar.time > last.time + stepSec) {
          console.warn('[Store] Skipped gap in bar times:', last.time, '->', bar.time);
          // Don't add intermediate fake bars
        }
      },
      setLayout: (layout) => {
        const panes = makePanes(layout, get().panes);
        if (panes[0]) panes[0] = { ...panes[0], interval: get().interval };
        const keep = new Set(panes.map((p) => p.id));
        const paneBars = Object.fromEntries(Object.entries(get().paneBars).filter(([k]) => keep.has(k)));
        set({ layout, panes, paneBars });
      },
      setPaneInterval: (paneId, interval) => {
        const panes = get().panes.map((p) => (p.id === paneId ? { ...p, interval } : p));
        const paneBars = { ...get().paneBars, [paneId]: [] };
        if (paneId === "p0") {
          // Apply chart settings when switching intervals to maintain barSpacing
          const settings = get().chartSettings;
          set({ 
            panes, 
            paneBars, 
            interval, 
            bars: [], 
            compareBars: {}, 
            liveOpenTime: 0,
            // Keep chart settings applied
          });
          
          // If engine exists, it will apply settings automatically on next render
          return;
        }
        set({ panes, paneBars });
      },
      setPaneBars: (paneId, bars) => set({ paneBars: { ...get().paneBars, [paneId]: bars.slice(-BAR_CAP) } }),
      appendOlderPaneBars: (paneId, incoming) => {
        const cur = get().paneBars[paneId] ?? [];
        const live = paneId === "p0" ? get().liveOpenTime : cur.at(-1)?.time;
        const next = prependContiguous(cur, incoming, BAR_CAP, live);
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
          next = [...cur, bar].slice(-BAR_CAP);
        }
        set({ paneBars: { ...get().paneBars, [paneId]: next } });
      },
      addCompare: (raw) => {
        const symbol = raw.toUpperCase();
        if (!symbol || symbol === get().symbol || get().compareSymbols.includes(symbol)) return;
        if (get().compareSymbols.length >= 5) return;
        set({ compareSymbols: [...get().compareSymbols, symbol] });
      },
      removeCompare: (symbol) => {
        const compareBars = { ...get().compareBars };
        delete compareBars[symbol];
        set({
          compareSymbols: get().compareSymbols.filter((s) => s !== symbol),
          compareBars,
        });
      },
      setCompareBars: (symbol, bars) => set({ compareBars: { ...get().compareBars, [symbol]: bars.slice(-BAR_CAP) } }),
      appendOlderCompareBars: (symbol, incoming) => {
        const cur = get().compareBars[symbol] ?? [];
        const next = prependContiguous(cur, incoming, BAR_CAP, get().liveOpenTime || undefined);
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
          next = [...cur, bar].slice(-BAR_CAP);
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
      setSyncTime: (syncTime) => set({ syncTime }),
      setSyncCrosshair: (syncCrosshair) => set({ syncCrosshair }),
      setLinkedRange: (linkedRange) => set({ linkedRange }),
      setLinkedCrosshair: (linkedCrosshair) => set({ linkedCrosshair }),
      setTicker: (ticker) => set({ ticker }),
      setBook: (bids, asks) => set({ bids, asks }),
      pushTrade: (t) => set({ trades: [t, ...get().trades].slice(0, 80) }),
      setWatch: (watch) => set({ watch }),
      addWatch: (s) => {
        const symbol = s.toUpperCase();
        if (get().watchSymbols.includes(symbol)) return;
        set({ watchSymbols: [symbol, ...get().watchSymbols] });
      },
      removeWatch: (s) => set({ watchSymbols: get().watchSymbols.filter((x) => x !== s) }),
      setLive: (live) => set({ live }),
      setOverlay: (overlay) => set({ overlay }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setIndicatorOpen: (indicatorOpen) => set({ indicatorOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setChartSettings: (settings: ChartSettings) => set({ chartSettings: settings }),
      setMobileTab: (mobileTab) => set({ mobileTab }),
      setPremium: (mark, funding, nextFunding) => set({ mark, funding, nextFunding }),
      addDrawing: (d) => set({ drawings: [...get().drawings, d] }),
      clearDrawings: () => set({ drawings: [] }),
      popDrawing: () => set({ drawings: get().drawings.slice(0, -1) }),
    }),
    {
      name: "apex-desk",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TerminalState>;
        return {
          ...current,
          ...p,
          theme: p.theme === "light" || p.theme === "dark" ? p.theme : current.theme,
          layout: p.layout ?? current.layout,
          panes: p.panes?.length ? p.panes : current.panes,
          compareSymbols: p.compareSymbols ?? [],
          paneBars: {},
          compareBars: {},
          historyStatus: {},
          linkedRange: null,
          linkedCrosshair: null,
        };
      },
      partialize: (s) => ({
        market: s.market,
        symbol: s.symbol,
        interval: s.interval,
        chartType: s.chartType,
        invert: s.invert,
        mirrorAxis: s.mirrorAxis,
        logScale: s.logScale,
        showVol: s.showVol,
        theme: s.theme,
        indicators: s.indicators,
        drawings: s.drawings,
        watchSymbols: s.watchSymbols,
        layout: s.layout,
        panes: s.panes,
        compareSymbols: s.compareSymbols,
        syncTime: s.syncTime,
        syncCrosshair: s.syncCrosshair,
      }),
    },
  ),
);

// Expose store to window for debugging (dev only)
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.useTerminal = useTerminal;
}
