// sw.js — minimal offline app-shell cache. Bluetooth obviously won't work offline; this
// only makes the UI itself load instantly / without a network round-trip once visited.
// Deliberately doesn't cache the Tailwind/Chart.js CDN scripts referenced from index.html —
// cross-origin opaque responses are unreliable to pre-cache with cache.addAll (one failure
// fails the whole install), and the browser's normal HTTP cache handles those fine already.
const CACHE_NAME = "ecu-reader-shell-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./js/fieldMap.js",
  "./js/bitUtils.js",
  "./js/decoder.js",
  "./js/ble.js",
  "./js/history.js",
  "./js/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});
