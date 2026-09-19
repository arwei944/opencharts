import { useState } from "react";
import { toast } from "sonner";
import { useTerminal } from "@/lib/market/store";
import { usePaper, type OrderType, type Side } from "@/lib/trading/paper";
import { fmtNum, fmtPx } from "@/lib/utils";

export function OrderTicket() {
  const symbol = useTerminal((s) => s.symbol);
  const market = useTerminal((s) => s.market);
  const ticker = useTerminal((s) => s.ticker);
  const quote = usePaper((s) => s.quote);
  const bases = usePaper((s) => s.bases);
  const leverage = usePaper((s) => s.leverage);
  const setLeverage = usePaper((s) => s.setLeverage);
  const place = usePaper((s) => s.place);
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [price, setPrice] = useState("");
  const [stop, setStop] = useState("");
  const [qty, setQty] = useState("");
  const last = ticker?.last ?? 0;
  const px = Number(price) || last;
  const q = Number(qty) || 0;
  const notional = px * q;

  const submit = () => {
    if (!q || q <= 0) {
      toast.error("请输入数量");
      return;
    }
    const err = place({
      symbol,
      market,
      side,
      type,
      price: type === "market" ? last : px,
      stop: stop ? Number(stop) : undefined,
      qty: q,
    });
    if (err) toast.error(err);
    else toast.success("已提交");
  };

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="flex border-b border-border">
        <button
          type="button"
          className={`flex-1 py-2 text-xs ${side === "buy" ? "bg-up/15 text-up" : "text-muted"}`}
          onClick={() => setSide("buy")}
        >
          买入
        </button>
        <button
          type="button"
          className={`flex-1 py-2 text-xs ${side === "sell" ? "bg-down/15 text-down" : "text-muted"}`}
          onClick={() => setSide("sell")}
        >
          卖出
        </button>
      </div>
      <div className="flex flex-wrap gap-1 p-2 text-micro">
        {(
          [
            ["limit", "限价"],
            ["market", "市价"],
            ["stop-limit", "止损限价"],
            ["stop-market", "止损市价"],
          ] as const
        ).map(([id, lab]) => (
          <button
            key={id}
            type="button"
            className={`rounded-sm px-2 py-1 ${type === id ? "bg-elevated text-fg" : "text-muted"}`}
            onClick={() => setType(id)}
          >
            {lab}
          </button>
        ))}
      </div>
      {market === "usdm" && (
        <label className="flex items-center gap-2 px-3 text-micro text-muted">
          杠杆
          <input
            type="range"
            min={1}
            max={125}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-8 font-mono text-fg">{leverage}x</span>
        </label>
      )}
      {type !== "market" && <Field label="价格" value={price} placeholder={fmtPx(last)} onChange={setPrice} />}
      {(type === "stop-limit" || type === "stop-market") && (
        <Field label="触发" value={stop} placeholder="止损价" onChange={setStop} />
      )}
      <Field label="数量" value={qty} placeholder="0.00" onChange={setQty} />
      <div className="flex gap-1 px-3 text-micro text-muted">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <button
            key={p}
            type="button"
            className="rounded-sm bg-elevated px-2 py-1 hover:text-fg"
            onClick={() => {
              if (side === "buy") setQty(((quote * p) / (px || last || 1)).toPrecision(6));
              else setQty((((bases[symbol] ?? 0) * p) || 0).toPrecision(6));
            }}
          >
            {p * 100}%
          </button>
        ))}
      </div>
      <div className="mt-2 space-y-1 px-3 text-micro text-muted">
        <div className="flex justify-between">
          <span>可用</span>
          <span className="font-mono text-fg">{fmtNum(quote, 2)} USDT</span>
        </div>
        <div className="flex justify-between">
          <span>{symbol.replace("USDT", "")}</span>
          <span className="font-mono text-fg">{fmtNum(bases[symbol] ?? 0, 6)}</span>
        </div>
        <div className="flex justify-between">
          <span>名义</span>
          <span className="font-mono text-fg">{fmtNum(notional, 2)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        className={`mx-3 mt-3 rounded-sm py-2.5 text-sm font-medium text-bg ${side === "buy" ? "bg-up" : "bg-down"}`}
      >
        {side === "buy" ? "买入" : "卖出"} {symbol.replace("USDT", "")}
      </button>
      <p className="px-3 pt-2 text-micro text-subtle">模拟成交 · 公开行情 · 不下真实单</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="mx-3 my-1 flex items-center gap-2 rounded-sm bg-elevated px-2 py-1.5 text-micro">
      <span className="w-10 text-muted">{label}</span>
      <input
        className="w-full bg-transparent font-mono outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
