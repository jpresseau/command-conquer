/* WHY A BUILDING CANNOT GO THERE, AND WHAT EACH LINE IS DOING (core/entities.js, ui/repeat.js).

   "Cannot build there - needs clear ground near your base" was said for six causes. The rule and
   its reason are one walk now (_rtsPlaceWhyNot), so:

     EACH CAUSE    off the map, on water, on something built, on trees or rock, on the ore, a
                   Shipyard away from the shore, too far from the base - each has its own word
                   and its own sentence, and clear ground beside the yard has none
     THE RULE      over every cell of the map and three buildings, _rtsCanPlace is exactly "no
                   reason" - with `anywhere` too, which drops only "too far"
     THE TABS      a line's state for its tab: nothing, busy with its share done, on hold, and
                   a building waiting to be placed
     READY         a finished building says so in words; a unit's line and a computer's do not */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('placewhy');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/ui/repeat.js']);
g._rtsNewGame(7, 'normal');
var G = g._rtsG, N = g.RTS_N, y = g._rtsHas('player', 'yard');
function why(key, tx, tz, any) { return g._rtsPlaceWhyNot('player', key, tx, tz, any); }
function find(fn) { for (var i = 0; i < N * N; i++) { var tx = i % N, tz = (i / N) | 0; if (fn(tx, tz, i)) return [tx, tz]; } return null; }
function nearYard(tx, tz) { return Math.hypot(tx - y.tx, tz - y.tz) < 6; }

/* ---------------- each cause ---------------- */
var ok = find(function (tx, tz) { return nearYard(tx, tz) && g._rtsCanPlace('player', 'power', tx, tz); });
S.ok('clear ground beside the yard takes a Power Plant, and has no reason (population)', !!ok && why('power', ok[0], ok[1]) === null, String(ok));
S.eq('off the map', why('power', -1, 5), 'off');
S.eq('...and hanging off its far edge', why('power', N - 1, N - 1), 'off');
var sea = find(function (tx, tz, i) { return G.terrain[i] === g.RTS_T_WATER && tx < N - 2 && tz < N - 2; });
S.ok('there is water on the map (population)', !!sea, String(sea));
if (sea) S.eq('on water', why('power', sea[0], sea[1]), 'water');
S.eq('on something built: the yard itself', why('power', y.tx, y.tz), 'built');
var rough = find(function (tx, tz, i) { return (G.terrain[i] === g.RTS_T_TREE || G.terrain[i] === g.RTS_T_ROCK) && tx < N - 2 && tz < N - 2; });
S.ok('there are trees or rock (population)', !!rough, String(rough));
if (rough) S.eq('on trees or rock', why('power', rough[0], rough[1]), 'ground');
var ore = find(function (tx, tz, i) { return G.scrap[i] > 0 && G.blocked[i] === 0 && G.terrain[i] !== g.RTS_T_WATER; });
S.ok('there is ore on open ground (population)', !!ore, String(ore));
if (ore) S.eq('on the ore', why('power', ore[0], ore[1]), 'ore');
var far = find(function (tx, tz) { return Math.hypot(tx - y.tx, tz - y.tz) > 30 && why('power', tx, tz, true) === null; });
S.ok('there is clear ground far from the base (population)', !!far, String(far));
if (far) {
  S.eq('too far from the base', why('power', far[0], far[1]), 'far');
  S.eq('...which an MCV\'s `anywhere` does not ask', why('power', far[0], far[1], true), null);
}
var yardKey = g.RTS_STRUCTS.filter(function (d) { return d.shore; })[0];
S.ok('there is a building that must touch water (population)', !!yardKey, yardKey && yardKey.key);
if (yardKey) {
  var inland = find(function (tx, tz) { return why('power', tx, tz, true) === null && why(yardKey.key, tx, tz, true) === 'shore'; });
  S.ok('a ' + yardKey.name + ' on clear ground inland is refused for the shore, nothing else', !!inland, String(inland));
  S.ok('...and its sentence names it', /shore/.test(g._rtsPlaceWhyText('shore', yardKey.key)) && g._rtsPlaceWhyText('shore', yardKey.key).indexOf(yardKey.name) >= 0, g._rtsPlaceWhyText('shore', yardKey.key));
}
S.eq('a building that does not exist', why('nosuch', 5, 5), 'unknown');
var words = ['off', 'water', 'built', 'ground', 'ore', 'shore', 'far', 'unknown'], seen = {};
words.forEach(function (w) { seen[g._rtsPlaceWhyText(w, 'power')] = 1; });
S.eq('every cause has a sentence of its own', Object.keys(seen).length, words.length);
S.ok('...and none of them is the old catch-all', !Object.keys(seen).some(function (t) { return /needs clear ground/.test(t); }), '');

