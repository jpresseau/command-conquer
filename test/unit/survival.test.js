/* SURVIVAL (core/survival.js), headless, in real battles:

     THE SETUP    the opponent owns nothing and thinks nothing, and the battle is not over on its
                  first tick though no foe has a building
     THE WAVES    nothing comes before RTS_SURV.first; then a wave at the opponent's corner, every
                  one of it attack-moving; each wave dearer than the last, and no early wave holds
                  anything dearer than its tier allows
     THE HUNT     a minute on, the first wave has closed on the player's base
     THE END      left alone, the base falls inside the fourth wave: lost, the waves and seconds
                  kept; with guns round it the same base is still standing at ten minutes, seven waves in
     DIFFICULTY   an easy wave is smaller than a hard one
     A SAVE       a survival saved mid-run and resumed in a fresh world goes on: the count kept, the
                  next wave on time
     THE BOUNTY   every unit of a wave carries its number; while one of it stands nothing is paid,
                  and when the last falls the player is paid that wave's bounty within
                  RTS_SURV.look seconds, once; a later wave pays more, a harder battle more; and a
                  save carries both the wave still owed and the tags, so the resumed run pays it */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('survival');
function world(diff, seed) {
  var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
  g._rtsNewGame(seed || 7, diff || 'normal'); g.window._rtsUI = {};
  g._rtsSurvivalSetup(g._rtsG);
  return g;
}
function run(g, secs) { for (var i = 0; i < 60 * secs && !g._rtsG.over; i++) g._rtsTick(1 / 60); }
function foes(g) { return g._rtsG.ents.filter(function (e) { return !e.dead && e.side === 'enemy'; }); }
function cost(g, keys) { return keys.reduce(function (a, k) { return a + g.rtsUnitDef(k).cost; }, 0); }

/* ---------------- the setup ---------------- */
var g = world(), G = g._rtsG, T = g.RTS_TILE;
g._rtsTick(1 / 60);
S.ok('THE SETUP: the opponent owns nothing and thinks nothing, and the battle is not over', foes(g).length === 0 && G.sides.enemy.ctl === 'none' && !G.over && G.survival.wave === 0,
     JSON.stringify({ foes: foes(g).length, ctl: G.sides.enemy.ctl, over: G.over }));

/* ---------------- the waves ---------------- */
run(g, g.RTS_SURV.first - 2);
var before = foes(g).length;
/* to the very tick the wave lands, so its orders are the ones it came with, not the idle hunt's */
for (var t = 0; t < 600 && G.survival.wave === 0; t++) g._rtsTick(1 / 60);
var w1 = foes(g), st = G.starts.enemy;
S.ok('THE WAVES: nothing before the first, then a wave at the opponent\'s corner, all of it attack-moving', before === 0 && G.survival.wave === 1 && w1.length >= 3 &&
     w1.every(function (e) { return Math.hypot(e.x - g._rtsWX(st.tx), e.z - g._rtsWX(st.tz)) < 12 * T && e.order === 'amove'; }),
     JSON.stringify({ before: before, wave: G.survival.wave, n: w1.length, orders: w1.map(function (e) { return e.order; }).join() }));
var cs = [1, 2, 3, 5, 8].map(function (n) { return cost(g, g._rtsSurvivalWave(G, n)); });
/* twenty draws of each of the first three waves: nothing dearer than that wave's tier, ever */
var over = [];
for (var n = 1; n <= 3; n++) for (var k = 0; k < 20; k++) g._rtsSurvivalWave(G, n).forEach(function (key) { if (g.rtsUnitDef(key).cost > g.RTS_SURV.tier0 + g.RTS_SURV.tier * n) over.push(n + ':' + key); });
S.ok('...each wave dearer than the last, and no early wave holds anything dearer than its tier', cs.every(function (c, i) { return !i || c > cs[i - 1]; }) && over.length === 0,
     JSON.stringify({ costs: cs, over: over.slice(0, 6) }));

/* ---------------- the hunt ---------------- */
var y = g._rtsHas('player', 'yard');
function mean(list) { return list.reduce(function (a, e) { return a + Math.hypot(e.x - y.x, e.z - y.z); }, 0) / Math.max(1, list.length) / T; }
var d0 = mean(w1);
run(g, 45);
var left = w1.filter(function (e) { return !e.dead; }), d1 = left.length ? mean(left) : 0;
S.ok('THE HUNT: forty-five seconds on, the first wave has closed on the player\'s base', d1 < d0 * 0.6, JSON.stringify({ start: +d0.toFixed(1), now: +d1.toFixed(1), left: left.length }));

/* ---------------- the end ---------------- */
run(g, 600);
S.ok('THE END: left alone, the base falls inside the fourth wave - lost, the waves and seconds kept', G.over === 'lose' && G.sides.player.lost && G.survival.wave <= 4 && G.survival.secs === Math.round(G.t) && G.survival.secs > g.RTS_SURV.first,
     JSON.stringify({ over: G.over, wave: G.survival.wave, secs: G.survival.secs }));
var h = world(), H = h._rtsG, hy = h._rtsHas('player', 'yard'), tx = h._rtsTX(hy.x), tz = h._rtsTX(hy.z), e = H.starts.enemy, dx = Math.sign(e.tx - tx), dz = Math.sign(e.tz - tz);
h._rtsMBuild('player', 'power', tx, tz + 5); h._rtsMBuild('player', 'power', tx + 3, tz + 6); h._rtsMBuild('player', 'barracks', tx + 5, tz);
[[3, 0], [0, 3], [3, 3], [-3, 3], [3, -3]].forEach(function (o) { h._rtsMBuild('player', 'turret', tx + dx * 6 + o[0], tz + dz * 6 + o[1]); h._rtsMBuild('player', 'pillbox', tx + dx * 7 + o[1], tz + dz * 7 + o[0]); });
h._rtsRecalcPower('player');
run(h, 600);
S.ok('...and with guns round it, the same base is still standing at ten minutes, with its seventh wave come', !H.over && H.survival.wave >= 7, JSON.stringify({ over: H.over, wave: H.survival.wave }));

