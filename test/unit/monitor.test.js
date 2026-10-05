/* THE RIVER MONITOR (rules/units.js `monitor`, core/monitor.js, the `shallow` domain in
   core/grid.js), on the real simulation:

     THE FLATS     at low water a dried flat is closed to a Destroyer and open to the Monitor:
                   sent there, the Monitor gets onto it and the Destroyer stops short; sitting
                   there it is not swamped; at high water both sail it
                   when the sea comes back over the flat it is not swamped, where a tank is
     NEVER ASHORE  sent onto dry land, it stops at the water; and it crowds with the other hulls
     THE SHORE     from the flats it shells a building that no ship can reach at low water
     WHOSE         the Dominion builds it, from its Sub Pen; the Compact does not
     THE OPPONENT  buys one once its own base is defended and the player has a building it can
                   reach from the water, not while undefended; on the ebb it sends it to shell
                   that building, and at high water it brings it home to the yard */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('monitor');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(army) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function W(tx, tz) { return { tx: tx, tz: tz, x: g._rtsWX(tx), z: g._rtsWX(tz) }; }
/* the sea at low water: the clock set to the bottom of the tide, the flats laid out and dried */
function lowWater(G) { G.t = g.RTS_TIDE.period / 2; g._rtsTideTick(0); }
function highWater(G) { G.t = g.RTS_TIDE.period; g._rtsTideTick(0); }
function yard(side, key) {
  var yd = g._rtsHas(side, 'yard'), best = null, bd = 1e9;
  for (var tz = 2; tz < g.RTS_N - 2; tz++) for (var tx = 2; tx < g.RTS_N - 2; tx++) {
    var d = Math.hypot(tx - yd.tx, tz - yd.tz);
    if (d < bd && g._rtsCanPlace(side, key, tx, tz, true)) { bd = d; best = [tx, tz]; }
  }
  if (!best) return null;
  var y = g._rtsPlaceStruct(side, key, best[0], best[1], true); if (y) y.building = 0;
  return y;
}
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };
function cellOf(u) { return g._rtsIdx(g._rtsTX(u.x), g._rtsTX(u.z)); }

/* The staging: a flat two cells out from a shore that dries at low water, with open water
   (which never dries) four cells further out on the same line - so the way in from the deep
   water to the flat is the way a ship would come. */
var G = fresh();
lowWater(G);
var F = null;
for (var i = 0; i < g.RTS_N * g.RTS_N && !F; i++) {
  if (G.tideD[i] !== 2 || !G.tideDry[i]) continue;
  var tx = i % g.RTS_N, tz = (i / g.RTS_N) | 0;
  for (var a = 0; a < 8 && !F; a++) {
    var dx = Math.round(Math.cos(a * Math.PI / 4)), dz = Math.round(Math.sin(a * Math.PI / 4));
    var ox = tx + dx * 4, oz = tz + dz * 4, ok = true;
    for (var k = 1; k <= 4; k++) { var c = g._rtsIdx(tx + dx * k, tz + dz * k); if (G.terrain[c] !== g.RTS_T_WATER) ok = false; }
    if (ok && !g._rtsBlocked(ox, oz, 'sea')) F = { flat: W(tx, tz), deep: W(ox, oz) };
  }
}
S.ok('the staging: a flat that dries, and deep water four cells out from it', !!F, F ? F.flat.tx + ',' + F.flat.tz + ' from ' + F.deep.tx + ',' + F.deep.tz : 'none');

/* ---------------- the flats ---------------- */
S.ok('at low water a dried flat is closed to a Destroyer and open to the Monitor',
     g._rtsBlocked(F.flat.tx, F.flat.tz, 'sea') && !g._rtsBlocked(F.flat.tx, F.flat.tz, 'shallow'), '');
function sendTo(key, high) {
  var G = fresh();
  if (high) highWater(G); else lowWater(G);
  var u = g._rtsSpawnUnit('enemy', key, F.deep.x, F.deep.z), hp = u.hp;
  g._rtsOrderMove(u, F.flat.x, F.flat.z, false);
  run(12, function () { if (high) highWater(G); else lowWater(G); });
  return { d: cells(u, F.flat), hurt: hp - u.hp, dry: !!G.tideDry[cellOf(u)] };
}
var mon = sendTo('monitor'), des = sendTo('destroyer'), desHigh = sendTo('destroyer', true);
S.ok('...sent there, the Monitor gets onto it', mon.d <= 1, mon.d.toFixed(1) + ' cells from the flat');
S.ok('...and the Destroyer stops short', des.d >= 1.5, des.d.toFixed(1) + ' cells from the flat');
S.ok('...sitting there the Monitor is on dry ground, unhurt', mon.dry && mon.hurt === 0, 'on a dry cell ' + mon.dry + ', ' + mon.hurt + ' hp lost');
/* ...and when the sea comes back over the flat it is not swamped, where a tank on the same flat is */
G = fresh(); lowWater(G);
var mS = g._rtsSpawnUnit('enemy', 'monitor', F.flat.x, F.flat.z), tS = g._rtsSpawnUnit('enemy', 'tank', F.flat.x, F.flat.z), mHp = mS.hp, tHp = tS.hp;
run(6, function () { G.t = 300; g._rtsTideTick(0); mS.x = F.flat.x; mS.z = F.flat.z; tS.x = F.flat.x; tS.z = F.flat.z; [mS, tS].forEach(function (u) { u.order = 'hold'; u.path = null; }); });
S.ok('...and when the sea comes back over it the Monitor is not swamped, where a tank on the same flat is', !G.tideDry[cellOf(mS)] && mS.hp === mHp && tS.hp < tHp,
     'the flat ' + (G.tideDry[cellOf(mS)] ? 'still dry' : 'under water again') + '; Monitor ' + mHp + ' -> ' + mS.hp.toFixed(0) + ', tank ' + tHp + ' -> ' + tS.hp.toFixed(0));
