import type { IChartApi } from "lightweight-charts";
import { clampPanSensitivity, dragDelta, panRange } from "../events.ts";

export interface PointerCallbacks {
  /** Pointer has been idle (no interaction) for 150ms and the button is up. */
  onPointerIdle: () => void;
}

/**
 * Mouse-drag pan + interaction-priority window, extracted from ChartEngine
 * (P0-A1). The engine reads `isInteracting` to gate commits while the pointer
 * owns the chart, and `isDragging` to skip crosshair/range forwarding mid-drag.
 *
 * Behavior preserved from the pre-split engine: left-button drag pans with a
 * configurable sensitivity (1 = 1:1), a 150ms idle window keeps the pointer
 * priority alive while dragging (re-armed on every move), and pointer-up
 * releases immediately on the next animation frame — never after the debounce.
 */
export class PointerController {
  private dragging = false;
  private interacting = false;
  private panSensitivity = 1;
  private cursorHint: "default" | "crosshair" = "default";
  private dragStartX = 0;
  private dragStartRange: { from: number; to: number } | null = null;
  private interactTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly onPointerDown = (e: PointerEvent) => {
    // Ignore right-click / touch (touch pan is handled natively). Only the
    // left button drags.
    if (e.button !== 0) return;
    const lr = this.chart.timeScale().getVisibleLogicalRange();
    this.dragStartX = e.clientX;
    this.dragStartRange =
      lr && Number.isFinite(lr.from) && Number.isFinite(lr.to)
        ? { from: lr.from, to: lr.to }
        : null;
    this.dragging = this.dragStartRange !== null;
    this.host.style.cursor = "grabbing";
    try {
      this.host.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    this.markInteracting();
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.dragging || !this.dragStartRange) return;
    const lr = this.chart.timeScale().getVisibleLogicalRange();
    if (!lr || !Number.isFinite(lr.from) || !Number.isFinite(lr.to)) return;
    // Sensitivity >1 means the chart follows the cursor faster than 1:1.
    const deltaLogical = dragDelta(
      this.dragStartX,
      e.clientX,
      this.panSensitivity,
      lr.to - lr.from,
      this.host.clientWidth,
    );
    this.chart
      .timeScale()
      .setVisibleLogicalRange(
        panRange(
          this.dragStartRange.from,
          this.dragStartRange.to,
          deltaLogical,
        ),
      );
    // keep lock-alive while the pointer moves (same as the timer's intent)
    clearTimeout(this.interactTimer);
    this.interactTimer = setTimeout(() => this.markInteracting(), 150);
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    this.dragging = false;
    this.dragStartRange = null;
    this.host.style.cursor = this.cursorHint;
    try {
      this.host.releasePointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    clearTimeout(this.interactTimer);
    this.releaseNow();
  };

  private readonly onWheel = () => {
    this.markInteracting();
  };

  constructor(
    private host: HTMLElement,
    private chart: IChartApi,
    private cb: PointerCallbacks,
  ) {}

  bind() {
    this.host.addEventListener("pointerdown", this.onPointerDown, {
      capture: true,
      passive: false,
    });
    this.host.addEventListener("pointermove", this.onPointerMove, {
      capture: true,
      passive: true,
    });
    this.host.addEventListener("wheel", this.onWheel, {
      passive: true,
      capture: true,
    });
    window.addEventListener("pointerup", this.onPointerUp, { capture: true });
    window.addEventListener("pointercancel", this.onPointerUp, {
      capture: true,
    });
  }

  unbind() {
    this.host.removeEventListener("pointerdown", this.onPointerDown, {
      capture: true,
    });
    this.host.removeEventListener("pointermove", this.onPointerMove, {
      capture: true,
    });
    this.host.removeEventListener("wheel", this.onWheel, { capture: true });
    window.removeEventListener("pointerup", this.onPointerUp, {
      capture: true,
    });
    window.removeEventListener("pointercancel", this.onPointerUp, {
      capture: true,
    });
  }

  /** Mouse-drag pan sensitivity multiplier (1 = 1:1); >1 faster, <1 slower. */
  setPanSensitivity(v: number) {
    this.panSensitivity = clampPanSensitivity(v);
  }

  /**
   * Cursor hint per active tool: default arrow when idle (drag shows the hand
   * automatically), crosshair while a drawing tool is active.
   */
  setCursor(cursor: "default" | "crosshair") {
    this.cursorHint = cursor;
    if (!this.dragging) this.host.style.cursor = cursor;
  }

  /** True from `pointerdown` until the button is lifted: the DOM must keep out of the way. */
  get isDragging() {
    return this.dragging;
  }

  /** True while the pointer owns the chart — the moment a repaint must not happen. */
  get isInteracting() {
    return this.interacting;
  }

  /** Drop any pending timers (destroy path). */
  cancel() {
    clearTimeout(this.interactTimer);
  }

  /**
   * Zero-latency release: once the pointer is up, stop hiding work behind the
   * 150 ms debounce — the very next animation frame resumes commits.
   */
  private releaseNow() {
    this.interacting = false;
    this.cb.onPointerIdle();
  }

  private markInteracting() {
    this.interacting = true;
    clearTimeout(this.interactTimer);
    this.interactTimer = setTimeout(() => {
      if (this.dragging) {
        // Still mid-drag: keep the pointer-priority window alive.
        this.markInteracting();
        return;
      }
      this.interacting = false;
      this.cb.onPointerIdle();
    }, 150);
  }
}
