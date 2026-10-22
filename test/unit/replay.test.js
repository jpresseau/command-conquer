/* REPLAYS, HEADLESS (core/replay.js, core/commands.js):

     THE RECORD    a battle played with ticks of the live loop's uneven lengths (and one a spec's
                   1/60) and the player's calls between them: every tick is in it, every call the
                   test made and none the simulation made itself - nor one a recorded call made, as
                   a Mobile Yard's deploy places its yard - the odd tick by its number
     THE REPLAY    the record, through JSON as storage keeps it, played on a fresh world laid the
                   same way ends where the battle did, to the bit - the wide fingerprint
                   (test/lib/fingerprint.js) and the record's own hash both
     ONE CALL      the same record with one call taken out does not: the calls are what it plays
     HANDS OFF     while a replay plays, a call from outside it is refused and changes nothing
     REVEALED      the watcher's 👁 shows what the player could not see, outside the ticks only: a
                   replay watched revealed ends where the battle did, and a recording is never revealed
     A JUMP        on to a tick exactly, on the timeline's clock, and on from there to the same end
     A FILE'S      a recording that is not one - an order that is not a command, a tick no frame takes,
                   a battle this game has not - fails the check, and an order that is not a command,
                   got past it, is skipped
     A MISSION     Order of Battle won by its intended play, ally orders and all, and a survival with
     A SURVIVAL    a base built and riflemen on repeat, each replay to the same end
     THE LIST      every simulation function anything outside src/core and src/rules calls is a
                   recorded command or named as needing none; every name in either list is a
                   function; and src/ui writes no unit's or side's orders by hand */

var fs = require('fs'), path = require('path');
var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');
var { fingerprint } = require('../lib/fingerprint.js');

var S = new Suite('replay');
var ROOT = path.resolve(__dirname, '..', '..');
function world() {
  var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
  g._rtsNewGame(7, 'normal'); g.window._rtsUI = {};
  /* a Mobile Yard on open ground, laid with the battle: deploying it is a recorded call that
     makes another (_rtsDeploySelected places the yard by _rtsPlaceStruct), which must be logged once */
  var y = g._rtsHas('player', 'yard'), c = g._rtsNearestOpen(y.tx + 9, y.tz - 9, 8, null);
  g._rtsSpawnUnit('player', 'mcv', g._rtsWX(c[0]), g._rtsWX(c[1])).tag = 'mcv';
  return g;
}
/* the live loop's steps: whole milliseconds, uneven, as Date readings give them */
var STEPS = [16, 17, 17, 16, 33, 16, 17, 50, 16, 17];

