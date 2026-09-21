import { useEffect } from "react";
import {
  OKX_BAR,
  fetchDepth,
  fetchPremium,
  fetchTicker,
  fetchWatch,
  okxInstId,
} from "./api";
import { intervalSec } from "./bars";
import { cancelHistory, compareRef, ensureCompleteHistory } from "./history";
import { parseKline } from "./kline-parser";
import { useTerminal } from "./store";
import { checkBar } from "./validator";
import type { Interval } from "./types";

const WS_BASES = [
  "wss://data-stream.binance.vision/stream",
  "wss://stream.binance.com:9443/stream",
  "wss://stream.binance.us:9443/stream",
  "wss://fstream.binance.com/stream",
];

/**
 * Single-slot socket pool: when a feed effect tears down (symbol/interval
 * switch), a still-open socket is parked here instead of being closed, so
 * switching back to the same symbol/interval reuses the live connection with
 * zero handshake latency. Capacity 1 keeps the extra connection budget to one.
 */
let pooledQuery: string | null = null;
let pooledWs: WebSocket | null = null;

function parkSocket(query: string, ws: WebSocket) {
  if (
    pooledWs &&
    pooledWs !== ws &&
    (pooledWs.readyState === WebSocket.OPEN ||
      pooledWs.readyState === WebSocket.CONNECTING)
  ) {
    pooledWs.close();
  }
  pooledQuery = query;
  pooledWs = ws;
}

function takePooledSocket(query: string): WebSocket | null {
  if (!pooledWs || pooledQuery !== query) return null;
  if (pooledWs.readyState !== WebSocket.OPEN) {
    pooledWs = null;
    pooledQuery = null;
    return null;
  }
  const ws = pooledWs;
  pooledWs = null;
  pooledQuery = null;
  return ws;
}

