import type { ChartEngine } from "./chart-engine";
import type { ChartSettings } from "./settings";

/**
 * Setup touch gestures for mobile devices
 * Supports: Pan, Pinch-to-zoom, Crosshair tracking
 */
export function setupTouchGestures(host: HTMLElement, engine: ChartEngine, settings?: Partial<ChartSettings>) {
  const config = {
    panSensitivity: settings?.touchPanSensitivity ?? 1,      // Horizontal sensitivity multiplier
    doubleTapDelay: settings?.touchDoubleTapDelay ?? 300,    // Double tap detection delay (ms)
    longPressDelay: settings?.touchLongPressDelay ?? 500,    // Long press detection delay (ms)
  };

  let touchStartX = 0;
  let touchStartY = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let isPinching = false;
  let pinchStartDist = 0;
  let lastPinchDist = 0;
  let touchStartTime = 0;
  let lastTapTime = 0;

  /** Handle initial touch contact */
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      // Two-finger pinch
      isPinching = true;
      pinchStartDist = getTouchDistance(e.touches);
      lastPinchDist = pinchStartDist;
    } else if (e.touches.length === 1) {
      // Single finger pan
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      lastTouchX = touchStartX;
      lastTouchY = touchStartY;
      touchStartTime = Date.now();
      
      // Check for double tap
      const currentTime = Date.now();
      if (currentTime - lastTapTime < config.doubleTapDelay) {
        // Double tap detected - toggle fullscreen or chart type
        handleDoubleTap(e);
        lastTapTime = currentTime;
      } else {
        lastTapTime = currentTime;
      }
    }
  };

  /** Handle moving touch */
  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault(); // Prevent scrolling
    
    if (isPinching && e.touches.length === 2) {
      // Pinch to zoom
      const currentDist = getTouchDistance(e.touches);
      const zoomRatio = currentDist / lastPinchDist;
      
      // Apply zoom via lightweight-charts time scale
      try {
        const currentRange = engine.chart.timeScale().getVisibleRange();
        if (currentRange) {
          const rangeSize = currentRange.to - currentRange.from;
          const newFrom = currentRange.from + (rangeSize * (1 - zoomRatio)) / 2;
          const newTo = currentRange.to - (rangeSize * (1 - zoomRatio)) / 2;
          
          engine.chart.timeScale().setVisibleRange({
            from: newFrom as number,
            to: newTo as number,
          });
        }
      } catch (err) {
        console.warn("Zoom failed:", err);
      }
      
      lastPinchDist = currentDist;
    } else if (e.touches.length === 1) {
      // Single finger pan
      const currentTouchX = e.touches[0].clientX;
      const currentTouchY = e.touches[0].clientY;
      
      const dx = currentTouchX - lastTouchX;
      const dy = currentTouchY - lastTouchY;
      
      // Determine pan direction based on dominant axis
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal pan - move crosshair
        try {
          const timeAtStart = engine.xToTime(touchStartX);
          if (timeAtStart !== null) {
            // Calculate new time based on delta
            const pixelsPerSecond = calculatePixelsPerSecond();
            const timeDelta = (dx / pixelsPerSecond) * config.panSensitivity * 1000;
            const newTime = timeAtStart + timeDelta;
            
            // Set crosshair position
            engine.setCrosshair(newTime, null);
          }
        } catch (err) {
          console.warn("Pan failed:", err);
        }
      } else {
        // Vertical pan - adjust price scale
        try {
          const priceAtStart = engine.yToPrice(touchStartY);
          if (priceAtStart !== null) {
            // Simple vertical scroll (not implemented in engine yet)
            // This could be extended to scroll price scale
            console.log("Vertical pan not yet supported");
          }
        } catch (err) {
          console.warn("Vertical pan failed:", err);
        }
      }
      
      lastTouchX = currentTouchX;
      lastTouchY = currentTouchY;
    }
  };

  /** Handle touch release */
  const onTouchEnd = (e: TouchEvent) => {
    isPinching = false;
    
    // Detect long press
    const holdDuration = Date.now() - touchStartTime;
    if (holdDuration > config.longPressDelay && e.touches.length === 0) {
      // Long press detected - show context menu
      handleLongPress(e);
    }
  };

  /** Get distance between two touches */
  function getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const t0 = touches[0];
    const t1 = touches[1];
    return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  }

  /** Calculate pixels per second based on current visible range */
  function calculatePixelsPerSecond(): number {
    try {
      const range = engine.chart.timeScale().getVisibleRange();
      const width = host.clientWidth;
      if (range && typeof range.from === "number" && typeof range.to === "number") {
        const timeSpan = range.to - range.from;
        // ✅ P1 Bug Fix: Prevent division by zero or negative values
        if (timeSpan <= 0) {
          console.warn("[TouchGesture] Invalid time span:", timeSpan);
          return width / (15 * 60); // Default to 15 minutes
        }
        return width / timeSpan;
      }
    } catch (err) {
      console.error("[TouchGesture] Failed to calculate pixels/sec:", err);
    }
    // ✅ Return meaningful default instead of 0
    return host.clientWidth / (15 * 60);
  }

  /** Handle double tap gesture */
  function handleDoubleTap(e: TouchEvent) {
    e.preventDefault();
    
    // Toggle between full screen and normal size
    if (!document.fullscreenElement) {
      host.requestFullscreen?.().catch(() => {
        console.warn("Fullscreen not available");
      });
    } else {
      document.exitFullscreen?.().catch(() => {
        console.warn("Exit fullscreen failed");
      });
    }
  }

  /** Handle long press gesture */
  function handleLongPress(e: TouchEvent) {
    e.preventDefault();
    
    // Show touch coordinates for debugging
    const touch = e.touches[0] || e.changedTouches[0];
    console.log("Long press at:", { x: touch.clientX, y: touch.clientY });
    
    // TODO: Show context menu with options like:
    // - Add drawing tool
    // - Compare symbol
    // - Export screenshot
  }

  // Attach event listeners
  host.addEventListener("touchstart", onTouchStart, { passive: false });
  host.addEventListener("touchmove", onTouchMove, { passive: false });
  host.addEventListener("touchend", onTouchEnd);
  host.addEventListener("touchcancel", onTouchEnd);

  // Return cleanup function
  return () => {
    host.removeEventListener("touchstart", onTouchStart);
    host.removeEventListener("touchmove", onTouchMove);
    host.removeEventListener("touchend", onTouchEnd);
    host.removeEventListener("touchcancel", onTouchEnd);
  };
}
