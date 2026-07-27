/* Command & Conquer: Red Alert service worker.
   Network-only, exactly like the RC Garage one: it never caches page content, so the game
   always loads the latest deploy. Its only job is to make the app installable as a desktop
   app. Scoped to /command/ so it cannot interfere with the RC Garage app at the root. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
/* A registered fetch handler is what makes the app install-eligible. We never call
   respondWith(), so every request falls through to the network - no stale content. */
self.addEventListener('fetch', function () { /* pass-through to network */ });
