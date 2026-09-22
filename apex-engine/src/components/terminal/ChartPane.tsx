import { memo, useEffect, useRef, useState } from "react";
import { useChartEngine } from "./panes/use-chart-engine.ts";
import { useViewportCoverage } from "./panes/use-viewport-coverage.ts";
import { useOhlcReadout } from "./panes/use-ohlc-readout.ts";
import { useDrawClick } from "./panes/use-draw-click.ts";
import { useSyncEffects } from "./panes/use-sync-effects.ts";
import { useHistoryFill } from "./panes/use-history-fill.ts";
import { historyKey } from "@/lib/market/history";
import { NO_BARS, useTerminal } from "@/lib/market/store";
import type { Candle, Interval } from "@/lib/market/types";
import { uid } from "@/lib/utils";
import { ChartToolbar } from "./ChartToolbar";
import { ChartContextMenu } from "./ChartContextMenu";
import { DrawingOverlay } from "./DrawingOverlay";
import { HTFBar } from "./HTFBar";
import { TpSlOverlay } from "./TpSlOverlay";
import { Legend } from "./Legend";

type Props = {
  paneId?: string;
  master?: boolean;
};

/**
 * ChartPane — composition of feature hooks (P3-A4). Each concern (engine
 * lifecycle, viewport/coverage/minimap, OHLC readout, click-to-draw, one-way
 * engine sync, history fill) lives in `panes/` and is wired here; the JSX is
 * the only thing left in the component.
 */
export const ChartPane = memo(function ChartPane({
  paneId = "p0",
  master = true,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { eng, ready } = useChartEngine(host, paneId, master);

  // Pane identity (selectors stay here — the JSX legend/HTF bar need them).
  const overlayBar = useTerminal((s) => s.overlay);
  const symbol = useTerminal((s) => s.symbol);
  const market = useTerminal((s) => s.market);
  const masterInterval = useTerminal((s) => s.interval);
  const pane = useTerminal((s) => s.panes.find((p) => p.id === paneId));
  const interval: Interval = pane?.interval ?? masterInterval;
  const compareSymbols = useTerminal((s) => s.compareSymbols);
  const lastBar = useTerminal((s) =>
    master ? s.lastBar : ((s.paneBars[paneId] ?? NO_BARS).at(-1) ?? null),
  );
  const invert = useTerminal((s) => s.invert);
  const mirrorAxis = useTerminal((s) => s.mirrorAxis);
  const historyKey_ = historyKey(market, symbol, interval);

  // Visible window (sec) of this pane, throttled: it feeds the HTF context bar
  // highlight and must not re-render the pane every wheel frame.
  const viewRangeRef = useRef<{ from: number; to: number } | null>(null);
  const [, bumpView] = useState(0);
  const setViewRange = (from: number, to: number) => {
    const prev = viewRangeRef.current;
    if (prev && Math.abs(prev.from - from) < (prev.to - prev.from) * 0.03)
      return;
    if (prev?.from === from && prev?.to === to) return;
    viewRangeRef.current = { from, to };
    bumpView((v) => v + 1);
  };

  const { minimapSlider, mmState } = useViewportCoverage(
    eng,
    ready,
    paneId,
    master,
    setViewRange,
  );
  const { readoutRef, ohlcState } = useOhlcReadout(eng, ready, master);
  const draw = useDrawClick(eng, ready, master);
  useSyncEffects(eng, ready, paneId, master, interval);
  useHistoryFill(paneId, master, symbol, market, interval);

  // Global shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z / Ctrl+Y redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      const st = useTerminal.getState();
      if (e.shiftKey) st.redo();
      else st.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown: Candle | null = (master ? overlayBar : null) ?? lastBar ?? null;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-bg">
      <ChartToolbar engine={eng.current} paneId={paneId} master={master} />
      {master && (
        <HTFBar
          interval={interval}
          viewFrom={viewRangeRef.current?.from ?? null}
          viewTo={viewRangeRef.current?.to ?? null}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={host}
          className="absolute inset-0"
          onDoubleClick={(e) => {
            // Double-click zooms in around the cursor (desktop/trackpad; the
            // pointer tools stay untouched so double-clicks keep drawing).
            const tool = useTerminal.getState().tool;
            if (tool !== "cursor" && tool !== "cross" && tool !== "order")
              return;
            const rect = e.currentTarget.getBoundingClientRect();
            eng.current?.zoomAt(e.clientX - rect.left, rect.width, 1.6);
          }}
        />
        {master && (
          <div
            className="absolute inset-x-2 bottom-1 z-10 h-1.5 cursor-pointer rounded-full bg-border/70"
            title="当前可见范围 · 点击跳转"
            onClick={(ev) => {
              const wrapper = ev.currentTarget as HTMLDivElement;
              const rect = wrapper.getBoundingClientRect();
              const ratio = (ev.clientX - rect.left) / rect.width;
              const stBars = useTerminal.getState().bars;
              if (!stBars.length || !eng.current) return;
              const t0 = stBars[0].time;
              const t1 = stBars[stBars.length - 1].time;
              const span = t1 - t0;
              if (span <= 0) return;
              const mid = t0 + span * ratio;
              const half = Math.max(span * 0.05, 60_000);
              eng.current?.setVisibleTimeRange(mid - half, mid + half);
            }}
          >
            <div
              ref={minimapSlider}
              className="absolute top-0 h-full rounded-full bg-gold/80"
              style={{
                left: mmState.current.left,
                width: mmState.current.width,
                opacity: mmState.current.opacity,
              }}
            />
          </div>
        )}
        <div
          ref={readoutRef}
          className="pointer-events-none absolute left-0 top-0 z-10 flex gap-2 whitespace-nowrap rounded-sm border border-border bg-elevated/90 px-1.5 py-0.5 text-[10px] leading-tight text-muted backdrop-blur-sm"
          style={{ opacity: ohlcState.current }}
        />
        <DrawingOverlay engine={eng.current} />
        <TpSlOverlay engine={eng.current} />
        <ChartContextMenu engine={eng.current} />
        {shown && (
          <Legend
            symbol={symbol}
            interval={interval}
            bar={shown}
            invert={invert}
            mirrorAxis={master && mirrorAxis}
            compareSymbols={compareSymbols}
            historyKey_={historyKey_}
          />
        )}
        {draw.textDraft && (
          <input
            ref={draw.textInput}
            value={draw.textDraftValue}
            onChange={(e) => draw.setTextDraftValue(e.target.value)}
            placeholder="输入标注文字，回车确认"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const t = draw.textDraft;
                const v = draw.textDraftValue.trim();
                draw.textOpenRef.current = false;
                draw.setTextDraft(null);
                draw.setTextDraftValue("");
                if (!t || !v) return;
                useTerminal.getState().addDrawing({
                  id: uid(),
                  tool: "text",
                  points: [{ time: t.time, price: t.price, text: v }],
                  color: "#f0b90b",
                });
              } else if (e.key === "Escape") {
                draw.textOpenRef.current = false;
                draw.setTextDraft(null);
                draw.setTextDraftValue("");
              }
            }}
            onBlur={() => {
              draw.textOpenRef.current = false;
              draw.setTextDraft(null);
              draw.setTextDraftValue("");
            }}
            className="absolute z-20 w-44 border border-gold bg-elevated px-1.5 py-0.5 text-xs text-fg outline-none"
            style={{ left: draw.textDraft.x, top: draw.textDraft.y }}
          />
        )}
      </div>
    </div>
  );
});
