/* render3d/dress3d.js - what a base keeps lying about. Part of rts.render3d.

   A base was its buildings standing on a clean plaza, like models set out on a table. The
   bases of the later 3D RTS games are LIVED IN: crates stacked against a wall, oil drums in
   twos and threes, a row of sandbags, a lamp on a post. So every building's paved ring (the
   plaza terrain3d.js lays round it) is dressed with them now - hash-placed per cell, pressed
   up against the building's own walls, and never on its FRONT, where a factory's door opens
   and a new unit rolls out.

   Cosmetic, like the tufts and the husks: nothing here blocks a path or takes a hit. It is one
   small static batch, rebuilt only when the set of standing buildings changes - keyed the way
   the ground map is - and drawn with the world's own batches, in both passes, so the props cast
   shadows. R3.dressAmt 0 leaves them out of the frame. */

var R3D_DRESS_ODDS = 0.7;       /* share of a building's ring cells that carry something */

var R3D_DRESS = {
  crate: ['#86653f', '#9a7a4b', '#7a5a36'], crateTop: '#b0915f',
  drum: ['#8e3a2e', '#5e5e3e', '#6c7278', '#2f5a7a'], drumTop: '#9aa0a4',
  bag: '#b8a57a', bagTop: '#c9b88e', post: '#3a3d40', lamp: '#e9e2c8'
};

/* One cell's worth, pressed against the wall at (wx, wz) and facing along the wall (ax, az). */
function _r3dDressCell(out, wx, wz, ax, az, tx, tz) {
  var h = _sprHash(tx * 31 + 7, tz, 811), k = Math.floor(_sprHash(tz * 31 + 3, tx, 823) * 4);
  var P = R3D_DRESS, i, n;
  if (k === 0) {                                   /* a stack of crates */
    n = 1 + Math.floor(h * 3);
    for (i = 0; i < n; i++) {
      var s = 0.75 + _sprHash(tx * 31 + i, tz, 829) * 0.35, c = P.crate[i % 3];
      var along = (i - (n - 1) / 2) * 0.95;
      _r3Box(out, wx + ax * along, i === 2 ? s : 0, wz + az * along, s, s, s, c, P.crateTop);
      if (i === 1 && n === 2) _r3Box(out, wx + ax * along * 0.2, s, wz + az * along * 0.2, s * 0.8, s * 0.8, s * 0.8, P.crate[2], P.crateTop);
    }
  } else if (k === 1) {                            /* oil drums */
    n = 2 + Math.floor(h * 3);
    var dc = P.drum[Math.floor(_sprHash(tx, tz * 31 + 5, 839) * 4)];
    for (i = 0; i < n; i++) {
      var off = (i - (n - 1) / 2) * 0.72, jz = (i & 1) * 0.45;
      _r3Cyl(out, wx + ax * off - az * jz, 0, wz + az * off + ax * jz, 0.34, 0.95, dc, P.drumTop, 16);
    }
  } else if (k === 2) {                            /* a row of sandbags, two high */
    for (var row = 0; row < 2; row++) for (i = 0; i < 4 - row; i++) {
      var o2 = (i - (3 - row) / 2) * 0.62;
      _r3Box(out, wx + ax * o2, row * 0.3, wz + az * o2, 0.7 * Math.abs(ax) + 0.42 * Math.abs(az),
             0.3, 0.7 * Math.abs(az) + 0.42 * Math.abs(ax), P.bag, P.bagTop);
    }
  } else {                                         /* a lamp on a post */
    _r3Cyl(out, wx, 0, wz, 0.09, 2.6, P.post, P.post, 16);
    _r3Box(out, wx, 2.6, wz, 0.34, 0.2, 0.34, P.post, P.lamp);
  }
}

/* The key: every standing building, as the ground map keys its paving (terrain3d.js). */
function _r3dDressKey(G) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type !== 'struct' || e.dead) continue;
    h = Math.imul(h ^ (e.tx * 131 + e.tz * 7 + 1), 16777619) >>> 0;
  }
  return h;
}

/* Rebuild the dressing when the buildings have changed. */
function _r3dDressTick(G) {
  var R3 = window._R3D, gl = R3.gl, key = _r3dDressKey(G);
  if (R3.dressG === G && R3.dressKey === key) return;
  R3.dressG = G; R3.dressKey = key;
  if (R3.dress) { gl.deleteBuffer(R3.dress.p); gl.deleteBuffer(R3.dress.n); gl.deleteBuffer(R3.dress.c); R3.dress = null; }
  var paved = _r3dPaved(G), faces = [], seen = {}, cells = 0, at = [];
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type !== 'struct' || e.dead) continue;
    var d = rtsStructDef(e.def);
    if (!d || d.wall) continue;
    /* the ring: west and east columns and the back row, never the front row (+z) */
    for (var tz = e.tz - 1; tz < e.tz + d.h; tz++) for (var tx = e.tx - 1; tx <= e.tx + d.w; tx++) {
      var west = tx === e.tx - 1, east = tx === e.tx + d.w, back = tz === e.tz - 1;
      if (!west && !east && !back) continue;
      if ((west || east) && back) continue;                       /* corners: left open */
      if (!_rtsInB(tx, tz)) continue;
      var k = _rtsIdx(tx, tz);
      if (seen[k] || !paved[k] || G.blocked[k] || _sprHash(tx, tz, 853) > R3D_DRESS_ODDS) continue;
      seen[k] = 1; at.push(k);
      /* pressed against the wall: a quarter cell off the building's side of the cell */
      var wx = _rtsWX(tx) + (west ? 1 : east ? -1 : 0) * RTS_TILE * 0.22;
      var wz = _rtsWX(tz) + (back ? 1 : 0) * RTS_TILE * 0.22;
      var ax = back ? 1 : 0, az = back ? 0 : 1, f0 = faces.length;
      _r3dDressCell(faces, wx, wz, ax, az, tx, tz);
      _r3dLiftFrom(faces, f0, _rtsElev(wx, wz));
      cells++;
    }
  }
  R3.dressCells = cells; R3.dressAt = at;
  if (!faces.length) return;
  var m = _r3dBuildMesh(gl, faces);
  var half = RTS_N * RTS_TILE / 2;
  m.x0 = -half; m.x1 = half; m.z0 = -half; m.z1 = half;        /* one batch for the map */
  R3.dress = m;
}

/* The batches to draw with the world's: the dressing, unless a spec has it out. */
function _r3dDressBatches(R3) {
  return (R3.dress && R3.dressAmt !== 0) ? [R3.dress] : [];
}