export function useMarketFeed() {
  const symbol = useTerminal((s) => s.symbol);
  const interval = useTerminal((s) => s.interval);
  const market = useTerminal((s) => s.market);
  const watchSymbols = useTerminal((s) => s.watchSymbols);
  const panes = useTerminal((s) => s.panes);
  const compareSymbols = useTerminal((s) => s.compareSymbols);
  // Derived stream identities: panes/compareSymbols are only read to build the
  // stream list, so these strings are the real effect dependencies.
  const paneIntervalsKey = panes.map((p) => p.interval).join("|");
  const compareKey = compareSymbols.join("|");

  useEffect(() => {
    let dead = false;
    useTerminal.getState().setLive(false);
    // Candles are filled by the background history engine (each pane drives its
    // own), so this effect only owns the panel data that has no fill job.
    (async () => {
      try {
        const [ticker, depth] = await Promise.all([
          fetchTicker({ data: { symbol, market } }),
          fetchDepth({ data: { symbol, market } }),
        ]);
        if (dead) return;
        useTerminal.getState().setTicker(ticker);
        useTerminal.getState().setBook(depth.bids, depth.asks);
        if (market === "usdm") {
          const p = await fetchPremium({ data: { symbol } });
          if (!dead)
            useTerminal.getState().setPremium(p.mark, p.funding, p.next);
        }
      } catch {
        if (!dead) useTerminal.getState().setLive(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [symbol, market]);

  useEffect(() => {
    const refs = compareSymbols.map((sym) => compareRef(sym, market, interval));
    refs.forEach(ensureCompleteHistory);
    return () => refs.forEach((r) => cancelHistory(r.jobKey));
  }, [compareSymbols, interval, market]);

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetchWatch({ data: { symbols: watchSymbols, market } })
        .then((w) => {
          if (!dead) useTerminal.getState().setWatch(w);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [watchSymbols, market]);

  useEffect(() => {
    const sym = symbol.toLowerCase();
    const extraIv = [
      ...new Set(
        panes.filter((p) => p.interval !== interval).map((p) => p.interval),
      ),
    ];
    const streams = [
      `${sym}@kline_${interval}`,
      `${sym}@depth20@100ms`,
      `${sym}@trade`,
      `${sym}@ticker`,
      ...extraIv.map((iv) => `${sym}@kline_${iv}`),
      ...compareSymbols.map((c) => `${c.toLowerCase()}@kline_${interval}`),
    ];
    const query = `?streams=${streams.join("/")}`;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let abandoned = false;
    let host = 0;
    let attempts = 0;
    let lastMsgAt = Date.now();

    const handle = (ev: MessageEvent) => {
      lastMsgAt = Date.now();
      useTerminal.getState().setFeedStats({ lastMsgAt: lastMsgAt });
      try {
        const msg = JSON.parse(ev.data as string) as {
          stream?: string;
          data?: unknown;
        };
        const stream = msg.stream ?? "";
        const data = (msg.data ?? msg) as Record<string, unknown>;
        if (stream.includes("@kline_") || (data.e === "kline" && data.k)) {
          const bar = parseKline(data);
          if (!bar) return;
          const [streamSymRaw, rest] = stream.split("@");
          const streamSym = (streamSymRaw || symbol).toUpperCase();
          const iv = (rest?.replace("kline_", "") || interval) as Interval;
          if (streamSym === symbol && iv === interval) {
            // Data integrity: count missing bars and drop anomalous ticks so
            // feed garbage can never pollute the resident series.
            const st0 = useTerminal.getState();
            const check = checkBar(st0.bars.at(-1), bar, intervalSec(iv));
            if (check.gap > 0 || check.anomaly) {
              st0.reportDataWarning({
                gaps: check.gap,
                anomalies: check.anomaly ? 1 : 0,
              });
            }
            if (check.anomaly) return; // skip the corrupt tick entirely
            useTerminal.getState().updateBar(bar);
            const t = useTerminal.getState().ticker;
            if (t) {
              useTerminal.getState().setTicker({
                ...t,
                last: bar.close,
                high: Math.max(t.high, bar.high),
                low: Math.min(t.low, bar.low),
                change: bar.close - t.open,
                changePct: t.open
                  ? ((bar.close - t.open) / t.open) * 100
                  : t.changePct,
              });
            }
            return;
          }
          if (streamSym === symbol) {
            const pane = useTerminal
              .getState()
              .panes.find((p) => p.interval === iv && p.id !== "p0");
            if (pane) useTerminal.getState().updatePaneBar(pane.id, bar);
            return;
          }
          if (useTerminal.getState().compareSymbols.includes(streamSym)) {
            useTerminal.getState().updateCompareBar(streamSym, bar);
          }
        } else if (stream.includes("@depth") || data.bids || data.b) {
          const bids = ((data.b ?? data.bids) as string[][] | undefined)?.map(
            ([p, q]) => ({
              price: Number(p),
              qty: Number(q),
            }),
          );
          const asks = ((data.a ?? data.asks) as string[][] | undefined)?.map(
            ([p, q]) => ({
              price: Number(p),
              qty: Number(q),
            }),
          );
          if (bids && asks) useTerminal.getState().setBook(bids, asks);
        } else if (stream.includes("@trade") || data.e === "trade") {
          useTerminal.getState().pushTrade({
            id: String(data.t ?? data.a ?? Date.now()),
            price: Number(data.p),
            qty: Number(data.q),
            time: Number(data.T ?? data.E ?? Date.now()),
            isBuyerMaker: Boolean(data.m),
          });
        } else if (stream.includes("@ticker") || data.e === "24hrTicker") {
          const last = Number(data.c);
          const open = Number(data.o);
          useTerminal.getState().setTicker({
            last,
            open,
            high: Number(data.h),
            low: Number(data.l),
            volume: Number(data.v),
            quoteVolume: Number(data.q),
            change: last - open,
            changePct: Number(data.P),
          });
        }
      } catch {
        /* ignore */
      }
    };

    const teardown = () => {
      if (retry) clearTimeout(retry);
      if (heartbeat) clearInterval(heartbeat);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          // Park the live socket for instant reuse on the next switch back,
          // instead of dropping the connection and paying a handshake later.
          parkSocket(query, ws);
        } else if (ws.readyState === WebSocket.CLOSING) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          // Closing a CONNECTING socket makes the browser log
          // "closed before the connection is established". Flag it instead
          // and let onopen close it cleanly once the handshake lands.
          abandoned = true;
        }
      }
      ws = null;
      retry = undefined;
      heartbeat = undefined;
    };

    const open = () => {
      if (closed) return;
      // Switch back to a symbol/interval we just left: reuse its parked socket
      // (still OPEN) instead of reconnecting from scratch.
      const pooled = takePooledSocket(query);
      if (pooled) {
        ws = pooled;
        bindSocket(pooled);
        return;
      }
      const base = WS_BASES[host % WS_BASES.length];
      useTerminal
        .getState()
        .setFeedStats({ hostIndex: host, base, reconnects: attempts });
      let sock: WebSocket | null = null;
      try {
        sock = new WebSocket(base + query);
      } catch {
        scheduleReconnect();
        return;
      }
      ws = sock;
      bindSocket(sock);
    };

    const bindSocket = (sock: WebSocket) => {
      sock.onopen = () => {
        if (abandoned) {
          // Effect was torn down while the handshake was in flight: close
          // THIS socket directly (the closure `ws` was nulled by teardown).
          sock?.close();
          return;
        }
        attempts = 0;
        lastMsgAt = Date.now();
        useTerminal.getState().setLive(true);
        useTerminal.getState().setConn("live");
      };
      sock.onmessage = handle;
      sock.onerror = () => {
        // Let onclose drive the reconnect; keep the socket state honest.
      };
      sock.onclose = (_e) => {
        // A stale socket (from a previous effect run) closing later must NOT
        // flip live=false over a fresh socket that already set it true.
        if (closed) return;
        useTerminal.getState().setLive(false);
        useTerminal.getState().setConn(attempts >= 3 ? "offline" : "degraded");
        host += 1;
        scheduleReconnect();
      };
      // A parked socket is already OPEN when rebinding: mark live immediately.
      if (sock.readyState === WebSocket.OPEN) {
        attempts = 0;
        lastMsgAt = Date.now();
        useTerminal.getState().setLive(true);
        useTerminal.getState().setConn("live");
      }
    };

    /** Exponential backoff with jitter, capped at 30s, forever. */
    const scheduleReconnect = () => {
      if (closed) return;
      if (retry) clearTimeout(retry);
      const delay =
        Math.min(30000, 500 * 2 ** Math.min(attempts, 6)) *
        (0.7 + Math.random() * 0.6);
      attempts += 1;
      retry = setTimeout(open, delay);
    };

    /** Stale-connection watchdog: no message for 20s means the socket died
     * silently (NAT drop, laptop sleep, proxy timeout) — force a reconnect
     * instead of waiting for a close event that may never arrive. */
    const startHeartbeat = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (closed) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastMsgAt > 20000) {
          useTerminal.getState().setLive(false);
          useTerminal.getState().setConn("degraded");
          ws.close();
        }
      }, 5000);
    };

    // Reconnect when the tab comes back: browsers freeze background tabs and
    // the socket is usually dead by the time the user returns.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (
          !ws ||
          ws.readyState !== WebSocket.OPEN ||
          Date.now() - lastMsgAt > 15000
        ) {
          useTerminal.getState().setLive(false);
          useTerminal.getState().setConn("degraded");
          if (ws && ws.readyState === WebSocket.OPEN) ws.close();
          else if (ws && ws.readyState === WebSocket.CONNECTING)
            abandoned = true;
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    open();
    startHeartbeat();
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      teardown();
    };
    // paneIntervalsKey/compareKey are the real identities (the arrays they
    // derive from are only read to build the stream list).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, market, paneIntervalsKey, compareKey]);
}

