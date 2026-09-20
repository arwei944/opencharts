import { ChartSettings, DEFAULT_SETTINGS } from "@/lib/market/settings";
import { useTerminal } from "@/lib/market/store";
import { cn } from "@/lib/utils";

export function SettingsModal() {
  const open = useTerminal((s) => s.settingsOpen);
  const close = () => useTerminal.getState().setSettingsOpen(false);
  const settings = useTerminal((s) => s.chartSettings);
  const setSettings = useTerminal((s) => s.setChartSettings);
  
  // Helper to open/close settings modal
  const toggleSettings = () => {
    useTerminal.getState().setSettingsOpen(!open);
  };

  if (!open) return null;

  const update = <K extends keyof ChartSettings>(key: K, value: ChartSettings[K]) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-999 flex items-center justify-center bg-black/50">
      <div className="w-[720px] max-h-[85dvh] overflow-auto rounded-lg border border-border bg-bg p-4 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">⚙️ 图表设置</h2>
          <button onClick={close} className="rounded-sm bg-surface px-2 py-1 text-muted hover:bg-gold hover:text-bg transition-colors">
            ✕ 关闭
          </button>
        </div>

        <div className="space-y-6">
          {/* Crosshair */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-subtle">十字线</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="线条宽度" value={settings.crosshairWidth} min={1} max={3} step={1} onChange={(v) => update("crosshairWidth", v)} />
              <Field label="样式" value={settings.crosshairLineStyle} min={0} max={3} options={[0, 1, 2, 3]} map={{ 0: "隐藏", 1: "实线", 2: "虚线", 3: "点线" }} onChange={(v) => update("crosshairLineStyle", Number(v) as any)} />
            </div>
          </section>

          {/* Time Scale */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-subtle">时间轴</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="柱间距 (px)" value={settings.barSpacing} min={2} max={20} step={1} onChange={(v) => update("barSpacing", v)} />
              <Field label="右侧偏移" value={settings.timeRightOffset} min={0} max={50} step={1} onChange={(v) => update("timeRightOffset", v)} />
            </div>
          </section>

          {/* Price Scale */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-subtle">价格轴</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="顶部边距" value={settings.priceScaleMargins[0]} min={0} max={1} step={0.01} onChange={(v) => update("priceScaleMargins", [Number(v), settings.priceScaleMargins[1]] as any)} />
              <Field label="底部边距" value={settings.priceScaleMargins[1]} min={0} max={1} step={0.01} onChange={(v) => update("priceScaleMargins", [settings.priceScaleMargins[0], Number(v)] as any)} />
            </div>
          </section>

          {/* Volume */}
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
              <span className="col-span-2 text-right text-micro text-muted">{(settings.volumeHeight * 100).toFixed(0)}%</span>
            </div>
          </section>

          {/* Compare Colors */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-subtle">对比品种颜色</h3>
            <div className="flex flex-wrap gap-2">
              {settings.compareColors.map((c, i) => (
                <label key={i} className="flex items-center gap-2">
                  <input type="color" value={c} onChange={(e) => update("compareColors", [...settings.compareColors.slice(0, i), e.target.value, ...settings.compareColors.slice(i + 1)])} className="h-6 w-8 cursor-pointer rounded border border-border" />
                  <span className="text-micro text-subtle">颜色{i + 1}</span>
                </label>
              ))}
            </div>
          </section>

          {/* ✨ Candle Visual Customization */}
          <section className="border-t border-border pt-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-subtle">
              <span>✨</span>
              <span>K 线可视化</span>
            </h3>
            
            {/* K 线尺寸和间距 */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="mb-1 block text-micro text-subtle">柱间距 (px)</label>
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
              
              {/* 初始视野范围 */}
              <div className="rounded-md bg-surface p-3">
                <p className="mb-2 text-micro text-subtle">初始视野范围:</p>
                <div className="flex gap-2">
                  {["fit", "tight", "wide"].map((zoom) => (
                    <button
                      key={zoom}
                      onClick={() => update("initialZoom", zoom as any)}
                      className={`flex-1 rounded-sm px-2 py-1 text-micro transition-colors ${
                        settings.initialZoom === zoom
                          ? "bg-gold text-bg"
                          : "bg-surface text-muted hover:bg-opacity-80"
                      }`}
                    >
                      {zoom === "fit" ? "自动适配" : zoom === "tight" ? "最近 K 线" : "全部 K 线"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* K 线颜色 */}
            <div className="mt-4 space-y-3">
              <p className="text-micro text-subtle">涨跌颜色:</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-micro text-muted mb-1">上涨颜色</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.candleColorUp || "#e7c741"}
                      onChange={(e) => update("candleColorUp", e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-border p-1"
                    />
                    <span className="text-xs text-subtle">{settings.candleColorUp || "#e7c741"}</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-micro text-muted mb-1">下跌颜色</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.candleColorDown || "#f6465d"}
                      onChange={(e) => update("candleColorDown", e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-border p-1"
                    />
                    <span className="text-xs text-subtle">{settings.candleColorDown || "#f6465d"}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 📱 Mobile Touch Gestures */}
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
                  💡 <strong>说明：</strong>灵敏度越高，手指移动时十字丝追踪越快；双击/长按时间越短，反应越灵敏但可能误触。
                </p>
              </div>
            </div>
          </section>

          {/* Reset */}
          <section className="flex items-center justify-between pt-4 border-t border-border">
            <button onClick={() => setSettings(DEFAULT_SETTINGS)} className="rounded-sm px-3 py-1.5 text-micro bg-surface text-muted hover:bg-gold/80 hover:text-bg transition-colors">
              ↺ 恢复默认
            </button>
            
            {/* Save Button Group */}
            <div className="flex gap-2">
              <button 
                type="button" 
                className="rounded-sm px-4 py-1.5 text-micro bg-surface text-fg hover:bg-opacity-70 transition-colors"
                onClick={close}
              >
                取消
              </button>
              
              <button 
                type="button" 
                className="rounded-sm px-4 py-1.5 text-micro bg-gold text-bg hover:bg-opacity-90 font-medium transition-colors shadow-sm"
                onClick={close}
              >
                ✔ 保存
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
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
        <select value={String(value)} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold">
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
