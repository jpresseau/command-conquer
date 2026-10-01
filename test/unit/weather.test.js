/* MORE WEATHER - render3d/sky3d.js's showers, sandstorm and lightning bolt, asked without a GPU;
   e2e/weather checks the picture.

     SHOWERS    the rain sky rains steadily, then comes and goes: dry spells and showers of the
                lengths it says, the same every time; the ground soaks while it rains and dries
                slowly after, so the puddles outlast the shower; no thunder in a dry spell
     SANDSTORM  a sky of its own, chosen like any other; AUTO sends a sandy map into one half
                the time; it howls
     LIGHTNING  a bolt from the cloud to the foot of the strike, jagged, the same for the same
                strike and not for the next; and for its instant it lights the ground */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('weather');
var g = load(['src/rules', 'src/core', 'src/map', 'src/r3d', 'src/sprites/bake.js', 'src/render3d/sky3d.js', 'src/rts.audio.js', 'src/rts.ambience.js']);

/* ---- SHOWERS ---- */
var steady = true;
for (var t = 0; t < g.RTS_SHOWER_FIRST; t += 1) { var a = g._rtsShower(t); if (a.rain !== 1 || a.wet !== 1) steady = false; }
S.ok('the rain sky rains steadily for its first RTS_SHOWER_FIRST seconds', steady);
var runs = [], cur = null, wets = [], jump = 0, prev = null;
for (t = g.RTS_SHOWER_FIRST; t < 3000; t += 0.5) {
  var w = g._rtsShower(t), on = w.rain > 0;
  if (prev) jump = Math.max(jump, Math.abs(w.rain - prev.rain), Math.abs(w.wet - prev.wet));
  if (!cur || cur.on !== on) { cur = { on: on, t0: t, t1: t }; runs.push(cur); } else cur.t1 = t;
  wets.push([t, w.wet, w.rain]); prev = w;
}
var dry = runs.filter(function (r) { return !r.on; }), wet = runs.filter(function (r) { return r.on; });
function len(r) { return r.t1 - r.t0 + 0.5; }
S.ok('then it comes and goes: dry spells and showers', dry.length >= 6 && wet.length >= 6, dry.length + ' dry spells, ' + wet.length + ' showers in 46 minutes');
S.ok('...each as long as it says', dry.every(function (r, i) { return i === runs.length - 1 || (len(r) >= g.RTS_SHOWER_DRY - 0.6 && len(r) <= 2 * g.RTS_SHOWER_DRY + 0.6); }) &&
     wet.slice(0, -1).every(function (r) { return len(r) >= g.RTS_SHOWER_WET - 1 && len(r) <= 2 * g.RTS_SHOWER_WET + 0.6; }),
     'dry ' + dry.map(len).join(' ') + ' / wet ' + wet.map(len).join(' '));
S.ok('...coming on and dying away rather than switching', jump < 0.1, 'the most in half a second: ' + jump.toFixed(3));
S.ok('...the same every time', JSON.stringify(g._rtsShower(1234.5)) === JSON.stringify(g._rtsShower(1234.5)));
var d0 = dry[1], wStart = g._rtsShower(d0.t0).wet, wMid = g._rtsShower(d0.t0 + 20).wet, wEnd = g._rtsShower(d0.t1).wet;
S.ok('the ground dries through a dry spell, slowly - the puddles outlast the shower', wStart > 0.8 && wMid < wStart && wMid > 0.6 && wEnd < wMid,
     wStart.toFixed(2) + ' -> ' + wMid.toFixed(2) + ' after 20 s -> ' + wEnd.toFixed(2) + ' at its end');
var s1 = wet[1], ws0 = g._rtsShower(s1.t0).wet, ws1 = g._rtsShower(s1.t0 + 40).wet;
S.ok('...and soaks again when it rains', ws1 > ws0 && ws1 > 0.8, ws0.toFixed(2) + ' -> ' + ws1.toFixed(2));
g.window.RTS_SKY_FORCE = 'rain';
var G = { t: d0.t0 + 20 }, Sd = g._rtsSkyNow(G);
S.ok('in a dry spell the sky is lighter, nothing falls, and the ground is as wet as it is', Sd.rain === 0 && Math.abs(Sd.wet - wMid) < 1e-12 && Sd.L[0] > g.R3D_SKIES.rain.L[0],
     'rain ' + Sd.rain + ', wet ' + Sd.wet.toFixed(2) + ', light ' + Sd.L[0].toFixed(2));
