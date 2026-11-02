// Retired: the whole site (hub, notebook, karkard, accounting) now uses ../sw.js.
// Browsers that still have this worker get this version, which removes itself.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("karkard-")).map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
  );
});
