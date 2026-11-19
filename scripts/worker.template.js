// Build replaces both tokens with the version and the complete relative inventory.
const prefix = "dartshift:" + self.registration.scope + ":";
const cacheName = prefix + "__VERSION__";
const urls = __ASSETS__.map(
  (file) => new URL(file, self.registration.scope).href,
);
const index = new URL("./index.html", self.registration.scope).href;
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) =>
        cache.addAll(urls.map((url) => new Request(url, { cache: "reload" }))),
      ),
  );
});
self.addEventListener("message", (event) => {
  if (event.data === "activate") event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(prefix) && key !== cacheName)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  const navigation =
    event.request.mode === "navigate" &&
    (url.pathname === new URL(self.registration.scope).pathname ||
      url.pathname === new URL(index).pathname);
  const key = navigation ? index : url.href;
  if (!urls.includes(key)) return;
  event.respondWith(
    caches
      .open(cacheName)
      .then(async (cache) => (await cache.match(key)) || fetch(event.request)),
  );
});
