/* =====================================================
 *  Service worker — офлайн-режим.
 *  После первого открытия сайта все файлы кэшируются,
 *  и сбор кодов работает без интернета.
 *
 *  ВАЖНО при обновлении файлов на GitHub Pages:
 *  увеличьте версию кэша (palety-v2, palety-v3 …),
 *  иначе ТСД может показывать старую версию.
 * ===================================================== */

const CACHE_NAME = 'palety-v2';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(LOCAL_ASSETS);
      // Библиотеку с чужого домена кэшируем отдельно (opaque-ответ)
      await Promise.all(CDN_ASSETS.map(async (url) => {
        try {
          const resp = await fetch(url, { mode: 'no-cors' });
          if (resp && (resp.ok || resp.type === 'opaque')) await cache.put(url, resp);
        } catch (err) { /* без интернета при первой установке — не критично */ }
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
