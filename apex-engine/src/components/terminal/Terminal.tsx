import { useEffect } from "react";
import { Toaster } from "sonner";
import { useMarketFeed } from "@/lib/market/feed";
import { useTerminal } from "@/lib/market/store";
import { usePaper } from "@/lib/trading/paper";
import { BottomPanel } from "./BottomPanel";
import { ChartBoard } from "./ChartBoard";
import { Header } from "./Header";
import { IndicatorModal } from "./IndicatorModal";
import { OrderBook } from "./OrderBook";
import { OrderTicket } from "./OrderTicket";
import { SettingsModal } from "./SettingsModal";
import { SymbolSearch } from "./SymbolSearch";
import { TickerBar } from "./TickerBar";
import { TradesTape } from "./TradesTape";
import { Watchlist } from "./Watchlist";

export function Terminal() {
  useMarketFeed();
  const symbol = useTerminal((s) => s.symbol);
  const ticker = useTerminal((s) => s.ticker);
  const bids = useTerminal((s) => s.bids);
  const asks = useTerminal((s) => s.asks);
  const mobileTab = useTerminal((s) => s.mobileTab);
  const setMobileTab = useTerminal((s) => s.setMobileTab);

  useEffect(() => {
    if (!ticker) return;
    usePaper.getState().onTick(symbol, ticker.last, bids[0]?.price ?? ticker.last, asks[0]?.price ?? ticker.last);
  }, [symbol, ticker, bids, asks]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <Toaster theme="dark" position="top-center" />
      <Header />
      <TickerBar />
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-52 shrink-0 border-r border-border lg:block">
          <Watchlist />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col lg:hidden">
            <div className="flex border-b border-border text-micro">
              {(
                [
                  ["chart", "图表"],
                  ["book", "盘口"],
                  ["trade", "交易"],
                ] as const
              ).map(([id, lab]) => (
                <button
                  key={id}
                  type="button"
                  className={`flex-1 py-2.5 ${mobileTab === id ? "text-gold" : "text-muted"}`}
                  onClick={() => setMobileTab(id)}
                >
                  {lab}
                </button>
              ))}
            </div>
            {mobileTab === "chart" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <ChartBoard />
              </div>
            )}
            {mobileTab === "book" && (
              <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1">
                <OrderBook />
                <TradesTape />
              </div>
            )}
            {mobileTab === "trade" && (
              <div className="min-h-0 flex-1 overflow-auto">
                <OrderTicket />
                <BottomPanel />
              </div>
            )}
          </div>
          <div className="hidden min-h-0 flex-1 grid-rows-[minmax(0,1fr)_220px] lg:grid">
            <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_280px]">
              <ChartBoard />
              <div className="grid min-h-0 grid-rows-2 border-l border-border">
                <OrderBook />
                <TradesTape />
              </div>
            </div>
            <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)] border-t border-border">
              <OrderTicket />
              <BottomPanel />
            </div>
          </div>
        </div>
      </div>
      <SymbolSearch />
      <IndicatorModal />
      <SettingsModal />
    </div>
  );
}
