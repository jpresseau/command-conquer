/* Command & Conquer: Red Alert service worker.
   Network-only, exactly like the RC Garage one: it never caches page content, so the game
   always loads the latest deploy. Its only job is to make the app INSTALLABLE as a desktop app:
   a registered fetch handler is one of the browser's install criteria, and this repo is served
   at its own origin path so the scope is simply './'.

   Deliberately no offline cache. The game is one ~0.9 MB page, the artwork lives in IndexedDB
   rather than in the HTTP cache, and a stale copy of a self-contained page is far worse than a
   fast reload - a player who sees an old build has no way to tell. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
/* A registered fetch handler is what makes the app install-eligible. We never call
   respondWith(), so every request falls through to the network - no stale content. */
self.addEventListener('fetch', function () { /* pass-through to network */ });
