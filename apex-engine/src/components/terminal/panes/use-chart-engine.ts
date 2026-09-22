import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ChartEngine } from "@/lib/market/chart-engine";
import { useTerminal } from "@/lib/market/store";

/**
 * Chart engine lifecycle (P3-A4): owns host ref → engine creation with the
 * lazy-boot ResizeObserver (a zero-size pane gets no engine until it can be
 * seen), the DEV `__chartEngines` probe hook, and destroy on unmount.
 *
 * `ready` bumps once the engine exists — feature hooks key their subscriptions
 * on it so wire-up never misses a lazily-booted engine.
 */
export function useChartEngine(
  hostRef: RefObject<HTMLDivElement | null>,
  paneId: string,
  master: boolean,
): { eng: RefObject<ChartEngine | null>; ready: number } {
  const eng = useRef<ChartEngine | null>(null);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
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
      setReady((v) => v + 1);
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
  }, [hostRef, paneId, master]);

  return { eng, ready };
}