/* ---------------- the record ---------------- */
var g = world(), G = g._rtsG, made = [];
g._rtsRecStart({ seed: 7, diff: 'normal', army: g.rtsArmySide(), skirmish: null, mission: null, survival: false, daily: null, sky: null });   /* as replay.js writes it */
function call(name) { var a = Array.prototype.slice.call(arguments, 1); made.push(name); return g[name].apply(null, a); }
var mine = function () { return G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'unit' && !g.rtsUnitDef(e.def).harvest; }); };
var y = g._rtsHas('player', 'yard'), ticks = 0;
for (var i = 0; G.t < 200 && !G.over; i++) {
  var dt = i === 500 ? 1 / 60 : STEPS[i % STEPS.length] / 1000;
  g._rtsTick(dt); ticks++;
  var S0 = G.sides.player;
  /* the player, between ticks, as the interface would be */
  if (i === 20) call('_rtsQueue', 'player', 'power');
  if (S0.ready && i % 40 === 0) {
    for (var r = 3; r < 14; r++) {
      var tx = y.tx + r, tz = y.tz + (i / 40 % 3) * 3;
      if (g._rtsCanPlace('player', S0.ready, tx, tz)) { call('_rtsPlaceStruct', 'player', S0.ready, tx, tz, false, S0.readyPaid); call('_rtsReadyClear', 'player'); break; }
    }
    if (!S0.q.struct && !S0.ready) call('_rtsQueue', 'player', i < 2000 ? 'refinery' : 'barracks');
  }
  if (i === 900) call('_rtsQueue', 'player', g.rtsHouseSide('player') === 'soviet' ? 'rifle' : 'rifle');
  if (i === 950) call('_rtsRepeatSet', 'player', 'infantry', true);
  if (i % 700 === 300 && mine().length) {
    var u = mine()[0];
    call('_rtsWayClear', u); call('_rtsOrderMove', u, y.x + 30, y.z + (i % 1400 ? 20 : -20), true);
    call('_rtsWayAdd', u, y.x - 20, y.z, false);
  }
  if (i === 4000 && mine().length) { G.sel = mine().slice(0, 2); call('_rtsHoldSelected'); }
  if (i === 1500) { G.sel = g._rtsMTagged(G, 'mcv'); call('_rtsDeploySelected'); }
}
var yards = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.def === 'yard'; }).length;
var rec = JSON.parse(JSON.stringify(g._rtsRecStop())), fpA = fingerprint(g);
var held = rec.cmds.filter(function (c) { return c.f === '_rtsHoldSelected'; })[0];
var names = {};
rec.cmds.forEach(function (c) { names[c.f] = (names[c.f] || 0) + 1; });
S.ok('THE RECORD: every tick, the odd one by its number, and exactly the calls the test made - none the simulation made itself',
     rec.dts.length === ticks && Object.keys(rec.odd).join() === '500' && rec.cmds.length === made.length && rec.cmds.map(function (c) { return c.f; }).join() === made.join() &&
     ['_rtsQueue', '_rtsPlaceStruct', '_rtsReadyClear', '_rtsOrderMove', '_rtsWayAdd', '_rtsRepeatSet', '_rtsHoldSelected', '_rtsDeploySelected'].every(function (n) { return names[n] > 0; }) &&
     !!held && !!held.s && held.s.length === 2 && yards === 2,
     JSON.stringify({ ticks: ticks, dts: rec.dts.length, odd: rec.odd, cmds: rec.cmds.length, made: made.length, names: names, yards: yards }));

/* ---------------- the replay ---------------- */
/* a replay that throws has not played out: it ends there, with the error, for the check to say */
function replay(r) {
  var h = world(), R = h._rtsReplayBegin(r), n = 0;
  try { while (!R.done && n++ < 1e6) h._rtsReplayStep(R, 0.05, 50); } catch (e) { R.err = String(e); }
  return { g: h, R: R };
}
var B = replay(rec);
S.ok('THE REPLAY: played on a fresh world, it ends where the battle did, to the bit', !B.R.err && B.R.done && B.R.n === ticks && fingerprint(B.g) === fpA && B.g._rtsReplayHash(B.g._rtsG) === rec.end.hash,
     JSON.stringify({ err: B.R.err, n: B.R.n, ticks: ticks, fp: [fingerprint(B.g), fpA], hash: [B.g._rtsReplayHash(B.g._rtsG), rec.end.hash], t: [B.g._rtsG.t, rec.end.t] }));

/* ---------------- one call taken out ---------------- */
var cut = JSON.parse(JSON.stringify(rec));
cut.cmds.splice(cut.cmds.map(function (c) { return c.f; }).indexOf('_rtsOrderMove'), 1);
var C = replay(cut);
S.ok('ONE CALL: the same record with one order taken out ends elsewhere', C.R.done && C.g._rtsReplayHash(C.g._rtsG) !== rec.end.hash, C.g._rtsReplayHash(C.g._rtsG) + ' vs ' + rec.end.hash);

