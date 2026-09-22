import { memo, useEffect, useRef, useState } from "react";
import { ChartEngine } from "@/lib/market/chart-engine";
import { barAtTime } from "@/lib/market/bars";
import { COMPARE_COLORS } from "@/lib/market/constants";
import {
  cancelHistory,
  ensureCompleteHistory,
  ensureCoverage,
  historyKey,
  masterRef,
  paneRef,
} from "@/lib/market/history";
import { NO_BARS, useTerminal } from "@/lib/market/store";
import type { Candle, DrawPoint, Interval } from "@/lib/market/types";
import { fmtNum, fmtPx, uid } from "@/lib/utils";
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

type Snapshot = ReturnType<typeof useTerminal.getState>;

function refFor(st: Snapshot, paneId: string, master: boolean) {
  const iv = (st.panes.find((p) => p.id === paneId)?.interval ??
    st.interval) as Interval;
  return master
    ? masterRef(st.symbol, st.market, iv, paneId)
    : paneRef(paneId, st.symbol, st.market, iv);
}

export const ChartPane = memo(function ChartPane({
  paneId = "p0",
  master = true,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const eng = useRef<ChartEngine | null>(null);
  const applyingRemote = useRef(false);
  const bars = useTerminal((s) =>
    master ? s.bars : (s.paneBars[paneId] ?? NO_BARS),
  );
  const lastBar = useTerminal((s) =>
    master ? s.lastBar : ((s.paneBars[paneId] ?? NO_BARS).at(-1) ?? null),
  );
  const chartType = useTerminal((s) => s.chartType);
  const invert = useTerminal((s) => s.invert);
  const mirrorAxis = useTerminal((s) => s.mirrorAxis);
  const logScale = useTerminal((s) => s.logScale);
  const showVol = useTerminal((s) => s.showVol);
  const mirrorVolume = useTerminal((s) => !!s.chartSettings.mirrorVolume);
  const mousePan = useTerminal((s) => s.chartSettings.mousePanSensitivity ?? 1);
  const tool = useTerminal((s) => s.tool);
  const indicators = useTerminal((s) => s.indicators);
  const customFns = useTerminal((s) => s.customFns);
  const overlayBar = useTerminal((s) => s.overlay);
  const symbol = useTerminal((s) => s.symbol);
  const market = useTerminal((s) => s.market);
  const masterInterval = useTerminal((s) => s.interval);
  const pane = useTerminal((s) => s.panes.find((p) => p.id === paneId));
  const interval: Interval = pane?.interval ?? masterInterval;
  const compareSymbols = useTerminal((s) => s.compareSymbols);
  const compareBars = useTerminal((s) => s.compareBars);
  const syncTime = useTerminal((s) => s.syncTime);
  const syncCrosshair = useTerminal((s) => s.syncCrosshair);
  const linkedRange = useTerminal((s) => s.linkedRange);
  const linkedCrosshair = useTerminal((s) => s.linkedCrosshair);
  const historyKey_ = historyKey(market, symbol, interval);
  const historyPhase = useTerminal((s) => s.historyStatus[historyKey_]?.phase);
  const theme = useTerminal((s) => s.theme);
  const chartSettings = useTerminal((s) => s.chartSettings);
  const draft = useRef<DrawPoint[]>([]);
  const [, tick] = useState(0);
  // Inline text-tool editor: position of the pending annotation input.
  const [textDraft, setTextDraft] = useState<{
    x: number;
    y: number;
    time: number;
    price: number;
  } | null>(null);
  const [textDraftValue, setTextDraftValue] = useState("");
  const textInput = useRef<HTMLInputElement>(null);
  // True while the inline text editor is open: a subsequent chart click closes
  // it instead of reopening the editor at the new spot.
  const textOpenRef = useRef(false);
  // Cursor-following OHLC readout (updated imperatively, never via React state).
  const ohlcReadout = useRef<HTMLDivElement>(null);
  // Minimap strip: visible-range indicator + click-to-jump. Imperative style
  // updates live in this ref so a React re-render (any store change) cannot
  // clobber them — the JSX reads the same source of truth.
  const minimapSlider = useRef<HTMLDivElement>(null);
  const mmState = useRef({ left: "0%", width: "8%", opacity: 0 });
  const ohlcState = useRef(0);
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

  const hideOhlcReadout = () => {
    ohlcState.current = 0;
    if (ohlcReadout.current) ohlcReadout.current.style.opacity = "0";
  };

  useEffect(() => {
    if (textDraft) textInput.current?.focus();
  }, [textDraft]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let engine: ChartEngine | null = null;
    let ro: ResizeObserver | null = null;

    const boot = () => {
      /* A pane nobody can see — hidden by the breakpoint branch, or collapsed to
       * 0 height by the layout — gets no engine: it would take the same 100k bars
       * and paint every reveal a second time for nothing. Created once and never
       * torn back off, so a transient 0-size frame cannot blank the visible board. */
      if (engine || !el.clientWidth || !el.clientHeight) return;
      const st = useTerminal.getState();
      let e: ChartEngine;
      try {
        e = new ChartEngine(el, st.theme, st.chartSettings);
      } catch {
        return;
      }
      engine = e;
      eng.current = e;
      // dev-only hook: expose live engines for headless regression probes
      if (import.meta.env.DEV) {
        const win = window as unknown as { __chartEngines?: ChartEngine[] };
        (win.__chartEngines ??= []).push(e);
      }
      // The only way a pan can need data is if the background fill has not reached
      // that far back yet; ensureCoverage restarts the fill in that case and does
      // nothing at all while the array already spans the viewport.
      e.onViewport = (from, to) => {
        ensureCoverage(refFor(useTerminal.getState(), paneId, master), from);
        setViewRange(from, to);
      };
      e.onMinimap = (range) => {
        const slider = minimapSlider.current;
        if (!slider) return;
        const stBars = useTerminal.getState().bars;
        if (!stBars.length) return;
        const t0 = stBars[0].time;
        const t1 = stBars[stBars.length - 1].time;
        const span = t1 - t0;
        if (span <= 0) return;
        if (!range) {
          mmState.current.opacity = 0;
          slider.style.opacity = "0";
          return;
        }
        const left = Math.max(
          0,
          Math.min(100, ((range.from - t0) / span) * 100),
        );
        const width = Math.max(
          1.5,
          Math.min(100 - left, ((range.to - range.from) / span) * 100),
        );
        mmState.current = { left: `${left}%`, width: `${width}%`, opacity: 1 };
        slider.style.opacity = "1";
        slider.style.left = `${left}%`;
        slider.style.width = `${width}%`;
      };
      e.onRange = (from, to) => {
        if (applyingRemote.current) return;
        const st = useTerminal.getState();
        // One pane has nobody to tell: the write would only re-render the board the
        // pointer is dragging.
        if (!st.syncTime || st.panes.length < 2) return;
        st.setLinkedRange({ from, to, paneId });
      };
      e.onCrosshair = (time, price) => {
        if (applyingRemote.current) return;
        if (!useTerminal.getState().syncCrosshair) return;
        if (time == null || price == null) {
          useTerminal.getState().setLinkedCrosshair(null);
          return;
        }
        useTerminal.getState().setLinkedCrosshair({ time, price, paneId });
      };
      e.chart.subscribeCrosshairMove((param) => {
        // Frozen while the button owns the chart: the legend is DOM, and a React
        // render per mousemove is what a pan would have to wait behind.
        if (!master || e.isDragging) return;
        const t = param.time as number | undefined;
        if (!t) {
          useTerminal.getState().setOverlay(null);
          hideOhlcReadout();
          return;
        }
        const bar = barAtTime(useTerminal.getState().bars, t);
        useTerminal.getState().setOverlay(bar ?? null);
        if (bar && param.point && ohlcReadout.current) {
          const ro = ohlcReadout.current;
          ohlcState.current = 1;
          ro.style.opacity = "1";
          const w = el.clientWidth;
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
        } else if (ohlcReadout.current) {
          ohlcState.current = 0;
          ohlcReadout.current.style.opacity = "0";
        }
      });
      const onClick = (param: {
        point?: { x: number; y: number };
        time?: unknown;
      }) => {
        if (!master) return;
        const engine = eng.current;
        const cur = useTerminal.getState().tool;
        if (!engine || !param.point) return;
        if (cur === "cursor" || cur === "cross") return;
        const time = engine.xToTime(param.point.x);
        const price = engine.yToPrice(param.point.y);
        if (time == null || price == null) return;
        // Click-to-trade: hand the clicked price to the order ticket.
        if (cur === "order") {
          useTerminal.getState().setChartOrderPrice(price);
          return;
        }
        const pt = { time, price };
        // Text annotation: open the inline editor at the click point.
        if (cur === "text") {
          if (textOpenRef.current) {
            // Dismiss-click on the chart: close, don't re-open elsewhere.
            textOpenRef.current = false;
            setTextDraft(null);
            setTextDraftValue("");
            return;
          }
          textOpenRef.current = true;
          setTextDraft({ x: param.point.x, y: param.point.y, time, price });
          return;
        }
        if (cur === "hline" || cur === "vline") {
          useTerminal.getState().addDrawing({
            id: uid(),
            tool: cur,
            points: [pt],
            color: "#f0b90b",
          });
          return;
        }
        draft.current = [...draft.current, pt];
        const need = cur === "parallel" ? 3 : 2;
        if (draft.current.length >= need) {
          useTerminal.getState().addDrawing({
            id: uid(),
            tool: cur,
            points: draft.current,
            color: "#f0b90b",
          });
          draft.current = [];
        }
        tick((n) => n + 1);
      };
      e.chart.subscribeClick(onClick);
    };

    boot();
    if (!engine) {
      ro = new ResizeObserver(boot);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      engine?.destroy();
      eng.current = null;
    };
  }, [paneId, master]);

  useEffect(() => {
    eng.current?.setInterval(interval);
  }, [interval]);
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
  useEffect(() => {
    eng.current?.setType(chartType);
  }, [chartType]);
  useEffect(() => {
    eng.current?.setInvert(invert);
  }, [invert]);
  useEffect(() => {
    eng.current?.setMirror(mirrorAxis);
  }, [mirrorAxis]);
  useEffect(() => {
    eng.current?.setMirrorVolume(mirrorVolume);
  }, [mirrorVolume]);
  // Mouse drag sensitivity + grab/grabbing cursor. Drawing tools use a
  // crosshair; the pan cursor (grab) applies only to the default/cross tools.
  useEffect(() => {
    eng.current?.setPanSensitivity(mousePan);
  }, [mousePan]);
  useEffect(() => {
    eng.current?.setCursor(tool === "cursor" ? "default" : "crosshair");
  }, [tool]);
  useEffect(() => {
    eng.current?.setLog(logScale);
  }, [logScale]);
  useEffect(() => {
    eng.current?.setShowVol(showVol);
  }, [showVol]);
  useEffect(() => {
    eng.current?.setTheme(theme);
  }, [theme]);
  // Typography / price-precision changes apply live to the running engine.
  useEffect(() => {
    eng.current?.applyTypography(chartSettings);
  }, [chartSettings]);
  useEffect(() => {
    eng.current?.setFullData(bars, historyPhase !== "complete");
  }, [bars, historyPhase]);

  // Live path: in-place tail updates repaint via the engine's cheap
  // updateLastBar instead of re-committing the whole series.
  useEffect(() => {
    if (lastBar) eng.current?.updateLastBar(lastBar);
  }, [lastBar]);

  useEffect(() => {
    const ref = refFor(useTerminal.getState(), paneId, master);
    ensureCompleteHistory(ref);
    return () => cancelHistory(ref.jobKey);
  }, [paneId, master, symbol, market, interval]);
  useEffect(() => {
    eng.current?.setIndicators(master ? indicators : []);
  }, [indicators, master]);
  useEffect(() => {
    eng.current?.setCustomFns(master ? customFns : {});
  }, [customFns, master]);

  useEffect(() => {
    const engine = eng.current;
    if (!engine || !master) return;
    const live = new Set(compareSymbols);
    for (const sym of engine.compareKeys()) {
      if (!live.has(sym)) engine.removeCompare(sym);
    }
    compareSymbols.forEach((sym, i) => {
      const list = compareBars[sym] ?? [];
      if (!list.length) return;
      const color = COMPARE_COLORS[i] ?? "#00d4ff";
      if (!engine.hasCompare(sym)) engine.setCompare(sym, list, color);
      else engine.updateCompare(sym, list[list.length - 1], list);
    });
  }, [compareBars, compareSymbols, master]);

  useEffect(() => {
    if (!syncTime || !linkedRange || linkedRange.paneId === paneId) return;
    applyingRemote.current = true;
    eng.current?.setVisibleTimeRange(linkedRange.from, linkedRange.to);
    requestAnimationFrame(() => {
      applyingRemote.current = false;
    });
  }, [linkedRange, paneId, syncTime]);

  useEffect(() => {
    if (!syncCrosshair) return;
    if (!linkedCrosshair || linkedCrosshair.paneId === paneId) {
      if (!linkedCrosshair) eng.current?.setCrosshair(null, null);
      return;
    }
    applyingRemote.current = true;
    eng.current?.setCrosshair(linkedCrosshair.time, linkedCrosshair.price);
    requestAnimationFrame(() => {
      applyingRemote.current = false;
    });
  }, [linkedCrosshair, paneId, syncCrosshair]);

  const shown: Candle | null = (master ? overlayBar : null) ?? lastBar ?? null;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-bg">
      <ChartToolbar engine={eng.current} paneId={paneId} master={master} />
      {master && (
        <HTFBar
          symbol={symbol}
          market={market}
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
          ref={ohlcReadout}
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
        {textDraft && (
          <input
            ref={textInput}
            value={textDraftValue}
            onChange={(e) => setTextDraftValue(e.target.value)}
            placeholder="输入标注文字，回车确认"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const t = textDraft;
                const v = textDraftValue.trim();
                textOpenRef.current = false;
                setTextDraft(null);
                setTextDraftValue("");
                if (!t || !v) return;
                useTerminal.getState().addDrawing({
                  id: uid(),
                  tool: "text",
                  points: [{ time: t.time, price: t.price, text: v }],
                  color: "#f0b90b",
                });
              } else if (e.key === "Escape") {
                textOpenRef.current = false;
                setTextDraft(null);
                setTextDraftValue("");
              }
            }}
            onBlur={() => {
              textOpenRef.current = false;
              setTextDraft(null);
              setTextDraftValue("");
            }}
            className="absolute z-20 w-44 border border-gold bg-elevated px-1.5 py-0.5 text-xs text-fg outline-none"
            style={{ left: textDraft.x, top: textDraft.y }}
          />
        )}
      </div>
    </div>
  );
});
