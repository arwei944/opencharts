import type { Candle } from "../market/types.ts";
import { INDICATOR_CATALOG, TOOLS } from "../market/constants.ts";
import type React from "react";

/**
 * Plugin registry v2 (P2-A3). Third parties extend the app without editing
 * core files: new indicators (a compute function), new drawing tools (a
 * renderer + points count), and alternate data-source providers.
 *
 * v2 additions over the write-only v1:
 *  - lifecycle: register → active by default; `deactivate`/`activate` toggle
 *    participation without losing the definition
 *  - capability scope metadata (`PluginScope`)
 *  - merged-catalog views (`indicatorCatalog()` / `drawingTools()`) that UI
 *    components consume INSTEAD of the hard-coded constants — registering a
 *    plugin now actually shows up in the toolbar / indicator modal
 */

export type PluginScope =
  | "indicator"
  | "drawing"
  | "datasource"
  | "theme"
  | "settingsSection"
  | "panel"
  | "toolBehavior";

export interface IndicatorPlugin {
  kind: string;
  name: string;
  group: "main" | "sub";
  defaults: number[];
  labels: string[];
  /** Compute line(s) for the full series. */
  compute: (
    bars: Candle[],
    params: number[],
  ) => Array<{ time: number; value: number; color?: string }>;
}

export interface DrawingToolPlugin {
  id: string;
  label: string;
  points: number;
  /** Render the drawing to SVG elements given screen points. */
  render: (
    points: Array<{ x: number; y: number }>,
    color: string,
  ) => React.ReactNode;
}

export interface DataSourcePlugin {
  name: string;
  /** Fetch klines for symbol/interval; returns ascending candles. */
  fetchKlines: (
    symbol: string,
    interval: string,
    limit: number,
  ) => Promise<Candle[]>;
}

// Registry (process-wide singletons).
const indicatorRegistry = new Map<string, IndicatorPlugin>();
const drawingRegistry = new Map<string, DrawingToolPlugin>();
const dataSourceRegistry = new Map<string, DataSourcePlugin>();
/** Activated plugin kinds (default: everything registered is active). */
const activeIndicators = new Set<string>();
const activeDrawingTools = new Set<string>();

export const pluginRegistry = {
  indicators: indicatorRegistry,
  drawingTools: drawingRegistry,
  dataSources: dataSourceRegistry,
};

export function registerIndicator(p: IndicatorPlugin): void {
  indicatorRegistry.set(p.kind, p);
  activeIndicators.add(p.kind);
}
export function registerDrawingTool(p: DrawingToolPlugin): void {
  drawingRegistry.set(p.id, p);
  activeDrawingTools.add(p.id);
}
export function registerDataSource(p: DataSourcePlugin): void {
  dataSourceRegistry.set(p.name, p);
}
export function listIndicators(): IndicatorPlugin[] {
  return [...indicatorRegistry.values()];
}
export function getIndicator(kind: string): IndicatorPlugin | undefined {
  return indicatorRegistry.get(kind);
}
export function listDrawingTools(): DrawingToolPlugin[] {
  return [...drawingRegistry.values()];
}
export function getDrawingTool(id: string): DrawingToolPlugin | undefined {
  return drawingRegistry.get(id);
}
export function getDataSource(name: string): DataSourcePlugin | undefined {
  return dataSourceRegistry.get(name);
}

// ---- lifecycle (v2) ----

export function deactivateIndicator(kind: string): void {
  activeIndicators.delete(kind);
}
export function activateIndicator(kind: string): void {
  if (indicatorRegistry.has(kind)) activeIndicators.add(kind);
}
export function isIndicatorActive(kind: string): boolean {
  return activeIndicators.has(kind);
}
export function deactivateDrawingTool(id: string): void {
  activeDrawingTools.delete(id);
}
export function activateDrawingTool(id: string): void {
  if (drawingRegistry.has(id)) activeDrawingTools.add(id);
}
export function isDrawingToolActive(id: string): boolean {
  return activeDrawingTools.has(id);
}
export function unregisterIndicator(kind: string): void {
  indicatorRegistry.delete(kind);
  activeIndicators.delete(kind);
}
export function unregisterDrawingTool(id: string): void {
  drawingRegistry.delete(id);
  activeDrawingTools.delete(id);
}
export function unregisterDataSource(name: string): void {
  dataSourceRegistry.delete(name);
}

// ---- merged catalog views (what the UI consumes) ----

export interface IndicatorCatalogEntry {
  kind: string;
  name: string;
  group: "main" | "sub";
  defaults: number[];
  labels: string[];
}

/** Builtin catalog + active plugin indicators, in one list for the UI. */
export function indicatorCatalog(): IndicatorCatalogEntry[] {
  const builtin = INDICATOR_CATALOG.map((x) => ({
    kind: x.kind,
    name: x.name,
    group: x.group,
    defaults: x.defaults,
    labels: x.labels,
  }));
  const plugins = [...indicatorRegistry.values()]
    .filter((p) => activeIndicators.has(p.kind))
    .map((p) => ({
      kind: p.kind,
      name: p.name,
      group: p.group,
      defaults: p.defaults,
      labels: p.labels,
    }));
  return [...builtin, ...plugins];
}

export interface DrawingToolEntry {
  id: string;
  label: string;
  points: number;
}

/** Builtin toolbar + active plugin drawing tools, in one list for the UI. */
export function drawingTools(): DrawingToolEntry[] {
  const builtin = TOOLS.map((t) => ({ id: t.id, label: t.label, points: 0 }));
  const plugins = [...drawingRegistry.values()]
    .filter((p) => activeDrawingTools.has(p.id))
    .map((p) => ({ id: p.id, label: p.label, points: p.points }));
  return [...builtin, ...plugins];
}
