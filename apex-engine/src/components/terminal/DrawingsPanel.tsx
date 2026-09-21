import { useTerminal } from "@/lib/market/store";
import { TOOLS } from "@/lib/market/constants";
import type { Drawing, Tool } from "@/lib/market/types";
import { fmtPx } from "@/lib/utils";
import { Modal } from "./Modal";

const TOOL_LABEL = new Map<Tool, string>(TOOLS.map((t) => [t.id, t.label]));

function summary(d: Drawing): string {
  if (d.tool === "text" && d.points[0]?.text) return d.points[0].text;
  const a = d.points[0];
  if (!a) return "";
  if (d.points.length > 1) {
    const b = d.points[1];
    return `${fmtPx(a.price)} → ${fmtPx(b.price)}`;
  }
  return fmtPx(a.price);
}

/**
 * Object-tree panel for drawings: select, show/hide, lock, delete one or all.
 * Mirrors the TradingView "drawings list" panel — a P2 gap item.
 */
export function DrawingsPanel() {
  const open = useTerminal((s) => s.drawingsOpen);
  const drawings = useTerminal((s) => s.drawings);
  const selectedId = useTerminal((s) => s.selectedDrawingId);
  const st = () => useTerminal.getState();

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => st().setDrawingsOpen(false)}
      labelledBy="drawings-title"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
          <h2 id="drawings-title" className="text-sm font-semibold text-fg">
            绘图列表{" "}
            <span className="text-xs text-muted">({drawings.length})</span>
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (
                  drawings.length &&
                  confirm("清除全部绘图？此操作可撤销。")
                ) {
                  st().clearDrawings();
                }
              }}
              className="rounded-sm px-2 py-1 text-micro text-down hover:bg-elevated"
            >
              全部清除
            </button>
            <button
              type="button"
              onClick={() => st().setDrawingsOpen(false)}
              className="rounded-sm px-2 py-1 text-micro text-muted hover:bg-elevated hover:text-fg"
            >
              关闭
            </button>
          </div>
        </div>
        {drawings.length === 0 ? (
          <p className="px-3 py-6 text-center text-micro text-subtle">
            暂无绘图 · 用工具栏的绘图工具在图表上绘制
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-1">
            {drawings.map((d) => {
              const selected = d.id === selectedId;
              const hidden = d.visible === false;
              const locked = !!d.locked;
              return (
                <div
                  key={d.id}
                  className={`group flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-1 text-micro ${
                    selected
                      ? "bg-gold/15 text-fg"
                      : "text-muted hover:bg-hover"
                  } ${hidden ? "opacity-40" : ""}`}
                  onClick={() => st().selectDrawing(d.id)}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: d.color }}
                  />
                  <span className="w-14 shrink-0 text-subtle">
                    {TOOL_LABEL.get(d.tool) ?? d.tool}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{summary(d)}</span>
                  <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <button
                      type="button"
                      title={hidden ? "显示" : "隐藏"}
                      onClick={(e) => {
                        e.stopPropagation();
                        st().updateDrawing(d.id, {
                          visible: hidden ? true : false,
                        });
                      }}
                      className="rounded-sm px-1 text-muted hover:text-fg"
                    >
                      {hidden ? "◌" : "◉"}
                    </button>
                    <button
                      type="button"
                      title={locked ? "解锁" : "锁定"}
                      onClick={(e) => {
                        e.stopPropagation();
                        st().updateDrawing(d.id, { locked: !locked });
                      }}
                      className={`rounded-sm px-1 hover:text-fg ${locked ? "text-gold" : "text-muted"}`}
                    >
                      {locked ? "🔒" : "🔓"}
                    </button>
                    <button
                      type="button"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        st().removeDrawing(d.id);
                      }}
                      className="rounded-sm px-1 text-muted hover:text-down"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] text-subtle">
          提示：隐藏/锁定状态随绘图持久化；Delete 键删除选中绘图；Ctrl+Z
          可撤销删除。
        </p>
      </div>
    </Modal>
  );
}
