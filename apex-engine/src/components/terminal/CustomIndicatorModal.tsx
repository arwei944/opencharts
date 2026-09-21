import { useState, useEffect } from "react";
import { X, Plus, Save, Play } from "lucide-react";
import { INDICATOR_CATALOG } from "@/lib/market/constants";
import { useTerminal } from "@/lib/market/store";
import type { IndicatorInst } from "@/lib/market/types";
import { scriptParser } from "@/lib/market/script-parser";
import type { Candle } from "@/lib/market/types";
import { Modal } from "./Modal";

interface CustomIndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  bars?: Candle[];
}

export function CustomIndicatorModal({
  isOpen,
  onClose,
  bars = [],
}: CustomIndicatorModalProps) {
  const [activeTab, setActiveTab] = useState<"builtin" | "custom">("custom");
  const [customScript, setCustomScript] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    data?: Array<{ time: number; value: number }>;
    error?: string;
  } | null>(null);
  const addIndicator = useTerminal((s) => s.addIndicator);

  useEffect(() => {
    if (isOpen && activeTab === "custom") {
      // Reset state when opening custom tab
      setCustomScript(
        `// @version=5\n// Write your custom indicator here\n\nlength = input.int(9, "Period", minval=1)\nresult = sma(close, length)\nplot(result)`,
      );
      setTestResult(null);
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleBuiltinIndicatorSelect = (kind: string) => {
    addIndicator(kind as IndicatorInst["kind"]);
    onClose();
  };

  const handleRunScript = () => {
    try {
      const result = scriptParser.parse(customScript);

      if (!result.success || !result.calculationFn) {
        setTestResult({
          success: false,
          error: result.errors?.join(", ") || "Failed to parse script",
        });
        return;
      }

      if (bars.length === 0) {
        setTestResult({
          success: false,
          error: "No data available for testing",
        });
        return;
      }

      const calculationData = result.calculationFn(bars);

      // Multi-output Pine scripts render one series per plot(); preview the
      // first output while the full spec goes to the chart.
      const preview =
        Array.isArray(calculationData) &&
        calculationData[0] &&
        "key" in calculationData[0]
          ? (
              calculationData[0] as {
                data: Array<{ time: number; value: number }>;
              }
            ).data
          : (calculationData as Array<{ time: number; value: number }>);

      setTestResult({
        success: true,
        data: preview,
      });
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleAddToChart = () => {
    if (!testResult?.success || !testResult.data) return;
    const parsed = scriptParser.parse(customScript);
    if (!parsed.success || !parsed.calculationFn) return;
    const st = useTerminal.getState();
    const id = st.addIndicator("CUSTOM");
    st.addCustomFn(id, parsed.calculationFn);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      labelledBy="custom-indicator-dialog"
      wide
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2
          id="custom-indicator-dialog"
          className="text-lg font-semibold text-fg"
          tabIndex={-1}
        >
          📊 Custom Indicators
        </h2>
        <button
          onClick={onClose}
          aria-label="关闭自定义指标"
          className="rounded-sm bg-surface px-2 py-1 text-muted hover:bg-gold transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-border"
        role="tablist"
        aria-label="自定义指标模式"
      >
        <button
          role="tab"
          aria-selected={activeTab === "builtin"}
          onClick={() => setActiveTab("builtin")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "builtin"
              ? "bg-surface text-gold border-b-2 border-gold"
              : "text-muted hover:text-fg"
          }`}
        >
          📈 Built-in Indicators
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "custom"}
          onClick={() => setActiveTab("custom")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "custom"
              ? "bg-surface text-gold border-b-2 border-gold"
              : "text-muted hover:text-fg"
          }`}
        >
          ✏️ Custom Script
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[60dvh] overflow-auto p-4">
        {activeTab === "builtin" ? (
          <BuiltinsGrid onSelect={handleBuiltinIndicatorSelect} />
        ) : (
          <CustomScriptEditor
            script={customScript}
            setScript={setCustomScript}
            onRun={handleRunScript}
            result={testResult}
            onSave={handleAddToChart}
            barsCount={bars.length}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-sm px-3 py-1.5 text-micro bg-surface text-fg hover:bg-opacity-70 transition-colors"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/** Built-in indicators grid — sourced from the single INDICATOR_CATALOG. */
function BuiltinsGrid({ onSelect }: { onSelect: (kind: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {INDICATOR_CATALOG.map((indicator) => (
        <button
          key={indicator.kind}
          onClick={() => onSelect(indicator.kind)}
          className="rounded-lg border border-border bg-surface p-4 text-left hover:border-gold hover:bg-surface-hover transition-colors"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-fg">{indicator.name}</span>
            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold">
              {indicator.group === "main" ? "主图" : "副图"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {indicator.labels.length > 0 ? (
              indicator.labels.map((label, i) => (
                <span key={label} className="text-xs text-subtle">
                  {label}: {indicator.defaults[i] ?? "—"}
                </span>
              ))
            ) : (
              <span className="text-xs text-subtle">无参数</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Custom script editor component */
function CustomScriptEditor({
  script,
  setScript,
  onRun,
  result,
  onSave,
  barsCount,
}: {
  script: string;
  setScript: (s: string) => void;
  onRun: () => void;
  result: { success: boolean; data?: any; error?: string } | null;
  onSave: () => void;
  barsCount: number;
}) {
  return (
    <div className="space-y-4">
      {/* Info box */}
      <div className="rounded-md bg-blue-500/10 p-3 text-sm text-blue-300">
        <strong>Syntax similar to Pine Script v5:</strong>
        <br />
        Use parameters like <code>input.int(9, "Period", minval=1)</code>,<br />
        And functions like <code>sma(close, length)</code>,{" "}
        <code>ema(close, length)</code>, etc.
        <br />
        Available bars: {barsCount}
      </div>

      {/* Code editor area */}
      <div>
        <label className="mb-2 block text-sm font-medium text-fg">
          Script Editor
        </label>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          className="h-64 w-full resize-none rounded-lg border border-border bg-bg p-3 font-mono text-sm text-fg outline-none focus:border-gold"
          placeholder='// Write your indicator script here...&#10;// Example: length = input.int(9, "Period")&#10;// result = sma(close, length)&#10;// plot(result)'
          spellCheck={false}
        />
      </div>

      {/* Run button */}
      <button
        onClick={onRun}
        className="flex items-center gap-2 rounded-sm bg-gold px-4 py-1.5 text-bg hover:bg-opacity-90 transition-colors font-medium"
      >
        <Play className="size-4" />
        Run Script
      </button>

      {/* Results */}
      {result && (
        <div
          className={`rounded-lg border p-4 ${
            result.success
              ? "border-green-500/30 bg-green-500/10"
              : "border-red-500/30 bg-red-500/10"
          }`}
        >
          {result.success ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-full bg-green-500 p-1">
                  <Plus className="size-3 text-white" />
                </div>
                <span className="font-semibold text-green-300">
                  Script executed successfully!
                </span>
              </div>

              {/* Preview graph (simple ASCII visualization) */}
              {result.data && result.data.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-green-400">
                    Preview (first 20 points):
                  </p>
                  <div className="flex h-32 items-end gap-1 overflow-x-auto">
                    {result.data.slice(0, 30).map((point: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          height: `${Math.min(100, Math.max(5, (point.value / Math.max(...result.data.map((d: any) => d.value))) * 100))}%`,
                          width: "8px",
                          background: "rgba(255, 255, 255, 0.8)",
                          borderRadius: "2px",
                        }}
                        title={`Time: ${point.time}, Value: ${point.value.toFixed(2)}`}
                      />
                    ))}
                  </div>

                  {/* Add button */}
                  <button
                    onClick={onSave}
                    className="mt-4 flex items-center gap-2 rounded-sm bg-gold px-4 py-1.5 text-bg hover:bg-opacity-90 transition-colors font-medium"
                  >
                    <Save className="size-4" />
                    Add to Chart
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-red-500 p-1">
                <XIcon className="size-3 text-white" />
              </div>
              <span className="font-semibold text-red-300">Error:</span>
              <span className="text-red-300">{result.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function XIcon(props: any) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
