/* THE HEAVY BOMBER (rules/units.js `bomber`, core/bomber.js), on the real simulation:

     THE CARPET    sent at a building fifteen cells off or more, it lays eight bombs in one pass - a
                   cell apart, in a straight line along its course, centred on the building -
                   without coming down; each falls for most of a second before it bursts, and the
                   building is hit
     EVERYONE      a tank of its own side parked under the line is hurt too
     HOME          the load gone, it flies to an air pad, loads again, and can make another run
     CALLED OFF    sent somewhere else after the first bomb, it stops laying and its round is
                   spent; called off before the first bomb it keeps its round; pointed at a
                   second target after the first bomb the old line stops and the round is spent;
                   pointed at a second target before the first bomb the line is laid on the new one
     IT FOLLOWS    sent at a tank driving away, the line is laid where the tank is when the first
                   bomb falls, not where it was when the order was given
     UNHURT        it is not hit by its own bombs as it turns for home
     ONLY ORDERED  loaded and idle right over an enemy tank it lays nothing and takes no order of
                   its own; attack-moving past one it flies on; shot at, it does not turn on the
                   gun; its base under attack, it is not sent to defend it
     THE EDGE      sent at a target by the map's edge, the run ends and it goes home rather than
                   hanging at the edge with its load
     BOTH ARMIES   either builds one, behind its own air pad - a Helipad or an Airfield
     THE OPPONENT  buys one (after its Paradrop Plane) once the player has dug in and its own base
                   is defended, not before, and not onto a pad another aircraft holds;
                   and sends it at the most crowded corner of the player's base */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('bomber');
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
function middle() {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, null);
  return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
function place(side, k, near, from) {
  var yd = near || g._rtsHas(side, 'yard');
  for (var r = from || 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) { var b = g._rtsPlaceStruct(side, k, sp[0], sp[1], true); if (b) b.building = 0; return b; }
  }
  return null;
}
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };

/* ---------------- the carpet ---------------- */
var G = fresh(), pad = place('player', 'helipad'), py = g._rtsHas('player', 'yard');
var ey = g._rtsHas('enemy', 'yard');
/* the building it is sent at: twenty-odd cells from where the bomber starts */
var bm = g._rtsSpawnUnit('player', 'bomber', ey.x + (py.x - ey.x) * 0.45, ey.z + (py.z - ey.z) * 0.45);
var aim = ey, start = cells(bm, aim), hp0 = aim.hp;
/* a tank of the bomber's own side parked a cell off the building, under the line */
var dir = { x: (aim.x - bm.x) / (start * g.RTS_TILE), z: (aim.z - bm.z) / (start * g.RTS_TILE) };
var w = g.rtsStructDef(aim.def).w, own = g._rtsSpawnUnit('player', 'tank', aim.x - dir.x * (w / 2 + 1) * g.RTS_TILE, aim.z - dir.z * (w / 2 + 1) * g.RTS_TILE);
var ownHp = own.hp;
g._rtsOrderAttack(bm, aim);
var seen = [], bursts = [], low = 99;
run(20, function () {
  own.order = 'hold'; own.path = null; own.target = null; own.cool = 9;
  (G.bombs || []).forEach(function (b) { if (seen.indexOf(b) < 0) { seen.push(b); b.at = G.t; } });
  seen.forEach(function (b) { if (!b.gone && (G.bombs || []).indexOf(b) < 0) { b.gone = G.t; bursts.push(b); } });
  low = Math.min(low, g._rtsAirLift(bm));
});
S.ok('the staging: well off', start >= 15, start.toFixed(1) + ' cells');
S.ok('sent at a building, it lays eight bombs in one pass', seen.length === 8, seen.length + ' bombs');
/* the line: spacing, straightness, centre */
var gaps = [], off = 0, c = { x: 0, z: 0 };
seen.forEach(function (b, i) {
  c.x += b.x / seen.length; c.z += b.z / seen.length;
  if (i) gaps.push(cells(b, seen[i - 1]));
  var rx = b.x - seen[0].x, rz = b.z - seen[0].z;                    /* off the line from first to last */
  var L = seen[seen.length - 1], lx = L.x - seen[0].x, lz = L.z - seen[0].z, LL = Math.hypot(lx, lz) || 1;
  off = Math.max(off, Math.abs(rx * lz - rz * lx) / LL / g.RTS_TILE);
});
var gmin = Math.min.apply(null, gaps), gmax = Math.max.apply(null, gaps);
S.ok('...a cell apart, in a straight line', seen.length === 8 && gmin > 0.9 && gmax < 1.1 && off < 0.1,
     'gaps ' + gmin.toFixed(2) + '-' + gmax.toFixed(2) + ' cells; ' + off.toFixed(2) + ' off the line');
