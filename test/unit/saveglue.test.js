/* THE PAGE ROUND A SAVE (rts.save.js, ui/shell.js, title.js, rts.ambience.js), headless. The
   simulation resumes bit for bit (unit/selfplay, unit/campaign-save); what was wrong was the glue:

     IN A BATTLE   a mission's or a daily's save loaded with the button INSIDE a battle reaches
                   rtsOpen with the same army, mission, daily and difficulty as the same save
                   loaded from the title - closing the battle went home, and going home undid them
     A PLAIN SAVE  loaded from inside a daily is not that daily, and opens with its own army
     SURVIVAL      a survival's save tells the page it is one, so Play again starts the next run
     THE DEAD      two tanks that kill each other, a shell still in flight: the save is written,
                   and the shell's dead shooter loads dead, with its side
     DECIDED       a battle that is over is not saved; one still being fought is (the control)
     STALE         a save from an earlier build in ANY slot is found, not only the first
     THE BED       leaving a battle turns every ambience loop and the echo down */

var fs = require('fs'), path = require('path'), vm = require('vm');
var { Suite } = require('../lib/assert.js');
var { load, loadFast, ROOT } = require('../lib/sandbox.js');

var S = new Suite('saveglue');

/* ---- the page, with the real rtsLoadGame, rtsClose, rtsHome and the modes' own ends: only the
        DOM and rtsOpen are stood in for. rtsOpen records what it was opened with. ---- */
function el() { return { classList: { add: function () {}, remove: function () {}, toggle: function () {} }, style: {}, hidden: false,
  parentNode: { removeChild: function () {} }, querySelector: function () { return null; }, appendChild: function () {}, setAttribute: function () {} }; }
function page(inBattle) {
  var open = [];
  var doc = { getElementById: function (id) { return id === 'rcgRts' ? (doc._battle ? el() : null) : el(); }, removeEventListener: function () {},
    addEventListener: function () {}, querySelector: function () { return null; }, _battle: !!inBattle };
  var g = load(['src/rules', 'src/rts.save.js', 'src/daily.js', 'src/campaign.js', 'src/survival.js', 'src/ui/shell.js'], {
    document: doc, cancelAnimationFrame: function () {}, _rtsKeyDown: function () {}, _rtsKeyUp: function () {}, _rtsRDispose: function () {},
    rtsBuildDiff: function () {}, rtsShowResume: function () {}, _rtsSay: function () {}, _rtsSfx: function () {},
    removeEventListener: function () {}, addEventListener: function () {} });
  /* the real rtsHome, cut out of title.js - the rest of that file runs the title at load */
  var t = fs.readFileSync(path.join(ROOT, 'src/title.js'), 'utf8'), a = t.indexOf('function rtsHome(){'), d = 0, i = a;
  for (;; i++) { if (t[i] === '{') d++; else if (t[i] === '}') { d--; if (!d) break; } }
  vm.runInContext(t.slice(a, i + 1), g);
  g._RTS_STANDALONE = true;
  g.rtsOpen = function () { open.push({ army: g.rtsArmySide(), mission: g._RTS_MISSION ? g._RTS_MISSION.id : null, daily: g._RTS_DAILY ? g._RTS_DAILY.date : null,
    diff: g._RTS_DIFF, survival: !!g._RTS_SURVIVAL }); doc._battle = true; };
  g._open = open;
  return g;
}
function put(g, info, body) {
  var text = JSON.stringify(Object.assign({ ents: [{ id: 1 }], seed: 5, diff: 'normal' }, body || {}));
  g.localStorage.setItem('rccmd.save1', text);
  g.localStorage.setItem('rccmd.save1.info', JSON.stringify(Object.assign({ v: g._rtsSaveVersion(), hash: g._rtsHash(text), bytes: text.length, diff: 'normal', seed: 5, t: 60, when: 1, desc: 'x' }, info)));
}
function opened(inBattle, setup, info, body) {
  var g = page(inBattle);
  g.rtsSetArmySide('allied'); g._RTS_DIFF = 'normal';
  if (setup) setup(g);
  put(g, info, body);
  var ok = g.rtsLoadGame('save');
  return Object.assign({ ok: ok, n: g._open.length, pref: g.localStorage.getItem('rcgVoxSide') }, g._open[0] || {});
}
var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };

