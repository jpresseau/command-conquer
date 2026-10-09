/* SELF-PLAY: the computer against itself, many battles, and what each unit did in them.

     node tools/selfplay.js --seeds=30 [--from=9001] [--diff=normal] [--secs=720] [--jobs=3]
                            [--out=selfplay-out.json] [--set=rules.js]

   Every seed is played twice, the armies swapped between the seats, so a map's own lean and the
   seat each army starts in cancel out of the totals. Both seats open as the computer does and play
   at --diff (core/seats.js). Crates are off - they hand out free units and buffs no purchase paid
   for - and the sky is a clear day, as every headless battle is. --set names a file of rule
   changes to try (it is run in the game's context before each battle, e.g.
   `RTS_UNITS.filter(u => u.key === 'tank')[0].cost = 900;`), so a change is measured against the
   same seeds as the baseline.

   THE LEDGER is kept beside the game, never in it: nothing here touches a saved field or draws a
   random number, so a battle measured is the battle the game plays. Damage is valued at the
   victim's price per hit point (a tank worth 800 with 400 hp is 2 credits a point), so a unit is
   credited for every shot that landed, not only for killing blows; splash and burning go to whoever
   fired. Per army and unit kind: how many were bought and for how much, the value of the damage
   they dealt and took, and so value dealt per credit spent. Free units (survivors of a destroyed
   building, the refinery's harvester) deal damage but were bought by no one.

   OUTCOME: the battle's own end, or at the horizon the share of everything standing - units and
   buildings at their price, plus money - each seat holds. */
var path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
var ROOT = path.resolve(__dirname, '..');
var A = {};
process.argv.slice(2).forEach(function (a) { var m = /^--([\w-]+)(?:=(.*))?$/.exec(a); if (m) A[m[1]] = m[2] == null ? true : m[2]; });

function battle(cfg) {
  var { loadFast } = require(path.join(ROOT, 'test/lib/sandbox.js'));
  var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
  if (cfg.set) (new g.Function(fs.readFileSync(cfg.set, 'utf8')))();
  g.RTS_CRATE_MAX = 0;
  g.window._RTS_ARMY = cfg.army;                        /* the player's seat's army; the other seat gets the other */
  var L = {}, armyOf = {};
  function row(side, def) {
    var k = armyOf[side] + ':' + def;
    return L[k] || (L[k] = { army: armyOf[side], def: def, built: 0, spent: 0, dealt: 0, taken: 0, killed: 0, lost: 0 });
  }
  function price(e) { var d = e.type === 'struct' ? g.rtsStructDef(e.def) : g.rtsUnitDef(e.def); return d ? d.cost : 0; }
  var dmg = g._rtsDamage;
  g._rtsDamage = function (tgt, n, from, floor) {
    var hp0 = tgt && !tgt.dead ? tgt.hp : 0, r = dmg.apply(this, arguments);
    if (!tgt || hp0 <= 0) return r;
    var lostHp = hp0 - Math.max(0, tgt.dead ? 0 : tgt.hp);
    if (lostHp <= 0 || !tgt.maxHp) return r;
    var v = lostHp * price(tgt) / tgt.maxHp;
    row(tgt.side, tgt.def).taken += v;
    if (tgt.dead) row(tgt.side, tgt.def).lost++;
    if (from && from.def && from.side && from.side !== tgt.side) {
      var f = row(from.side, from.def); f.dealt += v; if (tgt.dead) f.killed++;
    }
    return r;
  };
  var dlv = g._rtsDeliverUnit;
  g._rtsDeliverUnit = function (side, key) {
    var m = dlv.apply(this, arguments);
    if (m) { var R = row(side, key); R.built++; R.spent += g._rtsCostOf(side, g.rtsUnitDef(key)); }
    return m;
  };
  g._rtsNewGame(cfg.seed, cfg.diff, { player: { ctl: 'ai', diff: cfg.diff } });
  var G = g._rtsG;
  armyOf.player = g.rtsHouseSide('player'); armyOf.enemy = g.rtsHouseSide('enemy');
  var dt = 1 / 60, steps = cfg.secs * 60, lastHit = 0;
  for (var i = 0; i < steps && !G.over; i++) g._rtsTick(dt);
  function assets(side) {
    var v = g.rtsMoney(G.sides[side]);
    G.ents.forEach(function (e) { if (!e.dead && e.side === side) v += price(e); });
    return v;
  }
  var ap = assets('player'), ae = assets('enemy');
  var won = G.over === 'win' ? 'player' : G.over === 'lose' ? 'enemy' : null;
  return { seed: cfg.seed, army: cfg.army, t: Math.round(G.t), over: G.over || null,
           winner: won ? armyOf[won] : null, share: { [armyOf.player]: ap / (ap + ae), [armyOf.enemy]: ae / (ap + ae) },
           ledger: Object.keys(L).map(function (k) { return L[k]; }) };
}

