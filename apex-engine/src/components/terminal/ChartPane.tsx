import { useEffect, useRef, useState } from "react";
import { ChartEngine } from "@/lib/market/chart-engine";
import { barAtTime } from "@/lib/market/bars";
import { COMPARE_COLORS, FIB_LEVELS } from "@/lib/market/constants";
import { cancelHistory, ensureCompleteHistory, ensureCoverage, historyKey, masterRef, paneRef } from "@/lib/market/history";
import { NO_BARS, useTerminal } from "@/lib/market/store";
import type { Candle, DrawPoint, Drawing, Interval } from "@/lib/market/types";
import { fmtNum, fmtPx, uid } from "@/lib/utils";
import { ChartToolbar } from "./ChartToolbar";

type Props = {
  paneId?: string;
  master?: boolean;
};

type Snapshot = ReturnType<typeof useTerminal.getState>;

function refFor(st: Snapshot, paneId: string, master: boolean) {
  const iv = (st.panes.find((p) => p.id === paneId)?.interval ?? st.interval) as Interval;
  return master ? masterRef(st.symbol, st.market, iv, paneId) : paneRef(paneId, st.symbol, st.market, iv);
}

export function ChartPane({ paneId = "p0", master = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const eng = useRef<ChartEngine | null>(null);
  const applyingRemote = useRef(false);
  const [ready, setReady] = useState(false);
  const bars = useTerminal((s) => (master ? s.bars : (s.paneBars[paneId] ?? NO_BARS)));
  const chartType = useTerminal((s) => s.chartType);
  const invert = useTerminal((s) => s.invert);
  const mirrorAxis = useTerminal((s) => s.mirrorAxis);
  const logScale = useTerminal((s) => s.logScale);
  const showVol = useTerminal((s) => s.showVol);
  const mirrorVolume = useTerminal((s) => !!s.chartSettings.mirrorVolume);
  const indicators = useTerminal((s) => s.indicators);
  const overlayBar = useTerminal((s) => s.overlay);
  const last = bars.at(-1);
  const symbol = useTerminal((s) => s.symbol);
  const market = useTerminal((s) => s.market);
  const masterInterval = useTerminal((s) => s.interval);
  const pane = useTerminal((s) => s.panes.find((p) => p.id === paneId));
  const interval: Interval = pane?.interval ?? masterInterval;
  const drawings = useTerminal((s) => s.drawings);
  const compareSymbols = useTerminal((s) => s.compareSymbols);
  const compareBars = useTerminal((s) => s.compareBars);
  const syncTime = useTerminal((s) => s.syncTime);
  const syncCrosshair = useTerminal((s) => s.syncCrosshair);
  const linkedRange = useTerminal((s) => s.linkedRange);
  const linkedCrosshair = useTerminal((s) => s.linkedCrosshair);
  const historyKey_ = historyKey(market, symbol, interval);
  const historyPhase = useTerminal((s) => s.historyStatus[historyKey_]?.phase);
  const theme = useTerminal((s) => s.theme);
  const draft = useRef<DrawPoint[]>([]);
  const [, tick] = useState(0);

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
      setReady(true);
      // The only way a pan can need data is if the background fill has not reached
      // that far back yet; ensureCoverage restarts the fill in that case and does
      // nothing at all while the array already spans the viewport.
      e.onViewport = (from) => {
        ensureCoverage(refFor(useTerminal.getState(), paneId, master), from);
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
          return;
        }
        const bar = barAtTime(useTerminal.getState().bars, t);
        useTerminal.getState().setOverlay(bar ?? null);
      });
      const onClick = (param: { point?: { x: number; y: number }; time?: unknown }) => {
        if (!master) return;
        const engine = eng.current;
        const cur = useTerminal.getState().tool;
        if (!engine || !param.point || cur === "cursor" || cur === "cross") return;
        const time = engine.xToTime(param.point.x);
        const price = engine.yToPrice(param.point.y);
        if (time == null || price == null) return;
        const pt = { time, price };
        if (cur === "hline" || cur === "vline") {
          useTerminal.getState().addDrawing({ id: uid(), tool: cur, points: [pt], color: "#f0b90b" });
          return;
        }
        draft.current = [...draft.current, pt];
        const need = cur === "parallel" ? 3 : 2;
        if (draft.current.length >= need) {
          useTerminal.getState().addDrawing({ id: uid(), tool: cur, points: draft.current, color: "#f0b90b" });
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
  useEffect(() => {
    eng.current?.setLog(logScale);
  }, [logScale]);
  useEffect(() => {
    eng.current?.setShowVol(showVol);
  }, [showVol]);
  useEffect(() => {
    eng.current?.setTheme(theme);
  }, [theme]);
  useEffect(() => {
    eng.current?.setFullData(bars, historyPhase !== "complete");
  }, [bars, historyPhase]);
  
  useEffect(() => {
    const ref = refFor(useTerminal.getState(), paneId, master);
    ensureCompleteHistory(ref);
    return () => cancelHistory(ref.jobKey);
  }, [paneId, master, symbol, market, interval]);
  useEffect(() => {
    eng.current?.setIndicators(master ? indicators : []);
  }, [indicators, master]);

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

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const shown: Candle | null = (master ? overlayBar : null) ?? last ?? null;
  const up = shown ? (invert ? shown.close < shown.open : shown.close >= shown.open) : true;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-bg">
      <ChartToolbar engine={eng.current} paneId={paneId} master={master} />
      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0" />
        <svg ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full">
          {ready && master && drawings.map((d) => <DrawShape key={d.id} d={d} engine={eng.current} />)}
        </svg>
        {shown && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap gap-2 text-micro text-muted">
            {master && mirrorAxis && (
              <span className="text-gold" title="价格轴已上下翻转">
                ↕ 倒垂
              </span>
            )}
            <span>
              {symbol} {interval}
            </span>
            <span>
              开 <b className={up ? "text-up" : "text-down"}>{fmtPx(shown.open)}</b>
            </span>
            <span>
              高 <b className={up ? "text-up" : "text-down"}>{fmtPx(shown.high)}</b>
            </span>
            <span>
              低 <b className={up ? "text-up" : "text-down"}>{fmtPx(shown.low)}</b>
            </span>
            <span>
              收 <b className={up ? "text-up" : "text-down"}>{fmtPx(shown.close)}</b>
            </span>
            <span>
              量 <b className="text-fg">{fmtNum(shown.volume, 3)}</b>
            </span>
            <HistoryBadge statusKey={historyKey_} />
            {master && compareSymbols.length > 0 && (
              <span className="text-gold">对比 {compareSymbols.map((s) => s.replace("USDT", "")).join(" / ")}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryBadge({ statusKey }: { statusKey: string }) {
  const status = useTerminal((s) => s.historyStatus[statusKey]);
  if (!status) return null;
  if (status.phase === "error") return <span className="text-down">历史补齐中断 · 移动视图重试</span>;
  if (status.phase === "complete") {
    const from = status.oldest ? new Date(status.oldest * 1000).toISOString().slice(0, 10) : "";
    return <span className="text-subtle">完整 {status.bars.toLocaleString()} 根{from && ` · 始于 ${from}`}</span>;
  }
  const pct = status.target ? Math.min(99, Math.round((status.bars / status.target) * 100)) : 0;
  return <span className="text-gold">后台补齐 {pct}%</span>;
}

function DrawShape({ d, engine }: { d: Drawing; engine: ChartEngine | null }) {
  if (!engine) return null;
  const xy = (p: DrawPoint) => {
    const x = engine.timeToX(p.time);
    const y = engine.priceToY(p.price);
    return x != null && y != null ? { x, y } : null;
  };
  const pts = d.points.map(xy);
  if (pts.some((p) => !p)) return null;
  const color = d.color;
  if (d.tool === "hline" && pts[0]) {
    return <line x1={0} x2="100%" y1={pts[0].y} y2={pts[0].y} stroke={color} strokeWidth={1} />;
  }
  if (d.tool === "vline" && pts[0]) {
    return <line y1={0} y2="100%" x1={pts[0].x} x2={pts[0].x} stroke={color} strokeWidth={1} />;
  }
  if ((d.tool === "trend" || d.tool === "ray" || d.tool === "measure") && pts[0] && pts[1]) {
    return (
      <g>
        <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={color} strokeWidth={1} />
        {d.tool === "measure" && (
          <text x={(pts[0].x + pts[1].x) / 2} y={(pts[0].y + pts[1].y) / 2 - 6} fill={color} fontSize={10}>
            {(((d.points[1].price - d.points[0].price) / d.points[0].price) * 100).toFixed(2)}%
          </text>
        )}
      </g>
    );
  }
  if (d.tool === "rect" && pts[0] && pts[1]) {
    const x = Math.min(pts[0].x, pts[1].x);
    const y = Math.min(pts[0].y, pts[1].y);
    return (
      <rect
        x={x}
        y={y}
        width={Math.abs(pts[1].x - pts[0].x)}
        height={Math.abs(pts[1].y - pts[0].y)}
        fill={`${color}22`}
        stroke={color}
      />
    );
  }
  if (d.tool === "fib" && pts[0] && pts[1]) {
    const a0 = pts[0];
    const a1 = pts[1];
    return (
      <g>
        {FIB_LEVELS.map((lv) => {
          const y = a0.y + (a1.y - a0.y) * lv;
          const px = d.points[0].price + (d.points[1].price - d.points[0].price) * lv;
          return (
            <g key={lv}>
              <line x1={0} x2="100%" y1={y} y2={y} stroke={color} strokeOpacity={0.6} />
              <text x={8} y={y - 2} fill={color} fontSize={10}>
                {lv} {fmtPx(px)}
              </text>
            </g>
          );
        })}
      </g>
    );
  }
  if (d.tool === "parallel" && pts[0] && pts[1] && pts[2]) {
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return (
      <g>
        <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={color} />
        <line x1={pts[2].x} y1={pts[2].y} x2={pts[2].x + dx} y2={pts[2].y + dy} stroke={color} />
      </g>
    );
  }
  return null;
}
