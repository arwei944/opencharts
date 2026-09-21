import { useEffect, useRef } from "react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import { FIB_LEVELS } from "@/lib/market/constants";
import { useTerminal } from "@/lib/market/store";
import { fmtPx } from "@/lib/utils";
import type { DrawPoint, Drawing } from "@/lib/market/types";

/**
 * SVG overlay for drawings. Renders each drawing, highlights the selected one
 * (thicker, brighter), lets the user click a drawing to select it, press Delete
 * to remove it, drag its anchor points to edit, or drag the body to move it.
 */
export function DrawingOverlay({ engine }: { engine: ChartEngine | null }) {
  const drawings = useTerminal((s) => s.drawings);
  const selectedId = useTerminal((s) => s.selectedDrawingId);
  const select = useTerminal((s) => s.selectDrawing);
  const remove = useTerminal((s) => s.removeDrawing);

  // Pointer-drag state for anchor/body editing of the selected drawing.
  const drag = useRef<{
    id: string;
    anchorIdx: number | null; // null = move whole drawing
    startX: number;
    startY: number;
    startPoints: DrawPoint[];
  } | null>(null);

  // Delete removes the selected drawing; Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const id = useTerminal.getState().selectedDrawingId;
        if (id) {
          e.preventDefault();
          remove(id);
        }
      } else if (e.key === "Escape") {
        useTerminal.getState().selectDrawing(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [remove]);

  useEffect(() => {
    if (!drag.current) return;
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !engine) return;
      const x = e.clientX;
      const y = e.clientY;
      const st = useTerminal.getState();
      const drawing = st.drawings.find((z) => z.id === d.id);
      if (!drawing) return;
      if (d.anchorIdx != null) {
        // Dragging a single anchor: recompute its price/time from pointer.
        const xr = engine.xToTime(x);
        const yr = engine.yToPrice(y);
        if (xr == null || yr == null) return;
        const points = drawing.points.map((p, i) =>
          i === d.anchorIdx ? { ...p, time: xr as number, price: yr } : p,
        );
        st.updateDrawing(d.id, { points });
      } else {
        // Dragging the body: translate every anchor by (dx, dy).
        const xr0 = engine.xToTime(d.startX);
        const xr1 = engine.xToTime(x);
        const yr0 = engine.yToPrice(d.startY);
        const yr1 = engine.yToPrice(y);
        if (xr0 == null || xr1 == null || yr0 == null || yr1 == null) return;
        const dt = (xr1 as number) - (xr0 as number);
        const dp = yr1 - yr0;
        const points = drawing.points.map((p) => ({
          ...p,
          time: p.time + dt,
          price: p.price + dp,
        }));
        st.updateDrawing(d.id, { points });
      }
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
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [engine]);

  if (!engine) return null;
  if (!drawings.length) return null;

  const startDrag = (
    id: string,
    anchorIdx: number | null,
    x: number,
    y: number,
  ) => {
    const st = useTerminal.getState();
    const drawing = st.drawings.find((z) => z.id === id);
    if (!drawing) return;
    st.selectDrawing(id);
    drag.current = {
      id,
      anchorIdx,
      startX: x,
      startY: y,
      startPoints: drawing.points,
    };
  };

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {drawings.map((d) => (
        <DrawShape
          key={d.id}
          d={d}
          engine={engine}
          selected={d.id === selectedId}
          onSelect={() => select(d.id)}
          onStartDrag={startDrag}
        />
      ))}
    </svg>
  );
}

