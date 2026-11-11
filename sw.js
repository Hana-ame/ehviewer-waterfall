/* E-Hentai 瀑布流查看器 - Service Worker (PWA) */
const CACHE_NAME = "ehwv-wf-v1";
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
  // 只缓存同源静态资源（页面/样式/脚本）
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  // 跨源请求（ehwv / hath）不拦截，走网络
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          if (resp.ok && new URL(req.url).pathname !== "/s/") {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
