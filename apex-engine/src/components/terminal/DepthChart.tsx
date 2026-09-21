import { useTerminal } from "@/lib/market/store";
import { fmtPx } from "@/lib/utils";
import { Modal } from "./Modal";

/**
 * Cumulative depth chart (bid side green, ask side red). The compact strip in
 * OrderBook reuses this with a small viewport; the modal shows the full market
 * with price-axis ticks and the mid-price marker.
 */
export function DepthChart({
  width,
  height,
  levels,
  axis = false,
}: {
  width: number;
  height: number;
  levels: number;
  axis?: boolean;
}) {
  const bids = useTerminal((s) => s.bids);
  const asks = useTerminal((s) => s.asks);
  const ticker = useTerminal((s) => s.ticker);
  const b = bids.slice(0, levels);
  const a = asks.slice(0, levels);
  if (!b.length && !a.length) return null;
  const max = Math.max(
    b.reduce((s, x) => s + x.qty, 0),
    a.reduce((s, x) => s + x.qty, 0),
    1,
  );
  const step = width / (levels * 2);
  let acc = 0;
  const bpts = b
    .map((lv, i) => {
      acc += lv.qty;
      const x = (levels - 1 - i) * step;
      return `${x},${height - (acc / max) * (height - 8)}`;
    })
    .reverse();
  acc = 0;
  const apts = a.map((lv, i) => {
    acc += lv.qty;
    const x = (levels + i) * step;
    return `${x},${height - (acc / max) * (height - 8)}`;
  });
  const mid = ticker?.last ?? b[0]?.price ?? a[0]?.price;
  const midX = width / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="订单簿累计深度"
    >
      {axis && (
        <text
          x={width / 2}
          y={12}
          textAnchor="middle"
          fontSize={10}
          fill="#f0b90b"
        >
          {mid ? fmtPx(mid) : ""}
        </text>
      )}
      <polyline
        points={`0,${height} ${bpts.join(" ")} ${midX},${height}`}
        fill="#0ecb8133"
        stroke="#0ecb81"
        strokeWidth={1.2}
      />
      <polyline
        points={`${midX},${height} ${apts.join(" ")} ${width},${height}`}
        fill="#f6465d33"
        stroke="#f6465d"
        strokeWidth={1.2}
      />
      {mid && axis && (
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#f0b90b"
          strokeDasharray="2 3"
          opacity={0.5}
        />
      )}
    </svg>
  );
}

/** Modal with the large interactive depth view. */
export function DepthModal() {
  const open = useTerminal((s) => s.depthOpen);
  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={() => useTerminal.getState().setDepthOpen(false)}
      labelledBy="depth-dialog"
      wide
    >
      <div className="p-4">
        <h2 id="depth-dialog" className="mb-1 text-lg font-semibold text-fg">
          深度图
        </h2>
        <p className="mb-4 text-xs text-muted">
          累计挂单量 vs 价格（绿=买盘 · 红=卖盘 · 金线=最新价）
        </p>
        <div className="h-72 w-full">
          <DepthChart width={760} height={288} levels={40} axis />
        </div>
        <p className="mt-2 text-right text-[10px] text-subtle">
          仅展示盘口前 40 档 · 数据来自实时订单簿流
        </p>
      </div>
    </Modal>
  );
}
