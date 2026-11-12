/* A STEADY FRAME IN A HEAVY BATTLE - render3d/pace3d.js and upload3d.js, the effects' packing
   and the instances' one upload, asked without a GPU through a stand-in that records what would
   have been sent. e2e/pace checks the page.

     THE TERRAIN   a stamp sends its rectangle, not the 36 MB canvas; a re-bake sends the whole;
                   a burst of stamps goes as one rectangle; nothing at all when nothing changed
     THE EFFECTS   four corners a quad go up, drawn through a fixed index of 0 1 2, 0 2 3
     INSTANCES     a pass's batches go up end to end in one upload, each drawn from its offset
     MODEL BUILDS  a live frame with its budget spent draws a pose or a roll as the base model,
                   and builds it on a later frame; a spec's frame builds everything; spare time
                   warms the base model of every unit type in the match
     THE PIXELS    in AUTO, slow frames that are waiting on the GPU take the resolution down a
                   step at a time to the floor, and quick ones bring it back; slow frames held
                   by their own script do not; a chosen tier is never touched; and the tiers wait
                   for the resolution to run out before they step down */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('pace');
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites', 'src/render3d']);
g._rtsNewGame(4242, 'easy');

/* a GL that records */
function fakeGL() {
  var log = [];
  var gl = { log: log, TEXTURE_2D: 1, RGBA: 2, UNSIGNED_BYTE: 3, NEAREST: 4, LINEAR: 5, ARRAY_BUFFER: 6, ELEMENT_ARRAY_BUFFER: 7,
    STATIC_DRAW: 8, STREAM_DRAW: 9, TEXTURE_MIN_FILTER: 10, TEXTURE_MAG_FILTER: 11, TEXTURE_WRAP_S: 12, TEXTURE_WRAP_T: 13, CLAMP_TO_EDGE: 14,
    createTexture: function () { return {}; }, createBuffer: function () { return {}; },
    bindTexture: function () {}, texParameteri: function () {}, bindBuffer: function (t, b) { log.push(['bind', t]); },
    texImage2D: function () { log.push(['tex', arguments.length]); },
    texSubImage2D: function (t, l, x, y, w, h) { log.push(['sub', x, y, w, h]); },
    bufferData: function (t, d) { log.push(['buf', t, d.length, d]); } };
  return gl;
}
function canvas(w, h) {
  return { width: w, height: h, getContext: function () { return { getImageData: function (x, y, ww, hh) { return { data: new Uint8Array(ww * hh * 4) }; } }; } };
}

/* ---- THE TERRAIN ---- */
var R3 = { terrainDirty: true }, gl = fakeGL(), cv = canvas(3072, 3072);
g.window._R3D = R3;
g._r3dTerrainUpload(gl, R3, cv);
S.ok('a re-baked terrain goes up whole, once', gl.log.filter(function (c) { return c[0] === 'tex'; }).length === 1 && !R3.terrainDirty);
gl.log.length = 0;
g._r3dTerrainUpload(gl, R3, cv);
S.eq('...and with nothing stamped since, nothing goes', gl.log.length, 0);
g._r3dTerrainStamp(100, 200, 14, 12); g._r3dTerrainStamp(900, 40, 24, 24);
g._r3dTerrainUpload(gl, R3, cv);
var subs = gl.log.filter(function (c) { return c[0] === 'sub'; }), whole = gl.log.filter(function (c) { return c[0] === 'tex'; });
S.ok('a stamp sends its own rectangle and no more', whole.length === 0 && subs.length === 2 && subs[0][3] * subs[0][4] < 20 * 20 && subs[0][1] <= 100 && subs[0][1] + subs[0][3] >= 114,
     JSON.stringify(subs));
