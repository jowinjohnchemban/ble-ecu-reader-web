// sw.js — minimal offline app-shell cache. Bluetooth obviously won't work offline; this
// only makes the UI itself load instantly / without a network round-trip once visited.
// Deliberately doesn't cache the Tailwind/Chart.js CDN scripts referenced from index.html —
// cross-origin opaque responses are unreliable to pre-cache with cache.addAll (one failure
// fails the whole install), and the browser's normal HTTP cache handles those fine already.
const CACHE_NAME = "ecu-reader-shell-v4";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./js/main.js",
  "./js/core/fieldMap.js",
  "./js/core/bitUtils.js",
  "./js/core/download.js",
  "./js/core/RegisterReader.js",
  "./js/core/AudioAlerts.js",
  "./js/core/TelemetryDecoder.js",
  "./js/core/BleConnection.js",
  "./js/core/GaugeRenderer.js",
  "./js/core/FieldHistory.js",
  "./js/core/MultiFieldChart.js",
  "./js/state/AppState.js",
  "./js/components/Component.js",
  "./js/components/ToastManager.js",
  "./js/components/ConnectionBar.js",
  "./js/components/TabBar.js",
  "./js/components/DashboardPanel.js",
  "./js/components/GaugesPanel.js",
  "./js/components/AlertsPanel.js",
  "./js/components/HistoryPanel.js",
  "./js/components/RegisterPanelBase.js",
  "./js/components/VehicleInfoPanel.js",
  "./js/components/LogsPanel.js",
  "./js/components/FotaPanel.js",
  "./js/components/FullScanPanel.js",
  "./js/components/ExplorePanel.js",
  "./js/components/RawFramesPanel.js",
  "./js/components/FieldMapEditorPanel.js",
  "./js/components/SettingsPanel.js",
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
