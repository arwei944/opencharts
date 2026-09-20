import { useTerminal } from "@/lib/market/store";
import { fmtNum, fmtPx } from "@/lib/utils";
import type { Candle, Interval } from "@/lib/market/types";

export function HistoryBadge({ statusKey }: { statusKey: string }) {
  const status = useTerminal((s) => s.historyStatus[statusKey]);
  if (!status) return null;
  if (status.phase === "error") return <span className="text-down">历史补齐中断 · 移动视图重试</span>;
  if (status.phase === "complete") {
    const from = status.oldest ? new Date(status.oldest * 1000).toISOString().slice(0, 10) : "";
    return <span className="text-subtle">完整 {status.bars.toLocaleString()} 根{from && ` · 始于 ${from}`}</span>;
  }
  const pct = status.target ? Math.min(99, Math.round((status.bars / status.target) * 100)) : 0;
  return <span className="text-gold">后台补齐 {pct}%</span>;
}

interface LegendProps {
  symbol: string;
  interval: Interval;
  bar: Candle | null;
  invert: boolean;
  mirrorAxis: boolean;
  compareSymbols: string[];
  historyKey_: string;
}

/** Top-left OHLC legend; pure presentation over store-sourced values. */
export function Legend({ symbol, interval, bar, invert, mirrorAxis, compareSymbols, historyKey_ }: LegendProps) {
  if (!bar) return null;
  const up = invert ? bar.close < bar.open : bar.close >= bar.open;
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap gap-2 text-micro text-muted">
      {mirrorAxis && (
        <span className="text-gold" title="价格轴已上下翻转">
          ↕ 倒垂
        </span>
      )}
      <span>
        {symbol} {interval}
      </span>
      <span>
        开 <b className={up ? "text-up" : "text-down"}>{fmtPx(bar.open)}</b>
      </span>
      <span>
        高 <b className={up ? "text-up" : "text-down"}>{fmtPx(bar.high)}</b>
      </span>
      <span>
        低 <b className={up ? "text-up" : "text-down"}>{fmtPx(bar.low)}</b>
      </span>
      <span>
        收 <b className={up ? "text-up" : "text-down"}>{fmtPx(bar.close)}</b>
      </span>
      <span>
        量 <b className="text-fg">{fmtNum(bar.volume, 3)}</b>
      </span>
      <HistoryBadge statusKey={historyKey_} />
      {compareSymbols.length > 0 && (
        <span className="text-gold">对比 {compareSymbols.map((s) => s.replace("USDT", "")).join(" / ")}</span>
      )}
    </div>
  );
}