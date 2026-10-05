/* THE NEW ORDERS, given the way a player gives them (ui/select.js _rtsRightClick, ui/hud.js
   _rtsActionAt) on the real simulation - core/bomber.js, core/drone.js:

     A PLACE        a loaded bomber on attack-move, right-clicked on bare ground, lays its eight
                    bombs in a line centred on that spot, and the player is told; plainly
                    right-clicked there, it only flies there
     IT WAITS       sent at a building while it loads on its pad, it is told it will fly once
                    loaded - and does, and the building is bombed; sent at a place the same;
                    a later move order, or hold, drops the waiting run
     A BAY OPEN     sent somewhere new in the middle of a run, it lays the rest of that line first,
                    then flies the new run once it has loaded again
     SHADOWED       a drone sent at an enemy tank driving across the map circles over it all the
                    way; sent onto one of yours, the same; the enemy unseen, it lets go; a new
                    order ends it
     THE CURSOR     bombers alone on attack-move show the reticle over bare ground; with a tank in
                    the selection, attack-move; an aircraft over the sea is a move, a tank there a
                    refusal */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('strike');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js', 'src/ui']);
var said = [];
g.window._rtsSay = g._rtsSay = function (m) { said.push(m); var G = g.window._rtsG; G.msg = m; G.msgT = 4; };

function fresh() {
  g.window._RTS_ARMY = 'allied';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  g.window._rtsUI = { place: null, mode: null, attackMove: false, keys: {} };
  said.length = 0;
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each && each() === true) return true; g._rtsTick(1 / 30); } return false; }
function open(tx, tz) { var c = g._rtsNearestOpen(tx, tz, 6, null); return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) }; }
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) { var b = g._rtsPlaceStruct(side, k, sp[0], sp[1], true); if (b) b.building = 0; return b; }
  }
  return null;
}
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };
function order(sel, hit, amove) {
  var G = g.window._rtsG;
  G.sel = sel.slice();
  g.window._rtsUI.attackMove = !!amove;
  g._rtsRightClick(0, 0, hit);
  g.window._rtsUI.attackMove = false;
}
/* bombs as they leave the bay, from G.bombs - the line's centre and count */
function watcher(G) {
  var seen = [];
  return { seen: seen, tick: function () { (G.bombs || []).forEach(function (b) { if (seen.indexOf(b) < 0) seen.push(b); }); },
    near: function (p, R) { return seen.filter(function (b) { return Math.hypot(b.x - p.x, b.z - p.z) <= R * g.RTS_TILE; }).length; },
    centre: function (list) { list = list || seen; var c = { x: 0, z: 0 }; list.forEach(function (b) { c.x += b.x / list.length; c.z += b.z / list.length; }); return c; } };
}
var M = g.RTS_N >> 1;

/* ---------------- a place ---------------- */
var G = fresh(), pad = place('player', 'helipad');
var from = open(M - 12, M), P = open(M + 6, M + 2);
var bm = g._rtsSpawnUnit('player', 'bomber', from.x, from.z);
var W = watcher(G);
order([bm], { ent: null, x: P.x, z: P.z }, true);
var gave = bm.order, sayP = said.slice();
run(25, W.tick);
var c1 = W.centre();
S.ok('a loaded bomber on attack-move, right-clicked on bare ground, lays its eight bombs in a line centred on that spot',
     gave === 'bomb' && W.seen.length === 8 && cells(c1, P) <= 1.0, gave + ', ' + W.seen.length + ' bombs, centred ' + cells(c1, P).toFixed(2) + ' cells from the spot');
S.ok('...and the player is told', sayP.indexOf('Bombing run on the marked ground.') >= 0, JSON.stringify(sayP));
G = fresh(); pad = place('player', 'helipad');
bm = g._rtsSpawnUnit('player', 'bomber', from.x, from.z);
W = watcher(G);
order([bm], { ent: null, x: P.x, z: P.z }, false);
var plain = bm.order;
run(12, W.tick);
S.ok('...plainly right-clicked there, it flies there and lays nothing', plain === 'move' && W.seen.length === 0 && cells(bm, P) < 3,
     plain + ', ' + W.seen.length + ' bombs, ' + cells(bm, P).toFixed(1) + ' cells from it');

