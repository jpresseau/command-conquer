/* ORDERS THAT BECOME SOMETHING ELSE SAY SO, AND A PHONE IS TOLD WHAT A UNIT IS (ui/select.js,
   ui/hud.js, ui/selhint.js, core/transport.js, core/bridgelayer.js, core/move.js), on the real
   simulation:

     BOARDING      a squad sent at a full Hovercraft is told it is full; a tank sent at an APC that
                   it carries infantry only; a squad at a Sky Crane that it carries vehicles only;
                   a squad at a Skylift parked far out over the water that it is too far from the
                   shore - and is not left standing on the beach in order 'board' - while the same
                   Skylift over land takes them
     THE CURSOR    a squad over its APC is the board cursor, a tank over it a move; the far-out
                   Skylift a refusal; over an enemy tank a Repair Truck is a refusal, a drone a
                   move, a loaded Skylift the reticle (its drop), an engineer at an enemy
                   building the reticle
     UNARMED       a Repair Truck sent at an enemy tank is told it is unarmed
     HELD          a Wasp out of rockets on its pad, sent at an enemy tank, is told it goes once
                   loaded - and does: the tank is hit after the reload; a move given while it
                   flies home empty is flown once loaded; hold drops the kept order
     THE SPAN      a Bridge Layer facing a gap one cell longer than it can span is told it is too
                   far; facing dry ground, that there is no water ahead
     A PHONE       every unit's description in a phone's words names no key and no click; the
                   first Rifle Squad started on a phone says what it is, the second says
                   "Training"; at a desk the first says "Training"
     A JAMMER      the readout says its field is up and how many it hides, or that it is moving or
                   parking; the 3D view rings its cover round a selected one, in the radar's blue */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('refusals');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js', 'src/ui', 'src/r3d', 'src/sprites', 'src/render3d']);
var said = [];
g.window._rtsSay = g._rtsSay = function (m) { said.push(m); var G = g.window._rtsG; G.msg = m; G.msgT = 4; };
g._rtsSfx = function () {};

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
function open(tx, tz) { var c = g._rtsNearestOpen(tx, tz, 8, null); return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) }; }
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) { var b = g._rtsPlaceStruct(side, k, sp[0], sp[1], true); if (b) b.building = 0; return b; }
  }
  return null;
}
function order(sel, tgt, at) { var G = g.window._rtsG; said.length = 0; G.sel = sel.slice(); g._rtsRightClick(0, 0, { ent: tgt || null, x: (at || tgt).x, z: (at || tgt).z }); return said.slice(); }
var pick = null;
g._rtsPickAt = function () { return pick; };
function cursor(sel, tgt, at) { var G = g.window._rtsG; G.sel = sel.slice(); pick = { ent: tgt || null, x: (at || tgt).x, z: (at || tgt).z }; return g._rtsActionAt(0, 0); }
var M = g.RTS_N >> 1, T, W;

/* ---------------- boarding ---------------- */
var G = fresh(); T = G.terrain; W = g.RTS_T_WATER;
var p = open(M, M);
var hv = g._rtsSpawnUnit('player', 'hovercraft', p.x, p.z);
for (var k = 0; k < 5; k++) g._rtsBoard(g._rtsSpawnUnit('player', 'rifle', p.x, p.z), hv);
var sq = g._rtsSpawnUnit('player', 'rifle', p.x + 3 * g.RTS_TILE, p.z);
var sFull = order([sq], hv);
S.ok('a squad sent at a full Hovercraft is told it is full', g._rtsCargoCount(hv) === 5 && sFull.some(function (m) { return /Hovercraft is full/.test(m); }), sFull.join(' | ') || 'nothing said');
var apc = g._rtsSpawnUnit('player', 'apc', p.x, p.z + 4 * g.RTS_TILE), tk = g._rtsSpawnUnit('player', 'tank', p.x + 2 * g.RTS_TILE, p.z + 4 * g.RTS_TILE);
var sKind = order([tk], apc);
var crane = g._rtsSpawnUnit('player', 'skycrane', p.x - 4 * g.RTS_TILE, p.z), sq2 = g._rtsSpawnUnit('player', 'rifle', p.x - 6 * g.RTS_TILE, p.z);
var sCrane = order([sq2], crane);
S.ok('...a tank at an APC that it carries infantry only; a squad at a Sky Crane that it carries vehicles only',
     sKind.some(function (m) { return /carries infantry only/.test(m); }) && sCrane.some(function (m) { return /carries vehicles only/.test(m); }), sKind.concat(sCrane).join(' | '));
