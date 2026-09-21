import { INDICATOR_CATALOG } from "@/lib/market/constants";
import { useTerminal } from "@/lib/market/store";
import { useState } from "react";
import { Pencil } from "lucide-react";
import type { IndicatorInst } from "@/lib/market/types";
import { CustomIndicatorModal } from "./CustomIndicatorModal";
import { Modal } from "./Modal";

export function IndicatorModal() {
  const open = useTerminal((s) => s.indicatorOpen);
  const setIndicatorOpen = useTerminal((s) => s.setIndicatorOpen);
  const indicators = useTerminal((s) => s.indicators);
  const addIndicator = useTerminal((s) => s.addIndicator);
  const updateIndicator = useTerminal((s) => s.updateIndicator);
  const removeIndicator = useTerminal((s) => s.removeIndicator);
  const bars = useTerminal((s) => s.bars);

  // Id of the indicator whose params are being edited (inline in the list).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftParams, setDraftParams] = useState<number[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const startEdit = (i: IndicatorInst) => {
    setEditingId(i.id);
    setDraftParams([...i.params]);
  };
  const commitEdit = () => {
    if (editingId) updateIndicator(editingId, { params: draftParams });
    setEditingId(null);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={() => setIndicatorOpen(false)}
        labelledBy="indicator-dialog"
      >
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="indicator-dialog"
              className="text-sm font-medium"
              tabIndex={-1}
            >
              📊 Indicators
            </h2>
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

          <p className="mb-2 text-micro text-muted">
            已添加 Added ({indicators.length})
          </p>
          <ul className="space-y-1">
            {indicators.map((i) => {
              const spec = INDICATOR_CATALOG.find((x) => x.kind === i.kind);
              const editing = editingId === i.id;
              const labels = spec?.labels ?? [];
              return (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 rounded-sm bg-elevated px-2 py-1 text-micro"
                >
                  {editing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={i.visible}
                        aria-label={`显示 ${i.kind}`}
                        onChange={(e) =>
                          updateIndicator(i.id, { visible: e.target.checked })
                        }
                        className="accent-gold"
                      />
                      <span className="font-medium">{i.kind}</span>
                      {draftParams.map((v, idx) => (
                        <label key={idx} className="flex items-center gap-1">
                          <span className="text-subtle">
                            {labels[idx] ?? `P${idx + 1}`}
                          </span>
                          <input
                            type="number"
                            value={v}
                            onChange={(e) =>
                              setDraftParams((prev) =>
                                prev.map((p, j) =>
                                  j === idx ? Number(e.target.value) : p,
                                ),
                              )
                            }
                            className="w-16 rounded border border-border bg-bg px-1 py-0.5 text-micro text-fg outline-none focus:border-gold"
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        className="rounded-sm bg-gold px-2 py-0.5 text-micro font-medium text-bg"
                        onClick={commitEdit}
                      >
                        ✔
                      </button>
                      <button
                        type="button"
                        className="text-muted hover:text-fg"
                        onClick={() => setEditingId(null)}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={i.visible}
                          aria-label={`显示 ${i.kind}`}
                          onChange={(e) =>
                            updateIndicator(i.id, { visible: e.target.checked })
                          }
                          className="accent-gold"
                        />
                        <span className="font-medium">{i.kind}</span>
                        {i.params.length > 0 && (
                          <span className="text-subtle">
                            {i.params.join(", ")}
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`编辑 ${i.kind} 参数`}
                          className="text-muted hover:text-gold"
                          onClick={() => startEdit(i)}
                        >
                          ⚙
                        </button>
                      </span>
                      <button
                        type="button"
                        aria-label={`移除 ${i.kind}`}
                        className="text-muted hover:text-red-400"
                        onClick={() => removeIndicator(i.id)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </li>
              );
            })}
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