var flashes = 0;
for (t = d0.t0; t < d0.t1; t += 0.02) { G.t = t; if (g._rtsSkyNow(G).flash) flashes++; }
S.eq('...and no lightning', flashes, 0);
G.t = 30;
S.ok('before the showers begin it is the rain sky itself', g._rtsSkyNow(G) === g.R3D_SKIES.rain || g._rtsSkyNow(G).flash);

/* ---- SANDSTORM ---- */
S.ok('a sandstorm is a sky of its own', g.RTS_SKY_KEYS.indexOf('sand') > 0 && g.R3D_SKIES.sand.sand === 1 && g.R3D_SKIES.sand.haze[3] > g.R3D_SKIES.fog.haze[3],
     'haze ' + g.R3D_SKIES.sand.haze[3]);
var Ls = g.R3D_SKIES.sand.L;
S.ok('...ochre: the light gone warm and dim', Ls[0] > Ls[2] * 1.4 && Ls[0] + Ls[1] + Ls[2] < 2.4);
var sandy = 0, plain = 0;
for (var sd = 1; sd <= 2000; sd++) { if (g._rtsSkyOfSeed(sd * 13, true) === 'sand') sandy++; if (g._rtsSkyOfSeed(sd * 13, false) === 'sand') plain++; }
S.ok('AUTO sends a sandy map into a sandstorm half the time, any other now and then', sandy > 900 && sandy < 1100 && plain < 150, sandy + ' and ' + plain + ' of 2000');
var GS = { terrain: new Uint8Array(400) };
for (var c = 0; c < 400; c++) GS.terrain[c] = c < 100 ? g.RTS_T_SAND : g.RTS_T_GRASS;
S.ok('...a map being sandy when that much of its land is sand', g._rtsSandShare(GS) === 0.25 && g.RTS_SKY_SANDY <= 0.25 && g._rtsSandShare({ terrain: new Uint8Array(10) }) < g.RTS_SKY_SANDY);
g.window.RTS_SKY_FORCE = 'sand';
var wsand = g._rtsAmbWant({ t: 5, ents: [] });
g.window.RTS_SKY_FORCE = 'fog';
var wfog = g._rtsAmbWant({ t: 5, ents: [] });
S.ok('...and it howls louder than the fog blows', wsand.wind > wfog.wind * 1.4, wsand.wind.toFixed(3) + ' against ' + wfog.wind.toFixed(3));

/* ---- LIGHTNING ---- */
var b3 = g._rtsBoltAt(3), b4 = g._rtsBoltAt(4), P = b3.pts, last = P[P.length - 1];
S.ok('a bolt comes down from the cloud to the foot of the strike', P[0][1] > 25 && last[1] === 0 && last[0] === 0 && last[2] === 0 && P.every(function (p, i) { return !i || p[1] < P[i - 1][1]; }));
var wander = Math.max.apply(null, P.map(function (p) { return Math.hypot(p[0], p[2]); }));
S.ok('...jagged on the way', wander > 1.5, 'wanders ' + wander.toFixed(2) + ' off the line');
S.ok('...the same for the same strike, and somewhere else for the next', JSON.stringify(b3) === JSON.stringify(g._rtsBoltAt(3)) && (b3.u !== b4.u || b3.v !== b4.v));
S.ok('...somewhere in the view', [0, 1, 2, 3, 4, 5, 6, 7].every(function (n) { var b = g._rtsBoltAt(n); return b.u > 0.1 && b.u < 0.9 && b.v > 0.1 && b.v < 0.9; }));
/* the light it throws: _r3dSkyLights reads the foot from the effects pass's _r3dBoltFoot */
g._r3dViewBounds = function () { return { x0: -40, x1: 40, z0: -30, z1: 30 }; };
g._r3dBoundsNear = function (v) { return v; };
g._r3dBoltFoot = function () { return [5, 1, 6, 3]; };
var lit = g._r3dSkyLights({ ents: [] }, { sky: { night: 0.35, flash: 0.8 } });
S.ok('for its instant the strike lights the ground round it, brighter than any lamp', lit.length === 1 && lit[0][0] === 5 && lit[0][4] > 2 && lit[0][3] > 20, JSON.stringify(lit[0]));
g._r3dBoltFoot = function () { return null; };
S.eq('...and nothing once it is over', g._r3dSkyLights({ ents: [] }, { sky: { night: 0.35, flash: 0 } }).length, 0);
g.window.RTS_SKY_FORCE = undefined;

require('../lib/report.js')(S);
