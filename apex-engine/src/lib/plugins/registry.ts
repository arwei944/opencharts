import type { Candle } from "../market/types";
import type React from "react";

/**
 * Minimal plugin registry so third parties can extend the app without editing
 * core files: new indicators (a compute function), new drawing tools (a
 * renderer + points count), and alternate data-source providers.
 */

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
const indicators = new Map<string, IndicatorPlugin>();
const drawingTools = new Map<string, DrawingToolPlugin>();
const dataSources = new Map<string, DataSourcePlugin>();

export const pluginRegistry = {
  indicators,
  drawingTools,
  dataSources,
};

export function registerIndicator(p: IndicatorPlugin): void {
  indicators.set(p.kind, p);
}
export function registerDrawingTool(p: DrawingToolPlugin): void {
  drawingTools.set(p.id, p);
}
export function registerDataSource(p: DataSourcePlugin): void {
  dataSources.set(p.name, p);
}
export function listIndicators(): IndicatorPlugin[] {
  return [...indicators.values()];
}
export function getIndicator(kind: string): IndicatorPlugin | undefined {
  return indicators.get(kind);
}
export function listDrawingTools(): DrawingToolPlugin[] {
  return [...drawingTools.values()];
}
export function getDataSource(name: string): DataSourcePlugin | undefined {
  return dataSources.get(name);
}
