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
var g = load(['src/rules', 'src/core', 'src/map', 'src/r3d', 'src/sprites', 'src/render3d']);
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
var R7 = g.window._R3D = { mesh: {}, gl: {}, on: true };
g._rtsR = g.window._rtsR = { spr: { turret: { player: { tank: 1 }, enemy: { tank: 1 } } } };
g._r3dWarm(R7, 1e9);
var warmed = Object.keys(R7.mesh);
S.ok('spare time warms the base model of every unit type, every side in the match, in the parts it is drawn in',
     warmed.indexOf('u:tank:player:hull:0:0') >= 0 && warmed.indexOf('u:tank:enemy:turret:0:0') >= 0 && warmed.indexOf('u:heli:enemy:rotor:0:0') >= 0 &&
     warmed.indexOf('u:yak:player:prop0:0:0') >= 0 && warmed.indexOf('u:rifle:enemy::0:0') >= 0 && warmed.every(function (k2) { return !/:r\d|:[1-9]$/.test(k2); }),
     warmed.length + ' models');

/* ---- THE PIXELS ---- */
var store = { rtsGfxQ: undefined };
g.window.localStorage = { getItem: function (k2) { return store[k2] === undefined ? null : store[k2]; }, setItem: function (k2, v) { store[k2] = v; }, removeItem: function (k2) { delete store[k2]; } };
var R8 = g.window._R3D = { on: true }, seen = [];
function run(ms, js, from, dur) { for (var t = from; t < from + dur; t += ms) { g._r3dDynFeed(ms, js, t); if (seen[seen.length - 1] !== R8.dyn) seen.push(R8.dyn); } return from + dur; }
var t = run(16, 5, 0, g.R3D_Q_SETTLE + 100);
S.eq('settling, it draws at full resolution', R8.dyn, 1);
t = run(40, 6, t, g.R3D_DYN_WINDOW * 1.5);
S.ok('slow frames waiting on the GPU take it down a step', R8.dyn === g.R3D_DYN_STEPS[1], 'at ' + R8.dyn);
t = run(40, 6, t, g.R3D_DYN_WINDOW * 10);
S.ok('...a step at a time, to the floor and no further', R8.dyn === g.R3D_DYN_STEPS[g.R3D_DYN_STEPS.length - 1] && JSON.stringify(seen) === JSON.stringify(g.R3D_DYN_STEPS),
     'through ' + seen.join(', '));
t = run(10, 4, t, g.R3D_DYN_WINDOW * 10);
S.eq('quick frames bring it back', R8.dyn, 1);
t = run(40, 36, t, g.R3D_DYN_WINDOW * 4);
S.eq('slow frames held by their own script are not the pixels\' fault', R8.dyn, 1);
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

require('../lib/report.js')(S);
