/* THE CAMPAIGN, HEADLESS, part two (rules/campaign.js): the two longer missions played both ways.

     ARMOUR BY AIR  the island is cut off: a tank ordered onto it is refused; the Sky Cranes lift
                    the tanks over, and they take the radar; lose the cranes and every tank still
                    on the mainland and the mission is lost
     THE CHANNEL    left alone, the flotilla sinks the Sub Pen; a player who keeps building
                    submarines at it holds the channel to the relief column */

var { Suite } = require('../lib/assert.js');
var { mission, play } = require('../lib/mission.js');

var S = new Suite('campaign-play');

/* ---------------- armour by air ---------------- */
var o = mission('skycrane'), g = o.g, G = o.G, M = o.M;
var lifts = g._rtsMTagged(G, 'lift'), arm = g._rtsMTagged(G, 'armour');
g._rtsTick(1 / 60);
g._rtsOrderMove(arm[0], g._rtsWX(M.isle.tx), g._rtsWX(M.isle.tz), false);
S.ok('Armour by Air: two cranes, four tanks, and a tank cannot drive onto the island', lifts.length === 2 && arm.length === 4 && (!arm[0].order || arm[0].order === 'idle'),
     JSON.stringify({ lifts: lifts.length, arm: arm.length, order: arm[0].order }));
var P = G.starts.player, d = Math.hypot(P.tx - M.isle.tx, P.tz - M.isle.tz);
var LX = Math.round(M.isle.tx + (P.tx - M.isle.tx) / d * 7), LZ = Math.round(M.isle.tz + (P.tz - M.isle.tz) / d * 7);
var boarded = lifts.map(function (l, k) { return g._rtsBoard(arm[k], l); });
play(o, 15);
lifts.forEach(function (l) { g._rtsOrderMove(l, g._rtsWX(LX), g._rtsWX(LZ), true); });
play(o, 30);
var dropped = lifts.map(function (l) { return g._rtsUnload(l, true); });
play(o, 5);
arm.filter(function (a) { return !a.dead && !a.inside; }).forEach(function (a) { var t = g._rtsMTagged(G, 'target')[0]; if (t) g._rtsOrderAttack(a, t); });
var r = play(o, 200);
S.ok('...the cranes lift the tanks over and they take the radar', boarded.every(Boolean) && dropped.every(function (n) { return n > 0; }) && r.over === 'win',
     JSON.stringify({ boarded: boarded, dropped: dropped, r: r }));
var o2 = mission('skycrane');
o2.g._rtsTick(1 / 60);
o2.g._rtsMTagged(o2.G, 'lift').forEach(function (l) { o2.g._rtsKillQuiet(l); l.dead = true; });
var r2 = play(o2, 2);
S.ok('...and with the cranes gone and every tank on the mainland it is lost', r2.over === 'lose', JSON.stringify(r2));

/* ---------------- the channel ---------------- */
var oi = mission('channel'), ri = play(oi, 480);
S.ok('The Channel: left alone, the flotilla sinks the Sub Pen', ri.over === 'lose' && !oi.g._rtsMTagged(oi.G, 'pen').length, JSON.stringify(ri));
var od = mission('channel'), rd = play(od, 490, function (i) { if (i % 2400 === 0) od.g._rtsQueue('player', 'sub'); });
S.ok('...building submarines at it holds the channel to the relief column', rd.over === 'win' && rd.t >= 480 && od.G.mission.obj.hold === 'done', JSON.stringify(rd));

require('../lib/report.js')(S);
