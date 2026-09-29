/* What each effect is made of - render3d/fxemit3d.js.

   Explosions, fire, smoke and splashes are shaded quads now, placed from an effect's age alone,
   and every property the picture depends on is a property of the numbers this file emits: that
   the same record always gives the same quads, that a fireball's billows carry on into the fire
   it chains to, that a pop's billows are gone when its record is, that a fire on a building
   burns on its roof. Each is checked here against the emitter itself; e2e/fxshade checks the
   pictures they make. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('fxemit');
var g = load(['src/rules', 'src/core', 'src/sprites/bake.js', 'src/render3d/fxemit3d.js', 'src/render3d/fxwake3d.js',
              'src/render3d/fxlight3d.js']);
g.R3D_WATER_Y = 0.10;       /* render3d/world3d.js's, which this sandbox does not load */
var A = g.RTS_ANIMS, F = g.R3D_FX_STRIDE, Q = g.R3D_FX_QUAD;

/* a view the way fx3d.js builds one, over flat ground with a strip of sea at z < -40 */
function view(ground) {
  var V = g._r3dFxView();
  V.sp = 0.7546; V.cp = 0.6562; V.t = 3.25;
  V.ground = ground || function () { return 0; };
  V.water = function (x, z) { return z < -40; };
  return V;
}
function emit(fx, V) {
  g.window._rtsG = { fx: fx, byId: {}, ents: [] };
  V = V || view();
  g._r3dFxEmit(g.window._rtsG, V);
  return V;
}
/* the quads of one type in a batch, as { x, y, z (centre), op, k, heat, lift } */
function quads(B, type) {
  var out = [];
  for (var q = 0; q < B.n; q++) {
    var o = q * Q;
    if (B.a[o + 6] !== type) continue;
    var cx = 0, cy = 0, cz = 0;
    for (var v = 0; v < 6; v++) { cx += B.a[o + v * F]; cy += B.a[o + v * F + 1]; cz += B.a[o + v * F + 2]; }
    out.push({ x: cx / 6, y: cy / 6, z: cz / 6, lift: B.a[o + 5], k: B.a[o + 7], op: B.a[o + 9], heat: B.a[o + 10] });
  }
  return out;
}
function boom(t, big) { return { kind: 'boom', x: 10, y: 1, z: 20, t: t, big: big || 1.6 }; }

/* ---- stateless: the same record gives the same quads, every time ---- */
(function () {
  var a = emit([boom(0.3)]), b = emit([boom(0.3)]);
  var same = a.M.n === b.M.n && a.L.n === b.L.n;
  for (var i = 0; same && i < a.M.n * Q; i++) if (a.M.a[i] !== b.M.a[i]) same = false;
  S.ok('the same fireball at the same age is the same quads, every time', same && a.M.n > 10,
       a.M.n + ' quads, then ' + b.M.n);
  var c = emit([boom(0.31)]), moved = false;
  for (i = 0; !moved && i < Math.min(a.M.n, c.M.n) * Q; i++) if (a.M.a[i] !== c.M.a[i]) moved = true;
  S.ok('...and a hundredth of a second later it has moved on', moved, String(moved));
})();

/* ---- every kind this pass owns draws something; what it does not own it leaves alone ---- */
(function () {
  var kinds = ['boom', 'pop', 'hit', 'piff', 'splash', 'smoke', 'firebig', 'firemed', 'firesmall'], empty = [];
  kinds.forEach(function (k) {
    var V = emit([{ kind: k, x: 10, y: 1, z: k === 'splash' ? -60 : 20, t: A[k].dur * 0.3, big: 1, loops: 1 }]);
    if (!V.M.n) empty.push(k);
  });
  S.eq('every kind the 3D pass owns puts quads down', empty.join(','), '');
  var foreign = ['nuke', 'die', 'fire'].filter(function (k) {
    return emit([{ kind: k, x: 10, y: 1, z: 20, t: 0.1, big: 1, x2: 20, z2: 20 }]).M.n > 0 || g._r3dFxOwns(k);
  });
  S.eq('...and none of the kinds the 2D painter keeps', foreign.join(','), '');
  var shaded = g._r3dFxOwns('tracer') && g._r3dFxOwns('debris');
  g.RTS_FX_SPRITES = true;
  var sprites = g._r3dFxOwns('tracer') || g._r3dFxOwns('debris');
  g.RTS_FX_SPRITES = false;
  S.ok('tracers and debris are the 3D pass\'s when it shades, and the 2D painter\'s under the sprites',
       shaded && !sprites, 'shaded ' + shaded + ', sprites ' + sprites);
  S.eq('a delayed blast that has not started draws nothing', emit([boom(-0.1)]).M.n, 0);
})();

