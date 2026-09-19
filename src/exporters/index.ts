/**
 * Export System - 导出系统
 * 
 * 支持图表截图、数据导出、打印等功能
 */

import type { IChartApi } from "lightweight-charts";
import type { Candle } from "../data/types";

// ============================================================================
// Export Options
// ============================================================================

export interface ImageExportOptions {
  format?: "png" | "jpeg" | "webp";
  quality?: number;          // 1-100, only for jpeg/webp
  width?: number;            // output width (auto if not specified)
  height?: number;           // output height (auto if not specified)
  backgroundColor?: string;  // custom background color
}

export interface DataExportOptions {
  format: "csv" | "json" | "xlsx";
  includeTimestamps?: boolean;
  includeMetadata?: boolean;
  precision?: number;        // decimal places for prices
}

export interface PrintOptions {
  showLegend?: boolean;
  showVolume?: boolean;
  paperSize?: "A4" | "letter" | "legal";
  orientation?: "portrait" | "landscape";
}

// ============================================================================
// Chart Exporter
// ============================================================================

export class ChartExporter {
  private chart: IChartApi | null = null;
  
  constructor() {}
  
  /**
   * Set the chart instance
   */
  setChart(chart: IChartApi): void {
    this.chart = chart;
  }
  
  /**
   * Take a screenshot of the chart
   */
  takeScreenshot(options?: ImageExportOptions): Blob | null {
    if (!this.chart) {
      console.error("[ChartExporter] No chart instance set");
      return null;
    }
    
    try {
      const canvas = this.chart.takeScreenshot();
      if (!canvas) return null;
      
      return new Promise((resolve) => {
        const format = options?.format ?? "png";
        const quality = options?.quality ?? 0.92;
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(null);
          }
        }, `image/${format}`, quality);
      });
    } catch (error) {
      console.error("[ChartExporter] Screenshot failed:", error);
      return null;
    }
  }
  
  /**
   * Download screenshot directly
   */
  async downloadScreenshot(
    filename?: string,
    options?: ImageExportOptions
  ): Promise<boolean> {
    const blob = await this.takeScreenshot(options);
    if (!blob) return false;
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `chart-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return true;
  }
  
  /**
   * Copy screenshot to clipboard
   */
  async copyToClipboard(): Promise<boolean> {
    const blob = await this.takeScreenshot();
    if (!blob) return false;
    
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      return true;
    } catch {
      console.error("[ChartExporter] Failed to copy to clipboard");
      return false;
    }
  }
}

// ============================================================================
// Data Exporter
// ============================================================================

export class DataExporter {
  /**
   * Export K-line data to CSV
   */
  exportCSV(bars: Candle[], options?: { includeHeaders?: boolean }): string {
    const headers = ["time", "open", "high", "low", "close", "volume"];
    const rows = bars.map((bar) => [
      new Date(bar.time * 1000).toISOString(),
      bar.open.toFixed(4),
      bar.high.toFixed(4),
      bar.low.toFixed(4),
      bar.close.toFixed(4),
      bar.volume.toFixed(2),
    ]);
    
    if (options?.includeHeaders !== false) {
      return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    }
    
    return rows.map((r) => r.join(",")).join("\n");
  }
  
  /**
   * Download CSV file
   */
  downloadCSV(bars: Candle[], filename?: string): boolean {
    const csv = this.exportCSV(bars);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `ohlcv-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return true;
  }
  
  /**
   * Export data to JSON
   */
  exportJSON(bars: Candle[], options?: DataExportOptions): string {
    const data = bars.map((bar) => ({
      ...(options?.includeTimestamps ? { timestamp: bar.time * 1000 } : {}),
      open: Number(bar.open.toFixed(4)),
      high: Number(bar.high.toFixed(4)),
      low: Number(bar.low.toFixed(4)),
      close: Number(bar.close.toFixed(4)),
      volume: Number(bar.volume.toFixed(2)),
    }));
    
    return JSON.stringify(data, null, 2);
  }
  
  /**
   * Export data with metadata
   */
  exportJSONWithMetadata(
    bars: Candle[],
    metadata: { symbol: string; interval: string; updatedAt: string },
    options?: DataExportOptions
  ): string {
    const result = {
      ...(options?.includeMetadata ? { metadata } : {}),
      bars: this.exportJSON(bars, options),
    };
    
    return JSON.stringify(result, null, 2);
  }
}

// ============================================================================
// Print Helper
// ============================================================================

export class PrintHelper {
  /**
   * Print the chart area
   */
  printChart(container: HTMLElement, options?: PrintOptions): void {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      console.error("[PrintHelper] Failed to open print window");
      return;
    }
    
    const canvas = document.querySelector(".apex-chart-canvas");
    if (!canvas) {
      printWindow.document.write("<h1>No chart found</h1>");
      return;
    }
    
    const styles = `
      <style>
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none; }
        }
      </style>
    `;
    
    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Chart Print</title>
          ${styles}
        </head>
        <body>
          <div class="no-print">
            <button onclick="window.print()">Print</button>
            <button onclick="window.close()">Close</button>
          </div>
          ${canvas.outerHTML}
        </body>
      </html>
    `;
    
    printWindow.document.write(content);
    printWindow.document.close();
    
    // Auto trigger print after delay
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  }
}

// ============================================================================
// Singleton instances
// ============================================================================

let chartExporter: ChartExporter | null = null;
let dataExporter: DataExporter | null = null;
let printHelper: PrintHelper | null = null;

/**
 * Get chart exporter instance
 */
export function getChartExporter(): ChartExporter {
  if (!chartExporter) {
    chartExporter = new ChartExporter();
  }
  return chartExporter;
}

/**
 * Get data exporter instance
 */
export function getDataExporter(): DataExporter {
  if (!dataExporter) {
    dataExporter = new DataExporter();
  }
  return dataExporter;
}

/**
 * Get print helper instance
 */
export function getPrintHelper(): PrintHelper {
  if (!printHelper) {
    printHelper = new PrintHelper();
  }
  return printHelper;
}

/**
 * Reset all exporters (useful for testing)
 */
export function resetExporters(): void {
  chartExporter = null;
  dataExporter = null;
  printHelper = null;
}

// ============================================================================
// React Hooks
// ============================================================================

import { useRef } from "react";

/**
 * Hook for taking screenshots in React components
 */
export function useChartScreenshot() {
  const chartRef = useRef<IChartApi | null>(null);
  const exporter = useRef(new ChartExporter());
  
  const setChart = (chart: IChartApi | null) => {
    chartRef.current = chart;
    exporter.current.setChart(chart);
  };
  
  const take = async (options?: ImageExportOptions) => {
    return await exporter.current.takeScreenshot(options);
  };
  
  const download = async (filename?: string, options?: ImageExportOptions) => {
    return await exporter.current.downloadScreenshot(filename, options);
  };
  
  const copy = async () => {
    return await exporter.current.copyToClipboard();
  };
  
  return { setChart, take, download, copy };
}

/**
 * Hook for exporting data in React components
 */
export function useDataExporter() {
  const exporter = useRef(new DataExporter());
  
  const exportCSV = (bars: Candle[], filename?: string) => {
    return exporter.current.downloadCSV(bars, filename);
  };
  
  const exportJSON = (bars: Candle[], options?: DataExportOptions) => {
    return exporter.current.exportJSON(bars, options);
  };
  
  return { exportCSV, exportJSON };
}

// ============================================================================
// Export
// ============================================================================

export { ChartExporter, DataExporter, PrintHelper };
