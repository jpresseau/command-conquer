/* preview.js - THE MAP BEFORE THE BATTLE: on the title, under START BATTLE, a thumbnail of the
   ground the next battle will be fought on, its seed, and ↻ for another.

   START BATTLE used to take its seed from the clock as it opened, so the map was a surprise and
   there was no way to decline one. Now the title rolls the seed (rtsSeedRoll), builds that battle
   quietly - _rtsNewGame, the same call rtsOpen makes, with the skirmish setup it would use - and
   draws its terrain, ore and starting positions; rtsStart then plays THAT seed, so the picture is
   the promise. The setup changing (skirmish.js rtsSkirmishSync) or ↻ rolls again; a battle played
   or left behind rolls again on the way back to the title (rtsHome).

   The built battle is scratch: _rtsNewGame puts it on window._rtsG, and that is put back the
   moment the picture is drawn, because half the page reads _rtsG to mean "a battle is live" -
   the message line, the loaders, the volume knob. Nothing else of it is kept. */

var RTS_PREV_PX = 160;

function rtsSeedRoll() { return (window._RTS_SEED_NEXT = 1 + (((new Date()).getTime() ^ (Math.random() * 65536)) & 0xfffe)); }
function rtsSeedNext() { return window._RTS_SEED_NEXT || rtsSeedRoll(); }
/* The thumbnail's pixels, one a cell: a pure read of a built battle, so unit/preview can hold it. */
function _rtsMapThumb(G) {
  var N = RTS_N, px = new Uint8ClampedArray(N * N * 4), i, c;
  var COL = { grass: [68, 92, 50], tree: [38, 62, 32], rock: [112, 108, 98], water: [40, 78, 112], road: [96, 84, 62], sand: [156, 140, 92], wall: [120, 120, 120], ore: [206, 162, 58], gem: [150, 118, 220] };
  var BY = [COL.grass, COL.tree, COL.rock, COL.water, COL.road, COL.sand, COL.wall];
  for (i = 0; i < N * N; i++) {
    c = G.scrap && G.scrap[i] > 0 ? (G.gems && G.gems[i] ? COL.gem : COL.ore) : (BY[G.terrain[i]] || COL.grass);
    /* the hills: higher ground a little lighter, so the relief reads */
    var h = G.height ? G.height[i] / 255 : 0, k = G.terrain[i] === RTS_T_WATER ? 1 : 0.8 + h * 0.5;
    px[i * 4] = c[0] * k; px[i * 4 + 1] = c[1] * k; px[i * 4 + 2] = c[2] * k; px[i * 4 + 3] = 255;
  }
  /* the seats: a square of each side's colour at its start */
  var SIDE = { player: [96, 160, 255], enemy: [255, 96, 80], ally: [96, 210, 120], enemy2: [240, 180, 60], enemy3: [190, 110, 230] };
  (G.order || []).forEach(function (k) {
    var s = G.starts && G.starts[k], col = SIDE[k] || SIDE.enemy;
    if (!s) return;
    for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) {
      var x = s.tx + dx, z = s.tz + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      var j = (z * N + x) * 4, edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      px[j] = edge ? 10 : col[0]; px[j + 1] = edge ? 12 : col[1]; px[j + 2] = edge ? 16 : col[2];
    }
  });
  return px;
}
/* Build the next battle quietly and draw it. Returns what was drawn, for the page and the specs. */
function rtsMapPreview() {
  var cv = document.getElementById('rtsPrevCv'), lbl = document.getElementById('rtsPrevSeed');
  if (!cv || typeof _rtsNewGame !== 'function') return null;
  var seed = rtsSeedNext(), was = window._rtsG, G = null;
  try {
    _rtsNewGame(seed, window._RTS_DIFF, { skirmish: typeof rtsSkirmishWant === 'function' ? rtsSkirmishWant() : null });
    G = window._rtsG;
  } catch (e) { G = null; }
  window._rtsG = was;
  if (!G) return null;
  var N = RTS_N, px = _rtsMapThumb(G), c = cv.getContext('2d');
  cv.width = N; cv.height = N;
  c.putImageData(new ImageData(px, N, N), 0, 0);
  if (lbl) lbl.textContent = 'map ' + seed + ' · ' + N + ' cells';
  return { seed: seed, n: N, order: G.order.slice() };
}
function rtsMapReroll() { rtsSeedRoll(); return rtsMapPreview(); }
/* after the title has painted, not before: the build is a few hundred milliseconds on a phone */
function rtsMapPreviewSoon() {
  var lbl = document.getElementById('rtsPrevSeed');
  if (lbl) lbl.textContent = 'laying the map…';
  setTimeout(function () { if (!document.getElementById('rtsHome').classList.contains('gone')) rtsMapPreview(); }, 40);
}
