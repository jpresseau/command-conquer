/* THE SKY - render3d/sky3d.js: the conditions a battle is fought under, and the night's lights.

     DAY          day is the picture it always was: no tint on either side, no haze, no lamps,
                  nothing wet - and every other sky is darker than day on its lit side
     AUTO         the map's seed picks the sky, the same every time, mostly day and every sky
                  in reach
     CHOICE       the player's choice is one of the six, kept, cycled in order, and anything
                  else reads as AUTO
     LIGHTS       at night every building has a door light and every vehicle on the move a
                  headlight - ahead of it, which way it faces - and by day there are none */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('sky');
var g = load(['src/rules', 'src/core', 'src/map', 'src/r3d', 'src/sprites/bake.js', 'src/render3d/sky3d.js']);
var K = g.R3D_SKIES;

var d = K.day;
S.ok('day is the picture it always was: no tint, no haze, no lamps, nothing wet',
     d.L.concat(d.S).every(function (v) { return v === 1; }) && d.haze[3] === 0 && d.night === 0 && d.wet === 0 && d.rain === 0 && d.banks === 0);
/* snow is the bright one - sun on snow - and is held to its own claims below */
var dim = Object.keys(K).filter(function (k) { return k !== 'day' && k !== 'snow'; }).filter(function (k) {
  var L = K[k].L, S2 = K[k].S;
  /* overall: dusk's shade is BLUER than its light, which is the look - warm light, cool shade */
  return L[0] + L[1] + L[2] < 3 * 0.92 && S2[0] + S2[1] + S2[2] < L[0] + L[1] + L[2];
});
S.ok('every other sky is darker than day, and its shade darker than its light', dim.length === 4, dim.join(','));
S.ok('night is the darkest of them', Object.keys(K).every(function (k) { var a = K[k].L, b = K.night.L; return a[0] + a[1] + a[2] >= b[0] + b[1] + b[2]; }));

/* AUTO */
var count = {}, again = true;
for (var s = 1; s <= 3000; s++) {
  var k = g._rtsSkyOfSeed(s * 37);
  count[k] = (count[k] || 0) + 1;
  if (g._rtsSkyOfSeed(s * 37) !== k) again = false;
}
S.ok('AUTO picks every sky from the seed - the passing day too - day the most often', Object.keys(K).concat(['cycle']).every(function (k2) { return count[k2] > 150; }) &&
     Object.keys(K).every(function (k2) { return count.day >= count[k2]; }), JSON.stringify(count));
S.ok('...and the same seed always the same sky', again);

/* CHOICE */
var store = {};
g.window.localStorage = { getItem: function (k2) { return k2 in store ? store[k2] : null; }, setItem: function (k2, v) { store[k2] = String(v); }, removeItem: function (k2) { delete store[k2]; } };
g.window._RTS_SKY_W = null;
S.eq('with nothing chosen it is AUTO', g._rtsSkyWant(), 'auto');
g.rtsSkySync = function () {};                /* the title button: e2e/sky */
var seen = [];
for (var i = 0; i < 8; i++) { g.rtsSkyCycle(); seen.push(g._rtsSkyWant()); }
S.eq('the button cycles DAY, DUSK, NIGHT, RAIN, FOG, SNOW, CYCLE and back to AUTO', seen.join(','), 'day,dusk,night,rain,fog,snow,cycle,auto');
g._rtsSkySetWant('night');
g.window._RTS_SKY_W = null;
S.ok('a choice is kept across a reload, and AUTO is kept as nothing', g._rtsSkyWant() === 'night' && store.rtsSky === 'night' &&
     (g._rtsSkySetWant('auto'), !('rtsSky' in store)), JSON.stringify(store));
store.rtsSky = 'tornado'; g.window._RTS_SKY_W = null;
S.eq('anything else stored reads as AUTO', g._rtsSkyWant(), 'auto');
g._rtsSkySetWant('fog');
S.ok('a chosen sky is the battle\'s sky whatever the seed', g._rtsSkyName({ seed: 1 }) === 'fog' && g._rtsSkyName({ seed: 99 }) === 'fog');
g._rtsSkySetWant('auto');