gl.log.length = 0;
for (var k = 0; k < g.R3D_STAMP_MAX + 8; k++) g._r3dTerrainStamp(500 + k * 3, 500, 10, 10);
g._r3dTerrainUpload(gl, R3, cv);
subs = gl.log.filter(function (c) { return c[0] === 'sub'; });
S.ok('...a burst of them goes as one rectangle round them all', subs.length === 1 && subs[0][3] >= (g.R3D_STAMP_MAX + 7) * 3, JSON.stringify(subs));
gl.log.length = 0;
R3.terrainDirty = true; g._r3dTerrainStamp(10, 10, 5, 5);
g._r3dTerrainUpload(gl, R3, cv);
S.ok('...and a stamp on a canvas going up whole anyway is not sent twice', gl.log.filter(function (c) { return c[0] === 'sub'; }).length === 0 && gl.log.filter(function (c) { return c[0] === 'tex'; }).length === 1);
R3.terrainDirty = true; R3.terrainRects = null;
for (k = 0; k < 500; k++) g._r3dTerrainStamp(k, k, 4, 4);
S.ok('...nor kept while it waits to: a long battle\'s stamps do not pile up', !R3.terrainRects);
R3.terrainDirty = false;

R3.matOn = true; R3.terrainDirty = false; R3.terrainRects = null;
g._r3dTerrainStamp(40, 40, 10, 10);
S.ok('drawing the materials, which never read the canvas, a stamp keeps nothing and only marks it stale', !R3.terrainRects && R3.terrainDirty === true);
R3.matOn = false;

/* ---- THE EFFECTS' INDEX ---- */
var R4 = {}, gl2 = fakeGL(), got = g._r3dFxIndex(gl2, R4, 300), ib = gl2.log.filter(function (c) { return c[0] === 'buf'; })[0];
var ix = ib && ib[3], good = !!ix;
for (var q = 0; good && q < 300; q++) good = ix[q * 6] === q * 4 && ix[q * 6 + 1] === q * 4 + 1 && ix[q * 6 + 2] === q * 4 + 2 && ix[q * 6 + 3] === q * 4 && ix[q * 6 + 4] === q * 4 + 2 && ix[q * 6 + 5] === q * 4 + 3;
S.ok('the effects draw through a fixed index: quad q is corners 4q 4q+1 4q+2, 4q 4q+2 4q+3', got === 300 && ib[1] === gl2.ELEMENT_ARRAY_BUFFER && good);
gl2.log.length = 0; g._r3dFxIndex(gl2, R4, 200);
S.ok('...built once and reused while it is big enough', !gl2.log.some(function (c) { return c[0] === 'buf'; }));
S.eq('...and never past what a 16-bit index reaches', g._r3dFxIndex(gl2, R4, 99999), g.R3D_FX_IDX_MAX);

/* ---- INSTANCES ---- */
var R5 = {}, gl3 = fakeGL(), B = g._r3dInstBatch(R5), mA = { id: 'A' }, mB = { id: 'B' };
g._r3dInstPush(B, mA, 1, 2, 3, 1, 1, 0, 1, 0, 0, 1, 0); g._r3dInstPush(B, mB, 4, 5, 6, 1, 1, 0, 1, 0, 0, 1, 0); g._r3dInstPush(B, mA, 7, 8, 9, 1, 1, 0, 1, 0, 0, 1, 0);
g._r3dInstPack(gl3, R5, B);
var ups = gl3.log.filter(function (c) { return c[0] === 'buf'; }), F = g.R3D_INST_FLOATS, all = ups[0] && ups[0][3];
var bA = B.order[0], bB = B.order[1];
S.ok('a pass\'s instances go up in one upload, every batch end to end', ups.length === 1 && ups[0][2] === 3 * F);
S.ok('...each batch drawn from its own offset', bA.at === 0 && bB.at === 2 * F * 4 && all[bB.at / 4] === 4 && all[F] === 7, 'A at ' + bA.at + ', B at ' + bB.at);

