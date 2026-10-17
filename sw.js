/* Breachwater service worker: NETWORK FIRST, with an offline copy.

   Online, every request goes to the network and the player gets the deploy that is up - the same
   promise the network-only worker made before, because a stale build is one a player cannot tell
   they are on. What changed is the failure: when the network does not answer (no signal, a phone
   in flight mode, the host down), the last copy that DID load is served instead of an error, so
   the game opens offline from the home screen. The game is one self-contained page plus its
   manifest and icons, all saved on install, so one online visit is enough.

   The cache is this app's own (CACHE_PREFIX): the site serves several apps from one origin, and
   Cache Storage is origin-wide, so the activate sweep deletes only this app's older caches and
   never another's. A registered fetch handler is also what makes the app installable. */
var CACHE_PREFIX = 'breachwater-offline-';
var CACHE = CACHE_PREFIX + 'v1';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.svg'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  /* fetched past the HTTP cache, so the saved copy is the deploy that is up; a failure here is
     not fatal - the first page that loads online fills the cache anyway */
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
    }));
  }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.url.indexOf(self.registration.scope) !== 0) return;
  var page = req.mode === 'navigate';
  e.respondWith(fetch(req).then(function (r) {
    if (!r.ok) throw new Error('status ' + r.status);
    /* keep the copy current: the page under its own name, so any start URL finds it offline */
    var copy = r.clone();
    caches.open(CACHE).then(function (c) { return c.put(page ? 'index.html' : req, copy); }).catch(function () {});
    return r;
  }).catch(function (err) {
    return caches.open(CACHE).then(function (c) {
      return c.match(page ? 'index.html' : req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (page) return c.match('./');
        throw err;
      });
    }).then(function (hit) { if (hit) return hit; throw err; });
  }));
});
