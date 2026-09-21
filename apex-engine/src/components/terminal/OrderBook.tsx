import { useTerminal } from "@/lib/market/store";
import { fmtPx } from "@/lib/utils";
import { DepthChart } from "./DepthChart";

export function OrderBook() {
  const bids = useTerminal((s) => s.bids);
  const asks = useTerminal((s) => s.asks);
  const invert = useTerminal((s) => s.invert);
  const ticker = useTerminal((s) => s.ticker);
  const setDepthOpen = useTerminal((s) => s.setDepthOpen);
  const upC = invert ? "text-down" : "text-up";
  const dnC = invert ? "text-up" : "text-down";
  const max = Math.max(
    ...asks.slice(0, 14).map((x) => x.qty),
    ...bids.slice(0, 14).map((x) => x.qty),
    1,
  );
  const askRows = [...asks.slice(0, 14)].reverse();
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;

  return (
    <div className="flex h-full flex-col text-micro">
      <div className="flex h-8 items-center justify-between border-b border-border px-2 text-muted">
        <span>订单簿</span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            className="text-[10px] text-gold hover:underline"
            onClick={() => setDepthOpen(true)}
          >
            深度图
          </button>
          <span className="font-mono">
            {spread ? spread.toPrecision(4) : "—"}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-3 px-2 py-1 text-subtle">
        <span>价格</span>
        <span className="text-right">数量</span>
        <span className="text-right">累计</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col justify-end overflow-hidden">
          {askRows.map((lv, i) => (
            <Row key={`a${i}`} lv={lv} max={max} color={dnC} bar="#f6465d" />
          ))}
        </div>
        <div className="flex h-8 items-center justify-center border-y border-border font-mono text-sm">
          <span className={ticker && ticker.changePct >= 0 ? upC : dnC}>
            {fmtPx(ticker?.last)}
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          {bids.slice(0, 14).map((lv, i) => (
            <Row key={`b${i}`} lv={lv} max={max} color={upC} bar="#0ecb81" />
          ))}
        </div>
      </div>
      <DepthSvg />
    </div>
  );
}

function Row({
  lv,
  max,
  color,
  bar,
}: {
  lv: { price: number; qty: number };
  max: number;
  color: string;
  bar: string;
}) {
  const w = (lv.qty / max) * 100;
  return (
    <div className="relative grid h-[18px] grid-cols-3 items-center px-2 font-mono">
      <i
        className="absolute inset-y-0 right-0 opacity-20"
        style={{ width: `${w}%`, background: bar }}
      />
      <span className={color}>{fmtPx(lv.price)}</span>
      <span className="text-right text-fg">{lv.qty.toPrecision(4)}</span>
      <span className="text-right text-muted">
        {(lv.price * lv.qty).toFixed(0)}
      </span>
    </div>
  );
}

function DepthSvg() {
  return (
    <div className="h-[72px] w-full border-t border-border">
      <DepthChart width={280} height={72} levels={16} />
    </div>
  );
}
