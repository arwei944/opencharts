/**
 * Performance percentile statistics (P0-B1): a fixed-window rolling sample of
 * wall-clock costs (commit ms, per-frame job ms, tail ms) with avg/P50/P95
 * summaries. The Health panel (P1-B3) and DEV probes read these to answer
 * "is the engine staying inside frame budget" without a bespoke benchmark run.
 */

export interface PerfSnapshot {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
}

const EMPTY: PerfSnapshot = {
  count: 0,
  min: 0,
  max: 0,
  avg: 0,
  p50: 0,
  p95: 0,
};

export class PerfStats {
  private samples: number[] = [];
  private windowSize: number;

  constructor(windowSize = 200) {
    this.windowSize = windowSize;
  }

  record(ms: number): void {
    if (this.samples.length >= this.windowSize) this.samples.shift();
    this.samples.push(ms);
  }

  snapshot(): PerfSnapshot {
    const n = this.samples.length;
    if (!n) return EMPTY;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const pct = (q: number) => sorted[Math.min(n - 1, Math.floor(q * n))];
    return {
      count: n,
      min: sorted[0],
      max: sorted[n - 1],
      avg: this.samples.reduce((a, b) => a + b, 0) / n,
      p50: pct(0.5),
      p95: pct(0.95),
    };
  }

  reset(): void {
    this.samples = [];
  }
}

/** Commit (full-history setData) cost — the expensive paint path. */
export const commitPerf = new PerfStats();
/** Per-tick applyTail cost — the WS hot path. */
export const tailPerf = new PerfStats();
/** Per-frame cosmetic job (volume/compare/indicator line setData) cost. */
export const jobPerf = new PerfStats();

// DEV hook: percentile summaries for the Health panel / console inspection.
if (typeof window !== "undefined") {
  (
    window as unknown as {
      __chartPerf?: {
        commitPerf: PerfStats;
        tailPerf: PerfStats;
        jobPerf: PerfStats;
      };
    }
  ).__chartPerf = { commitPerf, tailPerf, jobPerf };
}
