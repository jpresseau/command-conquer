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
  /* Frozen: every step below counts simulated seconds and judges an outcome against them, so
     the match must not also be advancing on its own between evaluate calls. Left running, it
     ordered three units across the map when run alone and four inside the suite - the extra
     unit existing only because the machine was busier - and the spec's verdict changed with
     it. See start()/freeze() in lib/game.js. Nothing here measures the running loop. */
  await g.start(7, 15, { freeze: true });

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
    /* WATCHED WHILE IT HAPPENS, not sampled at the end. See the note below for why the end is
       the one moment at which this is unanswerable. */
    for (var i = 0; i < 60 * 45; i++) {
      _rtsTick(1 / 60);
      want.forEach(function (w) {
        if (w.u.order && w.u.order !== 'move') w.fought = true;
      });
    }
    /* Two things can end a unit's journey without any pathing being at fault, and BOTH have to
       come out of the denominator or this measures the war rather than the router:

         - it was killed. The enemy is live in this match and this is not a combat test.
         - it stopped moving in order to FIGHT. A unit that acquires a target on the way
           switches itself off the move order, which is correct behaviour and exactly what a
           player expects - but it is then no longer executing the order being measured. A
           tank that did this was scored as a unit stranded 43 units from its goal, which
           read as a routing bug and was a tank doing its job.

       That second one used to be read off `u.order` after the loop, and that only catches a
       unit STILL SHOOTING at the final tick. A unit that broke off, won its fight and went
       idle ends on `order === null` - indistinguishable from one that arrived - and was
       scored as stranded. It is not a hypothetical: a tank switched to `attack` at 7.8s of
       the 45 and was idle again by 26.1s, having never resumed the move, and the spec called
       it a 38.7-unit routing failure. The order is watched every tick instead, so breaking
       off is recorded at the moment it happens rather than guessed at from the wreckage.

       Both are counted and reported, so a run where everybody died or everybody stopped to
       fight cannot look like a run where everybody arrived. */
    var died = 0, fought = 0;
    want.forEach(function (w) {
      if (w.u.dead) { died++; return; }
      if (w.fought) { fought++; return; }
      var d = Math.hypot(w.u.x - w.x, w.u.z - w.z);
      worst = Math.max(worst, d);
      if (d < RTS_TILE * 2) arrived++;
    });
    return { tried: tried, arrived: arrived, worst: worst, died: died, fought: fought,
             judged: tried - died - fought };
  });
  S.ok('enough units finished the trip under their own orders to say anything',
       normal.judged >= 3,
       normal.judged + ' of ' + normal.tried + ' judged (' + normal.died + ' killed en route, ' +
       normal.fought + ' broke off to fight)');
  S.ok('ordinary cross-map orders still complete',
       normal.judged > 0 && normal.arrived >= Math.ceil(normal.judged * 0.8),
       normal.arrived + '/' + normal.judged + ' arrived, worst remaining gap ' + normal.worst.toFixed(1));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  /* ---------- 5. ore NOTHING can reach must not be re-searched every frame ---------- */
  /* Section 3 walls one tile and the harvester finds other ore. This is the case the player's
     own maps produce: _rtsMapCheck's flood fill is land-only and src/map/starts.js passes a map
     if even ONE ore cell is reachable, so a map whose fields sit behind water or cliff loads
     happily and then strands every harvester on it.

     A failed A* is not cheap - a search that finds nothing has expanded every reachable cell
     before it gives up - and a null path used to clear `htile` without writing anything to the
     `noGo` blacklist. _rtsNearestScrap then handed back the same nearest cell next tick. The
     only thing that ever blacklisted anything was an eight-second no-progress timer measuring
     a different fault: a harvester that is MOVING and not closing.

     Measured, every ore cell on the map walled in, 20 simulated seconds and then 20 more:

                    failed searches      cells written off      cost per tick
       before          4,033 + 4,792          4 of 25              9.331 ms
       after              100 +     0         25 of 25             0.563 ms
       control on an ordinary map                                  0.095 ms

     100 is the whole of it - 25 walled cells times the harvesters that each tried them - and it
     does not come back: the second window costs nothing, and a sixty-second run is still 100.
     Before, it was a hundred times a second for as long as the ore existed. */
  /* ITS OWN MATCH. This section wipes every ore cell on the map, which would leave section 4
     ordering units around a world that no longer resembles the one it was written for - it
     scored 0 of 5 arrivals when this ran before it. Isolated rather than ordered carefully,
     because "run these in this order or one silently lies" is not a property worth relying on. */
  var g2 = await openPage(browser, { width: 900, height: 700 });
  await g2.start(7, 15, { freeze: true });
  var thrash = await g2.page.evaluate(function () {
    var G = window._rtsG;
    for (var i = 0; i < G.scrap.length; i++) { G.scrap[i] = 0; G.gems[i] = 0; }
    var h = G.ents.filter(function (e) { return !e.dead && e.side === 'player' &&
      rtsUnitDef(e.def) && rtsUnitDef(e.def).harvest; })[0];
    if (!h) {
      /* Same reason as section 3: an idle player never builds one, the free harvester comes
         with a Refinery, and a fresh match has neither. */
      var yd = _rtsHas('player', 'yard');
      if (!yd) return { error: 'the player has no command yard' };
      if (!_rtsHas('player', 'refinery')) {
        var spot = null;
        for (var rr = 3; rr <= 14 && !spot; rr++) for (var aa = 0; aa < 20 && !spot; aa++) {
          var qx = _rtsTX(yd.x + Math.cos(aa / 20 * 6.283) * rr * RTS_TILE) - 1;
          var qz = _rtsTX(yd.z + Math.sin(aa / 20 * 6.283) * rr * RTS_TILE) - 1;
          if (_rtsCanPlace('player', 'refinery', qx, qz)) spot = [qx, qz];
        }
        if (!spot) return { error: 'nowhere to put a refinery' };
        _rtsPlaceStruct('player', 'refinery', spot[0], spot[1]);
      }
      h = G.ents.filter(function (e) { return !e.dead && e.side === 'player' &&
        rtsUnitDef(e.def) && rtsUnitDef(e.def).harvest; })[0];
      if (!h) h = _rtsSpawnUnit('player', 'harvester', yd.x + RTS_TILE * 4, yd.z);
    }
    if (!h) return { error: 'no harvester' };
    /* One 5x5 patch of ore, ringed in rock, well away from anything. */
    var ctx = _rtsTX(h.x) + 30, ctz = _rtsTX(h.z) + 30;
    if (ctx > RTS_N - 12) ctx = _rtsTX(h.x) - 30;
    if (ctz > RTS_N - 12) ctz = _rtsTX(h.z) - 30;
    var ore = 0;
    for (var ox = -3; ox <= 3; ox++) for (var oz = -3; oz <= 3; oz++) {
      var k = _rtsIdx(ctx + ox, ctz + oz);
      if (Math.max(Math.abs(ox), Math.abs(oz)) === 3) { G.terrain[k] = RTS_T_ROCK; G.blocked[k] = 1; }
      else { G.terrain[k] = RTS_T_GRASS; G.blocked[k] = 0; G.scrap[k] = 300; ore++; }
    }
    G.scrapDirty = true;
    G.ents.forEach(function (e) {
      if (e.dead || !rtsUnitDef(e.def) || !rtsUnitDef(e.def).harvest) return;
      e.htile = null; e.hstate = 'toField'; e.path = null; e.noGo = null;
      e.noGain = 0; e.bestGap = undefined;
    });

    /* COUNT THE HARVESTERS' OWN SEARCHES. Wrapping _rtsPath counts every unit on the map -
       the opponent's army included - and in a live match that is thousands of legitimate calls
       that have nothing to do with this. Wrapping _rtsPathFor and filtering on the caller is
       the honest instrument: measured the wrong way, 3,523 calls of which only 175 failed. */
    var real = window._rtsPathFor, calls = 0, fails = 0;
    window._rtsPathFor = function (e, gx, gz) {
      var ud = rtsUnitDef(e.def), mine = ud && ud.harvest;
      var out = real(e, gx, gz);
      if (mine) { calls++; if (!out) fails++; }
      return out;
    };
    for (var s = 0; s < 60 * 20; s++) _rtsTick(1 / 60);
    var harvs = G.ents.filter(function (e) { return !e.dead &&
      rtsUnitDef(e.def) && rtsUnitDef(e.def).harvest; }).length;
    /* The union across every harvester, not one of them: the cells are shared, and each
       harvester keeps its own blacklist on purpose - one approaching from another side may
       have no trouble with a cell that defeated the first. */
    var seen = {};
    G.ents.forEach(function (e) {
      if (!e.noGo) return;
      Object.keys(e.noGo).forEach(function (k) { if (e.noGo[k] > G.t) seen[k] = 1; });
    });
    var first = { calls: calls, fails: fails, harvs: harvs, blacklisted: Object.keys(seen).length };
    /* AND IT DOES NOT COME BACK. The blacklist is time-limited on purpose - a wall can be
       destroyed - but it must outlast the frame that set it by a great deal more than nothing. */
    calls = 0; fails = 0;
    for (var s2 = 0; s2 < 60 * 20; s2++) _rtsTick(1 / 60);
    window._rtsPathFor = real;
    return { ore: ore, first: first, second: { calls: calls, fails: fails } };
  });
  S.ok('a harvester exists for the unreachable-ore case', !thrash.error, thrash.error || '');
  if (!thrash.error) {
    /* The bound is the ore, not the clock. Before the fix this was 4,287 for 25 cells. */
    /* FAILED searches are the measurement. Harvesters go on pathing for perfectly good reasons
       - a full hopper still has to reach a refinery - and counting those would make this about
       how busy the map is. The bound is one failure per walled cell per harvester that tries
       it: nothing more, and emphatically not one per frame. */
    var bound = thrash.ore * thrash.first.harvs;
    S.ok('ore nothing can reach costs one failed search per cell, not one per frame',
         thrash.first.fails <= bound,
         thrash.first.fails + ' failures for ' + thrash.ore + ' walled cells and ' +
         thrash.first.harvs + ' harvesters (bound ' + bound + ')');
    S.ok('...and every walled cell was written off, not two of them',
         thrash.first.blacklisted >= thrash.ore,
         thrash.first.blacklisted + ' cells blacklisted of ' + thrash.ore);
    S.ok('...and the next twenty seconds cost no failed searches at all',
         thrash.second.fails === 0, thrash.second.fails + ' further failures');
  }

  await g2.close();

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
