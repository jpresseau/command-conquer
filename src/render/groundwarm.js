/* render/groundwarm.js - the next battle's ground, baked on the title while the player chooses.

   The ground's texture (_rtsBakeTerrain, sprites/terrain.js) was the largest single cost left in
   opening a battle once the sprite sheet went lazy: 1.7 s here, several on a phone, on a screen
   that cannot paint. It reads only the map - its seed, its cells and its bridges - and the title
   already makes the next battle's map to draw its preview (preview.js). So the title bakes that
   map's ground too, a few rows a task (_rtsBakeTerrainSteps) so a tap is never kept waiting, and
   _rtsRInit takes it if the battle's map is the same one, byte for byte; any other map is baked
   as before. A start that comes while the bake is part done finishes it there. */
var RTS_GROUND_SLICE = 8;                            /* ms of baking a task */
var _rtsGround = null;                               /* { key, it, cv } - one map at a time */
function _rtsGroundKey(G) {
  if (!G || !G.terrain) return '';
  var h = 2166136261 >>> 0, T = G.terrain;
  for (var i = 0; i < T.length; i++) h = Math.imul(h ^ T[i], 16777619) >>> 0;
  return [G.seed | 0, T.length, h, JSON.stringify(G.bridges || null), RTS_TS].join('|');
}
function _rtsGroundWarm(G) {
  var key = _rtsGroundKey(G);
  if (!key || window.RTS_GROUND_OFF) return;
  if (_rtsGround && _rtsGround.key === key) return;
  var job = _rtsGround = { key: key, it: _rtsBakeTerrainSteps(G), cv: null };
  (function slice() {
    if (_rtsGround !== job || job.cv) return;
    var home = document.getElementById('rtsHome');
    if (!home || home.classList.contains('gone')) return;   /* a battle is up: it bakes its own */
    var t0 = Date.now(), r;
    do { r = job.it.next(); } while (!r.done && Date.now() - t0 < RTS_GROUND_SLICE);
    if (r.done) job.cv = r.value; else setTimeout(slice, 0);
  })();
}
/* The ground for G if the title made it (finishing a part-done bake), else null. Taken once: a
   battle's ground canvas is the battle's, and closing it frees the pixels (render/icons.js). */
function _rtsGroundTake(G) {
  var job = _rtsGround;
  if (!job || window.RTS_GROUND_OFF || job.key !== _rtsGroundKey(G)) return null;
  _rtsGround = null;
  if (!job.cv) { var r; do r = job.it.next(); while (!r.done); job.cv = r.value; }
  return job.cv;
}
