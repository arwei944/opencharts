import { useMemo } from "react";
import { aggregateToInterval, isDerivable } from "@/lib/market/aggregate";
import { NO_BARS, useTerminal } from "@/lib/market/store";
import type { Candle, Interval } from "@/lib/market/types";

export interface PaneBars {
  /** Resident series the pane renders (store or locally derived). */
  bars: Candle[];
  /** Live (still-open) bar, if any. */
  lastBar: Candle | null;
  /** True when this pane's data is derived from the master series, not fetched. */
  derivable: boolean;
}

/**
 * Pane data source (P4): a non-master pane whose interval is coarser than the
 * master and divides it evenly (15m → 1h) is derived LOCALLY from the master's
 * resident bars via aggregateToInterval — zero REST requests, works offline,
 * stays in lock-step with the master on every commit (same reference).
 *
 * Only panes that are finer than the master (or non-divisible) keep the
 * store.paneBars fetched path. The memo keys on the master bars reference, so
 * WS in-place tail updates never rebuild the derived array (NO_BARS is a
 * stable empty standing value for the non-derivable path).
 */
export function usePaneBars(
  paneId: string,
  master: boolean,
  masterInterval: Interval,
  paneInterval: Interval,
): PaneBars {
  const masterBars = useTerminal((s) => s.bars);
  const storeBars = useTerminal((s) => s.paneBars[paneId] ?? NO_BARS);
  const storeLast = useTerminal((s) => s.paneBars[paneId]?.at(-1) ?? null);
  const derivable = !master && isDerivable(masterInterval, paneInterval);

  // Hooks must run unconditionally: the memo only computes when derivable.
  const derived = useMemo(
    () => (derivable ? aggregateToInterval(masterBars, paneInterval) : NO_BARS),
    [derivable, masterBars, paneInterval],
  );

  if (master || !derivable) {
    return {
      bars: master ? masterBars : storeBars,
      lastBar: master ? (masterBars.at(-1) ?? null) : storeLast,
      derivable: false,
    };
  }
  return { bars: derived, lastBar: derived.at(-1) ?? null, derivable: true };
}
