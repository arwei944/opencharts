import { useEffect, useRef } from "react";
import type { ChartEngine } from "@/lib/market/chart-engine";
import type { ChartSettings } from "@/lib/market/settings";
import { setupTouchGestures } from "@/lib/market/touch-gesture";

interface TouchGestureIntegrationProps {
  engine: ChartEngine;
  settings?: Partial<ChartSettings>;
}

/**
 * Mobile touch gesture integration hook
 * Automatically sets up and cleans up touch gestures with configurable sensitivity
 */
export function useTouchGestureIntegration({ engine, settings }: TouchGestureIntegrationProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Find the chart host element (assuming it's within a ref or parent container)
    const findChartHost = (): HTMLElement | null => {
      // Try to find the lightweight-charts container
      const chartDiv = document.querySelector('[id^="apex-chart-"]');
      if (!chartDiv) return null;
      
      const canvas = chartDiv.querySelector("canvas");
      return canvas?.parentElement || chartDiv;
    };

    const host = findChartHost();
    if (!host) {
      console.warn("[TouchGesture] Chart host not found, skipping initialization");
      return;
    }

    // Setup touch gestures with current settings
    cleanupRef.current = setupTouchGestures(host, engine, settings);

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [engine, settings]);

  // Expose a way to dynamically update settings at runtime
  const updateSettings = (newSettings: Partial<ChartSettings>) => {
    // Note: You would typically reinitialize here if needed
    // For now, this is a placeholder for future dynamic updates
    console.log("[TouchGesture] Settings updated:", newSettings);
  };

  return { updateSettings };
}

/**
 * Higher-order component wrapper for touch gesture support
 */
export function withTouchGestures<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  defaultProps?: Partial<ChartSettings>
) {
  return function WithTouchGestures(props: P & { settings?: ChartSettings }) {
    // We can't use hooks in HOC without wrapping it properly
    // This is just a pattern example - actual implementation may vary
    return <WrappedComponent {...props} />;
  };
}

// Example usage:
//   useTouchGestureIntegration({
//     engine,
//     settings: { touchPanSensitivity: 1.2, touchDoubleTapDelay: 250, touchLongPressDelay: 600 },
//   });
