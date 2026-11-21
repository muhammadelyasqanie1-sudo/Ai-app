/**
 * AFG AI service worker — offline shell + runtime caching.
 * Strategy:
 *  - App shell + static assets: cache-first, revalidate in background.
 *  - API GETs: network-first with cache fallback (read-only endpoints).
 *  - Chat streams and auth: never cached.
 */
const CACHE = "afg-ai-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  // Never cache auth, chat streams, uploads, admin APIs
  if (url.pathname.startsWith("/api/chat") || url.pathname.startsWith("/api/auth") ||
      url.pathname.startsWith("/api/admin") || url.pathname.startsWith("/api/files")) return;

  if (url.pathname.startsWith("/api/")) {
    // Network-first for other APIs
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || new Response(JSON.stringify({ error: { code: "OFFLINE", message: "Offline" } }), { status: 503, headers: { "Content-Type": "application/json" } })))
    );
    return;
  }

  // Cache-first for shell + static assets
  event.respondWith(
    caches.match(event.request).then((hit) => {
      const fetching = fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone)).catch(() => undefined);
          return res;
        })
        .catch(() => hit);
      return hit || fetching;
    })
  );
});
