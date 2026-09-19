// Existing types... (keep all existing exports)

// New type-safe error handling
export class ApexChartError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApexChartError";
    this.code = code;
    this.details = details;
  }
}

// Type validation helpers
export const VALID_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT"] as const;
export const VALID_INTERVALS = [
  "1s" as const,
  "1m" as const,
  "3m" as const,
  "5m" as const,
  "15m" as const,
  "30m" as const,
  "1h" as const,
  "2h" as const,
  "4h" as const,
  "6h" as const,
  "8h" as const,
  "12h" as const,
  "1d" as const,
  "3d" as const,
  "1w" as const,
  "1M" as const,
] as const;

export function isValidSymbol(symbol: string): boolean {
  return VALID_SYMBOLS.some((s) => symbol.toUpperCase().includes(s));
}

export function isValidInterval(interval: string): boolean {
  return VALID_INTERVALS.includes(interval as any);
}

// Props validation result
export interface ValidationErrors {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

export function validateApexChartProps(
  props: Record<string, unknown>
): ValidationErrors {
  const errors: Array<{ field: string; message: string }> = [];

  if (props.symbol && typeof props.symbol === "string") {
    const symbol = props.symbol as string;
    if (!isValidSymbol(symbol)) {
      errors.push({
        field: "symbol",
        message: `${symbol} is not a valid trading symbol`,
      });
    }
  }

  if (props.interval && typeof props.interval === "string") {
    const interval = props.interval as string;
    if (!isValidInterval(interval)) {
      errors.push({
        field: "interval",
        message: `${interval} is not supported. Valid intervals: ${VALID_INTERVALS.join(", ")}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