var along = seen.length === 8 ? Math.abs(((seen[7].x - seen[0].x) * dir.x + (seen[7].z - seen[0].z) * dir.z) / (cells(seen[7], seen[0]) * g.RTS_TILE)) : 0;
S.ok('...along its course, centred on the building', along > 0.99 && cells(c, aim) < 0.6,
     'line ' + (along * 100).toFixed(0) + '% along the course; centre ' + cells(c, aim).toFixed(2) + ' cells from the building');
S.ok('...without coming down', low >= 12, 'at least ' + low.toFixed(1) + ' up');
var falls = bursts.map(function (b) { return b.gone - b.at; });
S.ok('...each falls for most of a second before it bursts', bursts.length === 8 && Math.min.apply(null, falls) >= 0.6 && Math.max.apply(null, falls) <= 0.8,
     falls.map(function (f) { return f.toFixed(2); }).join(' '));
S.ok('...and the building is hit', aim.hp < hp0 - 100, hp0 + ' -> ' + aim.hp.toFixed(0));
S.ok('...and its owner is told it is under attack', typeof G.ai.lastHit === 'number' && G.ai.lastHit > 0, 'lastHit ' + G.ai.lastHit);
S.ok('a tank of its own side parked under the line is hurt too', own.hp < ownHp, ownHp + ' -> ' + own.hp.toFixed(0));

/* ---------------- home ---------------- */
var emptied = bm.ammo, homeBy = null, loaded = null;
run(60, function () {
  if (homeBy === null && cells(bm, pad) < 2) homeBy = G.t;
  if (homeBy !== null && loaded === null && bm.ammo > 0) loaded = G.t;
});
S.ok('the load gone, it flies home to an air pad and loads again', emptied === 0 && homeBy !== null && loaded !== null,
     'ammo ' + emptied + ' after the run; home ' + (homeBy !== null) + '; loaded ' + (loaded !== null));
var before = seen.length;
g._rtsOrderAttack(bm, aim);
run(25, function () { (G.bombs || []).forEach(function (b) { if (seen.indexOf(b) < 0) seen.push(b); }); });
S.ok('...and can make another run', seen.length - before === 8, (seen.length - before) + ' bombs on the second');

/* ---------------- called off ---------------- */
var m = middle();
function sit(u) { u.order = 'hold'; u.path = null; u.target = null; u.cool = 9; }
/* a bomber sent at a tank fourteen cells off; once `when` bombs are into the run - or, for 0,
   once the run is planned and the bomber is on its way with nothing yet away - `then` is done to it */
function interrupt(when, then, secs) {
  var G = fresh(), b = g._rtsSpawnUnit('player', 'bomber', m.x - 14 * g.RTS_TILE, m.z), tk = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z), drops = [], done = false, other = null, t0 = G.t;
  g._rtsOrderAttack(b, tk);
  run(secs || 14, function () {
    sit(tk); if (other) sit(other);
    (G.bombs || []).forEach(function (q) { if (drops.indexOf(q) < 0) drops.push(q); });
    var ready = when > 0 ? drops.length >= when : (!!b.run && b.run.k === 0 && G.t - t0 > 1.5);
    if (!done && ready) { done = true; other = then(b, tk); }
  });
  return { b: b, tk: tk, drops: drops, done: done, other: other };
}
var off2 = interrupt(2, function (b) { g._rtsOrderMove(b, m.x, m.z + 20 * g.RTS_TILE, false); });
S.ok('sent somewhere else after the first bomb, it stops laying its carpet and its round is spent', off2.done && off2.drops.length >= 2 && off2.drops.length <= 3 && !off2.b.run && off2.b.ammo === 0,
     off2.drops.length + ' bombs; run ' + !!off2.b.run + ', ammo ' + off2.b.ammo);
