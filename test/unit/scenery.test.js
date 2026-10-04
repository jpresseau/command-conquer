/* THE COUNTRYSIDE'S PLAN - render3d/scenery3d.js.

   Where the fields, farmsteads, poles, wrecks and boulders go is worked out from the map's cells
   alone, so it is checked here, on real generated maps, without a page:

     POPULATION   across a few seeds every kind of piece is placed - a plan that places nothing
                  passes every check below
     COSMETIC     planning writes nothing the game reads: terrain, blocking, ore and height are
                  byte-identical afterwards, and the game's random stream has not moved
     REPEATABLE   the same map is furnished the same way; another seed differently
     WHERE        each piece on ground it belongs on - a field on open level grass, a farmstead
                  on four forest cells, a pole on a road's verge, a wreck or a rock on open ground
                  off the road - and every one of them clear of both starts
     CLAIMS       the cells the world batch leaves alone are the kind it would have drawn there
     FREE         a piece's ground stops being its own under a building or ore */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('scenery');
var g = load(['src/rules', 'src/core', 'src/sprites/bake.js', 'src/render3d/scenery3d.js']);
var N = g.RTS_N;

function game(seed) { g._rtsNewGame(seed, 'easy'); return g.window._rtsG; }
function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s = (Math.imul(s, 31) + a[i]) | 0; return s; }
function starts(G) { return [G.starts.player, G.starts.enemy]; }
function dist(G, tx, tz) { return Math.min.apply(null, starts(G).map(function (s) { return Math.hypot(tx - s.tx, tz - s.tz); })); }

var SEEDS = [4242, 77, 1913, 31337, 600];
var tot = { fields: 0, farms: 0, poles: 0, wires: 0, wrecks: 0, rocks: 0 }, bad = [], worstClear = 1e9;
SEEDS.forEach(function (seed) {
  var G = game(seed), T = G.terrain, B = G.blocked, O = G.scrap;
  var before = [sum(T), sum(B), sum(O), G.height ? sum(G.height) : 0];
  var P = g._r3dSceneryPlan(G);
  var after = [sum(T), sum(B), sum(O), G.height ? sum(G.height) : 0];
  if (before.join() !== after.join()) bad.push(seed + ': the plan changed the game\'s cells');
  Object.keys(tot).forEach(function (k) { tot[k] += P[k].length; });
  function I(x, z) { return z * N + x; }
  function open(k) { return !B[k] && !(O && O[k] > 0) && (T[k] === g.RTS_T_GRASS || T[k] === g.RTS_T_SAND); }
  function clear(what, tx, tz, d) {
    var c = dist(G, tx, tz);
    worstClear = Math.min(worstClear, c - d);
    if (c < d) bad.push(seed + ': a ' + what + ' at ' + tx + ',' + tz + ' is ' + c.toFixed(1) + ' cells from a start');
  }
  P.fields.forEach(function (f) {
    for (var z = f.tz; z < f.tz + f.d; z++) for (var x = f.tx; x < f.tx + f.w; x++) {
      var k = I(x, z);
      if (T[k] !== g.RTS_T_GRASS || B[k] || (O && O[k] > 0)) bad.push(seed + ': field cell ' + x + ',' + z + ' is not open grass');
    }
    clear('field', f.tx + f.w / 2, f.tz + f.d / 2, g.R3D_SCN_CLEAR);
  });
  P.farms.forEach(function (fm) {
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (o) {
      var k = I(fm.tx + o[0], fm.tz + o[1]);
      if (T[k] !== g.RTS_T_TREE) bad.push(seed + ': farmstead cell ' + (fm.tx + o[0]) + ',' + (fm.tz + o[1]) + ' is not forest');
      if (P.claim[k] !== 1) bad.push(seed + ': farmstead cell unclaimed');
    });
    clear('farmstead', fm.tx, fm.tz, g.R3D_SCN_CLEAR);
  });
  P.poles.forEach(function (p) {
    var k = I(p.tx, p.tz), road = [I(p.tx + 1, p.tz), I(p.tx - 1, p.tz), I(p.tx, p.tz + 1), I(p.tx, p.tz - 1)].some(function (j) { return T[j] === g.RTS_T_ROAD; });
    if (T[k] !== g.RTS_T_GRASS || B[k] || !road) bad.push(seed + ': pole at ' + p.tx + ',' + p.tz + ' is not on a road\'s verge');
    clear('pole', p.tx, p.tz, 8);
  });
  P.wires.forEach(function (w) {
    var a = P.poles[w[0]], b = P.poles[w[1]];
    if (!a || !b || w[0] === w[1] || Math.hypot(a.tx - b.tx, a.tz - b.tz) >= 9) bad.push(seed + ': a wire spans ' + JSON.stringify(w));
  });
  P.wrecks.forEach(function (w) {
    if (!open(I(w.tx, w.tz))) bad.push(seed + ': wreck at ' + w.tx + ',' + w.tz + ' is not on open ground');
    clear('wreck', w.tx, w.tz, 14);
  });
  P.rocks.forEach(function (r) {
    if (!open(I(r.tx, r.tz))) bad.push(seed + ': boulders at ' + r.tx + ',' + r.tz + ' are not on open ground');
    clear('boulder', r.tx, r.tz, 10);
  });
  Object.keys(P.claim).forEach(function (k) {
    var c = P.claim[k], t = T[k];
    if ((c === 2 && t !== g.RTS_T_GRASS) || ((c === 1 || c === 3) && t !== g.RTS_T_TREE)) bad.push(seed + ': claim ' + c + ' on terrain ' + t);
  });
  if (P.fields.length > g.R3D_SCN_FIELDS || P.farms.length > g.R3D_SCN_FARMS || P.wrecks.length > g.R3D_SCN_WRECKS ||
      P.poles.length > g.R3D_SCN_POLES || P.rocks.length > g.R3D_SCN_ROCKS) bad.push(seed + ': over a limit');
});

