import { INDICATOR_CATALOG } from "@/lib/market/constants";
import { useTerminal } from "@/lib/market/store";

export function IndicatorModal() {
  const open = useTerminal((s) => s.indicatorOpen);
  const setIndicatorOpen = useTerminal((s) => s.setIndicatorOpen);
  const indicators = useTerminal((s) => s.indicators);
  const addIndicator = useTerminal((s) => s.addIndicator);
  const removeIndicator = useTerminal((s) => s.removeIndicator);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50" onClick={() => setIndicatorOpen(false)}>
      <div className="w-[min(520px,94vw)] rounded-md border border-border bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">指标</h2>
          <button type="button" className="text-muted" onClick={() => setIndicatorOpen(false)}>
            关闭
          </button>
        </div>
        <p className="mb-2 text-micro text-muted">主图</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {INDICATOR_CATALOG.filter((x) => x.group === "main").map((x) => (
            <button
              key={x.kind}
              type="button"
              className="rounded-sm bg-elevated px-2 py-1 text-micro hover:text-gold"
              onClick={() => addIndicator(x.kind)}
            >
              {x.name}
            </button>
          ))}
        </div>
        <p className="mb-2 text-micro text-muted">副图</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {INDICATOR_CATALOG.filter((x) => x.group === "sub").map((x) => (
            <button
              key={x.kind}
              type="button"
              className="rounded-sm bg-elevated px-2 py-1 text-micro hover:text-gold"
              onClick={() => addIndicator(x.kind)}
            >
              {x.name}
            </button>
          ))}
        </div>
        <p className="mb-2 text-micro text-muted">已添加</p>
        <ul className="space-y-1">
          {indicators.map((i) => (
            <li key={i.id} className="flex items-center justify-between rounded-sm bg-elevated px-2 py-1 text-micro">
              <span>
                {i.kind} {i.params.join(" / ")}
              </span>
              <button type="button" className="text-down" onClick={() => removeIndicator(i.id)}>
                移除
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
