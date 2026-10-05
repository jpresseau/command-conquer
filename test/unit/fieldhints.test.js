/* WHAT THE FIELD SAYS, at sea and in the weather (ui/superbar.js, ui/hud.js, ui/select.js,
   core/transport.js, core/monitor.js, core/tide.js, core/supers.js, core/skyplay.js), on the
   real simulation:

     ARMED, THEN LOST  a Fog Bank armed when its Mist Tower is destroyed is disarmed, and the
                       player told; armed, the cursor is the weapon's, its area the bank's reach
     READY             the ready line names the button to press, at a desk and on a phone
     THUNDERHEAD       a player's Wasp caught in one is grounded and the player told once; when it
                       passes, told that too
     ASHORE            a loaded Landing Craft aground on a dried flat, sent at the land beside it,
                       puts its squads down where it stands and says so
     AGROUND           a Gunboat on a dried flat is told it is aground when ordered, its readout
                       says so, and the cursor refuses it
     OUT OF REACH      a Monitor sent at an enemy building no water lies within its gun's reach
                       of is told it cannot reach it from the water, and the cursor refuses it;
                       one by the shore is the reticle
     CURSORS           a loaded Landing Craft over dry land is the unload cursor, over water a
                       move; a tank over one of its own buildings is a move
     THE TIDE LINE     says what the tide does next and when, at each of the five stages of the
                       period - and the flats really do dry and flood when it says
     THE HELP LINE     names every key a desk tip names
     PLACING           the placement banner names the gestures of the device in hand - click and
                       Esc at a desk, drag and hold its button on a phone - and holding the button
                       does cancel the placement
     BANNERS           a banner is as wide as its words and clear of the compass: the longest
                       phone line breaks in two inside a 360-pixel field rather than run off it
     PINGS             a ground order given on attack-move pings in the cursor's own amber, from
                       the field and from the radar; a tank sent onto scrap pings a move, and only
                       a Harvester sent there pings the harvest it is given */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');
var fs = require('fs'), path = require('path');

var S = new Suite('fieldhints');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js', 'src/ui']);
var said = [];
g.window._rtsSay = g._rtsSay = function (m) { said.push(m); var G = g.window._rtsG; G.msg = m; G.msgT = 4; };
g._rtsSfx = function () {};
var ROOT = path.join(__dirname, '..', '..');

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
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) { var b = g._rtsPlaceStruct(side, k, sp[0], sp[1], true); if (b) b.building = 0; return b; }
  }
  return null;
}
var pick = null;
g._rtsPickAt = function () { return pick; };
function cursor(sel, tgt, at) { var G = g.window._rtsG; G.sel = sel.slice(); pick = { ent: tgt || null, x: (at || tgt).x, z: (at || tgt).z }; return g._rtsActionAt(0, 0); }
function order(sel, tgt, at) { var G = g.window._rtsG; said.length = 0; G.sel = sel.slice(); g._rtsRightClick(0, 0, { ent: tgt || null, x: (at || tgt).x, z: (at || tgt).z }); return said.slice(); }
var desk = function () { return false; }, phone = function () { return true; };
g._rtsTouchUI = desk;

/* ---------------- armed, then lost ---------------- */
var G = fresh(), U = g.window._rtsUI;
var tower = place('player', 'mist');
G.sides.player.supers = { fogbank: { t: 1e3, ready: true, said: true } };
U.superArm = 'fogbank';
var pt = { x: g._rtsWX(g.RTS_N >> 1), z: g._rtsWX(g.RTS_N >> 1) };
var cArmed = cursor([], null, pt), rFog = g._rtsSuperRadius('fogbank'), rStorm = g._rtsSuperRadius('thunder');
g._rtsSuperStale(g._rtsSuperSources('player'));
var keptArmed = U.superArm;
tower.dead = true;
g._rtsSuperStale(g._rtsSuperSources('player'));
S.ok('a Fog Bank armed when its Mist Tower is destroyed is disarmed, and the player told', !!tower && keptArmed === 'fogbank' && U.superArm === null && said.some(function (m) { return /Fog Bank lost - its Mist Tower is gone/.test(m); }),
     'armed ' + keptArmed + ' -> ' + U.superArm + '; ' + said.join(' | '));
S.ok('...and while armed, the cursor is the weapon\'s, its area the bank\'s reach - and the storm\'s', cArmed === 'super' && rFog === g.RTS_FOGBANK.r && rStorm === g.RTS_THUNDER.r, JSON.stringify([cArmed, rFog, rStorm]));

