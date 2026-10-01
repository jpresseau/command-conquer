/* THE FOG OF WAR, AS FOG - render3d/shroud3d.js, asked without a GPU; e2e/shroud3d checks the
   picture.

     OUT OF SIGHT  a unit the player cannot see is not handed to the renderer at all; one that
                   can be seen is; the player's own always are
     FADING        met for the first time a unit is simply what it is; coming into sight it
                   dissolves in over R3D_FADE_T, and out again as it leaves - once a frame
                   however many passes ask; R3.fadeOff pops it
     THE DIM       the fade rides as tens over the tint, keeping a hurt unit's scorch
     THE SHADERS   the mesh program drops a fading unit's pixels, and the ground texture program
                   draws the shroud through its drift */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('shroud');
/* the whole renderer, in page order: a unit's draw reaches into most of it */
var g = load(['src/rules', 'src/core', 'src/map', 'src/r3d', 'src/sprites', 'src/render3d']);
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG;

/* ---- FADING ---- */
var R3 = {}, seen = true;
g._rtsEntSeen = function (e) { return e.side === 'player' || seen; };
var en = { id: 1, side: 'enemy' }, mo = {};
seen = false;
S.eq('met for the first time out of sight, a unit is simply not there', g._r3dSeenFade(R3, en, mo, 10), 0);
seen = true;
var half = g._r3dSeenFade(R3, en, mo, 10 + g.R3D_FADE_T / 2);
g._r3dSeenFade(R3, en, mo, 10 + g.R3D_FADE_T / 2);                  /* the sun's pass, the same frame */
var whole = g._r3dSeenFade(R3, en, mo, 10 + g.R3D_FADE_T + 0.01);
S.ok('coming into sight it dissolves in over R3D_FADE_T - once a frame', Math.abs(half - 0.5) < 1e-9 && whole === 1, half + ' half way, ' + whole + ' after');
seen = false;
var going = g._r3dSeenFade(R3, en, mo, 10 + g.R3D_FADE_T * 1.5 + 0.01), gone = g._r3dSeenFade(R3, en, mo, 10 + g.R3D_FADE_T * 2.2);
S.ok('...and out again as it leaves', going > 0.4 && going < 0.6 && gone === 0, going.toFixed(2) + ' then ' + gone);
var mo2 = {};
seen = true; g._r3dSeenFade(R3, en, mo2, 1);
S.eq('a unit met in sight is whole at once - nothing fades in at the start of a match', mo2.seen, 1);
seen = false;
S.eq('...and after a long gap it is what it is, not part way', g._r3dSeenFade(R3, en, mo2, 5), 0);
var R4 = { fadeOff: true }, mo3 = { seen: 0, ft: 1 };
seen = true;
S.eq('R3.fadeOff pops it', g._r3dSeenFade(R4, en, mo3, 1.05), 1);
S.eq('the player\'s own are always seen', g._r3dSeenFade(R3, { id: 2, side: 'player' }, {}, 3), 1);

/* ---- THE DIM ---- */
S.eq('whole, the dim is untouched', g._r3dFadeDim(3.6, 1), 3.6);
var d5 = g._r3dFadeDim(3.6, 0.5), d0 = g._r3dFadeDim(0, 0.01), d9 = g._r3dFadeDim(0, 0.98);
S.ok('fading, it rides as tens over the tint - a hurt unit keeps its scorch', Math.abs(d5 - 3.6 - 10 * Math.round(4.5)) < 1e-9 && d0 === 90 && d9 === 10, d5 + ', ' + d0 + ', ' + d9);

/* ---- THE SHADERS ---- */
S.ok('the mesh program drops a fading unit\'s pixels, then reads the tint beneath', /float fd = floor\(w \* 0\.1[^;]*;\s*if \(fd > 0\.0\) \{[^}]*discard;\s*w -= fd \* 10\.0;/.test(g.R3D_WEATHER_GLSL.replace(/'\s*\+\s*'/g, '')));
S.ok('the shroud wanders R3D_SHROUD_WARP cells', g.R3D_SHROUD_GLSL.indexOf('2.0 * ' + g.R3D_SHROUD_WARP.toFixed(2) + ' * uFog.z') > 0);

/* ---- THE DRAW ---- */
var calls = [], R5 = { motion: {} };
g._rtsR = g.window._rtsR = { spr: { turret: { enemy: { tank: 1 }, player: { tank: 1 } } } };
g._r3dMesh = function (kind, def, side, part) { return { part: part || null }; };
function paint(e, t) { calls = []; G.t = t; g._r3dPaintUnit(null, e, G, R5, function (C, m, x, y, z, rot, sc, dim) { calls.push({ part: m.part, dim: dim }); }, 1); return calls; }
var et = g._rtsSpawnUnit('enemy', 'tank', 60, 60);
seen = false;
S.eq('a unit out of sight is not drawn at all - nor its shadow, which is the same walk', paint(et, 20).length, 0);
seen = true;
var mid = paint(et, 20 + g.R3D_FADE_T / 2);
S.ok('coming into sight it is drawn fading, hull and turret alike', mid.length === 2 && mid.every(function (c) { return c.dim >= 10 && c.dim < 100; }), JSON.stringify(mid));
var full = paint(et, 21);
S.ok('...and then whole', full.length === 2 && full.every(function (c) { return !c.dim; }), JSON.stringify(full));
var mine = g._rtsSpawnUnit('player', 'tank', 64, 64);
seen = false;
S.eq('the player\'s own are drawn whatever', paint(mine, 22).length, 2);

require('../lib/report.js')(S);