/* a Dominion mission, played by a player whose own army is the Compact */
var probe = page(false), M = probe.RTS_CAMPAIGN.filter(function (x) { return x.army === 'soviet'; })[0];
S.ok('there is a Dominion mission to save (population)', !!M, M && M.id);
function inMission(g) { g._RTS_CAMP_PREV = { diff: 'normal', army: 'allied' }; g._RTS_MISSION = { id: M.id, seed: M.seed, lvl: M.diff }; g._RTS_DIFF = M.diff; g._RTS_ARMY = M.army; }
var mInfo = { side: 'soviet', mission: { id: M.id, lvl: M.diff } };
var mTitle = opened(false, null, mInfo), mBattle = opened(true, inMission, mInfo);
S.ok('from the title a mission\'s save opens as that mission, with its army (the control)', mTitle.ok && mTitle.n === 1 && mTitle.army === 'soviet' && mTitle.mission === M.id, JSON.stringify(mTitle));
S.ok('IN A BATTLE: loaded with the button inside the mission, it opens the same', same(mBattle, mTitle), JSON.stringify(mBattle));

var dInfo = { side: 'soviet', daily: { date: '2026-11-12', seed: 5, diff: 'hard', army: 'soviet' } };
var dTitle = opened(false, null, dInfo), dBattle = opened(true, null, dInfo);
S.ok('from the title a daily\'s save opens as that daily, with its army and difficulty (the control)', dTitle.army === 'soviet' && dTitle.daily === '2026-11-12' && dTitle.diff === 'hard', JSON.stringify(dTitle));
S.ok('...and inside a battle the same', same(dBattle, dTitle), JSON.stringify(dBattle));

/* ---- a plain save from inside a daily ---- */
function inDaily(g) { g._RTS_DAILY_PREV = { diff: 'normal', army: 'allied' }; g._RTS_DAILY = { date: '2026-11-12', seed: 9, diff: 'normal', army: 'soviet' }; g._RTS_ARMY = 'soviet'; }
var pBattle = opened(true, inDaily, { side: 'soviet' });
S.ok('A PLAIN SAVE loaded inside a daily is not that daily, and opens with the save\'s own army', pBattle.daily === null && pBattle.army === 'soviet' && pBattle.mission === null, JSON.stringify(pBattle));
var pOwn = opened(true, inDaily, { side: 'allied' });
S.ok('...a Compact save from inside a Dominion daily opens as the Compact', pOwn.daily === null && pOwn.army === 'allied', JSON.stringify(pOwn));

/* ---- survival ---- */
var sv = opened(false, null, { side: 'allied', desc: 'Survival, wave 3' }, { survival: { wave: 3, next: 20 } });
var nsv = opened(false, function (g) { g._RTS_SURVIVAL = true; }, { side: 'allied' });
S.ok('SURVIVAL: its save tells the page it is one', sv.survival === true, JSON.stringify(sv));
S.ok('...and a plain save does not, whatever the page thought before', nsv.survival === false, JSON.stringify(nsv));

/* ---- the dead, the decided: a real battle ---- */
var c = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
c.window._RTS_ARMY = 'allied'; c._rtsNewGame(9001, 'normal');
var G = c._rtsG, y = c._rtsHas('player', 'yard');
var p1 = c._rtsNearestOpen(y.tx + 8, y.tz + 8, 10, null), A = c._rtsSpawnUnit('player', 'tank', c._rtsWX(p1[0]), c._rtsWX(p1[1]));
var p2 = c._rtsNearestOpen(p1[0] + 3, p1[1], 4, null), B = c._rtsSpawnUnit('enemy', 'tank', c._rtsWX(p2[0]), c._rtsWX(p2[1]));
c._rtsOrderAttack(A, B); c._rtsOrderAttack(B, A);
var n = 0;
while (n < 600 && !(G.proj.length && A.target === B && B.target === A)) { c._rtsTick(1 / 60); n++; }
c._rtsDamage(A, 99999, null); c._rtsDamage(B, 99999, null);      /* one blast takes both */
c._rtsTick(1 / 60);
var shell = G.proj[0];
S.ok('two tanks dead and reaped, each the other\'s target, a shell of theirs still in flight (population)',
     A.dead && B.dead && G.ents.indexOf(A) < 0 && G.ents.indexOf(B) < 0 && A.target === B && B.target === A && !!shell && !!shell.from && shell.from.dead,
     JSON.stringify({ a: A.dead, b: B.dead, proj: G.proj.length }));