/* ---------------- hands off ---------------- */
var h = world(), HR = h._rtsReplayBegin(rec);
h._rtsReplayStep(HR, 5, 1e6);
var hu = h._rtsG.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'unit'; })[0], was = hu && hu.order;
var got = hu && h._rtsOrderMove(hu, hu.x + 40, hu.z, false);
S.ok('HANDS OFF: while a replay plays, a call from outside it is refused and changes nothing', !!hu && got === false && hu.order === was && HR.refused === 1,
     JSON.stringify({ got: got, order: [was, hu && hu.order], refused: HR.refused }));

/* ---------------- the watcher's 👁 ---------------- */
/* revealed for the whole of a replay, it ends where the battle did: the simulation never saw it */
var V = world(), VR = V._rtsReplayBegin(rec), VG = V._rtsG, es = VG.starts.enemy;
VR.reveal = true;
V._rtsReplayTo(VR, 600);
var seenOn = V._rtsVisible(es.tx, es.tz) && V._rtsEntSeen(V._rtsHas('enemy', 'yard'));
VR.reveal = false;
var seenOff = V._rtsVisible(es.tx, es.tz);
VR.reveal = true;
/* asked from inside the battle - a tick's own work, and a recorded order made again - it is not revealed */
var inTick = [], inCall = [], skyTick = V._rtsSkyPlayTick, move = V._rtsOrderMove;
V._rtsSkyPlayTick = function () { inTick.push(V._rtsRevealed()); return skyTick.apply(this, arguments); };
V._rtsOrderMove = function () { inCall.push(V._rtsRevealed()); return move.apply(this, arguments); };
while (!VR.done) V._rtsReplayStep(VR, 0.05, 50);
V._rtsSkyPlayTick = skyTick; V._rtsOrderMove = move;
var recR = g._rtsRecStart({}); recR.reveal = true;
var recSees = g._rtsRevealed();
g._rtsRecStop();
S.ok('REVEALED: 👁 shows the enemy\'s far corner and yard outside the ticks and not when off, never reveals a recording, and a replay watched revealed throughout ends where the battle did, to the bit',
     seenOn && !seenOff && !recSees && V._rtsReplayHash(VG) === rec.end.hash && fingerprint(V) === fpA, JSON.stringify({ on: seenOn, off: seenOff, rec: recSees, hash: [V._rtsReplayHash(VG), rec.end.hash] }));
S.ok('...and it is never revealed to the battle itself: not to a tick\'s own work, nor to a recorded order made again',
     inTick.length > 1000 && inTick.indexOf(true) < 0 && inCall.length > 5 && inCall.indexOf(true) < 0, JSON.stringify({ ticks: inTick.length, revealedInTick: inTick.filter(Boolean).length, calls: inCall.length, revealedInCall: inCall.filter(Boolean).length }));

/* ---------------- a jump ---------------- */
var J = world(), JR = J._rtsReplayBegin(rec), half = Math.floor(rec.dts.length / 2), T = J._rtsReplayTimes(rec);
J._rtsReplayTo(JR, half);
var at = { n: JR.n, t: J._rtsG.t, want: T[half] };
while (!JR.done) J._rtsReplayStep(JR, 0.05, 50);
S.ok('A JUMP: on to the middle tick exactly, its clock the timeline\'s, and from there to the same end, to the bit; the timeline ends on the battle\'s clock',
     at.n === half && at.t === at.want && J._rtsReplayHash(J._rtsG) === rec.end.hash && T[rec.dts.length] === rec.end.t, JSON.stringify({ at: at, end: [T[rec.dts.length], rec.end.t] }));

