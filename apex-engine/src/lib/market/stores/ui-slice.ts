import type { StateCreator } from "zustand";
import type { Tool } from "../types";

/**
 * Non-persisted UI state: dialog switches, active tool, mobile tab. These are
 * cheap booleans that every component may read but almost never write together
 * — keeping them outside the persisted config slice means opening a dialog
 * never rewrites localStorage, and layout/theme actions never re-render the
 * dialog tree.
 */
export interface UISlice {
  tool: Tool;
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
  /** Strategy backtester dialog. */
  backtestOpen: boolean;
  mobileTab: "chart" | "book" | "trade";
  setTool: (t: Tool) => void;
  setSearchOpen: (v: boolean) => void;
  setIndicatorOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setDrawingsOpen: (v: boolean) => void;
  setExportOpen: (v: boolean) => void;
  setExportFormat: (f: "csv" | "json") => void;
  setDepthOpen: (v: boolean) => void;
  setHealthOpen: (v: boolean) => void;
  setBacktestOpen: (v: boolean) => void;
  setMobileTab: (t: "chart" | "book" | "trade") => void;
}

export const uiSlice: StateCreator<
  import("../store").TerminalState,
  [],
  [],
  UISlice
> = (set) => ({
  tool: "cursor",
  searchOpen: false,
  indicatorOpen: false,
  settingsOpen: false,
  drawingsOpen: false,
  exportOpen: false,
  exportFormat: "csv",
  depthOpen: false,
  healthOpen: false,
  backtestOpen: false,
  mobileTab: "chart",
  setTool: (tool) => set({ tool }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setIndicatorOpen: (indicatorOpen) => set({ indicatorOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setDrawingsOpen: (drawingsOpen) => set({ drawingsOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setExportFormat: (exportFormat) => set({ exportFormat }),
  setDepthOpen: (depthOpen) => set({ depthOpen }),
  setHealthOpen: (healthOpen) => set({ healthOpen }),
  setBacktestOpen: (backtestOpen) => set({ backtestOpen }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
});
