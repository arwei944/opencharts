import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export type Locale = "zh" | "en";

type TranslationKey =
  | "app.name"
  | "market.spot"
  | "market.usdm"
  | "status.live"
  | "status.reconnect"
  | "status.offline"
  | "status.connecting"
  | "chart.settings"
  | "chart.close"
  | "chart.indicator"
  | "chart.volume"
  | "chart.inverted"
  | "chart.layout"
  | "chart.compare"
  | "chart.screenshot"
  | "chart.csv"
  | "chart.fit"
  | "chart.undo"
  | "chart.redo"
  | "chart.tp"
  | "chart.sl"
  | "chart.qty"
  | "chart.buy"
  | "chart.sell"
  | "chart.range"
  | "chart.custom"
  | "chart.added"
  | "order.submitted"
  | "order.balance"
  | "order.position"
  | "order.enterQty"
  | "search.placeholder"
  | "watchlist.title"
  | "trades.title"
  | "book.title"
  | "settings.title"
  | "settings.mousePan"
  | "settings.timeAxis"
  | "settings.reset"
  | "settings.cancel"
  | "settings.save";

const dict: Record<Locale, Record<TranslationKey, string>> = {
  zh: {
    "app.name": "OpenCharts",
    "market.spot": "现货",
    "market.usdm": "U本位",
    "status.live": "实时",
    "status.reconnect": "重连中",
    "status.offline": "离线",
    "status.connecting": "连接中",
    "chart.settings": "图表设置",
    "chart.close": "关闭",
    "chart.indicator": "指标",
    "chart.volume": "成交量",
    "chart.inverted": "倒垂",
    "chart.layout": "布局",
    "chart.compare": "对比",
    "chart.screenshot": "截图",
    "chart.csv": "CSV",
    "chart.fit": "自适应",
    "chart.undo": "撤销",
    "chart.redo": "重做",
    "chart.tp": "止盈",
    "chart.sl": "止损",
    "chart.qty": "数量",
    "chart.buy": "买入",
    "chart.sell": "卖出",
    "chart.range": "区间",
    "chart.custom": "自定义",
    "chart.added": "已添加",
    "order.submitted": "已提交",
    "order.balance": "余额不足",
    "order.position": "持仓不足",
    "order.enterQty": "请输入数量",
    "search.placeholder": "搜索交易对，例如 ETH",
    "watchlist.title": "自选",
    "trades.title": "成交",
    "book.title": "盘口",
    "settings.title": "图表设置",
    "settings.mousePan": "鼠标拖拽灵敏度",
    "settings.timeAxis": "时间轴 / 拖拽",
    "settings.reset": "恢复默认",
    "settings.cancel": "取消",
    "settings.save": "保存",
  },
  en: {
    "app.name": "OpenCharts",
    "market.spot": "Spot",
    "market.usdm": "USD-M",
    "status.live": "Live",
    "status.reconnect": "Reconnecting",
    "status.offline": "Offline",
    "status.connecting": "Connecting",
    "chart.settings": "Chart Settings",
    "chart.close": "Close",
    "chart.indicator": "Indicators",
    "chart.volume": "Volume",
    "chart.inverted": "Invert",
    "chart.layout": "Layout",
    "chart.compare": "Compare",
    "chart.screenshot": "Screenshot",
    "chart.csv": "CSV",
    "chart.fit": "Fit",
    "chart.undo": "Undo",
    "chart.redo": "Redo",
    "chart.tp": "Take Profit",
    "chart.sl": "Stop Loss",
    "chart.qty": "Qty",
    "chart.buy": "Buy",
    "chart.sell": "Sell",
    "chart.range": "Range",
    "chart.custom": "Custom",
    "chart.added": "Added",
    "order.submitted": "Submitted",
    "order.balance": "Insufficient balance",
    "order.position": "Insufficient position",
    "order.enterQty": "Enter quantity",
    "search.placeholder": "Search pair, e.g. ETH",
    "watchlist.title": "Watchlist",
    "trades.title": "Trades",
    "book.title": "Order Book",
    "settings.title": "Chart Settings",
    "settings.mousePan": "Mouse drag sensitivity",
    "settings.timeAxis": "Time axis / Drag",
    "settings.reset": "Reset",
    "settings.cancel": "Cancel",
    "settings.save": "Save",
  },
};

interface I18nCtxValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (k: TranslationKey) => string;
}

const Ctx = createContext<I18nCtxValue>({
  locale: "zh",
  setLocale: () => {},
  t: (k) => dict.zh[k],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const t = (k: TranslationKey) => dict[locale][k];
  return (
    <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  return useContext(Ctx);
}