/* ---------------- a file's ---------------- */
function bad(change) { var r = JSON.parse(JSON.stringify(rec)); change(r); return g._rtsReplayValid(r); }
var why = {
  good: g._rtsReplayValid(rec),
  call: bad(function (r) { r.cmds.push({ k: 3, f: 'rtsClose', a: [] }); }),
  name: bad(function (r) { r.cmds[0].f = 'localStorage'; }),
  tick: bad(function (r) { r.dts = r.dts.slice(0, 10) + '0' + r.dts.slice(11);   /* a 0 ms step: none the live loop takes */ }),
  odd: bad(function (r) { r.odd = {}; }),
  diff: bad(function (r) { r.head.diff = 'insane'; }),
  army: bad(function (r) { r.head.army = '<img>'; }),
  head: bad(function (r) { delete r.head; }),
  mission: bad(function (r) { r.head.mission = { id: 'nowhere' }; }),
  junk: g._rtsReplayValid('{}'), none: g._rtsReplayValid(null)
};
S.ok('A FILE\'S: a recording passes the check, and one calling anything but a command, with a tick no live frame takes, a dropped odd tick, or a difficulty, army, mission or head this game has not, does not',
     why.good === '' && Object.keys(why).filter(function (k) { return k !== 'good'; }).every(function (k) { return why[k]; }), JSON.stringify(why));
/* and got past the check anyway, the call is skipped, never made */
var smug = JSON.parse(JSON.stringify(rec)), Z = world();
Z.window.__called = 0; Z.window.__trap = function () { Z.window.__called++; };
smug.cmds.unshift({ k: 0, f: '__trap', a: [] });
var ZR = Z._rtsReplayBegin(smug);
while (!ZR.done) Z._rtsReplayStep(ZR, 0.05, 50);
S.ok('...and a call that is not a command, got past the check, is skipped: never made, and the replay ends where the battle did', Z.window.__called === 0 && ZR.bad === 1 && Z._rtsReplayHash(Z._rtsG) === rec.end.hash,
     JSON.stringify({ called: Z.window.__called, bad: ZR.bad }));

/* ---------------- a mission and a survival ---------------- */
/* each recorded as played, through the same calls a player makes (test/lib/plays.js), and played
   again on a world laid the same way */
var { mission } = require('../lib/mission.js');
var { plays } = require('../lib/plays.js');
function both(lay, playIt) {
  var a = lay(); a.g._rtsRecStart({});
  var r = playIt(a);
  var rec = JSON.parse(JSON.stringify(a.g._rtsRecStop())), b = lay(), R = b.g._rtsReplayBegin(rec), n = 0;
  while (!R.done && n++ < 1e6) b.g._rtsReplayStep(R, 0.5, 1e4);
  return { r: r, rec: rec, same: fingerprint(b.g) === fingerprint(a.g) && b.g._rtsReplayHash(b.g._rtsG) === rec.end.hash, over: [a.g._rtsG.over, b.g._rtsG.over] };
}
var om = both(function () { return mission('orders'); }, function (o) { return plays.orders(o); });
S.ok('A MISSION: Order of Battle, won by its intended play - the player\'s attacks and the ally\'s orders - replays to the same end, to the bit',
     om.r.over === 'win' && om.same && om.over[1] === 'win' && om.rec.cmds.some(function (c) { return c.f === '_rtsAllyCommand'; }) && om.rec.cmds.length > 10,
     JSON.stringify({ r: om.r, cmds: om.rec.cmds.length, over: om.over, same: om.same }));
var sv = both(function () {
  var h = world(); h._rtsSurvivalSetup(h._rtsG); return { g: h, G: h._rtsG };
}, function (o) {
  var x = o.g, X = o.G, plan = ['power', 'barracks'], men = false;
  for (var i = 0; i < 60 * 400 && !X.over; i++) {
    var Sp = X.sides.player, yy = x._rtsHas('player', 'yard');
    if (plan.length && !Sp.q.struct && !Sp.ready && i % 60 === 5 && x._rtsQueue('player', plan[0])) plan.shift();
    if (Sp.ready && yy && i % 60 === 9) {
      for (var rr = 3; rr < 12; rr++) if (x._rtsCanPlace('player', Sp.ready, yy.tx + rr, yy.tz + 2)) { x._rtsPlaceStruct('player', Sp.ready, yy.tx + rr, yy.tz + 2, false, Sp.readyPaid); x._rtsReadyClear('player'); break; }
    }
    if (!men && !plan.length && !Sp.ready && x._rtsHas('player', 'barracks') && x._rtsQueue('player', 'rifle')) { x._rtsRepeatSet('player', 'infantry', true); men = true; }
    x._rtsTick(STEPS[i % STEPS.length] / 1000);
  }
  return { over: X.over, wave: X.survival.wave, paid: X.survival.paid, built: !!x._rtsHas('player', 'barracks'), men: men };
});
S.ok('A SURVIVAL: a run with a base built and riflemen on repeat against its waves replays to the same end, to the bit',
     sv.same && sv.r.wave >= 3 && sv.r.men && sv.rec.cmds.filter(function (c) { return c.f === '_rtsPlaceStruct'; }).length === 2, JSON.stringify({ r: sv.r, cmds: sv.rec.cmds.length, same: sv.same }));

