import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETTINGS } from "./settings";
import type { ChartLayout } from "./types";
import {
  configSlice,
  makePanes,
  type ConfigSlice,
} from "./stores/config-slice";
import { marketSlice, NO_BARS, type MarketSlice } from "./stores/market-slice";
import { tradingSlice, type TradingSlice } from "./stores/trading-slice";
import { uiSlice, type UISlice } from "./stores/ui-slice";

export { NO_BARS };

/**
 * Terminal store = one zustand store composed of four slices:
 *  - ConfigSlice  (persisted chart config, drawings, undo — see partialize)
 *  - MarketSlice  (high-frequency bars/ticker/book — never persisted)
 *  - UISlice      (dialogs/tools/mobile tab — never persisted)
 *  - TradingSlice (order interaction + feed telemetry)
 *
 * External code keeps calling `useTerminal(selector)` — zustand's selector
 * subscription already isolates renders, and the slice split is purely an
 * organization + persist-isolation device (see selectors.ts for the named
 * hot-path subscriptions).
 */
export interface TerminalState
  extends ConfigSlice, MarketSlice, UISlice, TradingSlice {}

export const useTerminal = create<TerminalState>()(
  persist(
    (...args) => ({
      ...configSlice(...args),
      ...marketSlice(...args),
      ...uiSlice(...args),
      ...tradingSlice(...args),
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
  (window as unknown as { useTerminal: typeof useTerminal }).useTerminal =
    useTerminal;
}