var off0 = interrupt(0, function (b) { g._rtsOrderMove(b, m.x, m.z + 20 * g.RTS_TILE, false); }, 6);
S.ok('...called off before the first bomb it keeps its round', off0.done && off0.drops.length === 0 && !off0.b.run && off0.b.ammo === 1, off0.drops.length + ' bombs, ammo ' + off0.b.ammo);
var re2 = interrupt(2, function (b) { var o = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z + 16 * g.RTS_TILE); g._rtsOrderAttack(b, o); return o; });
S.ok('...pointed at a second target after the first bomb, the old line stops and the round is spent', re2.done && re2.drops.length >= 2 && re2.drops.length <= 3 && re2.b.ammo === 0 && !re2.b.run,
     re2.drops.length + ' bombs, ammo ' + re2.b.ammo + ', run ' + !!re2.b.run);
var re0 = interrupt(0, function (b) { var o = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z + 12 * g.RTS_TILE); g._rtsOrderAttack(b, o); return o; }, 22);
var c0 = { x: 0, z: 0 }; re0.drops.forEach(function (q) { c0.x += q.x / re0.drops.length; c0.z += q.z / re0.drops.length; });
S.ok('...pointed at a second target before the first bomb, the line is laid on the new one', re0.drops.length === 8 && !!re0.other && cells(c0, re0.other) < 1 && cells(c0, re0.tk) > 8,
     re0.drops.length + ' bombs, centred ' + (re0.other ? cells(c0, re0.other).toFixed(1) : '-') + ' cells from the new target, ' + cells(c0, re0.tk).toFixed(1) + ' from the old');

/* right over the aim: the line runs the way it is heading, and it lays what is still ahead */
G = fresh();
var over = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z), b8 = g._rtsSpawnUnit('player', 'bomber', m.x, m.z), x8 = b8.x;
b8.rot = 0;                                                            /* heading east */
g._rtsOrderAttack(b8, over);
var bombs8 = [];
run(10, function () { sit(over); (G.bombs || []).forEach(function (q) { if (bombs8.indexOf(q) < 0) bombs8.push(q); }); });
S.ok('sent at a target right under it, the line runs the way it is heading and it lays only what is still ahead of it', bombs8.length === 4 && bombs8.every(function (q) { return q.x > x8 + 1; }),
     bombs8.length + ' bombs, ' + bombs8.filter(function (q) { return q.x > x8 + 1; }).length + ' ahead');

/* ---------------- it follows ---------------- */
G = fresh();
var b4 = g._rtsSpawnUnit('player', 'bomber', m.x - 20 * g.RTS_TILE, m.z), run4 = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z), was = { x: run4.x, z: run4.z };
var away = g._rtsNearestOpen(m.tx, m.tz + 14, 6, null);
g._rtsOrderAttack(b4, run4);
var atFirst = null;
run(25, function () {
  if (!run4.path && !run4.dead) g._rtsOrderMove(run4, g._rtsWX(away[0]), g._rtsWX(away[1]), false);
  if (!atFirst && G.bombs && G.bombs.length && b4.run) {
    var r4 = b4.run, half4 = (g.RTS_BOMB.n - 1) / 2 * g.RTS_BOMB.gap * g.RTS_TILE;
    atFirst = { x: run4.x, z: run4.z, centre: { x: r4.sx + r4.dx * half4, z: r4.sz + r4.dz * half4 } };
  }
});
/* the line's centre, read off the run as the first bomb falls: on the tank now, not where it was */
var moved4 = atFirst ? cells(atFirst, was) : 0, nearNow = atFirst ? cells(atFirst.centre, atFirst) : 99, nearWas = atFirst ? cells(atFirst.centre, was) : 0;
S.ok('sent at a tank driving away, the line is laid where the tank is when the first bomb falls, not where it was', !!atFirst && moved4 >= 4 && nearNow < 1.5 && nearWas > 3,
     atFirst ? 'the tank had gone ' + moved4.toFixed(1) + ' cells; the line is centred ' + nearNow.toFixed(1) + ' cells from it and ' + nearWas.toFixed(1) + ' from where it had been' : 'no bomb fell');

/* ---------------- unhurt ---------------- */
/* home is BEHIND it: the run ends on the eighth bomb and the bomber turns about over the tail of
   its own line as the last two burst */
