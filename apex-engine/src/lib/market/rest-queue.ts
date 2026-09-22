/**
 * One-setData-per-frame render queue, extracted from ChartEngine. A 100k-bar
 * `setData` is the one thing that can drop a frame, so full-history redraws
 * (volume, compares, indicator lines) are queued and drained one per animation
 * frame; while the pointer owns the chart the queue parks and re-checks one
 * frame later.
 */
export class RestQueue {
  private jobs: Array<() => void> = [];
  private owed: Array<() => void> = [];
  private raf = 0;
  private dead = false;

  constructor(
    private interacting: () => boolean,
    private afterJob: () => void,
    /** Telemetry hook: (jobCostMs, remainingJobs) — wired by the engine (P0-B1). */
    private onJob?: (ms: number, remaining: number) => void,
  ) {}

  /** Replace the queue after a commit: owed cosmetic series stay at the front
   *  of the execution queue (same shape the engine's restJobs array had), and
   *  fresh indicator jobs follow. */
  refill(owed: Array<() => void>, jobs: Array<() => void>): void {
    this.owed = owed;
    this.jobs = [...owed, ...jobs];
    this.pump();
  }

  /** Prepend a one-shot job (e.g. drop-all-lines) ahead of fresh indicator jobs,
   *  keeping any still-owed cosmetic jobs (volume/compare) at the front — the
   *  same shape the engine's original restJobs array had. */
  prepend(job: () => void, jobs: Array<() => void>): void {
    this.jobs = [...this.owed, job, ...jobs];
    this.pump();
  }

  pump(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.run());
  }

  private run = (): void => {
    this.raf = 0;
    if (this.dead) return;
    if (!this.jobs.length) return;
    if (this.interacting()) {
      // The pointer took the chart back mid-reveal: even cosmetic `setData`
      // calls wait for it to lift. Cheap re-check, one frame apart.
      this.pump();
      return;
    }
    const job = this.jobs.shift();
    // Once it runs the debt is paid; keeping it would replay a `setData` the
    // next queue refill rebuilt on top of this one.
    this.owed = this.owed.filter((j) => j !== job);
    const t0 = performance.now();
    job?.();
    this.onJob?.(performance.now() - t0, this.jobs.length);
    // 指标 job 会 addSeries 到新 pane，新 pane 带着默认（未翻转）标尺进场：
    // 每跑完一个就补一次，倒垂才不会在指标加载完的那一帧丢掉副图。
    this.afterJob();
    if (this.jobs.length) this.pump();
  };

  cancel(): void {
    this.dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