/* far out: a water cell with no ground within four cells of it, found by the terrain alone */
var far = null;
for (var tz = 6; tz < g.RTS_N - 6 && !far; tz++) for (var tx = 6; tx < g.RTS_N - 6 && !far; tx++) {
  var ok = true;
  for (var dz = -4; dz <= 4 && ok; dz++) for (var dx = -4; dx <= 4 && ok; dx++) if (Math.hypot(dx, dz) <= 4 && T[g._rtsIdx(tx + dx, tz + dz)] !== W) ok = false;
  if (ok) far = { tx: tx, tz: tz, x: g._rtsWX(tx), z: g._rtsWX(tz) };
}
var shore = far && g._rtsNearestOpen(far.tx, far.tz, 20, null);
var tr = far && g._rtsSpawnUnit('player', 'tran', far.x, far.z), sq3 = shore && g._rtsSpawnUnit('player', 'rifle', g._rtsWX(shore[0]), g._rtsWX(shore[1]));
if (tr) { tr.x = far.x; tr.z = far.z; tr.order = 'hold'; tr.path = null; }
var sFar = far ? order([sq3], tr) : [];
S.ok('a squad sent at a Skylift parked far out over the water is told it is too far from the shore, and is not left in order board',
     !!far && sFar.some(function (m) { return /too far from the shore/.test(m); }) && sq3.order !== 'board', far ? sFar.join(' | ') + '; order ' + sq3.order : 'no open water four cells from any shore');
var landT = open(M + 8, M + 8);
if (tr) { tr.x = landT.x; tr.z = landT.z; }
var sq4 = g._rtsSpawnUnit('player', 'rifle', landT.x + 2 * g.RTS_TILE, landT.z);
var sNear = order([sq4], tr);
S.ok('...while the same Skylift over land takes them', sq4.order === 'board' && sNear.some(function (m) { return /Loading up/.test(m); }), sNear.join(' | ') + '; order ' + sq4.order);

/* ---------------- the cursor ---------------- */
var sq5 = g._rtsSpawnUnit('player', 'rifle', apc.x + 2 * g.RTS_TILE, apc.z);
var cBoard = cursor([sq5], apc), cTankApc = cursor([tk], apc);
if (tr) { tr.x = far.x; tr.z = far.z; }
var cFar = far ? cursor([sq5], tr) : 'no';
S.ok('a squad over its APC is the board cursor, a tank over it a move, and the Skylift far out a refusal', cBoard === 'board' && cTankApc === 'move' && cFar === 'no', JSON.stringify([cBoard, cTankApc, cFar]));
var et = g._rtsSpawnUnit('enemy', 'tank', p.x + 10 * g.RTS_TILE, p.z), rt = g._rtsSpawnUnit('player', 'repairtruck', p.x + 6 * g.RTS_TILE, p.z);
var dr = g._rtsSpawnUnit('player', 'drone', p.x, p.z), lt = g._rtsSpawnUnit('player', 'tran', p.x + 2 * g.RTS_TILE, p.z + 2 * g.RTS_TILE);
g._rtsBoard(g._rtsSpawnUnit('player', 'rifle', lt.x, lt.z), lt);
var eng = g._rtsSpawnUnit('player', 'engineer', p.x, p.z), ebld = null;
G.ents.forEach(function (e) { if (!ebld && !e.dead && e.side === 'enemy' && e.type === 'struct' && g.rtsCapturable(e.def)) ebld = e; });
var cRT = cursor([rt], et), cDr = cursor([dr], et), cLt = cursor([lt], et), cEng = ebld ? cursor([eng], ebld) : null;
S.ok('over an enemy tank a Repair Truck is a refusal, a drone a move, a loaded Skylift the reticle; an engineer at an enemy building the reticle',
     cRT === 'no' && cDr === 'move' && cLt === 'attack' && cEng === 'attack', JSON.stringify([cRT, cDr, cLt, cEng]));