var state = null, threw = null;
try { state = c._rtsSaveState(G); } catch (e) { threw = e.message; }
S.ok('THE DEAD: the save is written', !!state && !threw, threw || 'ok');
if (state) {
  var text = JSON.stringify(state), back = JSON.parse(text);
  var c2 = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
  c2.window._RTS_ARMY = 'allied'; c2._rtsNewGame(back.seed, back.diff);
  c2._rtsApplyState(c2._rtsG, back);
  var G2 = c2._rtsG, sh2 = G2.proj[0];
  S.ok('...the shell comes back, its shooter dead and still of its side', !!sh2 && !!sh2.from && sh2.from.dead === true && sh2.from.side === shell.from.side && sh2.from.def === shell.from.def,
       JSON.stringify(sh2 && sh2.from));
  S.ok('...carrying no references of its own', !!sh2 && sh2.from.target === undefined, JSON.stringify(sh2 && Object.keys(sh2.from).length));
  var err = null;
  try { for (var k = 0; k < 240; k++) c2._rtsTick(1 / 60); } catch (e2) { err = e2.message; }
  S.ok('...and the resumed battle plays on through the shell\'s landing', !err && G2.proj.indexOf(sh2) < 0, err || 'ok');
  S.eq('a saved state saved again is the same save', JSON.stringify(c._rtsSaveState(G)), text);
}

c.window._rtsUI = null;
var said = []; c._rtsSay = function (m) { said.push(m); };
S.ok('a battle being fought is saved (the control)', c.rtsSaveGame('save') === true && !!c.localStorage.getItem('rccmd.save1'), said.join(' | '));
var before = c.localStorage.getItem('rccmd.save1.info');
G.over = 'win'; said.length = 0;
S.ok('DECIDED: a battle that is over is not saved, and says why', c.rtsSaveGame('save') === false && /over/.test(said.join(' ')), said.join(' | '));
S.eq('...and the save already kept is left as it was', c.localStorage.getItem('rccmd.save1.info'), before);
G.over = null;

/* ---- stale, in any slot ---- */
S.ok('no slot is stale after a save by this build (population)', c.rtsAnySaveStale() === false, '');
c.localStorage.setItem(c.RTS_SLOTS.save3.info, JSON.stringify({ v: c._rtsSaveVersion() - 1, desc: 'old' }));
S.ok('STALE: an earlier build\'s save in the third slot is found', c.rtsAnySaveStale() === true && c.rtsSaveStale() === false, '');
c.localStorage.removeItem(c.RTS_SLOTS.save3.info);
c.localStorage.setItem(c.RTS_SLOTS.auto.info, JSON.stringify({ v: c._rtsSaveVersion() - 1, desc: 'old' }));
S.ok('...and in the autosave\'s', c.rtsAnySaveStale() === true, '');

/* ---- the bed ---- */
var a = load(['src/rules', 'src/audio', 'src/rts.audio.js', 'src/rts.ambience.js']);
function gain(v) { var o = { value: v, to: null, setTargetAtTime: function (x) { o.to = x; } }; return { gain: o }; }
var loops = {}; Object.keys(a.RTS_LOOPS).forEach(function (k2, i2) { loops[k2] = { g: gain(0.1 + i2 * 0.01), src: null }; });
vm.runInContext('_rtsA = null;', a);
a._rtsAmbQuiet();                                  /* no sound yet: nothing to do, nothing thrown */
a._seedA = { ctx: { currentTime: 3 }, amb: { v: loops, echo: { g: gain(0.4) }, t: 5 } };
vm.runInContext('_rtsA = _seedA;', a);
a._rtsAmbQuiet();
var ks = Object.keys(loops);
S.ok('there are loops to turn down (population)', ks.length > 5, ks.length + ' loops');
S.ok('THE BED: leaving a battle sends every loop to silence', ks.every(function (k3) { return loops[k3].g.gain.to === 0; }),
     ks.filter(function (k3) { return loops[k3].g.gain.to !== 0; }).join(' ') || 'all');
S.eq('...and the echo', a._seedA.amb.echo.g.gain.to, 0);
var sh = fs.readFileSync(path.join(ROOT, 'src/ui/shell.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
S.ok('...called where a battle is closed, beside the music\'s stop', /_rtsMusicStop\(\);\s*if \(typeof _rtsAmbQuiet === 'function'\) _rtsAmbQuiet\(\);/.test(sh), '');

require('../lib/report.js')(S);
