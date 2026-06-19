const CACHE_NAME = "sbg-punching-v21";
const APP_SHELL = [
  "css/admin.css",
  "js/admin.js",
  "manifest.webmanifest",
  "404.html",
  "assets/logo.png",
  "assets/images/og-industrial.svg",
  "assets/videos/admin-storm-background.gif"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  // Delete ALL old caches including v17, v18
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        console.log("[SW] Deleting cache:", key);
        return caches.delete(key);
      }))
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

  // NEVER cache HTML — always fetch fresh from network
  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for static assets (css, js, images)
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => new Response("", { status: 408 })))
  );
});
