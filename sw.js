/* E-Hentai 瀑布流查看器 - Service Worker (PWA) */
const CACHE_NAME = "ehwv-wf-v2";
const urlsToCache = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // 只处理同源 GET；跨源请求（ehwv / hath）不拦截
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  // 静态资源用 network-first（保证部署更新即时生效），回退缓存
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok && new URL(req.url).pathname !== "/s/") {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
