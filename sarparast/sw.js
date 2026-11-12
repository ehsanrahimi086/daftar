// Offline cache for the supervisor app (/sarparast/). Its own cache, never touches the owner app's caches.
const VERSION = "sarparast-v1";
const PAGES = ["./", "karkard/", "anbar/", "resid/", "notes/"];
const FILES = PAGES.concat([
  "manifest.webmanifest", "sv.js", "sa.js", "sign.js", "theme.css",
  "lib/xlsx.full.min.js", "lib/qrcode.js",
  "fonts/Vazirmatn-Regular.woff2", "fonts/Vazirmatn-Medium.woff2", "fonts/Vazirmatn-Bold.woff2", "fonts/Lalezar-Arabic.woff2",
  "fonts/NotoNaskhArabic-Regular.woff", "fonts/NotoNaskhArabic-SemiBold.woff",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon.png"
]);
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("sarparast-") && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    const key = url.origin + url.pathname.replace(/index\.html$/, "");
    e.respondWith(
      fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); } return res; })
        .catch(() => caches.open(VERSION).then(c => c.match(key)).then(hit => hit || caches.match("./")))
    );
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
