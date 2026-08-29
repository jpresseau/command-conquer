/* The per-tick spatial index — core/spatial.js.

   WHY THIS FILE EXISTS. Target acquisition used to walk the whole entity list, per armed unit,
   per tick. Measured with two armies standing in front of each other, that was 78% of the
   simulation's entire cost at 320 units, and _rtsTick alone took 27ms of a 16.7ms frame on a
   desktop-class CPU. The index makes each scan look at a few buckets instead.

   The per-candidate test inside each caller is UNCHANGED. So the whole change is safe if and
   only if one property holds: THE BUCKETED LIST NEVER OMITS A CANDIDATE THE FULL LIST WOULD
   HAVE OFFERED, and hands them over in the same order. Extra candidates are harmless — the
   caller's own test throws them out. A missing one is a unit that does not shoot back.

   Everything below is that property, taken apart into the ways it can break. The end-to-end
   half — the same question asked of the real _rtsFindTarget, every tick of a real battle —
   is test/e2e/spatial.test.js. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('spatial');
var g = load(['src/rules', 'src/core']);

/* A deterministic stream, so a failure here is reproducible rather than a coin toss. */
function rng(seed) {
  var s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function world(ents) {
  g.window._rtsG = { ents: ents, byId: {}, t: 0 };
  ents.forEach(function (e, i) { e.id = i + 1; g.window._rtsG.byId[e.id] = e; });
  g._rtsSpBuild();
  return g.window._rtsG;
}
function unit(x, z, extra) {
  return Object.assign({ type: 'unit', def: 'rifle', side: 'player', x: x, z: z, dead: false }, extra || {});
}
function struct(def, x, z, extra) {
  return Object.assign({ type: 'struct', def: def, side: 'enemy', x: x, z: z, dead: false }, extra || {});
}

/* ------------------------------------------------------------------ the pad ----
   A scan asks for a radius; the index has to reach further than that, because two things let a
   candidate matter from outside the radius the caller named. Both are roster numbers, so both
   can be raised by an edit to rules/ that has no idea this file exists — which is the whole
   reason they are pinned here rather than trusted. */
(function () {
  S.ok('the pad covers the reach standing on high ground buys',
       g.RTS_SP_ELEV >= g.RTS_ELEV_MAX * g.RTS_ELEV_RANGE,
       'pad ' + g.RTS_SP_ELEV + ' vs max elevation bonus ' +
       (g.RTS_ELEV_MAX * g.RTS_ELEV_RANGE).toFixed(2));

  /* The index is built at the top of the tick and entities move during it — _rtsSteer inside
     the entity loop, _rtsSeparate after it. dt is clamped to 0.1 in _rtsTick, so the furthest
     anything travels in one tick is the fastest speed in the roster times that. */
  var fast = 0, fastest = '';
  g.RTS_UNITS.forEach(function (u) { if (u.speed > fast) { fast = u.speed; fastest = u.key; } });
  S.ok('the pad covers how far the fastest thing in the game moves in one tick',
       g.RTS_SP_MOVE >= fast * 0.1,
       'pad ' + g.RTS_SP_MOVE + ' vs ' + fastest + ' at ' + fast + '/s x dt 0.1 = ' + (fast * 0.1));

  /* ...and a separation shove on top of it. _rtsSeparate moves a unit by at most half the sum
     of two radii in one pass, so the headroom left over has to cover the widest pair. */
  var wide = 0;
  g.RTS_UNITS.forEach(function (u) { if (u.r > wide) wide = u.r; });
  S.ok('...with room left for a separation shove', g.RTS_SP_MOVE - fast * 0.1 >= wide,
       'headroom ' + (g.RTS_SP_MOVE - fast * 0.1).toFixed(2) + ' vs widest radius ' + wide);
})();

/* --------------------------------------------------------------- completeness ----
   The property itself, over random layouts: everything within r of the query point has to come
   back, and in entity-list order. Radii are swept from a crusher's cell and a half up to the
   longest gun in the game. */
(function () {
  var r = rng(20260829), bad = 0, empties = 0, checked = 0, worst = null, over = 0, tot = 0;
  for (var trial = 0; trial < 60; trial++) {
    var n = 8 + ((r() * 90) | 0), ents = [];
    var spread = 40 + r() * 400;
    for (var i = 0; i < n; i++) ents.push(unit((r() - 0.5) * spread, (r() - 0.5) * spread));
    world(ents);
    for (var q = 0; q < 12; q++) {
      var qx = (r() - 0.5) * spread, qz = (r() - 0.5) * spread, rad = 4 + r() * 34;
      var got = g._rtsSpNear(qx, qz, rad, 0);
      if (!got) { empties++; continue; }
      var idx = new Set(got);
      var want = ents.filter(function (e) { return Math.hypot(e.x - qx, e.z - qz) <= rad; });
      checked++;
      tot += ents.length; over += got.length;
      for (var w = 0; w < want.length; w++) {
        if (!idx.has(want[w])) { bad++; if (!worst) worst = { trial: trial, q: q, rad: rad }; }
      }
      /* order, which _rtsFindTarget's "first best score wins" depends on */
      var last = -1;
      for (var j = 0; j < got.length; j++) {
        var at = ents.indexOf(got[j]);
        if (at <= last) { bad++; if (!worst) worst = { order: true, trial: trial }; }
        last = at;
      }
    }
  }
  S.eq('no query ever dropped a candidate inside its radius', bad, 0);
  S.ok('...over a meaningful number of them', checked >= 600 && !empties,
       checked + ' queries, ' + empties + ' with no index');
  /* Deliberately NOT an assertion about how much the list shrank. The layouts above are random
     and cramped - up to 98 units on a field as small as 40 world units, asked for radii up to
     38 - so a query really does cover most of them, and a threshold here would be grading this
     test's own geometry rather than the index. What it costs is measured on a battle, below
     and in test/e2e/spatial. */
  S.note('over ' + checked + ' random queries, a scan saw ' +
         (100 * over / tot).toFixed(0) + '% of the entity list — on layouts far tighter than a map');
  if (worst) S.note('first failure: ' + JSON.stringify(worst));
})();

/* -------------------------------------------------------------- and it narrows ----
   The point of the whole file, on the geometry it was built for: an army spread over a real
   map, asked for the reach of a real gun. Anything close to 100% here means the buckets are
   not doing their job and every caller is paying for the index without being paid back. */
(function () {
  var r = rng(4242), ents = [], span = 128 * g.RTS_TILE;
  for (var i = 0; i < 240; i++) ents.push(unit((r() - 0.5) * span, (r() - 0.5) * span));
  world(ents);
  var seen = 0, n = 0;
  for (i = 0; i < ents.length; i++) {
    var got = g._rtsSpNear(ents[i].x, ents[i].z, 22, g.RTS_SP_ELEV);
    if (got) { seen += got.length; n++; }
  }
  var pct = 100 * seen / (n * ents.length);
  S.ok('a gun-range scan over a map-sized army looks at a small slice of it', pct < 12,
       n + ' scans saw ' + (seen / n).toFixed(1) + ' of ' + ents.length + ' entities on average (' +
       pct.toFixed(1) + '%)');
})();

/* ------------------------------------------------------------ buildings by edge ----
   _rtsRangeTo measures to a structure's EDGE, so a 3x3 whose centre is out of reach can still
   be a legal target. The pad does not cover that at all: structures are filed into every
   bucket their footprint touches, which is exact and free because they never move. Remove that
   branch from _rtsSpFile and this is the assertion that goes red. */
(function () {
  /* Every building in the roster today is 3x3 or smaller, and RTS_SP_MOVE alone already
     reaches past a 3x3's edge - so a spec written against the real roster would pass with the
     footprint branch deleted, which is exactly what it did on the first draft. The roster is
     therefore given something big enough for the two mechanisms to disagree, which is also the
     case worth defending: the footprint branch exists so that adding a bigger building does
     not silently need the pad widened for everything else. */
  var HUGE = { key: '_spec_huge', name: 'Spec Fixture', w: 9, h: 9, hp: 100, cost: 0 };
  g.RTS_STRUCTS.push(HUGE);
  var half = HUGE.w * g.RTS_TILE / 2;                        /* 18 world units */
  var b = struct(HUGE.key, 0, 0), field = [b];
  /* enough scattered units that cells.size stays above the query box, or _rtsSpNear takes its
     map-wide shortcut and hands back the whole list - which finds the building for the wrong
     reason. That is how this spec first passed with the branch removed. */
  for (var i = 0; i < 120; i++) field.push(unit(((i * 37) % 60) * 9 - 260, ((i * 53) % 60) * 9 - 260));
  world(field);
  var d = half + 4;                                          /* outside centre+pad, inside the wall */
  var got = g._rtsSpNear(d, 0, 0.5, 0);
  S.ok('a building is found from beside it, not only from its centre',
       got && got !== g.window._rtsG.ents && got.indexOf(b) >= 0,
       HUGE.w + 'x' + HUGE.h + ', asked from ' + d.toFixed(1) + ' away with a radius of 0.5 — ' +
       'further than RTS_SP_MOVE (' + g.RTS_SP_MOVE + ') can reach on its own');
  g.RTS_STRUCTS.pop();
})();

/* ------------------------------------------------------------------- staleness ----
   Buckets hold ORDINALS — positions in G.ents — so one splice makes every ordinal past it
   point at the wrong entity, and the last few point past the end of the list. _rtsTick reaps
   its dead at the very bottom, after every scan has run, so this never bites mid-tick. It bit
   the moment anything asked BETWEEN ticks, which is how it was found: a probe calling
   _rtsFindTarget after a tick threw on `undefined.dead`. */
(function () {
  var ents = [];
  for (var i = 0; i < 20; i++) ents.push(unit(i * 3, 0));
  var G = world(ents);
  S.ok('a fresh index answers', !!g._rtsSpNear(0, 0, 10, 0), 'before any mutation');

  G.ents.splice(4, 1);
  S.eq('...and refuses once the entity list has been spliced under it',
       g._rtsSpNear(0, 0, 10, 0), null);

  /* A spawn mid-tick is the one mutation the index can absorb, because it only appends.
     Over a field wide enough that _rtsSpNear cannot fall back on its map-wide shortcut, which
     would find the new unit whether it was filed or not. */
  var field = [];
  for (i = 0; i < 150; i++) field.push(unit(((i * 41) % 50) * 11 - 260, ((i * 61) % 50) * 11 - 260));
  world(field);
  G = g.window._rtsG;
  var fresh = unit(0.5, 0.5);
  G.ents.push(fresh);
  g._rtsSpAdd(fresh);
  var got = g._rtsSpNear(0.5, 0.5, 2, 0);
  S.ok('a unit created during the tick is visible to the rest of that tick',
       got && got !== G.ents && got.indexOf(fresh) >= 0,
       got ? (got === G.ents ? 'the whole list, so this proved nothing'
                             : 'found among ' + got.length + ' candidates')
           : 'index refused');
})();

/* ------------------------------------------------------------ the map-wide case ----
   A radius that covers the map is not worth bucketing — collecting every cell one Map lookup
   at a time is slower than the list it would rebuild. */
(function () {
  var ents = [];
  for (var i = 0; i < 30; i++) ents.push(unit((i % 6) * 8, ((i / 6) | 0) * 8));
  var G = world(ents);
  S.ok('a radius wider than the map hands back the entity list itself',
       g._rtsSpNear(0, 0, 5000, 0) === G.ents, 'same array, not a copy');
})();

/* ------------------------------------------------------------------ sonar reach ----
   _rtsCloakAI's scan is bucketed on the widest `detects` in the roster, because the radius that
   matters there belongs to the OBSERVER, not to the submarine. Hard-code it and the next hull
   with better sonar silently stops finding anything. */
(function () {
  var max = g.RTS_SUB_DETECT, who = 'the default';
  [g.RTS_UNITS, g.RTS_STRUCTS].forEach(function (list) {
    list.forEach(function (d) { if (d.detects > max) { max = d.detects; who = d.key; } });
  });
  S.eq('the sonar scan reaches as far as the best sonar in the game', g._rtsSpDetectMax(), max);
  S.note('widest detection radius is ' + max + ' (' + who + ')');
})();

require('../lib/report.js')(S);
