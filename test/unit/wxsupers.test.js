/* WEATHER CALLED DOWN (core/wxsupers.js, rules/structures.js `mist` and `spire`):

     THE BUILDINGS  the Compact builds the Mist Tower and not the Storm Spire, the Dominion the
                    other way round, each behind a Tech Center; firing one spends its charge,
                    and a shot off the map is refused and spends nothing
     FOG BANK       a unit inside it sees three cells and no further, at its edge looking out
                    too; one outside it sees into
                    it only three cells, where it saw the far side before; an enemy tank inside
                    it is not seen from six cells and is from two; a long gun outside finds
                    nothing in it past three cells, nor does one inside find anything outside;
                    a gun given a target in it still shells it; after two minutes it is gone
     THUNDERHEAD    lightning every three seconds on the caller's enemy under it - an aircraft
                    first, nothing of the caller's ever, its own aircraft included - for 80 a
                    bolt; an armed aircraft caught in it goes home to its pad and stays down
                    until it has blown out, even sent away from it, then flies; after a minute
                    it is gone
     THE OPPONENT   fires its own Thunderhead at the player's base when it is charged */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('wxsupers');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(army, diff) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(4242, diff || 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function middle() {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, null);
  return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
function open(tx, tz) { var c = g._rtsNearestOpen(tx, tz, 3, null); return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) }; }
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
function ready(side, key) {
  var G = g.window._rtsG, st = G.sides[side];
  st.supers = st.supers || {};
  st.supers[key] = { t: 1e3, ready: true, said: true };
}
/* every unit pinned where it stands */
function pin() {
  g.window._rtsG.ents.forEach(function (e) { if (e.type === 'unit' && !e.dead && !e.air) { e.order = 'hold'; e.path = null; } });
}

/* ---------------- the buildings ---------------- */
function canBuild(army) {
  fresh(army);
  ['power', 'power', 'refinery', 'radar', 'lab'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  return { mist: !!g._rtsCanQueue('player', 'mist'), spire: !!g._rtsCanQueue('player', 'spire') };
}
var cmp = canBuild('allied'), dom = canBuild('soviet');
S.ok('the Compact builds the Mist Tower and not the Storm Spire', cmp.mist && !cmp.spire, JSON.stringify(cmp));
S.ok('...the Dominion the Storm Spire and not the Mist Tower', dom.spire && !dom.mist, JSON.stringify(dom));
var G = fresh('allied');
S.ok('...and neither before a Tech Center', !g._rtsCanQueue('player', 'mist'), '');
ready('player', 'fogbank');
var offMap = g._rtsSuperFire('player', 'fogbank', -5, -5);
var m = middle(), shot = g._rtsSuperFire('player', 'fogbank', m.tx, m.tz);
S.ok('a shot off the map is refused and spends nothing; one on it fires and spends the charge', !offMap && shot && !g._rtsSuperReady('player', 'fogbank') && G.wx.length === 1,
     'off ' + offMap + ', on ' + shot + ', cells ' + (G.wx || []).length);

/* ---------------- fog bank: sight ---------------- */
function farthestSeen(G, u, R) {
  G.ents.forEach(function (e) { if (e.side === 'player' && e !== u) e.dead = true; });
  G.visT = 1; g._rtsVisTick(0);
  var far = 0, tx = g._rtsTX(u.x), tz = g._rtsTX(u.z);
  for (var dz = -R; dz <= R; dz++) for (var dx = -R; dx <= R; dx++)
    if (g._rtsInB(tx + dx, tz + dz) && G.vis[g._rtsIdx(tx + dx, tz + dz)]) far = Math.max(far, Math.hypot(dx, dz));
  return far;
}
/* inside it */
G = fresh('allied'); m = middle();
var arty = g._rtsSpawnUnit('player', 'arty', m.x, m.z);
var clear = farthestSeen(G, arty, 11);
g._rtsFireFogBank('player', m.tx, m.tz);
var inBank = farthestSeen(G, arty, 11);
S.ok('a unit inside a fog bank sees three cells and no further', clear > 5 && inBank > 0 && inBank <= g.RTS_FOGBANK.see, 'clear ' + clear.toFixed(1) + ', in the bank ' + inBank.toFixed(1));
/* ...and that holds at its edge, looking OUT of it: the bank's middle six cells behind it */
G = fresh('allied'); m = middle();
var edge = g._rtsSpawnUnit('player', 'arty', m.x, m.z);
g._rtsFireFogBank('player', m.tx - (g.RTS_FOGBANK.r - 2), m.tz);
var fromEdge = farthestSeen(G, edge, 11);
S.ok('...and at its edge sees no further out of it', g._rtsInFogBank(edge.x, edge.z) && fromEdge > 0 && fromEdge <= g.RTS_FOGBANK.see, fromEdge.toFixed(1) + ' cells');
/* outside it, looking in: the bank's near edge four cells off */
function lookIn(withBank) {
  var G = fresh('allied'), m = middle();
  var eye = g._rtsSpawnUnit('player', 'arty', g._rtsWX(m.tx - g.RTS_FOGBANK.r - 4), m.z);
  if (withBank) g._rtsFireFogBank('enemy', m.tx, m.tz);
  farthestSeen(G, eye, 11);
  /* the bank's cells the eye's disc reaches, past three cells from it */
  var seen = 0, inDisc = 0;
  for (var dx = 1; dx <= 9; dx++) for (var dz = -3; dz <= 3; dz++) {
    var x = g._rtsTX(eye.x) + dx, z = g._rtsTX(eye.z) + dz;
    if (Math.hypot(g._rtsWX(x) - m.x, g._rtsWX(z) - m.z) > g.RTS_FOGBANK.r * g.RTS_TILE || Math.hypot(dx, dz) <= g.RTS_FOGBANK.see) continue;
    inDisc++; if (G.vis[g._rtsIdx(x, z)]) seen++;
  }
  return { seen: seen, of: inDisc };
}
var noBank = lookIn(false), bank = lookIn(true);
S.ok('one outside sees into it three cells only, where it saw that ground before', noBank.seen > 3 && bank.seen === 0,
     'without the bank ' + noBank.seen + ' of ' + noBank.of + ' cells, with it ' + bank.seen);
/* an enemy tank in it: unseen from six cells, seen from two */
function tankSeen(out) {
  var G = fresh('allied'), m = middle();
  var t = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z), p = open(m.tx - out, m.tz);
  g._rtsSpawnUnit('player', 'rifle', p.x, p.z);
  g._rtsFireFogBank('enemy', m.tx, m.tz);
  G.visT = 1; g._rtsVisTick(0);
  return g._rtsEntSeen(t);
}
S.ok('an enemy tank in it is not seen from six cells, and is from two', !tankSeen(6) && tankSeen(2), '');

