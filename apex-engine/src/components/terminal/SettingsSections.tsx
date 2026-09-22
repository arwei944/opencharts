import { ChartSettings, DEFAULT_SETTINGS } from "@/lib/market/settings";

interface SectionProps {
  settings: ChartSettings;
  update: <K extends keyof ChartSettings>(
    key: K,
    value: ChartSettings[K],
  ) => void;
}

export function Field({
  label,
  value,
  min,
  max,
  step = 1,
  options,
  map,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  options?: Array<string | number>;
  map?: Record<string, string>;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-micro text-subtle">{label}</label>
      {options ? (
        <select
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {map?.[o] ?? o}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-gold"
          />
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-16 rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
          />
        </div>
      )}
    </div>
  );
}

export function CrosshairSection({ settings, update }: SectionProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-subtle">十字线</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="线条宽度"
          value={settings.crosshairWidth}
          min={1}
          max={3}
          step={1}
          onChange={(v) => update("crosshairWidth", v)}
        />
        <Field
          label="样式"
          value={settings.crosshairLineStyle}
          min={0}
          max={3}
          options={[0, 1, 2, 3]}
          map={{ 0: "隐藏", 1: "实线", 2: "虚线", 3: "点线" }}
          onChange={(v) => update("crosshairLineStyle", Number(v) as never)}
        />
        <Field
          label="网格线型"
          value={settings.gridLineStyle}
          min={0}
          max={3}
          options={[0, 1, 2, 3]}
          map={{ 0: "实线", 1: "点线", 2: "虚线", 3: "粗虚线" }}
          onChange={(v) => update("gridLineStyle", Number(v) as never)}
        />
      </div>
    </section>
  );
}

export function TimeScaleSection({ settings, update }: SectionProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-subtle">时间轴 / 拖拽</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="柱间距 (px)"
          value={settings.barSpacing}
          min={2}
          max={20}
          step={1}
          onChange={(v) => update("barSpacing", v)}
        />
        <Field
          label="右侧偏移"
          value={settings.timeRightOffset}
          min={0}
          max={50}
          step={1}
          onChange={(v) => update("timeRightOffset", v)}
        />
      </div>
      <div className="mt-4">
        <label
          className="mb-1 block text-micro text-subtle"
          htmlFor="mouse-pan"
        >
          鼠标拖拽灵敏度
        </label>
        <div className="flex items-center gap-3">
          <input
            id="mouse-pan"
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={settings.mousePanSensitivity ?? 1}
            onChange={(e) =>
              update("mousePanSensitivity", Number(e.target.value))
            }
            className="w-full accent-gold"
          />
          <span className="w-14 text-right font-mono text-micro text-muted">
            {(settings.mousePanSensitivity ?? 1).toFixed(1)}×
          </span>
        </div>
        <p className="mt-1 text-micro text-muted">
          1× 为 1:1 跟手；调大可让图表移动快于鼠标，调小更精细。
        </p>
      </div>
    </section>
  );
}

export function PriceScaleSection({ settings, update }: SectionProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-subtle">价格轴</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="顶部边距"
          value={settings.priceScaleMargins[0]}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            update("priceScaleMargins", [
              Number(v),
              settings.priceScaleMargins[1],
            ] as never)
          }
        />
        <Field
          label="底部边距"
          value={settings.priceScaleMargins[1]}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            update("priceScaleMargins", [
              settings.priceScaleMargins[0],
              Number(v),
            ] as never)
          }
        />
      </div>
    </section>
  );
}

export function TypographySection({ settings, update }: SectionProps) {
  const FONTS = [
    "IBM Plex Sans, sans-serif",
    "ui-monospace, monospace",
    "system-ui, sans-serif",
    "Georgia, serif",
  ];
  const fontIdx = Math.max(
    0,
    FONTS.indexOf(settings.fontFamily ?? "IBM Plex Sans, sans-serif"),
  );
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-subtle">字体与精度</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="字号 (px)"
          value={settings.fontSize ?? 11}
          min={9}
          max={16}
          step={1}
          onChange={(v) => update("fontSize", Number(v))}
        />
        <Field
          label="字体"
          value={fontIdx}
          min={0}
          max={3}
          step={1}
          options={[0, 1, 2, 3]}
          map={{
            0: "IBM Plex Sans",
            1: "等宽 Mono",
            2: "系统 UI",
            3: "衬线 Serif",
          }}
          onChange={(v) => update("fontFamily", FONTS[Number(v)] as string)}
        />
        <div>
          <label className="mb-1 block text-micro text-subtle">
            价格精度（小数位）
          </label>
          <select
            value={
              settings.pricePrecision == null
                ? "auto"
                : String(settings.pricePrecision)
            }
            onChange={(e) => {
              const v = e.target.value;
              update("pricePrecision", v === "auto" ? undefined : Number(v));
            }}
            className="w-full rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
          >
            <option value="auto">自动（跟随行情）</option>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} 位
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-subtle">
        字号/字体/精度修改后立即生效，随图表持久化。
      </p>
    </section>
  );
}

