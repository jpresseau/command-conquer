/* DIGGING IN (rules `rifle` dig:'allied', core/dig.js, its hooks in core/transport.js, core/units.js,
   core/orders.js, core/combat.js and core/damage.js), on the real simulation:

     WHOSE       a Compact rifle squad can dig in, through DEPLOY; a Dominion one cannot, and nor can
                 any other squad
     HOLDS       dug in, it does not move: not on an attack order at something out of reach
     SANDBAGS    it takes RTS_DIG.armor of a hit
     HEAVIER     it hits RTS_DIG.fire as hard, and reloads in RTS_DIG.rof of the time
     OUT         DEPLOY again climbs out; so does any move order, and it walks; and a board order */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('dig');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
var G, T = g.RTS_TILE;

function fresh(army) {
  g.window._RTS_ARMY = army;
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  var a = g._rtsHas('player', 'yard'), b = g._rtsHas('enemy', 'yard');
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
function step(secs) { for (var t = 0; t < secs * 30; t++) g._rtsTick(1 / 30); }

/* ---------------------------------------------------------------- whose ---- */
var M = fresh('allied');
var r = g._rtsSpawnUnit('player', 'rifle', M.x, M.z), rk = g._rtsSpawnUnit('player', 'rocket', M.x + T, M.z);
S.ok('a Compact rifle squad can dig in, through DEPLOY', g._rtsCanDeploy(r) && g._rtsCanDig(r), '');
S.ok('...and no other squad can', !g._rtsCanDig(rk) && !g._rtsDeploy(rk), '');
G.sel = [r];
S.eq('DEPLOY digs it in', g._rtsDeploySelected(), 1);
S.eq('...and it is dug in', r.dug, 1);

/* ---------------------------------------------------------------- holds ---- */
var far = g._rtsSpawnUnit('enemy', 'tank', M.x + T * 12, M.z);
var x0 = r.x, z0 = r.z;
g._rtsOrderAttack(r, far);
step(4);
S.ok('DUG IN, IT HOLDS: an attack order on something out of reach does not move it', Math.hypot(r.x - x0, r.z - z0) < 0.01 && r.dug === 1,
     'moved ' + Math.hypot(r.x - x0, r.z - z0).toFixed(2));
far.dead = true; r.target = null; r.order = null;

/* ------------------------------------------------------------- sandbags ---- */
var plain = g._rtsSpawnUnit('player', 'rifle', M.x, M.z + T * 2);
r.hp = r.maxHp; plain.hp = plain.maxHp;
var shooter = g._rtsSpawnUnit('enemy', 'tank', M.x + T * 3, M.z);
g._rtsDamage(r, 40, shooter); g._rtsDamage(plain, 40, shooter);
S.near('BEHIND SANDBAGS it takes RTS_DIG.armor of a hit', (r.maxHp - r.hp) / (plain.maxHp - plain.hp), g.RTS_DIG.armor, 0.01);

/* -------------------------------------------------------------- heavier ---- */
var tgt = g._rtsSpawnUnit('enemy', 'rifle', M.x + T * 2, M.z), w = g.RTS_WEAPONS.rifle;
function hit(u) { tgt.hp = tgt.maxHp; tgt.dead = false; tgt.prone = 0; u.cool = 0; g._rtsFire(u, tgt, w); return { dmg: tgt.maxHp - tgt.hp, cool: u.cool }; }
var hd = hit(r), hp = hit(plain);
S.near('it hits RTS_DIG.fire as hard', hd.dmg / hp.dmg, g.RTS_DIG.fire, 0.01);
S.near('...and reloads in RTS_DIG.rof of the time', hd.cool / hp.cool, g.RTS_DIG.rof, 0.01);

/* ------------------------------------------------------------------ out ---- */
G.sel = [r];
g._rtsDeploySelected();
S.eq('DEPLOY again climbs out', r.dug, 0);
g._rtsDigToggle(r);
var mx = r.x;
g._rtsOrderMove(r, r.x - T * 6, r.z, false);
step(3);
S.ok('a move order climbs it out, and it walks', r.dug === 0 && Math.abs(r.x - mx) > T, 'moved ' + ((mx - r.x) / T).toFixed(1) + ' cells, dug ' + r.dug);
g._rtsDigToggle(r);
var apc = g._rtsSpawnUnit('player', 'apc', r.x + T * 2, r.z);
g._rtsOrderBoard(r, apc);
S.eq('...and so does a board order', r.dug, 0);

/* --------------------------------------------------------------- the Dominion ---- */
var M2 = fresh('soviet'), rs = g._rtsSpawnUnit('player', 'rifle', M2.x, M2.z);
S.ok('a Dominion rifle squad cannot dig in', !g._rtsCanDig(rs) && !g._rtsCanDeploy(rs), '');

require('../lib/report.js')(S);
