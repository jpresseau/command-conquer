/* The service worker, and whether a new deploy actually reaches the player.

   sw.js makes one promise and it is a negative one: "Network-only ... it never caches page
   content, so the game always loads the latest deploy ... a stale copy of a self-contained page
   is far worse than a fast reload - a player who sees an old build has no way to tell."

   That is the entire design, and nothing was checking it. It is also the single most dangerous
   thing in the repo to get wrong, because the failure is self-concealing: a service worker that
   started serving cached content would pin every existing player to the build they happened to
   have when it shipped. They would not see the bug reports, they would not see the fixes, and
   the next deploy could not reach them to correct it. Every other spec here tests the code in
   the page; this one tests whether the page a player loads is the one that was deployed.

   So the server under this spec is not the shared one - it is local, it counts requests, and
   the bytes it serves can be CHANGED while the browser is running. That is the only way to ask
   the question honestly: alter the deployed build, reload, and see which one the player gets.

   The build stamp is the marker, and deliberately so: it is the real thing a player reads to
   tell one build from another (the `rtsBuild` div in the toolbar, stamped by build.py), so a
   stale stamp is exactly the user-visible symptom under test rather than a proxy for it.

   AND IT IS SERVED UNDER A SUBPATH, not at the origin root, because that is where it really
   lives: jpresseau.github.io/command-conquer/. Everything the install path depends on is
   relative for that reason - `register('sw.js', {scope:'./'})`, the manifest's `./` start_url
   and scope, its relative icon srcs. Hosted at a root those and their absolute equivalents
   behave identically, so a spec served from `/` would pass just as happily against a `/sw.js`
   that 404s on the real deploy and takes installability down with it. Served from a subpath,
   the difference is the difference between registering and not. */

var fs = require('fs');
var path = require('path');
var http = require('http');
var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');

var S = new Suite('swupdate');
var ROOT = path.resolve(__dirname, '..', '..');
var MIMES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

/* The deploy, as the browser sees it. `stamp` is what the served index.html carries in its
   build div; `swExtra` is appended to sw.js so its bytes differ and the browser treats it as a
   new worker; `dead` makes every request fail, which is how "no offline cache" is checked. */
var deploy = { stamp: 'BUILD-ONE', swExtra: '', dead: false };
var hits = {};

/* The path the app is deployed under in production. */
var BASE = '/command-conquer/';

function serveMutable() {
  var srv = http.createServer(function (rq, rs) {
    var url = rq.url.split('?')[0];
    hits[url] = (hits[url] || 0) + 1;
    if (deploy.dead) { rs.writeHead(503); rs.end('deploy is down'); return; }
    /* anything outside the deploy path does not exist, exactly as on the real host */
    if (url.indexOf(BASE) !== 0) { rs.writeHead(404); rs.end('not found'); return; }
    var p = path.join(ROOT, decodeURIComponent(url.slice(BASE.length)));
    if (p.endsWith('/') || url.slice(-1) === '/') p = path.join(ROOT, 'index.html');
    fs.readFile(p, function (e, d) {
      if (e) { rs.writeHead(404); rs.end('not found'); return; }
      var type = MIMES[path.extname(p)] || 'application/octet-stream';
      if (/index\.html$/.test(p)) {
        /* stamp the build the way build.py does, so the page carries a version a player can read */
        d = Buffer.from(String(d).replace(/(<div id="rtsBuild"[^>]*>)[^<]*(<\/div>)/,
                                         '$1' + deploy.stamp + '$2'));
      } else if (/sw\.js$/.test(p)) {
        d = Buffer.from(String(d) + deploy.swExtra);
      }
      /* No-store on the shell, so the HTTP cache cannot be mistaken for the service worker.
         This spec is about what sw.js does, and a browser-cached page would confound it. */
      rs.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      rs.end(d);
    });
  });
  return new Promise(function (res, rej) {
    var port = 8700;
    function tryPort(n) {
      srv.once('error', function (e) {
        if (e && e.code === 'EADDRINUSE' && n > 0) { tryPort(n - 1); return; }
        rej(e);
      });
      srv.listen(port++, function () {
        var host = 'http://127.0.0.1:' + (port - 1);
        res({ srv: srv, url: host + BASE + 'index.html', base: host + BASE, host: host });
      });
    }
    tryPort(40);
  });
}

