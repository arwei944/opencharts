import type { Candle } from "./types";

/**
 * Pure series-diff helpers for the chart engine. All functions are
 * side-effect-free over (cur, next) so the hot incremental paths are
 * unit-testable without a chart instance.
 */

export type TailDiff =
  | { kind: "replace"; bar: Candle } // same length, same head: replace last bar
  | { kind: "append"; bar: Candle } // cur + 1, head unchanged, new bar time newer
  | { kind: "none" };

/**
 * Decide how `next` relates to `cur` for the lightweight in-place update path.
 * Returns null when the change is structural (grow-left, reset, size mismatch)
 * and the caller must fall back to a full commit.
 */
export function diffTail(cur: Candle[], next: Candle[]): TailDiff | null {
  if (!cur.length || !next.length) return null;
  if (cur[0].time !== next[0].time) return null; // head moved -> structural
  if (next.length === cur.length) {
    return { kind: "replace", bar: next[next.length - 1] };
  }
  if (next.length === cur.length + 1) {
    const bar = next[next.length - 1];
    if (bar.time <= cur[cur.length - 1].time) return null; // stale append
    return { kind: "append", bar };
  }
  return null; // shrink or big jump -> structural
}

/** True when bars were added on the left (history prefill / lazy fill). */
export function growsLeft(cur: Candle[], next: Candle[]): boolean {
  return cur.length > 0 && next.length > 0 && next[0].time < cur[0].time;
}

/**
 * Logical zoom target for fresh data (no previous viewport): recent N bars at
 * the right edge. Pure; the engine only maps these to a logical range.
 */
export function initialLogicalRange(barCount: number, recent = 150): { from: number; to: number } {
  const n = Math.max(0, barCount);
  const show = Math.min(recent, n);
  return { from: Math.max(0, n - show), to: n + 5 };
}

/**
 * Compact an indicator tail after growth: keep only the most recent `cap`
 * bars. Pure so the growth policy is testable.
 */
export function trimTail(tail: Candle[], cap: number): Candle[] {
  return tail.length > cap ? tail.slice(-cap) : tail;
}