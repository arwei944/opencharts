/**
 * 进阶示例 - 自定义配置和数据供应
 */
import { ApexChart } from "../ApexChart";
import type { Candle, IndicatorInst } from "../../lib/market/types";

export function AdvancedExample() {
  // 模拟 API 调用
  const mockGetBars = async (symbol: string, market: string, interval: string): Promise<Candle[]> => {
    // 这里替换为你的真实 API
    const bars: Candle[] = [];
    let time = Date.now() / 1000 - 1000 * 60 * 60 * 24; // 倒退 24 小时
    for (let i = 0; i < 1000; i++) {
      bars.push({
        time,
        open: 50000 + Math.random() * 10000,
        high: 51000 + Math.random() * 10000,
        low: 49000 + Math.random() * 10000,
        close: 50500 + Math.random() * 10000,
        volume: Math.random() * 1000,
      });
      time += 60 * 15; // 15 分钟
    }
    return bars.reverse();
  };

  const indicators: IndicatorInst[] = [
    { id: "ma-7", kind: "MA", params: [7], visible: true },
    { id: "ma-25", kind: "MA", params: [25], visible: true },
    { id: "rsi-14", kind: "RSI", params: [14], visible: true },
  ];

  return (
    <div className="h-[700px] w-full border rounded-lg overflow-hidden">
      <ApexChart
        symbol="ETHUSDT"
        interval="1h"
        chartType="candle"
        theme="dark"
        indicators={indicators}
        settings={{
          barSpacing: 10,
          crosshairWidth: 2,
          priceScaleMargins: [0.05, 0.15],
        }}
        dataProvider={{
          getBars: mockGetBars,
          subscribeTick: (symbol, market, callback) => {
            // 订阅实时 tick
            const interval = setInterval(() => {
              const lastClose = 50000 + Math.random() * 10000;
              callback({
                time: Date.now() / 1000,
                open: lastClose,
                high: lastClose + Math.random() * 100,
                low: lastClose - Math.random() * 100,
                close: lastClose + (Math.random() - 0.5) * 200,
                volume: Math.random() * 1000,
              });
            }, 1000);
            return () => clearInterval(interval);
          },
        }}
        onSymbolChange={(symbol, market) => {
          console.log("切换标的:", symbol, market);
        }}
        onIntervalChange={(interval) => {
          console.log("切换周期:", interval);
        }}
        onLoad={(chartApi) => {
          console.log("图表已加载", chartApi);
        }}
        onError={(error) => {
          console.error("图表错误:", error);
        }}
      />
    </div>
  );
}
