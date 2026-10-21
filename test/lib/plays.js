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
  /* the trade: a refinery and a barracks where the AI would put them, three riflemen, then everyone at the post */
  bootcamp: function (o) {
    var g = o.g, G = o.G, S = G.sides.player, plan = ['refinery', 'barracks'], men = 0;
    return play(o, 400, function (i) {
      if (S.ready && i % 30 === 0) { var k = S.ready; if (g._rtsAIAs('player', function () { return g._rtsAIPlace(k); })) { S.ready = null; S.readyPaid = null; } }
      if (!S.ready && !S.q.struct && plan.length && i % 60 === 3 && g._rtsQueue('player', plan[0])) plan.shift();
      if (!plan.length && men < 3 && !S.q.infantry && i % 60 === 7 && g._rtsQueue('player', 'rifle')) men++;
      var post = g._rtsMTagged(G, 'post')[0];
      if (men >= 3 && !S.q.infantry && post && i % 600 === 5) g._rtsCampFighters('player').forEach(function (u) { if (!u.target || u.target.dead) g._rtsOrderAttack(u, post); });
    });
  },
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
/* A PLAYER WHO BUILDS A BASE, for the awake missions: the AI's own placement for each building
   the plan finishes (a second refinery first, then power and guns), units out of what is left
   over the next building's price, and an army held at home until it is `hold` strong (`guard` of
   it kept back), then attack-moved at `target()` and turned on it once there. And from `from`
   seconds a RAIDING PARTY - its first `raid` tanks - hunting the foes' harvesters: an opponent
   repairs only while it has money (aisupers.js, over half its 1000 reserve), so a starved one
   stops mending its yard. Without the raid the builder held Mirror Line's base at Regular but never
   broke the yard; with it, it wins both awake missions at Regular and at Soldier. */
function builder(o, opt) {
  var g = o.g, G = o.G, S = G.sides.player, side = g.rtsHouseSide('player');
  var DEF = side === 'soviet' ? ['flametower', 'tesla'] : ['turret', 'pillbox'];
  var plan = ['refinery', 'power', DEF[0], DEF[0], DEF[1], 'refinery', 'power', DEF[0], DEF[1], DEF[0]];
  var UNITS = side === 'soviet' ? ['tank', 'v2rl', 'rifle'] : ['tank', 'rocket', 'rifle'];
  var home = g._rtsHas('player', 'yard'), go = false, raiders = [], guard = opt.guard || 4;
  function nextCost() { return plan.length && !S.q.struct && !S.ready ? g._rtsCostOf('player', g.rtsStructDef(plan[0])) : 0; }
  function harvs() { return G.ents.filter(function (e) { return !e.dead && g._rtsHostile('player', e.side) && e.type === 'unit' && g.rtsUnitDef(e.def).harvest; }); }
  return play(o, opt.secs, function (i) {
    /* placed, the slot is cleared by the caller - as the AI's own loop does (aisupers.js) */
    if (S.ready && i % 30 === 0) { var k = S.ready; if (g._rtsAIAs('player', function () { return g._rtsAIPlace(k); })) { S.ready = null; S.readyPaid = null; } }
    if (!S.ready && !S.q.struct && plan.length && i % 60 === 3) { var nx = plan[0]; if (g._rtsWhyLocked('player', nx)) plan.shift(); else if (g._rtsQueue('player', nx)) plan.shift(); }
    if (i % 60 === 7) UNITS.forEach(function (u) {
      var c = g._rtsQueueCat(u), cost = g._rtsCostOf('player', g.rtsUnitDef(u));
      if (!S.q[c] && g.rtsMoney(S) - nextCost() >= cost) g._rtsQueue('player', u);
    });
    if (i % 600 !== 5) return;
    var f = g._rtsCampFighters('player'), y = opt.target();
    raiders = raiders.filter(function (u) { return !u.dead; });
    if (opt.raid && G.t >= opt.from) f.forEach(function (u) { if (raiders.length < opt.raid && u.def === 'tank' && raiders.indexOf(u) < 0) raiders.push(u); });
    var hv = raiders.length ? harvs() : [];
    raiders.forEach(function (u) {
      if (u.target && !u.target.dead && hv.indexOf(u.target) >= 0) return;
      var best = null, bd = 1e9;
      hv.forEach(function (h) { var d = Math.hypot(h.x - u.x, h.z - u.z); if (d < bd) { bd = d; best = h; } });
      if (best) g._rtsOrderAttack(u, best);
    });
    var army = f.filter(function (u) { return raiders.indexOf(u) < 0; });
    if (!go && army.length >= opt.hold) go = true;
    if (go && army.length < guard + 2) go = false;                    /* spent: gather again */
    army.sort(function (a, b) { return a.id - b.id; });
    army.forEach(function (u, n) {
      if (u.target && !u.target.dead) return;
      if (go && y && n >= guard) { if (Math.hypot(u.x - y.x, u.z - y.z) > 8 * g.RTS_TILE) g._rtsOrderMove(u, y.x, y.z, true); else g._rtsOrderAttack(u, y); }
      else if (home && !home.dead) g._rtsOrderMove(u, home.x + (u.id % 5 - 2) * 3, home.z + ((u.id / 5 | 0) % 3 - 1) * 3, true);
    });
    if (opt.each) opt.each(i);                                       /* on the army's ticks, after it */
  });
}