G = fresh();
var pad5 = place('player', 'helipad'), c5 = g._rtsNearestOpen(pad5.tx + 14, pad5.tz, 6, null);
var b5 = g._rtsSpawnUnit('player', 'bomber', pad5.x, pad5.z), tk5 = g._rtsSpawnUnit('enemy', 'tank', g._rtsWX(c5[0]), g._rtsWX(c5[1])), hp5 = b5.hp, hurt5 = false, turned = false;
g._rtsOrderAttack(b5, tk5);
run(16, function () { sit(tk5); if (b5.hp < hp5) hurt5 = true; if (b5.ammo === 0 && !b5.run && b5.order === 'rearm') turned = true; });
S.ok('it is not hit by its own bombs as it turns for home', turned && !hurt5 && b5.ammo === 0, (turned ? 'turned for home; ' : 'never turned for home; ') + (hurt5 ? 'hurt' : 'unhurt') + ', ammo ' + b5.ammo);

/* ---------------- only ordered ---------------- */
G = fresh();
var et = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z), b2 = g._rtsSpawnUnit('player', 'bomber', m.x, m.z), etHp = et.hp;
run(3, function () { sit(et); });
S.ok('loaded and idle right over an enemy tank, it lays nothing and takes no order of its own', b2.ammo === 1 && et.hp === etHp && !b2.run && !b2.order && !(G.bombs && G.bombs.length),
     'ammo ' + b2.ammo + ', order ' + b2.order + ', run ' + !!b2.run);
var b6 = g._rtsSpawnUnit('player', 'bomber', m.x - 10 * g.RTS_TILE, m.z), goal6 = { x: m.x + 10 * g.RTS_TILE, z: m.z };
g._rtsOrderMove(b6, goal6.x, goal6.z, true);
run(8, function () { sit(et); });
S.ok('...attack-moving past one, it flies on to where it was sent', cells(b6, goal6) < 2 && !b6.run && b6.ammo === 1, cells(b6, goal6).toFixed(1) + ' cells from its goal, ammo ' + b6.ammo);
var flak = g._rtsSpawnUnit('enemy', 'flaktrack', m.x + 3 * g.RTS_TILE, m.z + 3 * g.RTS_TILE);
g._rtsDamage(b2, 10, flak);
S.ok('...shot at, it does not turn on the gun', b2.order !== 'attack' && !b2.run, 'order ' + b2.order);
/* its base under attack: the pool of defenders is asked directly, with a loaded bomber idle at home */
G = fresh();
var eyd = g._rtsHas('enemy', 'yard'), eb = g._rtsSpawnUnit('enemy', 'bomber', eyd.x + 8, eyd.z), raider = g._rtsSpawnUnit('player', 'light', eyd.x + 12, eyd.z + 4);
g._rtsSpawnUnit('enemy', 'tank', eyd.x - 8, eyd.z);
var sent = g._rtsBaseIsAttacked(eyd, raider);
S.ok('...and its base under attack, it is not sent to defend it', eb.order !== 'attack' && !eb.run, 'order ' + eb.order + '; ' + sent + ' defender(s) sent');

/* ---------------- the edge ---------------- */
G = fresh();
var edgeC = g._rtsNearestOpen(g.RTS_N - 2, g.RTS_N >> 1, 6, null), edgeT = g._rtsSpawnUnit('enemy', 'tank', g._rtsWX(edgeC[0]), g._rtsWX(edgeC[1]));
var b7 = g._rtsSpawnUnit('player', 'bomber', edgeT.x - 12 * g.RTS_TILE, edgeT.z), hung = true, dropped7 = 0;
g._rtsOrderAttack(b7, edgeT);
run(30, function () { sit(edgeT); if (G.bombs) dropped7 = Math.max(dropped7, G.bombs.length); if (!b7.run && b7.ammo === 0) hung = false; });
S.ok('sent at a target by the map\'s edge, the run ends and it goes home rather than hanging there with its load', !hung && dropped7 > 0 && g._rtsTX(edgeT.x) >= g.RTS_N - 3,
     (hung ? 'still on its run' : 'run over') + ', ' + dropped7 + ' bombs in the air at once, the target ' + (g.RTS_N - 1 - g._rtsTX(edgeT.x)) + ' cells from the edge');

