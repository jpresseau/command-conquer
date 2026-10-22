/* THE ARC (rules `arctroop` / `arctank`, weapons `arcgun` / `arcbolt` / `teslazap`, core/arc.js),
   on the real simulation, through _rtsFire:

     WHOSE        the Dominion trains the Arc Trooper and builds the Arc Tank, after a Radar Post;
                  the Compact neither
     CHARGE       each Arc Trooper of the tower's side within RTS_ARC.charge cells, on foot, adds
                  RTS_ARC.boost of a shot, up to RTS_ARC.max of them; one further out, one inside a
                  transport, the other side's, and a rifle squad do not
     BROWNOUT     a browned-out Arc Tower does not fire - unless it is charged, and then it does
     ONLY THE COIL a Lens Tower beside the same troopers is not charged by them
     SEEN         a charged shot draws an arc from each trooper to the coil, and every arc shot is
                  drawn as an arc
     THE BOLT     an Arc Tank's bolt jumps to the two nearest enemies within its reach of the
                  target, each taking its share through its own armour, and to no more
     THE OPPONENT a Dominion opponent's mixes include the Arc Trooper and the Arc Tank */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('arc');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

var G, MID, DARK = false;
function fresh(army) {
  g.window._RTS_ARMY = army;
  g._rtsNewGame(4242, 'easy');
  G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  var a = g._rtsHas('player', 'yard'), b = g._rtsHas('enemy', 'yard');
  MID = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
var T = function (n) { return n * g.RTS_TILE; };
function struct(side, key, dx, dz) {
  var e = g._rtsPlaceStruct(side, key, 0, 0, true);
  e.x = MID.x + T(dx); e.z = MID.z + T(dz); e.cool = 0;
  return e;
}
function unit(side, key, dx, dz) { return g._rtsSpawnUnit(side, key, MID.x + T(dx), MID.z + T(dz)); }
function power(side, on) { G.sides[side].powerMade = on ? 1e6 : 0; G.sides[side].powerUsed = 100; }
function shot(e, tgt, wk) {
  var fx0 = G.fx.length, w = g.RTS_WEAPONS[wk];
  tgt.hp = tgt.maxHp; tgt.dead = false; e.cool = 0;   /* a charged shot can kill: the target is stood up again */
  power(e.side, !DARK);
  g._rtsSpBuild();
  g._rtsFire(e, tgt, w);
  var bs = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam'; });
  return { dmg: tgt.maxHp - tgt.hp, beams: bs.length, arcs: bs.filter(function (f) { return f.arc; }).length };
}

/* ---------------------------------------------------------------- whose ---- */
fresh('soviet');
var tr = g.rtsUnitDef('arctroop'), tk = g.rtsUnitDef('arctank');
S.ok('the Arc Trooper and the Arc Tank are the Dominion\'s, after a Radar Post',
     tr && tk && tr.kind === 'infantry' && tk.kind === 'vehicle' && tr.needs.indexOf('radar') >= 0 && tk.needs.indexOf('radar') >= 0,
     tr && tk && (tr.needs + ' / ' + tk.needs));
S.ok('the Dominion can field both, the Compact neither',
     g.rtsBuildableBy(tr, 'soviet') && g.rtsBuildableBy(tk, 'soviet') && !g.rtsBuildableBy(tr, 'allied') && !g.rtsBuildableBy(tk, 'allied'), '');
S.eq('the Arc Tower is charged by Arc Troopers', g.rtsStructDef('tesla').chargedBy, 'arctroop');

/* --------------------------------------------------------------- charge ---- */
var A = struct('player', 'tesla', 0, 0), tgt = unit('enemy', 'heavy', 3, 0);
var alone = shot(A, tgt, 'teslazap');
S.ok('an uncharged tower fires its own shot (population)', alone.dmg > 0, alone.dmg.toFixed(1));
S.eq('...drawn as an arc', alone.arcs, 1);
var t1 = unit('player', 'arctroop', -1, 1);
var one = shot(A, tgt, 'teslazap');
S.near('ONE TROOPER CHARGES IT: the shot is 1 + RTS_ARC.boost', one.dmg / alone.dmg, 1 + g.RTS_ARC.boost, 0.01);
S.eq('...and an arc runs from the trooper to the coil', one.arcs, 2);
var more = [unit('player', 'arctroop', 1, -1), unit('player', 'arctroop', -2, 0), unit('player', 'arctroop', 0, 2), unit('player', 'arctroop', 2, 1)];
S.near('no more than RTS_ARC.max troopers charge it', shot(A, tgt, 'teslazap').dmg / alone.dmg, 1 + g.RTS_ARC.boost * g.RTS_ARC.max, 0.01);
more.concat([t1]).forEach(function (u) { u.dead = true; });

var far = unit('player', 'arctroop', g.RTS_ARC.charge + 1, 0);
var apc = unit('player', 'apc', -1, -1), rider = unit('player', 'arctroop', -1, -1); rider.inside = apc;
var theirs = unit('enemy', 'arctroop', 0, -1), rifle = unit('player', 'rifle', 1, 1);
S.near('one further out, one inside a transport, the other side\'s and a rifle squad do not charge it',
       shot(A, tgt, 'teslazap').dmg / alone.dmg, 1, 0.01);
[far, apc, rider, theirs, rifle].forEach(function (u) { u.dead = true; });

/* ------------------------------------------------------------- brownout ---- */
DARK = true;
var dark = shot(A, tgt, 'teslazap');
S.ok('browned out and uncharged, the tower does not fire', dark.dmg === 0 && dark.beams === 0, dark.dmg + ' damage');
var t2 = unit('player', 'arctroop', -1, 1);
var lit = shot(A, tgt, 'teslazap');
S.ok('BROWNED OUT BUT CHARGED, IT FIRES', lit.dmg > 0, lit.dmg.toFixed(1) + ' damage');
S.near('...at the charged strength', lit.dmg / alone.dmg, 1 + g.RTS_ARC.boost, 0.01);
DARK = false;

/* --------------------------------------------------------- only the coil ---- */
fresh('allied');
var L = struct('player', 'prism', 0, 0), lt = unit('enemy', 'tank', 3, 0);
var l0 = shot(L, lt, 'lensbeam');
var near = unit('player', 'arctroop', -1, 1);       /* not the Compact's, but placed by hand */
S.near('a Lens Tower beside an Arc Trooper is not charged', shot(L, lt, 'lensbeam').dmg / l0.dmg, 1, 0.01);
near.dead = true;

/* ---------------------------------------------------------------- bolt ---- */
fresh('soviet');
var tank = unit('player', 'arctank', 0, 0), hit = unit('enemy', 'tank', 3, 0);
var by = [unit('enemy', 'rifle', 4, 0.5), unit('enemy', 'light', 3, -1.5), unit('enemy', 'rifle', 4.5, 1.5)];
var friend = unit('player', 'rifle', 3.5, 0.5);
var ws = g.RTS_WEAPONS.arcbolt, sp = ws.split;
S.ok('the staging: three enemies within the bolt\'s reach of its target, and a friend among them (population)',
     by.every(function (o) { return Math.hypot(o.x - hit.x, o.z - hit.z) <= T(sp.cells); }) && sp.n === 2, '');
var b = shot(tank, hit, 'arcbolt');
var jumped = by.filter(function (o) { return o.hp < o.maxHp; });
S.eq('THE BOLT JUMPS to the two nearest, and no more', jumped.length, sp.n);
var raw = ws.dmg * g._rtsBias('player').fire;
S.ok('...each taking its share through its own armour', jumped.every(function (o) {
  return Math.abs((o.maxHp - o.hp) - Math.max(g.RTS_MIN_DAMAGE, raw * sp.share * g.rtsVerses(ws, o) / g._rtsBias('enemy').armor)) < 0.5;
}), jumped.map(function (o) { return o.def + ' ' + (o.maxHp - o.hp).toFixed(1); }).join(', '));
S.ok('...never to a friend', friend.hp === friend.maxHp, '');
S.eq('...and every leg is drawn as an arc', b.arcs, 1 + sp.n);

/* ------------------------------------------------------------- opponent ---- */
S.ok('the opponent\'s infantry mix has the Arc Trooper and its vehicle mix the Arc Tank',
     g.RTS_AI.mix.infantry.some(function (m) { return m.key === 'arctroop'; }) && g.RTS_AI.mix.vehicle.some(function (m) { return m.key === 'arctank'; }), '');

require('../lib/report.js')(S);
