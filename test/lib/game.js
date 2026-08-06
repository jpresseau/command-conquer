/* Shared plumbing for the end-to-end specs: serve the repo, open the built page, start a match.

   Every spec used to carry its own copy of a static file server and its own Playwright
   boilerplate. That is fifty lines of the same thing per file, and the copies drifted - one of
   them served the wrong MIME type for .webmanifest, which made a manifest test pass for the
   wrong reason. It lives here once now.

   WHAT THESE SPECS TEST is the BUILT index.html, not src/. The build reassembles ~30 source
   files into one page, so a spec that read src/ could pass while the artifact a player loads is
   broken. run.js rebuilds before any of this runs.

   No game assets ship in this repo, by design - artwork, audio and maps are read at runtime from
   the player's own copy. So _rtsArtReady() is false here and the procedural fallback renders.
   That is also exactly what a first-time player sees, so it is the primary path, not a degraded
   one; specs that need the artwork path stub _mixShp and _rtsArtReady themselves. */

var fs = require('fs');
var path = require('path');
var http = require('http');

var ROOT = path.resolve(__dirname, '..', '..');
var MIMES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

/* Ports are handed out rather than chosen per spec, so two specs running in the same process
   can never collide on one - which used to be managed by hand and by comment.

   That counter only settles it WITHIN a process, and run.js gives every spec its own, so each
   one starts again at 8600. Run a single spec by hand while the suite is going - or leave a
   server behind from a killed run - and the next spec dies on EADDRINUSE before it has made a
   single assertion, which reads like a broken test rather than a busy port. So a taken port is
   stepped over instead of being fatal. */
var nextPort = 8600;
var PORT_TRIES = 50;

function serve(tries) {
  tries = tries == null ? PORT_TRIES : tries;
  var port = nextPort++;
  var srv = http.createServer(function (rq, rs) {
    var p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
    if (p.endsWith('/')) p += 'index.html';
    fs.readFile(p, function (e, d) {
      if (e) { rs.writeHead(404); rs.end('not found'); return; }
      rs.writeHead(200, { 'Content-Type': MIMES[path.extname(p)] || 'application/octet-stream' });
      rs.end(d);
    });
  });
  return new Promise(function (res, rej) {
    srv.once('error', function (e) {
      if (e && e.code === 'EADDRINUSE' && tries > 0) { srv.close(); res(serve(tries - 1)); return; }
      rej(e);
    });
    srv.listen(port, function () { res({ srv: srv, url: 'http://127.0.0.1:' + port + '/index.html' }); });
  });
}

/* A page with the title screen up. `device` is a Playwright device descriptor or a plain
   {width,height}; page errors are collected rather than ignored, because an exception thrown
   inside a rAF loop is invisible to every other assertion a spec could make. */
async function openPage(browser, opts) {
  opts = opts || {};
  var s = await serve();
  var ctxOpts;
  if (opts.device) ctxOpts = Object.assign({}, opts.device, { isMobile: true, hasTouch: true });
  else ctxOpts = { viewport: { width: opts.width || 1280, height: opts.height || 800 },
                   deviceScaleFactor: opts.dpr || 1 };
  var ctx = await browser.newContext(ctxOpts);
  var page = await ctx.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  await page.goto(s.url, { waitUntil: 'load' });
  await page.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
  return {
    page: page, ctx: ctx, errors: errors, url: s.url,
    /* Start a match and fast-forward it. The ticks are driven synchronously rather than by
       waiting on the rAF loop, so a spec's timings are deterministic. */
    start: async function (seed, seconds) {
      await page.evaluate(function (a) {
        rtsOpen(a[0]);
        for (var i = 0; i < 60 * a[1]; i++) _rtsTick(1 / 60);
      }, [seed === undefined ? 7 : seed, seconds === undefined ? 20 : seconds]);
      await page.waitForTimeout(200);
    },
    /* Playwright's real touchscreen. Never hand-built TouchEvents: those test our listeners
       against our own guess at what a browser sends, which is the assumption most worth
       checking on the one platform this was reported broken on. */
    touch: async function () {
      var cdp = await ctx.newCDPSession(page);
      function pt(x, y) { return { x: x, y: y, radiusX: 10, radiusY: 10, force: 1 }; }
      return {
        start: function (x, y) { return cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x, y)] }); },
        move:  function (x, y) { return cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',  touchPoints: [pt(x, y)] }); },
        end:   function ()     { return cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd',   touchPoints: [] }); },
        points: function (type, pts) {
          return cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: pts.map(function (p) { return pt(p[0], p[1]); }) });
        },
        drag: async function (x0, y0, x1, y1, steps) {
          steps = steps || 8;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x0, y0)] });
          for (var i = 1; i <= steps; i++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
              touchPoints: [pt(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)] });
            await page.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        },
        cdp: cdp
      };
    },
    close: async function () { await ctx.close(); s.srv.close(); }
  };
}

module.exports = { openPage: openPage, serve: serve, ROOT: ROOT };
