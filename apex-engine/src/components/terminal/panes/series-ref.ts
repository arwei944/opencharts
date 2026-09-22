import { masterRef, paneRef } from "@/lib/market/history";
import type { Interval } from "@/lib/market/types";
import type { TerminalState } from "@/lib/market/store";

/** Build the fillable SeriesRef for a pane from a store snapshot (P3-A4). */
export function seriesRefFor(
  st: Pick<TerminalState, "panes" | "symbol" | "market" | "interval">,
  paneId: string,
  master: boolean,
) {
  const iv = (st.panes.find((p) => p.id === paneId)?.interval ??
    st.interval) as Interval;
  return master
    ? masterRef(st.symbol, st.market, iv, paneId)
    : paneRef(paneId, st.symbol, st.market, iv);
}
