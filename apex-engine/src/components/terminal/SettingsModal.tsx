import { useTerminal } from "@/lib/market/store";
import { Modal } from "./Modal";
import {
  CandleSection,
  CompareColorsSection,
  CrosshairSection,
  PriceScaleSection,
  ResetSection,
  TimeScaleSection,
  TouchSection,
  VolumeSection,
  DEFAULT_SETTINGS,
} from "./SettingsSections";

export function SettingsModal() {
  const open = useTerminal((s) => s.settingsOpen);
  const close = () => useTerminal.getState().setSettingsOpen(false);
  const settings = useTerminal((s) => s.chartSettings);
  const setSettings = useTerminal((s) => s.setChartSettings);

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
          <CrosshairSection settings={settings} update={update} />
          <TimeScaleSection settings={settings} update={update} />
          <PriceScaleSection settings={settings} update={update} />
          <VolumeSection settings={settings} update={update} />
          <CompareColorsSection settings={settings} update={update} />
          <CandleSection settings={settings} update={update} />
          <TouchSection settings={settings} update={update} />
          <ResetSection
            onReset={() => setSettings(DEFAULT_SETTINGS)}
            onCancel={close}
          />
        </div>
      </div>
    </Modal>
  );
}
