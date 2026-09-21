import { useEffect, useState } from "react";
import {
  Camera,
  Maximize2,
  MousePointer2,
  SlidersHorizontal,
} from "lucide-react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import {
  CHART_TYPES,
  INTERVALS,
  INTERVAL_MS,
  LAYOUTS,
  TOOLS,
} from "@/lib/market/constants";
import { NO_BARS, useTerminal } from "@/lib/market/store";
import type { ChartLayout, Interval } from "@/lib/market/types";
import { cn } from "@/lib/utils";
import { InvertedViewToggle } from "./InvertedViewToggle";

interface ChartToolbarProps {
  engine?: ChartEngine | null;
  paneId?: string;
  master?: boolean;
}

export function ChartToolbar({
  engine,
  paneId = "p0",
  master = true,
}: ChartToolbarProps) {
  const pane = useTerminal((s) => s.panes.find((p) => p.id === paneId));
  const interval = (pane?.interval ??
    useTerminal.getState().interval) as Interval;
  const setPaneInterval = useTerminal((s) => s.setPaneInterval);
  const chartType = useTerminal((s) => s.chartType);
  const setChartType = useTerminal((s) => s.setChartType);
  const invert = useTerminal((s) => s.invert);
  const logScale = useTerminal((s) => s.logScale);
  const showVol = useTerminal((s) => s.showVol);
  const tool = useTerminal((s) => s.tool);
  const setTool = useTerminal((s) => s.setTool);
  const toggleInvert = useTerminal((s) => s.toggleInvert);
  const toggleLog = useTerminal((s) => s.toggleLog);
  const toggleVol = useTerminal((s) => s.toggleVol);
  const setIndicatorOpen = useTerminal((s) => s.setIndicatorOpen);
  const clearDrawings = useTerminal((s) => s.clearDrawings);
  const undo = useTerminal((s) => s.undo);
  const redo = useTerminal((s) => s.redo);
  const layout = useTerminal((s) => s.layout);
  const setLayout = useTerminal((s) => s.setLayout);
  const compareSymbols = useTerminal((s) => s.compareSymbols);
  const addCompare = useTerminal((s) => s.addCompare);
  const removeCompare = useTerminal((s) => s.removeCompare);
  const syncTime = useTerminal((s) => s.syncTime);
  const syncCrosshair = useTerminal((s) => s.syncCrosshair);
  const setSyncTime = useTerminal((s) => s.setSyncTime);
  const setSyncCrosshair = useTerminal((s) => s.setSyncCrosshair);
  const [cmp, setCmp] = useState("");
  // Subscribe to the last bar's open time only (not the whole 100k array): an
  // in-flight WS tick updates the same bar, so the toolbar must not re-render.
  const lastBarTime = useTerminal(
    (s) => (master ? s.bars : (s.paneBars[paneId] ?? NO_BARS)).at(-1)?.time,
  );
  const closeAt = lastBarTime ? lastBarTime * 1000 + INTERVAL_MS[interval] : 0;

  const screenshot = () => {
    const canvas = engine?.screenshot();
    if (!canvas) return;
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "apex-chart.png";
      a.click();
    });
  };
  // 导出：打开 ExportDialog（格式 + 时段选择）。
  const openExport = () => useTerminal.getState().setExportOpen(true);

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-1 text-micro [&>*]:shrink-0">
      <button
        type="button"
        aria-label="图表设置"
        className="flex items-center gap-1.5 rounded-sm bg-gold px-2 font-medium text-bg hover:bg-opacity-90"
        onClick={() => useTerminal.getState().setSettingsOpen(true)}
      >
        <SlidersHorizontal className="size-3.5" />
        <span className="text-xs">设置</span>
      </button>

      {INTERVALS.map((iv) => (
        <button
          key={iv.id}
          type="button"
          className={cn(
            "whitespace-nowrap rounded-sm px-1.5 py-0.5",
            interval === iv.id
              ? "bg-elevated text-gold"
              : "text-muted hover:text-fg",
          )}
          onClick={() => setPaneInterval(paneId, iv.id)}
        >
          {iv.label}
        </button>
      ))}
      <i className="mx-1 h-4 w-px bg-border" />
      <select
        className="bg-transparent text-micro text-muted outline-none"
        value={chartType}
        onChange={(e) => setChartType(e.target.value as typeof chartType)}
      >
        {CHART_TYPES.map((t) => (
          <option key={t.id} value={t.id} className="bg-surface">
            {t.label}
          </option>
        ))}
      </select>

      {master && (
        <>
          <i className="mx-1 h-4 w-px bg-border" />
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              className={cn(
                "rounded-sm px-1.5 py-0.5",
                tool === t.id
                  ? "bg-elevated text-gold"
                  : "text-muted hover:text-fg",
              )}
              onClick={() => setTool(t.id)}
            >
              {t.id === "cursor" ? (
                <MousePointer2 className="size-3.5" />
              ) : (
                t.label
              )}
            </button>
          ))}
          <button
            type="button"
            className="rounded-sm px-1.5 text-muted hover:text-fg"
            onClick={undo}
            aria-label="撤销"
            title="撤销 (Ctrl+Z)"
          >
            撤销
          </button>
          <button
            type="button"
            className="rounded-sm px-1.5 text-muted hover:text-fg"
            onClick={redo}
            aria-label="重做"
            title="重做 (Ctrl+Y)"
          >
            重做
          </button>
          <button
            type="button"
            className="rounded-sm px-1.5 text-muted hover:text-fg"
            onClick={clearDrawings}
          >
            清空
          </button>
        </>
      )}

      <i className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        className="rounded-sm px-1.5 text-muted hover:text-gold"
        onClick={() => setIndicatorOpen(true)}
      >
        指标
      </button>
      <button
        type="button"
        className={cn(
          "rounded-sm px-1.5",
          showVol ? "text-gold" : "text-muted",
        )}
        onClick={toggleVol}
      >
        VOL
      </button>
      <button
        type="button"
        className={cn(
          "rounded-sm px-1.5",
          logScale ? "text-gold" : "text-muted",
        )}
        onClick={toggleLog}
      >
        Log
      </button>
      <button
        type="button"
        className={cn("rounded-sm px-1.5", invert ? "text-gold" : "text-muted")}
        onClick={toggleInvert}
      >
        红涨绿跌
      </button>
      <InvertedViewToggle />

      {master && (
        <>
          <i className="mx-1 h-4 w-px bg-border" />
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={cn(
                "rounded-sm px-1.5",
                layout === l.id ? "text-gold" : "text-muted hover:text-fg",
              )}
              onClick={() => setLayout(l.id as ChartLayout)}
            >
              {l.label}
            </button>
          ))}
          <button
            type="button"
            className={cn(
              "rounded-sm px-1.5",
              syncTime ? "text-gold" : "text-muted",
            )}
            onClick={() => setSyncTime(!syncTime)}
            title="同步时间轴"
          >
            轴同步
          </button>
          <button
            type="button"
            className={cn(
              "rounded-sm px-1.5",
              syncCrosshair ? "text-gold" : "text-muted",
            )}
            onClick={() => setSyncCrosshair(!syncCrosshair)}
            title="同步十字光标"
          >
            光标同步
          </button>
          <form
            className="ml-1 flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (cmp.trim()) addCompare(cmp.trim());
              setCmp("");
            }}
          >
            <input
              value={cmp}
              onChange={(e) => setCmp(e.target.value.toUpperCase())}
              placeholder="对比 ETHUSDT"
              className="w-24 bg-transparent text-micro outline-none placeholder:text-subtle"
            />
          </form>
          {compareSymbols.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-sm px-1 text-gold"
              onClick={() => removeCompare(s)}
            >
              {s.replace("USDT", "")} ×
            </button>
          ))}
        </>
      )}

      {master && (
        <>
          <i className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            aria-label="导出截图"
            className="rounded-sm p-1 text-muted hover:text-fg"
            title="截图"
            onClick={screenshot}
          >
            <Camera className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="导出数据"
            className="rounded-sm px-1.5 text-muted hover:text-fg"
            onClick={openExport}
          >
            CSV/JSON
          </button>
        </>
      )}
      <button
        type="button"
        aria-label="自适应缩放"
        className="rounded-sm p-1 text-muted hover:text-fg"
        onClick={() => engine?.fit()}
      >
        <Maximize2 className="size-3.5" />
      </button>

      {/* 时间区间快捷预设 */}
      <i className="mx-1 h-4 w-px bg-border" />
      {(
        [
          ["1H", 3600],
          ["4H", 14400],
          ["1D", 86400],
          ["1W", 604800],
          ["1M", 2592000],
        ] as const
      ).map(([label, secs]) => (
        <button
          key={label}
          type="button"
          title={`最近 ${label}`}
          className="rounded-sm px-1.5 text-muted hover:text-gold"
          onClick={() => {
            const to = Math.floor(Date.now() / 1000);
            engine?.setVisibleTimeRange(to - secs, to);
          }}
        >
          {label}
        </button>
      ))}
      <Countdown closeAt={closeAt} />
    </div>
  );
}

function Countdown({ closeAt }: { closeAt: number }) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, closeAt - Date.now());
  const s = Math.floor(left / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className="ml-2 font-mono text-muted">
      收盘 {mm}:{ss}
    </span>
  );
}
