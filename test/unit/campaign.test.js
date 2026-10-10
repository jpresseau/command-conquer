/* THE CAMPAIGN, HEADLESS (rules/campaign.js, core/campaign.js), part one: the table, the setup,
   and the first two missions played both ways.

     THE TABLE      every mission names a real army, difficulty and seed, a brief and goals
     THE SETUP      laying a mission leaves the seats it does not want thinking at ctl 'none', and
                    the battle is NOT over on its first tick - the skirmish rule (lose every
                    building) would end the base-less ones at once; the mission check replaces it
     LOW WATER      the convoy cannot be ordered over the strait at high water; ordered at low
                    water it crosses and wins; left idle the tide runs out the clock and it loses
     FOG BANK       under the fog the strike group takes the yard; without it the fortress's ring
                    of guns outranges it and it is lost
   Sky Crane and the Channel are unit/campaign-play.test.js, so the two run side by side. */

var { Suite } = require('../lib/assert.js');
var { mission, play } = require('../lib/mission.js');

var S = new Suite('campaign');

/* ---------------- the table ---------------- */
var o0 = mission('lowwater'), g0 = o0.g;
S.eq('four missions', g0.RTS_CAMPAIGN.length, 4);
S.ok('each names a real army, difficulty and seed, a brief and its goals', g0.RTS_CAMPAIGN.every(function (m) {
  return g0.RTS_ARMY_SIDES.indexOf(m.army) >= 0 && !!g0.RTS_DIFF[m.diff] && m.seed > 0 && m.brief.length > 40 && m.goals.length >= 1;
}), g0.RTS_CAMPAIGN.map(function (m) { return m.id + ':' + m.army + '/' + m.diff; }).join(' '));
S.ok('...under distinct ids and seeds', new Set(g0.RTS_CAMPAIGN.map(function (m) { return m.id; })).size === 4 &&
     new Set(g0.RTS_CAMPAIGN.map(function (m) { return m.seed; })).size === 4, '');

/* ---------------- the setup ---------------- */
g0.RTS_CAMPAIGN.forEach(function (m) {
  var o = m.id === 'lowwater' ? o0 : mission(m.id);
  o.g._rtsTick(1 / 60);
  var goals = o.g._rtsMissionGoals(o.G);
  S.ok(m.id + ': laid, the enemy seat not thinking, and not over on its first tick', !!o.M && o.G.sides.enemy.ctl === 'none' && !o.G.over && goals.length === m.goals.length &&
       goals.every(function (x) { return typeof x.text === 'string' && x.text.length > 5 && !x.done && !x.failed; }),
       JSON.stringify({ M: !!o.M, ctl: o.G.sides.enemy.ctl, over: o.G.over, goals: goals }));
});

/* ---------------- low water ---------------- */
var o = mission('lowwater'), g = o.g, G = o.G, M = o.M, c = g._rtsMTagged(G, 'convoy');
S.eq('Low Water: the convoy is three', c.length, 3);
g._rtsTick(1 / 60);
function cross() { c.forEach(function (u) { g._rtsOrderMove(u, g._rtsWX(M.to.tx), g._rtsWX(M.to.tz), false); }); }
cross();
S.ok('...and at high water it cannot be ordered over the strait', c.every(function (u) { return !u.order || u.order === 'idle'; }), c.map(function (u) { return u.order; }).join(','));
var r = play(o, 250, function (i) { if (i === 60 * 130) cross(); });
S.ok('...ordered at low water it crosses and wins', r.over === 'win' && G.mission.obj.cross === 'done', JSON.stringify(r));
var oi = mission('lowwater'), ri = play(oi, 260);
S.ok('...left idle, the clock runs out and it is lost', ri.over === 'lose' && ri.t >= 250, JSON.stringify(ri));

/* ---------------- fog bank ---------------- */
['fog', 'nofog'].forEach(function (mode) {
  var o = mission('fogbank'), g = o.g, G = o.G, y = g._rtsMTagged(G, 'target')[0];
  g._rtsTick(1 / 60);
  var fired = mode === 'fog' ? g._rtsSuperFire('player', 'fogbank', y.tx + 1, y.tz + 1) : null;
  g._rtsMTagged(G, 'force').forEach(function (u) { g._rtsOrderAttack(u, y); });
  var r = play(o, 300);
  if (mode === 'fog') S.ok('Fog Bank: under the fog the strike group takes the yard', !!fired && r.over === 'win', JSON.stringify({ fired: fired, r: r }));
  else S.ok('...and without it the guns outrange the strike group and it is lost', r.over === 'lose', JSON.stringify(r));
});

require('../lib/report.js')(S);