S.ok('...and at high water the Destroyer sails it too', desHigh.d <= 1, desHigh.d.toFixed(1) + ' cells from the flat');

/* ---------------- never ashore ---------------- */
G = fresh(); lowWater(G);
var land = g._rtsNearestOpen(F.flat.tx, F.flat.tz, 8, null);
var m2 = g._rtsSpawnUnit('enemy', 'monitor', F.deep.x, F.deep.z);
g._rtsOrderMove(m2, g._rtsWX(land[0]) + (g._rtsWX(land[0]) - F.flat.x) * 2, g._rtsWX(land[1]) + (g._rtsWX(land[1]) - F.flat.z) * 2, false);
run(15, function () { lowWater(G); });
S.ok('sent onto dry land, it stops at the water', G.terrain[cellOf(m2)] === g.RTS_T_WATER, 'on ' + (G.terrain[cellOf(m2)] === g.RTS_T_WATER ? 'water' : 'land'));

/* crowding: a Monitor and a Gunboat put on the same spot are pushed apart, as two ships are */
G = fresh(); highWater(G);
var mc = g._rtsSpawnUnit('enemy', 'monitor', F.deep.x, F.deep.z), gc = g._rtsSpawnUnit('enemy', 'gunboat', F.deep.x + 0.3, F.deep.z);
run(2, function () { highWater(G); [mc, gc].forEach(function (u) { u.order = 'hold'; u.path = null; }); });
S.ok('a Monitor and a Gunboat put on the same spot are pushed apart, as two ships are', Math.hypot(mc.x - gc.x, mc.z - gc.z) >= (mc.r + gc.r) * 0.8,
     (Math.hypot(mc.x - gc.x, mc.z - gc.z)).toFixed(2) + ' apart against ' + (mc.r + gc.r).toFixed(1));

/* ---------------- the shore ---------------- */
/* a building of the player's on the shore by the flat, out of a ship's reach from water that is
   open at low tide */
G = fresh(); lowWater(G);
/* The Monitor on the innermost flat, right under the shore, reaches six cells inland; a Destroyer
   standing off in the water past the flats reaches seven and a half from there, which is less.
   So: a cell for a pillbox whose nearest open sea at low water is beyond the Destroyer's gun,
   with a dried innermost flat within the Monitor's - anywhere on the map. */
var dReach = g.RTS_WEAPONS.navalheavy.range / g.RTS_TILE, reach = g.RTS_WEAPONS.monitorgun.range / g.RTS_TILE, pick = null;
for (var ptz = 3; ptz < g.RTS_N - 3 && !pick; ptz++) for (var ptx = 3; ptx < g.RTS_N - 3 && !pick; ptx++) {
  if (!g._rtsCanPlace('player', 'pillbox', ptx, ptz, true)) continue;
  var sn = g._rtsNearestOpen(ptx, ptz, 12, 'sea');
  if (sn && Math.hypot(sn[0] - ptx, sn[1] - ptz) <= dReach + 0.5) continue;
  for (var fz = -4; fz <= 4 && !pick; fz++) for (var fx = -4; fx <= 4 && !pick; fx++) {
    var fi = g._rtsIdx(ptx + fx, ptz + fz);
    if (g._rtsInB(ptx + fx, ptz + fz) && G.tideD[fi] === 1 && G.tideDry[fi] && Math.hypot(fx, fz) <= reach - 1.5) pick = { b: [ptx, ptz], f1: W(ptx + fx, ptz + fz), sea: sn && W(sn[0], sn[1]) };
  }
}
var tgt = pick && g._rtsPlaceStruct('player', 'pillbox', pick.b[0], pick.b[1], true); if (tgt) tgt.building = 0;
g._rtsTick(1 / 30);
/* the Destroyer first, alone, sent at it from the nearest open sea */
var t0 = tgt ? tgt.hp : 0, dd3 = tgt && pick.sea && g._rtsSpawnUnit('enemy', 'destroyer', pick.sea.x, pick.sea.z);
if (dd3) { g._rtsOrderAttack(dd3, tgt); run(15, function () { lowWater(G); }); }
var dHurt = tgt ? t0 - tgt.hp : 0, dOff = dd3 ? cells(dd3, tgt) : 0;
if (dd3) dd3.dead = true;
/* then the Monitor, from the flat */
var m3 = pick && g._rtsSpawnUnit('enemy', 'monitor', pick.f1.x, pick.f1.z);
if (m3) run(15, function () { lowWater(G); m3.order = m3.order === 'move' ? null : m3.order; });
S.ok('from the flats it shells a building that no Destroyer can reach at low water', !!tgt && !!dd3 && dHurt === 0 && dOff > dReach && (tgt.dead || tgt.hp < t0),
     tgt ? 'the Destroyer got ' + dOff.toFixed(1) + ' cells from it against a reach of ' + dReach + ' and took ' + dHurt + ' hp; the Monitor, ' + cells(pick.f1, tgt).toFixed(1) + ' cells off on the flat: ' + (tgt.dead ? 'destroyed' : t0 + ' -> ' + tgt.hp.toFixed(0)) : 'no shore cell on this map beyond a Destroyer\'s reach with a flat in the Monitor\'s');