/* ---------------- fog bank: finding a target ---------------- */
function duel(bankAt, out) {
  var G = fresh('allied'), m = middle();
  var a = g._rtsSpawnUnit('player', 'arty', m.x, m.z), p = open(m.tx + out, m.tz);
  var f = g._rtsSpawnUnit('enemy', 'tank', p.x, p.z);
  if (bankAt === 'target') g._rtsFireFogBank('player', p.tx, p.tz);
  if (bankAt === 'shooter') g._rtsFireFogBank('player', m.tx - g.RTS_FOGBANK.r + 2, m.tz);
  return { G: G, a: a, f: f, inA: g._rtsInFogBank(a.x, a.z), inF: g._rtsInFogBank(f.x, f.z),
           found: g._rtsFindTarget(a, Math.max(g.rtsUnitDef('arty').sight, g._rtsReach(a))) === f };
}
var d0 = duel(null, 6), d1 = duel('target', 6), d2 = duel('shooter', 6), d3 = duel('target', 2);
S.ok('a long gun finds a tank six cells off in the clear', d0.found, '');
S.ok('...not one in a fog bank', !d1.found, '');
S.ok('...nor, from inside a bank, one outside it', !d2.found && d2.inA && !d2.inF, 'shooter in ' + d2.inA + ', target in ' + d2.inF);
S.ok('...but finds one in a bank two cells off', d3.found, '');
var given = duel('target', 6);
g._rtsOrderAttack(given.a, given.f);
var hp0 = given.f.hp;
run(15, function () { given.f.path = null; given.f.target = null; given.f.order = 'hold'; });
S.ok('...and a gun given a target in the bank still shells it', given.f.dead || given.f.hp < hp0, given.f.hp + ' of ' + hp0);
run(g.RTS_FOGBANK.time - 14);
S.ok('after two minutes the bank is gone', !given.G.wx.some(function (c) { return c.kind === 'fog'; }), given.G.wx.length + ' cells left');