/* ---------------- the list ---------------- */
/* comments out, their newlines kept, so a line number is the file's */
function strip(s) { return s.replace(/\/\*[\s\S]*?\*\//g, function (c) { return c.replace(/[^\n]/g, ''); }).replace(/\/\/[^\n]*/g, ''); }
function walk(d) { return fs.readdirSync(d).reduce(function (a, f) { var p = path.join(d, f); return fs.statSync(p).isDirectory() ? a.concat(walk(p)) : /\.js$/.test(f) ? a.concat([p]) : a; }, []); }
var core = Object.create(null), used = Object.create(null);
walk(path.join(ROOT, 'src')).forEach(function (f) {
  var rel = path.relative(ROOT, f), src = strip(fs.readFileSync(f, 'utf8')), m, re;
  if (/^src\/(core|rules)\//.test(rel)) { re = /^function\s+([\w$]+)\s*\(/gm; while ((m = re.exec(src))) core[m[1]] = rel; }
});
walk(path.join(ROOT, 'src')).forEach(function (f) {
  var rel = path.relative(ROOT, f), src = strip(fs.readFileSync(f, 'utf8')), m, re = /\b([\w$]+)\s*\(/g;
  if (/^src\/(core|rules)\//.test(rel)) return;
  while ((m = re.exec(src))) if (core[m[1]]) (used[m[1]] = used[m[1]] || []).push(rel);
});
var pure = [].concat.apply([], Object.keys(g.RTS_REPLAY_PURE).map(function (k) { return g.RTS_REPLAY_PURE[k]; }));
var loose = Object.keys(used).filter(function (n) { return g.RTS_REPLAY_CMDS.indexOf(n) < 0 && pure.indexOf(n) < 0; });
var ghost = g.RTS_REPLAY_CMDS.concat(pure).filter(function (n) { return typeof g[n] !== 'function'; });
S.ok('THE LIST: every simulation function called from outside src/core and src/rules is a recorded command or named as needing none, and every name in either is a function',
     Object.keys(used).length > 40 && loose.length === 0 && ghost.length === 0, JSON.stringify({ used: Object.keys(used).length, loose: loose.map(function (n) { return n + ' (' + used[n].join(' ') + ')'; }), ghost: ghost }));
var hand = [];
walk(path.join(ROOT, 'src', 'ui')).forEach(function (f) {
  strip(fs.readFileSync(f, 'utf8')).split('\n').forEach(function (l, i) {
    if (/\.(wq|bombNext|order|hstate|path|goal|susp|target|ready|readyPaid|rep|credits|rally)\s*(=[^=]|\+=|-=)/.test(l) || /\.(wq|rep)\b[^;]*\.(push|splice)\(/.test(l)) hand.push(path.relative(ROOT, f) + ':' + (i + 1) + ' ' + l.trim().slice(0, 80));
  });
});
S.ok('...and src/ui writes no unit\'s or side\'s orders by hand (core/commands.js names them)', hand.length === 0, hand.join(' | ') || 'none');

require('../lib/report.js')(S);
