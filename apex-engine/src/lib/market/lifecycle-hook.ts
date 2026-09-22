import { useEffect } from "react";
import {
  cancelAllHistory,
  compareRef,
  ensureCompleteHistory,
  flushSnapshot,
  masterRef,
  paneRef,
  type SeriesRef,
} from "./history.ts";
import {
  DEFAULT_LIFECYCLE_POLICIES,
  decideFlush,
  isIdleSince,
  pauseWanted,
  type LifecyclePolicies,
} from "./lifecycle.ts";
import { healMasterGaps } from "./healer.ts";
import { useTerminal } from "./store.ts";
import type { Candle } from "./types.ts";

/**
 * Data-lifecycle hook (P1-D1): self-managing background pipeline.
 *
 * 1. Idle flush — while the app sits idle (no fill progress, no tail appends)
 *    for `idleFlushDelayMs`, dirty series are snapshot into IndexedDB, so the
 *    cache is never stale when the tab closes. Debounced by `minFlushGapMs`
 *    so a burst of commits coalesces into one write.
 * 2. Hidden pause — when the tab hides, every running history fill is
 *    cancelled (stop fetching entirely); returning to foreground re-ensures
 *    all fillable series from where they left off.
 *
 * Progress is measured as *historyStatus map reference change* (fill status
 * updates always allocate a new object) or *resident bars array reference
 * change* — WS same-bar ticks mutate in place and stay reference-stable, so a
 * live tick stream alone never counts as "busy" for the flush decision.
 */
export function useLifecycle(
  policies: LifecyclePolicies = DEFAULT_LIFECYCLE_POLICIES,
) {
  const symbol = useTerminal((s) => s.symbol);
  const market = useTerminal((s) => s.market);
  const interval = useTerminal((s) => s.interval);
  const panes = useTerminal((s) => s.panes);
  const compareSymbols = useTerminal((s) => s.compareSymbols);
  // Rebuild the effect when the *set of fillable series* changes; interval
  // values of the active panes are the ones that matter for ref construction.
  const refsKey = [
    symbol,
    market,
    interval,
    panes.map((p) => p.interval).join("|"),
    compareSymbols.join(","),
  ].join(":");

  useEffect(() => {
    let disposed = false;
    let lastActivityAt = Date.now();
    let lastFlushAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** Signature of the last flushed snapshot per jobKey — avoids repeat writes. */
    const flushedSig = new Map<string, string>();

    const refs = (): SeriesRef[] => {
      const st = useTerminal.getState();
      return [
        masterRef(st.symbol, st.market, st.interval, "p0"),
        ...st.panes
          .filter((p) => p.id !== "p0")
          .map((p) => paneRef(p.id, st.symbol, st.market, p.interval)),
        ...st.compareSymbols.map((c) => compareRef(c, st.market, st.interval)),
      ];
    };

    const barsFor = (ref: SeriesRef): Candle[] => {
      const st = useTerminal.getState();
      if (ref.kind === "compare") return st.compareBars[ref.symbol] ?? [];
      if (ref.kind === "pane") return st.paneBars[ref.paneId ?? "p0"] ?? [];
      return st.bars;
    };
    const sig = (ref: SeriesRef): string => {
      const b = barsFor(ref);
      return b.length ? `${b.length}:${b[0].time}` : "";
    };

    const schedule = () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = undefined;
        if (disposed) return;
        const now = Date.now();
        if (
          pauseWanted(
            document.visibilityState === "hidden",
            policies.hiddenPause,
          )
        )
          return;
        if (!isIdleSince(lastActivityAt, now, policies.idleFlushDelayMs)) {
          schedule(); // still progressing — keep watching
          return;
        }
        if (decideFlush(now, lastFlushAt, policies.minFlushGapMs) === "hold") {
          schedule();
          return;
        }
        // Only write series whose resident data changed since the last flush;
        // a fully idle board stays untouched instead of rewriting IDB forever.
        const dirty = refs().filter((ref) => {
          const s = sig(ref);
          if (flushedSig.get(ref.jobKey) === s) return false;
          flushedSig.set(ref.jobKey, s);
          return true;
        });
        if (!dirty.length) {
          schedule();
          return;
        }
        lastFlushAt = now;
        for (const ref of dirty) void flushSnapshot(ref);
        schedule();
      }, policies.idleFlushDelayMs);
    };

    const unsub = useTerminal.subscribe((state, prev) => {
      if (
        state.historyStatus !== prev.historyStatus ||
        state.bars !== prev.bars
      ) {
        lastActivityAt = Date.now();
        schedule();
      }
    });

    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      if (pauseWanted(hidden, policies.hiddenPause)) {
        cancelAllHistory();
      } else if (!hidden) {
        // Back to foreground: resume every fillable series.
        for (const ref of refs()) ensureCompleteHistory(ref);
        lastActivityAt = Date.now();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // P2-C4: gap self-heal scan — every 60s, while visible AND the fill has
    // been idle for a while, walk the master series' holes and refill them
    // with endTime-paged REST fetches. Never fights a live fill or a pan.
    const healTimer = setInterval(() => {
      if (disposed) return;
      if (
        pauseWanted(document.visibilityState === "hidden", policies.hiddenPause)
      )
        return;
      if (
        !isIdleSince(lastActivityAt, Date.now(), policies.idleFlushDelayMs * 2)
      )
        return;
      void healMasterGaps(2);
    }, 60_000);

    schedule();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearInterval(healTimer);
      unsub();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refsKey, policies]);
}
