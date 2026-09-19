import { useEffect, useState } from "react";
import { searchSymbols } from "@/lib/market/api";
import { DEFAULT_WATCH } from "@/lib/market/constants";
import { useTerminal } from "@/lib/market/store";

export function SymbolSearch() {
  const open = useTerminal((s) => s.searchOpen);
  const setSearchOpen = useTerminal((s) => s.setSearchOpen);
  const market = useTerminal((s) => s.market);
  const setSymbol = useTerminal((s) => s.setSymbol);
  const addWatch = useTerminal((s) => s.addWatch);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<string[]>(DEFAULT_WATCH);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (!q) {
        setHits(DEFAULT_WATCH);
        return;
      }
      searchSymbols({ data: { q, market } })
        .then(setHits)
        .catch(() => setHits(DEFAULT_WATCH.filter((s) => s.includes(q.toUpperCase()))));
    }, 200);
    return () => clearTimeout(t);
  }, [q, market, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 pt-24" onClick={() => setSearchOpen(false)}>
      <div
        className="w-[min(420px,92vw)] rounded-md border border-border bg-surface p-3 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索交易对，例如 ETH"
          className="w-full rounded-sm border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-gold"
        />
        <div className="mt-2 max-h-72 overflow-auto">
          {hits.map((s) => (
            <button
              key={s}
              type="button"
              className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-hover"
              onClick={() => {
                setSymbol(s);
                addWatch(s);
                setSearchOpen(false);
              }}
            >
              <span>{s.replace("USDT", "")}/USDT</span>
              <span className="text-micro text-muted">{market === "spot" ? "现货" : "永续"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