/* ---------------- unarmed ---------------- */
var sRT = order([rt], et);
S.ok('a Repair Truck sent at an enemy tank is told it is unarmed', sRT.some(function (m) { return /Repair Truck is unarmed - moving up to it/.test(m); }), sRT.join(' | ') || 'nothing said');

/* ---------------- held ---------------- */
G = fresh();
var pad = place('player', 'helipad');
var hl = g._rtsSpawnUnit('player', 'heli', pad.x, pad.z);
hl.ammo = 0; hl.rearming = 5;
var ep = open(M, M), et2 = g._rtsSpawnUnit('enemy', 'tank', ep.x, ep.z), hp0 = et2.hp;
var sHeld = order([hl], et2);
var keptId = hl.airNext && hl.airNext.id;
run(45, function () { et2.order = 'hold'; et2.path = null; et2.target = null; return et2.hp < hp0 || et2.dead; });
S.ok('a Wasp out of rockets on its pad, sent at an enemy tank, is told it goes once loaded', keptId === et2.id && sHeld.some(function (m) { return /It goes once loaded/.test(m); }), sHeld.join(' | '));
S.ok('...and does: the tank is hit after the reload', et2.dead || et2.hp < hp0, et2.hp + ' of ' + hp0);
/* ...and an order no idle aircraft would carry out by itself, given where it is lost: a move
   twenty cells off, to a Wasp flying home empty - the air tick puts the route to its pad in place
   of the move. (A loaded Wasp finds a tank near it unasked, so the attack above cannot tell the
   kept order from its own eyes; and one reloading on its pad keeps its old route anyway.) */
var hl3 = g._rtsSpawnUnit('player', 'heli', pad.x - 10 * g.RTS_TILE, pad.z);
hl3.ammo = 0;
var farP = open(g._rtsTX(pad.x) + 20, g._rtsTX(pad.z));
var sMove = order([hl3], null, farP);
var reached = run(45, function () { return Math.hypot(hl3.x - farP.x, hl3.z - farP.z) < 3 * g.RTS_TILE; });
S.ok('...and a move given while it flies home empty is flown once it is loaded: twenty cells off, where nothing would take it unasked',
     sMove.some(function (m) { return /It goes once loaded/.test(m); }) && reached, sMove.join(' | ') + '; ' + (reached ? 'arrived' : 'still ' + (Math.hypot(hl3.x - farP.x, hl3.z - farP.z) / g.RTS_TILE).toFixed(1) + ' cells off'));
var hl2 = g._rtsSpawnUnit('player', 'heli', pad.x, pad.z);
hl2.ammo = 0; hl2.rearming = 5;
order([hl2], et2);
var k2 = !!hl2.airNext;
G.sel = [hl2]; g._rtsHoldSelected();
S.ok('...and hold drops the kept order', k2 && hl2.airNext === null, JSON.stringify([k2, hl2.airNext]));

/* ---------------- the span ---------------- */
G = fresh(); T = G.terrain;
var B = G.blocked, SPAN = g.RTS_LAYBRIDGE_SPAN, row = null;
for (var fz = 4; fz < g.RTS_N - 4 && !row; fz++) for (var fx = 3; fx < g.RTS_N - SPAN - 6 && !row; fx++) {
  var good = true;
  for (var cz = fz - 2; cz <= fz + 2 && good; cz++) for (var cx = fx - 2; cx <= fx + SPAN + 3 && good; cx++) { var ci = g._rtsIdx(cx, cz); if (T[ci] === W || B[ci] !== 0 || (G.tideD && G.tideD[ci])) good = false; }
  if (good) row = [fx, fz];
}
if (row) for (var zz = row[1] - 2; zz <= row[1] + 2; zz++) for (var xx = row[0] + 1; xx <= row[0] + SPAN + 1; xx++) { var di = g._rtsIdx(xx, zz); T[di] = W; B[di] = 2; }
var bl = row && g._rtsSpawnUnit('player', 'bridgelayer', g._rtsWX(row[0]), g._rtsWX(row[1]));
said.length = 0;
if (bl) { bl.x = g._rtsWX(row[0]); bl.z = g._rtsWX(row[1]); bl.rot = 0; }
var laidFar = bl ? g._rtsLayBridge(bl) : true, sFarSpan = said.slice();
said.length = 0;
if (bl) bl.rot = Math.PI;
var laidDry = bl ? g._rtsLayBridge(bl) : true, sDry = said.slice();
S.ok('a Bridge Layer facing a gap one cell longer than it can span is told it is too far; facing dry ground, that there is no water ahead',
     !!row && !laidFar && !laidDry && /Too far to span/.test(sFarSpan.join()) && /No water ahead/.test(sDry.join()), (row ? '' : 'no staging; ') + sFarSpan.concat(sDry).join(' | '));