/* ---- the fireball: a flash and a glare at the start, gone soon after ---- */
(function () {
  var V0 = emit([boom(0.02)]), V1 = emit([boom(0.6)]);
  S.ok('a fireball starts with a flash and lights the ground round it',
       quads(V0.M, g.R3D_FXT_FLASH).length === 1 && V0.L.n > 0, quads(V0.M, g.R3D_FXT_FLASH).length + ' flash, ' + V0.L.n + ' glare quads');
  S.ok('...and both are gone by the time it is smoke', quads(V1.M, g.R3D_FXT_FLASH).length === 0 && V1.L.n === 0,
       quads(V1.M, g.R3D_FXT_FLASH).length + ' flash, ' + V1.L.n + ' glare quads');
  var hot = quads(V0.M, g.R3D_FXT_BLOB), cold = quads(emit([boom(0.7)]).M, g.R3D_FXT_BLOB);
  var hmax = Math.max.apply(null, hot.map(function (b) { return b.heat; }));
  var cmax = Math.max.apply(null, cold.map(function (b) { return b.heat; }));
  S.ok('its billows start hot and have cooled to smoke by the end of the record', hmax > 0.8 && cmax < 0.15,
       'hottest billow ' + hmax.toFixed(2) + ' at 0.02s, ' + cmax.toFixed(2) + ' at 0.7s');
  var y0 = hot.reduce(function (s, b) { return s + b.y; }, 0) / hot.length;
  var y1 = cold.reduce(function (s, b) { return s + b.y; }, 0) / cold.length;
  S.ok('...and have climbed', y1 > y0 + 1.5, 'mean height ' + y0.toFixed(2) + ' -> ' + y1.toFixed(2));
  var big = quads(emit([boom(0.3, 4)]).M, g.R3D_FXT_BLOB).length, small = quads(emit([boom(0.3, 0.8)]).M, g.R3D_FXT_BLOB).length;
  S.ok('a bigger blast is more billows, not just bigger ones', big > small, small + ' at big 0.8, ' + big + ' at big 4');
})();

/* ---- THE HAND-OFF: the billows carry on into the fire the fireball chains to ---- */
(function () {
  var dur = A.boom.dur, eps = 1e-4;
  var before = quads(emit([boom(dur - eps)]).M, g.R3D_FXT_BLOB);
  var fire = { kind: 'firesmall', x: 10, y: 1, z: 20, t: eps, big: 1.6 * 0.6, loops: A.firesmall.loops };
  var after = quads(emit([fire]).M, g.R3D_FXT_BLOB).filter(function (b) { return b.heat === 0 || b.op > 0; });
  /* the fire adds a smoke column of its own; the fireball's billows are the ones that were there */
  var matched = before.filter(function (b) {
    return after.some(function (c) { return Math.abs(c.x - b.x) < 0.01 && Math.abs(c.y - b.y) < 0.01 && Math.abs(c.z - b.z) < 0.01; });
  }).length;
  S.ok('the chained fire\'s first moment has every billow the fireball\'s last moment had, in place',
       before.length > 5 && matched === before.length, matched + ' of ' + before.length + ' billows carried over');
  var based = { kind: 'firesmall', x: 10, y: 1, z: 20, t: eps, big: 0.5, base: 0.9, loops: A.firesmall.loops };
  var plain = quads(emit([based]).M, g.R3D_FXT_BLOB).length;
  S.ok('...and a fire that did not grow out of a fireball has none of them', plain < before.length,
       plain + ' billows on a burning building\'s fire, against ' + after.length);
  var later = { kind: 'firesmall', x: 10, y: 1, z: 20, t: 0.2, big: 0.96, loops: A.firesmall.loops - 1 };
  S.ok('...nor does the same fire once its first loop is over',
       quads(emit([later]).M, g.R3D_FXT_BLOB).length < after.length, 'second loop');
})();

