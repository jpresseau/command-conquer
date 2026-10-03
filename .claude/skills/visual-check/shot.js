/* A picture of the game, headless, and optionally a before/after pair with a pixel count.

     node shot.js --out=/scratch/ring [--3d] [--fog] [--w=1100 --h=760 --dpr=1] [--seed=7]
                  [--setup=setup.js] [--ab=toggle.js] [--crop=x,y,w,h]

   --setup  JS run in the page before the shot, with G (the game), R (the camera), R3 (the 3D
            renderer, when on) in scope - spawn units, move the camera, force a sky...
   --ab     JS run between the two shots (the change under test: a kill switch, a constant);
            writes <out>_A.png and <out>_B.png and prints how many pixels differ
   --crop   in canvas pixels, from the top left, to look at one thing up close
   --fog    keep the shroud; by default the whole map is revealed

   The game is the BUILT index.html, so run python3 build.py first. The 3D view is drawn and read
   back in the same task (a screenshot of it can hang on SwiftShader), and the simulation is
   frozen, so the pair differs only by what --ab changed. Open the PNGs with the Read tool. */

var path = require('path'), fs = require('fs'), zlib = require('zlib');
var ROOT = path.resolve(__dirname, '../../..');
var { chromium } = require('playwright');
var { openPage } = require(path.join(ROOT, 'test/lib/game.js'));
var A = {};
process.argv.slice(2).forEach(function (a) { var m = /^--([\w]+)(?:=(.*))?$/.exec(a); if (m) A[m[1]] = m[2] == null ? true : m[2]; });
if (!A.out) { console.error('usage: node shot.js --out=<prefix> [--3d] [--setup=f.js] [--ab=f.js] [--crop=x,y,w,h]'); process.exit(2); }

function png(file, w, h, px) {
  var rows = Buffer.alloc((w * 4 + 1) * h);
  for (var y = 0; y < h; y++) { rows[y * (w * 4 + 1)] = 0; px.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  function chunk(t, b) {
    var len = Buffer.alloc(4); len.writeUInt32BE(b.length);
    var tb = Buffer.concat([Buffer.from(t), b]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(tb) >>> 0 : crc32(tb));
    return Buffer.concat([len, tb, crc]);
  }
  var hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}
function crc32(b) { var c, t = [], k, n; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xFFFFFFFF; for (n = 0; n < b.length; n++) c = t[(c ^ b[n]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: +A.w || 1100, height: +A.h || 760, dpr: +A.dpr || 1 });
  await g.start(+A.seed || 7, 1);
  var read = function (f) { return f ? fs.readFileSync(f, 'utf8') : ''; };
  var crop = A.crop ? A.crop.split(',').map(Number) : null;
  var shots = await g.page.evaluate(function (a) {
    var G = window._rtsG, R = _rtsR;
    if (window._rtsUI) window._rtsUI.dead = true;                        /* the loop stays out of it */
    if (!a.fog) { for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; } G.visDirty = 1; }   /* the whole map, unless --fog */
    rts3dSet(!!a.three);
    var R3 = window._R3D;
    (new Function('G', 'R', 'R3', a.setup))(G, R, R3);
    function grab() {
      _rtsRFrame(0); _rtsRFrame(0);
      var three = window._R3D && window._R3D.on, cv = three ? window._R3D.cv : R.cv, W = cv.width, H = cv.height;
      var c = a.crop || [0, 0, W, H], x = c[0], y = c[1], w = Math.min(c[2], W - x), h = Math.min(c[3], H - y), out = new Uint8Array(w * h * 4);
      if (three) {
        var gl = window._R3D.gl, b = new Uint8Array(w * h * 4);
        gl.readPixels(x, H - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
        for (var r = 0; r < h; r++) out.set(b.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4);   /* GL is bottom-up */
      } else out.set(R.g.getImageData(x, y, w, h).data);
      return { w: w, h: h, px: Array.from(out) };
    }
    var s = [grab()];
    if (a.ab) { (new Function('G', 'R', 'R3', a.ab))(G, R, window._R3D); s.push(grab()); }
    return s;
  }, { three: !!A['3d'], fog: !!A.fog, setup: read(A.setup), ab: read(A.ab), crop: crop });
  shots.forEach(function (s, i) { png(A.out + (shots.length > 1 ? (i ? '_B' : '_A') : '') + '.png', s.w, s.h, Buffer.from(s.px)); });
  if (shots.length > 1) {
    var a0 = shots[0].px, b0 = shots[1].px, n = 0;
    for (var k = 0; k < a0.length; k += 4) if (Math.abs(a0[k] - b0[k]) + Math.abs(a0[k + 1] - b0[k + 1]) + Math.abs(a0[k + 2] - b0[k + 2]) > 12) n++;
    console.log(shots[0].w + 'x' + shots[0].h + ': ' + n + ' pixels differ (' + (100 * n / (a0.length / 4)).toFixed(2) + '%)');
  } else console.log(shots[0].w + 'x' + shots[0].h + ' written');
  if (g.errors.length) console.log('page errors: ' + g.errors.slice(0, 3).join(' | '));
  await g.close(); await browser.close();
})().catch(function (e) { console.error(e); process.exit(1); });
