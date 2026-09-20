/**
 * Professional Drawing Engine v2
 * TradingView-style drawing tools with full feature set
 */

import { uid } from "@/lib/utils";
import type { DrawPoint, Drawing, Tool, ThemeMode } from "./types";
import { CHART_THEME } from "./constants";
import type { ChartEngine } from "./chart-engine";

// Enhanced tool types
export interface DrawnObject {
  id: string;
  tool: ExtendedTool;
  points: DrawPoint[];
  color: string;
  linewidth?: number;
  style?: "solid" | "dashed" | "dotted";
  anchor?: "start" | "end" | "middle";
  extended?: boolean; // For rays and trend lines
}

export type ExtendedTool = 
  | "cursor"
  | "cross"
  | "trend"
  | "ray"
  | "hline"
  | "vline"
  | "rect"
  | "fib"
  | "parallel"
  | "measure"
  | "arrow_up"
  | "arrow_down"
  | "text";

const DEFAULT_TOOL_WIDTHS: Record<ExtendedTool, number> = {
  cursor: 0,
  cross: 0,
  trend: 2,
  ray: 2,
  hline: 1,
  vline: 1,
  rect: 2,
  fib: 1,
  parallel: 2,
  measure: 2,
  arrow_up: 3,
  arrow_down: 3,
  text: 0,
};

export class DrawingEngineV2 {
  private objects: DrawnObject[] = [];
  private history: DrawnObject[][] = [[]];
  private historyIndex = 0;
  private currentTool: ExtendedTool = "cursor";
  private isDragging = false;
  private startPoint: DrawPoint | null = null;
  private currentId: string | null = null;
  private mode: ThemeMode = "dark";
  private chartEngine?: ChartEngine;
  
  constructor(mode: ThemeMode = "dark") {
    this.mode = mode;
  }

  /** Set the chart engine reference for coordinate conversion */
  setChartEngine(engine: ChartEngine): void {
    this.chartEngine = engine;
  }

  /** Get current tool */
  getTool(): ExtendedTool {
    return this.currentTool;
  }

  /** Change drawing tool */
  setTool(tool: ExtendedTool): void {
    this.currentTool = tool;
    this.startPoint = null;
    this.isDragging = false;
    
    if (tool === "cursor") {
      // Clear selection when switching to cursor
      this.deselectAll();
    }
  }

  /** Get all drawings */
  getDrawings(): DrawnObject[] {
    return this.objects.slice();
  }

  /** Get single object by ID */
  getObject(id: string): DrawnObject | undefined {
    return this.objects.find(obj => obj.id === id);
  }

  /** Check if object exists */
  hasObject(id: string): boolean {
    return this.objects.some(obj => obj.id === id);
  }

  /** Start drawing */
  onStart(time: number, price: number): void {
    if (this.currentTool === "cursor") return;

    this.isDragging = true;
    this.startPoint = { time, price };

    // Create new object for tools that need it
    if (!["hline", "vline"].includes(this.currentTool)) {
      const id = uid();
      this.currentId = id;
      
      this.objects.push({
        id,
        tool: this.currentTool,
        points: [{ time, price }],
        color: this.getNextColor(),
        linewidth: DEFAULT_TOOL_WIDTHS[this.currentTool],
        style: "solid",
      });
    }
  }

  /** While dragging */
  onMove(time: number, price: number): void {
    if (!this.isDragging || !this.startPoint) return;

    switch (this.currentTool) {
      case "hline":
        // Horizontal line - only need two points
        this.updateCurrentObject([
          { time: this.startPoint.time, price },
          { time, price },
        ]);
        break;

      case "vline":
        // Vertical line
        this.updateCurrentObject([
          { time: this.startPoint.time, price: this.startPoint.price },
          { time, price },
        ]);
        break;

      case "trend":
      case "ray":
        // Trend line or Ray
        this.updateCurrentObject([
          this.startPoint,
          { time, price }
        ]);
        break;

      case "rect":
        // Rectangle - diagonal definition
        this.updateCurrentObject([
          this.startPoint,
          { time, price }
        ]);
        break;

      case "fib":
        // Fibonacci retracement
        this.updateCurrentObject([
          this.startPoint,
          { time, price }
        ]);
        break;

      case "parallel":
        // Parallel channel (simplified - requires 3 points)
        this.updateCurrentObject([
          this.startPoint,
          { time, price }
        ]);
        break;

      case "measure":
        // Distance/time measurement
        this.updateCurrentObject([
          this.startPoint,
          { time, price }
        ]);
        break;

      default:
        break;
    }
  }