export function VolumeSection({ settings, update }: SectionProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-subtle">成交量面板高度</h3>
      <div className="grid grid-cols-2 gap-4">
        <input
          type="range"
          min="0.6"
          max="0.95"
          step="0.01"
          value={settings.volumeHeight}
          onChange={(e) => update("volumeHeight", Number(e.target.value))}
          className="col-span-2 w-full accent-gold"
        />
        <span className="col-span-2 text-right text-micro text-muted">
          {(settings.volumeHeight * 100).toFixed(0)}%
        </span>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-micro text-muted">
        <input
          type="checkbox"
          checked={!!settings.mirrorVolume}
          onChange={(e) => update("mirrorVolume", e.target.checked)}
          className="accent-gold"
        />
        倒垂时成交量一起翻转（默认关闭，保持贴底）
      </label>
    </section>
  );
}

export function CompareColorsSection({ settings, update }: SectionProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-subtle">对比品种颜色</h3>
      <div className="flex flex-wrap gap-2">
        {settings.compareColors.map((c, i) => (
          <label key={i} className="flex items-center gap-2">
            <input
              type="color"
              value={c}
              onChange={(e) =>
                update("compareColors", [
                  ...settings.compareColors.slice(0, i),
                  e.target.value,
                  ...settings.compareColors.slice(i + 1),
                ])
              }
              className="h-6 w-8 cursor-pointer rounded border border-border"
            />
            <span className="text-micro text-subtle">颜色{i + 1}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

export function CandleSection({ settings, update }: SectionProps) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-subtle">
        <span>✨</span>
        <span>K 线可视化</span>
      </h3>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="mb-1 block text-micro text-subtle">
            柱间距 (px)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={settings.barSpacing}
              onChange={(e) => update("barSpacing", Number(e.target.value))}
              className="w-full accent-gold"
            />
            <input
              type="number"
              min={2}
              max={20}
              step={1}
              value={settings.barSpacing}
              onChange={(e) => update("barSpacing", Number(e.target.value))}
              className="w-16 rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
            />
            <span className="text-xs text-muted">{settings.barSpacing}px</span>
          </div>
        </div>

        <div className="rounded-md bg-surface p-3">
          <p className="mb-2 text-micro text-subtle">初始视野范围:</p>
          <div className="flex gap-2">
            {["fit", "tight", "wide"].map((zoom) => (
              <button
                key={zoom}
                type="button"
                onClick={() => update("initialZoom", zoom as never)}
                className={`flex-1 rounded-sm px-2 py-1 text-micro transition-colors ${
                  settings.initialZoom === zoom
                    ? "bg-gold text-bg"
                    : "bg-surface text-muted hover:bg-opacity-80"
                }`}
              >
                {zoom === "fit"
                  ? "自动适配"
                  : zoom === "tight"
                    ? "最近 K 线"
                    : "全部 K 线"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-micro text-subtle">涨跌颜色:</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-micro text-muted">上涨颜色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.candleColorUp || "#e7c741"}
                onChange={(e) => update("candleColorUp", e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-border p-1"
              />
              <span className="text-xs text-subtle">
                {settings.candleColorUp || "#e7c741"}
              </span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-micro text-muted">下跌颜色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.candleColorDown || "#f6465d"}
                onChange={(e) => update("candleColorDown", e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-border p-1"
              />
              <span className="text-xs text-subtle">
                {settings.candleColorDown || "#f6465d"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TouchSection({ settings, update }: SectionProps) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-subtle">
        <span>📱</span>
        <span>触摸手势设置</span>
      </h3>
      <div className="space-y-4">
        <Field
          label="拖拽灵敏度"
          value={settings.touchPanSensitivity ?? 1}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(v) => update("touchPanSensitivity", v)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="双击延迟 (ms)"
            value={settings.touchDoubleTapDelay ?? 300}
            min={100}
            max={500}
            step={50}
            onChange={(v) => update("touchDoubleTapDelay", v)}
          />
          <Field
            label="长按时长 (ms)"
            value={settings.touchLongPressDelay ?? 500}
            min={200}
            max={1000}
            step={100}
            onChange={(v) => update("touchLongPressDelay", v)}
          />
        </div>
        <div className="rounded-md bg-surface p-3">
          <p className="text-xs text-muted">
            💡 <strong>说明：</strong>
            灵敏度越高，手指移动时十字丝追踪越快；双击/长按时间越短，反应越灵敏但可能误触。
          </p>
        </div>
      </div>
    </section>
  );
}

export function ResetSection({
  onReset,
  onCancel,
}: {
  onReset: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="flex items-center justify-between border-t border-border pt-4">
      <button
        type="button"
        onClick={onReset}
        className="rounded-sm bg-surface px-3 py-1.5 text-micro text-muted transition-colors hover:bg-gold/80 hover:text-bg"
      >
        ↺ 恢复默认
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-sm bg-surface px-4 py-1.5 text-micro text-fg transition-colors hover:bg-opacity-70"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          className="rounded-sm bg-gold px-4 py-1.5 text-micro font-medium text-bg shadow-sm transition-colors hover:bg-opacity-90"
          onClick={onCancel}
        >
          ✔ 保存
        </button>
      </div>
    </section>
  );
}

export { DEFAULT_SETTINGS };
