import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { MouseEventHandler, Time } from "lightweight-charts";
import type { ChartEngine } from "@/lib/market/chart-engine";
import { barAtTime } from "@/lib/market/bars";
import { useTerminal } from "@/lib/market/store";
import { fmtNum, fmtPx } from "@/lib/utils";

/**
 * Cursor-following OHLC readout (P3-A4): the crosshair subscription that feeds
 * the legend overlay bar and paints the floating OHLC bubble imperatively
 * (DOM style writes only — a React render per mousemove is what a pan would
 * have to wait behind, so this stays canvas-side).
 */
export function useOhlcReadout(
  eng: RefObject<ChartEngine | null>,
  ready: number,
  master: boolean,
) {
  const readoutRef = useRef<HTMLDivElement>(null);
  const ohlcState = useRef(0);

  useEffect(() => {
    const e = eng.current;
    if (!e || !e.chart) return;
    const chart = e.chart;
    const hide = () => {
      ohlcState.current = 0;
      if (readoutRef.current) readoutRef.current.style.opacity = "0";
    };
    const onMove: MouseEventHandler<Time> = (param) => {
      // Frozen while the button owns the chart: the legend is DOM, and a React
      // render per mousemove is what a pan would have to wait behind.
      if (!master || e.isDragging) return;
      const t = param.time as number | undefined;
      if (!t) {
        useTerminal.getState().setOverlay(null);
        hide();
        return;
      }
      const bar = barAtTime(useTerminal.getState().bars, t);
      useTerminal.getState().setOverlay(bar ?? null);
      if (bar && param.point && readoutRef.current) {
        const ro = readoutRef.current;
        ohlcState.current = 1;
        ro.style.opacity = "1";
        const w = e.chart.chartElement().clientWidth ?? 0;
        const left =
          param.point.x + 14 + 200 > w
            ? param.point.x - 210
            : param.point.x + 14;
        ro.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, param.point.y - 28)}px)`;
        const up = bar.close >= bar.open;
        const cls = up ? "text-up" : "text-down";
        ro.innerHTML =
          `<span class="font-semibold text-fg">${useTerminal.getState().symbol}</span>` +
          `<span class="text-subtle">${new Date(t * 1000).toLocaleString()}</span>` +
          `<span class="${cls}">开 ${fmtPx(bar.open)}</span>` +
          `<span class="${cls}">高 ${fmtPx(bar.high)}</span>` +
          `<span class="${cls}">低 ${fmtPx(bar.low)}</span>` +
          `<span class="${cls}">收 ${fmtPx(bar.close)}</span>` +
          `<span class="text-subtle">量 ${fmtNum(bar.volume, 3)}</span>`;
      } else if (readoutRef.current) {
        ohlcState.current = 0;
        readoutRef.current.style.opacity = "0";
      }
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [eng, ready, master]);

  return { readoutRef, ohlcState };
}
