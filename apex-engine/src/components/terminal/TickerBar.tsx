import { Star } from "lucide-react";
import { useTerminal } from "@/lib/market/store";
import { fmtNum, fmtPx } from "@/lib/utils";

export function TickerBar() {
  const symbol = useTerminal((s) => s.symbol);
  const ticker = useTerminal((s) => s.ticker);
  const invert = useTerminal((s) => s.invert);
  const market = useTerminal((s) => s.market);
  const funding = useTerminal((s) => s.funding);
  const mark = useTerminal((s) => s.mark);
  const watchSymbols = useTerminal((s) => s.watchSymbols);
  const addWatch = useTerminal((s) => s.addWatch);
  const removeWatch = useTerminal((s) => s.removeWatch);
  const setSearchOpen = useTerminal((s) => s.setSearchOpen);
  const up = invert ? (ticker ? ticker.changePct < 0 : true) : ticker ? ticker.changePct >= 0 : true;
  const starred = watchSymbols.includes(symbol);

  return (
    <div className="flex h-12 shrink-0 items-center gap-4 overflow-x-auto border-b border-border px-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-muted hover:text-gold"
          onClick={() => {
            if (starred) removeWatch(symbol);
            else addWatch(symbol);
          }}
          aria-label="收藏"
        >
          <Star className={`size-3.5 ${starred ? "fill-gold text-gold" : ""}`} />
        </button>
        <button type="button" className="flex items-center gap-2" onClick={() => setSearchOpen(true)}>
          <span className="text-base font-semibold">
            {symbol.replace("USDT", "")}
            <span className="text-muted">/USDT</span>
          </span>
          <span className="rounded-sm bg-elevated px-1.5 py-0.5 text-micro text-muted">
            {market === "spot" ? "现货" : "永续"}
          </span>
        </button>
      </div>
      <div className={`font-mono text-lg ${up ? "text-up" : "text-down"}`}>{fmtPx(ticker?.last)}</div>
      <div className={`text-xs ${up ? "text-up" : "text-down"}`}>
        {ticker ? `${ticker.changePct >= 0 ? "+" : ""}${ticker.changePct.toFixed(2)}%` : "—"}
      </div>
      <Meta lab="24h高" val={fmtPx(ticker?.high)} />
      <Meta lab="24h低" val={fmtPx(ticker?.low)} />
      <Meta lab="24h量" val={fmtNum(ticker?.volume, 2)} />
      <Meta lab="成交额" val={fmtNum(ticker?.quoteVolume, 2)} />
      {market === "usdm" && (
        <>
          <Meta lab="标记" val={fmtPx(mark || ticker?.last)} />
          <Meta lab="资金费率" val={`${((funding || 0) * 100).toFixed(4)}%`} />
        </>
      )}
    </div>
  );
}

function Meta({ lab, val }: { lab: string; val: string }) {
  return (
    <div className="hidden shrink-0 text-micro md:block">
      <span className="text-muted">{lab}</span>
      <span className="ml-1.5 font-mono text-fg">{val}</span>
    </div>
  );
}
