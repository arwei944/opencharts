import { useTerminal } from "@/lib/market/store";
import { useConnection } from "@/lib/market/selectors";
import { lineageSummary } from "@/lib/market/lineage";
import { fmtPx } from "@/lib/utils";
import { Modal } from "./Modal";

const HOST_LABEL: Record<string, string> = {
  "wss://data-stream.binance.vision/stream": "Binance 主站 (vision)",
  "wss://stream.binance.com:9443/stream": "Binance 主站",
  "wss://stream.binance.us:9443/stream": "Binance US",
  "wss://fstream.binance.com/stream": "Binance 合约",
};

/**
 * Feed-health panel: connection state, active source host, reconnect count,
 * last-message age and data-integrity warnings (gap list: multi-source
 * availability / health panel).
 */
export function HealthPanel() {
  const open = useTerminal((s) => s.healthOpen);
  const conn = useConnection();
  const feedStats = useTerminal((s) => s.feedStats);
  const dataWarnings = useTerminal((s) => s.dataWarnings);
  const market = useTerminal((s) => s.market);
  const symbol = useTerminal((s) => s.symbol);
  const interval = useTerminal((s) => s.interval);
  const okxLive = useTerminal((s) => s.okxLive);
  const okxLast = useTerminal((s) => s.okxLast);
  const barsLen = useTerminal((s) => s.bars.length);
  const paneBarsMap = useTerminal((s) => s.paneBars);
  const compareBarsMap = useTerminal((s) => s.compareBars);
  const dataLineage = useTerminal((s) => s.dataLineage);
  const paneLens = Object.values(paneBarsMap).map((b) => b.length);
  const compareLens = Object.values(compareBarsMap).map((b) => b.length);
  if (!open) return null;

  const masterKey = `${market}:${symbol}:${interval}`;
  const lineage = lineageSummary(dataLineage[masterKey]);

  const ageMs = feedStats.lastMsgAt ? Date.now() - feedStats.lastMsgAt : null;
  const hostName =
    HOST_LABEL[feedStats.base] ||
    feedStats.base ||
    (market === "usdm" ? "合约源" : "现货源");
  const connText =
    conn === "live"
      ? "实时"
      : conn === "degraded"
        ? "降级/重连中"
        : conn === "offline"
          ? "离线"
          : "连接中";
  const connColor =
    conn === "live" ? "bg-up" : conn === "degraded" ? "bg-gold" : "bg-down";

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-center justify-between border-b border-border px-3 py-2 last:border-0">
      <span className="text-subtle">{k}</span>
      <span className="font-mono text-fg">{v}</span>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => useTerminal.getState().setHealthOpen(false)}
      labelledBy="health-dialog"
    >
      <div className="p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <h2 id="health-dialog" className="text-sm font-semibold text-fg">
            行情健康面板
          </h2>
          <button
            type="button"
            onClick={() => useTerminal.getState().setHealthOpen(false)}
            className="rounded-sm px-2 py-1 text-micro text-muted hover:bg-surface hover:text-fg"
          >
            关闭
          </button>
        </div>
        <div className="py-1">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className={`size-2 rounded-full ${connColor}`} />
            <span className="text-sm text-fg">{connText}</span>
            {ageMs != null && (
              <span className="ml-auto text-[10px] text-subtle">
                最后行情 {(ageMs / 1000).toFixed(0)}s 前
              </span>
            )}
          </div>
          {row("当前数据源", hostName)}
          {row("源索引 / 总源数", `${feedStats.hostIndex} / 4（自动轮换）`)}
          {row(
            "OKX 副流（并发双源）",
            okxLive
              ? okxLast
                ? `在线 · ${fmtPx(okxLast.close)}`
                : "在线"
              : "离线（自动重连）",
          )}
          {row("跨源偏差告警 (>1%)", String(dataWarnings.skew))}
          {row("重连次数", String(feedStats.reconnects))}
          {row("行情缺口 (根)", String(dataWarnings.gaps))}
          {row("异常 tick 过滤", String(dataWarnings.anomalies))}
          {row("备份源", "OKX REST 备源（历史/深度降级时自动切换）")}
          {row("内存驻留（主图）", `${barsLen.toLocaleString()} 根`)}
          {row(
            "数据来源构成",
            lineage.total > 0
              ? `WS ${lineage.ws.toLocaleString()} · REST ${lineage.rest.toLocaleString()} · 缓存 ${lineage.cache.toLocaleString()}`
              : "—",
          )}
          {row(
            "OKX 副流 tick 数",
            lineage.okx > 0 ? lineage.okx.toLocaleString() : "—",
          )}
          {row(
            "内存驻留（副图合计）",
            `${paneLens.reduce((a, b) => a + b, 0).toLocaleString()} 根（${paneLens.length} 面板）`,
          )}
          {row(
            "内存驻留（对比线）",
            `${compareLens.reduce((a, b) => a + b, 0).toLocaleString()} 根`,
          )}
        </div>
        <p className="border-t border-border px-3 py-2 text-[10px] text-subtle">
          心跳看门狗 20s 无消息自动重连；断线指数退避（上限 30s）。异常 tick
          已被过滤，不会进入图表。
        </p>
      </div>
    </Modal>
  );
}
