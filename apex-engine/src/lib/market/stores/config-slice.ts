import { uid } from "@/lib/utils";
import type { StateCreator } from "zustand";
import {
  DEFAULT_PANE_INTERVALS,
  INDICATOR_CATALOG,
  PANE_COUNT,
} from "../constants";
import type { ThemeMode, ThemePref } from "../constants";
import type { ChartSettings } from "../settings";
import { DEFAULT_SETTINGS } from "../settings";
import type { CustomFn } from "../indicator-compute";
import type {
  ChartLayout,
  ChartPaneConfig,
  ChartType,
  Drawing,
  IndicatorInst,
  Interval,
  Market,
  Tool,
} from "../types";

export function makePanes(
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

interface HistorySnapshot {
  drawings: Drawing[];
  indicators: IndicatorInst[];
}

/**
 * Persistent chart configuration + drawings/undo. The zustand `persist`
 * middleware stores exactly the fields of this slice (see partialize in
 * store.ts), plus the panel-collapse flags that are cheap to keep across
 * sessions. High-frequency market data lives in MarketSlice (never persisted).
 */
export interface ConfigSlice {
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
  layout: ChartLayout;
  panes: ChartPaneConfig[];
  compareSymbols: string[];
  syncTime: boolean;
  syncCrosshair: boolean;
  chartSettings: ChartSettings;
  /** Active trading backend: paper, Binance or OKX live. */
  brokerMode: "paper" | "binance" | "okx";
  /** Take-profit / stop-loss levels shown on the chart and draggable. */
  tpsl: { tp: number | null; sl: number | null };
  setTpsl: (patch: Partial<{ tp: number | null; sl: number | null }>) => void;
  /** Desktop side-panel visibility (Watchlist / Book-Tape columns). */
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  setLeftPanelOpen: (v: boolean) => void;
  setRightPanelOpen: (v: boolean) => void;
  setMarket: (m: Market) => void;
  setSymbol: (s: string) => void;
  setInterval: (i: Interval) => void;
  setChartType: (t: ChartType) => void;
  toggleInvert: () => void;
  toggleMirrorAxis: () => void;
  toggleLog: () => void;
  toggleVol: () => void;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  setThemePref: (p: ThemePref) => void;
  setTool: (t: Tool) => void;
  addIndicator: (kind: IndicatorInst["kind"]) => string;
  /** Replace all indicators with a preset group (one-click templates). */
  applyIndicatorPreset: (list: { kind: string; params?: number[] }[]) => void;
  updateIndicator: (
    id: string,
    patch: Partial<
      Pick<
        IndicatorInst,
        "params" | "visible" | "pane" | "color" | "width" | "style" | "scale"
      >
    >,
  ) => void;
  removeIndicator: (id: string) => void;
  setLayout: (layout: ChartLayout) => void;
  setPaneInterval: (paneId: string, interval: Interval) => void;
  addCompare: (symbol: string) => void;
  removeCompare: (symbol: string) => void;
  setSyncTime: (v: boolean) => void;
  setSyncCrosshair: (v: boolean) => void;
  setChartSettings: (settings: ChartSettings) => void;
  setBrokerMode: (m: "paper" | "binance" | "okx") => void;
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

export const configSlice: StateCreator<
  import("../store").TerminalState,
  [],
  [],
  ConfigSlice
> = (set, get) => ({
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
  layout: "1",
  panes: makePanes("1", []),
  compareSymbols: [],
  syncTime: true,
  syncCrosshair: true,
  chartSettings: DEFAULT_SETTINGS,
  brokerMode: "paper",
  tpsl: { tp: null, sl: null },
  leftPanelOpen: true,
  rightPanelOpen: true,
  customFns: {},
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
  addCustomFn: (id, fn) => set({ customFns: { ...get().customFns, [id]: fn } }),
  removeCustomFn: (id) => {
    const next = { ...get().customFns };
    delete next[id];
    set({ customFns: next });
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
      set({
        panes,
        paneBars,
        interval,
        bars: [],
        lastBar: null,
        compareBars: {},
        liveOpenTime: 0,
      });
      return;
    }
    set({ panes, paneBars });
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
  setSyncTime: (syncTime) => set({ syncTime }),
  setSyncCrosshair: (syncCrosshair) => set({ syncCrosshair }),
  setChartSettings: (chartSettings) => set({ chartSettings }),
  setBrokerMode: (brokerMode) => set({ brokerMode }),
  setTpsl: (patch) => set({ tpsl: { ...get().tpsl, ...patch } }),
  setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
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
      drawings: s.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)),
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
});
