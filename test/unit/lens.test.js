/* THE LENS BEAM (rules `prism` / `prismtank`, weapons `lensbeam` / `lenssplit`, core/lens.js),
   on the real simulation, through _rtsFire - the one place every shot passes:

     WHOSE        the Compact builds the Lens Tower and the Lens Tank, after a Radar Post and a
                  Research Lab; the Dominion builds neither
     ALONE        a lone tower's shot is its weapon's damage, and nothing relays
     RELAY        each idle tower in reach adds half a shot, and spends its own reload doing it;
                  a tower whose gun is reloading, one still being built, one beyond reach and
                  the other side's tower do not; a line of towers passes the light down the line
     CAP          no more than RTS_LENS.max relays, however big the cluster
     POWER        a browned-out side's tower does not fire at all, so nothing relays
     FORK         a Lens Tank's beam forks onto the nearest enemies round its target - up to
                  RTS_LENS.forks of them, each taking half the shot through its own armour - and
                  never onto a friend, an aircraft, a submerged boat, a passenger, or anything
                  beyond RTS_LENS.fork cells
     THE OPPONENT a Compact opponent's plan includes the Lens Tower and its mix the Lens Tank */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('lens');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(army) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  return G;
}
var T = function (n) { return n * g.RTS_TILE; };
/* everything is staged in the middle of the map, a long way from both bases, and never ticked:
   the shots are fired by hand and nothing else moves */
