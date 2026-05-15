const CACHE_NAME = "basileian-reader-v7-20260515-bible-concordance";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./style-additions.css",
  "./app.js",
  "./data.js",
  "./translations-module.js",
  "./commentary-module.js",
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