/* ---- MODEL BUILDS ---- */
var built = [];
g._r3dBuildMesh = function (gl4, faces) { built.push(faces.length); return { verts: faces.length * 3 }; };
var R6 = g.window._R3D = { mesh: {}, gl: {} };
R6.meshBudget = 0;
var base = g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 0);
var asked = g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 2);
S.ok('a live frame with its budget spent draws a roll of the tracks as the base model', asked === base && !R6.mesh['u:tank:player:hull:0:0:r2']);
var soldierBase = g._r3dMesh('u', 'rifle', 'player', null, false, 0, 0), walking = g._r3dMesh('u', 'rifle', 'player', null, false, 3, 0);
S.ok('...a stride as the soldier standing', walking === soldierBase);
var propBase = g._r3dMesh('u', 'yak', 'player', 'prop0', false, 0, 0), turning = g._r3dMesh('u', 'yak', 'player', 'prop2', false, 0, 0);
S.ok('...a turn of the propeller as its first', turning === propBase);
var first = g._r3dMesh('u', 'buggy', 'enemy', null, false, 0, 0);
S.ok('...but a unit seen for the first time is built whatever the budget - it would not be there otherwise', !!first);
R6.meshBudget = 5;
var rolled = g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 2);
S.ok('with budget left the roll is built, and paid for', rolled !== base && !!R6.mesh['u:tank:player:hull:0:0:r2'] && R6.meshBudget < 5);
R6.meshBudget = undefined;
S.ok('a spec\'s frame - no budget at all - builds everything', g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 3) !== base);
/* THE WARM-UP: what each side can field. The player's army here is the Compact, the opponent's the
   Dominion; one unit of the Dominion's stands on the map in the player's colours */
var mineOnly = g.RTS_UNITS.filter(function (u) { return u.side === 'allied' && !g.RTS_AIR_PARTS[u.key]; })[0];
var theirsOnly = g.RTS_UNITS.filter(function (u) { return u.side === 'soviet' && !g.RTS_AIR_PARTS[u.key]; });
var both = g.RTS_UNITS.filter(function (u) { return !u.side && !g.RTS_AIR_PARTS[u.key] && u.key !== 'tank'; })[0];
var taken = theirsOnly[0], notTaken = theirsOnly[1];
S.ok('each army has units of its own, and there are units both field (population)', !!mineOnly && !!taken && !!notTaken && !!both && g.rtsHouseSide('player') === 'allied',
     [mineOnly && mineOnly.key, taken && taken.key, notTaken && notTaken.key, both && both.key].join(' '));
var yw = g._rtsHas('player', 'yard');
g._rtsSpawnUnit('player', taken.key, yw.x + 12, yw.z + 12);
var R7 = g.window._R3D = { mesh: {}, gl: {}, on: true };
g._rtsR = g.window._rtsR = { spr: { turret: { player: { tank: 1 }, enemy: { tank: 1 } } } };
g._r3dWarm(R7, 1e9);
var warmed = Object.keys(R7.mesh);
function has(k2) { return warmed.indexOf(k2) >= 0; }
S.ok('spare time warms the base model of what each side can field, in the parts it is drawn in',
     has('u:tank:player:hull:0:0') && has('u:tank:enemy:turret:0:0') && has('u:' + mineOnly.key + ':player::0:0') && has('u:' + notTaken.key + ':enemy::0:0') &&
     has('u:' + both.key + ':player::0:0') && has('u:' + both.key + ':enemy::0:0') && warmed.every(function (k2) { return !/:r\d|:[1-9]$/.test(k2); }),
     warmed.length + ' models');
S.ok('...not the other army\'s units in a side\'s colours', !has('u:' + mineOnly.key + ':enemy::0:0') && !has('u:' + notTaken.key + ':player::0:0'), '');
S.ok('...but one of theirs that stands on the map in ours, yes', has('u:' + taken.key + ':player::0:0'), taken.key);
var R7all = g.window._R3D = { mesh: {}, gl: {}, on: true, warmAll: true };
g._r3dWarm(R7all, 1e9);
var allN = Object.keys(R7all.mesh).length;
S.ok('...about half of what it built when it warmed every unit for every side', warmed.length < allN * 0.7 && allN > 200, warmed.length + ' against ' + allN);
g.window._R3D = R7;

