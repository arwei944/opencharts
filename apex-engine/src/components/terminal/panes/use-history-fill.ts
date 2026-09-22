import { useEffect } from "react";
import { cancelHistory, ensureCompleteHistory } from "@/lib/market/history";
import { useTerminal } from "@/lib/market/store";
import { seriesRefFor } from "./series-ref.ts";

/**
 * Background history fill lifecycle (P3-A4): ensure the pane's series is
 * filled to its depth horizon and cancel the job when the pane goes away or
 * changes identity (symbol/market/interval switch bumps the job generation).
 */
export function useHistoryFill(
  paneId: string,
  master: boolean,
  symbol: string,
  market: string,
  interval: string,
) {
  useEffect(() => {
    const ref = seriesRefFor(useTerminal.getState(), paneId, master);
    ensureCompleteHistory(ref);
    return () => cancelHistory(ref.jobKey);
  }, [paneId, master, symbol, market, interval]);
}