S.ok('every kind of piece is placed across ' + SEEDS.length + ' maps', Object.keys(tot).every(function (k) { return tot[k] > 0; }), JSON.stringify(tot));
S.ok('...and every one of them where it belongs, clear of the starts, without touching the game\'s cells', bad.length === 0,
     bad.length ? bad.slice(0, 6).join('; ') : 'clean - the nearest to a start is ' + worstClear.toFixed(1) + ' cells past its margin');

/* the game's random stream: a plan between two draws leaves the second where it would have been */
var Ga = game(4242), ra = g._rtsRnd ? [g._rtsRnd(Ga), g._rtsRnd(Ga)] : null;
var Gb = game(4242), rb = g._rtsRnd ? [g._rtsRnd(Gb)] : null;
g._r3dSceneryPlan(Gb);
if (rb) rb.push(g._rtsRnd(Gb));
S.ok('planning draws nothing from the game\'s random stream', !!ra && ra.join() === rb.join(), JSON.stringify([ra, rb]));

var p1 = JSON.stringify(g._r3dSceneryPlan(game(4242))), p2 = JSON.stringify(g._r3dSceneryPlan(game(4242))), p3 = JSON.stringify(g._r3dSceneryPlan(game(77)));
S.ok('the same map is furnished the same way', p1 === p2, p1.length + ' chars');
S.ok('...and another seed differently', p1 !== p3);

/* the plan reads G.starts as the game writes it, { player, enemy } - read as a list it saw no
   starts at all and put fields on the bases' own ground */
var Gs = game(4242), Ps = g._r3dSceneryPlan(Gs);
S.ok('G.starts is the { player, enemy } the plan is written for', !Array.isArray(Gs.starts) && Gs.starts.player && Gs.starts.enemy && Ps.fields.length > 0,
     JSON.stringify(Gs.starts));

/* nothing open on these maps is blocked this far from the bases, so a field over blocked grass
   has to be made: block the first field's ground and plan again */
var Gk = game(4242), Pk = g._r3dSceneryPlan(Gk), fk = Pk.fields[0], hit = 0;
for (var bz = fk.tz; bz < fk.tz + fk.d; bz++) for (var bx = fk.tx; bx < fk.tx + fk.w; bx++) Gk.blocked[bz * N + bx] = 2;
g._r3dSceneryPlan(Gk).fields.forEach(function (f) {
  for (var z = f.tz; z < f.tz + f.d; z++) for (var x = f.tx; x < f.tx + f.w; x++) if (Gk.blocked[z * N + x]) hit++;
});
S.ok('a field is never laid over blocked ground', hit === 0, hit + ' field cells on blocked ground, the first field\'s ' + (fk.w * fk.d) + ' cells blocked');

/* FREE */
var Gf = game(4242), Pf = g._r3dSceneryPlan(Gf), w0 = Pf.wrecks[0], k0 = w0.tz * N + w0.tx;
var free0 = g._r3dSceneryFree(Gf, k0);
Gf.blocked[k0] = 1; var underB = g._r3dSceneryFree(Gf, k0); Gf.blocked[k0] = 0;
var s0 = Gf.scrap[k0]; Gf.scrap[k0] = 40; var underO = g._r3dSceneryFree(Gf, k0); Gf.scrap[k0] = s0;
S.ok('a wreck\'s ground is its own until a building or ore covers it', free0 === true && underB === false && underO === false,
     [free0, underB, underO].join(', '));
var cells = g._r3dSceneryCells(Pf), want = Pf.poles.length + Pf.wrecks.length + Pf.rocks.length;
Pf.fields.forEach(function (f) { want += f.w * f.d; });
S.ok('the watch covers every cell a field, pole, wreck or rock stands on', cells.length === want && cells.indexOf(k0) >= 0, cells.length + ' of ' + want);

require('../lib/report.js')(S);
