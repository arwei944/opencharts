import { useEffect } from "react";
import { fetchDepth, fetchPremium, fetchTicker, fetchWatch } from "./api";
import { cancelHistory, compareRef, ensureCompleteHistory } from "./history";
import { useTerminal } from "./store";
import type { Candle, Interval } from "./types";

const WS_BASES = [
  "wss://data-stream.binance.vision/stream",
  "wss://stream.binance.com:9443/stream",
  "wss://stream.binance.us:9443/stream",
  "wss://fstream.binance.com/stream",
];

function parseKline(data: Record<string, unknown>): Candle | null {
  const k = (data.k ?? data) as Record<string, string | boolean | number>;
  if (k.t == null) return null;
  return {
    time: Math.floor(Number(k.t) / 1000),
    open: Number(k.o),
    high: Number(k.h),
    low: Number(k.l),
    close: Number(k.c),
    volume: Number(k.v),
    closed: Boolean(k.x),
  };
}

export function useMarketFeed() {
  const symbol = useTerminal((s) => s.symbol);
  const interval = useTerminal((s) => s.interval);
  const market = useTerminal((s) => s.market);
  const watchSymbols = useTerminal((s) => s.watchSymbols);
  const panes = useTerminal((s) => s.panes);
  const compareSymbols = useTerminal((s) => s.compareSymbols);

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
          if (!dead) useTerminal.getState().setPremium(p.mark, p.funding, p.next);
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
    const extraIv = [...new Set(panes.filter((p) => p.interval !== interval).map((p) => p.interval))];
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
    let closed = false;
    let host = 0;

    const handle = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as { stream?: string; data?: unknown };
        const stream = msg.stream ?? "";
        const data = (msg.data ?? msg) as Record<string, unknown>;
        if (stream.includes("@kline_") || (data.e === "kline" && data.k)) {
          const bar = parseKline(data);
          if (!bar) return;
          const [streamSymRaw, rest] = stream.split("@");
          const streamSym = (streamSymRaw || symbol).toUpperCase();
          const iv = (rest?.replace("kline_", "") || interval) as Interval;
          if (streamSym === symbol && iv === interval) {
            useTerminal.getState().updateBar(bar);
            const t = useTerminal.getState().ticker;
            if (t) {
              useTerminal.getState().setTicker({
                ...t,
                last: bar.close,
                high: Math.max(t.high, bar.high),
                low: Math.min(t.low, bar.low),
                change: bar.close - t.open,
                changePct: t.open ? ((bar.close - t.open) / t.open) * 100 : t.changePct,
              });
            }
            return;
          }
          if (streamSym === symbol) {
            const pane = useTerminal.getState().panes.find((p) => p.interval === iv && p.id !== "p0");
            if (pane) useTerminal.getState().updatePaneBar(pane.id, bar);
            return;
          }
          if (useTerminal.getState().compareSymbols.includes(streamSym)) {
            useTerminal.getState().updateCompareBar(streamSym, bar);
          }
        } else if (stream.includes("@depth") || data.bids || data.b) {
          const bids = ((data.b ?? data.bids) as string[][] | undefined)?.map(([p, q]) => ({
            price: Number(p),
            qty: Number(q),
          }));
          const asks = ((data.a ?? data.asks) as string[][] | undefined)?.map(([p, q]) => ({
            price: Number(p),
            qty: Number(q),
          }));
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

    const open = () => {
      const base = WS_BASES[host % WS_BASES.length];
      ws = new WebSocket(base + query);
      ws.onopen = () => useTerminal.getState().setLive(true);
      ws.onclose = () => {
        useTerminal.getState().setLive(false);
        if (!closed) {
          host += 1;
          retry = setTimeout(open, 800);
        }
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = handle;
    };
    open();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [symbol, interval, market, panes.map((p) => p.interval).join("|"), compareSymbols.join("|")]);
}