/* ---- THE PIXELS ---- */
var store = { rtsGfxQ: undefined };
g.window.localStorage = { getItem: function (k2) { return store[k2] === undefined ? null : store[k2]; }, setItem: function (k2, v) { store[k2] = v; }, removeItem: function (k2) { delete store[k2]; } };
var R8 = g.window._R3D = { on: true }, seen = [];
/* frames fed as the live loop feeds them: `ms` a number, or what a frame takes at a resolution */
function run(ms, js, from, dur) {
  for (var t = from; t < from + dur;) {
    var d = typeof ms === 'function' ? ms(g.window._R3D.dyn === undefined ? 1 : g.window._R3D.dyn) : ms;
    g._r3dDynFeed(d, js, t);
    if (seen[seen.length - 1] !== g.window._R3D.dyn) seen.push(g.window._R3D.dyn);
    t += d;
  }
  return from + dur;
}
var STEPS = g.R3D_DYN_STEPS, FLOOR = STEPS[STEPS.length - 1], W = g.R3D_DYN_WINDOW;
var t = run(16, 5, 0, g.R3D_Q_SETTLE + 100);
S.eq('settling, it draws at full resolution', R8.dyn, 1);
t = run(40, 6, t, W * 1.5);
S.ok('slow frames waiting on the GPU take it down a step', R8.dyn === STEPS[1], 'at ' + R8.dyn);
/* ...and fewer pixels gained nothing: the frames are 40 ms at every resolution */
t = run(40, 6, t, W * 10);
S.ok('A DESCENT THAT GAINS NOTHING IS UNDONE: a step at a time to the floor, and back where it began',
     R8.dyn === 1 && JSON.stringify(seen) === JSON.stringify(STEPS.concat([1])), 'through ' + seen.join(', '));
var n0 = seen.length;
t = run(40, 6, t, g.R3D_DYN_HOLD - W * 12);
S.eq('...and it waits before it tries again', seen.length, n0);
t = run(40, 6, t, W * 14);
S.ok('...then tries once more, and is undone once more', seen.length === n0 + STEPS.length && R8.dyn === 1, 'through ' + seen.slice(n0).join(', '));
var n1 = seen.length;
t = run(40, 6, t, g.R3D_DYN_HOLD * 1.5);
S.eq('...and waits twice as long the second time', seen.length, n1);
t = run(40, 36, t, W * 4);
S.eq('slow frames held by their own script are not the pixels\' fault', R8.dyn, 1);

/* A PHONE HELD AT 30 BY ITS POWER SAVING: every frame 33.3 ms whatever is drawn, 5 of it script */
R8 = g.window._R3D = { on: true }; seen = [];
t = run(33.3, 5, 0, g.R3D_Q_SETTLE + 60000);
var changes30 = seen.length - 1;
S.ok('HELD AT 30: after a minute it draws at full resolution, having tried at most twice', R8.dyn === 1 && changes30 <= STEPS.length * 2, changes30 + ' buffer sizes: ' + seen.join(', '));
R8 = g.window._R3D = { on: true, dynLegacy: true }; seen = [];
run(33.3, 5, 0, g.R3D_Q_SETTLE + 60000);
S.eq('...where it went to the floor and stayed (the before-picture)', R8.dyn, FLOOR);

/* A 60 Hz PHONE: a frame is one refresh or two. Heavy, it takes two until the third step. */
function heavy(dyn) { return dyn <= STEPS[2] ? 16.7 : 33.3; }
function easy() { return 16.7; }
R8 = g.window._R3D = { on: true }; seen = [];
t = run(easy, 5, 0, g.R3D_Q_SETTLE + W * 3);
t = run(heavy, 5, t, 8000);
S.ok('60 Hz, A HEAVY SPELL: one step does not reach the next refresh, so it takes the second - and keeps it, since that paid',
     R8.dyn === STEPS[2] && JSON.stringify(seen) === JSON.stringify(STEPS.slice(0, 3)), 'through ' + seen.join(', '));