if (A.worker) {
  process.on('message', function (cfg) { var t0 = Date.now(), r = battle(cfg); r.ms = Date.now() - t0; process.send(r); });
  return;
}

var seeds = +A.seeds || 10, from = +A.from || 9001, diff = A.diff || 'normal', secs = +A.secs || 720;
var jobs = +A.jobs || Math.max(1, Math.min(3, os.cpus().length - 1)), out = A.out || 'selfplay-out.json';
var todo = [];
for (var s = 0; s < seeds; s++) ['allied', 'soviet'].forEach(function (army) {
  todo.push({ seed: from + s, army: army, diff: diff, secs: secs, set: A.set ? path.resolve(A.set) : null });
});
var results = [], running = 0, t0 = Date.now(), total = todo.length;
function next(w) {
  if (!todo.length) { w.kill(); if (--running === 0) done(); return; }
  w.send(todo.shift());
}
for (var j = 0; j < Math.min(jobs, todo.length); j++) {
  var w = cp.fork(__filename, ['--worker']);
  running++;
  (function (w) {
    w.on('message', function (r) {
      results.push(r);
      process.stderr.write(results.length + '/' + total + '  seed ' + r.seed + ' ' + r.army + ' player: ' + (r.over || 'horizon') + ' at ' + r.t + 's, winner ' + (r.winner || '-') + ', ' + Math.round(r.ms / 1000) + 's\n');
      next(w);
    });
    next(w);
  })(w);
}

function done() {
  var agg = {}, wins = { allied: 0, soviet: 0, none: 0 }, share = { allied: 0, soviet: 0 };
  results.forEach(function (r) {
    wins[r.winner || 'none']++;
    share.allied += r.share.allied; share.soviet += r.share.soviet;
    r.ledger.forEach(function (x) {
      var k = x.army + ':' + x.def, a = agg[k] || (agg[k] = { army: x.army, def: x.def, battles: 0, built: 0, spent: 0, dealt: 0, taken: 0, killed: 0, lost: 0 });
      a.battles++; ['built', 'spent', 'dealt', 'taken', 'killed', 'lost'].forEach(function (f) { a[f] += x[f]; });
    });
  });
  var rows = Object.keys(agg).map(function (k) { var a = agg[k]; a.perCredit = a.spent ? a.dealt / a.spent : null; return a; })
    .sort(function (a, b) { return (b.perCredit || 0) - (a.perCredit || 0); });
  var summary = { battles: results.length, diff: diff, secs: secs, wins: wins,
                  meanShare: { allied: share.allied / results.length, soviet: share.soviet / results.length },
                  minutes: +((Date.now() - t0) / 60000).toFixed(1), units: rows, results: results };
  fs.writeFileSync(out, JSON.stringify(summary, null, 1));
  console.log(results.length + ' battles in ' + summary.minutes + ' min; wins ' + JSON.stringify(wins) + '; mean asset share ' +
              JSON.stringify(summary.meanShare, function (k, v) { return typeof v === 'number' ? +v.toFixed(3) : v; }));
  console.log('army    unit           built   spent    dealt/credit  dealt   taken   kills lost');
  rows.filter(function (a) { return a.built >= 3; }).forEach(function (a) {
    console.log((a.army + '        ').slice(0, 8) + (a.def + '               ').slice(0, 15) + ('' + a.built).padStart(5) + ('' + Math.round(a.spent)).padStart(8) +
                (a.perCredit == null ? '-' : a.perCredit.toFixed(2)).padStart(14) + ('' + Math.round(a.dealt)).padStart(8) + ('' + Math.round(a.taken)).padStart(8) +
                ('' + a.killed).padStart(6) + ('' + a.lost).padStart(5));
  });
}
