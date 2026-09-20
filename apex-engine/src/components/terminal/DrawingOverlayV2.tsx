import { useRef, useMemo } from "react";
import type { DrawnObject } from "@/lib/market/drawing-engine-v2";
import type { ChartEngine } from "@/lib/market/chart-engine";

interface DrawingOverlayV2Props {
  drawings: DrawnObject[];
  engine?: ChartEngine;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function DrawingOverlayV2({
  drawings,
  engine,
  selectedId,
  onSelect,
  onDelete,
}: DrawingOverlayV2Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert screen coordinates safely
  const safeConvert = (point: { time: number; price: number }): { x: number; y: number } => {
    if (!engine || !containerRef.current) {
      // Fallback for development
      return approximateCoordinates(point);
    }

    try {
      const x = engine.timeToX(point.time);
      const y = engine.priceToY(point.price);

      if (x === null || y === null) return approximateCoordinates(point);

      return { x, y };
    } catch {
      return approximateCoordinates(point);
    }
  };

  // Approximate coordinates for fallback
  const approximateCoordinates = (point: { time: number; price: number }): { x: number; y: number } => {
    const width = containerRef.current?.clientWidth || window.innerWidth;
    const height = containerRef.current?.clientHeight || window.innerHeight;

    const now = Date.now();
    const range = 30 * 24 * 60 * 60 * 1000;

    const x = ((point.time - (now - range)) / range) * width;
    const y = height - (point.price / 100000) * height;

    return { x, y };
  };

  // Generate path for each drawing type
  const renderPath = (drawing: DrawnObject) => {
    if (drawing.points.length < 2) return null;

    const start = safeConvert(drawing.points[0]);
    const end = safeConvert(drawing.points[drawing.points.length - 1]);

    const isSelected = selectedId === drawing.id;
    const opacity = isSelected ? 1 : 0.7;

    switch (drawing.tool) {
      case "hline":
        return (
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={start.y}
            stroke={drawing.color}
            strokeWidth={drawing.linewidth || 1}
            strokeDasharray={drawing.style === "dashed" ? "5,5" : "none"}
            opacity={opacity}
            className="cursor-crosshair hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(drawing.id);
            }}
          />
        );

      case "vline":
        return (
          <line
            x1={start.x}
            y1={start.y}
            x2={start.x}
            y2={end.y}
            stroke={drawing.color}
            strokeWidth={drawing.linewidth || 1}
            strokeDasharray={drawing.style === "dashed" ? "5,5" : "none"}
            opacity={opacity}
            className="cursor-crosshair hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(drawing.id);
            }}
          />
        );

      case "trend":
        return (
          <g>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={drawing.color}
              strokeWidth={drawing.linewidth || 2}
              opacity={opacity}
              className="cursor-move hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(drawing.id);
              }}
            />
            {/* Extension line for ray */}
            {drawing.extended && (
              <>
                <line
                  x1={end.x}
                  y1={end.y}
                  x2={end.x + (end.x - start.x) * 2}
                  y2={end.y + (end.y - start.y) * 2}
                  stroke={drawing.color}
                  strokeWidth={drawing.linewidth || 2}
                  strokeDasharray="3,3"
                  opacity={opacity * 0.5}
                />
              </>
            )}
          </g>
        );

      case "rect":
        const left = Math.min(start.x, end.x);
        const top = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);

        return (
          <rect
            x={left}
            y={top}
            width={width}
            height={height}
            fill={`${drawing.color}33`}
            stroke={drawing.color}
            strokeWidth={drawing.linewidth || 2}
            opacity={opacity}
            className="cursor-move hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(drawing.id);
            }}
          />
        );

      default:
        return null;
    }
  };

  // Render labels for important drawings
  const renderLabels = (drawing: DrawnObject) => {
    if (drawing.points.length < 1) return null;

    const labelPoint = safeConvert(drawing.points[0]);
    if (!labelPoint) return null;

    // Show time/price info
    return (
      <foreignObject x={labelPoint.x} y={labelPoint.y - 20} width={100} height={30}>
        <div className="text-xs bg-bg border border-border rounded px-1 py-0.5 text-subtle">
          T:{drawing.points[0].time} P:{drawing.points[0].price.toFixed(2)}
        </div>
      </foreignObject>
    );
  };

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <svg className="h-full w-full" viewBox={`0 0 ${containerRef.current?.clientWidth || 800} ${containerRef.current?.clientHeight || 500}`}>
        {drawings.map((drawing) => (
          <g key={drawing.id}>
            {renderPath(drawing)}
            {renderLabels(drawing)}
          </g>
        ))}
      </svg>

      {/* Selection indicators */}
      {selectedId && (
        <div className="absolute right-2 top-2 flex items-center gap-2">
          <button
            className="rounded-sm bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
            onClick={() => onDelete?.(selectedId)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
