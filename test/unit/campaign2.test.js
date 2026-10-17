/* THE CAMPAIGN'S SECOND HALF, HEADLESS (rules/campaign2.js), part one: missions five to seven,
   each played the way it is meant to be and left alone.

     TWO FRONTS     idle, the waves break the ally's yard well before the seven minutes; an army
                    kept at the ally's base, topped up with tanks, holds it to the end
     MIRROR         on the mirrored map, an army sent at the Dominion yard and topped up takes it;
                    idle, the clock runs out (the AI left thinking does not do it for you)
     ORDERS         the two fortified yards fall when the ally is ORDERED at the second; the
                    player's army alone takes one and runs out of time; idle loses
   The finale is unit/campaign3.test.js, so the two run side by side. Every mission is seeded, so
   each outcome is the same every run; the times are printed so a retune shows in the log. */

var { Suite } = require('../lib/assert.js');
var { mission, play } = require('../lib/mission.js');

var S = new Suite('campaign2');

/* every `every` seconds, `fn` - from the play loop's frame count */
function each(i, every, at) { return i % (60 * every) === at; }
function sendAll(g, y, move) {
  g._rtsCampFighters('player').forEach(function (u) {
    if (u.target && !u.target.dead) return;
    if (move) g._rtsOrderMove(u, y.x + (u.id % 5 - 2) * 4, y.z + ((u.id / 5 | 0) % 3 - 1) * 4, true);
    else g._rtsOrderAttack(u, y);
  });
}

/* ---------------- two fronts ---------------- */
var ti = mission('twofronts'), rti = play(ti, 430);
S.ok('Two Fronts: idle, the ally\'s yard falls inside the seven minutes', rti.over === 'lose' && rti.t < 400 && !ti.g._rtsMTagged(ti.G, 'allyyard').length, JSON.stringify(rti));
var td = mission('twofronts'), rtd = play(td, 430, function (i) {
  if (each(i, 15, 7)) td.g._rtsQueue('player', 'tank');
  var y = td.g._rtsMTagged(td.G, 'allyyard')[0];
  if (y && each(i, 20, 5)) sendAll(td.g, y, true);
});
S.ok('...an army kept at the ally\'s base holds it to the end', rtd.over === 'win' && rtd.t >= 420, JSON.stringify(rtd));

/* ---------------- mirror ---------------- */
var mi = mission('mirror');
S.ok('Mirror: the battle is the mirrored map', !!mi.G.skirmish && mi.G.skirmish.layout === 'mirror', JSON.stringify(mi.G.skirmish || null));
var rmi = play(mi, 620);
S.ok('...idle, the clock runs out (or the yard falls) and it is lost', rmi.over === 'lose', JSON.stringify(rmi));
/* idle, the Compact's army takes the yard before the clock runs out, so the clock is asked here */
var mc = mission('mirror'); play(mc, 5); mc.G.t = 601;
var rmc = mc.g._rtsMissionOf('mirror').check(mc.G, mc.G.mission, 1 / 60);
S.ok('...and past ten minutes, with both yards standing, it is lost on the clock', !!rmc && rmc.over === 'lose' && mc.G.mission.obj.yard === 'failed', JSON.stringify(rmc));
var ma = mission('mirror'), rma = play(ma, 620, function (i) {
  if (each(i, 15, 7)) ma.g._rtsQueue('player', 'tank');
  var y = ma.g._rtsMTagged(ma.G, 'target')[0];
  if (y && each(i, 20, 5)) sendAll(ma.g, y);
});
S.ok('...an army sent at the Dominion yard and topped up takes it', rma.over === 'win', JSON.stringify(rma));

/* ---------------- orders ---------------- */
function orders(withAlly) {
  var o = mission('orders'), g = o.g, G = o.G;
  var r = play(o, 500, function (i) {
    var y = g._rtsMTagged(G, 'y1')[0] || g._rtsMTagged(G, 'y2')[0];
    if (y && each(i, 20, 5)) sendAll(g, y);
    var y2 = g._rtsMTagged(G, 'y2')[0];
    if (withAlly && y2 && each(i, 100, 10)) g._rtsAllyCommand('attack', y2.x, y2.z);
  });
  return { r: r, y1: g._rtsMTagged(G, 'y1').length, y2: g._rtsMTagged(G, 'y2').length, allyThinks: G.sides.ally.ctl };
}
var ob = orders(true), oa = orders(false), oi = mission('orders'), roi = play(oi, 500);
S.ok('Orders: the ally waits for its orders (it thinks nothing of its own)', ob.allyThinks === 'none', ob.allyThinks);
S.ok('...ordered at the second yard while the player takes the first, both fall', ob.r.over === 'win' && !ob.y1 && !ob.y2, JSON.stringify(ob));
S.ok('...the player\'s army alone takes one and runs out of time', oa.r.over === 'lose' && oa.y2 === 1, JSON.stringify(oa));
S.ok('...idle, it is lost', roi.over === 'lose', JSON.stringify(roi));

require('../lib/report.js')(S);
