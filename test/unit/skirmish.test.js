/* THE SKIRMISH SETUP (rules/skirmish.js, core/base.js, core/terrain.js, skirmish.js), headless:

     THE DEFAULT    no setup, a stale one and the explicit default make the same battle, cell for
                    cell - the fingerprint fixture holds that this battle is the one the game has
                    always made
     SIZE           SMALL and LARGE make a map of that many cells a side, with both bases on it,
                    and the next default battle is back to 128
     WATER          INLAND has less sea than COAST, and LAGOON more
     MONEY          both sides start with the chosen credits, never only the player
     WHO READS IT   a daily and a campaign mission ask for the default whatever is stored; a save
                    carries its setup and its version does not depend on the last battle's size */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('skirmish');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js', 'src/skirmish.js']);

function make(sk, seed) {
  g._rtsNewGame(seed || 7, 'normal', sk === undefined ? undefined : { skirmish: sk });
  return g._rtsG;
}
function hash(G) {
  var h = 2166136261 >>> 0, a = [G.terrain, G.blocked, G.scrap, G.height];
  a.forEach(function (arr) { for (var i = 0; i < arr.length; i++) h = Math.imul(h ^ (arr[i] * 7 | 0), 16777619) >>> 0; });
  G.ents.forEach(function (e) { h = Math.imul(h ^ (e.tx * 131 + e.tz * 7 + e.def.length), 16777619) >>> 0; });
  return h + ':' + G.terrain.length;
}
function water(G) { var n = 0; for (var i = 0; i < G.terrain.length; i++) if (G.terrain[i] === g.RTS_T_WATER) n++; return n; }

/* ---------------- the default ---------------- */
var h0 = hash(make()), h1 = hash(make(null)), h2 = hash(make({ size: 'huge', water: 7 })), h3 = hash(make({ size: 'standard', water: 'coast', money: 'standard' }));
S.ok('no setup, a stale one and the explicit default make the same battle', h0 === h1 && h1 === h2 && h2 === h3, [h0, h1, h2, h3].join(' '));
S.eq('...on the 128-cell map', g.RTS_N, 128);

/* ---------------- size ---------------- */
[['small', 96], ['large', 160]].forEach(function (c) {
  var G = make({ size: c[0] }), y = g._rtsHas('player', 'yard'), ey = g._rtsHas('enemy', 'yard');
  S.ok(c[0] + ' makes a ' + c[1] + '-cell map with both bases on it', g.RTS_N === c[1] && G.terrain.length === c[1] * c[1] && !!y && !!ey &&
       g._rtsInB(y.tx, y.tz) && g._rtsInB(ey.tx, ey.tz), JSON.stringify({ N: g.RTS_N, len: G.terrain.length, y: y && [y.tx, y.tz], e: ey && [ey.tx, ey.tz] }));
});
make();
S.eq('...and the next default battle is back to 128', g.RTS_N, 128);

/* ---------------- water ---------------- */
var wi = water(make({ water: 'inland' })), wc = water(make({ water: 'coast' })), wl = water(make({ water: 'lagoon' }));
S.ok('INLAND has less sea than COAST, and LAGOON more', wi < wc && wc < wl, 'inland ' + wi + ', coast ' + wc + ', lagoon ' + wl);

/* ---------------- money ---------------- */
var Gm = make({ money: 'flush' });
S.ok('both sides start with the chosen credits', Gm.sides.player.credits === 10000 && Gm.sides.enemy.credits === 10000,
     Gm.sides.player.credits + ' / ' + Gm.sides.enemy.credits);

/* ---------------- who reads it ---------------- */
g.localStorage.setItem('bw.skirmish', JSON.stringify({ size: 'large', water: 'lagoon', money: 'flush' }));
var plain = g.rtsSkirmishWant();
g.window._RTS_DAILY = { seed: 1 }; var daily = g.rtsSkirmishWant(); g.window._RTS_DAILY = null;
g.window._RTS_MISSION = { id: 'lowwater' }; var miss = g.rtsSkirmishWant(); g.window._RTS_MISSION = null;
S.ok('a plain battle reads the stored setup; a daily and a mission ask for the default', plain && plain.size === 'large' && daily === null && miss === null,
     JSON.stringify({ plain: plain, daily: daily, miss: miss }));
var v128 = g._rtsSaveVersion(); make({ size: 'small' }); var v96 = g._rtsSaveVersion();
var body = g._rtsSaveState(g._rtsG);
S.ok('a save carries its setup, and its version does not move with the last battle\'s size', v128 === v96 && body.skirmish && body.skirmish.size === 'small',
     JSON.stringify({ v128: v128, v96: v96, sk: body.skirmish }));

require('../lib/report.js')(S);