var MID;
function tower(side, dx, dz) {
  var e = g._rtsPlaceStruct(side, 'prism', 0, 0, true);
  e.x = MID.x + T(dx); e.z = MID.z + T(dz); e.cool = 0;
  return e;
}
function unit(side, key, dx, dz) {
  return g._rtsSpawnUnit(side, key, MID.x + T(dx), MID.z + T(dz));
}
/* one shot from `e` at a fresh `tgt`: the damage it did, and the beams it drew */
function shot(e, tgt) {
  var G = g.window._rtsG, fx0 = G.fx.length, w = g.RTS_WEAPONS[e.type === 'struct' ? 'lensbeam' : 'lenssplit'];
  tgt.hp = tgt.maxHp; tgt.dead = false; e.cool = 0;   /* a cluster's shot can kill: the target is stood up again */
  power(G, e.side, !DARK);                        /* placing a tower recounts the side's power */
  g._rtsSpBuild();
  g._rtsFire(e, tgt, w);
  return { dmg: tgt.maxHp - tgt.hp, beams: G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam'; }).length };
}
var DARK = false;
function power(G, side, on) { G.sides[side].powerMade = on ? 1e6 : 0; G.sides[side].powerUsed = 100; }

/* ---------------------------------------------------------------- whose ---- */
var G = fresh('allied');
var tw = g.rtsStructDef('prism'), tk = g.rtsUnitDef('prismtank');
S.ok('the Lens Tower is the Compact\'s, after a Radar Post, and needs power',
     tw && tw.side === 'allied' && tw.needs.indexOf('radar') >= 0 && tw.needsPower && tw.weapon === 'lensbeam',
     tw && (tw.side + ' needs ' + tw.needs + ' power ' + tw.needsPower));
S.ok('the Lens Tank is the Compact\'s, after a Research Lab', tk && tk.side === 'allied' && tk.needs.indexOf('lab') >= 0 && tk.weapon === 'lenssplit',
     tk && (tk.side + ' needs ' + tk.needs));
S.ok('the Compact can build both, the Dominion neither',
     g.rtsBuildableBy(tw, 'allied') && g.rtsBuildableBy(tk, 'allied') && !g.rtsBuildableBy(tw, 'soviet') && !g.rtsBuildableBy(tk, 'soviet'),
     'allied ' + g.rtsBuildableBy(tw, 'allied') + '/' + g.rtsBuildableBy(tk, 'allied') + ', soviet ' + g.rtsBuildableBy(tw, 'soviet') + '/' + g.rtsBuildableBy(tk, 'soviet'));

/* ---------------------------------------------------------------- relay ---- */
var yd = g._rtsHas('player', 'yard'), ey = g._rtsHas('enemy', 'yard');
MID = { x: (yd.x + ey.x) / 2, z: (yd.z + ey.z) / 2 };
power(G, 'player', true);
var A = tower('player', 0, 0), tgt = unit('enemy', 'tank', 4, 0);
var alone = shot(A, tgt);
var w = g.RTS_WEAPONS.lensbeam, base = w.dmg * g.rtsVerses(w, tgt) * g._rtsBias('player').fire;
S.near('a lone tower hits for its weapon\'s damage', alone.dmg, base / g._rtsBias('enemy').armor, 0.5);
S.eq('...and draws only its own beam', alone.beams, 1);

var B = tower('player', -6, 0), C = tower('player', -12, 0);      /* a line: A <- B <- C, 6 cells apart */
var line = shot(A, tgt);
S.near('TWO TOWERS RELAY: the shot is twice a lone tower\'s (1 + 0.5 x 2)', line.dmg / alone.dmg, 1 + g.RTS_LENS.add * 2, 0.01);
S.ok('C reaches A only through B, so the light passes down the line', Math.hypot(C.x - A.x, C.z - A.z) > T(g.RTS_LENS.relay) && line.beams === 3,
     'C is ' + (Math.hypot(C.x - A.x, C.z - A.z) / g.RTS_TILE).toFixed(1) + ' cells from A; ' + line.beams + ' beams');
S.ok('the relays spend a reload doing it', B.cool > 0 && C.cool > 0, 'B ' + B.cool.toFixed(2) + ', C ' + C.cool.toFixed(2));

/* a tower already reloading relays nothing - and neither does anything only it connected */
B.cool = 1; C.cool = 0;
S.near('a reloading tower does not relay, and cuts the line behind it', shot(A, tgt).dmg / alone.dmg, 1, 0.01);
B.cool = 0; B.building = 1; C.cool = 0;
S.near('a tower still being built does not relay', shot(A, tgt).dmg / alone.dmg, 1, 0.01);
B.building = 0;
B.x = A.x - T(g.RTS_LENS.relay + 1); C.x = B.x - T(4);
B.cool = 0; C.cool = 0;
S.near('a tower beyond reach does not relay', shot(A, tgt).dmg / alone.dmg, 1, 0.01);
B.x = A.x - T(3); C.dead = true; B.cool = 0;
var foe = tower('enemy', 0, -3);
S.near('the other side\'s tower does not relay (B does: 1.5)', shot(A, tgt).dmg / alone.dmg, 1 + g.RTS_LENS.add, 0.01);
foe.dead = true; B.dead = true;

/* ------------------------------------------------------------------ cap ---- */
var many = [];
for (var k = 0; k < g.RTS_LENS.max + 3; k++) many.push(tower('player', -2 - (k % 3) * 2, -4 + Math.floor(k / 3) * 2));
var cl = shot(A, tgt);
S.near('a cluster relays no more than RTS_LENS.max towers', cl.dmg / alone.dmg, 1 + g.RTS_LENS.add * g.RTS_LENS.max, 0.01);
S.eq('...and only that many spend their reload', many.filter(function (t) { return t.cool > 0; }).length, g.RTS_LENS.max);

/* ---------------------------------------------------------------- power ---- */
many.forEach(function (t) { t.cool = 0; });
DARK = true;
var dark = shot(A, tgt);
S.ok('browned out, a tower does not fire and nothing relays', dark.dmg === 0 && dark.beams === 0 && many.every(function (t) { return !(t.cool > 0); }),
     dark.dmg + ' damage, ' + dark.beams + ' beams');
DARK = false;
many.forEach(function (t) { t.dead = true; });

/* ----------------------------------------------------------------- fork ---- */
G = fresh('allied');
MID = { x: (g._rtsHas('player', 'yard').x + g._rtsHas('enemy', 'yard').x) / 2, z: (g._rtsHas('player', 'yard').z + g._rtsHas('enemy', 'yard').z) / 2 };
var tank = unit('player', 'prismtank', 0, 0), hit = unit('enemy', 'tank', 5, 0);
var near = [unit('enemy', 'rifle', 6, 1), unit('enemy', 'light', 5, -2), unit('enemy', 'tank', 7, 0)];
var friend = unit('player', 'tank', 6, -1), far = unit('enemy', 'tank', 5 + g.RTS_LENS.fork + 1, 0);
var air = unit('enemy', 'heli', 4, 1), rider = unit('enemy', 'rifle', 5, 1); rider.inside = hit;
var sub = unit('enemy', 'sub', 4, -1); sub.hidden = 1;
S.ok('the staging has enemies in fork reach, and a friend, an aircraft, a passenger and a hidden boat beside them (population)',
     near.every(Boolean) && friend && far && air && sub && rider, '');
var all = near.concat([friend, far, air, rider, sub]);
all.forEach(function (o) { o.hp = o.maxHp; });
var ws = g.RTS_WEAPONS.lenssplit, fired = shot(tank, hit);
var raw = ws.dmg * g._rtsBias('player').fire;
var forked = near.filter(function (o) { return o.hp < o.maxHp; });
S.eq('THE BEAM FORKS onto every enemy within reach', forked.length, near.length);
S.ok('...each taking half the shot through its own armour', near.every(function (o) {
  var want = raw * g.RTS_LENS.share * g.rtsVerses(ws, o) / g._rtsBias('enemy').armor;
  return Math.abs((o.maxHp - o.hp) - Math.max(g.RTS_MIN_DAMAGE, want)) < 0.5;
}), near.map(function (o) { return o.def + ' ' + (o.maxHp - o.hp).toFixed(1); }).join(', '));
S.ok('never onto a friend, an aircraft, a passenger, a hidden boat, or past reach', [friend, far, air, rider, sub].every(function (o) { return o.hp === o.maxHp; }),
     [friend, far, air, rider, sub].map(function (o) { return o.def + ' ' + (o.maxHp - o.hp); }).join(', '));
S.eq('...and draws a beam for the shot and one per fork', fired.beams, 1 + near.length);
for (k = 0; k < 4; k++) near.push(unit('enemy', 'rifle', 4 + (k % 2), 2 - k));
near.forEach(function (o) { o.hp = o.maxHp; });
shot(tank, hit);
S.eq('no more than RTS_LENS.forks forks, however many stand there', near.filter(function (o) { return o.hp < o.maxHp; }).length, g.RTS_LENS.forks);

/* ------------------------------------------------------------- opponent ---- */
S.ok('the opponent\'s base plan and limits include the Lens Tower',
     g.RTS_AI.buildOrder.indexOf('prism') >= 0 && g.RTS_AI.ratio.prism > 0 && g.RTS_AI.limit.prism > 0, '');
S.ok('...and its vehicle mix the Lens Tank', g.RTS_AI.mix.vehicle.some(function (m) { return m.key === 'prismtank'; }), '');

require('../lib/report.js')(S);
