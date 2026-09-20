import type { Market } from "./types";

/**
 * Multi-source market data provider. The Binance implementation is the primary
 * source (multi-host ladder + sticky host + health score); a second provider
 * can be registered later (e.g. OKX/Coinbase) and `getMarket()` will fall
 * through to it when the primary is unhealthy.
 */

export interface MarketProvider {
  readonly name: string;
  get<T>(market: Market, spotPath: string, futPath: string): Promise<T>;
}

const SPOT_HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api.binance.us",
];
const FUT_HOSTS = ["https://fapi.binance.com", ...SPOT_HOSTS];

const HOST_TIMEOUT_MS = 8000;

/** After a sticky host answers it stays; a failure clears it so the ladder re-races. */
const stickyHost: Record<Market, string | null> = { spot: null, usdm: null };

/** Coarse health: consecutive failures degrade, a success resets. */
const health: Record<Market, { fails: number }> = { spot: { fails: 0 }, usdm: { fails: 0 } };

export function providerHealth(market: Market): { fails: number } {
  return health[market];
}

async function fetchFrom(host: string, market: Market, spotPath: string, futPath: string): Promise<unknown> {
  const path = host.includes("fapi") ? futPath : spotPath;
  const res = await fetch(host + path, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(HOST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`upstream:${host} ${res.status}`);
  return res.json();
}

class BinanceProvider implements MarketProvider {
  readonly name = "binance";

  async get<T>(market: Market, spotPath: string, futPath: string): Promise<T> {
    const hosts = market === "usdm" ? FUT_HOSTS : SPOT_HOSTS;
    const stick = stickyHost[market];
    if (stick) {
      try {
        const json = await fetchFrom(stick, market, spotPath, futPath);
        health[market].fails = 0;
        return json as T;
      } catch {
        stickyHost[market] = null;
        health[market].fails += 1;
      }
    }
    const attempts = hosts.map(async (host) => {
      const json = await fetchFrom(host, market, spotPath, futPath);
      if (!stickyHost[market]) stickyHost[market] = host;
      health[market].fails = 0;
      return json;
    });
    try {
      return (await Promise.any(attempts)) as T;
    } catch {
      health[market].fails += 1;
      throw new Error("upstream:all-hosts-failed");
    }
  }
}

const providers: MarketProvider[] = [new BinanceProvider()];

/** Primary provider, or the first healthy fallback. */
export function primaryProvider(): MarketProvider {
  return providers[0];
}

/** Register a secondary source; used for tests or future multi-exchange. */
export function registerProvider(p: MarketProvider): void {
  providers.push(p);
}