/* ---- a pop is a small quick fireball, and its billows end with its record ---- */
(function () {
  var dur = A.pop.dur;
  var mid = quads(emit([{ kind: 'pop', x: 0, y: 1, z: 20, t: dur * 0.3, big: 1.2 }]).M, g.R3D_FXT_BLOB);
  var end = quads(emit([{ kind: 'pop', x: 0, y: 1, z: 20, t: dur * 0.995, big: 1.2 }]).M, g.R3D_FXT_BLOB);
  var opm = mid.reduce(function (s, b) { return s + b.op; }, 0), ope = end.reduce(function (s, b) { return s + b.op; }, 0);
  S.ok('a pop\'s billows are there in the middle of it', opm > 1.5, 'total opacity ' + opm.toFixed(2));
  S.ok('...and all but gone when its record ends, so nothing vanishes at once', ope < 0.15 * opm,
       'total opacity ' + ope.toFixed(3) + ' at the last moment');
})();

/* ---- a fire on a building burns on its roof, and across it ---- */
(function () {
  var V = view();
  g.window._rtsG = { fx: [], ents: [], byId: { 7: { id: 7, type: 'struct', def: 'refinery', side: 'player', x: 10, z: 20 } } };
  g._r3dMesh = function () { return { top: 30 }; };
  var roof = 30 * g.RTS_TILE / g.RTS_TS;
  g.window._rtsG.fx = [{ kind: 'firebig', x: 10, y: 1, z: 20, t: 0.3, big: 2.2, att: 7, loops: 4 }];
  g._r3dFxEmit(g.window._rtsG, V);
  var fl = quads(V.M, g.R3D_FXT_FLAME);
  var low = Math.min.apply(null, fl.map(function (f) { return f.y; }));
  var xs = fl.map(function (f) { return f.x; }), spread = Math.max.apply(null, xs) - Math.min.apply(null, xs);
  S.ok('a burning building\'s flames stand on its roof', fl.length === 5 && low > roof * 0.7,
       fl.length + ' tongues, the lowest centred at ' + low.toFixed(1) + ' against a roof at ' + roof.toFixed(1));
  S.ok('...spread across it, not stacked in one spot', spread > 2, 'spread ' + spread.toFixed(2) + ' world units');
  var small = quads(emit([{ kind: 'firesmall', x: 10, y: 1, z: 20, t: 0.3, big: 0.5, base: 0.9, loops: 2 }]).M, g.R3D_FXT_FLAME).length;
  S.ok('...and a small fire is fewer tongues than a big one', small < fl.length, small + ' against ' + fl.length);
})();

/* ---- smoke thins as the last rung burns out ---- */
(function () {
  function total(loops) {
    return quads(emit([{ kind: 'smoke', x: 0, y: 1, z: 20, t: 0.3, big: 1, loops: loops }]).M, g.R3D_FXT_BLOB)
      .reduce(function (s, b) { return s + b.op; }, 0);
  }
  var full = total(A.smoke.loops), last = total(1);
  S.ok('a smoke column is thick when it starts and thin on its last loop', last < full * 0.5 && last > 0,
       'total opacity ' + full.toFixed(2) + ' -> ' + last.toFixed(2));
})();

/* ---- patches lie ON the ground, and ride over the swell at sea ---- */
(function () {
  var slope = function (x, z) { return x * 0.3 + z * 0.1; };
  var V = emit([boom(0.1)], view(slope)), off = 0, n = 0;
  for (var q = 0; q < V.L.n; q++) for (var v = 0; v < 6; v++) {
    var o = q * Q + v * F;
    off = Math.max(off, Math.abs(V.L.a[o + 1] - slope(V.L.a[o], V.L.a[o + 2]) - 0.12)); n++;
  }
  S.ok('the glare follows the ground under every corner, on a slope', n > 50 && off < 1e-4,
       n + ' corners, furthest ' + off.toExponential(1) + ' off the ground');
  var sea = emit([{ kind: 'splash', x: 0, y: 1, z: -60, t: 0.1, big: 1.4 }]), land = emit([boom(0.1)]);
  var rs = quads(sea.M, g.R3D_FXT_RING), rl = quads(land.M, g.R3D_FXT_RING);
  S.ok('a patch on the sea is lifted clear of the swell, one on land is not',
       rs.length && rs.every(function (r) { return r.lift >= g.R3D_FX_SEA_LIFT; }) && rl.every(function (r) { return r.lift < g.R3D_FX_SEA_LIFT; }),
       'sea ' + (rs[0] && rs[0].lift) + ', land ' + (rl[0] && rl[0].lift));
})();

