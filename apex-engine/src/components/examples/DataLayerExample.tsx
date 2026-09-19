/**
 * Data Layer 完整示例 - 使用内置 Binance 数据源
 */
import { ApexChart } from "../ApexChart";
import type { Candle, Market, Interval } from "../../lib/market/types";

export function DataLayerExample() {
  return (
    <div className="h-[700px] w-full border rounded-lg overflow-hidden bg-gray-900">
      <ApexChart
        // 基础配置
        symbol="BTCUSDT"
        market="spot" as Market
        interval="15m" as Interval
        
        // 主题
        theme="dark"
        
        // 指标
        indicators={[
          { id: "ma-7", kind: "MA", params: [7], visible: true },
          { id: "ma-25", kind: "MA", params: [25], visible: true },
        ]}
        
        // 图表设置
        settings={{
          barSpacing: 8,
          crosshairWidth: 2,
          priceScaleMargins: [0.06, 0.2],
          volumeHeight: 0.25,
        }}
        
        // 错误处理
        onError={(error) => {
          console.error("Chart error:", error.message);
        }}
        
        // 加载完成回调
        onLoad={(api, dataProvider) => {
          console.log("Chart loaded!");
          console.log("Data provider ready:", dataProvider);
          
          // 可以在这里执行自定义逻辑
          setTimeout(() => {
            api.timeScale().scrollToPosition(0, 0);
          }, 100);
        }}
        
        // 事件回调
        onSymbolChange={(symbol, market) => {
          console.log(`Switched to ${symbol} on ${market}`);
        }}
        
        onIntervalChange={(interval) => {
          console.log(`Changed to ${interval} interval`);
        }}
        
        // 卸载清理
        onDestroy={() => {
          console.log("Chart destroyed");
        }}
      />
    </div>
  );
}

// 进阶用法：使用自定义 providers
export function AdvancedDataLayerExample() {
  return (
    <div className="h-[800px] w-full border rounded-lg overflow-hidden bg-gray-900 p-4">
      <div className="mb-4 flex gap-4 text-white">
        <p className="text-sm text-gray-400">
          这个示例展示了完整的 DataAggregator 集成：
        </p>
      </div>
      
      <ApexChart
        symbol="ETHUSDT"
        providerOptions={{
          enableCache: true,
          cacheConfig: {
            maxEntries: 15,
            expirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
          },
          restApiConfig: {
            timeoutMs: 10000,
            retryAttempts: 3,
            spotHosts: ['https://api.binance.com'],
            futureHosts: ['https://fapi.binance.com'],
          },
          wsConfig: {
            heartbeatMs: 30000,
            reconnectDelayMs: 2000,
            maxReconnectAttempts: 10,
          },
          fallbackToMock: false, // 生产环境建议关闭
        }}
        indicators={[
          { kind: "BOLL", params: [20, 2] },
          { kind: "RSI", params: [14] },
          { kind: "VOL", params: [] },
        ]}
        onLoad={(api) => {
          console.log("Chart with custom provider loaded");
        }}
      />
    </div>
  );
}

// Mock 模式（仅用于测试）
export function MockDataExample() {
  return (
    <div className="h-[600px] w-full border rounded-lg overflow-hidden bg-gray-900">
      <ApexChart
        symbol="DOGEUSDT"
        providerOptions={{
          enableCache: true,
          fallbackToMock: true, // 启用模拟数据
        }}
        theme="light"
        chartType="line"
      />
    </div>
  );
}