/* ---------------- it waits ---------------- */
G = fresh(); pad = place('player', 'helipad');
var tgt = g._rtsHas('enemy', 'yard');
bm = g._rtsSpawnUnit('player', 'bomber', pad.x, pad.z);
bm.ammo = 0; bm.rearming = 6;                                  /* on its pad, loading */
W = watcher(G);
order([bm], { ent: tgt, x: tgt.x, z: tgt.z });
var waiting = !!(bm.bombNext && bm.bombNext.id === tgt.id), toldW = said.join(' | ');
run(70, function () { W.tick(); return W.near(tgt, 4) >= 6; });
S.ok('sent at a building while it loads on its pad, it is told it will fly once loaded', waiting && /flies that run once loaded/.test(toldW), toldW);
S.ok('...and does: the building is bombed after the reload', W.near(tgt, 4) >= 6, W.near(tgt, 4) + ' of ' + W.seen.length + ' bombs within four cells of it');
G = fresh(); pad = place('player', 'helipad');
bm = g._rtsSpawnUnit('player', 'bomber', pad.x, pad.z);
bm.ammo = 0; bm.rearming = 6;
W = watcher(G);
order([bm], { ent: null, x: P.x, z: P.z }, true);
var waitP = !!(bm.bombNext && bm.bombNext.x === P.x);
run(60, function () { W.tick(); return W.seen.length >= 8; });
S.ok('...sent at a place while it loads, the same: the line goes down there once it is loaded', waitP && W.seen.length === 8 && cells(W.centre(), P) <= 1.0,
     'waiting ' + waitP + ', ' + W.seen.length + ' bombs, centred ' + (W.seen.length ? cells(W.centre(), P).toFixed(2) : '-') + ' cells from the spot');
bm.ammo = 0; bm.rearming = 6;
order([bm], { ent: tgt, x: tgt.x, z: tgt.z });
var w1 = !!bm.bombNext;
order([bm], { ent: null, x: P.x, z: P.z }, false);
var afterMove = bm.bombNext;
order([bm], { ent: tgt, x: tgt.x, z: tgt.z });
var w2 = !!bm.bombNext;
G.sel = [bm]; g._rtsHoldSelected();
S.ok('...and a later move order, or hold, drops the waiting run', w1 && afterMove === null && w2 && bm.bombNext === null, JSON.stringify([w1, afterMove, w2, bm.bombNext]));

/* ---------------- a bay open ---------------- */
G = fresh(); pad = place('player', 'helipad');
var P1 = open(M - 2, M - 4), P2 = open(M + 2, M + 8);
bm = g._rtsSpawnUnit('player', 'bomber', from.x, from.z);
W = watcher(G);
order([bm], { ent: null, x: P1.x, z: P1.z }, true);
var opened = run(20, function () { W.tick(); return bm.run && bm.run.k >= 2; });
order([bm], { ent: null, x: P2.x, z: P2.z }, true);
var kept = !!(bm.bombNext && bm.bombNext.x === P2.x) && !!bm.run;
run(90, function () { W.tick(); return W.seen.length >= 16; });
var first = W.seen.slice(0, 8), second = W.seen.slice(8);
S.ok('sent somewhere new in the middle of a run, it lays the rest of that line first', opened && kept && first.length === 8 && cells(W.centre(first), P1) <= 1.0,
     'bay open ' + opened + ', new aim kept ' + kept + ', first line ' + first.length + ' bombs centred ' + (first.length ? cells(W.centre(first), P1).toFixed(2) : '-') + ' cells from the first spot');