/* ---------------- whose ---------------- */
function canBuild(army, key) {
  fresh(army);
  yard('player', 'refinery'); g._rtsRecalcPower('player');
  var y = yard('player', key); g._rtsRecalcPower('player');
  return !!y && !!g._rtsCanQueue('player', 'monitor');
}
S.ok('the Dominion builds it from its Sub Pen; the Compact does not', canBuild('soviet', 'subpen') && !canBuild('allied', 'navalyard'), '');
S.ok('...and not for want of a Sub Pen: the Compact may not build it at all', !g.rtsBuildableBy(g.rtsUnitDef('monitor'), 'allied') && g.rtsBuildableBy(g.rtsUnitDef('monitor'), 'soviet'), '');

/* ---------------- the opponent ---------------- */
G = fresh();
yard('enemy', 'refinery');
var ey = yard('enemy', 'subpen'), eyd = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', eyd.x + hv * 4, eyd.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', eyd.x, eyd.z + 24);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.ship && S2.q.ship.key === 'monitor') got++; }
  return got;
}
/* a building of the player's on the shore by the flat */
function onShore() {
  for (var r2 = 1; r2 < 8; r2++) for (var a2 = 0; a2 < 16; a2++) {
    var cx = Math.round(F.flat.tx + Math.cos(a2 * Math.PI / 8) * r2), cz = Math.round(F.flat.tz + Math.sin(a2 * Math.PI / 8) * r2);
    if (g._rtsCanPlace('player', 'pillbox', cx, cz, true)) { var b = g._rtsPlaceStruct('player', 'pillbox', cx, cz, true); b.building = 0; return b; }
  }
  return null;
}
var coast = onShore();
var undefended = buys(20);
var towers = [];
for (var df = 0; df < 4; df++) towers.push(yard('enemy', 'flametower'));
var defended = buys(20), aim = g._rtsAIMonitorTarget();
coast.dead = true; g._rtsTick(1 / 30);
var inland = buys(20), noAim = g._rtsAIMonitorTarget();
coast = onShore();
S.ok('the opponent buys one once its base is defended and the player has a building it can reach from the water', !!ey && defended > 3 && !!aim, defended + ' of 20; aimed at ' + (aim ? 'a ' + aim.def : 'nothing'));
S.ok('...not while undefended', !!coast && undefended === 0, undefended + ' of 20');
S.ok('...nor with every building of the player\'s out of its reach of the water', !noAim && inland === 0, inland + ' of 20; ' + (noAim ? 'a ' + noAim.def + ' still in reach' : 'nothing in reach'));
var em = g._rtsSpawnUnit('enemy', 'monitor', ey.x, ey.z), dk = g._rtsNearestOpen(ey.tx + 1, ey.tz + 1, 8, 'shallow');
em.x = g._rtsWX(dk[0]); em.z = g._rtsWX(dk[1]);
var first = g._rtsAIMonitorTarget(em), f0 = first ? first.hp : 0;
/* the clock at the ebb: the tide falling, the first flats dry (core/tide.js _rtsTideEbbing) */
G.t = 70; g._rtsTideTick(0);
run(90, function () { G.sides.enemy.q = {}; });
S.ok('...on the ebb it sends it to shell that building', !!first && (first.dead || first.hp < f0),
     first ? 'a ' + first.def + ': ' + (first.dead ? 'destroyed' : f0 + ' -> ' + first.hp.toFixed(0)) : 'none');
/* ...and at high water, out by the player's coast, it is brought home - breaking off its attack */
G.t = 350; g._rtsTideTick(0);                                        /* rising, and nearly high */
em.x = F.deep.x; em.z = F.deep.z; em.hp = em.maxHp;
var start = cells(em, ey), wentHome = false;
run(20, function () { G.sides.enemy.q = {}; if (em.order === 'move' && em.goal && cells(em.goal, ey) < 3) wentHome = true; });
S.ok('...and at high water it brings it home to the yard', wentHome && cells(em, ey) < start - 3 && em.order !== 'attack',
     (wentHome ? 'ordered home; ' : 'never ordered home; ') + start.toFixed(1) + ' -> ' + cells(em, ey).toFixed(1) + ' cells from the yard, order ' + em.order);

require('../lib/report.js')(S);
