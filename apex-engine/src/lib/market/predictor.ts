import { VIEWPORT_LOOKAHEAD_BARS } from "./constants.ts";

/**
 * Predictive prefetch (P1-C2): track visible-range transitions with
 * timestamps, derive a pan velocity (bars/second), and scale the history
 * lookahead so a fast leftward drag stops hitting "loading" at the frontier.
 * All functions are pure — the engine/ChartPane just feed samples.
 *
 * Velocity is signed: negative = panning left (older data), positive = right.
 * Lookahead only amplifies toward the left (the fill frontier), never wastes
 * extra on the right (bars already resident there).
 */

export interface PanSample {
  /** epoch ms */
  t: number;
  /** visible logical from (left edge) at sample time */
  from: number;
  /** visible logical to (right edge) at sample time */
  to: number;
}

const SAMPLE_CAP = 24;
/** Ignore sub-second motion noise when computing velocity. */
const MIN_SPAN_MS = 400;

export function pushSample(
  samples: PanSample[],
  s: PanSample,
  cap = SAMPLE_CAP,
): PanSample[] {
  const next = [...samples, s];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Signed bars/second over the latest meaningful window; 0 when no motion. */
export function predictVelocity(samples: PanSample[]): number {
  if (samples.length < 2) return 0;
  const a = samples[0];
  const b = samples[samples.length - 1];
  const spanMs = b.t - a.t;
  if (spanMs < MIN_SPAN_MS) return 0;
  // Center drift separates translation from zoom: a symmetric zoom keeps the
  // center still (velocity 0), a pan moves it exactly by the translation.
  const centerA = (a.from + a.to) / 2;
  const centerB = (b.from + b.to) / 2;
  const drift = centerB - centerA;
  return (drift / spanMs) * 1000;
}

/**
 * Scale the base lookahead by pan speed toward the left. clamps:
 *   minLookahead = base (idle / rightward / slow)
 *   maxLookahead = base * maxFactor (fast leftward drag)
 */
export function adaptiveLookahead(
  velocity: number,
  base = VIEWPORT_LOOKAHEAD_BARS,
  maxFactor = 4,
): number {
  if (velocity >= 0) return base;
  const speed = -velocity; // bars/sec toward older data
  // Saturate around 12k bars/sec (≈ a 15m-bar-per-frame flick across the
  // whole 1440px viewport); linear scaling below that.
  const k = Math.min(1, speed / 12000);
  return Math.round(base * (1 + (maxFactor - 1) * k));
}

/** Convenience: feed a from/to transition, get the lookahead for it. */
export function lookaheadFor(
  samples: PanSample[],
  next: PanSample,
  base?: number,
  maxFactor?: number,
): number {
  const withNext = pushSample(samples, next);
  return adaptiveLookahead(predictVelocity(withNext), base, maxFactor);
}
