/**
 * Pine Script-like Parser for Custom Indicators
 * Provides similar functionality to TradingView's scripting language
 */

import type { Candle } from "./types";
import { sma, ema } from "./indicators";
import { compilePine } from "./pine-eval";

export interface ScriptParseResult {
  success: boolean;
  indicatorKind: string;
  params: Record<string, number | boolean | string>;
  calculationFn?: (
    bars: Candle[],
  ) =>
    | Array<{ time: number; value: number; color?: string }>
    | Array<{
        key: string;
        color: string;
        data: Array<{ time: number; value: number }>;
      }>;
  overlay?: boolean;
  paneIndex?: number;
  errors?: string[];
}

export class ScriptParser {
  /** Parse a simple Pine Script-like string into an executable indicator */
  parse(script: string): ScriptParseResult {
    const errors: string[] = [];

    // Enhanced Pine subset: any script that declares plot() calls (and is not
    // the legacy sma/ema/rsi/macd template shape) gets the real evaluator with
    // multi-output support, state variables and expressions.
    if (
      script.includes("plot(") &&
      !/^(sma|ema|rsi|macd)\(/i.test(script.trim())
    ) {
      const pine = compilePine(script);
      if (pine.ok) {
        const params: Record<string, number | boolean | string> = {};
        pine.labels.forEach((lab, i) => {
          params[lab] = pine.params[i];
        });
        return {
          success: true,
          indicatorKind: "CUSTOM",
          params,
          calculationFn: pine.run,
          overlay: pine.overlay,
        };
      }
      return {
        success: false,
        indicatorKind: "CUSTOM",
        params: {},
        errors: pine.errors,
      };
    }

    // Remove comments
    const cleanedScript = script.replace(/\/\/.*$/gm, "");

    // Extract parameters
    const params: Record<string, number | boolean | string> = {};
    const paramRegex =
      /input\.int\((\d+),\s*"([^"]+)"(?:,\s*minval=(\d+))?(?:,\s*maxval=(\d+))?/g;
    let match;

    while ((match = paramRegex.exec(cleanedScript)) !== null) {
      params[match[2]] = parseInt(match[1]);
    }

    // Detect indicator type from function calls
    let indicatorKind = "CUSTOM";
    if (
      cleanedScript.includes("sma(") ||
      cleanedScript.includes("simple_average")
    ) {
      indicatorKind = "MA";
      const periodMatch = /\(length\s*=\s*(\d+)\)/;
      const period = parseInt(periodMatch.exec(cleanedScript)?.[1] || "9");
      params.period = period;
    } else if (
      cleanedScript.includes("ema(") ||
      cleanedScript.includes("exp_average")
    ) {
      indicatorKind = "EMA";
      const periodMatch = /(ema|exp_average)\((.*?)period\s*=\s*(\d+)/;
      const period = parseInt(periodMatch.exec(cleanedScript)?.[3] || "9");
      params.period = period;
    } else if (cleanedScript.includes("rsi(")) {
      indicatorKind = "RSI";
      const periodMatch = /rsi\(.*?length\s*=\s*(\d+)/;
      const period = parseInt(periodMatch.exec(cleanedScript)?.[1] || "14");
      params.period = period;
    } else if (cleanedScript.includes("macd(")) {
      indicatorKind = "MACD";
      const fastMatch = /fastLength\s*=\s*(\d+)/;
      const slowMatch = /slowLength\s*=\s*(\d+)/;
      const signalMatch = /signalLength\s*=\s*(\d+)/;
      params.fastLength = parseInt(fastMatch.exec(cleanedScript)?.[1] || "12");
      params.slowLength = parseInt(slowMatch.exec(cleanedScript)?.[1] || "26");
      params.signalLength = parseInt(
        signalMatch.exec(cleanedScript)?.[1] || "9",
      );
    } else {
      // Custom calculation
      const calcFn = this.parseCustomCalculation(cleanedScript);
      if (!calcFn) {
        errors.push("Unable to parse custom calculation logic");
        return { success: false, indicatorKind, params, errors };
      }

      params.calculationType = "custom";
      return {
        success: true,
        indicatorKind: "CUSTOM",
        params,
        calculationFn: calcFn,
        overlay:
          cleanedScript.includes("overlay") && cleanedScript.includes("true"),
      };
    }

    return {
      success: true,
      indicatorKind,
      params,
      overlay: indicatorKind === "MA" || indicatorKind === "EMA",
    };
  }

  /** Parse custom calculation expressions */
  private parseCustomCalculation(
    script: string,
  ): ((bars: Candle[]) => Array<{ time: number; value: number }>) | null {
    try {
      // Example: Simple combination of SMA and EMA
      if (script.includes("sma") && script.includes("ema")) {
        const smaPeriod = this.extractParam(script, "sma");
        const emaPeriod = this.extractParam(script, "ema");

        return (bars: Candle[]) => {
          const smaData = sma(bars, smaPeriod);
          const emaData = ema(bars, emaPeriod);

          // Combine: weighted average
          return smaData.map((point, i) => ({
            time: point.time,
            value: point.value * 0.4 + (emaData[i]?.value || 0) * 0.6,
          }));
        };
      }

      // Example: RSI-based strategy
      if (script.includes("rsi")) {
        const rsiPeriod = this.extractParam(script, "rsi");

        return (bars: Candle[]) => {
          const rsiData = this.calculateRSI(bars, rsiPeriod);
          return rsiData.map((point) => ({
            time: point.time,
            value: point.value,
          }));
        };
      }

      return null;
    } catch (error) {
      console.error("Failed to parse custom calculation:", error);
      return null;
    }
  }

  /** Extract parameter value from function call */
  private extractParam(script: string, funcName: string): number {
    const regex = new RegExp(`${funcName}\\([^)]*?(\\w+)\\s*=\\s*(\\d+)`);
    const match = regex.exec(script);
    return match ? parseInt(match[2]) : 9;
  }

  /** Calculate RSI manually for custom calculations */
  private calculateRSI(
    bars: Candle[],
    period: number,
  ): Array<{ time: number; value: number }> {
    if (bars.length < period + 1) return [];

    const result: Array<{ time: number; value: number }> = [];
    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = bars[i].close - bars[i - 1].close;
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Calculate RSI for remaining bars
    for (let i = period; i < bars.length; i++) {
      const change = bars[i].close - bars[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);

      result.push({
        time: bars[i].time,
        value: rsi,
      });
    }

    return result;
  }
}

// Singleton instance
export const scriptParser = new ScriptParser();