/* ---------------- difficulty ---------------- */
var ge = world('easy'), gh = world('hard');
var ce = [1, 4, 8].map(function (n) { return cost(ge, ge._rtsSurvivalWave(ge._rtsG, n)); }), ch = [1, 4, 8].map(function (n) { return cost(gh, gh._rtsSurvivalWave(gh._rtsG, n)); });
S.ok('DIFFICULTY: an easy wave is smaller than a hard one, at every wave looked at', ce.every(function (c, i) { return c < ch[i]; }), JSON.stringify({ easy: ce, hard: ch }));

/* ---------------- a save ---------------- */
var s = world(), SG = s._rtsG;
run(s, s.RTS_SURV.first + 30);
var body = JSON.parse(JSON.stringify(s._rtsSaveState(SG))), next = SG.survival.next;
var r = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
r._rtsNewGame(body.seed, body.diff); r.window._rtsUI = {}; r._rtsApplyState(r._rtsG, body);
var RG = r._rtsG;
S.ok('A SAVE: resumed in a fresh world it is still a survival, the count kept', !!RG.survival && RG.survival.wave === 1 && Math.abs(RG.survival.next - next) < 0.05 && RG.sides.enemy.ctl === 'none',
     JSON.stringify(RG.survival));
run(r, next + 1);
S.ok('...and the next wave comes on time', RG.survival.wave === 2, JSON.stringify(RG.survival));

/* ---------------- the bounty ---------------- */
function waveUnits(g, n) { return g._rtsG.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'unit' && e.tag === 'w' + n; }); }
function credits(g) { return g._rtsG.sides.player.credits; }
var b = world(), BG = b._rtsG, BV = BG.survival;
for (var bt = 0; bt < 60 * (b.RTS_SURV.first + 1) && BV.wave === 0; bt++) b._rtsTick(1 / 60);
var mine = waveUnits(b, 1), all = foes(b);
S.ok('THE BOUNTY: every unit of the first wave carries its number, and the wave is owed', mine.length >= 3 && mine.length === all.length && BV.open.join() === '1' && BV.paid === 0,
     JSON.stringify({ tagged: mine.length, foes: all.length, open: BV.open }));
/* all but one of it gone: nothing is paid while that one stands */
mine.slice(1).forEach(function (e) { e.hp = 0; b._rtsKill(e); });
var c0 = credits(b);
run(b, b.RTS_SURV.look * 2);
S.ok('...while one of it stands, nothing is paid', BV.open.join() === '1' && BV.paid === 0 && credits(b) <= c0, JSON.stringify({ open: BV.open, paid: BV.paid, credits: [c0, credits(b)] }));
var c1 = credits(b), owe = b._rtsSurvivalBounty(BG, 1);
if (mine[0]) { mine[0].hp = 0; b._rtsKill(mine[0]); }
run(b, b.RTS_SURV.look + 0.1);
var c2 = credits(b);
run(b, b.RTS_SURV.look * 3);
S.ok('...the last of it down, the player is paid that wave\'s bounty within ' + b.RTS_SURV.look + ' s, and once', owe >= 100 && c2 - c1 === owe && credits(b) === c2 && BV.paid === owe && BV.open.length === 0 &&
     /Wave 1 wiped out - \+\d+ credits/.test(BG.msg || ''), JSON.stringify({ owe: owe, got: c2 - c1, after: credits(b) - c2, paid: BV.paid, msg: BG.msg }));
var bw = [1, 3, 6].map(function (n) { return b._rtsSurvivalBounty(BG, n); }), be = world('easy'), bh = world('hard');
S.ok('...a later wave pays more, and a harder battle more for the same wave', bw[0] < bw[1] && bw[1] < bw[2] && be._rtsSurvivalBounty(be._rtsG, 3) < bh._rtsSurvivalBounty(bh._rtsG, 3) &&
     bw.every(function (v) { return v % 50 === 0; }), JSON.stringify({ normal: bw, easy3: be._rtsSurvivalBounty(be._rtsG, 3), hard3: bh._rtsSurvivalBounty(bh._rtsG, 3) }));
/* saved with a wave owed, resumed, the rest of it killed: the resumed run pays */
var q = world(), QG = q._rtsG;
for (var qt = 0; qt < 60 * (q.RTS_SURV.first + 1) && QG.survival.wave === 0; qt++) q._rtsTick(1 / 60);
var qbody = JSON.parse(JSON.stringify(q._rtsSaveState(QG)));
var q2 = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
q2._rtsNewGame(qbody.seed, qbody.diff); q2.window._rtsUI = {}; q2._rtsApplyState(q2._rtsG, qbody);
var Q2 = q2._rtsG, qleft = waveUnits(q2, 1), qc = credits(q2);
qleft.forEach(function (e) { e.hp = 0; q2._rtsKill(e); });
run(q2, q2.RTS_SURV.look + 0.1);
S.ok('...and a save carries the wave owed and its tags: resumed, the rest of it killed, the run pays', qleft.length >= 3 && Q2.survival.open.length === 0 && credits(q2) - qc === q2._rtsSurvivalBounty(Q2, 1),
     JSON.stringify({ tagged: qleft.length, open: Q2.survival.open, got: credits(q2) - qc }));

require('../lib/report.js')(S);
