import { INDICATOR_PRESETS } from "@/lib/market/constants";
import { indicatorCatalog } from "@/lib/plugins/registry";
import { useTerminal } from "@/lib/market/store";
import { useState } from "react";
import { Pencil } from "lucide-react";
import type { IndicatorInst } from "@/lib/market/types";
import { CustomIndicatorModal } from "./CustomIndicatorModal";
import { Modal } from "./Modal";

const INDICATOR_COLORS = [
  "#f0b90b",
  "#00d4ff",
  "#f6465d",
  "#0ecb81",
  "#c084fc",
  "#f7931a",
  "#848e9c",
  "#e0e0e0",
];
const INDICATOR_WIDTHS = [1, 2, 3, 4];
const INDICATOR_STYLES = [
  { id: 0, label: "─" },
  { id: 1, label: "⡀" },
  { id: 2, label: "╌" },
  { id: 3, label: "╍" },
] as const;
const INDICATOR_SCALES = [
  { id: "right", label: "右" },
  { id: "left", label: "左" },
  { id: "overlay", label: "叠加" },
] as const;

export function IndicatorModal() {
  const open = useTerminal((s) => s.indicatorOpen);
  const setIndicatorOpen = useTerminal((s) => s.setIndicatorOpen);
  const indicators = useTerminal((s) => s.indicators);
  const addIndicator = useTerminal((s) => s.addIndicator);
  const updateIndicator = useTerminal((s) => s.updateIndicator);
  const removeIndicator = useTerminal((s) => s.removeIndicator);
  const applyIndicatorPreset = useTerminal((s) => s.applyIndicatorPreset);
  const bars = useTerminal((s) => s.bars);

  // Id of the indicator whose params are being edited (inline in the list).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftParams, setDraftParams] = useState<number[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (x: { name: string; kind: string }) =>
    !q || x.name.toLowerCase().includes(q) || x.kind.toLowerCase().includes(q);

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

          <p className="mb-1 text-micro text-muted">预置指标组</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {INDICATOR_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={`替换当前指标为：${p.indicators.map((x) => x.kind).join(" + ")}`}
                className="rounded-sm border border-gold/40 bg-elevated px-2 py-1 text-micro text-gold hover:bg-gold/10 transition-colors"
                onClick={() => applyIndicatorPreset(p.indicators)}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="mb-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索指标（名称 / 代码）…"
              className="w-full rounded border border-border bg-bg px-2 py-1.5 text-micro text-fg outline-none ring-0 focus:border-gold"
            />
          </div>

          <p className="mb-2 text-micro text-muted">主图 Overlay</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {indicatorCatalog()
              .filter((x) => x.group === "main" && matches(x))
              .map((x) => (
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
            {indicatorCatalog()
              .filter((x) => x.group === "sub" && matches(x))
              .map((x) => (
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
              const spec = indicatorCatalog().find((x) => x.kind === i.kind);
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
                      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-subtle">色</span>
                          {INDICATOR_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`颜色 ${c}`}
                              className={`h-3.5 w-3.5 rounded-full border ${
                                i.color === c
                                  ? "border-gold ring-1 ring-gold"
                                  : "border-border"
                              }`}
                              style={{ background: c }}
                              onClick={() =>
                                updateIndicator(i.id, {
                                  color: i.color === c ? undefined : c,
                                })
                              }
                            />
                          ))}
                          {i.color && (
                            <button
                              type="button"
                              aria-label="重置颜色"
                              className="text-subtle hover:text-fg"
                              onClick={() =>
                                updateIndicator(i.id, { color: undefined })
                              }
                            >
                              ↺
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-subtle">宽</span>
                          {INDICATOR_WIDTHS.map((w) => (
                            <button
                              key={w}
                              type="button"
                              aria-label={`线宽 ${w}`}
                              className={`rounded-sm px-1.5 text-micro ${
                                (i.width ?? 1) === w
                                  ? "bg-gold text-bg"
                                  : "bg-surface text-muted hover:text-fg"
                              }`}
                              onClick={() =>
                                updateIndicator(i.id, {
                                  width: (i.width ?? 1) === w ? undefined : w,
                                })
                              }
                            >
                              {w}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-subtle">型</span>
                          {INDICATOR_STYLES.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              aria-label={`线型 ${s.label}`}
                              className={`rounded-sm px-1.5 font-mono text-micro ${
                                (i.style ?? 0) === s.id
                                  ? "bg-gold text-bg"
                                  : "bg-surface text-muted hover:text-fg"
                              }`}
                              onClick={() =>
                                updateIndicator(i.id, {
                                  style:
                                    (i.style ?? 0) === s.id
                                      ? undefined
                                      : (s.id as 0 | 1 | 2 | 3),
                                })
                              }
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-subtle">轴</span>
                          {INDICATOR_SCALES.map((sc) => (
                            <button
                              key={sc.id}
                              type="button"
                              aria-label={`刻度 ${sc.label}`}
                              className={`rounded-sm px-1.5 text-micro ${
                                (i.scale ?? "right") === sc.id
                                  ? "bg-gold text-bg"
                                  : "bg-surface text-muted hover:text-fg"
                              }`}
                              onClick={() =>
                                updateIndicator(i.id, {
                                  scale:
                                    (i.scale ?? "right") === sc.id
                                      ? undefined
                                      : sc.id,
                                })
                              }
                            >
                              {sc.label}
                            </button>
                          ))}
                        </div>
                      </div>
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
                        <select
                          value={i.pane ?? 0}
                          aria-label={`${i.kind} 所在窗口`}
                          onChange={(e) =>
                            updateIndicator(i.id, {
                              pane: Number(e.target.value) || undefined,
                            })
                          }
                          className="rounded border border-border bg-bg px-1 py-0.5 text-micro text-muted outline-none focus:border-gold"
                        >
                          <option value={0}>主图叠加</option>
                          <option value={1}>副图 1</option>
                          <option value={2}>副图 2</option>
                          <option value={3}>副图 3</option>
                          <option value={4}>副图 4</option>
                        </select>
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
