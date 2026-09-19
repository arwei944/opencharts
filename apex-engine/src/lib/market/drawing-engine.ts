import { uid } from "@/lib/utils";
import type { DrawPoint, Drawing, Tool, ThemeMode } from "./types";
import { CHART_THEME } from "./constants";

export class DrawingEngine {
  private drawings: Drawing[] = [];
  private history: Drawing[][] = [[]];
  private historyIndex = 0;
  private tool: Tool = "cursor";
  private isDragging = false;
  private startPoint: DrawPoint | null = null;
  private currentId: string | null = null;
  private mode: ThemeMode = "dark";

  setTool(tool: Tool) {
    this.tool = tool;
    this.startPoint = null;
    this.isDragging = false;
  }

  setTheme(mode: ThemeMode) {
    this.mode = mode;
  }

  onStart(time: number, price: number) {
    if (this.tool === "cursor") return;

    this.isDragging = true;
    this.startPoint = { time, price };

    if (this.tool !== "hline" && this.tool !== "vline") {
      // 创建新绘图
      const id = uid();
      this.currentId = id;
      const color = this.getDrawingColor();
      this.drawings.push({
        id,
        tool: this.tool,
        points: [{ time, price }],
        color,
      });
    }
  }

  onMove(time: number, price: number) {
    if (!this.isDragging || !this.startPoint) return;

    if (this.tool === "hline") {
      // 水平线
      this.updateCurrentDrawing([
        { time: this.startPoint.time, price },
        { time, price },
      ]);
    } else if (this.tool === "vline") {
      // 垂直线
      this.updateCurrentDrawing([
        { time: this.startPoint.time, price: this.startPoint.price },
        { time, price },
      ]);
    } else if (this.tool === "trend" || this.tool === "ray" || this.tool === "fib") {
      // 趋势线 / Ray / 斐波那契
      this.updateCurrentDrawing([this.startPoint, { time, price }]);
    } else if (this.tool === "rect") {
      // 矩形（需要 4 个点，简化为对角线）
      this.updateCurrentDrawing([this.startPoint, { time, price }]);
    }
  }

  onEnd() {
    this.isDragging = false;
    this.startPoint = null;
    this.currentId = null;

    // 推入历史记录
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.drawings.slice());
    this.historyIndex++;
  }

  private updateCurrentDrawing(points: DrawPoint[]) {
    if (!this.currentId) return;
    this.drawings = this.drawings.map((d) =>
      d.id === this.currentId ? { ...d, points } : d
    );
  }

  getDrawings(): Drawing[] {
    return this.drawings;
  }

  clear() {
    this.drawings = [];
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.drawings = this.history[this.historyIndex].slice();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.drawings = this.history[this.historyIndex].slice();
    }
  }

  delete(id: string) {
    this.drawings = this.drawings.filter((d) => d.id !== id);
  }

  select(id: string): Drawing | undefined {
    return this.drawings.find((d) => d.id === id);
  }

  private getDrawingColor(): string {
    // 根据主题和绘制数量选择颜色
    const palette = [
      "#f0b90b", // gold
      "#00d4ff", // cyan
      "#f6465d", // red
      "#848e9c", // gray
      "#b7bdc6", // silver
    ];
    return palette[this.drawings.length % palette.length];
  }
}
