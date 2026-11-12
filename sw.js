// 公開のたびに CACHE の番号を上げること（古いキャッシュを確実に置き換えるため）
const CACHE = "qr-reader-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./vendor/jsQR.js",
  "./vendor/zxing/es/reader/index.js",
  "./vendor/zxing/es/share.js",
  "./vendor/zxing-wasm-data.js",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // ページ遷移はまずネットワーク（更新を取りこぼさない）、ダメならキャッシュ
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
