// Intentional passthrough — installability only, no offline caching (FR-013).
// Cross-origin requests (API) are not intercepted so credentials flow directly.
self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request));
});
