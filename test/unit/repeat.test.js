/* REPEAT (core/production.js, ui/repeat.js S.rep), headless, in a real battle:

     ONE OR MANY   a rifleman queued on a plain line is one rifleman; on a line set to repeat, the
                   line keeps making them, one after another, for as long as it runs
     ITS LINE      it is the line's: queue a different unit on a repeating line and that is what
                   comes next, again and again
     NOT BUILDINGS the Build line never repeats - a building waits for its placement
     NO BARRACKS   the barracks gone, the line stops: nothing more is started
     A SAVE        the setting is on the side, so a save carries it */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('repeat');
function world() {
  var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
  g._rtsNewGame(7, 'normal'); g.window._rtsUI = {};
  var G = g._rtsG, y = g._rtsHas('player', 'yard');
  G.sides.enemy.ctl = 'none';
  g._rtsMBuild('player', 'power', g._rtsTX(y.x), g._rtsTX(y.z) + 5, 'pow');
  g._rtsMBuild('player', 'barracks', g._rtsTX(y.x) + 5, g._rtsTX(y.z), 'bar');
  g._rtsRecalcPower('player');
  G.sides.player.credits = 20000;
  return g;
}
function count(g, key) { return g._rtsG.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.def === key; }).length; }
function run(g, secs) { for (var i = 0; i < 60 * secs; i++) g._rtsTick(1 / 60); }

/* ---------------- one or many ---------------- */
var a = world(), b = world(), ra0 = count(a, 'rifle'), rb0 = count(b, 'rifle');
a._rtsQueue('player', 'rifle');
b._rtsG.sides.player.rep = { infantry: true }; b._rtsQueue('player', 'rifle');
run(a, 60); run(b, 60);
var ra = count(a, 'rifle') - ra0, rb = count(b, 'rifle') - rb0;
S.ok('ONE OR MANY: a rifleman queued on a plain line is one; on a repeating line they keep coming', ra === 1 && rb >= 4 && !!b._rtsG.sides.player.q.infantry,
     JSON.stringify({ plain: ra, repeat: rb, building: b._rtsG.sides.player.q.infantry && b._rtsG.sides.player.q.infantry.key }));

/* ---------------- its line ---------------- */
var B = b._rtsG.sides.player, g0 = count(b, 'grenadier') + count(b, 'rocket');
/* the line cleared first: a busy line takes only more of what it is making */
b._rtsCancelAll('player', 'infantry'); b._rtsCancel('player', 'infantry');
var other = b.RTS_UNITS.filter(function (u) { return b._rtsQueueCat(u.key) === 'infantry' && u.key !== 'rifle' && b._rtsCanQueue('player', u.key); }).map(function (u) { return u.key; })[0];
b._rtsQueue('player', other);
var r0 = count(b, 'rifle'), o0 = count(b, other);
run(b, 60);
S.ok('ITS LINE: queue a different unit on a repeating line and that is what keeps coming', count(b, other) - o0 >= 2 && count(b, 'rifle') - r0 === 0 && B.q.infantry && B.q.infantry.key === other,
     JSON.stringify({ other: other, made: count(b, other) - o0, rifles: count(b, 'rifle') - r0 }));

/* ---------------- not buildings ---------------- */
var c = world(), C = c._rtsG.sides.player;
C.rep = { struct: true };
c._rtsQueue('player', 'power');
run(c, 40);
S.ok('NOT BUILDINGS: the Build line never repeats - the building waits to be placed and no second is started', C.ready === 'power' && !C.q.struct, JSON.stringify({ ready: C.ready, q: C.q.struct && C.q.struct.key }));

/* ---------------- no barracks ---------------- */
var bar = b._rtsMTagged(b._rtsG, 'bar')[0];
bar.hp = 0; b._rtsKill ? b._rtsKill(bar) : (bar.dead = true);
run(b, 30);
var o1 = count(b, other);
run(b, 30);
S.ok('NO BARRACKS: the line stops - nothing more is made, and nothing is left on it', !b._rtsHas('player', 'barracks') && count(b, other) === o1 && !B.q.infantry, JSON.stringify({ barracks: !!b._rtsHas('player', 'barracks'), q: B.q.infantry && B.q.infantry.key }));

/* ---------------- a save ---------------- */
var d = world(), D = d._rtsG.sides.player;
D.rep = { infantry: true }; d._rtsQueue('player', 'rifle'); run(d, 3);
var body = JSON.parse(JSON.stringify(d._rtsSaveState(d._rtsG)));
var e = world(); e._rtsApplyState(e._rtsG, body);
var E = e._rtsG.sides.player, re0 = count(e, 'rifle');
run(e, 40);
S.ok('A SAVE: the setting comes back, and the line goes on repeating', !!E.rep && E.rep.infantry === true && count(e, 'rifle') - re0 >= 3, JSON.stringify({ rep: E.rep, made: count(e, 'rifle') - re0 }));

require('../lib/report.js')(S);
