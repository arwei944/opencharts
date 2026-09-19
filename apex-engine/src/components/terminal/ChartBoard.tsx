import { useTerminal } from "@/lib/market/store";
import type { ChartLayout } from "@/lib/market/types";
import { ChartPane } from "./ChartPane";

const GRID: Record<ChartLayout, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "1x2": "grid-cols-2 grid-rows-1",
  "2x1": "grid-cols-1 grid-rows-2",
  "2x2": "grid-cols-2 grid-rows-2",
};

export function ChartBoard() {
  const layout = useTerminal((s) => s.layout);
  const panes = useTerminal((s) => s.panes);
  return (
    <div className={`grid min-h-0 flex-1 ${GRID[layout]}`}>
      {panes.map((p, i) => (
        <div key={p.id} className={i > 0 ? "border-l border-t border-border" : ""}>
          <ChartPane paneId={p.id} master={i === 0} />
        </div>
      ))}
    </div>
  );
}
