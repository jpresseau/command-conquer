/* THE ECONOMY (rules `warharv` / `assay` / `foundry` / `vats`, weapon `warmg`, core/econ.js and its
   hooks in core/harvest.js and core/production.js), on the real simulation:

     WHOSE        the Assay Plant is the Compact's; the Foundry, the Clone Vats and the War Harvester
                  the Dominion's
     THE ASSAY    a load unloaded with an Assay Plant standing pays a quarter more than without
     THE FOUNDRY  a tank costs and builds in three quarters of its price and time; a soldier does not;
                  a Foundry still going up does nothing yet
     THE VATS     a soldier out of the barracks comes out twice; a tank does not
     WAR HARVESTER  it shoots the riflemen who come for it, and keeps working
     THE JETPACK  is trained at the barracks, not on a pad (a batch 8 slip: core/production.js) */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('econ');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
var G, T = g.RTS_TILE;

function fresh(army) {
  g.window._RTS_ARMY = army || 'soviet';
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
}
function place(side, key, dx, dz) {
  var yd = g._rtsHas(side, 'yard'), b = null;
  for (var r = 0; r < 12 && !b; r++) for (var a = 0; a < 8 && !b; a++)
    b = g._rtsPlaceStruct(side, key, yd.tx + dx + Math.round(Math.cos(a * 0.785) * r), yd.tz + dz + Math.round(Math.sin(a * 0.785) * r), true);
  if (b) b.building = 0;
  return b;
}
function step(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function wealth(side) { var s = G.sides[side]; return s.credits + (s.ore || 0); }
var U = function (k) { return g.rtsUnitDef(k); };

/* ---------------------------------------------------------------- whose ---- */
fresh();
S.ok('the Assay Plant is the Compact\'s; the Foundry, the Clone Vats and the War Harvester the Dominion\'s',
     g.rtsStructDef('assay').side === 'allied' && g.rtsStructDef('foundry').side === 'soviet' && g.rtsStructDef('vats').side === 'soviet' && U('warharv').side === 'soviet', '');

/* ---------------------------------------------------------------- the assay ---- */
function unload(withAssay) {
  fresh('allied');
  var ref = g._rtsHas('player', 'refinery') || place('player', 'refinery', 6, 6);
  if (withAssay) place('player', 'assay', -6, 6);
  G.sides.player.credits = 0; G.sides.player.ore = 0;
  var hv = g._rtsSpawnUnit('player', 'harvester', ref.x, ref.z + 3 * T);
  /* one load, well inside the storage a refinery gives, and the count taken the moment it is in */
  hv.carry = 980; hv.carryVal = 600; hv.hstate = 'unload'; hv.ref = ref;
  var w0 = wealth('player');
  for (var t = 0; t < 30 * 30 && hv.hstate === 'unload'; t++) g._rtsTick(1 / 30);
  return wealth('player') - w0;
}
var plain = unload(false), assayed = unload(true);
S.ok('THE ASSAY: a load unloaded with an Assay Plant standing pays a quarter more', plain > 500 && Math.abs(assayed / plain - 1.25) < 0.02, plain.toFixed(0) + ' without, ' + assayed.toFixed(0) + ' with');

/* ---------------------------------------------------------------- the foundry ---- */
fresh();
var tk = U('tank'), rf = U('rifle'), c0 = g._rtsCostOf('player', tk), t0 = g._rtsBuildTimeOf('player', tk), r0 = g._rtsCostOf('player', rf);
var fd = place('player', 'foundry', 6, -6);
fd.building = 5;
S.ok('THE FOUNDRY: one still going up does nothing yet', g._rtsCostOf('player', tk) === c0, '');
fd.building = 0;
S.ok('...standing, a tank costs three quarters of its price', Math.abs(g._rtsCostOf('player', tk) - c0 * 0.75) <= 1, g._rtsCostOf('player', tk) + ' against ' + c0);
S.ok('...and builds in three quarters of its time', Math.abs(g._rtsBuildTimeOf('player', tk) - t0 * 0.75) < 0.01, '');
S.eq('...and a soldier is what it was', g._rtsCostOf('player', rf), r0);

/* ---------------------------------------------------------------- the vats ---- */
function trained(key) { var n0 = G.ents.filter(function (o) { return !o.dead && o.def === key && o.side === 'player'; }).length; g._rtsDeliverUnit('player', key); return G.ents.filter(function (o) { return !o.dead && o.def === key && o.side === 'player'; }).length - n0; }
fresh();
if (!g._rtsHas('player', 'barracks')) place('player', 'barracks', 5, 0);
if (!g._rtsHas('player', 'factory')) place('player', 'factory', -5, 0);
var before = trained('rifle');
place('player', 'vats', 0, 8);
S.ok('THE VATS: a soldier out of the barracks comes out twice', before === 1 && trained('rifle') === 2, 'without ' + before);
S.eq('...a tank does not', trained('tank'), 1);

/* ---------------------------------------------------------------- war harvester ---- */
fresh();
var ref2 = g._rtsHas('player', 'refinery') || place('player', 'refinery', 6, 6);
var wh = g._rtsSpawnUnit('player', 'warharv', ref2.x, ref2.z + 4 * T);
var foe = g._rtsSpawnUnit('enemy', 'rifle', wh.x + 2 * T, wh.z), fh = foe.hp;
step(3, function () { foe.cool = 99; foe.path = null; foe.x = wh.x + 2 * T; foe.z = wh.z; });
S.ok('WAR HARVESTER: it shoots the riflemen who come for it', foe.hp < fh, foe.hp + '/' + fh);
S.ok('...and keeps working', !!wh.hstate && wh.order !== 'attack' && !wh.target, 'hstate ' + wh.hstate + ', order ' + wh.order);

/* ---------------------------------------------------------------- the jetpack ---- */
fresh('allied');
var bk = g._rtsHas('player', 'barracks') || place('player', 'barracks', 5, 0), pad = place('player', 'helipad', -6, -6);
var jp = g._rtsDeliverUnitAt('player', 'jetpack');
S.ok('THE JETPACK is trained at the barracks, not on a pad', !!jp && Math.hypot(jp.x - bk.x, jp.z - bk.z) < Math.hypot(jp.x - pad.x, jp.z - pad.z), jp ? 'barracks ' + (Math.hypot(jp.x - bk.x, jp.z - bk.z) / T).toFixed(1) + ' cells, pad ' + (Math.hypot(jp.x - pad.x, jp.z - pad.z) / T).toFixed(1) : 'none');

/* ------------------------------------------------------------- opponent ---- */
var A = g.RTS_AI, inMix = function (k) { return Object.keys(A.mix).some(function (c) { return A.mix[c].some(function (m) { return m.key === k; }); }); };
/* batch 12a: the three buildings, one each; the War Harvester is a harvester the opponent buys by its own rule */
S.ok('the opponent builds the Assay Plant, the Foundry and the Clone Vats, one of each, and does not buy the War Harvester yet',
     !inMix('warharv') && ['assay', 'foundry', 'vats'].every(function (k) { return A.buildOrder.indexOf(k) >= 0 && A.limit[k] === 1 && A.ratio[k] > 0; }), '');

require('../lib/report.js')(S);