/* ---------------- thunderhead ---------------- */
G = fresh('soviet'); m = middle();
var pad = place('enemy', 'helipad');
var eh = g._rtsSpawnUnit('enemy', 'heli', pad.x + 8, pad.z), et = g._rtsSpawnUnit('enemy', 'tank', pad.x - 6, pad.z + 4);
var mine = g._rtsSpawnUnit('player', 'tank', pad.x, pad.z - 8);
/* and one of the caller's own aircraft, nearer the eye than anything of the enemy's */
var myHeli = g._rtsSpawnUnit('player', 'heli', pad.x, pad.z);
eh.ammo = 0;                                                     /* the heli is at its pad, rearming */
ready('player', 'thunder');
g._rtsSuperFire('player', 'thunder', g._rtsTX(pad.x), g._rtsTX(pad.z));
var storm = G.wx[0], hits = [], dmg0 = g._rtsDamage;
g._rtsDamage = function (t, d, from) { if (!from && d === g.RTS_THUNDER.dmg) hits.push(t); return dmg0.apply(this, arguments); };
var firstHit = null;
run(10, function () { pin(); if (!firstHit && hits.length) firstHit = hits[0]; });
S.ok('lightning every three seconds on the enemy under it', hits.length === 3, hits.length + ' bolts in 10 s');
S.ok('...an aircraft first', firstHit === eh, firstHit ? firstHit.def : 'none');
S.ok('...and nothing of the caller\'s, not even its aircraft nearer the eye', hits.length > 0 && hits.indexOf(mine) < 0 && hits.indexOf(myHeli) < 0 && hits.every(function (t) { return t.side === 'enemy'; }), hits.map(function (t) { return t.side + ' ' + t.def; }).join(', '));
g._rtsDamage = dmg0;
/* an armed aircraft flying into it */
G = fresh('allied'); m = middle();
var pp = place('player', 'helipad');
var heli = g._rtsSpawnUnit('player', 'heli', pp.x + 60, pp.z);
var eye = { tx: g._rtsTX(pp.x + 60), tz: g._rtsTX(pp.z) };
ready('enemy', 'thunder');
g._rtsSuperFire('enemy', 'thunder', eye.tx, eye.tz);
run(25, function () { if (!heli.dead) heli.hp = heli.maxHp; });
S.ok('an armed aircraft caught in it goes home to its pad', cells(heli, pp) <= 1.5, cells(heli, pp).toFixed(1) + ' cells from the pad');
var far = { x: pp.x + 60, z: pp.z }, away = { x: pp.x - 40, z: pp.z };
/* sent the other way from the storm: still held */
g._rtsOrderMove(heli, away.x, away.z, false);
run(10, function () { if (!heli.dead) heli.hp = heli.maxHp; });
S.ok('...and stays down while it lasts, even sent away from it', cells(heli, pp) <= 1.5 && G.wx.length === 1, cells(heli, pp).toFixed(1) + ' cells from the pad');
run(g.RTS_THUNDER.time - 33, function () { if (!heli.dead) heli.hp = heli.maxHp; });
var gone = !G.wx.length;
g._rtsOrderMove(heli, far.x, far.z, false);
run(8);
S.ok('after a minute it is gone, and the aircraft flies again', gone && cells(heli, pp) > 8, cells(heli, pp).toFixed(1) + ' cells from the pad');

/* ---------------- the opponent ---------------- */
G = fresh('allied', 'hard');
place('enemy', 'spire');                       /* a charge lives only while its building stands */
ready('enemy', 'thunder');
G.ai.superT = 0;
var py = g._rtsHas('player', 'yard');
run(1);
var called = (G.wx || []).filter(function (c) { return c.side === 'enemy' && c.kind === 'storm'; })[0];
S.ok('the opponent fires its charged Thunderhead at the player\'s base', !!called && Math.hypot(called.x - py.x, called.z - py.z) / g.RTS_TILE < 15,
     called ? Math.round(Math.hypot(called.x - py.x, called.z - py.z) / g.RTS_TILE) + ' cells from the yard' : 'not fired');

require('../lib/report.js')(S);
