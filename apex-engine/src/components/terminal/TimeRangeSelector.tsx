import type { TimeRange } from "../../lib/market/types";

interface TimeRangeSelectorProps {
  range: TimeRange;
  onChange: (range: TimeRange) => void;
}

// Predefined time ranges
const TIME_RANGES: { label: string; value: TimeRange; days: number }[] = [
  { label: "1H", value: "1H", days: 1 / 24 },
  { label: "24H", value: "24H", days: 1 },
  { label: "7D", value: "7D", days: 7 },
  { label: "30D", value: "30D", days: 30 },
  { label: "3M", value: "3M", days: 90 },
  { label: "1Y", value: "1Y", days: 365 },
  { label: "All", value: "ALL", days: Infinity },
];

export function TimeRangeSelector({
  range,
  onChange,
}: TimeRangeSelectorProps) {
  const handleRangeClick = (selectedRange: TimeRange) => {
    if (range === selectedRange) return; // Already selected
    onChange(selectedRange);
  };

  return (
    <div className="flex flex-wrap gap-1">
      {TIME_RANGES.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => handleRangeClick(value)}
          disabled={value === "ALL"}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
            range === value
              ? "bg-blue-500 text-white shadow-sm"
              : value === "ALL"
              ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
          title={`${label} lookback period`}
        >
          {label}
        </button>
      ))}
      
      {/* Fit Button */}
      <button
        onClick={() => onChange("FIT")}
        className="ml-2 px-2.5 py-1 text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 rounded border border-gray-600"
        title="Fit chart to visible bars"
      >
        ⤢ Fit
      </button>
    </div>
  );
}

// Utility: Get time range boundaries
export function getTimeRangeBounds(
  range: TimeRange,
  now?: number
): { from: number; to: number } | null {
  const currentTime = now || Date.now();
  
  switch (range) {
    case "1H":
      return {
        from: currentTime - 1 * 60 * 60 * 1000,
        to: currentTime,
      };
    
    case "24H":
      return {
        from: currentTime - 24 * 60 * 60 * 1000,
        to: currentTime,
      };
    
    case "7D":
      return {
        from: currentTime - 7 * 24 * 60 * 60 * 1000,
        to: currentTime,
      };
    
    case "30D":
      return {
        from: currentTime - 30 * 24 * 60 * 60 * 1000,
        to: currentTime,
      };
    
    case "3M":
      return {
        from: currentTime - 90 * 24 * 60 * 60 * 1000,
        to: currentTime,
      };
    
    case "1Y":
      return {
        from: currentTime - 365 * 24 * 60 * 60 * 1000,
        to: currentTime,
      };
    
    case "ALL":
      return null; // Show all available data
    
    case "FIT":
      // This is handled separately by the engine
      return {
        from: 0,
        to: 0,
      };
    
    default:
      return null;
  }
}

// Export TimeRange type for external use
export type { TimeRange };