/**
 * Concurrent OKX kline secondary stream (dual-source aggregation, batch 9).
 * A resident second socket watches the same symbol/interval; the health panel
 * surfaces both sources and the main feed cross-checks OKX closes for skew
 * beyond 1% against Binance bars — garbage ticks get caught by two independent
 * venues instead of one.
 */
export function useOkxCandleFeed() {
  const symbol = useTerminal((s) => s.symbol);
  const interval = useTerminal((s) => s.interval);
  const market = useTerminal((s) => s.market);

  useEffect(() => {
    const bar = OKX_BAR[interval];
    if (!bar || !("WebSocket" in window)) return;
    const instId = okxInstId(symbol, market);
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    // Skew is reported once per bar-time, not on every 200ms tick.
    let lastSkewTime = 0;

    const schedule = () => {
      if (closed) return;
      if (retry) clearTimeout(retry);
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts, 5));
      attempts += 1;
      retry = setTimeout(open, delay);
    };

    function open() {
      if (closed) return;
      try {
        ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        attempts = 0;
        useTerminal.getState().setOkxLive(true);
        ws?.send(
          JSON.stringify({
            op: "subscribe",
            args: [{ channel: `candle${bar}`, instId }],
          }),
        );
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            event?: string;
            data?: Array<{ ts?: string; c?: string }>;
          };
          if (msg.event) return; // subscribe / error / ping acks
          const row = msg.data?.[0];
          if (!row || row.c == null) return;
          const t = Math.floor(Number(row.ts ?? 0) / 1000);
          const close = Number(row.c);
          if (!Number.isFinite(t) || !Number.isFinite(close)) return;
          useTerminal.getState().setOkxLast({ time: t, close });
          // Cross-source check: when OKX and Binance report the same bar,
          // a >1% close gap flags the pair (once per bar).
          const st = useTerminal.getState();
          const last = st.bars.at(-1);
          if (last && Math.abs(last.time - t) <= 30 && t !== lastSkewTime) {
            const skew = Math.abs(close - last.close) / last.close;
            if (skew > 0.01) {
              lastSkewTime = t;
              st.reportDataWarning({ skew: 1 });
            }
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (closed) return;
        useTerminal.getState().setOkxLive(false);
        schedule();
      };
      ws.onerror = () => {
        /* onclose drives reconnect */
      };
    }

    open();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
      ws = null;
      useTerminal.getState().setOkxLive(false);
    };
  }, [symbol, interval, market]);
}