/* ARMOUR BY AIR, PLAYED HARDER: `buy` more Sky Cranes from the airfield first (1300 each, of the
   3000 the mission starts with), then as many lifts as it takes, every load to the island's dry
   cell furthest outside its guns' reach, not the near shore under them; ashore, the tanks fight
   together - `aim` 'guns' taking the garrison when it comes, then the nearest gun, then the radar,
   'radar' going straight at it. */
function craneDrop(o, opt) {
  var g = o.g, G = o.G, M = o.M, S = G.sides.player, arm = g._rtsMTagged(G, 'armour'), P = G.starts.player;
  function guns() { return G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'struct' && g.rtsStructDef(e.def).weapon; }); }
  function cranes() { return G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.def === 'skycrane'; }); }
  function ashore() { return arm.filter(function (a) { return !a.dead && !a.inside && g._rtsMNear(a, M.isle.tx, M.isle.tz, 12); }); }
  var lz = null, clear = -1e9;
  for (var dz = -8; dz <= 8; dz++) for (var dx = -8; dx <= 8; dx++) {
    var X = M.isle.tx + dx, Z = M.isle.tz + dz;
    if (Math.hypot(dx, dz) > 8 || g._rtsBlocked(X, Z, 'land')) continue;
    var c = Math.min.apply(null, guns().map(function (e) { return Math.hypot(e.x - g._rtsWX(X), e.z - g._rtsWX(Z)) - g.RTS_WEAPONS[g.rtsStructDef(e.def).weapon].range; }));
    if (c > clear) { clear = c; lz = { x: g._rtsWX(X), z: g._rtsWX(Z) }; }
  }
  function fight(i) {
    var side = ashore(), t = g._rtsMTagged(G, 'target')[0], cx = 0, cz = 0;
    if (i % 60 || !side.length) return;
    side.forEach(function (a) { cx += a.x / side.length; cz += a.z / side.length; });
    function near(l) { var b = null, d = 1e9; l.forEach(function (e) { var k = Math.hypot(e.x - cx, e.z - cz); if (k < d) { d = k; b = e; } }); return b; }
    var gar = near(g._rtsMTagged(G, 'garrison')), gun = near(guns());
    var goal = opt.aim === 'radar' ? t : (gar && Math.hypot(gar.x - cx, gar.z - cz) < 30 ? gar : gun || t);
    side.forEach(function (a) { if (goal && a.target !== goal) g._rtsOrderAttack(a, goal); });
  }
  g._rtsTick(1 / 60);
  for (var i = 0, bought = 0; i < 60 * 120 && cranes().length < 2 + opt.buy; i++) {
    if (i % 30 === 0 && bought < opt.buy && !S.q[g._rtsQueueCat('skycrane')] && g._rtsQueue('player', 'skycrane')) bought++;
    g._rtsTick(1 / 60);
  }
  for (var n = 0; n < 4 && !G.over; n++) {
    var left = arm.filter(function (a) { return !a.dead && !a.inside && !g._rtsMNear(a, M.isle.tx, M.isle.tz, 9); }), cs = cranes();
    if (!left.length) break;
    cs.forEach(function (l, k) { if (left[k]) g._rtsBoard(left[k], l); });
    play(o, 15, fight);
    cs.forEach(function (l, k) { g._rtsOrderMove(l, lz.x + (k % 2) * 6 - 3, lz.z + (k >> 1) * 6 - 3, true); });
    play(o, 30, fight);
    cs.forEach(function (l) { g._rtsUnload(l, true); });
    play(o, 5, fight);
    cs.forEach(function (l) { g._rtsOrderMove(l, g._rtsWX(P.tx), g._rtsWX(P.tz), true); });
    play(o, 25, fight);
  }
  return play(o, 360, fight);
}

/* The stronger plays that win a mission at the `top` above its own level, where the intended one
   loses: on Armour by Air two more cranes and one lift; a submarine every 30 s, not 40; a tank and a rocket every 8 s, not a tank every 15; and
   on the awake missions a base built, the foes starved and an army massed (builder, above). */
var strong = {
  /* six raiders, the army going at 22: from the first minute at Regular, the second at Soldier.
     With veterancy one start time does not win both - from 120 s lost Regular on the clock, from
     60 s lost Soldier - so the play is measured per level, as each level it offers must be won */
  mirror: function (o) {
    var g = o.g, G = o.G;
    return builder(o, { secs: 620, target: function () { return g._rtsMTagged(G, 'target')[0]; }, hold: 22, raid: 6, from: o.M.lvl === 'regular' ? 60 : 120 });
  },
  /* two economies to starve, so eight raiders from the first minute; the army goes at 32 */
  breachwater: function (o) {
    var g = o.g, G = o.G;
    return builder(o, { secs: 620, target: function () { return g._rtsMTagged(G, 'y1')[0] || g._rtsMTagged(G, 'y2')[0]; }, hold: 32, raid: 8, from: 60,
      each: function (i) { var y2 = g._rtsMTagged(G, 'y2')[0] || g._rtsMTagged(G, 'y1')[0]; if (y2 && i % 6000 === 5) g._rtsAllyCommand('attack', y2.x, y2.z); } });
  },
  /* two more cranes, all four tanks in one lift, ashore out of the guns' reach */
  skycrane: function (o) { return craneDrop(o, { buy: 2, aim: 'guns' }); },
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
module.exports = { plays: plays, strong: strong, sendAll: sendAll, builder: builder, craneDrop: craneDrop };
