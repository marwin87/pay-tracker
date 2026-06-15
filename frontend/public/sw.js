// Intentional passthrough — installability only, no offline caching (FR-013)
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
