import { diffTail, growsLeft } from "./series-ops.ts";
import type { Candle } from "./types.ts";

/**
 * Length of a left-grow the prefill must accumulate before the resident
 * series is refreshed mid-fill, so a long history populates progressively
 * instead of hiding behind `frozen` until the final page.
 */
export const REVEAL_CHUNK_BARS = 20_000;

/** What `setFullData` must do with an incoming series. */
export type CommitAction =
  /** Same resident/pending reference — nothing owed (unless frozen cleared). */
  | { kind: "noop" }
  /** Same reference but frozen cleared with parked history — commit it. */
  | { kind: "schedule" }
  /** Live tick (append/replace tail) — in-place update path, never re-render. */
  | { kind: "tail"; next: Candle[] }
  /** Left-grow parked behind `frozen`/pointer; `reveal` says land it now. */
  | { kind: "park"; next: Candle[]; reveal: boolean }
  /** Structural change — full setData pass. */
  | { kind: "commit"; next: Candle[] };

/**
 * Pure commit decision for `setFullData`: maps (resident, incoming, flags) to
 * one of the five actions. No chart/DOM access — the engine only executes the
 * chosen action's side effects. This is the full policy the old inline
 * `setFullData` branch encoded, so it can be unit-tested in isolation.
 */
export function decideCommit(
  drawn: Candle[],
  next: Candle[],
  frozen: boolean,
  interacting: boolean,
  pending: Candle[] | null,
  revealChunkBars = REVEAL_CHUNK_BARS,
): CommitAction {
  if (next === drawn || next === pending) {
    return !frozen && pending ? { kind: "schedule" } : { kind: "noop" };
  }
  if (diffTail(drawn, next)) return { kind: "tail", next };
  if (growsLeft(drawn, next) && (frozen || interacting)) {
    return {
      kind: "park",
      next,
      reveal: next.length - drawn.length >= revealChunkBars && !interacting,
    };
  }
  return { kind: "commit", next };
}