/* ---------------- both armies ---------------- */
function canBuild(army, padKey) {
  fresh(army);
  ['power', 'power', 'refinery', 'radar'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  var before = !!g._rtsCanQueue('player', 'bomber');
  place('player', padKey); g._rtsRecalcPower('player');
  return !before && !!g._rtsCanQueue('player', 'bomber');
}
S.ok('either army builds one, behind its own air pad - a Helipad or an Airfield', canBuild('allied', 'helipad') && canBuild('soviet', 'afld'), '');

/* ---------------- the opponent ---------------- */
G = fresh();
['factory', 'radar', 'depot', 'apower', 'apower', 'apower', 'afld'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
ey = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.air && S2.q.air.key === 'bomber') got++; }
  return got;
}
/* the Dominion's Paradrop Plane comes first on the same terms (core/aimines.js); it has one */
var para = g._rtsSpawnUnit('enemy', 'paraplane', ey.x, ey.z + 12);
var towers = [];
for (var df = 0; df < 4; df++) towers.push(place('enemy', 'flametower'));
var notDug = buys(20);                                               /* its own base defended, the player not dug in */
['pillbox', 'pillbox'].forEach(function (k) { place('player', k); });
var onePad = buys(20);                                               /* one Airfield, and the plane already on it */
place('enemy', 'afld');
var both = buys(20);
towers.forEach(function (t) { if (t) t.dead = true; });
g._rtsTick(1 / 30);
var undefended = buys(20);                                           /* the player dug in, its own base not defended */
for (var df2 = 0; df2 < 4; df2++) place('enemy', 'flametower');
para.dead = true;
S.ok('the opponent buys one once the player has dug in and its own base is defended', both > 3, both + ' of 20');
S.ok('...not before the player has dug in', notDug === 0, notDug + ' of 20');
S.ok('...nor while its own base is undefended', undefended === 0, undefended + ' of 20');
S.ok('...nor onto a pad another aircraft already holds: one aircraft per pad holds for the support purchases too', onePad === 0, onePad + ' of 20 with one Airfield holding the Paradrop Plane');
/* the player's base: its yard's cluster, and one building alone far out */
py = g._rtsHas('player', 'yard');
['power', 'refinery', 'power'].forEach(function (k) { place('player', k); });
var lone = place('player', 'power', { tx: py.tx, tz: py.tz }, 14);
/* ...and a wall line of nine segments off to one side: nine buildings round the middle one, more
   than any real corner of the base, and not what a bomber is for */
var walls = [];
for (var wr = 8; wr < 24 && walls.length < 9; wr++) for (var wa = 0; wa < 8 && walls.length < 9; wa++) {
  var wx0 = py.tx + Math.round(Math.cos(wa * Math.PI / 4) * wr), wz0 = py.tz + Math.round(Math.sin(wa * Math.PI / 4) * wr), ok = true;
  for (var wi = 0; wi < 9; wi++) if (!g._rtsCanPlace('player', 'wall', wx0 + wi, wz0, true)) ok = false;
  if (ok) for (var wj = 0; wj < 9; wj++) { var wb = g._rtsPlaceStruct('player', 'wall', wx0 + wj, wz0, true); wb.building = 0; walls.push(wb); }
}
function round(b) { return G.ents.filter(function (o) { return !o.dead && o.side === 'player' && o.type === 'struct' && !g.rtsStructDef(o.def).wall && cells(o, b) <= g.RTS_BOMB.crowd; }).length; }
var most = Math.max.apply(null, G.ents.filter(function (o) { return !o.dead && o.side === 'player' && o.type === 'struct' && !g.rtsStructDef(o.def).wall; }).map(round));
var eb = g._rtsSpawnUnit('enemy', 'bomber', ey.x, ey.z), sent = null, dropped = 0;
run(40, function () { if (!sent && eb.target) sent = eb.target; if (G.bombs) dropped = Math.max(dropped, G.bombs.length); });
S.ok('...and sends it at the most crowded corner of the player\'s base, never at the wall line', walls.length === 9 && !!lone && round(lone) < most && !!sent && sent !== lone && sent.def !== 'wall' && round(sent) === most && dropped > 0,
     sent ? 'sent at a ' + sent.def + ' with ' + round(sent) + ' buildings round it, of ' + most + ' at most; the lone one has ' + (lone ? round(lone) : '-') + '; ' + walls.length + ' wall segments; ' + dropped + ' bombs in the air at once' : 'never sent');

require('../lib/report.js')(S);