t = run(easy, 5, t, 30000);
S.ok('...AND WHEN IT IS OVER THE PICTURE COMES BACK: a frame is never under 16.7 ms there, and it climbs all the same', R8.dyn === 1, 'at ' + R8.dyn + ' through ' + seen.join(', '));
R8 = g.window._R3D = { on: true, dynLegacy: true }; seen = [];
t = run(easy, 5, 0, g.R3D_Q_SETTLE + W * 3); t = run(heavy, 5, t, 8000); run(easy, 5, t, 120000);
S.ok('...where it stayed down to the end of the match (the before-picture)', R8.dyn < 1, 'at ' + R8.dyn);
/* and while the spell lasts it does not flap: a step up that is slow again is undone and waited out */
R8 = g.window._R3D = { on: true }; seen = [];
t = run(easy, 5, 0, g.R3D_Q_SETTLE + W * 3);
var ups = [], was8 = 1, t8 = t;
for (; t8 < t + 300000;) { g._r3dDynFeed(heavy(R8.dyn), 5, t8); if (R8.dyn > was8) ups.push(Math.round((t8 - t) / 1000)); was8 = R8.dyn; t8 += heavy(R8.dyn); }
var gaps = ups.slice(1).map(function (u, k) { return u - ups[k]; });
S.ok('a spell five minutes long: it holds the step that paid, and tries the one above a few times',
     R8.dyn === STEPS[2] && ups.length >= 3 && ups.length <= 5, 'tried at ' + ups.join(', ') + ' s');
S.ok('...each try undone at once and waited out twice as long as the last', gaps.length >= 2 && gaps.every(function (gp, k) { return k === 0 || gp > gaps[k - 1] * 1.6; }),
     'gaps of ' + gaps.join(', ') + ' s');
/* 120 Hz: the old constant still means fast */
R8 = g.window._R3D = { on: true }; seen = [];
t = run(function (d) { return d < 1 ? 8.3 : 25; }, 4, 0, g.R3D_Q_SETTLE + W * 4);
S.ok('a step that pays at once is kept', R8.dyn === STEPS[1], 'at ' + R8.dyn);
t = run(8.3, 4, t, W * 6);
S.eq('...the step above is not tried at once: the frames are quick only because of it', R8.dyn, STEPS[1]);
t = run(8.3, 4, t, g.R3D_DYN_HOLD);
S.eq('...and quick frames bring it back', R8.dyn, 1);
store.rtsGfxQ = 'high';
var R9 = g.window._R3D = { on: true };
run(40, 6, 0, g.R3D_Q_SETTLE + g.R3D_DYN_WINDOW * 6);
S.ok('a tier the player chose is drawn as chosen', R9.dyn === undefined || R9.dyn === 1);
store.rtsGfxQ = undefined;
/* the tiers wait for the resolution */
var R10 = g.window._R3D = { on: true, q: null }, lv = [];
g._r3dQualityApply = function (l) { R10.qLevel = l; lv.push(l); };
R10.dyn = 1; R10.dynBound = 'gpu';
for (var tt = 0; tt < g.R3D_Q_SETTLE + g.R3D_Q_WINDOW * 3; tt += 40) g._r3dQualityFeed(40, tt);
S.ok('a tier steps down only once the resolution can go no lower', lv.filter(function (l) { return l > 0; }).length === 0, JSON.stringify(lv));
R10.dyn = g.R3D_DYN_STEPS[g.R3D_DYN_STEPS.length - 1];
for (tt = g.R3D_Q_SETTLE + g.R3D_Q_WINDOW * 3; tt < g.R3D_Q_SETTLE + g.R3D_Q_WINDOW * 6; tt += 40) g._r3dQualityFeed(40, tt);
S.ok('...and then it does', lv.some(function (l) { return l > 0; }), JSON.stringify(lv));
/* ...or once the resolution has been tried and gained nothing: it is back at full, waiting */
var R11 = g.window._R3D = { on: true, q: null, dyn: 1, dynBound: 'gpu', dynA: { hold: 1e9, s: [], j: [], t0: 0 } }, lv2 = [];
g._r3dQualityApply = function (l) { R11.qLevel = l; lv2.push(l); };
S.ok('the resolution waiting out a descent that gained nothing has no step to give', g._r3dDynRoom(5000) === false && (R11.dynA.hold = 0, g._r3dDynRoom(5000)) === true, '');
R11.dynA.hold = 1e9;
for (tt = 0; tt < g.R3D_Q_SETTLE + g.R3D_Q_WINDOW * 3; tt += 40) g._r3dQualityFeed(40, tt);
S.ok('...so the tiers try theirs', lv2.some(function (l) { return l > 0; }), JSON.stringify(lv2));

require('../lib/report.js')(S);
