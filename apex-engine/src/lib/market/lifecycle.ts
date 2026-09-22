/**
 * Data-lifecycle policies (P1-D1): pure decisions for self-managing the
 * pipeline — when to flush the IndexedDB snapshot while the app sits idle, and
 * whether a hidden tab should pause the background history fills. The hook in
 * lifecycle-hook.ts consumes these; keeping the decisions pure makes the
 * timing/pause behavior unit-testable without a DOM.
 */

export interface LifecyclePolicies {
  /** No fill/tail progress for this long → the cache snapshot is due. */
  idleFlushDelayMs: number;
  /** Debounce between idle flushes so a burst of commits coalesces. */
  minFlushGapMs: number;
  /** Hidden tab → cancel running history fills (stop fetching entirely). */
  hiddenPause: boolean;
}

export const DEFAULT_LIFECYCLE_POLICIES: LifecyclePolicies = {
  idleFlushDelayMs: 4_000,
  minFlushGapMs: 3_000,
  hiddenPause: true,
};

/** True when nothing (fill finish / tail append) happened within idleMs. */
export function isIdleSince(
  lastActivityAt: number,
  now: number,
  idleMs: number,
): boolean {
  return now - lastActivityAt >= idleMs;
}

/** Debounced flush gate: at most one snapshot every minFlushGapMs. */
export function decideFlush(
  now: number,
  lastFlushAt: number,
  minFlushGapMs: number,
): "flush" | "hold" {
  return now - lastFlushAt >= minFlushGapMs ? "flush" : "hold";
}

/** Whether a hidden tab should pause fetching under the given policy. */
export function pauseWanted(hidden: boolean, hiddenPause: boolean): boolean {
  return hidden && hiddenPause;
}