/* ---------------- ready ---------------- */
var fogSup = g.rtsStructDef('mist').super;
var rDesk = g._rtsSuperReadyLine(fogSup);
g._rtsTouchUI = phone; var rPhone = g._rtsSuperReadyLine(fogSup); g._rtsTouchUI = desk;
G = fresh(); place('player', 'mist');
G.sides.player.supers = { fogbank: { t: fogSup.charge - 0.01, ready: false, said: false } };
said.length = 0; run(0.2);
S.ok('the ready line names the button to press, at a desk and on a phone - and is the one said when it charges',
     rDesk === 'Fog Bank ready — press ' + fogSup.icon + ' Fog Bank, then click where the fog should fall.' && /press .* Fog Bank, then tap where/.test(rPhone) && said.indexOf(rDesk) >= 0,
     JSON.stringify([rDesk, rPhone, said]));

/* ---------------- thunderhead ---------------- */
G = fresh();
var hpad = place('player', 'helipad'), M = g.RTS_N >> 1;
var air = g._rtsNearestOpen(M, M, 10, null), wasp = g._rtsSpawnUnit('player', 'heli', g._rtsWX(air[0]), g._rtsWX(air[1]));
g._rtsFireThunder('enemy', air[0], air[1]);
said.length = 0;
run(2, function () { wasp.target = null; });
var heldSaid = said.filter(function (m) { return /Thunderhead: your aircraft in it are grounded/.test(m); }).length;
said.length = 0;
run(g.RTS_THUNDER.time + 2);
S.ok('a player\'s Wasp caught in a Thunderhead is grounded and the player told once - and told when it passes',
     heldSaid === 1 && said.some(function (m) { return /The thunderhead has passed/.test(m); }), heldSaid + ' grounding lines; then ' + said.join(' | '));

/* ---------------- ashore, aground ---------------- */
G = fresh();
var P = g.RTS_TIDE.period, N = g.RTS_N;
G.t = P / 2; g._rtsTideTick(0);
var T = G.terrain, ring = -1;
for (var i = 0; i < N * N && ring < 0; i++) if (G.tideD[i] === 1 && G.tideDry[i] && g._rtsNearestOpen(i % N, (i / N) | 0, 2, null)) ring = i;
var rx = ring % N, rz = (ring / N) | 0, landC = null;
/* real dry land beside the flat - not the dried flat itself, which is ground too at low water */
for (var dd = 1; dd <= 3 && !landC; dd++) for (var oz = -dd; oz <= dd && !landC; oz++) for (var ox = -dd; ox <= dd && !landC; ox++) {
  var lc = g._rtsIdx(rx + ox, rz + oz);
  if (T[lc] !== g.RTS_T_WATER && !g._rtsBlocked(rx + ox, rz + oz, null)) landC = [rx + ox, rz + oz];
}
var lst = g._rtsSpawnUnit('player', 'lst', g._rtsWX(rx), g._rtsWX(rz)); lst.x = g._rtsWX(rx); lst.z = g._rtsWX(rz);
var gb = g._rtsSpawnUnit('player', 'gunboat', g._rtsWX(rx), g._rtsWX(rz)); gb.x = lst.x; gb.z = lst.z;
for (var k = 0; k < 2; k++) g._rtsBoard(g._rtsSpawnUnit('player', 'rifle', g._rtsWX(landC[0]), g._rtsWX(landC[1])), lst);
var inland = g._rtsNearestOpen(landC[0] + (landC[0] - rx) * 4, landC[1] + (landC[1] - rz) * 4, 6, null);
var sAshore = order([lst], null, { x: g._rtsWX(inland[0]), z: g._rtsWX(inland[1]) });
S.ok('a loaded Landing Craft aground on a dried flat, sent at the land beside it, puts its squads down where it stands and says so',
     ring >= 0 && g._rtsCargoCount(lst) === 0 && sAshore.some(function (m) { return /putting them down here/.test(m); }) && !sAshore.some(function (m) { return /aground/.test(m); }),
     ring + '; aboard ' + g._rtsCargoCount(lst) + '; ' + sAshore.join(' | '));
