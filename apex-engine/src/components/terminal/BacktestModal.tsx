import { useMemo, useState } from "react";
import { useTerminal } from "@/lib/market/store";
import {
  backtestFromSeries,
  runStrategy,
  type StrategyId,
} from "@/lib/market/backtest";
import { scriptParser } from "@/lib/market/script-parser";
import { fmtNum } from "@/lib/utils";
import { Modal } from "./Modal";

const STRATEGIES: {
  id: StrategyId;
  name: string;
  params: number[];
  labels: string[];
}[] = [
  {
    id: "smaCross",
    name: "SMA 金叉/死叉",
    params: [20, 50],
    labels: ["快线", "慢线"],
  },
  {
    id: "rsiReversal",
    name: "RSI 超买超卖反转",
    params: [14, 70, 30],
    labels: ["周期", "超买", "超卖"],
  },
  {
    id: "macdCross",
    name: "MACD 快慢线交叉",
    params: [12, 26, 9],
    labels: ["快", "慢", "信号"],
  },
];

/**
 * Strategy backtester dialog (gap item: 策略回测). Runs one of the built-in
 * strategies over the resident bars and reports trades / win-rate / drawdown /
 * Sharpe + an equity curve.
 */
export function BacktestModal() {
  const open = useTerminal((s) => s.backtestOpen);
  const bars = useTerminal((s) => s.bars);
  const symbol = useTerminal((s) => s.symbol);
  const [mode, setMode] = useState<"builtin" | "pine">("builtin");
  const [strategy, setStrategy] = useState<StrategyId>("smaCross");
  const [params, setParams] = useState<number[]>(STRATEGIES[0].params);
  const [pineScript, setPineScript] = useState(
    `//@version=5
fast = ema(close, 5)
slow = ema(close, 20)
bull = fast > slow ? 1 : -1
plot(bull, "Signal")`,
  );

  const spec = STRATEGIES.find((s) => s.id === strategy)!;

  // 3000 bars is cheap — but only compute while the dialog is open, and memo
  // it so WS ticks (which re-render via the bars subscription) never re-run it.
  const builtin = useMemo(
    () =>
      open && bars.length
        ? runStrategy(strategy, bars.slice(-3000), params, 10_000)
        : null,
    [open, bars, strategy, params],
  );

  // Pine-script strategy: any output named "Signal" (or the first plot) is
  // used as the position series (sign → long/short/flat).
  const pine = useMemo(() => {
    if (!open || !bars.length) return { result: null, error: null };
    try {
      const parsed = scriptParser.parse(pineScript);
      if (!parsed.success || !parsed.calculationFn) {
        return { result: null, error: parsed.errors?.join("; ") ?? "解析失败" };
      }
      const tail = bars.slice(-3000);
      const outputs = parsed.calculationFn(tail) as
        | Array<{ key: string; data: Array<{ time: number; value: number }> }>
        | Array<{ time: number; value: number }>;
      let signal: Array<{ time: number; value: number }> | null = null;
      if (Array.isArray(outputs) && outputs[0] && "key" in outputs[0]) {
        const named = (
          outputs as Array<{
            key: string;
            data: Array<{ time: number; value: number }>;
          }>
        ).find((o) => o.key === "Signal");
        signal = (named ?? outputs[0]).data;
      } else if (Array.isArray(outputs) && outputs[0] && "time" in outputs[0]) {
        signal = outputs as Array<{ time: number; value: number }>;
      }
      if (!signal || !signal.length)
        return { result: null, error: "脚本没有可用的信号输出" };
      return { result: backtestFromSeries(tail, signal, 10_000), error: null };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "脚本运行失败",
      };
    }
  }, [open, bars, pineScript]);

  const result = mode === "pine" ? pine.result : builtin;
  const err = mode === "pine" ? pine.error : null;

  if (!open) return null;
  const st = () => useTerminal.getState();
  const close = () => st().setBacktestOpen(false);

  const W = 560;
  const H = 140;
  const equityPath = (() => {
    const eq = result?.equity ?? [];
    if (eq.length < 2) return "";
    let min = Infinity;
    let max = -Infinity;
    for (const v of eq) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const span = max - min || 1;
    return eq
      .map((v, i) => {
        const x = (i / (eq.length - 1)) * W;
        const y = H - ((v - min) / span) * (H - 10) - 5;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  })();

  const up = (result?.pnl ?? 0) >= 0;
  const stat = (lab: string, v: string, cls = "text-fg") => (
    <div className="rounded border border-border bg-surface px-2 py-1.5 text-center">
      <div className="text-[10px] text-subtle">{lab}</div>
      <div className={`font-mono text-xs ${cls}`}>{v}</div>
    </div>
  );

  return (
    <Modal open={open} onClose={close} labelledBy="backtest-dialog">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h2 id="backtest-dialog" className="text-lg font-semibold text-fg">
            策略回测
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded-sm bg-surface px-2 py-1 text-micro text-muted hover:text-fg"
          >
            ✕ 关闭
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("builtin")}
            className={`rounded-sm px-2.5 py-1.5 text-micro ${
              mode === "builtin"
                ? "bg-gold text-bg"
                : "bg-surface text-muted hover:text-fg"
            }`}
          >
            内置策略
          </button>
          <button
            type="button"
            onClick={() => setMode("pine")}
            className={`rounded-sm px-2.5 py-1.5 text-micro ${
              mode === "pine"
                ? "bg-gold text-bg"
                : "bg-surface text-muted hover:text-fg"
            }`}
          >
            Pine 脚本
          </button>
        </div>

        {mode === "builtin" ? (
          <>
            <div className="flex gap-2">
              {STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setStrategy(s.id);
                    setParams(s.params);
                  }}
                  className={`rounded-sm px-2.5 py-1.5 text-micro ${
                    strategy === s.id
                      ? "bg-gold text-bg"
                      : "bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {spec.labels.map((lab, i) => (
                <label key={lab} className="block text-micro text-subtle">
                  {lab}
                  <input
                    type="number"
                    min={1}
                    value={params[i] ?? 1}
                    onChange={(e) => {
                      const next = [...params];
                      next[i] = Number(e.target.value) || 1;
                      setParams(next);
                    }}
                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
                  />
                </label>
              ))}
              <div className="flex items-end">
                <p className="w-full text-right text-[10px] text-subtle">
                  参数修改后自动重算
                </p>
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-micro text-subtle">
              Pine 脚本（plot 名为 "Signal" 或第一个 plot
              作为信号；正值=做多，负值=做空）
            </label>
            <textarea
              value={pineScript}
              onChange={(e) => setPineScript(e.target.value)}
              rows={7}
              spellCheck={false}
              className="w-full rounded border border-border bg-bg p-2 font-mono text-micro text-fg outline-none ring-0 focus:border-gold"
            />
            {err && <p className="mt-1 text-[10px] text-down">⚠ {err}</p>}
          </div>
        )}

        {result && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stat(
                "总盈亏 (USDT)",
                `${up ? "+" : ""}${fmtNum(result.pnl, 2)}`,
                up ? "text-up" : "text-down",
              )}
              {stat("交易次数", String(result.trades.length))}
              {stat("胜率", `${result.winRate.toFixed(0)}%`)}
              {stat("最大回撤", fmtNum(result.maxDrawdown, 2), "text-down")}
              {stat("夏普（近似）", result.sharpe.toFixed(2))}
              {stat("初始资金", "10,000 USDT")}
              {stat("K 线数", result.bars.toLocaleString())}
              {stat("策略", spec.name)}
            </div>
            <div className="rounded border border-border bg-surface p-2">
              <div className="mb-1 text-[10px] text-subtle">
                {symbol} 权益曲线（最后 3000 根 · 10,000 初始）
              </div>
              {equityPath ? (
                <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full">
                  <path
                    d={equityPath}
                    fill="none"
                    stroke={up ? "#0ecb81" : "#f6465d"}
                    strokeWidth={1.5}
                  />
                </svg>
              ) : (
                <p className="py-6 text-center text-[10px] text-subtle">
                  数据不足
                </p>
              )}
            </div>
            <p className="text-[10px] text-subtle">
              简化模型：每根 K 线收盘价换仓、每笔 1
              单位基础资产；夏普为每笔收益均值/标准差（未年化）。
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
