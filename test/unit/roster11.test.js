/* BATCH 11a (rules/roster11.js): the Marksman, the Tank Hunter, the Flak Trooper and the Long Gun,
   on the real simulation:

     WHOSE        the Marksman, the Tank Hunter and the Long Gun are the Compact's, the Flak
                  Trooper the Dominion's; all three units have a building that trains them
     MARKSMAN     one shot kills a rifleman; at a tank, a wall or a building it does nothing; left
                  to fight a rifleman standing beyond a rifle's reach, he kills it untouched
     TANK HUNTER  a shot at a Battle Tank hurts it more than the tank's own cannon hurts it back,
                  and at a rifleman does almost nothing; it beats a Battle Tank one to one
     FLAK TROOPER finds a helicopter by itself and brings it down, and fights a rifleman too
     LONG GUN     dark, it does not fire; lit, it shells a tank standing beyond the tank's own
                  reach, and the tank cannot answer
     THE OPPONENT does not buy or build them yet: batch 12 */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('roster11');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
var G, M, T = g.RTS_TILE;

function fresh(army) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  var a = g._rtsHas('player', 'yard'), b = g._rtsHas('enemy', 'yard');
  M = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
function at(side, key, dx, dz) { return g._rtsSpawnUnit(side, key, M.x + dx * T, M.z + dz * T); }
var still = [];
function step(secs) { for (var t = 0; t < secs * 30; t++) { still.forEach(function (o) { o.path = null; o.order = 'hold'; }); g._rtsTick(1 / 30); } }
function shot(e, tgt, wk) { var h = tgt.hp; e.cool = 0; g._rtsFire(e, tgt, g.RTS_WEAPONS[wk]); step(1); return h - Math.max(0, tgt.hp); }   /* a second: long enough for a shell to land */
var U = g.rtsUnitDef, SD = g.rtsStructDef;

/* ------------------------------------------------------------------ whose ---- */
var mk = U('marksman'), hu = U('hunter'), fl = U('flakman'), lg = SD('longgun');
S.ok('the Marksman, the Tank Hunter and the Long Gun are the Compact\'s, the Flak Trooper the Dominion\'s',
     mk.side === 'allied' && hu.side === 'allied' && lg.side === 'allied' && fl.side === 'soviet' && lg.needsPower, '');

/* --------------------------------------------------------------- marksman ---- */
fresh();
var m1 = at('player', 'marksman', 0, 0), r1 = at('enemy', 'rifle', 3, 0), t1 = at('enemy', 'tank', 0, 4);
still = [m1, r1, t1];
S.ok('THE MARKSMAN: one shot kills a rifleman', shot(m1, r1, 'marksgun') > 0 && r1.dead, 'rifle hp ' + r1.hp);
/* nothing but the game's floor on any hit (RTS_MIN_DAMAGE), as in the original */
S.ok('...at a tank it does nothing but the floor', shot(m1, t1, 'marksgun') <= g.RTS_MIN_DAMAGE, '');
var pw = g._rtsHas('enemy', 'power');
var dPw = pw ? shot(m1, pw, 'marksgun') : -1;
S.ok('...nor at a building', !!pw && dPw >= 0 && dPw <= g.RTS_MIN_DAMAGE, pw ? dPw.toFixed(1) : 'no enemy power plant');

fresh();
/* beyond a rifle's reach (15) and inside his own (30): free to fight, and the rifleman free to come on */
var m2 = at('player', 'marksman', 0, 0), r2 = at('enemy', 'rifle', 6, 0), mh = m2.hp;
still = [m2];
S.ok('(the staging: the rifleman starts beyond a rifle\'s reach and inside the Marksman\'s)',
     g._rtsRangeTo(m2, r2) > g.RTS_WEAPONS.rifle.range && g._rtsRangeTo(m2, r2) < g.RTS_WEAPONS.marksgun.range, g._rtsRangeTo(m2, r2).toFixed(1));
step(5);
S.ok('...left to fight, he kills it untouched', r2.dead && m2.hp === mh, 'rifle ' + (r2.dead ? 'dead' : r2.hp) + ', marksman ' + m2.hp + '/' + mh);

/* ----------------------------------------------------------- tank hunter ---- */
fresh();
/* each target dead ahead of the hunter's hull, which is where a shell goes: it holds the bearing it
   left the barrel on (core/units.js _rtsUpdateProj) */
var h1 = at('player', 'hunter', 0, 0), t2 = at('enemy', 'tank', 4, 0);
still = [h1, t2];
var dHunt = shot(h1, t2, 'huntgun'), dBack = shot(t2, h1, 'cannon');
fresh();
var h1b = at('player', 'hunter', 0, 0), r3 = at('enemy', 'rifle', 4, 0);
still = [h1b, r3];
var dMan = shot(h1b, r3, 'huntgun');
S.ok('THE TANK HUNTER: a shot at a Battle Tank hurts it more than the tank\'s cannon hurts it back', dHunt > dBack * 1.5, dHunt.toFixed(0) + ' to ' + dBack.toFixed(0));
S.ok('...and at a rifleman does almost nothing', dMan > 0 && dMan < dHunt * 0.15, dMan.toFixed(1));

