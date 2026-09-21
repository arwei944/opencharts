import { useMemo } from "react";
import { usePaper } from "@/lib/trading/paper";
import { equitySeries, performance } from "@/lib/trading/perf";
import { fmtNum } from "@/lib/utils";

/**
 * "表现" tab content: realized equity curve + win-rate / PnL / drawdown stats
 * computed from the paper fill stream (gap item: 资金曲线 + PnL 分析).
 */
export function EquityTab() {
  const fills = usePaper((s) => s.fills);
  const quote = usePaper((s) => s.quote);
  const { pts, perf } = useMemo(() => {
    const series = equitySeries(fills, 10_000);
    return { pts: series, perf: performance(fills, 10_000) };
  }, [fills]);
  const openValue = quote;

  const W = 640;
  const H = 160;
  const PAD = 8;
  const path = (() => {
    if (pts.length < 2) return "";
    let min = Infinity;
    let max = -Infinity;
    for (const p of pts) {
      min = Math.min(min, p.equity);
      max = Math.max(max, p.equity);
    }
    const span = max - min || 1;
    const t0 = pts[0].time;
    const t1 = pts[pts.length - 1].time || t0 + 1;
    const pt = pts
      .map((p, i) => {
        const x = ((p.time - t0) / (t1 - t0 || 1)) * (W - PAD * 2) + PAD;
        const y = H - PAD - ((p.equity - min) / span) * (H - PAD * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return pt;
  })();

  const up = perf.pnl >= 0;
  const stat = (lab: string, v: string, cls = "text-fg") => (
    <div className="rounded border border-border bg-surface px-2 py-1.5 text-center">
      <div className="text-[10px] text-subtle">{lab}</div>
      <div className={`font-mono text-xs ${cls}`}>{v}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-3 text-micro">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat("模拟账户权益 (USDT)", fmtNum(openValue, 2), "text-gold")}
        {stat(
          "累计已实现盈亏",
          `${up ? "+" : ""}${fmtNum(perf.pnl, 2)}`,
          up ? "text-up" : "text-down",
        )}
        {stat(
          "成交笔数 / 胜率",
          `${perf.trades} / ${perf.winRate.toFixed(0)}%`,
        )}
        {stat("最大回撤 (USDT)", fmtNum(perf.maxDrawdown, 2), "text-down")}
      </div>
      <div className="rounded border border-border bg-surface p-2">
        <div className="mb-1 flex items-center justify-between text-subtle">
          <span>已实现权益曲线（成交驱动）</span>
          <span>
            毛盈 {fmtNum(perf.grossProfit, 2)} · 毛亏 -
            {fmtNum(perf.grossLoss, 2)}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full">
          {pts.length < 2 ? (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              fontSize={12}
              fill="#848e9c"
            >
              暂无成交 · 完成一次开平仓后显示曲线
            </text>
          ) : (
            <path
              d={path}
              fill="none"
              stroke={up ? "#0ecb81" : "#f6465d"}
              strokeWidth={1.5}
            />
          )}
        </svg>
      </div>
      <p className="text-[10px] text-subtle">
        现货按净现金流、USDT
        本位按平仓腿已实现盈亏计算；未平仓浮动盈亏不反映在曲线中。
      </p>
    </div>
  );
}
