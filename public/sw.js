/**
 * Service Worker for Offline AI Urdu Advice Companion
 * Developed by Waseem Asif
 * Version: 4.0.0 (Auto-purging stale cache, Network-First for core scripts)
 */

const CACHE_NAME = 'urdu-ai-v4.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.svg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './pwa-maskable-512x512.png',
  './apple-touch-icon.png'
];

// Force immediate activation
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Precache partial fallback:', err);
      });
    })
  );
});

// Purge any and all legacy caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME && !k.startsWith('urdu_ai_offline_v')) {
            console.log('[SW] Purging outdated cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First with Cache fallback for app scripts & HTML
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests or server API proxy routes
  if (event.request.method !== 'GET' || url.protocol.startsWith('chrome-extension') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-First strategy for core app shell files to ensure GitHub updates reflect immediately
  if (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('/')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html').then((h) => h || caches.match('./'));
            }
            return new Response('Offline content unavailable', { status: 408, statusText: 'Offline' });
          });
        })
    );
    return;
  }

  // Cache-First with Network fallback for fonts, icons & images
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((netRes) => {
        if (netRes && netRes.status === 200) {
          const clone = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return netRes;
      }).catch(() => new Response('', { status: 408, statusText: 'Offline' }));
    })
  );
});
