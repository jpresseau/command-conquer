/* render3d/alive3d.js - a base that is running. Part of rts.render3d.

   Every building was a still model: a radar station that looked at nothing, a power plant whose
   chimneys never smoked, a skyline with no light on it, and a building that was destroyed
   simply went - three seconds of wreck time and then clean ground under the craters. The bases
   of the later 3D RTS games are MACHINES that are visibly working, and they go down in ruins.
   So in the 3D mode:

     THE RADAR TURNS   an antenna on the dome, sweeping round (its own small mesh, drawn over the
                       building's, so the building's model is untouched)
     CHIMNEYS SMOKE    a pale plume off every power plant stack (the effects pass's smoke)
     BEACONS BLINK     red lights on the tall things - the stacks, the dome, the tech centre's
                       mast - each on its own beat
     RUINS STAND       a destroyed building slumps into a charred heap as it goes, and the heap
                       stays for R3D_RUBBLE_LIFE seconds after the rules have taken it off the map,
                       settling into the ground at the end. The one piece of state here: the
                       renderer remembers what it saw die (R3.rubble), keyed to the game.

   Model coordinates are the building model's own (sprites/models.js: art pixels about the
   footprint's centre), turned into the world by the same ART2W every building is drawn at.
   Cosmetic, all of it: nothing here blocks a path or takes a hit. R3.aliveAmt 0 takes it out. */

var R3D_RUBBLE_LIFE = 30;       /* seconds a ruin stands after its building is gone */
var R3D_BEACON_C = [1.0, 0.22, 0.16];
var R3D_STACK_SMOKE = [0.80, 0.80, 0.79];

/* Where the working parts are, per building, in model units: chimney tops that smoke, beacons,
   and the point the radar's antenna turns about. */
function _r3dAliveSpots(key) {
  var d = rtsStructDef(key);
  if (!d) return null;
  var D = d.h * RTS_TS, W = d.w * RTS_TS, zb = -D / 2 + 9, s = { smoke: [], beacon: [], spin: null };
  if (key === 'power') {
    s.smoke = [[-9, 41, zb], [9, 41, zb]];
    s.beacon = [[-9, 42.2, zb + 6.4]];
  } else if (key === 'apower') {
    for (var k = 0; k < 4; k++) s.smoke.push([-25 + k * 16.5, 39 + (k % 2) * 6, zb]);
    s.beacon = [[-8.5, 45.2, zb + 6]];
  } else if (key === 'radar') {
    s.spin = [0, 33, -1];
    s.beacon = [[0, 44.2, -1]];
  } else if (key === 'lab') {
    s.beacon = [[W / 2 - 10, 45.6, -2]];
  } else return null;
  return s;
}

/* The radar's antenna, in model units about its own foot: a mast, a head, a boom carrying a
   row of elements under a bar in the house's colour, and a counterweight. */
function _r3dAntennaModel(side) {
  var m = [], S = RTS_PAL.steel, DK = RTS_PAL.dark, TM = RTS_PAL.team[side];
  _r3Cyl(m, 0, 0, 0, 1.1, 3.4, S[2], S[1], 16);
  _r3Box(m, 0, 3.4, 0, 2.8, 1.3, 2.8, DK[1], DK[2]);
  _r3Box(m, 0, 4.7, 0, 18, 1.0, 1.4, S[1], S[3]);
  for (var k = -3; k <= 3; k++) _r3Box(m, k * 2.4, 5.7, 0.2, 1.2, 3.4, 0.6, S[2], S[3]);
  _r3Box(m, 0, 9.1, 0.2, 17, 0.7, 1.0, TM[1], TM[3]);
  _r3Box(m, 0, 3.6, -2.4, 3.2, 2.2, 2.6, DK[0], DK[1]);
  return m;
}
function _r3dAntenna(R3, side) {
  var k = 'antenna:' + side;
  if (R3.mesh[k] === undefined) {
    var f = null;
    try { f = _r3DetailHigh(function () { return _r3dAntennaModel(side); }); } catch (e) { f = null; }
    R3.mesh[k] = (f && f.length) ? _r3dBuildMesh(R3.gl, f) : null;
  }
  return R3.mesh[k];
}

