import { useEffect } from "react";
import { usePaper } from "@/lib/trading/paper";
import { useConnection } from "@/lib/market/selectors";
import { useTerminal } from "@/lib/market/store";
import { fmtNum } from "@/lib/utils";

export function Header() {
  const market = useTerminal((s) => s.market);
  const setMarket = useTerminal((s) => s.setMarket);
  const quote = usePaper((s) => s.quote);
  const conn = useConnection();
  const dataWarnings = useTerminal((s) => s.dataWarnings);
  const theme = useTerminal((s) => s.theme);
  const toggleTheme = useTerminal((s) => s.toggleTheme);
  const THEME_NAME: Record<string, string> = {
    dark: "深色",
    light: "浅色",
    ocean: "海洋",
    sand: "沙色",
  };
  const isDarkTheme = theme === "dark" || theme === "ocean";
  const activeAccount = usePaper((s) => s.activeAccount);
  // Primitive selectors only — deriving the list in the component keeps the
  // zustand snapshot stable (no per-render new array from the selector).
  const accountsMap = usePaper((s) => s.accounts);
  const accountNames = Array.from(
    new Set([activeAccount, ...Object.keys(accountsMap)]),
  );
  const switchAccount = usePaper((s) => s.switchAccount);
  const newAccount = usePaper((s) => s.newAccount);

  useEffect(() => {
    // A plugin theme has no DOM CSS token rule — fall back to dark chrome so
    // the page chrome stays coherent while the canvas uses the plugin palette.
    const builtin =
      theme === "dark" ||
      theme === "light" ||
      theme === "ocean" ||
      theme === "sand";
    document.documentElement.dataset.theme = builtin ? theme : "dark";
  }, [theme]);

  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-border bg-bg px-3">
      <div className="flex items-center gap-2">
        <svg width="24" height="24" viewBox="0 0 100 100" aria-hidden>
          <defs>
            <linearGradient
              id="chart-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="1" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#chart-gradient)" />
          <path
            d="M 20 70 L 35 50 L 50 55 L 65 30 L 80 40"
            stroke="white"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-base font-bold tracking-wide text-fg">
          OpenCharts
        </span>
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
        <button
          type="button"
          onClick={() => useTerminal.getState().setHealthOpen(true)}
          title="行情健康状态 · 点击查看详情"
          className="flex items-center gap-1.5 text-muted hover:text-fg"
        >
          <span
            className={`size-1.5 rounded-full ${conn === "live" ? "bg-up" : conn === "degraded" ? "bg-gold" : "bg-subtle"}`}
          />
          {conn === "live"
            ? "实时"
            : conn === "degraded"
              ? "重连中"
              : conn === "offline"
                ? "离线"
                : "连接中"}
        </button>
        {(dataWarnings.gaps > 0 || dataWarnings.anomalies > 0) && (
          <span
            className="flex items-center gap-1 text-gold"
            title={`行情异常 ${dataWarnings.anomalies} 次 · 数据缺口 ${dataWarnings.gaps} 根（异常tick已过滤）`}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            数据 {dataWarnings.anomalies + dataWarnings.gaps}
          </span>
        )}
        <span className="hidden items-center gap-1 text-muted sm:flex">
          <select
            value={activeAccount}
            onChange={(e) => switchAccount(e.target.value)}
            title="模拟盘账户"
            className="max-w-28 rounded-sm border border-border bg-surface px-1 py-0.5 text-micro text-fg outline-none ring-0 focus:border-gold"
          >
            {accountNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="新建模拟盘账户"
            onClick={() => {
              const name = window.prompt(
                "新账户名称",
                "账户 " + (accountNames.length + 1),
              );
              if (name?.trim()) newAccount(name.trim());
            }}
            className="rounded-sm px-1 text-muted hover:bg-elevated hover:text-fg"
          >
            ＋
          </button>
          <span>
            权益{" "}
            <span className="font-mono text-fg">{fmtNum(quote, 2)} USDT</span>
          </span>
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="切换主题预设"
          title={`主题：${THEME_NAME[theme] ?? theme} · 点击循环切换预设`}
          className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-elevated hover:text-fg"
        >
          {isDarkTheme ? (
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
