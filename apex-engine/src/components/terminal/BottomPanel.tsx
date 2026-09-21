import { useState } from "react";
import { useTerminal } from "@/lib/market/store";
import { usePaper } from "@/lib/trading/paper";
import { fmtNum, fmtPx } from "@/lib/utils";
import { EquityTab } from "./EquityTab";

const TABS = ["当前委托", "持仓", "历史成交", "表现", "资产"] as const;

export function BottomPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("当前委托");
  const orders = usePaper((s) => s.orders);
  const fills = usePaper((s) => s.fills);
  const positions = usePaper((s) => s.positions);
  const quote = usePaper((s) => s.quote);
  const bases = usePaper((s) => s.bases);
  const cancel = usePaper((s) => s.cancel);
  const cancelAll = usePaper((s) => s.cancelAll);
  const reset = usePaper((s) => s.reset);
  const symbol = useTerminal((s) => s.symbol);
  const ticker = useTerminal((s) => s.ticker);
  const open = orders.filter((o) => o.status === "open");

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-8 items-center gap-3 border-b border-border px-3 text-micro">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "text-gold" : "text-muted hover:text-fg"}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "当前委托" && open.length ? ` (${open.length})` : ""}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto text-muted hover:text-down"
          onClick={() => cancelAll(symbol)}
        >
          全部撤销
        </button>
        <button
          type="button"
          className="text-muted hover:text-fg"
          onClick={reset}
        >
          重置账户
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto text-micro">
        {tab === "当前委托" && (
          <table className="w-full">
            <thead className="sticky top-0 bg-bg text-subtle">
              <tr className="text-left">
                {[
                  "时间",
                  "交易对",
                  "方向",
                  "类型",
                  "价格",
                  "数量",
                  "状态",
                  "",
                ].map((h) => (
                  <th key={h} className="px-2 py-1 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {open.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-2 py-1 font-mono text-muted">
                    {new Date(o.time).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-1">{o.symbol}</td>
                  <td
                    className={`px-2 py-1 ${o.side === "buy" ? "text-up" : "text-down"}`}
                  >
                    {o.side === "buy" ? "买" : "卖"}
                  </td>
                  <td className="px-2 py-1">{o.type}</td>
                  <td className="px-2 py-1 font-mono">{fmtPx(o.price)}</td>
                  <td className="px-2 py-1 font-mono">{o.qty}</td>
                  <td className="px-2 py-1">{o.status}</td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="text-down"
                      onClick={() => cancel(o.id)}
                    >
                      撤
                    </button>
                  </td>
                </tr>
              ))}
              {open.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-subtle">
                    暂无委托
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {tab === "持仓" && (
          <table className="w-full">
            <thead className="text-subtle">
              <tr className="text-left">
                {["交易对", "数量", "均价", "标记", "未实现"].map((h) => (
                  <th key={h} className="px-2 py-1 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(bases)
                .filter(([, q]) => q)
                .map(([sym, q]) => (
                  <tr key={sym} className="border-t border-border">
                    <td className="px-2 py-1">{sym}</td>
                    <td className="px-2 py-1 font-mono">{fmtNum(q, 6)}</td>
                    <td className="px-2 py-1">—</td>
                    <td className="px-2 py-1 font-mono">
                      {sym === symbol ? fmtPx(ticker?.last) : "—"}
                    </td>
                    <td className="px-2 py-1">—</td>
                  </tr>
                ))}
              {positions.map((p) => {
                const last =
                  p.symbol === symbol ? (ticker?.last ?? p.avg) : p.avg;
                const pnl = (last - p.avg) * p.qty;
                return (
                  <tr
                    key={p.symbol + p.market}
                    className="border-t border-border"
                  >
                    <td className="px-2 py-1">
                      {p.symbol} {p.market === "usdm" ? "永续" : ""}
                    </td>
                    <td
                      className={`px-2 py-1 font-mono ${p.qty >= 0 ? "text-up" : "text-down"}`}
                    >
                      {p.qty}
                    </td>
                    <td className="px-2 py-1 font-mono">{fmtPx(p.avg)}</td>
                    <td className="px-2 py-1 font-mono">{fmtPx(last)}</td>
                    <td
                      className={`px-2 py-1 font-mono ${pnl >= 0 ? "text-up" : "text-down"}`}
                    >
                      {fmtNum(pnl, 2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === "历史成交" && (
          <table className="w-full">
            <thead className="text-subtle">
              <tr className="text-left">
                {["时间", "交易对", "方向", "价格", "数量"].map((h) => (
                  <th key={h} className="px-2 py-1 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fills.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="px-2 py-1 font-mono text-muted">
                    {new Date(f.time).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-1">{f.symbol}</td>
                  <td
                    className={`px-2 py-1 ${f.side === "buy" ? "text-up" : "text-down"}`}
                  >
                    {f.side === "buy" ? "买" : "卖"}
                  </td>
                  <td className="px-2 py-1 font-mono">{fmtPx(f.price)}</td>
                  <td className="px-2 py-1 font-mono">{f.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "表现" && <EquityTab />}
        {tab === "资产" && (
          <div className="p-3 font-mono text-xs">
            <p>
              USDT <span className="text-gold">{fmtNum(quote, 4)}</span>
            </p>
            {Object.entries(bases)
              .filter(([, q]) => q)
              .map(([s, q]) => (
                <p key={s}>
                  {s.replace("USDT", "")} {fmtNum(q, 6)}
                </p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
