import { useRef } from "react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import { useTerminal } from "@/lib/market/store";
import { fmtPx } from "@/lib/utils";

/**
 * Draggable take-profit / stop-loss levels on the chart. Horizontal dashed
 * lines with price labels; drag adjusts the level, releasing writes back to
 * the store so OrderTicket stays in sync. Green = TP, red = SL.
 */
export function TpSlOverlay({ engine }: { engine: ChartEngine | null }) {
  const tpsl = useTerminal((s) => s.tpsl);
  const setTpsl = useTerminal((s) => s.setTpsl);
  const drag = useRef<{ kind: "tp" | "sl"; moved: boolean } | null>(null);

  if (!engine) return null;
  if (!tpsl.tp && !tpsl.sl) return null;

  const yOf = (price: number) => engine.priceToY(price);

  const startDrag = (kind: "tp" | "sl", e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = { kind, moved: false };
    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return;
      drag.current.moved = true;
      const price = engine.yToPrice(ev.clientY);
      if (price == null) return;
      const patch = drag.current.kind === "tp" ? { tp: price } : { sl: price };
      setTpsl(patch);
    };
    const onUp = () => {
      drag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const line = (kind: "tp" | "sl", price: number, color: string) => {
    const y = yOf(price);
    if (y == null) return null;
    return (
      <g
        key={kind}
        onPointerDown={(e) => startDrag(kind, e)}
        className="cursor-ns-resize"
        style={{ pointerEvents: "all" }}
      >
        <line
          x1={0}
          x2="100%"
          y1={y}
          y2={y}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="6,4"
          opacity={0.9}
        />
        <rect
          x={0}
          y={y - 10}
          width={84}
          height={16}
          fill={color}
          opacity={0.85}
          rx={2}
        />
        <text x={4} y={y + 4} fill="#0b0e11" fontSize={10} fontWeight={600}>
          {kind === "tp" ? "TP" : "SL"} {fmtPx(price)}
        </text>
      </g>
    );
  };

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {tpsl.tp ? line("tp", tpsl.tp, "#0ecb81") : null}
      {tpsl.sl ? line("sl", tpsl.sl, "#f6465d") : null}
    </svg>
  );
}
