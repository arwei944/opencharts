/* Service Worker: offline-first shell for OpenCharts.
 * Strategy:
 *  - navigation requests -> network-first, fall back to cached copy
 *  - static assets        -> stale-while-revalidate
 *  - market/exchange REST  -> never cached (live data must stay live)
 */
const CACHE = "opencharts-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Live-data hosts and the app API are never cached.
  if (
    url.hostname.includes("binance") ||
    url.hostname.includes("okx") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn/") ||
    url.hostname.includes("fonts.g") ||
    url.hostname.includes("googleapis")
  ) {
    return;
  }

  // Navigation: network first, cached shell as the offline fallback.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req);
          return hit || caches.match("/");
        }),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
