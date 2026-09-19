import type { Drawing } from "../../lib/market/types";
import { useRef, useEffect } from "react";
import type { ChartEngine } from "../../lib/market/chart-engine";

interface DrawingOverlayProps {
  drawings: Drawing[];
  engine?: ChartEngine; // Optional reference to chart engine for precise coordinates
  onDeselect?: (id: string) => void;
  onSelect?: (id: string) => void;
}

export function DrawingOverlay({
  drawings,
  engine,
  onDeselect,
  onSelect,
}: DrawingOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  // 将绘制数据转换为 SVG 路径
  const renderDrawing = (drawing: Drawing) => {
    const color = drawing.color;

    switch (drawing.tool) {
      case "hline":
        // 水平线 - 在两个点之间画一条横线
        return (
          <line
            x1="0"
            y1={coordinateToY(drawing.points[1]?.price ?? 0)}
            x2="100%"
            y2={coordinateToY(drawing.points[1]?.price ?? 0)}
            stroke={color}
            strokeWidth="2"
            strokeDasharray="5,5"
            className="pointer-events-auto cursor-crosshair hover:opacity-100 opacity-70"
            onClick={(e) => {
              e.stopPropagation();
              onDeselect?.(drawing.id);
            }}
          />
        );

      case "vline":
        // 垂直线
        return (
          <line
            x1={coordinateToX(drawing.points[1]?.time ?? 0)}
            y1="0"
            x2={coordinateToX(drawing.points[1]?.time ?? 0)}
            y2="100%"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="5,5"
            className="pointer-events-auto cursor-crosshair hover:opacity-100 opacity-70"
            onClick={(e) => {
              e.stopPropagation();
              onDeselect?.(drawing.id);
            }}
          />
        );

      case "trend":
      case "ray":
        // 趋势线 / Ray
        if (drawing.points.length >= 2) {
          const startX = coordinateToX(drawing.points[0].time);
          const startY = coordinateToY(drawing.points[0].price);
          const endX = coordinateToX(drawing.points[1].time);
          const endY = coordinateToY(drawing.points[1].price);

          return (
            <line
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={color}
              strokeWidth="2"
              className="pointer-events-auto cursor-move hover:opacity-100 opacity-70"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(drawing.id);
              }}
            />
          );
        }
        return null;

      case "rect":
        // 矩形
        if (drawing.points.length >= 2) {
          const x1 = Math.min(coordinateToX(drawing.points[0].time), coordinateToX(drawing.points[1].time));
          const x2 = Math.max(coordinateToX(drawing.points[0].time), coordinateToX(drawing.points[1].time));
          const y1 = Math.min(coordinateToY(drawing.points[0].price), coordinateToY(drawing.points[1].price));
          const y2 = Math.max(coordinateToY(drawing.points[0].price), coordinateToY(drawing.points[1].price));

          // Calculate relative position and size in percentage
          const leftPercent = ((x1 - (typeof window !== "undefined" ? 0 : 0)) / (hostRef.current?.clientWidth || 800)) * 100;
          const topPercent = ((y1 - (typeof window !== "undefined" ? 0 : 0)) / (hostRef.current?.clientHeight || 500)) * 100;
          const widthPercent = Math.abs((x2 - x1) / (hostRef.current?.clientWidth || 800)) * 100;
          const heightPercent = Math.abs((y2 - y1) / (hostRef.current?.clientHeight || 500)) * 100;

          return (
            <rect
              x={`${leftPercent}%`}
              y={`${topPercent}%`}
              width={`${widthPercent}%`}
              height={`${heightPercent}%`}
              fill={`${color}33`}
              stroke={color}
              strokeWidth="2"
              className="pointer-events-auto cursor-move hover:opacity-100 opacity-70"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(drawing.id);
              }}
            />
          );
        }
        return null;

      default:
        return null;
    }
  };

  // 坐标转换函数（从价格/时间到像素）- 精确版本
  const coordinateToY = (price: number): number => {
    if (!engine || !hostRef.current) {
      // Fallback to approximate calculation
      const chartHeight = hostRef.current?.clientHeight || 500;
      return chartHeight - (price / 100000) * chartHeight;
    }

    try {
      // Use engine's priceToCoordinate for precise mapping
      const coord = engine.priceToY(price);
      return coord !== null ? coord : 500 - (price / 100000) * 500;
    } catch {
      // Fallback
      const chartHeight = hostRef.current?.clientHeight || 500;
      return chartHeight - (price / 100000) * chartHeight;
    }
  };

  const coordinateToX = (time: number): number => {
    if (!engine || !hostRef.current) {
      // Fallback to approximate calculation
      const chartWidth = hostRef.current?.clientWidth || 800;
      const now = Date.now();
      const range = 30 * 24 * 60 * 60 * 1000; // 30 days
      return ((time - (now - range)) / range) * chartWidth;
    }

    try {
      // Use engine's timeToX for precise mapping
      const coord = engine.timeToX(time);
      return coord !== null ? coord : ((time - (Date.now() - 30 * 24 * 60 * 60 * 1000)) / (30 * 24 * 60 * 60 * 1000)) * (hostRef.current.clientWidth || 800);
    } catch {
      // Fallback
      const chartWidth = hostRef.current?.clientWidth || 800;
      const now = Date.now();
      const range = 30 * 24 * 60 * 60 * 1000;
      return ((time - (now - range)) / range) * chartWidth;
    }
  };

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-20">
      {drawings.map((drawing) => (
        <div key={drawing.id} className="absolute inset-0">
          {renderDrawing(drawing)}
        </div>
      ))}
    </div>
  );
}
