const CACHE_VERSION = "v1";
const TILE_CACHE = `trackly-tiles-${CACHE_VERSION}`;
const TILE_HOSTS = ["tile.openstreetmap.org", "a.tile.openstreetmap.org", "b.tile.openstreetmap.org", "c.tile.openstreetmap.org"];
const TILE_PATH_REGEX = /\/\d+\/\d+\/\d+\.png$/;

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("trackly-tiles-") && key !== TILE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!TILE_HOSTS.includes(url.hostname)) return;
  if (!TILE_PATH_REGEX.test(url.pathname)) return;

  event.respondWith(cacheTile(request));
});

async function cacheTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}