/* ---- rounds in flight, at the height they fly at ---- */
(function () {
  g._rtsVisible = function () { return true; };
  function flying(p) { g.window._rtsG = { fx: [], proj: [p], byId: {}, ents: [] }; var V = view(); g._r3dFxEmit(g.window._rtsG, V); return V; }
  var shooter = { id: 5, x: 0, z: 20 };
  var shell = flying({ kind: 'shell', x: 12, y: 1.4, z: 20, vx: 60, vz: 0, from: shooter });
  var bolt = quads(shell.M, g.R3D_FXT_STREAK);
  S.ok('a shell in flight is a hot bolt at the height it flies at',
       bolt.length === 1 && Math.abs(bolt[0].y - 1.4) < 0.01 && bolt[0].x < 12 && bolt[0].x > 10,
       bolt.length + ' bolt, centred at x ' + (bolt[0] && bolt[0].x.toFixed(2)) + ' y ' + (bolt[0] && bolt[0].y.toFixed(2)));
  function trailLen(V) {
    var o = null;
    for (var q = 0; q < V.M.n; q++) if (V.M.a[q * Q + 6] === g.R3D_FXT_TRAIL) o = q * Q;
    if (o === null) return -1;
    var xs = [0, 1, 2, 3, 4, 5].map(function (v) { return V.M.a[o + v * F]; });
    return Math.max.apply(null, xs) - Math.min.apply(null, xs);
  }
  var young = trailLen(flying({ kind: 'missile', x: 3, y: 1.4, z: 20, vx: 34, vz: 0, from: shooter }));
  var old = trailLen(flying({ kind: 'missile', x: 30, y: 1.4, z: 20, vx: 34, vz: 0, from: shooter }));
  S.ok('a rocket leaves a smoke trail that reaches back to its launcher and no further', young > 2.9 && young < 3.1 && old > 8.9 && old < 9.1,
       'trail ' + young.toFixed(2) + ' long three units out, ' + old.toFixed(2) + ' thirty units out (capped at 9)');
  var leaving = quads(flying({ kind: 'shell', x: 1.5, y: 1.4, z: 20, vx: 60, vz: 0, from: shooter }).M, g.R3D_FXT_FLASH);
  var away = quads(flying({ kind: 'shell', x: 12, y: 1.4, z: 20, vx: 60, vz: 0, from: shooter }).M, g.R3D_FXT_FLASH);
  var muzzle = leaving.filter(function (f) { return Math.abs(f.x - 1.2) < 0.01; });
  S.ok('a shell just out of the barrel flashes at the muzzle, and only then',
       muzzle.length === 1 && muzzle[0].op > 0.4 && away.every(function (f) { return Math.abs(f.x - 1.2) > 0.01; }),
       leaving.length + ' flashes leaving the barrel, ' + away.length + ' twelve units out');
  g._rtsVisible = function () { return false; };
  S.eq('...and nothing in flight is drawn where the player cannot see', flying({ kind: 'shell', x: 12, y: 1.4, z: 20, vx: 60, vz: 0, from: shooter }).M.n, 0);
  g._rtsVisible = function () { return true; };
})();

/* ---- a round, and a chunk of a building ---- */
(function () {
  var tr = { kind: 'tracer', x: 0, y: 1.3, z: 20, x2: 20, y2: 1.3, z2: 20, t: 0.02 };
  var V = emit([tr]);
  S.ok('a round is a streak with a flash at the muzzle as it leaves',
       quads(V.M, g.R3D_FXT_STREAK).length === 1 && quads(V.M, g.R3D_FXT_FLASH).length === 1, V.M.n + ' quads');
  tr.t = 0.07;
  S.eq('...and gone once it has landed', emit([tr]).M.n, 0);
  var chunk = { kind: 'debris', x: 0, y: 3, z: 20, t: 0.05, vx: 5, vy: 4, vz: 1, big: 1 };
  var hot = quads(emit([chunk]).M, g.R3D_FXT_BLOB)[0];
  chunk.t = 0.9;
  var cold = quads(emit([chunk]).M, g.R3D_FXT_BLOB)[0];
  S.ok('a chunk of a building flies at its own height, glowing at first and dark once it cools',
       hot && Math.abs(hot.y - 3.15) < 0.01 && hot.heat > 0.8 && cold.heat === 0,
       'at y ' + (hot && hot.y.toFixed(2)) + ', heat ' + (hot && hot.heat.toFixed(2)) + ' -> ' + (cold && cold.heat));
})();