fresh();
var h2 = at('player', 'hunter', 0, 0), t3 = at('enemy', 'tank', 4, 0);
still = [h2, t3];
step(30);
S.ok('...and it beats a Battle Tank one to one', t3.dead && !h2.dead, 'tank ' + (t3.dead ? 'dead' : t3.hp) + ', hunter ' + (h2.dead ? 'dead' : h2.hp.toFixed(0)));

/* ----------------------------------------------------------- flak trooper ---- */
fresh('soviet');
var f1 = at('player', 'flakman', 0, 0), he = at('enemy', 'heli', 3, 0);
still = [f1];
var heH = he.hp;
step(0.3);
S.ok('THE FLAK TROOPER finds a helicopter by itself', f1.target === he, 'target ' + (f1.target ? f1.target.def : 'none'));
step(20);
S.ok('...and brings it down, or near enough', he.dead || he.hp < heH * 0.5, he.dead ? 'down' : he.hp.toFixed(0) + '/' + heH);
fresh('soviet');
var f2 = at('player', 'flakman', 0, 0), r4 = at('enemy', 'rifle', 3, 0), rh = r4.hp;
still = [f2, r4];
step(3);
S.ok('...and fights a rifleman too', r4.hp < rh, r4.hp + '/' + rh);

/* -------------------------------------------------------------- long gun ---- */
/* one tank, beyond its own reach of the gun: the gun dark, then lit. What the gun does is counted
   as the hits it lands (anything else on the field - a fire on the ground - is not the gun) */
fresh();
var yd = g._rtsHas('player', 'yard');
function gun() {
  for (var r = 0; r < 12; r++) for (var a = 0; a < 8; a++) {
    var b = g._rtsPlaceStruct('player', 'longgun', yd.tx + 8 + Math.round(Math.cos(a * 0.785) * r), yd.tz + 8 + Math.round(Math.sin(a * 0.785) * r), true);
    if (b) { b.building = 0; return b; }
  }
  return null;
}
var L = gun();
S.ok('(the staging: a Long Gun placed)', !!L, '');
if (L) {
  G.ents.forEach(function (e) { if (e.type === 'struct' && e.side === 'player' && e.def === 'power') e.dead = true; });
  g._rtsRecalcPower('player');
  /* dry land 26 out, off the tide's flats (core/tide.js: a tank on a flat the sea takes back drowns) */
  function dry(x, z) { var c = g._rtsIdx(g._rtsTX(x), g._rtsTX(z)); return g._rtsInB(g._rtsTX(x), g._rtsTX(z)) && G.terrain[c] !== g.RTS_T_WATER && !(G.tideD && G.tideD[c]) && !G.blocked[c]; }
  var ang = 0;
  while (ang < 16 && !dry(L.x + Math.cos(ang / 8 * Math.PI) * 26, L.z + Math.sin(ang / 8 * Math.PI) * 26)) ang++;
  var tk = g._rtsSpawnUnit('enemy', 'tank', L.x + Math.cos(ang / 8 * Math.PI) * 26, L.z + Math.sin(ang / 8 * Math.PI) * 26), tH = tk.hp, lH = L.hp, hits = 0;
  still = [tk];
  var hurt = g._rtsDamage;
  g._rtsDamage = function (t, d, from) { if (from === L) hits++; return hurt.apply(this, arguments); };
  S.ok('(the staging: dry ground found; dark, and the tank beyond its own reach of the gun and inside the gun\'s)',
       ang < 16 && g._rtsPowerFactor('player') < 0.999 && g._rtsRangeTo(tk, L) > g.RTS_WEAPONS.cannon.range && g._rtsRangeTo(L, tk) < g.RTS_WEAPONS.longgun.range,
       'power ' + g._rtsPowerFactor('player') + ', gun to tank ' + g._rtsRangeTo(L, tk).toFixed(1) + ', tank to gun ' + g._rtsRangeTo(tk, L).toFixed(1));
  step(8);
  S.eq('THE LONG GUN dark does not fire: nothing it hits', hits, 0);
  G.sides.player.credits = 1e6;
  for (var p = 0; p < 4; p++) { var pp = g._rtsPlaceStruct('player', 'power', yd.tx - 6 - p * 3, yd.tz - 6, true); if (pp) pp.building = 0; }
  g._rtsRecalcPower('player');
  var tH1 = tk.hp;
  step(8);
  g._rtsDamage = hurt;
  S.ok('...lit, it shells the tank, beyond the tank\'s own reach', g._rtsPowerFactor('player') >= 1 && hits > 0 && tk.hp < tH1 * 0.75,
       hits + ' hits, tank ' + tk.hp.toFixed(0) + '/' + tH1.toFixed(0) + ', power ' + g._rtsPowerFactor('player'));
  S.eq('...and the tank cannot answer', L.hp, lH);
}

/* -------------------------------------------------------------- opponent ---- */
var A = g.RTS_AI, mixed = [];
for (var c in A.mix) (A.mix[c] || []).forEach(function (m) { mixed.push(m.key); });
S.ok('the opponent does not buy or build them yet: batch 12',
     ['marksman', 'hunter', 'flakman'].every(function (k) { return mixed.indexOf(k) < 0; }) && A.buildOrder.indexOf('longgun') < 0, '');

require('../lib/report.js')(S);
