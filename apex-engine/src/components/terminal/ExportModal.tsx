import { useState } from "react";
import { useTerminal } from "@/lib/market/store";
import { filterByRange, toCsv, toJson } from "@/lib/market/export-data";
import { INTERVALS } from "@/lib/market/constants";
import { Modal } from "./Modal";

type RangePreset = "all" | "3d" | "7d" | "30d";

const PRESET_SECONDS: Record<Exclude<RangePreset, "all">, number> = {
  "3d": 3 * 86_400,
  "7d": 7 * 86_400,
  "30d": 30 * 86_400,
};

/**
 * Data export dialog: CSV or JSON, over "all" / recent / custom time windows.
 * Downshifted from the old one-click CSV toolbar button to make the range
 * choice explicit (gap-list: multi-format export + time selection).
 */
export function ExportModal() {
  const open = useTerminal((s) => s.exportOpen);
  const format = useTerminal((s) => s.exportFormat);
  const setFormat = useTerminal((s) => s.setExportFormat);
  const symbol = useTerminal((s) => s.symbol);
  const interval = useTerminal((s) => s.interval);
  const bars = useTerminal((s) => s.bars);
  const [preset, setPreset] = useState<RangePreset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (!open) return null;
  const st = () => useTerminal.getState();
  const close = () => st().setExportOpen(false);

  const doExport = () => {
    let range: { from?: number; to?: number } = {};
    if (preset !== "all") {
      const secs = PRESET_SECONDS[preset];
      range = { from: -secs };
    } else if (from || to) {
      const fromT = from
        ? Math.floor(new Date(from).getTime() / 1000)
        : undefined;
      const toT = to ? Math.floor(new Date(to).getTime() / 1000) : undefined;
      if (Number.isFinite(fromT) || Number.isFinite(toT))
        range = { from: fromT, to: toT };
    }
    const selected = filterByRange(bars, range);
    if (!selected.length) return;
    const body = format === "csv" ? toCsv(selected) : toJson(selected);
    const blob = new Blob([body], {
      type: format === "csv" ? "text/csv" : "application/json",
    });
    const a = document.createElement("a");
    const day = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `${symbol}-${interval}-${day}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    close();
  };

  const ivLabel = INTERVALS.find((x) => x.id === interval)?.label ?? interval;

  return (
    <Modal open={open} onClose={close} labelledBy="export-dialog">
      <div className="p-4">
        <h2 id="export-dialog" className="mb-4 text-lg font-semibold text-fg">
          导出行情数据
        </h2>
        <p className="mb-3 text-xs text-muted">
          {symbol} · {ivLabel} · 当前 {bars.length.toLocaleString()} 根
        </p>

        <label className="mb-1 block text-micro text-subtle">格式</label>
        <div className="mb-3 flex gap-2">
          {(["csv", "json"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`rounded-sm px-3 py-1.5 text-micro ${
                format === f
                  ? "bg-gold text-bg"
                  : "bg-surface text-muted hover:text-fg"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-micro text-subtle">时间范围</label>
        <div className="mb-3 flex gap-2">
          {(
            [
              ["all", "全部"],
              ["3d", "最近 3 天"],
              ["7d", "最近 7 天"],
              ["30d", "最近 30 天"],
            ] as const
          ).map(([p, lab]) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-sm px-2.5 py-1.5 text-micro ${
                preset === p
                  ? "bg-elevated text-fg ring-1 ring-gold"
                  : "bg-surface text-muted hover:text-fg"
              }`}
            >
              {lab}
            </button>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-micro text-subtle">
            自定义起始（可留空）
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("all");
              }}
              className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
            />
          </label>
          <label className="block text-micro text-subtle">
            自定义截止（可留空）
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("all");
              }}
              className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-sm px-3 py-1.5 text-micro text-muted hover:bg-surface hover:text-fg"
          >
            取消
          </button>
          <button
            type="button"
            onClick={doExport}
            className="rounded-sm bg-gold px-3 py-1.5 text-micro text-bg"
          >
            下载 {format.toUpperCase()}
          </button>
        </div>
      </div>
    </Modal>
  );
}
