import { useEffect, lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTerminal } from "@/lib/market/store";
import type { ChartLayout, ChartType, Interval } from "@/lib/market/types";
import type { ThemeMode } from "@/lib/market/constants";

// The terminal bundles the full chart engine (lightweight-charts etc.); load it
// lazily so the app shell paints first.
const Terminal = lazy(async () => {
  const mod = await import("@/components/terminal/Terminal");
  return { default: mod.Terminal };
});

const INTERVAL_IDS = new Set([
  "1s", "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w",
]);
const LAYOUT_IDS = new Set(["1", "1x2", "2x1", "2x2"]);
const CHART_TYPE_IDS = new Set(["candle", "hollow", "bar", "line", "area", "ha"]);
const THEME_IDS = new Set(["light", "dark"]);

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    symbol: typeof search.symbol === "string" && search.symbol ? search.symbol.toUpperCase() : undefined,
    interval: typeof search.interval === "string" && INTERVAL_IDS.has(search.interval) ? (search.interval as Interval) : undefined,
    layout: typeof search.layout === "string" && LAYOUT_IDS.has(search.layout) ? (search.layout as ChartLayout) : undefined,
    chartType: typeof search.chartType === "string" && CHART_TYPE_IDS.has(search.chartType) ? (search.chartType as ChartType) : undefined,
    theme: typeof search.theme === "string" && THEME_IDS.has(search.theme) ? (search.theme as ThemeMode) : undefined,
  }),
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Hydrate store from URL once on mount.
  useEffect(() => {
    const st = useTerminal.getState();
    if (search.symbol && search.symbol !== st.symbol) st.setSymbol(search.symbol);
    if (search.interval && search.interval !== st.interval) st.setInterval(search.interval);
    if (search.layout && search.layout !== st.layout) st.setLayout(search.layout);
    if (search.chartType && search.chartType !== st.chartType) st.setChartType(search.chartType);
    const theme = search.theme ?? st.theme;
    const htmlTheme = (document.documentElement.dataset.theme ?? "light") as ThemeMode;
    if (theme !== htmlTheme) st.setTheme(theme);
  }, [search.symbol, search.interval, search.layout, search.chartType, search.theme]);

  // Keep the URL in sync with the store (replaceState: no history spam).
  useEffect(() => {
    const unsub = useTerminal.subscribe((s) => {
      const next: Record<string, string> = {};
      if (s.symbol) next.symbol = s.symbol;
      if (s.interval) next.interval = s.interval;
      if (s.layout) next.layout = s.layout;
      if (s.chartType) next.chartType = s.chartType;
      if (s.theme) next.theme = s.theme;
      navigate({ search: next as never, replace: true });
    });
    return unsub;
  }, [navigate]);

  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-bg text-muted">
          <span className="animate-pulse text-sm">加载中…</span>
        </div>
      }
    >
      <Terminal />
    </Suspense>
  );
}