/* ---- what moving things leave behind: dust off the tracks, a wake off the hull ---- */
(function () {
  var N = g.RTS_N;
  function ground(kind) {
    var t = new Uint8Array(N * N); t.fill(kind);
    return t;
  }
  function moving(def, kind, extra) {
    var u = Object.assign({ id: 12, type: 'unit', def: def, side: 'player', x: 20, z: 20, rot: 0, path: [{ x: 60, z: 20 }] }, extra || {});
    g.window._rtsG = { fx: [], proj: [], ents: [u], byId: {}, terrain: ground(kind) };
    var V = view();
    g._r3dFxEmit(g.window._rtsG, V);
    return quads(V.M, g.R3D_FXT_BLOB);
  }
  g._rtsVisible = function () { return true; };
  var sand = moving('tank', g.RTS_T_SAND), grass = moving('tank', g.RTS_T_GRASS);
  var behind = sand.every(function (b) { return b.x < 20; });
  var opS = sand.reduce(function (a, b) { return a + b.op; }, 0), opG = grass.reduce(function (a, b) { return a + b.op; }, 0);
  S.ok('a tank on the move over sand throws dust, and all of it behind it', sand.length === 4 && behind && opS > 0.5,
       sand.length + ' puffs, opacity ' + opS.toFixed(2) + ', behind: ' + behind);
  S.ok('...less off grass', opG > 0 && opG < opS * 0.5, 'opacity ' + opG.toFixed(2) + ' against ' + opS.toFixed(2));
  S.eq('...and none when it is parked', moving('tank', g.RTS_T_SAND, { path: null }).length, 0);
  S.eq('...nor off soldiers\' boots, nor from anything in the air',
       moving('rifle', g.RTS_T_SAND).length + moving('tank', g.RTS_T_SAND, { air: true }).length, 0);
  g._rtsVisible = function () { return false; };
  S.eq('...nor where the player cannot see', moving('tank', g.RTS_T_SAND).length, 0);
  g._rtsVisible = function () { return true; };
  var u = { id: 13, type: 'unit', def: 'gunboat', side: 'player', x: 20, z: -60, rot: 0, path: [{ x: 60, z: -60 }] };
  g.window._rtsG = { fx: [], proj: [], ents: [u], byId: {}, terrain: ground(g.RTS_T_WATER) };
  var V = view();
  g._r3dFxEmit(g.window._rtsG, V);
  var wake = null;
  for (var q = 0; q < V.M.n; q++) if (V.M.a[q * Q + 6] === g.R3D_FXT_TRAIL) wake = q * Q;
  var ys = [], xs = [];
  if (wake !== null) for (var v = 0; v < 6; v++) { ys.push(V.M.a[wake + v * F + 1]); xs.push(V.M.a[wake + v * F]); }
  S.ok('a ship under way lays a wake on the water behind it, lifted clear of the swell',
       wake !== null && ys.every(function (y) { return Math.abs(y - 0.24) < 1e-4; }) && Math.max.apply(null, xs) < 20 &&
       V.M.a[wake + 5] >= g.R3D_FX_SEA_LIFT,
       wake === null ? 'no wake' : 'at y ' + ys[0].toFixed(2) + ', from x ' + Math.min.apply(null, xs).toFixed(1) + ' to ' + Math.max.apply(null, xs).toFixed(1));
})();

