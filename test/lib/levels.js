/* test/lib/levels.js - the body of unit/campaign-levels to -levels5: every mission at every level it
   offers (core/campaign.js _rtsMissionLevels). The work is a list of checks - a mission's rule, one
   easier level, one harder level - dealt out across the parts so they run side by side, each
   inside the five minutes a unit spec is given (mutation-test kills it there).

     THE RULE      a mission offers its own level and every easier one, and a harder one only up to
                   its `top`; a level it does not offer falls back to its own
     THE SEATS     the level is every hostile seat's; the battle's, and an ally's, stay the mission's
     EASIER        at each easier level the intended play (test/lib/plays.js) still wins, and doing
                   nothing does not - for 620 s, past the longest mission's ten-minute clock
     HARDER        at EVERY level above its own the intended play loses - the harder enemy bites -
                   and the stronger play wins it */
var { Suite } = require('./assert.js');
var { mission, play } = require('./mission.js');
var { plays, strong } = require('./plays.js');

/* Every check, in an order that does not depend on the part: the rules first, then the easier
   levels, then the harder ones - the heavy ones, two games each on the biggest maps. */
function checks(g0) {
  var keys = Object.keys(g0.RTS_DIFF), out = [], easier = [], harder = [];
  g0.RTS_CAMPAIGN.forEach(function (m) {
    var lv = g0._rtsMissionLevels(m), own = keys.indexOf(m.diff);
    out.push({ m: m, kind: 'rule' });
    lv.forEach(function (k) {
      var i = keys.indexOf(k);
      if (i < own) easier.push({ m: m, k: k, kind: 'easier' });
      if (i > own) harder.push({ m: m, k: k, kind: 'harder' });
    });
  });
  return out.concat(easier, harder);
}

module.exports = function (part, of) {
  var S = new Suite(part ? 'campaign-levels' + (part + 1) : 'campaign-levels');
  var o0 = mission('lowwater'), g0 = o0.g, keys = Object.keys(g0.RTS_DIFF), all = g0.RTS_CAMPAIGN;
  var list = checks(g0);
  /* dealt out snake-wise - 0 1 2 3 4 4 3 2 1 0 - so no part draws two of the heavy ones at the end
     back to back */
  var mine = list.filter(function (c, i) { var p = i % (2 * of); return (p < of ? p : 2 * of - 1 - p) === part; });
  S.ok('every mission has an intended play, and every play a mission', all.every(function (m) { return !!plays[m.id]; }) &&
       Object.keys(plays).every(function (id) { return !!g0._rtsMissionOf(id); }), Object.keys(plays).join(' '));
  /* held from the other end: the harder levels are the ones measured (docs/core-world.md) - a
     `top` dropped or added without a stronger play here changes this */
  var harder = all.filter(function (m) { return keys.indexOf(m.top || m.diff) > keys.indexOf(m.diff); }).map(function (m) { return m.id + ':' + m.top; });
  S.ok('a harder level is offered exactly where, and as far as, one was measured to be won: the Channel and Two Fronts to Veteran, Mirror Line and Breachwater to Soldier',
       harder.join() === 'channel:hard,twofronts:hard,mirror:normal,breachwater:normal' && harder.every(function (x) { return !!strong[x.split(':')[0]]; }), harder.join());
  S.ok('this part has checks to make, and every check is in some part', mine.length >= 3 && list.length >= 20,
       mine.length + ' of ' + list.length + ': ' + mine.map(function (c) { return c.m.id + (c.k ? '@' + c.k : ''); }).join(' '));

  mine.forEach(function (c) {
    var m = c.m, lv = g0._rtsMissionLevels(m), own = keys.indexOf(m.diff), top = keys.indexOf(m.top || m.diff);
    if (c.kind === 'rule') {
      S.ok(m.id + ': offers its own level, every easier one, and up to its top', lv.join() === keys.slice(0, Math.max(own, top) + 1).join(), lv.join());
      /* a mission with no level above its own: gold is the intended play inside the par */
      if (top === own && m.par) { var rp = plays[m.id](mission(m.id)); S.ok('...and its intended play, at its own level, is inside the gold par of ' + m.par + ' s', rp.over === 'win' && rp.t <= m.par, rp.t + ' s'); }
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
    } else if (c.kind === 'easier') {
      var r = plays[m.id](mission(m.id, c.k)), idle = play(mission(m.id, c.k), 620);
      S.ok(m.id + ' at ' + c.k + ': the intended play still wins, and doing nothing does not', r.over === 'win' && idle.over !== 'win', JSON.stringify({ play: r, idle: idle }));
    } else {
      var ri = plays[m.id](mission(m.id, c.k)), rs = strong[m.id] && strong[m.id](mission(m.id, c.k));
      S.ok(m.id + ' at ' + c.k + ': the intended play loses, and the stronger one wins', ri.over === 'lose' && !!rs && rs.over === 'win', JSON.stringify({ intended: ri, strong: rs }));
      /* gold is this win: at the top level, inside the par, where there is one */
      if (c.k === lv[lv.length - 1] && m.par && rs) S.ok('...inside the gold par of ' + m.par + ' s', rs.over === 'win' && rs.t <= m.par, rs.t + ' s');
    }
  });
  return S;
};