/* sent at open water - where a hull afloat would go, so only being aground refuses it */
var wetW = g._rtsNearestOpen(rx, rz, 12, 'sea'), wetP = { x: g._rtsWX(wetW[0]), z: g._rtsWX(wetW[1]) };
var sAground = order([gb], null, wetP);
var stAground = g._rtsUnitStateTxt(gb), cAground = cursor([gb], null, wetP);
S.ok('a Gunboat on a dried flat is told it is aground when ordered, its readout says so, and the cursor refuses it',
     sAground.some(function (m) { return /Gunboat is aground - afloat again on the flood/.test(m); }) && stAground === ' · aground until the flood' && cAground === 'no',
     JSON.stringify([sAground, stAground, cAground]));

/* a dried flat is ground for a landing: a loaded craft sent at one beside it puts its load down,
   where it was taken for water and the craft was given a move it could not make */
var lst3 = g._rtsSpawnUnit('player', 'lst', lst.x, lst.z); lst3.x = lst.x; lst3.z = lst.z;
g._rtsBoard(g._rtsSpawnUnit('player', 'rifle', g._rtsWX(landC[0]), g._rtsWX(landC[1])), lst3);
var flatNext = null;
for (var fz2 = -2; fz2 <= 2 && !flatNext; fz2++) for (var fx2 = -2; fx2 <= 2 && !flatNext; fx2++) {
  var fi = g._rtsIdx(rx + fx2, rz + fz2);
  if ((fx2 || fz2) && T[fi] === g.RTS_T_WATER && G.tideDry[fi]) flatNext = { x: g._rtsWX(rx + fx2), z: g._rtsWX(rz + fz2) };
}
var sFlat = flatNext ? order([lst3], null, flatNext) : [];
S.ok('...and sent at the dried flat beside it, the same: the flat is ground at low water', !!flatNext && g._rtsCargoCount(lst3) === 0 && sFlat.some(function (m) { return /putting them down here/.test(m); }),
     (flatNext ? '' : 'no dried flat beside it; ') + 'aboard ' + g._rtsCargoCount(lst3) + '; ' + sFlat.join(' | '));

/* ---------------- out of reach ---------------- */
G = fresh(); T = G.terrain;
/* an enemy building planted where no Monitor water lies within twice its gun's reach, and one by the shore */
var reachC = g.RTS_WEAPONS.monitorgun.range / g.RTS_TILE, deep = null, coast = null;
for (var tz = 4; tz < N - 4 && !(deep && coast); tz++) for (var tx = 4; tx < N - 4 && !(deep && coast); tx++) {
  if (!g._rtsCanPlace('enemy', 'power', tx, tz, true)) continue;
  var w = g._rtsNearestOpen(tx, tz, Math.ceil(reachC * 2), 'shallow');
  if (!deep && !w) deep = [tx, tz];
  if (!coast && w && Math.hypot(w[0] - tx, w[1] - tz) <= 3) coast = [tx, tz];
}
var bDeep = deep && g._rtsPlaceStruct('enemy', 'power', deep[0], deep[1], true), bCoast = coast && g._rtsPlaceStruct('enemy', 'power', coast[0], coast[1], true);
var mw = coast && g._rtsNearestOpen(coast[0], coast[1], 6, 'shallow'), mon = mw && g._rtsSpawnUnit('player', 'monitor', g._rtsWX(mw[0]), g._rtsWX(mw[1]));
var sFar = mon && bDeep ? order([mon], bDeep) : [], cFar = mon && bDeep ? cursor([mon], bDeep) : null, cNear = mon && bCoast ? cursor([mon], bCoast) : null;
S.ok('a Monitor sent at an enemy building no water lies within its reach of is told so, and the cursor refuses it; one by the shore is the reticle',
     !!(bDeep && bCoast && mon) && sFar.some(function (m) { return /cannot reach that from the water/.test(m); }) && cFar === 'no' && cNear === 'attack',
     (bDeep && bCoast && mon ? '' : 'staging: ' + JSON.stringify([deep, coast, !!mon]) + '; ') + JSON.stringify([sFar, cFar, cNear]));