/* THE PASSING DAY: the sun, and the sky, through the hours */
var L0 = g.R3_LIGHT, noon = g._rtsSunAt(g.RTS_DAY_NOON);
S.ok('at RTS_DAY_NOON the moving sun is exactly the sprite baker\'s', noon.every(function (v, i) { return Math.abs(v - L0[i]) < 1e-9; }), JSON.stringify(noon));
var hours = [], azs = [], els = [], unit = true;
for (var hh = 6; hh <= 18; hh += 0.5) {
  var sv = g._rtsSunAt(hh); hours.push(hh);
  if (Math.abs(Math.hypot(sv[0], sv[1], sv[2]) - 1) > 1e-9) unit = false;
  azs.push(Math.atan2(sv[2], sv[0])); els.push(Math.asin(sv[1]));
}
var unwrap = azs.map(function (a, i) { var b = a; while (i && b - azs[i - 1] > Math.PI) b -= 2 * Math.PI; while (i && azs[i - 1] - b > Math.PI) b += 2 * Math.PI; azs[i] = b; return b; });
var mono = unwrap.every(function (a, i) { return !i || a > unwrap[i - 1]; }), turned = (unwrap[unwrap.length - 1] - unwrap[0]) * 180 / Math.PI;
S.ok('from dawn to dusk it swings round the map, one way, through most of a half turn', unit && mono && turned > 120 && turned < 180, turned.toFixed(0) + ' degrees');
var hiI = els.indexOf(Math.max.apply(null, els));
S.ok('...high in the middle of the day and low at either end - never below the horizon', hours[hiI] > 10 && hours[hiI] < 14.5 && els[0] < els[hiI] * 0.6 &&
     els[els.length - 1] < els[hiI] * 0.6 && Math.min.apply(null, els) > 0.1, 'highest at ' + hours[hiI] + 'h, ' + els.map(function (v) { return (v * 57.3).toFixed(0); }).join(' '));
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
S.ok('the sky at noon is day\'s, at midnight night\'s', same(g._rtsSkyAt(12).L, K.day.L) && same(g._rtsSkyAt(0).L, K.night.L) && same(g._rtsSkyAt(23.5).L, K.night.L));
var jump = 0;
for (var hq = 0; hq < 24; hq += 0.05) { var a3 = g._rtsSkyAt(hq), b3 = g._rtsSkyAt(hq + 0.05); jump = Math.max(jump, Math.abs(a3.L[0] - b3.L[0]), Math.abs(a3.night - b3.night)); }
S.ok('...and it passes between them smoothly - no step at any hour', jump < 0.05, 'largest step in three minutes of the day: ' + jump.toFixed(3));
S.ok('...dusk comes, and the lamps come on with it', g._rtsSkyAt(18.5).night > 0.3 && g._rtsSkyAt(14).night === 0);
S.ok('a battle starts at RTS_DAY_START and a day takes RTS_DAY_LEN', Math.abs(g._rtsSkyHour({ t: 0 }) - g.RTS_DAY_START) < 1e-9 &&
     Math.abs(g._rtsSkyHour({ t: g.RTS_DAY_LEN }) - g.RTS_DAY_START) < 1e-9 && Math.abs(g._rtsSkyHour({ t: g.RTS_DAY_LEN / 4 }) - (g.RTS_DAY_START + 6)) < 1e-9);
S.ok('only the snow sky snows', Object.keys(K).every(function (k3) { return k3 === 'snow' ? K[k3].snow === 1 : !K[k3].snow; }));

/* LIGHTS */
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG;
g._r3dViewBounds = function () { return { x0: -1e4, x1: 1e4, z0: -1e4, z1: 1e4 }; };
g._r3dBoundsNear = function (b) { return b; };
var R3 = g.window._R3D = {};
function lightsUnder(sky) { g.window.RTS_SKY_FORCE = sky; g._r3dSky(G); return g._r3dSkyLights(G, R3); }
var structs = G.ents.filter(function (e) { return e.type === 'struct' && !e.dead && !e.building && !g.rtsStructDef(e.def).wall; }).length;
var tank = g._rtsSpawnUnit('player', 'tank', 0, 0);
tank.rot = 0.6; tank.path = [[1, 1]];
var parked = g._rtsSpawnUnit('player', 'tank', 40, 40);
parked.path = null;
var night = lightsUnder('night'), day = lightsUnder('day');
var heads = night.filter(function (l) { return l[6] === g.R3D_HEAD_C[0] && l[8] === g.R3D_HEAD_C[2]; });
var ahead = heads.length === 1 ? [heads[0][0] - tank.x, heads[0][2] - tank.z] : [0, 0];
S.ok('by day there are no lamps at all', day.length === 0, day.length + ' lights');
S.ok('at night every building has its door light', night.length - heads.length === structs && structs > 0, (night.length - heads.length) + ' door lights for ' + structs + ' buildings');
S.ok('...and the one tank on the move its headlights, the parked one none', heads.length === 1, heads.length + ' headlights');
S.ok('...thrown ahead of it, the way it faces', heads.length === 1 && Math.abs(Math.atan2(ahead[1], ahead[0]) - tank.rot) < 1e-6 && Math.hypot(ahead[0], ahead[1]) > 3,
     JSON.stringify(ahead.map(function (v) { return +v.toFixed(2); })));
var dusk = lightsUnder('dusk');
S.ok('at dusk the same lamps burn, dimmer', dusk.length === night.length && dusk[0][4] < night[0][4], dusk[0][4] + ' against ' + night[0][4]);
g.window.RTS_SKY_FORCE = undefined;

require('../lib/report.js')(S);
