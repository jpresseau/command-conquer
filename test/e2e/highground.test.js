/* WHAT THE HEIGHT OF THE GROUND MEANS TO THE SIMULATION.

   For two changes the terrain had relief and the sim could not tell. core/relief.js is where
   that stops: a climb costs speed, a climb costs A* more than flat ground, a ridge takes a bite
   out of what an observer can see, and standing above your target is worth a little sight and a
   little reach. Passability is deliberately NOT among them - e2e/elevation grades that half.

   EVERY ASSERTION HERE CARRIES ITS OWN CONTROL, in pairs, because a rule that is supposed to
   vanish on flat ground can be verified by a test that would also pass if the rule never fired
   at all. So each one is asked twice: once where it must be exactly the identity, and once
   where it must not be. A one-sided version of any of these is worthless - that is not a
   general worry, it is the specific mistake this suite has made before (an AO assertion with
   only a lower bound passed after the curve it was grading was deleted).

   THE STRONGEST EVIDENCE FOR THE IDENTITY HALF IS NOT IN THIS FILE, because a spec cannot carry
   the build that came before it. Measured by hand at the time: the digest of every entity's
   position, hit points, death flag and side plus both treasuries, after 120 simulated seconds,
   on seeds 7, 42 and 99, with G.height zeroed - identical to the same three digests from the
   previous build, which could not read height at all. Its control fired too: with the relief
   left in, the digest differed from that build on seeds 7 and 99. It did not on 42, and that is
   informative rather than a hole - 42 is the seed where units spend only 4.3% of their time off
   flat ground, so there is nothing on that map for the rules to bite on early.

   WHY THE NUMBERS ARE WHAT THEY ARE lives in core/relief.js, including the rule that is absent:
   steep ground is NOT impassable, because the terrain smoother quantises slope (p90 0.417, max
   0.589 on every seed measured) so no threshold separates a cliff from a ramp, and blocking
   above 0.30, 0.35 or 0.40 alike cuts reachable ground to 15-35% of what it was. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('highground');
var SEEDS = [7, 42, 99];

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function (SEEDS) {
    var o = { flat: {}, relief: {}, perSeed: [] };

    /* ---------------------------------------------------------------- the identity half.
       Every rule asked on a map whose heights are all zero. These are exact comparisons on
       purpose: "vanishes at zero height" is a stronger and more useful property than "becomes
       small at zero height", and it is the one core/relief.js claims. */
    _rtsNewGame(7);
    var G = window._rtsG;
    G.height.fill(0);
    var A = { x: 0, z: 0, type: 'unit', def: 'tank' }, B = { x: 40, z: 40, type: 'unit', def: 'tank' };
    o.flat.speedExactlyOne = _rtsClimbSpeed(A, 0, 0, 1, 0) === 1 &&
                             _rtsClimbSpeed(A, 12, -30, -0.6, 0.8) === 1;
    o.flat.lineClimbZero = _rtsLineClimb(-60, -60, 60, 60) === 0;
    o.flat.reachUnchanged = _rtsElevReach(A, B, 22) === 22 && _rtsElevReach(B, A, 22) === 22;
    o.flat.sightBonusZero = _rtsSightBonus(A) === 0 && _rtsSightBonus(B) === 0;

    /* A BOAT FLOATS - it is at sea level whatever the height byte under it says. Asked on
       ground raised to the maximum, because that is the case that bit: e2e/navy cuts its duel
       arena by overwriting terrain and blocked and NOT height, so its sea lies over hills, and
       submarines went from keeping 67% of the fleet against gunboats to 56% purely from hulls
       being handed reach for standing on underwater ones. The control underneath is the same
       spot asked about a TANK, which must still get the full advantage there - without it this
       would pass just as well if height had been switched off altogether. */
    _rtsNewGame(7);
    var Gs = window._rtsG;
    for (var q = 0; q < Gs.height.length; q++) Gs.height[q] = 255;
    var boat = { x: 0, z: 0, type: 'unit', def: 'gunboat', air: 0 };
    var boat2 = { x: 30, z: 30, type: 'unit', def: 'sub', air: 0 };
    var tank = { x: 0, z: 0, type: 'unit', def: 'tank', air: 0 };
    o.flat.boatStandsAtSeaLevel = _rtsStandHeight(boat) === 0 && _rtsStandHeight(boat2) === 0;
    o.flat.boatNoReach = _rtsElevReach(boat, boat2, 22) === 22;
    o.flat.boatNoSight = _rtsSightBonus(boat) === 0;
    o.flat.tankStandsHigh = +_rtsStandHeight(tank).toFixed(2);
    o.flat.tankGetsReach = +_rtsElevReach(tank, boat, 22).toFixed(2);
    _rtsNewGame(7); window._rtsG.height.fill(0);
    /* the horizon must occlude NOTHING on flat ground - every cell of the disc, at every range */
    var hid = 0, tot = 0;
    for (var r = 3; r <= RTS_SIGHT_MAX; r++) {
      var vis = _rtsHorizon(64, 64, r), T = _rtsRadiusTable(), n = T.count[r] * 2;
      for (var i = 0; i < n; i += 2) {
        var dx = T.off[i], dz = T.off[i + 1];
        if (dx * dx + dz * dz > r * r) continue;
        tot++; if (!_rtsHorizonAt(vis, dx, dz)) hid++;
      }
    }
    o.flat.horizonHidden = hid; o.flat.horizonCells = tot;

    /* THE SWEEP'S WALK ORDER, against an ORACLE rather than against a restatement of itself.

       Every cell inherits the steepest slope so far from its PARENT - the cell one step closer
       along its own ray - so the parent must already have been written this sweep. Chebyshev
       rings give that by construction; the rounded-Euclidean ring table _rtsSightFrom uses does
       not, and 16 of 1196 parent lookups read an unwritten cell when the sweep was first built
       on it, quietly leaking about 1% of every disc visible.

       The obvious test - recompute the walk order here and check it is parent-first - is one
       this suite has been caught by before: it grades a Chebyshev walk, not the walk relief.js
       actually performs, and would sail through the production code reverting to the ring
       table. So the reference below runs the SAME algorithm over an EXPLICIT SORT by Chebyshev
       radius, which is parent-first however the production walk is written, and the two are
       compared cell for cell on real generated terrain. A production order that regresses
       diverges from it. */
    function refHorizon(tx, tz, range) {
      var cells = [];
      for (var dz = -range; dz <= range; dz++) for (var dx = -range; dx <= range; dx++)
        cells.push([dx, dz, Math.max(Math.abs(dx), Math.abs(dz))]);
      cells.sort(function (a, b) { return a[2] - b[2]; });
      var hz = {}, vis = {}, eye = _rtsTileElev(tx, tz) + RTS_EYE;
      for (var i = 0; i < cells.length; i++) {
        var ax = cells[i][0], az = cells[i][1], r = cells[i][2];
        if (!r) { hz['0,0'] = -1e9; vis['0,0'] = 1; continue; }
        var px = Math.round(ax * (r - 1) / r), pz = Math.round(az * (r - 1) / r);
        var ph = hz[px + ',' + pz];
        var s = (_rtsTileElev(tx + ax, tz + az) - eye) / (Math.sqrt(ax * ax + az * az) * RTS_TILE);
        vis[ax + ',' + az] = (s >= ph - 1e-6) ? 1 : 0;
        hz[ax + ',' + az] = (s > ph) ? s : ph;
      }
      return vis;
    }
    _rtsNewGame(99);                                  /* real relief, not the flattened map */
    /* OBSERVERS STANDING WHERE THERE IS SOMETHING TO OCCLUDE. Five arbitrary coordinates gave
       an oracle that hid 33 cells in 2205 - it agreed with production, but on a question with
       almost no content. Picked instead by scanning for open ground whose own sight radius
       spans at least half the map's height range, which is what makes the comparison worth
       making. */
    var spots = [], Gh = window._rtsG;
    for (var sy = RTS_SIGHT_MAX; sy < RTS_N - RTS_SIGHT_MAX && spots.length < 5; sy += 3) {
      for (var sx = RTS_SIGHT_MAX; sx < RTS_N - RTS_SIGHT_MAX && spots.length < 5; sx += 3) {
        if (Gh.blocked[sy * RTS_N + sx] !== 0) continue;
        var lo = 255, hiH = 0;
        for (var oz = -RTS_SIGHT_MAX; oz <= RTS_SIGHT_MAX; oz += 2)
          for (var ox = -RTS_SIGHT_MAX; ox <= RTS_SIGHT_MAX; ox += 2) {
            var hv = Gh.height[(sy + oz) * RTS_N + (sx + ox)];
            if (hv < lo) lo = hv; if (hv > hiH) hiH = hv;
          }
        if (hiH - lo > 110) spots.push([sx, sy]);
      }
    }
    var agree = 0, cells = 0, occSeen = 0;
    o.flat.oracleSpots = spots.length;
    spots.forEach(function (p) {
      var got = _rtsHorizon(p[0], p[1], RTS_SIGHT_MAX), want = refHorizon(p[0], p[1], RTS_SIGHT_MAX);
      for (var dz = -RTS_SIGHT_MAX; dz <= RTS_SIGHT_MAX; dz++)
        for (var dx = -RTS_SIGHT_MAX; dx <= RTS_SIGHT_MAX; dx++) {
          cells++;
          var w2 = want[dx + ',' + dz];
          if (_rtsHorizonAt(got, dx, dz) === w2) agree++;
          if (!w2) occSeen++;                          /* the oracle must have something to say */
        }
    });
    o.flat.oracleAgree = agree; o.flat.oracleCells = cells; o.flat.oracleOccluded = occSeen;
    _rtsNewGame(7); window._rtsG.height.fill(0);       /* back to the flat map for what follows */

    /* AND THE BUFFER IS NEVER CLEARED, which is only safe because of the above. A short sweep
       run straight after a long one must give the long one's answer for the cells they share -
       if any leftover leaked through a parent, these would disagree. */
    var wide = _rtsHorizon(64, 64, RTS_SIGHT_MAX), keepW = [];
    for (var q1 = -4; q1 <= 4; q1++) for (var q2 = -4; q2 <= 4; q2++) keepW.push(_rtsHorizonAt(wide, q1, q2));
    var narrow = _rtsHorizon(64, 64, 4), same = 0, cmp = 0;
    for (var q3 = -4, z3 = 0; q3 <= 4; q3++) for (var q4 = -4; q4 <= 4; q4++, z3++) {
      cmp++; if (_rtsHorizonAt(narrow, q3, q4) === keepW[z3]) same++;
    }
    o.flat.leftoverSame = same; o.flat.leftoverCells = cmp;

    /* ---------------------------------------------------------------- the control half.
       The same five questions on the maps as generated. If any of these comes back neutral the
       matching assertion above is passing for the wrong reason. */
    for (var si = 0; si < SEEDS.length; si++) {
      _rtsNewGame(SEEDS[si]);
      G = window._rtsG;
      var slowed = 0, spN = 0, minSp = 1;
      var occ = 0, occN = 0, bonusMax = 0, reachMax = 0;
      for (var t = 0; t < 900; t++) {
        var tx = (Math.abs(Math.sin(t * 12.9898 + si) * 43758.5453) % 1 * RTS_N) | 0;
        var tz = (Math.abs(Math.sin(t * 78.233 + si) * 43758.5453) % 1 * RTS_N) | 0;
        if (G.blocked[tz * RTS_N + tx] !== 0) continue;
        var wx = _rtsWX(tx), wz = _rtsWX(tz);
        var s = _rtsClimbSpeed({ type: 'unit', def: 'tank' }, wx, wz, Math.cos(t), Math.sin(t));
        spN++; if (s < 0.999) slowed++; if (s < minSp) minSp = s;
        var sb = _rtsSightBonus({ x: wx, z: wz });
        if (sb > bonusMax) bonusMax = sb;
        var rr = _rtsElevReach({ x: wx, z: wz }, { x: 0, z: 0 }, 22);
        if (rr > reachMax) reachMax = rr;
        if (occN < 200) {
          var v2 = _rtsHorizon(tx, tz, 7), T2 = _rtsRadiusTable(), n2 = T2.count[7] * 2;
          var seen = 0, all = 0;
          for (var j = 0; j < n2; j += 2) {
            var ax = T2.off[j], az = T2.off[j + 1];
            if (ax * ax + az * az > 49) continue;
            all++; if (_rtsHorizonAt(v2, ax, az)) seen++;
          }
          occ += 1 - seen / all; occN++;
        }
      }

      /* ROUTES. The same requests answered twice on one map - once as generated, once with the
         field flattened under it. The climb cost is the only thing that can differ, so a route
         that moves moved because of it. And no route may be LOST either way: the whole point of
         charging for a climb rather than forbidding it is that everywhere stays reachable. */
      var reqs = [];
      for (var k = 0; k < 260; k++) {
        var qx = (Math.abs(Math.sin(k * 3.1 + 1) * 43758.5) % 1 * RTS_N) | 0;
        var qz = (Math.abs(Math.sin(k * 7.7 + 2) * 43758.5) % 1 * RTS_N) | 0;
        var ex = (Math.abs(Math.sin(k * 5.3 + 3) * 43758.5) % 1 * RTS_N) | 0;
        var ez = (Math.abs(Math.sin(k * 9.1 + 4) * 43758.5) % 1 * RTS_N) | 0;
        if (G.blocked[qz * RTS_N + qx] !== 0 || G.blocked[ez * RTS_N + ex] !== 0) continue;
        reqs.push([_rtsWX(qx), _rtsWX(qz), _rtsWX(ex), _rtsWX(ez)]);
      }
      function routes() { return reqs.map(function (q) { return _rtsPath(q[0], q[1], q[2], q[3]); }); }
      function key(p) { return p.map(function (w) { return Math.round(w.x * 4) + ',' + Math.round(w.z * 4); }).join(' '); }
      /* Climb along a waypoint chain, always measured over the REAL height field - the point
         is what the route costs to walk, not what the search believed while planning it. */
      function climbOf(q, p) {
        var acc = 0, cx = q[0], cz = q[1];
        for (var i = 0; i < p.length; i++) { acc += _rtsLineClimb(cx, cz, p[i].x, p[i].z); cx = p[i].x; cz = p[i].z; }
        return acc;
      }
      var withRelief = routes();
      var keep = G.height.slice();
      G.height.fill(0);
      var whenFlat = routes();
      G.height.set(keep);                     /* restored BEFORE any climb is measured */
      var moved = 0, both = 0, lostR = 0, lostF = 0, cR = 0, cF = 0, uphill = 0;
      for (var m = 0; m < withRelief.length; m++) {
        if (!withRelief[m] && !whenFlat[m]) continue;
        if (!withRelief[m]) { lostR++; continue; }
        if (!whenFlat[m]) { lostF++; continue; }
        both++; if (key(withRelief[m]) !== key(whenFlat[m])) moved++;
        var a = climbOf(reqs[m], withRelief[m]), b = climbOf(reqs[m], whenFlat[m]);
        cR += a; cF += b;
        if (b > 0.01) uphill++;
      }

      o.perSeed.push({
        seed: SEEDS[si],
        slowedPct: +(slowed / (spN || 1) * 100).toFixed(1), minSpeed: +minSp.toFixed(3),
        occludedPct: +(occ / (occN || 1) * 100).toFixed(1),
        sightBonusMax: bonusMax, reachMax: +reachMax.toFixed(2),
        routes: both, routesMoved: moved,
        movedPct: +(moved / (both || 1) * 100).toFixed(1),
        lostWithRelief: lostR, lostWhenFlat: lostF,
        climbRelief: +cR.toFixed(1), climbFlat: +cF.toFixed(1),
        climbSavedPct: +((1 - cR / (cF || 1)) * 100).toFixed(1), routesWithClimb: uphill
      });
    }

    /* the sweep runs on every structure and unit the player owns, fifteen times a second */
    _rtsNewGame(7);
    var t0 = performance.now();
    for (var p = 0; p < 600; p++) _rtsSightFrom(30 + (p % 60), 30 + ((p * 7) % 60), 7);
    o.sweepMicros = +((performance.now() - t0) / 600 * 1000).toFixed(1);
    o.sightMax = RTS_SIGHT_MAX;
    o.elevMax = RTS_ELEV_MAX;
    return o;
  }, SEEDS);

  var P = out.perSeed;
  function all(f) { return P.every(f); }
  function some(f) { return P.some(f); }
  function show(f) { return P.map(function (p) { return p.seed + ': ' + f(p); }).join('   '); }

  /* ---- 1. climbing costs speed, and costs exactly nothing on the flat */
  S.ok('a climb costs speed', all(function (p) { return p.slowedPct > 3 && p.minSpeed < 0.75; }),
       show(function (p) { return p.slowedPct + '% of open ground slows a tank, worst ' + p.minSpeed + 'x'; }));
  S.ok('...and flat ground costs it nothing at all - not nearly nothing, nothing',
       out.flat.speedExactlyOne && out.flat.lineClimbZero,
       'with G.height zeroed _rtsClimbSpeed returns exactly 1 and _rtsLineClimb exactly 0' +
       (out.flat.speedExactlyOne && out.flat.lineClimbZero ? '' : ' - IT DOES NOT'));

  /* ---- 2. the route cost bends paths without ever closing one */
  S.ok('the climb cost bends routes around high ground',
       all(function (p) { return p.movedPct > 20; }),
       show(function (p) { return p.routesMoved + '/' + p.routes + ' routes differ from the same map flattened (' + p.movedPct + '%)'; }));
  /* AND THE PART THAT IS NOT THE SEARCH'S DOING. The string-puller straightens a route by
     asking only whether the shortcut is PASSABLE, which over a knoll it is - so left alone it
     collapses the detour the climb cost just bought and drives the column straight back over
     the hill. Nothing above catches that: with the guard deleted, "routes moved" still reads
     67/46/51% because A* itself planned differently, and this spec stayed green through the
     deletion when it was first written. What the guard changes is how much the returned route
     CLIMBS - the same waypoints, walked over the same real height field.

     POOLED ACROSS THE SEEDS, AND THAT IS NOT A CONVENIENCE. Measured both ways:

         seed        7      42      99          pooled
         guard     4.7%   26.6%   23.3%         14.8%
         no guard  1.0%    1.5%    4.7%          2.4%

     The per-seed columns OVERLAP - seed 7 with the guard reads the same 4.7% as seed 99
     without it - so no per-seed threshold separates the two populations, and one picked to
     pass today would be fitted to seed 7 rather than measuring anything. The pooled figure
     separates them six-fold. Seed 7 saves little because its relief leaves little to save,
     not because the guard is idle there: 4.7 against 1.0 is the same win, on a smaller map's
     worth of hill. The per-seed claim underneath is only that no map is made WORSE. */
  var cR = P.reduce(function (a, p) { return a + p.climbRelief; }, 0);
  var cF = P.reduce(function (a, p) { return a + p.climbFlat; }, 0);
  var pooled = +((1 - cR / (cF || 1)) * 100).toFixed(1);
  S.ok('...and the route that comes back really does climb less',
       pooled > 8 && all(function (p) { return p.climbRelief <= p.climbFlat && p.routesWithClimb > 5; }),
       pooled + '% less climbing pooled (' + cR.toFixed(0) + ' vs ' + cF.toFixed(0) +
       ' world units) — ' + show(function (p) { return p.climbSavedPct + '% over ' + p.routesWithClimb + ' hilly routes'; }));
  S.ok('...and never closes one - everywhere still reachable',
       all(function (p) { return p.lostWithRelief === 0 && p.lostWhenFlat === 0; }),
       show(function (p) { return p.lostWithRelief + ' lost with relief, ' + p.lostWhenFlat + ' lost flat'; }));

  /* ---- 3. the sight horizon. Two-sided: it must bite on relief and not at all on the flat. */
  S.ok('a ridge hides ground behind it',
       all(function (p) { return p.occludedPct > 2 && p.occludedPct < 45; }),
       show(function (p) { return p.occludedPct + '% of a 7-cell disc occluded'; }));
  S.ok('...and flat ground hides nothing, at every range',
       out.flat.horizonHidden === 0 && out.flat.horizonCells > 500,
       out.flat.horizonHidden + ' of ' + out.flat.horizonCells + ' cells hidden across ranges 3..' +
       out.sightMax + ' with the field zeroed');

  S.ok('...and the sweep agrees cell-for-cell with a reference ordered by an explicit sort',
       out.flat.oracleAgree === out.flat.oracleCells && out.flat.oracleOccluded > 100 &&
       out.flat.oracleSpots === 5,
       out.flat.oracleAgree + '/' + out.flat.oracleCells + ' cells agree over ' +
       out.flat.oracleSpots + ' observers standing in real relief, with the reference ' +
       'occluding ' + out.flat.oracleOccluded + ' of them - so ' +
       'the production walk really is parent-before-child, not merely documented as such');
  S.ok('...so a short sweep after a long one is unaffected by the leftovers',
       out.flat.leftoverSame === out.flat.leftoverCells,
       out.flat.leftoverSame + '/' + out.flat.leftoverCells +
       ' cells agree between a range-4 sweep and a range-' + out.sightMax + ' one at the same spot');

  /* ---- 4. height is worth sight and reach, and only upward */
  S.ok('standing high is worth sight and reach',
       some(function (p) { return p.sightBonusMax > 0; }) && some(function (p) { return p.reachMax > 22; }),
       show(function (p) { return '+' + p.sightBonusMax + ' cells, reach ' + p.reachMax + ' vs 22'; }));
  S.ok('...and on the flat neither applies',
       out.flat.sightBonusZero && out.flat.reachUnchanged,
       'zeroed height gives +0 cells and leaves a 22 weapon at exactly 22, both directions');

  S.ok('a boat stands at sea level however high the ground under it reads',
       out.flat.boatStandsAtSeaLevel && out.flat.boatNoReach && out.flat.boatNoSight,
       'over ground raised to 255 everywhere, two hulls measure 0 units up, a 22 weapon still ' +
       'reaches exactly 22 between them, and neither gains a cell of sight');
  S.ok('...while a tank on that same ground gets the full advantage',
       out.flat.tankStandsHigh > out.elevMax - 0.01 && out.flat.tankGetsReach > 22,
       'the tank stands ' + out.flat.tankStandsHigh + ' units up and reaches ' +
       out.flat.tankGetsReach + ' against a hull - so the line above is a boat rule, not height ' +
       'being switched off');

  /* ---- 5. it has to be affordable: the sweep runs per owned object at 15 Hz */
  S.ok('the horizon sweep is cheap enough to run per object at 15 Hz', out.sweepMicros < 120,
       out.sweepMicros + 'us per sweep - 40 objects at 15 Hz is ' +
       (out.sweepMicros * 40 * 15 / 1000).toFixed(1) + 'ms of every second');

  S.ok('no page errors', !g.errors.filter(function (e) { return !/ServiceWorker/.test(e); }).length,
       g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
