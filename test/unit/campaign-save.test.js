/* A MISSION SAVED AND RESUMED (rts.save.js, core/campaign.js), headless: four missions, each played
   for a while, written down mid-battle, and resumed in a fresh world the way RESUME BATTLE does it
   (a new game on the save's seed, difficulty and map, the state laid over it, and the mission NOT
   laid again). The resumed battle must play on exactly as the one that never stopped.

     TWO FRONTS    its waves are counted in the mission's own memory (M.next); the ally is
                   stripped; played at Veteran, a level it does not open on
     ORDER OF BATTLE  an ally held at ctl 'none' carrying the player's order; two fortified yards
     ARMOUR BY AIR    an island cut out of the ground by the setup, and tanks inside cranes
     BREACHWATER   a large 2v2 map, both enemies thinking
   Each: the mission, its level and its goals come back; the fingerprint (test/lib/fingerprint.js)
   matches the unbroken run at every ten-second sample after the resume, to the same clock.
     THE PAGE      resuming a mission's save hands the page that mission, with the player's own army
                   and difficulty kept to be put back; a plain save loaded inside a mission ends it */

var { Suite } = require('../lib/assert.js');
var { mission, play } = require('../lib/mission.js');
var { loadFast } = require('../lib/sandbox.js');
var { fingerprint } = require('../lib/fingerprint.js');
var { sendAll } = require('../lib/plays.js');

var S = new Suite('campaign-save');

/* what the player does, tick by tick, the same in both runs */
var ORDERS = {
  twofronts: function (o, i) {
    if (i % 900 === 7) o.g._rtsQueue('player', 'tank');
    var y = o.g._rtsMTagged(o.G, 'allyyard')[0];
    if (y && i % 1200 === 5) sendAll(o.g, 'player', y, true);
  },
  orders: function (o, i) {
    var y = o.g._rtsMTagged(o.G, 'y1')[0] || o.g._rtsMTagged(o.G, 'y2')[0];
    if (y && i % 1200 === 5) sendAll(o.g, 'player', y);
    var y2 = o.g._rtsMTagged(o.G, 'y2')[0];
    if (y2 && i === 600) o.g._rtsAllyCommand('attack', y2.x, y2.z);
  },
  skycrane: function (o, i) {
    var g = o.g, G = o.G, M = G.mission;
    if (i === 60) {
      var lifts = g._rtsMTagged(G, 'lift'), arm = g._rtsMTagged(G, 'armour');
      lifts.forEach(function (l, k) { g._rtsBoard(arm[k], l); });
    }
    if (i === 60 * 16) g._rtsMTagged(G, 'lift').forEach(function (l) { g._rtsOrderMove(l, g._rtsWX(M.isle.tx), g._rtsWX(M.isle.tz), true); });
  },
  breachwater: function (o, i) {
    if (i % 720 === 7) { o.g._rtsQueue('player', 'tank'); o.g._rtsQueue('player', 'rocket'); }
    var y = o.g._rtsMTagged(o.G, 'y1')[0];
    if (y && i % 1200 === 5) sendAll(o.g, 'player', y);
  }
};
/* RESUME BATTLE, headless: a fresh world, a new game on the save's own seed, difficulty and map
   (ui/shell.js rtsOpen), the state over it - and no mission setup */
function resume(body, m) {
  var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
  g.window._RTS_ARMY = m.army;
  g._rtsNewGame(body.seed, body.diff, { skirmish: body.skirmish });
  g._rtsApplyState(g._rtsG, body);
  return { g: g, G: g._rtsG, M: g._rtsG.mission, m: m };
}

[['twofronts', 'hard', 60, 120], ['orders', null, 30, 60], ['skycrane', null, 20, 60], ['breachwater', null, 90, 60]].forEach(function (c) {
  var id = c[0], lvl = c[1], before = c[2], after = c[3], each = ORDERS[id];
  var A = mission(id, lvl), B = mission(id, lvl);
  [A, B].forEach(function (o) { play(o, before, function (i) { each(o, i); }); });
  var body = JSON.parse(JSON.stringify(B.g._rtsSaveState(B.G)));
  var C = resume(body, A.m), off = 60 * before;
  S.ok(id + ': resumed, the mission, its level and its goals come back', !!C.M && C.M.id === id && C.M.lvl === A.M.lvl &&
       JSON.stringify(C.g._rtsMissionGoals(C.G)) === JSON.stringify(A.g._rtsMissionGoals(A.G)),
       JSON.stringify({ id: C.M && C.M.id, lvl: C.M && C.M.lvl, goals: C.g._rtsMissionGoals(C.G).map(function (x) { return x.text; }) }));
  var marks = [], diff = [];
  for (var s = 0; s < after; s += 10) {
    var ra = play(A, 10, function (i) { each(A, off + 60 * s + i); }), rc = play(C, 10, function (i) { each(C, off + 60 * s + i); });
    var fa = fingerprint(A.g), fc = fingerprint(C.g);
    marks.push(fa); if (fa !== fc) diff.push(s + 10 + 's');
    if (ra.over || rc.over) break;
  }
  S.ok('...and plays on exactly as the battle that never stopped', marks.length >= 3 && !diff.length && A.G.over === C.G.over && A.G.t === C.G.t,
       JSON.stringify({ samples: marks.length, differ: diff, over: [A.G.over, C.G.over], t: [Math.round(A.G.t), Math.round(C.G.t)] }));
});

/* ---------------- the page ---------------- */
var h = loadFast(['src/rules', 'src/core', 'src/rts.save.js', 'src/campaign.js']);
h.window._RTS_DIFF = 'hard'; h.window._RTS_ARMY = 'soviet';
h._rtsLoadArmy({ side: 'allied', mission: { id: 'twofronts', seed: 9005, lvl: 'hard' } });
var w = h.window, put = { mission: w._RTS_MISSION, diff: w._RTS_DIFF, army: w._RTS_ARMY, prev: w._RTS_CAMP_PREV };
S.ok('THE PAGE: a mission\'s save hands the page that mission, its army and its own difficulty, keeping the player\'s to put back',
     !!put.mission && put.mission.id === 'twofronts' && put.mission.lvl === 'hard' && put.diff === 'normal' && put.army === 'allied' &&
     !!put.prev && put.prev.diff === 'hard' && put.prev.army === 'soviet', JSON.stringify(put));
h._rtsLoadArmy({ side: 'soviet' });
S.ok('...and a plain save loaded inside the mission ends it, the player\'s own difficulty back', !w._RTS_MISSION && !w._RTS_CAMP_PREV && w._RTS_DIFF === 'hard',
     JSON.stringify({ mission: w._RTS_MISSION, diff: w._RTS_DIFF }));

require('../lib/report.js')(S);
