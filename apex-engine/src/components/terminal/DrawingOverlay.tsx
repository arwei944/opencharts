import { useEffect } from "react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import { FIB_LEVELS } from "@/lib/market/constants";
import { useTerminal } from "@/lib/market/store";
import { fmtPx } from "@/lib/utils";
import type { DrawPoint, Drawing } from "@/lib/market/types";

/**
 * SVG overlay for drawings. Renders each drawing, highlights the selected one
 * (thicker, brighter), and lets the user click a drawing to select it and press
 * Delete to remove it. Pure presentation over the store's drawings list.
 */
export function DrawingOverlay({ engine }: { engine: ChartEngine | null }) {
  const drawings = useTerminal((s) => s.drawings);
  const selectedId = useTerminal((s) => s.selectedDrawingId);
  const select = useTerminal((s) => s.selectDrawing);
  const remove = useTerminal((s) => s.removeDrawing);

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

  if (!engine) return null;
  if (!drawings.length) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {drawings.map((d) => (
        <DrawShape
          key={d.id}
          d={d}
          engine={engine}
          selected={d.id === selectedId}
          onSelect={() => select(d.id)}
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
}: {
  d: Drawing;
  engine: ChartEngine;
  selected: boolean;
  onSelect: () => void;
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
    style: { cursor: "pointer" as const },
  };

  if (d.tool === "hline" && pts[0]) {
    return (
      <line
        x1={0}
        x2="100%"
        y1={pts[0].y}
        y2={pts[0].y}
        stroke={color}
        strokeWidth={width}
        opacity={opacity}
        onClick={onSelect}
        {...hit}
      />
    );
  }
  if (d.tool === "vline" && pts[0]) {
    return (
      <line
        y1={0}
        y2="100%"
        x1={pts[0].x}
        x2={pts[0].x}
        stroke={color}
        strokeWidth={width}
        opacity={opacity}
        onClick={onSelect}
        {...hit}
      />
    );
  }
  if (
    (d.tool === "trend" || d.tool === "ray" || d.tool === "measure") &&
    pts[0] &&
    pts[1]
  ) {
    return (
      <g onClick={onSelect} {...hit}>
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
      </g>
    );
  }
  if (d.tool === "rect" && pts[0] && pts[1]) {
    const x = Math.min(pts[0].x, pts[1].x);
    const y = Math.min(pts[0].y, pts[1].y);
    return (
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
        {...hit}
      />
    );
  }
  if (d.tool === "fib" && pts[0] && pts[1]) {
    const a0 = pts[0];
    const a1 = pts[1];
    return (
      <g onClick={onSelect} {...hit}>
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
      </g>
    );
  }
  if (d.tool === "parallel" && pts[0] && pts[1] && pts[2]) {
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return (
      <g onClick={onSelect} {...hit}>
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
      </g>
    );
  }
  return null;
}