/* ---------------- cursors ---------------- */
G = fresh(); T = G.terrain;
var sea = g._rtsNearestOpen(N >> 1, N >> 1, 40, 'sea'), dry = g._rtsNearestOpen(sea[0], sea[1], 12, null);
var lst2 = g._rtsSpawnUnit('player', 'lst', g._rtsWX(sea[0]), g._rtsWX(sea[1]));
g._rtsBoard(g._rtsSpawnUnit('player', 'rifle', g._rtsWX(dry[0]), g._rtsWX(dry[1])), lst2);
var cLand = cursor([lst2], null, { x: g._rtsWX(dry[0]), z: g._rtsWX(dry[1]) }), cSea = cursor([lst2], null, { x: g._rtsWX(sea[0]), z: g._rtsWX(sea[1]) });
var pw = g._rtsHas('player', 'power') || place('player', 'power'), tk = g._rtsSpawnUnit('player', 'tank', g._rtsWX(dry[0]), g._rtsWX(dry[1]));
var cOwn = cursor([tk], pw);
S.ok('a loaded Landing Craft over dry land is the unload cursor, over water a move; a tank over one of its own buildings is a move',
     cLand === 'unload' && cSea === 'move' && cOwn === 'move', JSON.stringify([cLand, cSea, cOwn]));

/* ---------------- the tide line ---------------- */
G = fresh();
var stages = [[10, 'flats dry in'], [80, 'ebbing - low in'], [180, 'low - flood in'], [270, 'flooding - high in'], [330, 'flats dry in']];
var lines = stages.map(function (s) { G.t = s[0]; return g._rtsTideLine(G); });
var stageOk = stages.every(function (s, i) { return lines[i].indexOf('TIDE: ' + s[1] + ' ') === 0; });
/* ...and the sim agrees: the first ring is dry a second after the line's "flats dry in" runs out, not a second before */
G.t = 10; var n0 = g._rtsTideNext(G), tIn = 10 + n0.secs;
function ringDry(t) { G.t = t; g._rtsTideTick(0); var c = 0; for (var q = 0; q < G.tideD.length; q++) if (G.tideD[q] === 1 && G.tideDry[q]) c++; return c; }
var before = ringDry(tIn - 1), after = ringDry(tIn + 1);
G.t = 80; var n1 = g._rtsTideNext(G), tOut = 80 + n1.secs;
function outerDry(t) { G.t = t; g._rtsTideTick(0); var c = 0; for (var q = 0; q < G.tideD.length; q++) if (G.tideD[q] === g.RTS_TIDE.reach && G.tideDry[q]) c++; return c; }
var oBefore = outerDry(tOut - 1), oAfter = outerDry(tOut + 1);
S.ok('the tide line says what the tide does next and when, at each of the five stages of the period', g._rtsTideAny(G) && stageOk, lines.join(' | '));
S.ok('...and the flats dry when it says: the first ring a second after its count runs out and not before, and the last ring the same',
     before === 0 && after > 0 && oBefore === 0 && oAfter > 0, 'first ring ' + before + ' -> ' + after + ' at ' + tIn.toFixed(1) + ' s; last ring ' + oBefore + ' -> ' + oAfter + ' at ' + tOut.toFixed(1) + ' s');