/* ---------------- a phone ---------------- */
var keyish = g.RTS_UNITS.concat(g.RTS_STRUCTS).filter(function (d) { var t = g._rtsDescFor(d, true); return /press |click|\bU or |\bD or /.test(t); });
var mb = g._rtsDescFor(g.rtsUnitDef('mineboat'), true), hvd = g._rtsDescFor(g.rtsUnitDef('hovercraft'), true), mcv = g._rtsDescFor(g.rtsUnitDef('mcv'), true);
S.ok('every description in a phone\'s words names no key and no click: a Mine Boat taps LAY MINE, the Hovercraft UNLOAD, the Mobile Yard DEPLOY',
     !keyish.length && /tap LAY MINE/.test(mb) && /UNLOAD puts them down/.test(hvd) && /tap DEPLOY/.test(mcv), keyish.map(function (d) { return d.key; }).join(', ') || JSON.stringify([mb, hvd, mcv]));
G = fresh();
place('player', 'power'); place('player', 'barracks');
g._rtsRecalcPower('player');
G.sides.player.credits = 99999;
g._rtsTouchUI = function () { return true; };
said.length = 0; g._rtsItemClick('rifle'); var first = said.slice();
said.length = 0; g._rtsItemClick('rifle'); var second = said.slice();
g._rtsTouchUI = function () { return false; };
G.descSeen = {}; G.sides.player.q = {};
said.length = 0; g._rtsItemClick('rifle'); var deskFirst = said.slice();
var rd = g.rtsUnitDef('rifle');
S.ok('the first Rifle Squad started on a phone says what it is; the second says it is training; at a desk the first says Training',
     first.indexOf(rd.name + ': ' + rd.desc) >= 0 && second.some(function (m) { return /^Training/.test(m); }) && deskFirst.indexOf('Training.') >= 0, JSON.stringify([first, second, deskFirst]));

/* ---------------- a jammer ---------------- */
G = fresh();
var jp = open(M, M), jm = g._rtsSpawnUnit('player', 'jammer', jp.x, jp.z), mate = g._rtsSpawnUnit('player', 'tank', jp.x + g.RTS_TILE, jp.z);
mate.order = 'hold';
var sParking = g._rtsUnitStateTxt(jm);
run(g.RTS_JAM.park + 0.5, function () { mate.order = 'hold'; mate.path = null; jm.path = null; });
var sUp = g._rtsUnitStateTxt(jm);
g._rtsOrderMove(jm, jp.x + 10 * g.RTS_TILE, jp.z, false);
run(0.1);                                              /* the field drops at the next tick */
var sMove = g._rtsUnitStateTxt(jm);
S.ok('the readout says a Jammer is parking, then that its field is up and how many it hides, and moving that it has none',
     sParking === ' · parking' && sUp === ' · field up, hiding 1 unit' && sMove === ' · moving - no field', JSON.stringify([sParking, sUp, sMove]));
jm.path = null; jm.order = 'hold';
run(g.RTS_JAM.park + 0.5, function () { jm.path = null; });
G.sel = [jm];
var R3 = {}, n = g._r3dRingBuild(G, R3), F = g.R3D_RING_F, half = R3.ringA[6 * F + 5];
G.sel = [mate]; var nMate = g._r3dRingBuild(G, R3);
S.ok('the 3D view rings a selected parked Jammer\'s cover at its reach, in the radar\'s blue - and a tank only its own ring',
     n === 2 && Math.abs(half - g.RTS_JAM.r * g.RTS_TILE) < 1e-6 && Math.abs(R3.ringA[6 * F + 10] - g.R3D_RING_FIELD[2]) < 1e-6 && nMate === 1, JSON.stringify([n, half, nMate]));

require('../lib/report.js')(S);
