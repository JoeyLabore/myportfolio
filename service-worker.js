/* Service Worker for runtime caching and faster repeat loads */
/* Cache strategy: cache-first for static assets (images/videos/fonts/css/js),
   network-first for HTML. Keeps all assets available while reducing bandwidth on mobile. */

const CACHE_VERSION = 'v2';
const RUNTIME_CACHE = `jg-runtime-${CACHE_VERSION}`;
const SHELL_CACHE = `jg-shell-${CACHE_VERSION}`;

// Minimal app shell to cache on install
const SHELL_ASSETS = [
  './',
  './index.html',
  './nestbank.html',
  './styles.css',
  './main.js',
  './assets/logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== RUNTIME_CACHE && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Helper: limit cache size by deleting oldest entries
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  // Delete oldest entries first
  for (let i = 0; i < keys.length - maxItems; i++) {
    await cache.delete(keys[i]);
  }
}

// Enable navigation preload for faster HTML responses (when supported)
self.addEventListener('activate', (event) => {
  if (self.registration.navigationPreload) {
    event.waitUntil(self.registration.navigationPreload.enable());
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // only cache GET

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Network-first for HTML documents to ensure fresh content
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          // Prefer a fresh network response; avoid caching layers for HTML
          const preloaded = event.preloadResponse ? await event.preloadResponse : null;
          const net = preloaded || await fetch(request, { cache: 'no-store' });
          const cache = await caches.open(SHELL_CACHE);
          if (net && net.ok && net.type === 'basic') {
            cache.put(request, net.clone());
          }
          return net;
        } catch (err) {
          const cache = await caches.open(SHELL_CACHE);
          const match = await cache.match(request);
          return match || caches.match('./index.html');
        }
      })()
    );
    return;
  }

  // Cache-first for static assets (images, videos, css, js, fonts)
  const isStatic = isSameOrigin && (
    url.pathname.startsWith('/assets/') ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|bmp|tiff|mp4|webm|css|js|woff2?|ttf|otf)$/i.test(url.pathname)
  );

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        if (cached) {
          // Stale-while-revalidate: update in background, but return cached immediately
          fetch(request, { credentials: 'same-origin' })
            .then((net) => { if (net && net.ok) cache.put(request, net.clone()); })
            .catch(() => {});
          return cached;
        }
        try {
          const net = await fetch(request, { credentials: 'same-origin' });
          if (net && net.ok) {
            cache.put(request, net.clone());
            trimCache(RUNTIME_CACHE, 120).catch(() => {});
          }
          return net;
        } catch (err) {
          // Fallback to shell cache if available
          const shell = await caches.open(SHELL_CACHE);
          const match = await shell.match(request);
          if (match) return match;
          throw err;
        }
      })()
    );
  }
});
