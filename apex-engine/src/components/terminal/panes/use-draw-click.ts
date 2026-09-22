import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import { getDrawingTool } from "@/lib/plugins/registry";
import { useTerminal } from "@/lib/market/store";
import type { DrawPoint } from "@/lib/market/types";
import { uid } from "@/lib/utils";

export interface TextDraft {
  x: number;
  y: number;
  time: number;
  price: number;
}

/**
 * Click-to-draw pipeline (P3-A4): the chart click subscription handling
 * click-to-trade, text annotation draft, single-point tools and multi-point
 * geometry (builtin + plugin point counts). Owns the inline text-editor state
 * so the panes stay self-contained.
 */
export function useDrawClick(
  eng: RefObject<ChartEngine | null>,
  ready: number,
  master: boolean,
) {
  const draft = useRef<DrawPoint[]>([]);
  const [, tick] = useState(0);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [textDraftValue, setTextDraftValue] = useState("");
  const textInput = useRef<HTMLInputElement>(null);
  const textOpenRef = useRef(false);

  useEffect(() => {
    const e = eng.current;
    if (!e || !e.chart) return;
    const chart = e.chart;
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
      if (cur === "hline" || cur === "vline" || cur === "fib-time-zone") {
        useTerminal.getState().addDrawing({
          id: uid(),
          tool: cur,
          points: [pt],
          color: "#f0b90b",
        });
        return;
      }
      draft.current = [...draft.current, pt];
      // Phase-1 geometric tools need 3 anchors (wedge/pitchfork/symmetry
      // derive a second rail from the third point); everything else is 2.
      // P2-A3: plugin drawing tools declare their own point count.
      const POINT_NEED: Record<string, number> = {
        parallel: 3,
        wedge: 3,
        pitchfork: 3,
        symmetry: 3,
      };
      const plugin = getDrawingTool(cur);
      const need = POINT_NEED[cur] ?? plugin?.points ?? 2;
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
    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
  }, [eng, ready, master]);

  // Focus the inline text editor once it opens.
  useEffect(() => {
    if (textDraft) textInput.current?.focus();
  }, [textDraft]);

  return {
    draft,
    textDraft,
    setTextDraft,
    textDraftValue,
    setTextDraftValue,
    textInput,
    textOpenRef,
  };
}
