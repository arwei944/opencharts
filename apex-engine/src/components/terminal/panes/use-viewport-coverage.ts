import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import { ensureCoverage } from "@/lib/market/history";
import { chartTelemetry } from "@/lib/market/telemetry";
import { VIEWPORT_LOOKAHEAD_BARS } from "@/lib/market/constants";
import {
  adaptiveLookahead,
  predictVelocity,
  pushSample,
  type PanSample,
} from "@/lib/market/predictor";
import { useTerminal } from "@/lib/market/store";
import { seriesRefFor } from "./series-ref.ts";

/**
 * Viewport + minimap + linked-range/crosshair wiring (P3-A4): the observer
 * callbacks the engine exposes get hooked up here — velocity-aware coverage
 * (predictor), the minimap strip (imperative style updates), and the
 * multi-pane link publish/subscribe dance. React state is kept out of the hot
 * paths (canvas-side style writes only).
 */
export function useViewportCoverage(
  eng: RefObject<ChartEngine | null>,
  ready: number,
  paneId: string,
  master: boolean,
  onViewRange: (from: number, to: number) => void,
) {
  const applyingRemote = useRef(false);
  const minimapSlider = useRef<HTMLDivElement>(null);
  const mmState = useRef({ left: "0%", width: "8%", opacity: 0 });

  useEffect(() => {
    const e = eng.current;
    if (!e) return;

    // P1-C2: velocity-aware lookahead — fast leftward pans trigger the fill
    // before the frontier comes into view, not after.
    let panSamples: PanSample[] = [];
    e.onViewport = (from, to) => {
      panSamples = pushSample(panSamples, { t: Date.now(), from, to });
      const lookahead = adaptiveLookahead(predictVelocity(panSamples));
      if (lookahead > VIEWPORT_LOOKAHEAD_BARS) {
        chartTelemetry.log("panPredict", { from, lookahead });
      }
      const st = useTerminal.getState();
      const ref = seriesRefFor(st, paneId, master);
      ensureCoverage(ref, from, lookahead);
      onViewRange(from, to);
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
      const left = Math.max(0, Math.min(100, ((range.from - t0) / span) * 100));
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
      // One pane has nobody to tell: the write would only re-render the board
      // the pointer is dragging.
      if (!st.syncTime || st.panes.length < 2) return;
      st.setLinkedRange({ from, to, paneId });
    };

    e.onCrosshair = (time, price) => {
      if (applyingRemote.current) return;
      const st = useTerminal.getState();
      if (!st.syncCrosshair) return;
      if (time == null || price == null) {
        st.setLinkedCrosshair(null);
        return;
      }
      st.setLinkedCrosshair({ time, price, paneId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eng, ready, paneId, master]);

  // Linked-range apply (remote → this pane).
  const syncTime = useTerminal((s) => s.syncTime);
  const linkedRange = useTerminal((s) => s.linkedRange);
  useEffect(() => {
    if (!syncTime || !linkedRange || linkedRange.paneId === paneId) return;
    applyingRemote.current = true;
    eng.current?.setVisibleTimeRange(linkedRange.from, linkedRange.to);
    requestAnimationFrame(() => {
      applyingRemote.current = false;
    });
  }, [linkedRange, paneId, syncTime, eng]);

  // Linked-crosshair apply (remote → this pane).
  const syncCrosshair = useTerminal((s) => s.syncCrosshair);
  const linkedCrosshair = useTerminal((s) => s.linkedCrosshair);
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
  }, [linkedCrosshair, paneId, syncCrosshair, eng]);

  return { applyingRemote, minimapSlider, mmState };
}
