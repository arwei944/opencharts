import type { IChartApi, Logical, Time } from "lightweight-charts";
import { isValidRange, zoomRange } from "../viewport.ts";

export interface RangeCallbacks {
  /** Visible-range tick for the minimap strip (canvas-side, no React). */
  onMinimap: (range: { from: number; to: number } | null) => void;
  /** Deferred visible-range forward (drag/paint-free moments only). */
  onRangeChange: (from: number, to: number) => void;
  /** True while the pointer owns the chart — forwarding would fight the drag. */
  isDragging: () => boolean;
}

/**
 * Visible-time-range management: rAF-batched forwarding to the minimap and the
 * linked-range/viewport consumers, plus the `suppressRange` window that lets a
 * programmatic setVisibleRange apply without re-entering the forward loop.
 * Extracted from ChartEngine (P0-A1).
 */
export class RangeController {
  private suppressRange = false;
  private rangeRaf = 0;
  private dead = false;

  constructor(
    private chart: IChartApi,
    private cb: RangeCallbacks,
  ) {
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || this.dead) return;
      if (!this.rangeRaf) {
        this.rangeRaf = requestAnimationFrame(() => {
          this.rangeRaf = 0;
          // The minimap strip tracks every frame the viewport moves — including
          // mid-drag — but must not fight a range we are applying remotely.
          if (!this.suppressRange) {
            const tr = this.chart.timeScale().getVisibleRange();
            if (
              tr &&
              typeof tr.from === "number" &&
              typeof tr.to === "number"
            ) {
              this.cb.onMinimap({
                from: tr.from as number,
                to: tr.to as number,
              });
            }
          }
          if (this.suppressRange) return;
          // While the pointer is dragging, forwarding every frame to React
          // (linked-range sync, coverage checks) is pure latency: the pan is
          // already canvas-side. Defer until the drag finishes.
          if (this.cb.isDragging()) return;
          const tr = this.chart.timeScale().getVisibleRange();
          if (tr && typeof tr.from === "number" && typeof tr.to === "number") {
            this.cb.onRangeChange(tr.from as number, tr.to as number);
          }
        });
      }
    });
  }

  setVisibleTimeRange(from: number, to: number) {
    if (!isValidRange(from, to)) return;
    this.suppressRange = true;
    try {
      this.chart
        .timeScale()
        .setVisibleRange({ from: from as Time, to: to as Time });
    } catch {
      /* range may not exist on this interval yet */
    }
    requestAnimationFrame(() => {
      this.suppressRange = false;
    });
  }

  /**
   * Double-click zoom: scale the visible logical range by `factor` keeping the
   * logical anchor under the cursor (approx) stationary.
   */
  zoomAt(x: number, width: number, factor = 1.6) {
    const ts = this.chart.timeScale();
    const lr = ts.getVisibleLogicalRange();
    if (!lr || width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    ts.setVisibleLogicalRange(zoomRange(lr.from, lr.to, factor, ratio));
  }

  /**
   * fitContent() reaches the real front (measured: lr.from=0). A manual
   * setVisibleLogicalRange({-4, len+4}) is clamped by lw to ~710 bars of
   * slack at min bar spacing, and lw's *first* fitContent on a fresh
   * 100k-series clamps to ~714; a second call — one frame later, since lw
   * batches time-scale ops per frame — lands on the true front (0), which
   * is what the coverage/backfill trigger needs. Idempotent.
   */
  fitContent() {
    this.suppressRange = true;
    this.chart.timeScale().fitContent();
    requestAnimationFrame(() => {
      this.chart.timeScale().fitContent();
    });
    requestAnimationFrame(() => {
      this.suppressRange = false;
    });
  }

  /** Suppressed logical-range apply used by the commit path (new-data boot). */
  setVisibleLogicalRange(from: number, to: number) {
    this.suppressRange = true;
    this.chart.timeScale().setVisibleLogicalRange({
      from: from as Logical,
      to: to as Logical,
    });
    requestAnimationFrame(() => {
      this.suppressRange = false;
    });
  }

  markDead() {
    this.dead = true;
  }

  cancel() {
    if (this.rangeRaf) cancelAnimationFrame(this.rangeRaf);
    this.rangeRaf = 0;
  }
}
