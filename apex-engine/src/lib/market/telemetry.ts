/**
 * Engine telemetry (P0-B1): a ring-buffered structured op-log. Every pipeline
 * decision the engine makes — commitDecide kinds, actual commit/tail costs,
 * queue job frames — lands here, so "why did the engine park instead of
 * commit?" is a queryable record instead of a code-reading exercise.
 *
 * DEV hook: `window.__chartTelemetry` exposes the singleton for console
 * inspection; the Health panel (P1-B3) reads the same object.
 */

export type TelemetryOpName =
  | "commitDecide"
  | "commit"
  | "tail"
  | "queueJob"
  | "indicatorReset"
  | "feedDrop"
  | "reconnect"
  | "historyStatus"
  | "lifecycle"
  | "panPredict";

export interface TelemetryOp {
  /** epoch ms */
  t: number;
  op: TelemetryOpName;
  detail?: unknown;
  /** wall-clock cost of the op, when meaningful */
  ms?: number;
}

const RING_CAP = 500;

export class Telemetry {
  private ring: TelemetryOp[] = [];
  private head = 0;
  private count = 0;
  private cap: number;

  constructor(cap = RING_CAP) {
    this.cap = cap;
  }

  log(op: TelemetryOpName, detail?: unknown, ms?: number): void {
    const entry: TelemetryOp = { t: Date.now(), op, detail, ms };
    if (this.count < this.cap) {
      this.ring[this.head] = entry;
      this.head += 1;
      this.count += 1;
    } else {
      // Overwrite the oldest slot, advance the ring head.
      this.ring[this.head] = entry;
      this.head = (this.head + 1) % this.cap;
    }
  }

  /** Oldest→newest snapshot (partial list while the ring is not full yet). */
  snapshot(): TelemetryOp[] {
    if (this.count < this.cap) return this.ring.slice(0, this.count);
    const out: TelemetryOp[] = new Array(this.cap);
    for (let i = 0; i < this.cap; i++) {
      out[i] = this.ring[(this.head + i) % this.cap];
    }
    return out;
  }

  clear(): void {
    this.ring = [];
    this.head = 0;
    this.count = 0;
  }
}

/** Process-wide singleton shared by the engine instrumentation + panel/devtools. */
export const chartTelemetry = new Telemetry();

// DEV hook: inspect the live op-log from the console.
if (typeof window !== "undefined") {
  (window as unknown as { __chartTelemetry?: Telemetry }).__chartTelemetry =
    chartTelemetry;
}
