const CACHE_NAME = 'bounce-universe-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './ui.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  'https://unpkg.com/three@0.160.0/build/three.module.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(APP_SHELL.map(url => cache.add(url).catch(()=>{ /* ignore individual failures, e.g. offline first install */ })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for app shell & the three.js CDN module, network-first fallback for everything else.
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      if(cached) return cached;
      return fetch(req).then(res => {
        if(res && res.status === 200 && (req.url.startsWith(self.location.origin) || req.url.includes('unpkg.com'))){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
