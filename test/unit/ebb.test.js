/* THE EBB TEAM (rules/teams.js `Ebb`, core/monitor.js _rtsAIEbb, core/tide.js _rtsTideEbbing):
   the opponent's navy sails together, on the tide's clock.

     THE EBB        the tide is ebbing while it is falling and the outermost flats are still
                    wet: from high water down to nearly low, not on the flood at the same level,
                    and not in the last stretch before low water when the channels are dry
     THE GATE       the Ebb team is a candidate only on the ebb, and only when a Monitor and two
                    subs are afloat and free: not with no Monitor, not with a sub already in
                    another team, not on the flood - so a team raised forms at once
     THE QUARRY     `shore` matches a building a Monitor can shell from its water and not one
                    inland
     THE MARCH      raised on the ebb, the team fills at once and sails for the sea waypoint;
                    the solo Monitor tick never takes the Monitor off its team; on the attack leg
                    the team picks a shore building and shells it, the subs come to the water
                    nearest it, and the Repair Tender comes with the fleet
     THE ROUTE      a Monitor's route from a dried flat never crosses land - the string-puller
                    (core/grid.js) collapsed it onto a headland once the flat under it had dried */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('ebb');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh() {
  g.window._RTS_ARMY = 'allied';                                    /* the opponent is the Dominion */
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {}; G.teamHold = {}; G.teamSeq = G.teamSeq || 0;
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function W(tx, tz) { return { tx: tx, tz: tz, x: g._rtsWX(tx), z: g._rtsWX(tz) }; }
/* the clock: t seconds into the tide's period, and the flats laid out for it */
function clock(G, t) { G.t = t; g._rtsTideTick(0); }
var EBB = 70, FLOOD = 290;                                          /* the same level, falling and rising */
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
var TY = g.RTS_TEAM_TYPES.filter(function (t) { return t.name === 'Ebb'; })[0];
S.ok('the staging: there is an Ebb team type, gated on the tide', !!TY && TY.tide === true && TY.members.monitor === 1, TY ? JSON.stringify(TY.members) : 'none');

/* ---------------- the ebb ---------------- */
var G = fresh();
function ebbing(t) { clock(G, t); return g._rtsTideEbbing(G); }
S.ok('the tide is ebbing while it is falling and the outermost flats are still wet: from high water down to nearly low',
     ebbing(1) && ebbing(EBB) && ebbing(120) && !ebbing(140) && !ebbing(175) && !ebbing(FLOOD) && !ebbing(185) && !ebbing(350),
     [1, EBB, 120, 140, 175, FLOOD, 185, 350].map(function (t) { return t + 's:' + ebbing(t); }).join(' '));

/* ---------------- the gate ---------------- */
G = fresh();
yard('enemy', 'refinery');
var pen = yard('enemy', 'subpen'), dk = g._rtsNearestOpen(pen.tx + 1, pen.tz + 1, 8, 'shallow'), D = W(dk[0], dk[1]);
function fleet(withMonitor, nSubs) {
  G.ents.forEach(function (e) { if (e.type === 'unit' && e.side === 'enemy' && (e.def === 'monitor' || e.def === 'sub')) e.dead = true; });
  var out = [];
  if (withMonitor) out.push(g._rtsSpawnUnit('enemy', 'monitor', D.x, D.z));
  for (var i = 0; i < nSubs; i++) out.push(g._rtsSpawnUnit('enemy', 'sub', D.x, D.z));
  return out;
}
clock(G, EBB);
var noMon = (fleet(false, 2), g._rtsAIEbb(TY));
var all = fleet(true, 2), ready = g._rtsAIEbb(TY);
var other = g._rtsTeamMake(g.RTS_TEAM_TYPES.filter(function (t) { return t.name === 'Wolfpack'; })[0]);
g._rtsTeamAdd(other, all[1]);
var taken = g._rtsAIEbb(TY);
g._rtsTeamDisband(other);
clock(G, FLOOD);
var flood = g._rtsAIEbb(TY);
clock(G, EBB);
S.ok('the Ebb team is a candidate on the ebb with a Monitor and two subs afloat and free', ready === true, String(ready));
S.ok('...not with no Monitor', noMon === false, String(noMon));
S.ok('...not with a sub already in another team', taken === false, String(taken));
S.ok('...and not on the flood at the same level', flood === false, String(flood));
/* ...and _rtsSuggestTeam honours it: every roll of the die, with the house alerted and units to spare */
function offered() {
  var keep = g._rtsRnd, names = {};
  for (var r = 0; r < 1; r += 0.02) { g._rtsRnd = (function (v) { return function () { return v; }; })(r); var p = g._rtsSuggestTeam(40); if (p) names[p.name] = 1; }
  g._rtsRnd = keep;
  return names;
}
G.ai.wave = 1; G.ai.lastHit = G.t;
var onEbb = offered();
clock(G, FLOOD);
var onFlood = offered();
clock(G, EBB);
S.ok('...so the opponent offers it on the ebb and not on the flood', !!onEbb.Ebb && !onFlood.Ebb,
     'ebb: ' + Object.keys(onEbb).join('/') + '; flood: ' + Object.keys(onFlood).join('/'));

/* ---------------- the quarry ---------------- */
/* a flat that dries two cells off a shore, with a shore building beside it (as unit/monitor stages it) */
clock(G, 180);
var F = null;
for (var i = 0; i < g.RTS_N * g.RTS_N && !F; i++) {
  if (G.tideD[i] !== 2 || !G.tideDry[i]) continue;
  var tx = i % g.RTS_N, tz = (i / g.RTS_N) | 0;
  for (var a = 0; a < 8 && !F; a++) {
    var dx = Math.round(Math.cos(a * Math.PI / 4)), dz = Math.round(Math.sin(a * Math.PI / 4)), ok = true;
    for (var k = 1; k <= 4; k++) if (G.terrain[g._rtsIdx(tx + dx * k, tz + dz * k)] !== g.RTS_T_WATER) ok = false;
    if (ok && !g._rtsBlocked(tx + dx * 4, tz + dz * 4, 'sea')) F = W(tx, tz);
  }
}
function onShore() {
  for (var r2 = 1; r2 < 8; r2++) for (var a2 = 0; a2 < 16; a2++) {
    var cx = Math.round(F.tx + Math.cos(a2 * Math.PI / 8) * r2), cz = Math.round(F.tz + Math.sin(a2 * Math.PI / 8) * r2);
    if (g._rtsCanPlace('player', 'pillbox', cx, cz, true)) { var b = g._rtsPlaceStruct('player', 'pillbox', cx, cz, true); b.building = 0; return b; }
  }
  return null;
}
var coast = F && onShore();
/* ...and one of the player's as far from any water as the map allows */
var py = g._rtsHas('player', 'yard'), inland = null, farthest = -1;
for (var tz2 = 3; tz2 < g.RTS_N - 3; tz2 += 2) for (var tx2 = 3; tx2 < g.RTS_N - 3; tx2 += 2) {
  if (!g._rtsCanPlace('player', 'pillbox', tx2, tz2, true)) continue;
  var w = g._rtsNearestOpen(tx2, tz2, 8, 'shallow'), dw = w ? Math.hypot(w[0] - tx2, w[1] - tz2) : 9;
  if (dw > farthest) { farthest = dw; inland = [tx2, tz2]; }
}
var dry = inland && g._rtsPlaceStruct('player', 'pillbox', inland[0], inland[1], true); if (dry) dry.building = 0;
S.ok('`shore` matches a building a Monitor can shell from its water, and not one inland',
     !!coast && !!dry && g._rtsQuarryMatch(coast, 'shore') && !g._rtsQuarryMatch(dry, 'shore') && farthest > g.RTS_WEAPONS.monitorgun.range / g.RTS_TILE,
     coast && dry ? 'shore building ' + cells(coast, F).toFixed(1) + ' cells from the flat; the inland one ' + farthest.toFixed(1) + ' cells from any water' : 'no staging');

/* ---------------- the march ---------------- */
/* raised at the top of the ebb, as the opponent would raise it: the channels still have water
   in them for the escort and the Tender, and the flats are drying by the time the Monitor is
   under the coast */
var MARCH = 10;
clock(G, MARCH);
G.ents.forEach(function (e) { if (e.side === 'player' && e.type === 'unit') e.dead = true; });
fleet(true, 2);
var tender = g._rtsSpawnUnit('enemy', 'tender', D.x, D.z);
var team = g._rtsTeamMake(TY), em = null, hijacked = 0, patrolled = 0, formedAt = null, sea = g._rtsWayptPos('sea');
run(12, function () {
  G.sides.enemy.q = {};
  if (!em) G.ents.forEach(function (e) { if (!e.dead && e.def === 'monitor' && e.side === 'enemy') em = e; });
  if (team.hasBeen && formedAt === null) formedAt = G.t;
  if (team.moving && (team.cur | 0) === 0 && em) { if (em.order === 'attack') hijacked++; if (em.order === 'amove') patrolled++; }
});
var toSea = em && em.goal && sea ? Math.hypot(em.goal.x - sea.x, em.goal.z - sea.z) / g.RTS_TILE : 99;
S.ok('raised on the ebb, the team fills at once and sails for the sea waypoint', formedAt !== null && formedAt - MARCH < 2 && team.moving && patrolled > 0 && toSea < 4,
     'formed after ' + (formedAt === null ? 'never' : (formedAt - MARCH).toFixed(1) + ' s') + '; the Monitor patrolled on ' + patrolled + ' ticks, goal ' + toSea.toFixed(1) + ' cells from the sea waypoint');
S.ok('...and the solo Monitor tick never takes the Monitor off its team', hijacked === 0 && em && em.sqd === team.id, hijacked + ' ticks under a solo attack order');
/* the attack leg: straight to it, so the patrol's march across the map is not waited for */
team.cur = 1; team.target = null; team.legT = null;
var shelled = null, c0 = coast.hp, keepPath = g._rtsPath, searches = 0;
g._rtsPath = function (sx, sz, gx, gz, dom) { if (dom === 'sea') searches++; return keepPath(sx, sz, gx, gz, dom); };
run(60, function () {
  G.sides.enemy.q = {};
  if (team.target && shelled === null) shelled = team.target;
});
g._rtsPath = keepPath;
S.ok('...on the attack leg the team picks a shore building', !!shelled && shelled.type === 'struct' && g._rtsQuarryMatch(shelled, 'shore'), shelled ? 'a ' + shelled.def : 'nothing');
S.ok('...and shells it', !!shelled && (shelled.dead || shelled.hp < (shelled === coast ? c0 : shelled.maxHp)), shelled ? (shelled.dead ? 'destroyed' : shelled.hp.toFixed(0) + ' of ' + shelled.maxHp) : 'no target');
/* the subs cannot shell a building, so the attack is a passage to the water nearest it - and
   at half-tide on a channel map the lane may be a cell wide, so what is asked is that they are
   out of harbour and under way to it, not that they arrived */
var subs = team.members.filter(function (m) { return m.def === 'sub' && !m.dead; });
var out = subs.filter(function (m) { return cells(m, D) > 15; }).length, going = subs.filter(function (m) { return m.order === 'move' && m.path && m.goal && cells(m.goal, coast) < 1; }).length;
S.ok('...the subs sail out with it and make for the water nearest the building', subs.length === 2 && out === 2 && going === 2,
     out + ' of ' + subs.length + ' out of harbour, ' + going + ' under way to it');
/* ...asked for their route once in a while, not thirty times a second each (core/orders.js) */
S.ok('...asking for a route to it once in a couple of seconds, not every tick', searches < 60 * 2 * 2, searches + ' sea routes searched in sixty seconds');
var tc = g._rtsTeamCentre(team), off = tc ? cells(tender, tc) : 99;
S.ok('...and the Repair Tender sails out with the fleet', cells(tender, D) > 15 && off < 20, cells(tender, D).toFixed(1) + ' cells out of harbour, ' + off.toFixed(1) + ' from the team\'s centre');


/* ---------------- the route ---------------- */
/* a Monitor on a flat that has dried, routed the length of the channel: every leg of the route
   it is given is water it can sail */
clock(G, 180);
var fromFlat = null;
for (var fi = 0; fi < g.RTS_N * g.RTS_N && !fromFlat; fi++) if (G.tideD[fi] && G.tideDry[fi] && Math.hypot((fi % g.RTS_N) - D.tx, ((fi / g.RTS_N) | 0) - D.tz) < 12) fromFlat = W(fi % g.RTS_N, (fi / g.RTS_N) | 0);
var route = fromFlat && g._rtsPath(fromFlat.x, fromFlat.z, coast.x, coast.z, 'shallow'), legs = 0, bad = 0, px = fromFlat && fromFlat.x, pz = fromFlat && fromFlat.z;
(route || []).forEach(function (w) { legs++; if (!g._rtsClearLine(px, pz, w.x, w.z, 'shallow')) bad++; px = w.x; pz = w.z; });
S.ok('a Monitor\'s route from a dried flat never crosses land', !!fromFlat && !!route && legs > 1 && bad === 0,
     fromFlat ? (route ? legs + ' legs, ' + bad + ' across land' : 'no route') : 'no dried flat near the pen');
/* ...and a hull sent at a building ashore at low water is sent to the water past the flats, which
   six rings out from the building no longer reach */
var inl = null, n12 = null;
for (var tz3 = 3; tz3 < g.RTS_N - 3 && !inl; tz3++) for (var tx3 = 3; tx3 < g.RTS_N - 3 && !inl; tx3++) {
  if (!g._rtsCanPlace('player', 'pillbox', tx3, tz3, true) || g._rtsNearestOpen(tx3, tz3, 6, 'sea')) continue;
  var far12 = g._rtsNearestOpen(tx3, tz3, 12, 'sea');
  if (far12) { inl = g._rtsPlaceStruct('player', 'pillbox', tx3, tz3, true); inl.building = 0; n12 = W(far12[0], far12[1]); }
}
var seaRoute = inl && g._rtsPath(n12.x, n12.z, inl.x, inl.z, 'sea');
S.ok('a hull sent at a building ashore at low water is routed to the water past the flats, beyond six rings of it', !!inl && !!seaRoute && seaRoute.length > 0,
     inl ? 'the nearest open sea ' + cells(n12, inl).toFixed(1) + ' cells off; route ' + (seaRoute ? seaRoute.length + ' legs' : 'none') : 'no building between seven and twelve cells of open sea on this map');

require('../lib/report.js')(S);
