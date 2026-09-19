import { useTerminal } from "@/lib/market/store";
import { fmtNum, fmtPx } from "@/lib/utils";

export function Watchlist() {
  const watch = useTerminal((s) => s.watch);
  const symbol = useTerminal((s) => s.symbol);
  const invert = useTerminal((s) => s.invert);
  const setSymbol = useTerminal((s) => s.setSymbol);
  const setSearchOpen = useTerminal((s) => s.setSearchOpen);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 items-center justify-between border-b border-border px-2 text-micro text-muted">
        <span>自选</span>
        <button type="button" className="hover:text-gold" onClick={() => setSearchOpen(true)}>
          搜索
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {watch.map((w) => {
          const up = invert ? w.changePct < 0 : w.changePct >= 0;
          return (
            <button
              key={w.symbol}
              type="button"
              onClick={() => setSymbol(w.symbol)}
              className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-1 px-2 py-1.5 text-left text-micro hover:bg-hover ${
                w.symbol === symbol ? "bg-elevated" : ""
              }`}
            >
              <span className="truncate font-medium">{w.symbol.replace("USDT", "")}</span>
              <span className="font-mono">{fmtPx(w.last)}</span>
              <span className={`w-14 text-right font-mono ${up ? "text-up" : "text-down"}`}>
                {w.changePct >= 0 ? "+" : ""}
                {w.changePct.toFixed(2)}%
              </span>
            </button>
          );
        })}
        {watch.length === 0 && <p className="p-3 text-micro text-muted">加载行情…</p>}
      </div>
      <div className="border-t border-border px-2 py-1 text-micro text-subtle">额 {fmtNum(watch[0]?.volume, 0)}</div>
    </div>
  );
}
