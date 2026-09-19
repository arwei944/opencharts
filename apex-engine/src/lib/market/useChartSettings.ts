import { useEffect } from "react";
import { ChartSettings, DEFAULT_SETTINGS } from "./settings";
import { useTerminal } from "./store";

export function useChartSettings() {
  const settings = useTerminal((s) => s.chartSettings);
  const setSettings = useTerminal((s) => s.setChartSettings);
  
  useEffect(() => {
    // Load from localStorage on first mount
    try {
      const saved = localStorage.getItem("apex-chart-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults for missing fields
        const merged = { ...DEFAULT_SETTINGS, ...parsed };
        setSettings(merged);
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, []);

  return [settings, setSettings] as const;
}
