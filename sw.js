/* Service worker: оболочка приложения работает офлайн. */
const VERSION = 'skinlab-v5';
const SHELL = [
  '/',
  '/index.html',
  '/shared/base.css',
  '/assets/fonts/fonts.css',
  '/shared/data.js',
  '/shared/engine.js',
  '/shared/content.js',
  '/shared/schedule.js',
  '/shared/pwa.js',
  '/shared/icons.js',
  '/shared/quiz.js',
  '/shared/guide.js',
  '/manifest.webmanifest',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Навигация: сеть в приоритете, кэш как запасной вариант.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Статика: сеть в приоритете, кэш — запасной вариант офлайна.
  // Так свежие стили и скрипты появляются сразу, без «залипшего» кэша.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request))
  );
});
