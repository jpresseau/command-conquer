/* AIRCRAFT KEEP THEIR DISTANCE, AND TAKE TURNS ON A PAD (core/airspace.js), played out on the
   real simulation without a screen.

     A STACK       five Attack Helis at exactly one point part, every one of them the gap from
                   every other within a few seconds - and the same stack parts the same way
     A SWARM       sent at one place, they arrive apart, not on top of each other
     THE PAD       three coming home to one pad land one at a time, the rest waiting beside it,
                   and every one of them is rearmed in the end
     TWO PADS      two coming home with two pads take one each, at the same time
     THE GROUND    a tank does not care: the aircraft's gap is kept among aircraft only */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('airspace');
function fresh() {
  var g = load(['src/rules', 'src/core', 'src/map']);
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  return g;
}
function helis(g, n, x, z) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(g._rtsSpawnUnit('player', 'heli', x, z));
  return out;
}
function minGap(list) {
  var m = 1e9;
  for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) m = Math.min(m, Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z));
  return m;
}
function run(g, sec, each) { for (var t = 0; t < sec * 30; t++) { g._rtsTick(1 / 30); if (each) each(); } }

/* ---- A STACK ---- */
var g = fresh(), yd = g._rtsHas('player', 'yard'), x0 = yd.x + 30, z0 = yd.z + 30;
var stack = helis(g, 5, x0, z0);
var gap0 = minGap(stack);
run(g, 4);
var GAP = g.RTS_AIR_GAP, after = minGap(stack);
S.ok('five helicopters at one point part, each the gap from every other within seconds', gap0 === 0 && after >= GAP * 0.95,
     'from ' + gap0 + ' to ' + after.toFixed(2) + ' (gap ' + GAP + ')');
var g2 = fresh(), again = helis(g2, 5, x0, z0);
run(g2, 4);
S.ok('...and the same stack parts the same way every time', again.every(function (h, i) { return Math.abs(h.x - stack[i].x) < 1e-9 && Math.abs(h.z - stack[i].z) < 1e-9; }));

/* ---- A SWARM ---- */
var g3 = fresh(), sw = helis(g3, 6, x0 - 40, z0);
sw.forEach(function (h) { g3._rtsOrderMove(h, x0 + 20, z0 + 10); });
run(g3, 8);
S.ok('six sent at one place arrive apart', minGap(sw) >= GAP * 0.9, 'closest pair ' + minGap(sw).toFixed(2));

/* ---- THE PAD ---- */
var g4 = fresh(), G4 = g4.window._rtsG;
G4.ents.forEach(function (e) { if (e.type === 'struct' && (g4.rtsStructDef(e.def) || {}).rearm) e.dead = true; });
var yd4 = g4._rtsHas('player', 'yard'), spot = g4._rtsNearestOpen(yd4.tx + 6, yd4.tz + 6, 14, null);
var pad = g4._rtsPlaceStruct('player', 'helipad', spot[0], spot[1], true);
/* from three sides: the gap alone keeps a second machine off a pad it approaches from the same
   side as the first, so the queue is only tested by machines that come in from elsewhere */
var home = [0, 1, 2].map(function (k) { var a = k * 2.1; return g4._rtsSpawnUnit('player', 'heli', pad.x + Math.cos(a) * 30, pad.z + Math.sin(a) * 30); });
var full = g4.rtsUnitDef('heli').ammo;
home.forEach(function (h) { h.ammo = 0; });
var most = 0, rearmed = {};
run(g4, 40, function () {
  var on = home.filter(function (h) { return h.rearming > 0; });
  most = Math.max(most, on.length);
  home.forEach(function (h, i) { if (h.ammo === full) rearmed[i] = 1; });
});
S.ok('three coming home to one pad land on it one at a time', most === 1, most + ' on the pad at once, at the most');
S.ok('...and every one of them is rearmed in the end', Object.keys(rearmed).length === 3, Object.keys(rearmed).length + ' of 3');

/* ---- TWO PADS ---- */
var spot2 = g4._rtsNearestOpen(yd4.tx - 8, yd4.tz + 6, 14, null), pad2 = g4._rtsPlaceStruct('player', 'helipad', spot2[0], spot2[1], true);
var two = helis(g4, 2, (pad.x + pad2.x) / 2, pad.z + 30), both = 0, pads = {};
two.forEach(function (h) { h.ammo = 0; });
run(g4, 20, function () {
  var on = two.filter(function (h) { return h.rearming > 0; });
  if (on.length === 2) both++;
  on.forEach(function (h) { pads[Math.hypot(h.x - pad.x, h.z - pad.z) < Math.hypot(h.x - pad2.x, h.z - pad2.z) ? 'a' : 'b'] = 1; });
});
S.ok('two coming home with two pads take one each, at the same time', both > 0 && pads.a && pads.b, both + ' ticks both rearming, pads ' + Object.keys(pads).join(''));

/* ---- THE GROUND ---- */
var g5 = fresh(), h5 = g5._rtsSpawnUnit('player', 'heli', x0, z0), t5 = g5._rtsSpawnUnit('player', 'tank', x0, z0);
var tx = t5.x, tz = t5.z, hx = h5.x, hz = h5.z;
for (var k = 0; k < 30; k++) g5._rtsAirSpread(1 / 30);
S.ok('the gap is kept among aircraft only: a tank under a helicopter is not shoved, nor it', t5.x === tx && t5.z === tz && h5.x === hx && h5.z === hz);

require('../lib/report.js')(S);