  /** Stop drawing */
  onEnd(): void {
    this.isDragging = false;
    this.startPoint = null;
    this.currentId = null;

    // Push to history
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.objects.slice());
    this.historyIndex++;
  }

  /** Update last point of current drawing */
  private updateCurrentObject(points: DrawPoint[]): void {
    if (!this.currentId) return;

    this.objects = this.objects.map(obj =>
      obj.id === this.currentId ? { ...obj, points } : obj
    );
  }

  /** Delete object */
  delete(id: string): void {
    this.objects = this.objects.filter(obj => obj.id !== id);
  }

  /** Select object */
  select(id: string): DrawnObject | undefined {
    // Deselect others first
    this.deselectAll();
    
    const obj = this.getObject(id);
    return obj;
  }

  /** Deselect all */
  deselectAll(): void {
    // In future, could add visual feedback for selection state
  }

  /** Undo operation */
  undo(): void {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.objects = this.history[this.historyIndex].slice();
    }
  }

  /** Redo operation */
  redo(): void {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.objects = this.history[this.historyIndex].slice();
    }
  }

  /** Clear all drawings */
  clear(): void {
    this.objects = [];
  }

  /** Check if tool supports multiple points */
  supportsMultiplePoints(tool: ExtendedTool): boolean {
    return ["trend", "rect", "fib", "parallel", "measure"].includes(tool);
  }

  /** Check if tool needs two points (diagonal) */
  needsTwoPoints(tool: ExtendedTool): boolean {
    return ["trend", "ray", "rect", "fib", "parallel", "measure"].includes(tool);
  }

  /** Check if tool is horizontal/vertical */
  isLinear(tool: ExtendedTool): boolean {
    return ["hline", "vline"].includes(tool);
  }

  /** Get next color in palette */
  private getNextColor(): string {
    const palette = [
      "#f0b90b",  // Gold
      "#00d4ff",  // Cyan
      "#f6465d",  // Red
      "#848e9c",  // Gray
      "#b7bdc6",  // Silver
      "#6366f1",  // Indigo
      "#8b5cf6",  // Violet
      "#ec4899",  // Pink
    ];
    
    return palette[this.objects.length % palette.length];
  }

  /** Convert drawing coordinates to screen pixels */
  convertToScreen(point: DrawPoint): { x: number; y: number } | null {
    if (!this.chartEngine) {
      // Fallback approximation
      const width = typeof window !== "undefined" ? window.innerWidth : 800;
      const height = typeof window !== "undefined" ? window.innerHeight : 500;
      
      const now = Date.now();
      const range = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      const x = ((point.time - (now - range)) / range) * width;
      const y = height - (point.price / 100000) * height;
      
      return { x, y };
    }

    try {
      const x = this.chartEngine.timeToX(point.time);
      const y = this.chartEngine.priceToY(point.price);
      
      if (x === null || y === null) return null;
      
      return { x, y };
    } catch (error) {
      console.error("Coordinate conversion failed:", error);
      return null;
    }
  }

  /** Get intersection with price level */
  intersectWithPrice(price: number): DrawPoint[] | null {
    const result: DrawPoint[] = [];
    
    for (const obj of this.objects) {
      if (obj.tool === "hline") {
        for (const point of obj.points) {
          if (Math.abs(point.price - price) < 0.01) {
            result.push(point);
          }
        }
      }
    }
    
    return result.length > 0 ? result : null;
  }

  /** Export drawings as JSON */
  exportJSON(): string {
    return JSON.stringify(this.objects, null, 2);
  }

  /** Import drawings from JSON */
  importJSON(json: string): void {
    try {
      const imported = JSON.parse(json);
      if (Array.isArray(imported)) {
        this.objects = imported;
        this.history = [this.objects.slice()];
        this.historyIndex = 0;
      }
    } catch (error) {
      console.error("Failed to import drawings:", error);
    }
  }

  /** Generate SVG path for a drawing */
  generateSVGPath(drawing: DrawnObject): string {
    if (drawing.points.length < 2) return "";

    const paths: string[] = [];
    const firstPoint = this.convertToScreen(drawing.points[0]);
    const lastPoint = this.convertToScreen(drawing.points[drawing.points.length - 1]);

    if (!firstPoint || !lastPoint) return "";

    switch (drawing.tool) {
      case "hline":
        paths.push(`M ${firstPoint.x} ${firstPoint.y} L ${lastPoint.x} ${firstPoint.y}`);
        break;

      case "vline":
        paths.push(`M ${firstPoint.x} ${firstPoint.y} L ${firstPoint.x} ${lastPoint.y}`);
        break;

      case "trend":
      case "ray":
        paths.push(`M ${firstPoint.x} ${firstPoint.y} L ${lastPoint.x} ${lastPoint.y}`);
        
        // Extend ray beyond last point
        if (drawing.tool === "ray" && drawing.extended) {
          const dx = lastPoint.x - firstPoint.x;
          const dy = lastPoint.y - firstPoint.y;
          paths.push(`M ${lastPoint.x} ${lastPoint.y} L ${lastPoint.x + dx * 2} ${lastPoint.y + dy * 2}`);
        }
        break;

      case "rect":
        const x1 = Math.min(firstPoint.x, lastPoint.x);
        const x2 = Math.max(firstPoint.x, lastPoint.x);
        const y1 = Math.min(firstPoint.y, lastPoint.y);
        const y2 = Math.max(firstPoint.y, lastPoint.y);
        paths.push(`M ${x1} ${y1} H ${x2} V ${y2} H ${x1} Z`);
        break;

      default:
        return "";
    }

    return paths.join(" ");
  }

  /** Calculate bounding box for a drawing */
  getBoundingBox(drawing: DrawnObject): {
    minTime: number;
    maxTime: number;
    minPrice: number;
    maxPrice: number;
  } | null {
    if (drawing.points.length === 0) return null;

    let minTime = Infinity;
    let maxTime = -Infinity;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const point of drawing.points) {
      minTime = Math.min(minTime, point.time);
      maxTime = Math.max(maxTime, point.time);
      minPrice = Math.min(minPrice, point.price);
      maxPrice = Math.max(maxPrice, point.price);
    }

    return { minTime, maxTime, minPrice, maxPrice };
  }

  /** Find nearest drawing to point */
  findNearest(time: number, price: number, radius: number = 10): DrawnObject | null {
    let nearest: DrawnObject | null = null;
    let minDistance = radius;

    for (const obj of this.objects) {
      const dist = this.distanceToDrawing(obj, time, price);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = obj;
      }
    }

    return nearest;
  }

  /** Calculate distance from point to drawing */
  private distanceToDrawing(drawing: DrawnObject, time: number, price: number): number {
    const coords = this.convertToScreen({ time, price });
    if (!coords) return Infinity;

    const pointsCoords = drawing.points.map(p => this.convertToScreen(p)).filter((c): c is { x: number; y: number } => c !== null);
    if (pointsCoords.length < 2) return Infinity;

    // Simplified distance calculation
    const start = pointsCoords[0];
    const end = pointsCoords[pointsCoords.length - 1];
    
    const dx = coords.x - start.x;
    const dy = coords.y - start.y;
    
    return Math.sqrt(dx * dx + dy * dy);
  }
}

// Singleton instance
export const drawingEngineV2 = new DrawingEngineV2();
