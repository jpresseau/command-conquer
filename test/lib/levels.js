/* test/lib/levels.js - the body of unit/campaign-levels and unit/campaign-levels2: every mission at
   every level it offers (core/campaign.js _rtsMissionLevels), half the missions in each spec so the
   two run side by side.

     THE RULE      a mission offers its own level and every easier one, and a harder one only up to
                   its `top`; a level it does not offer falls back to its own
     THE SEATS     the level is every hostile seat's; the battle's, and an ally's, stay the mission's
     EASIER        at each easier level the intended play (test/lib/plays.js) still wins, and doing
                   nothing for fifteen minutes still does not
     HARDER        at its `top` the intended play loses - the harder enemy bites - and the stronger
                   play wins it */
var { Suite } = require('./assert.js');
var { mission, play } = require('./mission.js');
var { plays, strong } = require('./plays.js');

module.exports = function (part, of) {
  var S = new Suite(part ? 'campaign-levels' + (part + 1) : 'campaign-levels');
  var o0 = mission('lowwater'), g0 = o0.g, keys = Object.keys(g0.RTS_DIFF), all = g0.RTS_CAMPAIGN;
  var mine = all.filter(function (m, i) { return i % of === part; });
  S.ok('every mission has an intended play, and every play a mission', all.every(function (m) { return !!plays[m.id]; }) &&
       Object.keys(plays).every(function (id) { return !!g0._rtsMissionOf(id); }), Object.keys(plays).join(' '));
  /* held from the other end: the harder levels are the ones measured (docs/core-world.md) - a
     `top` dropped or added without a stronger play here changes this */
  var harder = all.filter(function (m) { return keys.indexOf(m.top || m.diff) > keys.indexOf(m.diff); }).map(function (m) { return m.id; });
  S.ok('a harder level is offered exactly where one was measured to be won: the Channel and Two Fronts', harder.join() === 'channel,twofronts' &&
       harder.every(function (id) { return !!strong[id]; }), harder.join());
  S.ok('this part plays some missions', mine.length >= 3, mine.map(function (m) { return m.id; }).join(' '));

  mine.forEach(function (m) {
    var lv = g0._rtsMissionLevels(m), own = keys.indexOf(m.diff), top = keys.indexOf(m.top || m.diff);
    S.ok(m.id + ': offers its own level, every easier one, and up to its top', lv.join() === keys.slice(0, Math.max(own, top) + 1).join(), lv.join());

    /* the seats, at the furthest level from its own it offers */
    var far = lv[lv.length - 1] !== m.diff ? lv[lv.length - 1] : lv[0], o = mission(m.id, far), G = o.G;
    var foes = G.order.filter(function (k) { return o.g._rtsHostile('player', k); }), friends = G.order.filter(function (k) { return k !== 'player' && !o.g._rtsHostile('player', k); });
    S.ok('...at ' + far + ' every hostile seat plays at it, the battle and any ally at ' + m.diff,
         o.M.lvl === far && G.diff === m.diff && foes.every(function (k) { return o.g._rtsBias(k) === o.g.RTS_DIFF[far]; }) &&
         friends.every(function (k) { return o.g._rtsBias(k) === o.g.RTS_DIFF[m.diff]; }),
         JSON.stringify({ lvl: o.M.lvl, diff: G.diff, foes: foes, friends: friends }));
    var off = keys.filter(function (k) { return lv.indexOf(k) < 0; })[0];
    var got = off && mission(m.id, off).M.lvl;
    if (off) S.ok('...and asked for ' + off + ', which it does not offer, it plays at its own', got === m.diff, 'played at ' + got);

    lv.slice(0, own).forEach(function (k) {
      var r = plays[m.id](mission(m.id, k)), idle = play(mission(m.id, k), 900);
      S.ok('...at ' + k + ' the intended play still wins, and doing nothing does not', r.over === 'win' && idle.over !== 'win', JSON.stringify({ play: r, idle: idle }));
    });
    if (top > own) {
      var hk = keys[top], ri = plays[m.id](mission(m.id, hk)), rs = strong[m.id] && strong[m.id](mission(m.id, hk));
      S.ok('...at ' + hk + ' the intended play loses, and the stronger one wins', ri.over === 'lose' && !!rs && rs.over === 'win', JSON.stringify({ intended: ri, strong: rs }));
    }
  });
  return S;
};