/* ---- what is burning lights its neighbours (fxlight3d.js) ---- */
(function () {
  var V = { t: 3.25, ground: function () { return 0; } };
  g.window._rtsG = { fx: [], ents: [], byId: {} };
  var fresh = g._r3dFxLightOf(boom(0.02), V), old = g._r3dFxLightOf(boom(0.7), V);
  S.ok('a fresh fireball is a strong light, reaching well past its own fire', fresh[4] > 2 && fresh[3] > g.R3D_FX_R * 1.6 * 3,
       'strength ' + fresh[4].toFixed(2) + ', reach ' + fresh[3].toFixed(1));
  S.ok('...and it fades as the fireball cools', old[4] < fresh[4] * 0.1, 'strength ' + old[4].toFixed(3) + ' at 0.7s');
  var fire = { kind: 'firemed', x: 0, y: 1, z: 20, t: 0.3, big: 1.2, loops: 3 }, lo = 9, hi = 0;
  for (var t = 0; t < 2; t += 0.05) { V.t = t; var fl = g._r3dFxLightOf(fire, V)[4]; lo = Math.min(lo, fl); hi = Math.max(hi, fl); }
  S.ok('a fire burns steadily, flickering', lo > 0.5 && hi < 1.0 && hi - lo > 0.1, 'strength ' + lo.toFixed(2) + ' to ' + hi.toFixed(2));
  S.eq('smoke gives no light', g._r3dFxLightOf({ kind: 'smoke', x: 0, y: 1, z: 20, t: 0.3, big: 1, loops: 3 }, V), null);
  /* the heat haze's columns (heat3d.js) ride on the same list, in the sixth place */
  var hit = g._r3dFxLightOf({ kind: 'hit', x: 0, y: 1, z: 20, t: 0.02, big: 1 }, V);
  S.ok('a fireball and a fire send a column of heat up, a round striking armour none',
       fresh[5] > 1 && g._r3dFxLightOf(fire, V)[5] > 1 && hit && hit[5] === 0,
       'fireball ' + fresh[5].toFixed(2) + ', fire ' + g._r3dFxLightOf(fire, V)[5].toFixed(2) + ', hit ' + (hit && hit[5]));

  var pos, col, P = 'prog', gl = { getUniformLocation: function (p, n) { return n; },
    uniform4fv: function (n, a) { pos = Array.prototype.slice.call(a); }, uniform3fv: function (n, a) { col = Array.prototype.slice.call(a); } };
  var R3 = {}, G = { t: 0, fx: [boom(0.6, 1), boom(0.02, 1.6), boom(0.3, 1.6), { kind: 'smoke', x: 0, y: 1, z: 20, t: 0.3, big: 1, loops: 3 }] };
  G.fx[1].x = 30; G.fx[2].x = -30;
  g._r3dFxLightSet(gl, R3, G, P);
  S.ok('the strongest light takes the first slot', pos[0] === 30 && col[0] > col[3] && col[3] > col[6],
       'slots at x ' + [pos[0], pos[4], pos[8]].join(', ') + ', red ' + [col[0], col[3], col[6]].map(function (v) { return v.toFixed(2); }).join(', '));
  S.ok('...and a slot with nothing to light has no reach, and sits far below the map', pos[15] === 0 && pos[13] < -1000 && col[9] === 0,
       'slot 4: reach ' + pos[15] + ', y ' + pos[13]);
  S.ok('...and the haze is handed the same lights, strongest first', R3.plList && R3.plList.length === 3 && R3.plList[0][0] === 30,
       (R3.plList || []).length + ' in the list, the first at x ' + (R3.plList && R3.plList[0][0]));
  R3.plightAmt = 0; g._r3dFxLightSet(gl, R3, G, P);
  S.ok('R3.plightAmt 0 puts every light out', col.every(function (v) { return v === 0; }), col.slice(0, 3).join(','));
})();

/* ---- back to front ---- */
(function () {
  var V = emit([boom(0.3), boom(0.3, 1), { kind: 'smoke', x: -20, y: 1, z: 60, t: 0.3, big: 1, loops: 3 },
                { kind: 'firemed', x: 30, y: 1, z: -10, t: 0.3, big: 1, loops: 3 }]);
  var out = g._r3dFxOrder(V), M = V.M, ok = true, same = true, depth = true;
  for (var i = 0; i < M.n; i++) {
    if (i && M.key[V.ord[i]] < M.key[V.ord[i - 1]]) ok = false;
    for (var j = 0; j < Q && same; j++) if (out[i * Q + j] !== M.a[V.ord[i] * Q + j]) same = false;
    /* a standing quad's key is its centre's depth toward the eye */
    var o = V.ord[i] * Q;
    if (M.a[o + 6] !== g.R3D_FXT_RING) {
      var cy = 0, cz = 0;
      for (var v = 0; v < 6; v++) { cy += M.a[o + v * F + 1]; cz += M.a[o + v * F + 2]; }
      if (Math.abs(M.key[V.ord[i]] - ((cz / 6) * V.sp + (cy / 6) * V.cp)) > 1e-3) depth = false;
    }
  }
  S.ok('each quad is keyed by its depth toward the eye', depth, String(depth));
  S.ok('...and they go down farthest first, so a near puff covers a far one', ok && same && M.n > 30,
       M.n + ' quads, ' + (ok ? 'in order' : 'OUT of order') + (same ? '' : ', and the copy does not match'));
  S.eq('...losing none', out.length, M.n * Q);
})();

require('../lib/report.js')(S);
