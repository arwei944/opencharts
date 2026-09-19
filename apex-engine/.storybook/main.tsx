import type { Meta, ComponentArgs } from "@storybook/react";

export default {
  title: "Components/ApexChart",
  component: (await import("./components/ApexChart")).ApexChart,
  args: {
    symbol: "BTCUSDT",
    interval: "15m" as const,
    theme: "dark" as const,
    chartType: "candle" as const,
  },
} as Meta;

export const Basic = {} as ComponentArgs;

export const WithIndicators = {
  args: {
    indicators: [
      { kind: "MA", params: [9, 25] },
      { kind: "RSI", params: [14] },
    ],
  },
} as ComponentArgs;

export const LightTheme = {
  args: {
    theme: "light" as const,
  },
} as ComponentArgs;