function DrawShape({
  d,
  engine,
  selected,
  onSelect,
  onStartDrag,
}: {
  d: Drawing;
  engine: ChartEngine;
  selected: boolean;
  onSelect: () => void;
  onStartDrag: (
    id: string,
    anchorIdx: number | null,
    x: number,
    y: number,
  ) => void;
}) {
  const xy = (p: DrawPoint) => {
    const x = engine.timeToX(p.time);
    const y = engine.priceToY(p.price);
    return x != null && y != null ? { x, y } : null;
  };
  const pts = d.points.map(xy);
  if (pts.some((p) => !p)) return null;
  const color = d.color;
  const width = selected ? 2 : 1;
  const opacity = selected ? 1 : 0.75;
  const hit = {
    pointerEvents: "all" as const,
    style: { cursor: "move" as const },
  };
  // Body click => select; body drag => move whole drawing.
  const onBodyDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect();
    onStartDrag(d.id, null, e.clientX, e.clientY);
  };
  const anchors = selected
    ? pts.map((p, i) => (
        <circle
          key={`a${i}`}
          cx={p!.x}
          cy={p!.y}
          r={4}
          fill={color}
          stroke="#fff"
          strokeWidth={1}
          className="cursor-nwse-resize"
          style={{ pointerEvents: "all" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect();
            onStartDrag(d.id, i, e.clientX, e.clientY);
          }}
        />
      ))
    : null;

  if (d.tool === "text" && pts[0]) {
    return (
      <g onClick={onSelect} onPointerDown={onBodyDown} {...hit}>
        <text
          x={pts[0].x}
          y={pts[0].y}
          fill={color}
          fontSize={12}
          fontWeight={selected ? 700 : 500}
          opacity={opacity}
          stroke="rgba(11,14,17,0.75)"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {d.points[0].text}
        </text>
        {anchors}
      </g>
    );
  }
  if (d.tool === "hline" && pts[0]) {
    return (
      <g>
        <line
          x1={0}
          x2="100%"
          y1={pts[0].y}
          y2={pts[0].y}
          stroke={color}
          strokeWidth={width}
          opacity={opacity}
          onClick={onSelect}
          onPointerDown={onBodyDown}
          {...hit}
        />
        {anchors}
      </g>
    );
  }
  if (d.tool === "vline" && pts[0]) {
    return (
      <g>
        <line
          y1={0}
          y2="100%"
          x1={pts[0].x}
          x2={pts[0].x}
          stroke={color}
          strokeWidth={width}
          opacity={opacity}
          onClick={onSelect}
          onPointerDown={onBodyDown}
          {...hit}
        />
        {anchors}
      </g>
    );
  }
  if (
    (d.tool === "trend" || d.tool === "ray" || d.tool === "measure") &&
    pts[0] &&
    pts[1]
  ) {
    return (
      <g onClick={onSelect} onPointerDown={onBodyDown} {...hit}>
        <line
          x1={pts[0].x}
          y1={pts[0].y}
          x2={pts[1].x}
          y2={pts[1].y}
          stroke={color}
          strokeWidth={width}
          opacity={opacity}
        />
        {d.tool === "measure" && (
          <text
            x={(pts[0].x + pts[1].x) / 2}
            y={(pts[0].y + pts[1].y) / 2 - 6}
            fill={color}
            fontSize={10}
          >
            {(
              ((d.points[1].price - d.points[0].price) / d.points[0].price) *
              100
            ).toFixed(2)}
            %
          </text>
        )}
        {anchors}
      </g>
    );
  }
  if (d.tool === "rect" && pts[0] && pts[1]) {
    const x = Math.min(pts[0].x, pts[1].x);
    const y = Math.min(pts[0].y, pts[1].y);
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={Math.abs(pts[1].x - pts[0].x)}
          height={Math.abs(pts[1].y - pts[0].y)}
          fill={`${color}22`}
          stroke={color}
          strokeWidth={width}
          opacity={opacity}
          onClick={onSelect}
          onPointerDown={onBodyDown}
          {...hit}
        />
        {anchors}
      </g>
    );
  }
  if (d.tool === "fib" && pts[0] && pts[1]) {
    const a0 = pts[0];
    const a1 = pts[1];
    return (
      <g onClick={onSelect} onPointerDown={onBodyDown} {...hit}>
        {FIB_LEVELS.map((lv) => {
          const y = a0.y + (a1.y - a0.y) * lv;
          const px =
            d.points[0].price + (d.points[1].price - d.points[0].price) * lv;
          return (
            <g key={lv}>
              <line
                x1={0}
                x2="100%"
                y1={y}
                y2={y}
                stroke={color}
                strokeOpacity={0.6}
                strokeWidth={width}
              />
              <text x={8} y={y - 2} fill={color} fontSize={10}>
                {lv} {fmtPx(px)}
              </text>
            </g>
          );
        })}
        {anchors}
      </g>
    );
  }
  if (d.tool === "parallel" && pts[0] && pts[1] && pts[2]) {
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return (
      <g onClick={onSelect} onPointerDown={onBodyDown} {...hit}>
        <line
          x1={pts[0].x}
          y1={pts[0].y}
          x2={pts[1].x}
          y2={pts[1].y}
          stroke={color}
          strokeWidth={width}
          opacity={opacity}
        />
        <line
          x1={pts[2].x}
          y1={pts[2].y}
          x2={pts[2].x + dx}
          y2={pts[2].y + dy}
          stroke={color}
          strokeWidth={width}
          opacity={opacity}
        />
        {anchors}
      </g>
    );
  }
  return null;
}