S.ok('...then flies the new run once it has loaded again', second.length === 8 && cells(W.centre(second), P2) <= 1.0,
     second.length + ' bombs, centred ' + (second.length ? cells(W.centre(second), P2).toFixed(2) : '-') + ' cells from the second spot');

/* ---------------- shadowed ---------------- */
G = fresh();
var s0 = open(M - 8, M), s1 = open(M + 10, M + 3);
var et = g._rtsSpawnUnit('enemy', 'tank', s0.x, s0.z), dr = g._rtsSpawnUnit('player', 'drone', s0.x - 3 * g.RTS_TILE, s0.z);
g._rtsTick(1 / 30);
order([dr], { ent: et, x: et.x, z: et.z });
var shadowing = dr.orbitOn === et.id, toldS = said.join(' | ');
var worst = 0, drive = function () { if (!et.path || et.pi >= et.path.length) g._rtsOrderMove(et, s1.x, s1.z, false); et.target = null; };
run(30, function () { drive(); if (G.t > 3 && dr.orbit) worst = Math.max(worst, cells(dr.orbit, et)); });
S.ok('a drone sent at an enemy tank driving across the map circles over it all the way', shadowing && cells(et, s0) >= 10 && worst <= g.RTS_DRONE.follow + 1.5 && cells(dr, et) <= g.RTS_DRONE.r + g.RTS_DRONE.follow + 2,
     'the tank drove ' + cells(et, s0).toFixed(1) + ' cells; the circle\'s centre was never more than ' + worst.toFixed(1) + ' cells off it; the drone ends ' + cells(dr, et).toFixed(1) + ' cells from it');
S.ok('...and the player is told', /Drone shadowing the /.test(toldS), toldS);
var seen0 = g._rtsEntSeen;
g._rtsEntSeen = function (e) { return e === et ? false : seen0(e); };
run(0.2);
g._rtsEntSeen = seen0;
S.ok('...the enemy unseen - a boat diving - it lets go', dr.orbitOn == null, String(dr.orbitOn));
var own = g._rtsSpawnUnit('player', 'tank', s1.x, s1.z);
order([dr], { ent: own, x: own.x, z: own.z });
var onOwn = dr.orbitOn === own.id;
order([dr], { ent: null, x: s0.x, z: s0.z });
run(0.2);
S.ok('...sent onto one of yours it shadows it too, and a new order ends it', onOwn && dr.orbitOn == null, JSON.stringify([onOwn, dr.orbitOn]));

/* ---------------- the cursor ---------------- */
G = fresh();
var pick = null;
g._rtsPickAt = function () { return pick; };
var bm2 = g._rtsSpawnUnit('player', 'bomber', from.x, from.z), tk = g._rtsSpawnUnit('player', 'tank', from.x, from.z + g.RTS_TILE);
var wc = g._rtsNearestOpen(M, M, 40, 'sea');
pick = { ent: null, x: P.x, z: P.z };
var U = g.window._rtsUI;
U.attackMove = true; G.sel = [bm2]; var cBomb = g._rtsActionAt(0, 0);
G.sel = [bm2, tk]; var cMix = g._rtsActionAt(0, 0);
U.attackMove = false; G.sel = [bm2]; var cPlain = g._rtsActionAt(0, 0);
pick = { ent: null, x: g._rtsWX(wc[0]), z: g._rtsWX(wc[1]) };
G.sel = [bm2]; var cSeaAir = g._rtsActionAt(0, 0);
G.sel = [tk]; var cSeaTank = g._rtsActionAt(0, 0);
S.ok('bombers alone on attack-move show the reticle over bare ground; with a tank in the selection, attack-move; plain, a move',
     cBomb === 'attack' && cMix === 'amove' && cPlain === 'move', JSON.stringify([cBomb, cMix, cPlain]));
S.ok('...and an aircraft over the sea is a move, a tank there a refusal', !!wc && cSeaAir === 'move' && cSeaTank === 'no', JSON.stringify([wc, cSeaAir, cSeaTank]));

require('../lib/report.js')(S);
