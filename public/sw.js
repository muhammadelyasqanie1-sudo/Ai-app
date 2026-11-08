const CACHE_NAME = 'afg-ai-shell-v4';
const CACHE_PREFIX = 'afg-ai-shell-';
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/afg-ai-icon.svg'];
const CACHEABLE_ASSET = /\.(?:js|mjs|css|wasm|woff2?|ttf|otf|svg|png|webp|jpe?g|avif)$/i;

async function cacheBuildAssets(cache) {
  try {
    const response = await fetch('/.vite/manifest.json', { cache: 'no-store' });
    if (!response.ok) return;
    const manifest = await response.json();
    const assets = new Set();
    const visited = new Set();
    const visit = (key) => {
      if (visited.has(key)) return;
      visited.add(key);
      const entry = manifest[key];
      if (!entry) return;
      if (typeof entry.file === 'string') assets.add(entry.file);
      for (const file of [...(entry.css || []), ...(entry.assets || [])]) if (typeof file === 'string') assets.add(file);
      for (const dependency of [...(entry.imports || []), ...(entry.dynamicImports || [])]) visit(dependency);
    };
    Object.keys(manifest).forEach(visit);
    await Promise.all([...assets].slice(0, 400).map(async (asset) => {
      const url = new URL(asset.startsWith('/') ? asset : '/' + asset, self.location.origin);
      if (url.origin !== self.location.origin || !CACHEABLE_ASSET.test(url.pathname)) return;
      try {
        const file = await fetch(url.href, { cache: 'reload' });
        if (file.ok && file.type === 'basic') await cache.put(url.href, file);
      } catch { /* A single optional asset must not block PWA installation. */ }
    }));
  } catch { /* Older deployments may not have a Vite asset manifest. */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_URLS.map(async (path) => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (response.ok) await cache.put(path, response);
      } catch { /* Continue with the available shell. */ }
    }));
    await cacheBuildAssets(cache);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put('/index.html', response.clone());
        return response;
      } catch {
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (request.destination && ['script', 'style', 'worker', 'font', 'image'].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const refresh = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') void cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      return cached || (await refresh) || Response.error();
    })());
  }
});