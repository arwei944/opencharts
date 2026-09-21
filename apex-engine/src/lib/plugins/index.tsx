/**
 * Plugin system entry. Registers a couple of demo plugins to prove the
 * registry contract, and re-exports the API for third parties.
 */
/* eslint-disable react-refresh/only-export-components */
import {
  registerDataSource,
  registerDrawingTool,
  registerIndicator,
} from "./registry";
import type { Candle } from "../market/types";
import { sma } from "../market/indicators";

// Demo indicator: double-SMA ribbon (any period).
registerIndicator({
  kind: "DSMA",
  name: "双均线带",
  group: "main",
  defaults: [5, 20],
  labels: ["快", "慢"],
  compute(bars: Candle[], params: number[]) {
    const [fast = 5, slow = 20] = params;
    const f = sma(bars, fast);
    const s = sma(bars, slow);
    const byTime = new Map(s.map((p) => [p.time, p.value]));
    return f
      .filter((p) => byTime.has(p.time))
      .map((p) => ({
        time: p.time,
        value: (p.value + (byTime.get(p.time) ?? p.value)) / 2,
      }));
  },
});

// Demo drawing tool: X mark (2 points).
registerDrawingTool({
  id: "xmark",
  label: "X 记号",
  points: 2,
  render: (pts, color) => {
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return (
      <g>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={1.5}
        />
        <line
          x1={a.x}
          y1={b.y}
          x2={b.x}
          y2={a.y}
          stroke={color}
          strokeWidth={1.5}
        />
      </g>
    );
  },
});

// Demo data source: no-op fallback placeholder (real adapters plug in here).
registerDataSource({
  name: "demo",
  fetchKlines: async () => [],
});

export * from "./registry";
