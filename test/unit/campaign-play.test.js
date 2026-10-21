/* THE CAMPAIGN, HEADLESS, part two (rules/campaign.js): the two longer missions played both ways.

     ARMOUR BY AIR  the island is cut off: a tank ordered onto it is refused; one crane load of two
                    tanks loses to the garrison, two loads take the radar; lose the cranes and every
                    tank still on the mainland and the mission is lost. At Veteran the stronger
                    play (test/lib/plays.js craneDrop) lands clear of the guns, which wins; buys two
                    more cranes and lifts all four at once, which wins inside the gold par; and
                    leaves the radar till last, without which the four lose
     THE CHANNEL    left alone, the flotilla sinks the Sub Pen; a player who keeps building
                    submarines at it (one every 40 s) holds the channel to the relief column, and
                    one every 80 s does not */

var { Suite } = require('../lib/assert.js');
var { mission, play } = require('../lib/mission.js');
var { craneDrop } = require('../lib/plays.js');

var S = new Suite('campaign-play');

/* ---------------- armour by air ---------------- */
var o = mission('skycrane'), g = o.g, G = o.G, M = o.M;
var lifts = g._rtsMTagged(G, 'lift'), arm = g._rtsMTagged(G, 'armour');
g._rtsTick(1 / 60);
g._rtsOrderMove(arm[0], g._rtsWX(M.isle.tx), g._rtsWX(M.isle.tz), false);
S.ok('Armour by Air: two cranes, four tanks, and a tank cannot drive onto the island', lifts.length === 2 && arm.length === 4 && (!arm[0].order || arm[0].order === 'idle'),
     JSON.stringify({ lifts: lifts.length, arm: arm.length, order: arm[0].order }));
/* lift `trips` loads of two, holding the landed tanks at the landing until the last, then attack */
function lift(o, trips) {
  var g = o.g, G = o.G, M = o.M, lifts = g._rtsMTagged(G, 'lift'), arm = g._rtsMTagged(G, 'armour'), log = { boarded: 0, dropped: 0 };
  var P = G.starts.player, d = Math.hypot(P.tx - M.isle.tx, P.tz - M.isle.tz);
  var LX = Math.round(M.isle.tx + (P.tx - M.isle.tx) / d * 7), LZ = Math.round(M.isle.tz + (P.tz - M.isle.tz) / d * 7);
  for (var n = 0; n < trips && !G.over; n++) {
    var left = arm.filter(function (a) { return !a.dead && !a.inside && !g._rtsMNear(a, M.isle.tx, M.isle.tz, 9); });
    lifts.forEach(function (l, k) { if (left[k] && g._rtsBoard(left[k], l)) log.boarded++; });
    play(o, 15);
    lifts.forEach(function (l) { g._rtsOrderMove(l, g._rtsWX(LX), g._rtsWX(LZ), true); });
    play(o, 30);
    lifts.forEach(function (l) { log.dropped += g._rtsUnload(l, true) || 0; });
    play(o, 5);
    lifts.forEach(function (l) { g._rtsOrderMove(l, arm[3].x, arm[3].z, true); });
    if (n + 1 < trips) play(o, 25);
  }
  arm.filter(function (a) { return !a.dead && !a.inside && g._rtsMNear(a, M.isle.tx, M.isle.tz, 12); }).forEach(function (a) { var t = g._rtsMTagged(G, 'target')[0]; if (t) g._rtsOrderAttack(a, t); });
  log.r = play(o, 330);   /* past the six-minute clock */
  return log;
}
var one = lift(o, 1);
S.ok('...one load of two tanks is not enough: the garrison kills them and the radar stands to the clock', one.boarded === 2 && one.dropped === 2 && one.r.over === 'lose',
     JSON.stringify(one));
var two = lift(mission('skycrane'), 2);
S.ok('...two loads, four tanks, take the radar', two.boarded === 4 && two.dropped === 4 && two.r.over === 'win', JSON.stringify(two));
var o2 = mission('skycrane');
o2.g._rtsTick(1 / 60);
o2.g._rtsMTagged(o2.G, 'lift').forEach(function (l) { o2.g._rtsKillQuiet(l); l.dead = true; });
var r2 = play(o2, 2);
S.ok('...and with the cranes gone and every tank on the mainland it is lost', r2.over === 'lose', JSON.stringify(r2));
var vs = craneDrop(mission('skycrane', 'hard'), { buy: 2, aim: 'guns' }), v2 = craneDrop(mission('skycrane', 'hard'), { buy: 0, aim: 'guns' });
var vr = craneDrop(mission('skycrane', 'hard'), { buy: 2, aim: 'radar' });
var vn = lift(mission('skycrane', 'hard'), 2);
S.ok('...at Veteran the two loads landed under the guns lose; landed clear of them, the two cranes win, but past the gold par; four tanks lifted at once win inside it; and the four lose going straight at the radar',
     vn.r.over === 'lose' && v2.over === 'win' && v2.t > o.m.par && vs.over === 'win' && vs.t <= o.m.par && vr.over === 'lose',
     JSON.stringify({ near: vn.r, two: v2, four: vs, radar: vr, par: o.m.par }));

/* ---------------- the channel ---------------- */
var oi = mission('channel'), ri = play(oi, 480);
S.ok('The Channel: left alone, the flotilla sinks the Sub Pen', ri.over === 'lose' && !oi.g._rtsMTagged(oi.G, 'pen').length, JSON.stringify(ri));
var od = mission('channel'), rd = play(od, 490, function (i) { if (i % 2400 === 0) od.g._rtsQueue('player', 'sub'); });
var os = mission('channel'), rs = play(os, 490, function (i) { if (i % 4800 === 0) os.g._rtsQueue('player', 'sub'); });
S.ok('...building submarines at it holds the channel to the relief column', rd.over === 'win' && rd.t >= 480 && od.G.mission.obj.hold === 'done', JSON.stringify(rd));
S.ok('...and building them at half that rate does not', rs.over === 'lose', JSON.stringify(rs));

require('../lib/report.js')(S);
