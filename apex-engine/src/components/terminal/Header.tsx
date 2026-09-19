import { useEffect } from "react";
import { usePaper } from "@/lib/trading/paper";
import { useTerminal } from "@/lib/market/store";
import { fmtNum } from "@/lib/utils";

export function Header() {
  const market = useTerminal((s) => s.market);
  const setMarket = useTerminal((s) => s.setMarket);
  const quote = usePaper((s) => s.quote);
  const live = useTerminal((s) => s.live);
  const theme = useTerminal((s) => s.theme);
  const toggleTheme = useTerminal((s) => s.toggleTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-border bg-bg px-3">
      <div className="flex items-center gap-2">
        <svg width="24" height="24" viewBox="0 0 100 100" aria-hidden>
          <defs>
            <linearGradient id="chart-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#chart-gradient)"/>
          <path d="M 20 70 L 35 50 L 50 55 L 65 30 L 80 40" 
                stroke="white" 
                stroke-width="6" 
                fill="none" 
                stroke-linecap="round"
                stroke-linejoin="round"/>
        </svg>
        <span className="text-base font-bold tracking-wide text-fg">OpenCharts</span>
      </div>
      <nav className="flex items-center gap-1 text-xs">
        <button
          type="button"
          className={`rounded-sm px-2.5 py-1 ${market === "spot" ? "bg-elevated text-fg" : "text-muted hover:text-fg"}`}
          onClick={() => setMarket("spot")}
        >
          现货
        </button>
        <button
          type="button"
          className={`rounded-sm px-2.5 py-1 ${market === "usdm" ? "bg-elevated text-fg" : "text-muted hover:text-fg"}`}
          onClick={() => setMarket("usdm")}
        >
          U本位
        </button>
      </nav>
      <div className="ml-auto flex items-center gap-3 text-micro">
        <span className="flex items-center gap-1.5 text-muted">
          <span className={`size-1.5 rounded-full ${live ? "bg-up" : "bg-subtle"}`} />
          {live ? "实时" : "连接中"}
        </span>
        <span className="hidden text-muted sm:inline">
          权益 <span className="font-mono text-fg">{fmtNum(quote, 2)} USDT</span>
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          title={theme === "dark" ? "浅色模式" : "深色模式"}
          className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-elevated hover:text-fg"
        >
          {theme === "dark" ? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
