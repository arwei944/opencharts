import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/utils";
import {
  appendCapped,
  prependBars as prependContiguous,
  intervalSec,
} from "./bars";
import {
  BAR_CAP,
  DEFAULT_PANE_INTERVALS,
  DEFAULT_WATCH,
  INDICATOR_CATALOG,
  PANE_CAP,
  PANE_COUNT,
} from "./constants";
import type { ThemeMode, ThemePref } from "./constants";
import type { ChartSettings } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";
import type { CustomFn } from "./indicator-compute";
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

function makePanes(
  layout: ChartLayout,
  prev: ChartPaneConfig[],
): ChartPaneConfig[] {
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

export interface TerminalState {
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
  /** User preference: dark / light / follow the OS. */
  themePref: ThemePref;
  indicators: IndicatorInst[];
  /** Parsed custom-indicator calculators, keyed by indicator id (session-only). */
  customFns: Record<string, CustomFn>;
  addCustomFn: (id: string, fn: CustomFn) => void;
  removeCustomFn: (id: string) => void;
  drawings: Drawing[];
  /** Currently selected drawing id (null = none); Delete removes it. */
  selectedDrawingId: string | null;
  selectDrawing: (id: string | null) => void;
  removeDrawing: (id: string) => void;
  bars: Candle[];
  /** Tail of `bars` (live, still-open bar) — updated in place on WS ticks so
   * the 100k array reference stays stable and only lightweight subscribers
   * (chart legend / engine live path) re-render. */
  lastBar: Candle | null;
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
  overlay: Candle | null;
  /** Price from a chart click, waiting for the OrderTicket to confirm. */
  chartOrderPrice: number | null;
  setChartOrderPrice: (p: number | null) => void;
  /** Take-profit / stop-loss levels shown on the chart and draggable. */
  tpsl: { tp: number | null; sl: number | null };
  setTpsl: (patch: Partial<{ tp: number | null; sl: number | null }>) => void;
  searchOpen: boolean;
  indicatorOpen: boolean;
  settingsOpen: boolean;
  /** Drawings list panel (object tree). */
  drawingsOpen: boolean;
  /** Data-export dialog (CSV/JSON + time range). */
  exportOpen: boolean;
  exportFormat: "csv" | "json";
  /** Full-size depth chart modal. */
  depthOpen: boolean;
  /** Feed-health panel (sources / reconnects / warnings). */
  healthOpen: boolean;
  /** Active trading backend: paper, Binance or OKX live. */
  brokerMode: "paper" | "binance" | "okx";
  /** Strategy backtester dialog. */
  backtestOpen: boolean;
  feedStats: {
    hostIndex: number;
    base: string;
    reconnects: number;
    lastMsgAt: number;
  };
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
  setThemePref: (p: ThemePref) => void;
  addIndicator: (kind: IndicatorInst["kind"]) => string;
  /** Replace all indicators with a preset group (one-click templates). */
  applyIndicatorPreset: (list: { kind: string; params?: number[] }[]) => void;
  updateIndicator: (
    id: string,
    patch: Partial<Pick<IndicatorInst, "params" | "visible" | "pane">>,
  ) => void;
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
  setConn: (c: "connecting" | "live" | "degraded" | "offline") => void;
  setOverlay: (c: Candle | null) => void;
  /** Desktop side-panel visibility (Watchlist / Book-Tape columns). */
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  setLeftPanelOpen: (v: boolean) => void;
  setRightPanelOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setIndicatorOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setDrawingsOpen: (v: boolean) => void;
  setExportOpen: (v: boolean) => void;
  setExportFormat: (f: "csv" | "json") => void;
  setDepthOpen: (v: boolean) => void;
  setHealthOpen: (v: boolean) => void;
  setBrokerMode: (m: "paper" | "binance" | "okx") => void;
  setBacktestOpen: (v: boolean) => void;
  setFeedStats: (
    p: Partial<{
      hostIndex: number;
      base: string;
      reconnects: number;
      lastMsgAt: number;
    }>,
  ) => void;
  setChartSettings: (settings: ChartSettings) => void;
  setMobileTab: (t: TerminalState["mobileTab"]) => void;
  setPremium: (mark: number, funding: number, next: number) => void;
  addDrawing: (d: Drawing) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  clearDrawings: () => void;
  popDrawing: () => void;
  /** Undo/redo snapshot stacks for drawings + indicator edits. */
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

interface HistorySnapshot {
  drawings: Drawing[];
  indicators: IndicatorInst[];
}

/** Standing value for a pane whose feed has not produced bars yet. A fresh `[]`
 * in a selector re-renders the pane forever instead of once. */
export const NO_BARS: Candle[] = [];

/** Monotonic counter making WS trade ids unique as React list keys. */
let tradeSeq = 0;

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
      theme: "light",
      themePref: "light",
      indicators: [
        { id: "ma-default", kind: "MA", params: [7, 25, 99], visible: true },
        { id: "vol-default", kind: "VOL", params: [], visible: true },
      ],
      drawings: [],
      undoStack: [],
      redoStack: [],
      selectedDrawingId: null,
      bars: [],
      lastBar: null,
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
      conn: "connecting",
      dataWarnings: { gaps: 0, anomalies: 0, skew: 0 },
      okxLive: false,
      okxLast: null,
      leftPanelOpen: true,
      rightPanelOpen: true,
      overlay: null,
      searchOpen: false,
      indicatorOpen: false,
      settingsOpen: false,
      drawingsOpen: false,
      exportOpen: false,
      exportFormat: "csv",
      depthOpen: false,
      healthOpen: false,
      brokerMode: "paper",
      backtestOpen: false,
      feedStats: { hostIndex: 0, base: "", reconnects: 0, lastMsgAt: 0 },
      chartSettings: DEFAULT_SETTINGS,
      mobileTab: "chart",
      mark: 0,
      funding: 0,
      nextFunding: 0,
      setMarket: (market) =>
        set({
          market,
          bars: [],
          lastBar: null,
          paneBars: {},
          compareBars: {},
          liveOpenTime: 0,
        }),
      setSymbol: (symbol) =>
        set({
          symbol: symbol.toUpperCase(),
          bars: [],
          lastBar: null,
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
          lastBar: null,
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
      toggleTheme: () =>
        set((s) => {
          if (s.themePref === "system") {
            // Pinning from "system": resolve to the opposite of what the OS
            // gave us, as an explicit preset.
            const resolved =
              s.theme === "dark" || s.theme === "ocean" ? "light" : "dark";
            return { themePref: resolved, theme: resolved };
          }
          const order: ThemeMode[] = ["dark", "light", "ocean", "sand"];
          const next = order[(order.indexOf(s.theme) + 1) % order.length];
          return { themePref: next, theme: next };
        }),
      setThemePref: (themePref) => set({ themePref }),
      applyIndicatorPreset: (list) => {
        get().pushHistory();
        set({
          indicators: list.map((spec) => ({
            id: uid(),
            kind: spec.kind as IndicatorInst["kind"],
            params: spec.params ?? [],
            visible: true,
          })),
        });
      },
      addIndicator: (kind) => {
        // CUSTOM indicators are registered by id with a runtime calculator
        // (addCustomFn) rather than a catalog spec — emit a placeholder
        // instance so chart-engine picks up the id.
        if (kind === "CUSTOM") {
          get().pushHistory();
          const id = uid();
          set({
            indicators: [
              ...get().indicators,
              { id, kind, params: [], visible: true },
            ],
          });
          return id;
        }
        const spec = INDICATOR_CATALOG.find((x) => x.kind === kind);
        if (!spec) return uid();
        get().pushHistory();
        const id = uid();
        set({
          indicators: [
            ...get().indicators,
            { id, kind, params: [...spec.defaults], visible: true },
          ],
        });
        return id;
      },
      updateIndicator: (id, patch) =>
        set({
          indicators: get().indicators.map((i) =>
            i.id === id ? { ...i, ...patch } : i,
          ),
        }),
      removeIndicator: (id) => {
        if (!get().indicators.some((i) => i.id === id)) return;
        get().pushHistory();
        const next = { ...get().customFns };
        delete next[id];
        set({
          indicators: get().indicators.filter((i) => i.id !== id),
          customFns: next,
        });
      },
      // Custom indicators: runtime-only registry of parsed script functions. Not
      // persisted (functions are not serializable); refs live for the session.
      customFns: {},
      addCustomFn: (id, fn) =>
        set({ customFns: { ...get().customFns, [id]: fn } }),
      removeCustomFn: (id) => {
        const next = { ...get().customFns };
        delete next[id];
        set({ customFns: next });
      },
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
      updateBar: (bar) => {
        const cur = get().bars;
        const last = cur[cur.length - 1];

        // If we have nothing yet (history still loading or failed), accept the
        // live bar as a seed — otherwise a blank store swallows every update.
        if (!last) {
          set({
            bars: [bar].slice(-BAR_CAP),
            lastBar: bar,
            liveOpenTime: bar.time,
          });
          return;
        }

        if (bar.time < last.time) return; // Outdated

        if (last.time === bar.time) {
          // Same open bar ticking: update the tail IN PLACE — the resident
          // array reference stays stable, so heavy `bars` subscribers don't
          // re-render; only the lightweight lastBar path (legend + engine
          // live update) fires.
          cur[cur.length - 1] = bar;
          set({ lastBar: bar, liveOpenTime: bar.time });
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
      setLayout: (layout) => {
        const panes = makePanes(layout, get().panes);
        if (panes[0]) panes[0] = { ...panes[0], interval: get().interval };
        const keep = new Set(panes.map((p) => p.id));
        const paneBars = Object.fromEntries(
          Object.entries(get().paneBars).filter(([k]) => keep.has(k)),
        );
        set({ layout, panes, paneBars });
      },
      setPaneInterval: (paneId, interval) => {
        const panes = get().panes.map((p) =>
          p.id === paneId ? { ...p, interval } : p,
        );
        const paneBars = { ...get().paneBars, [paneId]: [] };
        if (paneId === "p0") {
          // Switching the master pane's interval resets its series; chart
          // settings stay as-is (engine re-applies barSpacing on next render).
          set({
            panes,
            paneBars,
            interval,
            bars: [],
            lastBar: null,
            compareBars: {},
            liveOpenTime: 0,
          });

          // If engine exists, it will apply settings automatically on next render
          return;
        }
        set({ panes, paneBars });
      },
      setPaneBars: (paneId, bars) =>
        set({
          paneBars: { ...get().paneBars, [paneId]: bars.slice(-PANE_CAP) },
        }),
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
      addCompare: (raw) => {
        const symbol = raw.toUpperCase();
        if (
          !symbol ||
          symbol === get().symbol ||
          get().compareSymbols.includes(symbol)
        )
          return;
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
      setSyncTime: (syncTime) => set({ syncTime }),
      setSyncCrosshair: (syncCrosshair) => set({ syncCrosshair }),
      setLinkedRange: (linkedRange) => set({ linkedRange }),
      setLinkedCrosshair: (linkedCrosshair) => set({ linkedCrosshair }),
      setTicker: (ticker) => set({ ticker }),
      setBook: (bids, asks) => set({ bids, asks }),
      // Monotonic id so a replayed WS trade (same exchange id + time) never
      // collides as a React list key.
      pushTrade: (t) =>
        set({
          trades: [
            { ...t, id: `${t.id}-${tradeSeq++}` },
            ...get().trades,
          ].slice(0, 80),
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
      setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
      setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
      setOverlay: (overlay) => set({ overlay }),
      chartOrderPrice: null,
      setChartOrderPrice: (chartOrderPrice) => set({ chartOrderPrice }),
      tpsl: { tp: null, sl: null },
      setTpsl: (patch) => set({ tpsl: { ...get().tpsl, ...patch } }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setIndicatorOpen: (indicatorOpen) => set({ indicatorOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setDrawingsOpen: (drawingsOpen) => set({ drawingsOpen }),
      setExportOpen: (exportOpen) => set({ exportOpen }),
      setExportFormat: (exportFormat) => set({ exportFormat }),
      setDepthOpen: (depthOpen) => set({ depthOpen }),
      setHealthOpen: (healthOpen) => set({ healthOpen }),
      setBrokerMode: (brokerMode) => set({ brokerMode }),
      setBacktestOpen: (backtestOpen) => set({ backtestOpen }),
      setFeedStats: (patch) =>
        set({ feedStats: { ...get().feedStats, ...patch } }),
      setChartSettings: (settings: ChartSettings) =>
        set({ chartSettings: settings }),
      setMobileTab: (mobileTab) => set({ mobileTab }),
      setPremium: (mark, funding, nextFunding) =>
        set({ mark, funding, nextFunding }),
      // Drawings / indicators edits keep an undo stack of snapshots.
      pushHistory: () =>
        set((s) => ({
          undoStack: [
            ...s.undoStack.slice(-99),
            { drawings: s.drawings, indicators: s.indicators },
          ],
          redoStack: [],
        })),
      undo: () =>
        set((s) => {
          const prev = s.undoStack.at(-1);
          if (!prev) return s;
          return {
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [
              ...s.redoStack.slice(-99),
              { drawings: s.drawings, indicators: s.indicators },
            ],
            drawings: prev.drawings,
            indicators: prev.indicators,
            selectedDrawingId: null,
          };
        }),
      redo: () =>
        set((s) => {
          const next = s.redoStack.at(-1);
          if (!next) return s;
          return {
            redoStack: s.redoStack.slice(0, -1),
            undoStack: [
              ...s.undoStack.slice(-99),
              { drawings: s.drawings, indicators: s.indicators },
            ],
            drawings: next.drawings,
            indicators: next.indicators,
            selectedDrawingId: null,
          };
        }),
      addDrawing: (d) => {
        get().pushHistory();
        set((s) => ({ drawings: [...s.drawings, d] }));
      },
      updateDrawing: (id, patch) => {
        get().pushHistory();
        set((s) => ({
          drawings: s.drawings.map((d) =>
            d.id === id ? { ...d, ...patch } : d,
          ),
        }));
      },
      clearDrawings: () => {
        if (!get().drawings.length) return;
        get().pushHistory();
        set({ drawings: [], selectedDrawingId: null });
      },
      popDrawing: () => {
        if (!get().drawings.length) return;
        get().pushHistory();
        set((s) => ({ drawings: s.drawings.slice(0, -1) }));
      },
      selectDrawing: (selectedDrawingId) => set({ selectedDrawingId }),
      removeDrawing: (id) => {
        if (!get().drawings.some((d) => d.id === id)) return;
        get().pushHistory();
        set((s) => ({
          drawings: s.drawings.filter((d) => d.id !== id),
          selectedDrawingId:
            s.selectedDrawingId === id ? null : s.selectedDrawingId,
        }));
      },
    }),
    {
      name: "apex-desk",
      version: 2,
      // v1 (no version field) persisted a stale `theme` key and may carry an
      // empty paneBars/compareBars blob; v2 keeps theme out of storage and
      // normalizes panes. Rehydration always runs this before merge.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<TerminalState>;
        const out: Record<string, unknown> = { ...p };
        delete out.theme; // never persisted from now on
        delete out.paneBars;
        delete out.compareBars;
        delete out.historyStatus;
        if (!Array.isArray(out.panes) || !out.panes.length) {
          out.panes = makePanes((p.layout as ChartLayout) ?? "1", []);
        }
        return out;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TerminalState>;
        return {
          ...current,
          ...p,
          // Theme is not persisted: the app always boots in the light theme.
          theme: "light",
          themePref: p.themePref ?? "light",
          layout: p.layout ?? current.layout,
          panes: p.panes?.length ? p.panes : current.panes,
          compareSymbols: p.compareSymbols ?? [],
          paneBars: {},
          compareBars: {},
          historyStatus: {},
          linkedRange: null,
          linkedCrosshair: null,
          // Merge persisted chart settings onto defaults so older saves (which
          // lacked newer keys) never lose new options.
          chartSettings: { ...DEFAULT_SETTINGS, ...(p.chartSettings ?? {}) },
          tpsl: p.tpsl ?? { tp: null, sl: null },
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
        indicators: s.indicators,
        drawings: s.drawings,
        watchSymbols: s.watchSymbols,
        layout: s.layout,
        panes: s.panes,
        compareSymbols: s.compareSymbols,
        syncTime: s.syncTime,
        syncCrosshair: s.syncCrosshair,
        chartSettings: s.chartSettings,
        tpsl: s.tpsl,
        leftPanelOpen: s.leftPanelOpen,
        rightPanelOpen: s.rightPanelOpen,
        themePref: s.themePref,
        brokerMode: s.brokerMode,
      }),
    },
  ),
);

// Expose store to window for debugging (dev only)
if (typeof window !== "undefined") {
  // @ts-expect-error expose for dev tooling
  window.useTerminal = useTerminal;
}
