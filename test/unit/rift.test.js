/* THE RIFT (rules `rifttroop` / `riftharv` / `veiltank`, weapons `riftgun` / `veilgun`, core/rift.js and
   its hooks in core/tick.js, core/orders.js, core/combat.js, core/damage.js, core/harvest.js and
   core/jammer.js), on the real simulation:

     WHOSE        all three are the Compact's, after a Research Lab
     THE JUMP     a Rift Trooper sent somewhere charges where it stands, then is there - having
                  crossed no ground; it takes no new order while charging
     ERASED       its shot does no damage: the target is frozen (it does not move or fire) and nothing
                  else can hurt it; enough shots and it is gone, with no wreck
     IT COMES BACK let the shooting lapse and the target is back, whole
     HOME         a full Rift Harvester jumps to its refinery's dock and unloads
     THE VEIL     a Veil Tank standing still is hidden from the enemy, as a jammed unit is - not
                  targeted from range - and found by an enemy standing close; moving or firing
                  gives it away */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('rift');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
var G, M, T = g.RTS_TILE;

function fresh() {
  g.window._RTS_ARMY = 'allied';
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  var a = g._rtsHas('player', 'yard'), b = g._rtsHas('enemy', 'yard');
  M = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
function at(side, key, dx, dz) { var c = g._rtsNearestOpen(g._rtsTX(M.x + dx * T), g._rtsTX(M.z + dz * T), 6, null); return g._rtsSpawnUnit(side, key, g._rtsWX(c[0]), g._rtsWX(c[1])); }
function step(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }

fresh();
/* ---------------------------------------------------------------- whose ---- */
S.ok('the Rift Trooper, the Rift Harvester and the Veil Tank are the Compact\'s, after a Research Lab',
     ['rifttroop', 'riftharv', 'veiltank'].every(function (k) { var d = g.rtsUnitDef(k); return d.side === 'allied' && d.needs.indexOf('lab') >= 0; }), '');

/* --------------------------------------------------------------- the jump ---- */
var rt = at('player', 'rifttroop', 0, 0), x0 = rt.x, z0 = rt.z;
g._rtsOrderMove(rt, rt.x + 10 * T, rt.z + 4 * T, false);
S.ok('sent somewhere, a Rift Trooper charges a jump', rt.order === 'jump' && !!rt.jump, rt.order);
var nb = at('enemy', 'rifle', 2, 0);                         /* an enemy beside it, in its range */
step(g.RTS_RIFT.charge * 0.5, function () { nb.cool = 99; nb.path = null; });
S.ok('...standing where it is while it charges, and not shooting', Math.hypot(rt.x - x0, rt.z - z0) < 0.01 && !(nb.erase > 0), 'erase ' + nb.erase);
nb.dead = true;
g._rtsOrderMove(rt, rt.x - 10 * T, rt.z, false);
S.ok('...and takes no new order meanwhile', rt.jump && rt.jump.x > x0, '');
step(g.RTS_RIFT.charge);
S.ok('THEN IT IS THERE, having walked nowhere', !rt.jump && Math.hypot(rt.x - (x0 + 10 * T), rt.z - (z0 + 4 * T)) < 3 * T, ((rt.x - x0) / T).toFixed(1) + ',' + ((rt.z - z0) / T).toFixed(1) + ' cells');

/* --------------------------------------------------------------- erased ---- */
G.ents.forEach(function (o) { if (o.def === 'rifle') o.dead = true; });
var tk = at('enemy', 'tank', 13, 4), hp0 = tk.hp, w = g.RTS_WEAPONS.riftgun;
rt.cool = 0; g._rtsFire(rt, tk, w);
S.ok('ITS SHOT DOES NO DAMAGE: the tank is pushed out of time, frozen', tk.hp === hp0 && tk.erase === w.dmg && g._rtsErased(tk), 'hp ' + tk.hp + ', erase ' + tk.erase);
var tx0 = tk.x, rf = at('player', 'tank', 13, 1);
g._rtsOrderMove(tk, tk.x - 6 * T, tk.z, false);
step(0.8, function () { rt.cool = 99; rf.cool = 99; });
S.ok('...it does not move', Math.abs(tk.x - tx0) < 0.01, '');
g._rtsDamage(tk, 200, rf);
S.eq('...and nothing else can hurt it', tk.hp, hp0);
var shots = 0;
while (!tk.dead && shots < 40) { rt.cool = 0; g._rtsFire(rt, tk, w); shots++; }
S.ok('ENOUGH SHOTS AND IT IS GONE', tk.dead && shots === Math.ceil(hp0 / w.dmg) - 1, shots + ' more shots');
var near = function (k) { return G.fx.filter(function (f) { return f.kind === k && Math.hypot(f.x - tk.x, f.z - tk.z) < 1; }).length; };
S.ok('...with no wreck: no debris, no crew climbing out', near('debris') === 0 && near('pop') === 0 && !G.ents.some(function (o) { return !o.dead && o.def === 'rifle' && o.side === 'enemy'; }),
     'debris ' + near('debris') + ', pop ' + near('pop'));

/* --------------------------------------------------------- it comes back ---- */
var tk2 = at('enemy', 'tank', 13, -2);
rt.cool = 0; g._rtsFire(rt, tk2, w);
S.ok('(a second tank, frozen)', g._rtsErased(tk2), '');
step(g.RTS_RIFT.lapse + 0.5, function () { rt.cool = 99; rf.cool = 99; tk2.cool = 99; });
S.ok('IT COMES BACK when the shooting lapses, whole', !g._rtsErased(tk2) && !(tk2.erase > 0) && tk2.hp === tk2.maxHp, 'erase ' + tk2.erase);

/* --------------------------------------------------------------- home ---- */
fresh();
var ref = g._rtsHas('player', 'refinery') || g._rtsPlaceStruct('player', 'refinery', g._rtsHas('player', 'yard').tx + 5, g._rtsHas('player', 'yard').tz + 5, true);
ref.building = 0;
var hv = at('player', 'riftharv', 20, 0);
hv.carry = g.rtsUnitDef('riftharv').capacity; hv.carryVal = 900; hv.hstate = 'toRef'; hv.order = null;
var hx = hv.x, credits0 = G.sides.player.credits, far = g._rtsRangeTo(hv, ref);
step(g.RTS_RIFT.home + 0.2);
S.ok('A FULL RIFT HARVESTER JUMPS HOME to its refinery\'s dock', g._rtsRangeTo(hv, ref) < 3 * T && far > 10 * T,
     'from ' + (far / T).toFixed(1) + ' cells to ' + (g._rtsRangeTo(hv, ref) / T).toFixed(1));
step(10);
S.ok('...and unloads', hv.carry < g.rtsUnitDef('riftharv').capacity / 2 && G.sides.player.credits + (G.sides.player.ore || 0) > credits0, 'carry ' + hv.carry.toFixed(0));

/* ---------------------------------------------------------------- the veil ---- */
fresh();
var vt = at('player', 'veiltank', 0, 0), foe = at('enemy', 'tank', 4, 0);
foe.cool = 99;
/* both hold their fire while it settles: a shot would give it away */
step(g.RTS_RIFT.park + 0.5, function () { foe.cool = 99; foe.target = null; foe.order = 'hold'; foe.path = null; vt.cool = 99; vt.target = null; });
S.ok('A VEIL TANK STANDING STILL IS HIDDEN', g._rtsVeiled(vt) && g._rtsJammed(vt), 'veilT ' + (vt.veilT || 0).toFixed(1));
S.ok('...not to be targeted from range', g._rtsJamHides(vt, 'enemy', vt.x + 8 * T, vt.z), '');
S.ok('...but found by an enemy standing close', !g._rtsJamHides(vt, 'enemy', vt.x + 1 * T, vt.z), '');
vt.cool = 0; g._rtsFire(vt, foe, g.RTS_WEAPONS.veilgun);
S.ok('firing gives it away', !g._rtsJammed(vt) && !g._rtsVeiled(vt), 'veilT ' + vt.veilT);
var quiet = function () { foe.cool = 99; foe.target = null; foe.order = 'hold'; foe.path = null; vt.cool = 99; vt.target = null; };
step(g.RTS_RIFT.park + 0.5, quiet);
S.ok('...and the clock to settle starts again once the shot is past', !g._rtsVeiled(vt), 'veilT ' + vt.veilT.toFixed(1));
step(g.RTS_RIFT.park, quiet);
S.ok('...until it has stood quiet again', g._rtsVeiled(vt) && g._rtsJammed(vt), 'veilT ' + vt.veilT.toFixed(1));
g._rtsOrderMove(vt, vt.x - 6 * T, vt.z, false);
step(0.5, function () { foe.cool = 99; });
S.ok('...and so does moving', !g._rtsVeiled(vt) && !g._rtsJammed(vt), 'veilT ' + vt.veilT);

/* -------------------------------------------------------------- opponent ---- */
S.ok('the opponent\'s mixes have the Rift Trooper and the Veil Tank',
     g.RTS_AI.mix.infantry.some(function (m) { return m.key === 'rifttroop'; }) && g.RTS_AI.mix.vehicle.some(function (m) { return m.key === 'veiltank'; }), '');

require('../lib/report.js')(S);
