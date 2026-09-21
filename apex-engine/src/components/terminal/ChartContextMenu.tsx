import { useEffect, useRef, useState } from "react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import { useTerminal } from "@/lib/market/store";

/**
 * Right-click context menu on the chart: quick access to common actions.
 * Owns its own open/close state; closes on outside click / Escape.
 */
export function ChartContextMenu({ engine }: { engine: ChartEngine | null }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const open = (e: MouseEvent) => {
      if (e.button !== 2) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, button")) return;
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
    };
    const close = (e: MouseEvent) => {
      if (
        ref.current &&
        e.button === 0 &&
        !ref.current.contains(e.target as Node)
      ) {
        setPos(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPos(null);
    };
    document.addEventListener("contextmenu", open);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", open);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!pos) return null;

  const item =
    "block w-full rounded-sm px-3 py-1.5 text-left text-micro text-muted hover:bg-elevated hover:text-fg";
  const act = (fn: () => void) => () => {
    fn();
    setPos(null);
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-40 rounded-md border border-border bg-surface py-1 shadow-lg"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={act(() => useTerminal.getState().setIndicatorOpen(true))}
      >
        添加指标…
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={act(() => useTerminal.getState().setSettingsOpen(true))}
      >
        图表设置…
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={act(() => {
          const st = useTerminal.getState();
          st.toggleMirrorAxis();
        })}
      >
        倒垂切换
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={act(() => {
          const st = useTerminal.getState();
          st.toggleVol();
        })}
      >
        {useTerminal.getState().showVol ? "隐藏成交量" : "显示成交量"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={act(() => {
          if (engine) {
            const c = engine.screenshot?.();
            if (c)
              c.toBlob((b) => {
                if (!b) return;
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = "apex-chart.png";
                a.click();
              });
          }
        })}
      >
        导出截图
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={act(() => {
          const st = useTerminal.getState();
          if (st.selectedDrawingId) st.removeDrawing(st.selectedDrawingId);
        })}
      >
        删除选中绘图
      </button>
    </div>
  );
}