/* Remember what has just been destroyed, and forget what has stood its time. */
function _r3dRubbleTick(G, R3) {
  if (R3.rubbleG !== G) { R3.rubbleG = G; R3.rubble = {}; }
  var t = G.t || 0, R = R3.rubble, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type !== 'struct' || !e.dead || e.selling || R[e.id]) continue;
    var d = rtsStructDef(e.def);
    if (!d || d.wall) continue;
    R[e.id] = { def: e.def, side: e.side, x: e.x, z: e.z, t0: t };
  }
  for (var id in R) if (t - R[id].t0 > R3D_RUBBLE_LIFE || t < R[id].t0) delete R[id];
}

/* The antennas and the ruins, handed to `draw(mesh, x, y, z, rot, dim, sy)`. */
function _r3dAliveDraw(G, R3, draw) {
  if (R3.aliveAmt === 0) { R3.rubbleN = 0; return; }
  var A2W = RTS_TILE / RTS_TS, t = G.t || 0, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.building) continue;
    var sp = e.def === 'radar' ? _r3dAliveSpots('radar') : null;
    if (!sp || !sp.spin) continue;
    draw(_r3dAntenna(R3, e.side), e.x + sp.spin[0] * A2W, _rtsElev(e.x, e.z) + sp.spin[1] * A2W,
         e.z + sp.spin[2] * A2W, t * 1.1 + e.id, 0, 1);
  }
  _r3dRubbleTick(G, R3);
  var n = 0;
  for (var id in R3.rubble) {
    var r = R3.rubble[id], age = t - r.t0;
    /* it slumps as it goes, to a quarter of its height, and settles out of sight at the end */
    var k = Math.min(1, age / 1.1), sy = 1 - 0.74 * k * k;
    var sink = Math.max(0, age - (R3D_RUBBLE_LIFE - 3)) / 3 * 12 * A2W;
    draw(_r3dMesh('b', r.def, r.side), r.x, _rtsElev(r.x, r.z) - sink, r.z, 0, 2, sy);
    n++;
  }
  R3.rubbleN = n;
}

/* The smoke off the stacks and the beacons, into the effects pass (fxemit3d.js). */
function _r3dFxAlive(G, V) {
  var R3 = window._R3D;
  if (!R3 || R3.aliveAmt === 0) return;
  var A2W = RTS_TILE / RTS_TS, vb = _r3dBoundsNear(_r3dViewBounds(), 10, 30), E = G.ents || [];
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.dead || e.type !== 'struct' || e.building) continue;
    if (e.x < vb.x0 || e.x > vb.x1 || e.z < vb.z0 || e.z > vb.z1) continue;
    var sp = _r3dAliveSpots(e.def);
    if (!sp) continue;
    var gy = _rtsElev(e.x, e.z), seed = _r3dFxH(e.id, 7.7), j, p;
    for (j = 0; j < sp.smoke.length; j++) {
      p = sp.smoke[j];
      _r3dFxColumn(V, e.x + p[0] * A2W, gy + p[1] * A2W, e.z + p[2] * A2W, 1.4, seed + j,
                   V.t + seed * 7 + j * 1.3, 0.42, R3D_STACK_SMOKE);
    }
    /* on for a fifth of every 1.4 seconds, each building on its own beat */
    var beat = (V.t + seed * 1.4) % 1.4;
    if (beat > 0.28) continue;
    for (j = 0; j < sp.beacon.length; j++) {
      p = sp.beacon[j];
      _r3dFxBill(V.M, V, e.x + p[0] * A2W, gy + p[1] * A2W, e.z + p[2] * A2W, 0.42, 0.42, 0.6,
                 R3D_FXT_FLASH, 0, seed, 1 - beat / 0.28 * 0.4, 0, R3D_BEACON_C);
    }
  }
}
