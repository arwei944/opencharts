import { memo } from "react";
import { useTerminal } from "@/lib/market/store";
import type { TapeTrade } from "@/lib/market/types";
import { fmtPx } from "@/lib/utils";

export function TradesTape() {
  const trades = useTerminal((s) => s.trades);
  const invert = useTerminal((s) => s.invert);
  return (
    <div className="flex h-full flex-col text-micro">
      <div className="flex h-8 items-center border-b border-border px-2 text-muted">最新成交</div>
      <div className="grid grid-cols-3 px-2 py-1 text-subtle">
        <span>价格</span>
        <span className="text-right">数量</span>
        <span className="text-right">时间</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono">
        {trades.map((t) => (
          <Row key={t.id + t.time} t={t} invert={invert} />
        ))}
      </div>
    </div>
  );
}

/**
 * One print per trade, not per tick. `pushTrade` prepends and keeps the other
 * objects as-is, so memo leaves the 79 rows nobody touched alone — formatting
 * all of them on every message is what starved the chart of a main thread.
 */
const Row = memo(function Row({ t, invert }: { t: TapeTrade; invert: boolean }) {
  const buy = invert ? t.isBuyerMaker : !t.isBuyerMaker;
  const tm = new Date(t.time).toLocaleTimeString("en-GB", { hour12: false });
  return (
    <div className="grid grid-cols-3 px-2 py-0.5">
      <span className={buy ? "text-up" : "text-down"}>{fmtPx(t.price)}</span>
      <span className="text-right">{t.qty.toPrecision(4)}</span>
      <span className="text-right text-muted">{tm}</span>
    </div>
  );
});