function stampOf(page) {
  return page.evaluate(function () {
    var d = document.getElementById('rtsBuild');
    return d ? d.textContent.trim() : null;
  });
}

(async function () {
  var s = await serveMutable();
  var browser = await chromium.launch();
  var ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  var page = await ctx.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });

  await page.goto(s.url, { waitUntil: 'load' });
  await page.waitForFunction(function () { return typeof rtsInstallInit === 'function'; });

  /* ------------------------------------------------------ it registers and takes over ----
     skipWaiting on install and clients.claim on activate are what make a worker control the
     page that installed it, on the first visit, with no reload. Without them the first load is
     uncontrolled and the install criterion is not met until the player comes back. */
  var reg = await page.evaluate(async function () {
    /* Bounded, because navigator.serviceWorker.ready NEVER REJECTS. A worker that cannot be
       registered at all - the script 404ing, which is exactly what an absolute '/sw.js' does
       once the app is served from a subdirectory - leaves this promise pending for ever, and
       the spec hangs instead of failing. A hang reports nothing and blocks the suite; the
       whole point of serving from a subpath is to catch that case, so it has to end in a
       message rather than a stall. */
    var r = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(function (res) { setTimeout(function () { res(null); }, 15000); })
    ]);
    if (!r) {
      var got = await navigator.serviceWorker.getRegistration();
      return { timedOut: true, anyRegistration: !!got,
               scope: got ? got.scope : null, active: false, controlled: false, waiting: false };
    }
    /* claim() can land a beat after ready resolves */
    for (var i = 0; i < 60 && !navigator.serviceWorker.controller; i++) {
      await new Promise(function (res) { setTimeout(res, 50); });
    }
    return { scope: r.scope, active: !!r.active, waiting: !!r.waiting, installing: !!r.installing,
             state: r.active ? r.active.state : null,
             script: r.active ? r.active.scriptURL : null,
             controlled: !!navigator.serviceWorker.controller };
  });
  S.ok('a service worker registers at all', reg.active,
       reg.timedOut ? ('no worker became ready within 15s' +
                       (reg.anyRegistration ? ' (a registration exists at ' + reg.scope + ')'
                                            : ' - nothing registered; is the script path relative?'))
                    : ('active worker: ' + reg.script));
  if (!reg.active) {
    /* Everything below drives the registration, and with no worker each step would wait on a
       promise that never settles. Stop here with the failure recorded rather than hang. */
    S.note('no worker registered - the rest of this spec cannot run');
    await ctx.close(); await browser.close(); s.srv.close();
    return require('../lib/report.js')(S);
  }
  S.eq('...in the activated state', reg.state, 'activated');
  S.eq('...scoped to the app directory it is deployed under, not the host root', reg.scope, s.base);
  S.eq('...and it controls the page on the very first load, with no reload',
       reg.controlled, true);
  S.eq('...with nothing stuck waiting behind it', reg.waiting, false);

  /* ------------------------------------------- the install assets, from where they live ----
     e2e/install already proves the manifest parses and its icons load - but it serves the app
     from the origin root, where a relative `icon-192.png` and an absolute `/icon-192.png`
     resolve to the same URL. Under the real deploy path they do not, and an icon that 404s is
     a manifest that passes inspection and refuses to install. So the assets are resolved and
     fetched HERE, from the subdirectory, which is the only place the difference shows. */
  var assets = await page.evaluate(async function () {
    var link = document.querySelector('link[rel=manifest]');
    if (!link) return { error: 'no manifest link in the page' };
    var mres = await fetch(link.href, { cache: 'no-store' });
    if (!mres.ok) return { error: 'manifest ' + mres.status + ' at ' + link.href };
    var man = await mres.json();
    var out = [];
    for (var i = 0; i < (man.icons || []).length; i++) {
      var url = new URL(man.icons[i].src, link.href).href;
      var r = await fetch(url, { cache: 'no-store' }).catch(function () { return { ok: false, status: 0 }; });
      out.push({ src: man.icons[i].src, url: url, status: r.status, ok: r.ok });
    }
    return { manifestUrl: link.href, start: new URL(man.start_url, link.href).href,
             scope: new URL(man.scope, link.href).href, icons: out };
  });
  S.ok('the manifest resolves from the deploy path', !assets.error, assets.error || assets.manifestUrl);
  if (!assets.error) {
    S.eq('...with a start_url inside the deploy path, not the host root', assets.start, s.base);
    S.eq('...and a scope to match', assets.scope, s.base);
    var bad = assets.icons.filter(function (i) { return !i.ok; });
    S.ok('every manifest icon loads from the deploy path', !bad.length,
         bad.map(function (i) { return i.src + ' -> ' + i.status; }).join(', ') ||
         assets.icons.map(function (i) { return i.src; }).join(', ') + ' all 200');
  }

  /* ------------------------------------------------------------- it caches nothing ----
     The stated design. A worker that opened a cache would not necessarily serve from it today,
     but it is the thing that turns into stale content later, so the absence is worth asserting
     directly rather than inferring from behaviour. */
  var caches1 = await page.evaluate(function () { return caches.keys(); });
  S.eq('the worker opens no caches at all', caches1.length, 0,
       caches1.length ? caches1.join(', ') : 'no cache storage');

  /* --------------------------------------------------- a new deploy reaches the player ----
     The assertion this spec exists for. Change what is deployed, reload, and the player must
     get the new build. If a cache-first handler were ever added this is what would fail, and
     it would fail for every player at once and permanently. */
  var first = await stampOf(page);
  S.eq('the page shows the deployed build stamp', first, 'BUILD-ONE');

  var before = hits[BASE + 'index.html'] || 0;
  deploy.stamp = 'BUILD-TWO';
  await page.reload({ waitUntil: 'load' });
  var second = await stampOf(page);
  var after = hits[BASE + 'index.html'] || 0;
  S.eq('after a new deploy, a reload shows the NEW build', second, 'BUILD-TWO');
  S.ok('...because the request actually reached the server', after > before,
       'index.html served ' + after + ' times, up from ' + before);

  /* and again, to be sure the first reload was not simply the browser's own cache miss */
  deploy.stamp = 'BUILD-THREE';
  await page.reload({ waitUntil: 'load' });
  S.eq('...and the deploy after that one too', await stampOf(page), 'BUILD-THREE');
  S.eq('still no caches after three loads', (await page.evaluate(function () { return caches.keys(); })).length, 0);

  /* ------------------------------------------------------------- requests pass through ----
     The worker registers a fetch handler - that is what makes the app installable - but never
     calls respondWith. A handler that answered even some requests would be invisible here
     until the day it answered a stale one, so the pass-through is measured: a request made
     from a CONTROLLED page has to arrive at the server. */
  var probeBefore = hits[BASE + 'manifest.webmanifest'] || 0;
  var probe = await page.evaluate(async function () {
    var controlled = !!navigator.serviceWorker.controller;
    var res = await fetch('manifest.webmanifest?probe=' + Date.now(), { cache: 'no-store' });
    return { controlled: controlled, ok: res.ok, status: res.status,
             fromSW: res.headers.get('x-from-sw') };
  });
  var probeAfter = Object.keys(hits).filter(function (u) { return /manifest\.webmanifest/.test(u); })
    .reduce(function (n, u) { return n + hits[u]; }, 0);
  S.eq('the page is under the worker\'s control while this is measured', probe.controlled, true);
  S.eq('...and a fetch from it succeeds', probe.status, 200);
  S.ok('...having actually gone to the network rather than being answered by the worker',
       probeAfter > probeBefore, 'manifest requests seen by the server: ' + probeAfter);

  /* --------------------------------------------------- an updated worker takes over ----
     A new sw.js must not sit in `waiting` until every tab is closed - which is the default,
     and which for a game people leave open would mean the fix never lands. skipWaiting and
     clients.claim are what avoid that, and the way to see it is to deploy a different worker
     and watch the controller change under a page that is still open. */
  var swBefore = Object.keys(hits).filter(function (u) { return /sw\.js/.test(u); })
    .reduce(function (n, u) { return n + hits[u]; }, 0);
  deploy.swExtra = '\n/* deploy 2 */\n';
  var upd = await page.evaluate(async function () {
    var r = await navigator.serviceWorker.getRegistration();
    var was = navigator.serviceWorker.controller;
    var changed = new Promise(function (res) {
      navigator.serviceWorker.addEventListener('controllerchange', function () { res(true); }, { once: true });
      setTimeout(function () { res(false); }, 8000);
    });
    await r.update();
    var took = await changed;
    /* controllerchange fires from INSIDE clients.claim(), which the worker calls in its own
       activate handler - so at that instant the new worker is still 'activating'. Waiting for
       the state to settle is not padding: reading it immediately measures the middle of the
       handover and reports 'activating' for a worker that is about to be fine. */
    var r2 = await navigator.serviceWorker.getRegistration();
    for (var i = 0; i < 100 && r2 && r2.active && r2.active.state !== 'activated'; i++) {
      await new Promise(function (res) { setTimeout(res, 50); });
      r2 = await navigator.serviceWorker.getRegistration();
    }
    return { took: took, waiting: !!(r2 && r2.waiting), active: !!(r2 && r2.active),
             state: r2 && r2.active ? r2.active.state : null,
             stillControlled: !!navigator.serviceWorker.controller,
             sameWorker: was === navigator.serviceWorker.controller };
  });
  var swAfter = Object.keys(hits).filter(function (u) { return /sw\.js/.test(u); })
    .reduce(function (n, u) { return n + hits[u]; }, 0);
  S.ok('the browser re-fetches sw.js when asked to update', swAfter > swBefore,
       'sw.js served ' + swAfter + ' times, up from ' + swBefore);
  S.eq('a newly deployed worker takes over a page that is still open', upd.took, true);
  S.eq('...replacing the one that was controlling it', upd.sameWorker, false);
  S.eq('...rather than queueing up behind it forever', upd.waiting, false);
  S.eq('...and the page is still controlled afterwards', upd.stillControlled, true);
  S.eq('...by an activated worker', upd.state, 'activated');

  /* the swap must not have quietly introduced a cache, and the page must still update */
  S.eq('the new worker caches nothing either',
       (await page.evaluate(function () { return caches.keys(); })).length, 0);
  deploy.stamp = 'BUILD-FOUR';
  await page.reload({ waitUntil: 'load' });
  S.eq('and a deploy after the worker swap still reaches the player', await stampOf(page), 'BUILD-FOUR');

  /* ------------------------------------------------------ no offline cache, on purpose ----
     The header calls this out as a deliberate trade: there is no offline mode, because a stale
     self-contained page is worse than a failed load a player can see and retry. So with the
     deploy down the app must FAIL, visibly. If this ever starts passing an old page back, the
     "always loads the latest deploy" promise has already been broken - this is the same defect
     as a stale build, caught from the other side. */
  deploy.dead = true;
  var offline = await page.goto(s.url, { waitUntil: 'load' }).then(function (r) {
    return { status: r ? r.status() : null, err: null };
  }, function (e) { return { status: null, err: String(e.message || e) }; });
  var shell = await page.evaluate(function () {
    return { home: !!document.getElementById('rtsHome'), body: document.body ? document.body.textContent.trim().slice(0, 60) : '' };
  });
  S.ok('with the deploy down the page does not load from a cache',
       offline.status === 503 || !!offline.err,
       offline.err ? ('navigation failed: ' + offline.err) : ('server answered ' + offline.status));
  S.eq('...and no stale copy of the app is shown', shell.home, false);
  deploy.dead = false;
  await page.goto(s.url, { waitUntil: 'load' });
  S.eq('...and the app comes back once the deploy is up', await stampOf(page), 'BUILD-FOUR');

  S.ok('the page logged no errors throughout', !errors.length,
       errors.slice(0, 3).join(' | ') || 'clean');

  await ctx.close();
  await browser.close();
  s.srv.close();
  require('../lib/report.js')(S);
})();
