/**
 * Server-side helpers for the market serverFns: a small TTL cache with
 * in-flight request coalescing, and a normalized error contract.
 *
 * These run on the server only (created here, used inside createServerFn
 * handlers) — never imported from client components.
 */

const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Simple TTL cache; identical concurrent calls share one promise. */
export async function cacheable<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const queued = inflight.get(key);
  if (queued) return queued as Promise<T>;
  const p = load()
    .then((value) => {
      cache.set(key, { expires: Date.now() + ttlMs, value });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Drop every cached entry (e.g. after a long offline stretch). */
export function clearMarketCache(): void {
  cache.clear();
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResult<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: ApiError;
}

/** Run a handler and normalize any rejection into an { ok:false } result. */
export async function guard<T>(fn: () => Promise<T>): Promise<ApiResult<T> | ApiFailure> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Network/upstream failures are the common case; surface them as
    // "upstream" so callers can decide to retry with backoff.
    return {
      ok: false,
      error: {
        code: message.startsWith("upstream:") ? "upstream" : "unknown",
        message,
      },
    };
  }
}