import { INDICATOR_CATALOG } from "@/lib/market/constants";
import { useTerminal } from "@/lib/market/store";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { CustomIndicatorModal } from "./CustomIndicatorModal";
import { Modal } from "./Modal";

export function IndicatorModal() {
  const open = useTerminal((s) => s.indicatorOpen);
  const setIndicatorOpen = useTerminal((s) => s.setIndicatorOpen);
  const indicators = useTerminal((s) => s.indicators);
  const addIndicator = useTerminal((s) => s.addIndicator);
  const removeIndicator = useTerminal((s) => s.removeIndicator);
  const bars = useTerminal((s) => s.bars);

  const [showCustomModal, setShowCustomModal] = useState(false);

  return (
    <>
      <Modal open={open} onClose={() => setIndicatorOpen(false)} labelledBy="indicator-dialog">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="indicator-dialog" className="text-sm font-medium" tabIndex={-1}>📊 Indicators</h2>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="打开自定义指标"
                className="flex items-center gap-1 text-muted hover:text-gold transition-colors"
                onClick={() => {
                  setIndicatorOpen(false);
                  setShowCustomModal(true);
                }}
              >
                <Pencil className="size-3" />
                <span className="text-xs">Custom</span>
              </button>
              <button
                type="button"
                aria-label="关闭指标弹窗"
                className="text-muted hover:text-fg"
                onClick={() => setIndicatorOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <p className="mb-2 text-micro text-muted">主图 Overlay</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {INDICATOR_CATALOG.filter((x) => x.group === "main").map((x) => (
              <button
                key={x.kind}
                type="button"
                aria-label={`添加 ${x.name}`}
                className="rounded-sm bg-elevated px-2 py-1 text-micro hover:text-gold transition-colors"
                onClick={() => addIndicator(x.kind)}
              >
                {x.name}
              </button>
            ))}
          </div>

          <p className="mb-2 text-micro text-muted">副图 Panel</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {INDICATOR_CATALOG.filter((x) => x.group === "sub").map((x) => (
              <button
                key={x.kind}
                type="button"
                aria-label={`添加 ${x.name}`}
                className="rounded-sm bg-elevated px-2 py-1 text-micro hover:text-gold transition-colors"
                onClick={() => addIndicator(x.kind)}
              >
                {x.name}
              </button>
            ))}
          </div>

          <p className="mb-2 text-micro text-muted">已添加 Added ({indicators.length})</p>
          <ul className="space-y-1">
            {indicators.map((i) => (
              <li key={i.id} className="flex items-center justify-between rounded-sm bg-elevated px-2 py-1 text-micro">
                <span>
                  <input
                    type="checkbox"
                    checked={i.visible}
                    aria-label={`显示 ${i.kind}`}
                    onChange={() => {}}
                    className="mr-2 accent-gold"
                  />
                  {i.kind}
                </span>
                <button
                  type="button"
                  aria-label={`移除 ${i.kind}`}
                  className="text-muted hover:text-red-400"
                  onClick={() => removeIndicator(i.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {/* Custom Indicator Modal */}
      <CustomIndicatorModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        bars={bars}
      />
    </>
  );
}