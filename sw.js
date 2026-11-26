const CACHE_NAME = 'holaspeak-shell-v24';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './pwa.js',
  './astryx-ui.js',
  './src/hola-client.js',
  './src/firebase-backend.js',
  './src/progression.js',
  './src/hola-audio.js',
  './src/hola-features.js',
  './src/course-content.js',
  './astryx-css-import.js',
  './src/astryx-themes.js',
  './src/themes/hola/hola.js',
  './src/themes/hola/hola.css',
  './tts-config.js',
  './manifest.webmanifest',
  './icons/favicon.png',
  './assets/mascot/hola-bull-happy-web.png',
  './icons/hola-192.png',
  './icons/hola-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map(path => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('holaspeak-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache identity, private progress or assessments, even on a same-origin API.
  if (request.headers.has('Authorization') || /\/(auth|me|progress|assessments|synthesize)(\/|$)/.test(url.pathname)) return;
  if (request.cache === 'no-store' || request.cache === 'reload') return;

  // Revalidate executable modules together on each online load. Cache-first JS
  // can mix an updated entry with an older module that lacks a named export.
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-cache' }))
        .then(async response => {
          if (response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put(request, response.clone()); }
          return response;
        })
        .catch(async () => { const cached = await caches.match(request); if (cached) return cached; return Response.error(); }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }),
  );
});
