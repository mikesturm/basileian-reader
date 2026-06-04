const CACHE_NAME = "basileian-reader-v8-20260604-sync";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./style-additions.css",
  "./app.js",
  "./data.js",
  "./translations-module.js",
  "./commentary-module.js",
  "./sync-module.js",
  "./translations-index.json",
  "./canon.html",
  "./icon-192.png",
  "./icon-512.png",
  "./site.webmanifest"
];

// Commentary and translation JSON files are cached on first request by the
// fetch handler below. Add them to ASSETS only after running the fetch scripts,
// since they are generated (not committed to the repository).
// e.g. "./commentary/jfb.json", "./commentary/mhcc.json",
//      "./translations/kjv.json", etc.

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

// Background Sync: when the platform fires a registered sync event, ask any open
// client to push its pending state to the gist. (Sync state lives in the page's
// localStorage, so the work has to happen in a client.) On Chrome/Edge desktop &
// Android the client can be woken even after the tab is hidden; on iOS Safari
// these events don't fire — SyncModule's visibilitychange/online hooks cover it.
async function pingClientsToSync(tag) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (!clients.length) return;
  for (const client of clients) client.postMessage({ type: "sync-request", tag });
}

self.addEventListener("sync", event => {
  if (event.tag === "basileian-sync") {
    event.waitUntil(pingClientsToSync(event.tag));
  }
});

self.addEventListener("periodicsync", event => {
  if (event.tag === "basileian-periodic-sync") {
    event.waitUntil(pingClientsToSync(event.tag));
  }
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