/* ---------------- the rule ---------------- */
var disagree = 0, yes = 0, cells = 0, reasons = {};
['power', 'refinery', yardKey ? yardKey.key : 'power'].forEach(function (key) {
  for (var tz = -1; tz <= N; tz++) for (var tx = -1; tx <= N; tx++) {
    [false, true].forEach(function (any) {
      var can = g._rtsCanPlace('player', key, tx, tz, any), w = why(key, tx, tz, any);
      cells++; if (can) yes++; reasons[w] = 1;
      if (can !== (w === null) || (any && w === 'far')) disagree++;
    });
  }
});
S.ok('THE RULE: over the whole map the answer is exactly "no reason"', disagree === 0 && yes > 50 && cells > 90000, disagree + ' disagree of ' + cells + ', ' + yes + ' may be built');
S.ok('...and the walk met every cause on the way', ['off', 'water', 'built', 'ground', 'ore', 'shore', 'far'].every(function (w) { return reasons[w]; }), Object.keys(reasons).join(' '));

/* ---------------- the tabs ---------------- */
var T = g._rtsTabState;
S.eq('THE TABS: an empty line shows nothing', JSON.stringify(T({ q: {}, ready: null }, 'vehicle')), '{"st":"","p":0}');
S.eq('a line at work shows how far along', JSON.stringify(T({ q: { vehicle: { key: 'tank', prog: 0.426 } }, ready: null }, 'vehicle')), '{"st":"busy","p":42}');
S.eq('...and only on its own tab', JSON.stringify(T({ q: { vehicle: { key: 'tank', prog: 0.426 } }, ready: null }, 'infantry')), '{"st":"","p":0}');
S.eq('a line on hold says so', T({ q: { infantry: { key: 'rifle', prog: 0.2, hold: true } }, ready: null }, 'infantry').st, 'hold');
S.eq('a finished building waits on the Build tab', JSON.stringify(T({ q: {}, ready: 'power' }, 'struct')), '{"st":"ready","p":100}');
S.eq('...and not on the others', T({ q: {}, ready: 'power' }, 'vehicle').st, '');
S.eq('a share past the end is held to 100', T({ q: { ship: { key: 'gunboat', prog: 1.7 } } }, 'ship').p, 100);

/* ---------------- ready ---------------- */
function finish(side, key) {
  var Sd = G.sides[side]; Sd.money = 99999; Sd.ready = null;
  G.msg = null; G.msgT = 0;
  g._rtsQueue(side, key);
  for (var i = 0; i < 60 * 120 && Sd.q[g._rtsQueueCat(key)]; i++) g._rtsTickProduction(side, 1 / 60);
  return { msg: G.msg, ready: Sd.ready };
}
G.sides.enemy.ai.next = 1e9;
var built = finish('player', 'power');
S.ok('READY: a finished building is ready to place (population)', built.ready === 'power', JSON.stringify(built));
S.ok('...and says so, by name, and where to place it from', /Power Plant ready/.test(built.msg || '') && /Build tab/.test(built.msg || ''), JSON.stringify(built.msg));
g._rtsMBuild('player', 'barracks', y.tx + 4, y.tz + 4, 'b');
var squad = finish('player', 'rifle');
S.ok('a unit finishing does not', !/ready/.test(squad.msg || ''), JSON.stringify(squad.msg));
G.sides.player.ctl = 'ai'; G.sides.player.ai = g._rtsBrainNew();
G.sides.player.ready = null;
var bot = finish('player', 'power');
S.ok('...nor a building of a computer in the player\'s seat', bot.ready === 'power' && !/ready/.test(bot.msg || ''), JSON.stringify(bot));

require('../lib/report.js')(S);