/* ---------------- the help line ---------------- */
var shell = fs.readFileSync(path.join(ROOT, 'src/ui/shell.js'), 'utf8'), helpM = shell.match(/rts-help desk">([^<]*)</), help = helpM ? helpM[1] : '';
var named = {};
g.RTS_UNITS.forEach(function (d) { ((g._rtsVerbTip(d, false) || '').replace(/^[^:]*:/, '').match(/(?:^|[\s(])([A-Z])(?= (?:or|\+|to) )/g) || []).forEach(function (m) { named[m.trim()] = 1; }); });
var missing = Object.keys(named).filter(function (k) { return help.indexOf(' ' + k + ' ') < 0; });
S.ok('the help line names every key a desk tip names', Object.keys(named).length >= 3 && !missing.length, (missing.length ? 'missing ' + missing.join(',') + ' from ' : '') + help);

/* ---------------- placing ---------------- */
g._rtsGhostHide = function () {};
var pDesk = g._rtsPlaceHint('Power Plant', false), pPhone = g._rtsPlaceHint('Power Plant', true);
G = fresh(); U = g.window._rtsUI;
G.sides.player.ready = 'power'; U.place = 'power';
g._rtsItemCancel('power');                 /* what holding a build button does on a phone (ui/sidebar.js) */
S.ok('the placement banner names the device\'s gestures: click and Esc at a desk, drag and hold its button on a phone - and holding it does cancel the placement',
     pDesk === 'Click to place Power Plant  ·  Esc to cancel' && !/click|esc/i.test(pPhone) && /^Drag to place Power Plant .*hold its button to cancel$/.test(pPhone) && U.place === null,
     JSON.stringify([pDesk, pPhone, U.place]));

/* ---------------- banners ---------------- */
/* a context that measures 6.6 pixels a character at 13-pixel type, and keeps what was drawn */
function fakeG() {
  var o = { font: '', rects: [], texts: [], fillRect: function (x, y, w, h) { o.rects.push([x, y, w, h]); }, fillText: function (t) { o.texts.push(t); },
            measureText: function (t) { return { width: t.length * 6.6 * parseFloat(o.font) / 13 }; } };
  return o;
}
var longest = '';
g.RTS_STRUCTS.forEach(function (d) { var h = g._rtsPlaceHint(d.name, true); if (h.length > longest.length) longest = h; });
g._rtsTouchUI = phone;
g.RTS_STRUCTS.forEach(function (d) { if (!d.super) return; var h = g._rtsArmedHint(d.super, true); if (h.length > longest.length) longest = h; });
g._rtsTouchUI = desk;
var fg = fakeG(), b360 = g._rtsBanner(fg, 360, longest, 56), r360 = fg.rects[0];
var fg2 = fakeG(), b840 = g._rtsBanner(fg2, 840, pDesk, 44), r840 = fg2.rects[0];
S.ok('a banner is as wide as its words and clear of the compass: the longest phone line breaks in two inside a 360-pixel field rather than run off it',
     longest.length > 50 && b360.lines === 2 && fg.texts.length === 2 && r360[0] >= 56 && r360[0] + r360[2] <= 304 && r360[1] === 56 && b360.px >= 10 &&
     b840.lines === 1 && b840.px === 13 && r840[2] === Math.ceil(pDesk.length * 6.6) + 24 && r840[1] === 44,
     JSON.stringify([longest, b360, r360, b840, r840]));

/* ---------------- attack-move ---------------- */
G = fresh(); U = g.window._rtsUI;
/* sent onto scrap, which is where the old ping went wrong: it read the ground, not the order */
var ore = -1;
for (var oi = 0; oi < N * N && ore < 0; oi++) if (G.scrap[oi] > 0 && !g._rtsBlocked(oi % N, (oi / N) | 0, null)) ore = oi;
var ox0 = ore % N, oz0 = (ore / N) | 0, dw = { x: g._rtsWX(ox0), z: g._rtsWX(oz0) };
var at0 = g._rtsNearestOpen(ox0 + 5, oz0, 8, null), tk2 = g._rtsSpawnUnit('player', 'tank', g._rtsWX(at0[0]), g._rtsWX(at0[1]));
G.mapped[ore] = 1;                          /* the radar reads ore only where the map is explored */
U.attackMove = true; order([tk2], null, dw); var kA = U.flash && U.flash.kind, oA = tk2.order;
U.attackMove = false; order([tk2], null, dw); var kM = U.flash && U.flash.kind;
U.flash = null; g._rtsRadarOrder([tk2], dw, true); var kRA = U.flash && U.flash.kind;
U.flash = null; g._rtsRadarOrder([tk2], dw, false); var kRM = U.flash && U.flash.kind;
var hv = g._rtsSpawnUnit('player', 'harvester', g._rtsWX(at0[0]), g._rtsWX(at0[1]));
var cHv = cursor([hv], null, dw); U.flash = null; order([hv], null, dw); var kH = U.flash && U.flash.kind;
/* the cursor's own colour for each order, read off the last stroke it makes */
function cursorCol(kind) {
  var t = {}, last = null;
  var cg = new Proxy(t, { get: function (o, k) { return k in o ? o[k] : function () { if (k === 'stroke') last = o.strokeStyle; }; }, set: function (o, k, v) { o[k] = v; return true; } });
  g._rtsDrawCursor(cg, 0, 0, kind);
  return last;
}
var cA = cursorCol('amove'), cM = cursorCol('move');
S.ok('a ground order on attack-move pings in the cursor\'s own amber, from the field and from the radar',
     ore >= 0 && oA === 'amove' && kA === 'amove' && kRA === 'amove' && cA !== cM && g._rtsPingCol(kA) === cA, JSON.stringify([ore, oA, kA, kRA, cA, g._rtsPingCol('amove')]));
S.ok('...and a tank sent onto scrap pings a move, not a harvest, from either; a Harvester sent there is the harvest cursor and the harvest ping',
     ore >= 0 && kM === 'move' && kRM === 'move' && g._rtsPingCol(kM) === cM && cHv === 'harvest' && kH === 'harvest', JSON.stringify([kM, kRM, cM, cHv, kH]));

require('../lib/report.js')(S);
