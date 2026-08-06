/* The corner wedge: a unit whose route clips the corner of a blocked cell used to stop forever.

   Two halves, and neither alone is enough. _rtsClearLine sampled the segment every 0.4 of a tile
   and so certified a straight line that crosses the CORNER of a blocked cell - the string-puller
   then collapsed the route to that one impossible waypoint. _rtsSteer tested each step as a
   single movement with no per-axis slide, so it could never traverse it. The unit stopped dead,
   and when the unit was the starting harvester the side's economy stopped with it: seed 42,
   zero deliveries in 246 seconds with 189,397 ore on the map.

   The construction here is deterministic and hand-built rather than seed-hunted. A seed that
   happens to produce a wedge today stops producing one the moment anything about generation
   changes, and then the spec passes for ever while testing nothing. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('pathing');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  await g.start(7, 15);

  /* ---------- 1. the geometry, directly ---------- */
  var line = await g.page.evaluate(function () {
    var G = window._rtsG;
    /* a clear patch to build the case in */
    var base = null;
    for (var tz = 20; tz < RTS_N - 20 && !base; tz++) {
      for (var tx = 20; tx < RTS_N - 20 && !base; tx++) {
        var ok = true;
        for (var a = -2; a <= 2 && ok; a++) for (var b = -2; b <= 2 && ok; b++)
          if (_rtsBlocked(tx + a, tz + b)) ok = false;
        if (ok) base = { tx: tx, tz: tz };
      }
    }
    if (!base) return { error: 'no clear 5x5 anywhere on the map' };

    /* Block two cells diagonally opposite each other, leaving the lattice corner between them
       as the only "gap". A line straight through that corner is not a route: a unit is not a
       point and the two open cells do not touch along an edge. */
    var i1 = _rtsIdx(base.tx + 1, base.tz), i2 = _rtsIdx(base.tx, base.tz + 1);
    var was1 = G.blocked[i1], was2 = G.blocked[i2];
    G.blocked[i1] = 1; G.blocked[i2] = 1;

    /* the exact corner: the lattice point shared by all four cells */
    var cx = (base.tx + 1 - RTS_N / 2) * RTS_TILE;
    var cz = (base.tz + 1 - RTS_N / 2) * RTS_TILE;
    var d = RTS_TILE * 0.5;
    var through = _rtsClearLine(cx - d, cz - d, cx + d, cz + d);

    /* a control: the same length of line through open ground must still be clear, or the fix
       is just "return false more often" and every path in the game gets worse */
    var openLine = _rtsClearLine(cx - d, cz + d * 3, cx + d, cz + d * 3);

    /* and a line straight into a blocked cell is still refused */
    var intoWall = _rtsClearLine(cx - d, cz - d * 0.5, cx + d * 1.5, cz - d * 0.5);

    G.blocked[i1] = was1; G.blocked[i2] = was2;
    return { through: through, openLine: openLine, intoWall: intoWall, base: base };
  });
  S.ok('the map has somewhere to build the case', !line.error, line.error || ('at tile ' + JSON.stringify(line.base)));
  S.eq('a line through the corner of two diagonal blockers is NOT clear', line.through, false);
  S.eq('...while the same line through open ground still is', line.openLine, true);
  S.eq('...and a line into a wall is still refused', line.intoWall, false);

  /* ---------- 2. a unit ordered across that corner arrives ---------- */
  var run = await g.page.evaluate(function () {
    var G = window._rtsG;
    var base = null;
    for (var tz = 20; tz < RTS_N - 20 && !base; tz++) {
      for (var tx = 20; tx < RTS_N - 20 && !base; tx++) {
        var ok = true;
        for (var a = -3; a <= 3 && ok; a++) for (var b = -3; b <= 3 && ok; b++)
          if (_rtsBlocked(tx + a, tz + b)) ok = false;
        if (ok) base = { tx: tx, tz: tz };
      }
    }
    if (!base) return { error: 'no clear 7x7' };
    G.blocked[_rtsIdx(base.tx + 1, base.tz)] = 1;
    G.blocked[_rtsIdx(base.tx, base.tz + 1)] = 1;

    var sx = _rtsWX(base.tx), sz = _rtsWX(base.tz);
    var gx = _rtsWX(base.tx + 1), gz = _rtsWX(base.tz + 1);
    var u = _rtsSpawnUnit('player', 'tank', sx, sz);
    if (!u) return { error: 'could not spawn a tank' };
    u.goal = { x: gx, z: gz };
    u.path = _rtsPathFor(u, gx, gz); u.pi = 0; u.order = 'move';
    var pathLen = u.path ? u.path.length : 0;
    var start = { x: u.x, z: u.z };
    var d0 = Math.hypot(u.x - gx, u.z - gz);
    var best = d0;
    for (var i = 0; i < 60 * 60; i++) {
      _rtsTick(1 / 60);
      if (u.dead) break;
      best = Math.min(best, Math.hypot(u.x - gx, u.z - gz));
    }
    return { pathLen: pathLen, d0: d0, best: best,
             moved: Math.hypot(u.x - start.x, u.z - start.z),
             jam: u.jam || 0, arrived: best < RTS_TILE * 1.2, order: u.order };
  });
  S.ok('a tank is ordered diagonally past the blocked corner', !run.error, run.error || '');
  S.ok('the route is not a single straight waypoint through the corner', run.pathLen !== 1,
       'path has ' + run.pathLen + ' waypoints');
  S.ok('the tank actually gets there', run.arrived,
       'started ' + run.d0.toFixed(2) + ' away, closest approach ' + run.best.toFixed(2) +
       ', travelled ' + run.moved.toFixed(2));

  /* ---------- 3. a harvester cannot lose the match to one unreachable tile ---------- */
  var harv = await g.page.evaluate(function () {
    var G = window._rtsG;
    /* An idle player never builds one - the free harvester arrives with a Refinery - so spawn
       it rather than waiting. A refinery has to exist too or there is nowhere to deliver, and
       "it goes on earning" would then be unmeasurable. */
    var h = G.ents.filter(function (e) { return !e.dead && e.side === 'player' &&
      rtsUnitDef(e.def) && rtsUnitDef(e.def).harvest; })[0];
    if (!h) {
      var yd = _rtsHas('player', 'yard');
      if (!yd) return { error: 'the player has no command yard' };
      if (!_rtsHas('player', 'refinery')) {
        var spot = null;
        for (var r = 3; r <= 12 && !spot; r++) for (var a = 0; a < 16 && !spot; a++) {
          var tx2 = _rtsTX(yd.x + Math.cos(a / 16 * 6.283) * r * RTS_TILE) - 1;
          var tz2 = _rtsTX(yd.z + Math.sin(a / 16 * 6.283) * r * RTS_TILE) - 1;
          if (_rtsCanPlace('player', 'refinery', tx2, tz2)) spot = [tx2, tz2];
        }
        if (!spot) return { error: 'nowhere to put a refinery' };
        _rtsPlaceStruct('player', 'refinery', spot[0], spot[1]);
      }
      h = G.ents.filter(function (e) { return !e.dead && e.side === 'player' &&
        rtsUnitDef(e.def) && rtsUnitDef(e.def).harvest; })[0];
      if (!h) h = _rtsSpawnUnit('player', 'harvester', yd.x + RTS_TILE * 4, yd.z);
    }
    if (!h) return { error: 'could not get a harvester onto the field' };
    /* wall a tile of ore in completely, and point the harvester at it */
    var target = null;
    for (var tz = 2; tz < RTS_N - 2 && !target; tz++)
      for (var tx = 2; tx < RTS_N - 2 && !target; tx++)
        if (G.scrap[_rtsIdx(tx, tz)] > 0) target = { tx: tx, tz: tz };
    if (!target) return { error: 'no ore on the map' };
    [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(function (o) {
      G.blocked[_rtsIdx(target.tx + o[0], target.tz + o[1])] = 1;
    });
    h.htile = { tx: target.tx, tz: target.tz };
    h.hstate = 'toField'; h.path = null; h.noGain = 0; h.bestGap = undefined;
    /* Ore arrives as S.ore and only then becomes spendable credits, so watching `credits`
       alone can read flat while the harvester is delivering perfectly well. Count the whole
       treasury, and count deliveries directly as well. */
    var S3 = G.sides.player;
    var before = S3.credits + S3.ore;
    var delivered = 0, wasCarrying = 0, stuckOn = 0;
    for (var i = 0; i < 60 * 120; i++) {
      _rtsTick(1 / 60);
      if (h.htile && h.htile.tx === target.tx && h.htile.tz === target.tz) stuckOn++;
      if (wasCarrying > 0 && h.carry === 0) delivered++;
      wasCarrying = h.carry;
    }
    return { walled: target, gaveUp: !(h.htile && h.htile.tx === target.tx && h.htile.tz === target.tz),
             secondsOnIt: (stuckOn / 60).toFixed(1), delivered: delivered,
             after: S3.credits + S3.ore, before: before, state: h.hstate };
  });
  S.ok('a harvester exists to test with', !harv.error, harv.error || '');
  S.ok('it gives up on ore it cannot reach', harv.gaveUp,
       'spent ' + harv.secondsOnIt + 's on the walled tile out of 120');
  S.ok('...and goes on earning', harv.after > harv.before,
       harv.before + ' -> ' + harv.after + ' in the treasury, ' + harv.delivered + ' deliveries');

  /* ---------- 4. and none of this broke ordinary movement ---------- */
  var normal = await g.page.evaluate(function () {
    var G = window._rtsG, arrived = 0, tried = 0, worst = 0;
    var units = G.ents.filter(function (e) { return !e.dead && e.type === 'unit' &&
      e.side === 'player' && !rtsUnitDef(e.def).harvest && !e.air; }).slice(0, 6);
    /* Held HERE, not read back off the entity: arriving clears u.goal, so a spec that checks
       u.goal afterwards silently skips every unit that succeeded and scores it as a miss. */
    var want = [];
    units.forEach(function (u) {
      var open = _rtsNearestOpen(_rtsTX(u.x) + 12, _rtsTX(u.z) + 12, 10);
      if (!open) return;
      tried++;
      var gx = _rtsWX(open[0]), gz = _rtsWX(open[1]);
      want.push({ u: u, x: gx, z: gz });
      u.goal = { x: gx, z: gz }; u.path = _rtsPathFor(u, gx, gz); u.pi = 0; u.order = 'move';
    });
    for (var i = 0; i < 60 * 45; i++) _rtsTick(1 / 60);
    /* A unit killed on the way did not fail to path - the enemy is live in this match and this
       is not a combat test. Deaths come out of the denominator, and are reported so a run where
       everything died cannot look like a run where everything arrived. */
    var died = 0;
    want.forEach(function (w) {
      if (w.u.dead) { died++; return; }
      var d = Math.hypot(w.u.x - w.x, w.u.z - w.z);
      worst = Math.max(worst, d);
      if (d < RTS_TILE * 2) arrived++;
    });
    return { tried: tried, arrived: arrived, worst: worst, died: died, alive: tried - died };
  });
  S.ok('enough units survived the trip to say anything', normal.alive >= 3,
       normal.alive + ' of ' + normal.tried + ' still alive (' + normal.died + ' killed en route)');
  S.ok('ordinary cross-map orders still complete',
       normal.alive > 0 && normal.arrived >= Math.ceil(normal.alive * 0.8),
       normal.arrived + '/' + normal.alive + ' arrived, worst remaining gap ' + normal.worst.toFixed(1));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
