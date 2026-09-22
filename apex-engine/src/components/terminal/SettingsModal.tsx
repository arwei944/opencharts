import { useTerminal } from "@/lib/market/store";
import { usePaper } from "@/lib/trading/paper";
import {
  setActiveBroker,
  liveBroker,
  okxBroker,
  paperBroker,
} from "@/lib/trading/broker";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { listSettingsSections, listThemes } from "@/lib/plugins/registry";
import { BUILTIN_THEMES } from "@/lib/market/constants";
import { TIMEZONE_OPTIONS } from "@/lib/market/timefmt";
import {
  CandleSection,
  CompareColorsSection,
  CrosshairSection,
  PriceScaleSection,
  ResetSection,
  TimeScaleSection,
  TouchSection,
  TypographySection,
  VolumeSection,
  DEFAULT_SETTINGS,
} from "./SettingsSections";

export function SettingsModal() {
  const open = useTerminal((s) => s.settingsOpen);
  const close = () => useTerminal.getState().setSettingsOpen(false);
  const settings = useTerminal((s) => s.chartSettings);
  const setSettings = useTerminal((s) => s.setChartSettings);
  const themePref = useTerminal((s) => s.themePref);
  const setThemePref = useTerminal((s) => s.setThemePref);
  const risk = usePaper((s) => s.risk);
  const setRisk = usePaper((s) => s.setRisk);
  const brokerMode = useTerminal((s) => s.brokerMode);
  const setBrokerMode = useTerminal((s) => s.setBrokerMode);

  const update = <K extends keyof typeof DEFAULT_SETTINGS>(
    key: K,
    value: (typeof DEFAULT_SETTINGS)[K],
  ) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <Modal open={open} onClose={close} labelledBy="settings-dialog" wide>
      <div className="max-h-[85dvh] overflow-auto p-4">
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="settings-dialog"
            className="text-lg font-semibold text-fg"
            tabIndex={-1}
          >
            ⚙️ 图表设置
          </h2>
          <button
            onClick={close}
            aria-label="关闭设置"
            className="rounded-sm bg-surface px-2 py-1 text-muted transition-colors hover:bg-gold hover:text-bg"
          >
            ✕ 关闭
          </button>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
              外观 · 主题模式
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                ...BUILTIN_THEMES.map((t) => [t.id, t.label] as const),
                // P4: plugin themes render after the builtins.
                ...listThemes().map((t) => [t.id, t.name] as const),
                ["system", "跟随系统"] as const,
              ].map(([id, lab]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setThemePref(id)}
                  className={`rounded-sm px-3 py-1.5 text-micro ${
                    themePref === id
                      ? "bg-gold text-bg"
                      : "bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {lab}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-subtle">
              跟随系统：随操作系统深浅色模式实时切换，双主题无需手动管理。
            </p>
          </section>
          <CrosshairSection settings={settings} update={update} />
          <TimeScaleSection settings={settings} update={update} />
          <PriceScaleSection settings={settings} update={update} />
          <VolumeSection settings={settings} update={update} />
          <CompareColorsSection settings={settings} update={update} />
          <CandleSection settings={settings} update={update} />
          <TypographySection settings={settings} update={update} />
          <section>
            <h3 className="mb-3 text-sm font-medium text-subtle">时间轴时区</h3>
            <select
              value={settings.timezone ?? "local"}
              onChange={(e) => update("timezone", e.target.value)}
              className="w-full rounded border border-border bg-bg px-2 py-1.5 text-micro text-fg outline-none ring-0 focus:border-gold"
            >
              {TIMEZONE_OPTIONS.map((z) => (
                <option key={z.zone} value={z.zone}>
                  {z.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] text-subtle">
              跨时区分析用（含夏令时规则）；本机时间随浏览器时钟与系统夏令时。
            </p>
          </section>
          <TouchSection settings={settings} update={update} />
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
              交易连接
            </h3>
            <div className="flex gap-2">
              {(
                [
                  ["paper", "模拟盘"],
                  ["binance", "实盘·币安"],
                  ["okx", "实盘·OKX"],
                ] as const
              ).map(([id, lab]) => (
                <button
                  key={id}
                  type="button"
                  onClick={async () => {
                    if (id !== "paper") {
                      const live = id === "binance" ? liveBroker : okxBroker;
                      const st = await live.status?.();
                      if (st && !st.enabled) {
                        toast.error(st.error ?? "实盘未启用");
                        return;
                      }
                    }
                    setActiveBroker(
                      id === "paper"
                        ? paperBroker
                        : id === "binance"
                          ? liveBroker
                          : okxBroker,
                    );
                    setBrokerMode(id);
                  }}
                  className={`rounded-sm px-3 py-1.5 text-micro ${
                    brokerMode === id
                      ? "bg-gold text-bg"
                      : "bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {lab}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-subtle">
              实盘需要服务端环境变量{" "}
              <code className="rounded bg-surface px-1">
                BINANCE_API_KEY / BINANCE_API_SECRET
              </code>{" "}
              已配置；密钥仅在服务端签名，浏览器不可见；下单有真实资金风险，请谨慎。
            </p>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
              风控 · 模拟盘下单限制
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-micro text-subtle">
                单笔最大数量
                <input
                  type="number"
                  min={0}
                  value={risk.maxQty ?? ""}
                  placeholder="不限"
                  onChange={(e) =>
                    setRisk({
                      maxQty:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
                />
              </label>
              <label className="text-micro text-subtle">
                单笔最大额度 (USDT)
                <input
                  type="number"
                  min={0}
                  value={risk.maxNotional ?? ""}
                  placeholder="不限"
                  onChange={(e) =>
                    setRisk({
                      maxNotional:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-micro text-fg outline-none ring-0 focus:border-gold"
                />
              </label>
            </div>
            <p className="mt-1.5 text-[10px] text-subtle">
              超出限制的下单会被拒绝并在交易面板提示（留空 = 不限制）。
            </p>
          </section>
          <ResetSection
            onReset={() => setSettings(DEFAULT_SETTINGS)}
            onCancel={close}
          />
          {/* P3: plugin-drawn settings sections render after the builtin ones. */}
          {listSettingsSections().map((sec) => (
            <section key={sec.id}>
              <h3 className="mb-3 text-sm font-medium text-subtle">
                {sec.title}
              </h3>
              {sec.render({
                settings: settings as unknown as Record<string, unknown>,
                update: (key, value) => update(key as never, value as never),
              })}
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
