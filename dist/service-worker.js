const CACHE_NAME = "sbg-punching-v22";
const APP_SHELL = [
  "/",
  "/index.html",
  "/404.html",
  "/manifest.webmanifest",
  "/css/style.css",
  "/css/critical-inline.css",
  "/js/home-config.js",
  "/js/home-bootstrap.js",
  "/assets/logo.png",
  "/img/og-image.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (
    url.pathname === "/admin" ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/.netlify/functions/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/supabase/") ||
    url.pathname.endsWith("/js/config.js") ||
    url.pathname.endsWith("/js/speed-insights.js")
  ) return;

  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (!response || !response.ok || response.type !== "basic") return response;

      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
      return response;
    }).catch(() => new Response("", { status: 408 })))
  );
});
