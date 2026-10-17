/* test/lib/plays.js - each campaign mission's intended play, headless, as the tuning measured it.

   One per mission id: `plays[id](o)` plays the mission laid by mission() to its end and returns
   play()'s result. unit/campaign-levels runs them at every level; the per-mission specs keep their
   own, longer stories (the alternatives that must lose). */
var { play } = require('./mission.js');

function sendAll(g, side, y, move) {
  g._rtsCampFighters(side).forEach(function (u) {
    if (u.target && !u.target.dead) return;
    if (move) g._rtsOrderMove(u, y.x + (u.id % 5 - 2) * 4, y.z + ((u.id / 5 | 0) % 3 - 1) * 4, true);
    else g._rtsOrderAttack(u, y);
  });
}

var plays = {
  /* the convoy goes over at low water */
  lowwater: function (o) {
    var g = o.g, G = o.G, M = o.M, c = g._rtsMTagged(G, 'convoy');
    return play(o, 260, function (i) {
      if (i === 60 * 130) c.forEach(function (u) { g._rtsOrderMove(u, g._rtsWX(M.to.tx), g._rtsWX(M.to.tz), false); });
    });
  },
  /* the fog on the fortress, then the strike group at its yard */
  fogbank: function (o) {
    var g = o.g, G = o.G, y = g._rtsMTagged(G, 'target')[0];
    g._rtsTick(1 / 60);
    g._rtsSuperFire('player', 'fogbank', y.tx + 1, y.tz + 1);
    g._rtsMTagged(G, 'force').forEach(function (u) { g._rtsOrderAttack(u, y); });
    return play(o, 300);
  },
  /* two crane loads of two tanks onto the island, then at the radar */
  skycrane: function (o) {
    var g = o.g, G = o.G, M = o.M, lifts = g._rtsMTagged(G, 'lift'), arm = g._rtsMTagged(G, 'armour');
    var P = G.starts.player, d = Math.hypot(P.tx - M.isle.tx, P.tz - M.isle.tz);
    var LX = Math.round(M.isle.tx + (P.tx - M.isle.tx) / d * 7), LZ = Math.round(M.isle.tz + (P.tz - M.isle.tz) / d * 7);
    g._rtsTick(1 / 60);
    for (var n = 0; n < 2 && !G.over; n++) {
      var left = arm.filter(function (a) { return !a.dead && !a.inside && !g._rtsMNear(a, M.isle.tx, M.isle.tz, 9); });
      lifts.forEach(function (l, k) { if (left[k]) g._rtsBoard(left[k], l); });
      play(o, 15);
      lifts.forEach(function (l) { g._rtsOrderMove(l, g._rtsWX(LX), g._rtsWX(LZ), true); });
      play(o, 30);
      lifts.forEach(function (l) { g._rtsUnload(l, true); });
      play(o, 5);
      lifts.forEach(function (l) { g._rtsOrderMove(l, arm[3].x, arm[3].z, true); });
      if (n < 1) play(o, 25);
    }
    arm.filter(function (a) { return !a.dead && !a.inside && g._rtsMNear(a, M.isle.tx, M.isle.tz, 12); })
       .forEach(function (a) { var t = g._rtsMTagged(G, 'target')[0]; if (t) g._rtsOrderAttack(a, t); });
    return play(o, 330);
  },
  /* a submarine at the Sub Pen every 40 s */
  channel: function (o) {
    return play(o, 490, function (i) { if (i % 2400 === 0) o.g._rtsQueue('player', 'sub'); });
  },
  /* the army kept at the ally's yard, a tank every 15 s */
  twofronts: function (o) {
    var g = o.g, G = o.G;
    return play(o, 430, function (i) {
      if (i % 900 === 7) g._rtsQueue('player', 'tank');
      var y = g._rtsMTagged(G, 'allyyard')[0];
      if (y && i % 1200 === 5) sendAll(g, 'player', y, true);
    });
  },
  /* the army at the Compact yard, a tank every 15 s */
  mirror: function (o) {
    var g = o.g, G = o.G;
    return play(o, 620, function (i) {
      if (i % 900 === 7) g._rtsQueue('player', 'tank');
      var y = g._rtsMTagged(G, 'target')[0];
      if (y && i % 1200 === 5) sendAll(g, 'player', y);
    });
  },
  /* the player at the first yard, the ally ordered at the second */
  orders: function (o) {
    var g = o.g, G = o.G;
    return play(o, 500, function (i) {
      var y = g._rtsMTagged(G, 'y1')[0] || g._rtsMTagged(G, 'y2')[0];
      if (y && i % 1200 === 5) sendAll(g, 'player', y);
      var y2 = g._rtsMTagged(G, 'y2')[0];
      if (y2 && i % 6000 === 10) g._rtsAllyCommand('attack', y2.x, y2.z);
    });
  },
  /* the same, building a tank and a rocket every 12 s */
  breachwater: function (o) {
    var g = o.g, G = o.G;
    return play(o, 610, function (i) {
      if (i % 720 === 7) { g._rtsQueue('player', 'tank'); g._rtsQueue('player', 'rocket'); }
      var y = g._rtsMTagged(G, 'y1')[0] || g._rtsMTagged(G, 'y2')[0];
      if (y && i % 1200 === 5) sendAll(g, 'player', y);
      var y2 = g._rtsMTagged(G, 'y2')[0] || g._rtsMTagged(G, 'y1')[0];
      if (y2 && i % 6000 === 10) g._rtsAllyCommand('attack', y2.x, y2.z);
    });
  }
};
/* The stronger plays that win a mission at the `top` above its own level, where the intended one
   loses: a submarine every 30 s, not 40; a tank and a rocket every 8 s, not a tank every 15. */
var strong = {
  channel: function (o) {
    return play(o, 490, function (i) { if (i % 1800 === 0) o.g._rtsQueue('player', 'sub'); });
  },
  twofronts: function (o) {
    var g = o.g, G = o.G;
    return play(o, 430, function (i) {
      if (i % 480 === 7) { g._rtsQueue('player', 'tank'); g._rtsQueue('player', 'rocket'); }
      var y = g._rtsMTagged(G, 'allyyard')[0];
      if (y && i % 1200 === 5) sendAll(g, 'player', y, true);
    });
  }
};
module.exports = { plays: plays, strong: strong, sendAll: sendAll };
