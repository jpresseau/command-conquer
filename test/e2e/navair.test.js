/* Naval and air combat: the two domains, and the rules about what can reach what.

   Sea and air are the same kind of feature seen twice. Both add units that move where nothing
   else can, and both are held up entirely by RESTRICTIONS - a ship that could drive onto land,
   a torpedo that could climb a beach, a tank that could shoot down a plane, and each of them
   stops being a domain and becomes a strictly better version of the land game. The restrictions
   are the feature. Every one is a `continue` in a loop or a branch in a passability test, which
   is to say every one is a line that can be deleted without anything failing to run.

   e2e/airforce already covers the Soviet air force as a feature: that a MiG can be built,
   flown, rearmed and shot down. What it does not cover is the CONTRACT the source states in
   _rtsFindTarget - "a weapon without `aa` cannot engage anything flying, and an aircraft's own
   weapons cannot reach another aircraft either" - so that is here, with naval, because it is
   the same rule wearing a different hat.

   Naval had no spec at all.

   Targeting is asserted on the DECISION - what _rtsFindTarget picks - and not on damage. That
   is a lesson from the AA Gun in e2e/airforce, which was confounded twice by other units
   wandering into the fight before the assertion could be made. A decision has no bystanders. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('navair');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  await g.start(7, 10, { freeze: true });

  /* ------------------------------------------------------------------- the sea ----
     A generated map is not guaranteed to be interesting, so the water is measured before
     anything is asserted about it. A spec that quietly did nothing on a dry map would be the
     worst outcome here: it would report success for a subsystem it never reached. */
  var sea = await g.page.evaluate(function () {
    var G = window._rtsG, cells = [], i;
    for (i = 0; i < G.terrain.length; i++) if (G.terrain[i] === RTS_T_WATER) cells.push(i);
    if (!cells.length) return { error: 'this map has no water at all' };
    /* the largest connected body, and a cell well inside it */
    var seen = {}, best = [], q, head, c, cx, cz, n;
    for (i = 0; i < cells.length; i++) {
      if (seen[cells[i]]) continue;
      q = [cells[i]]; head = 0; seen[cells[i]] = 1;
      while (head < q.length) {
        c = q[head++]; cx = c % RTS_N; cz = (c / RTS_N) | 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nx = cx + d[0], nz = cz + d[1];
          if (nx < 0 || nz < 0 || nx >= RTS_N || nz >= RTS_N) return;
          var ni = nz * RTS_N + nx;
          if (seen[ni] || G.terrain[ni] !== RTS_T_WATER) return;
          seen[ni] = 1; q.push(ni);
        });
      }
      if (q.length > best.length) best = q;
    }
    /* deepest water: the cell furthest from any shore, so a ship put there has room */
    var deep = best[0], deepScore = -1;
    best.forEach(function (ci) {
      var tx = ci % RTS_N, tz = (ci / RTS_N) | 0, r = 0;
      while (r < 8) {
        var edge = false;
        for (var ox = -r; ox <= r && !edge; ox++) for (var oz = -r; oz <= r && !edge; oz++) {
          var x = tx + ox, z = tz + oz;
          if (!_rtsInB(x, z) || G.terrain[_rtsIdx(x, z)] !== RTS_T_WATER) edge = true;
        }
        if (edge) break;
        r++;
      }
      if (r > deepScore) { deepScore = r; deep = ci; }
    });
    /* a shore cell: land with water beside it */
    var shore = null, shoreWater = null;
    for (i = 0; i < best.length && !shore; i++) {
      var tx0 = best[i] % RTS_N, tz0 = (best[i] / RTS_N) | 0;
      for (var ox2 = -1; ox2 <= 1 && !shore; ox2++) for (var oz2 = -1; oz2 <= 1 && !shore; oz2++) {
        var x2 = tx0 + ox2, z2 = tz0 + oz2;
        if (_rtsInB(x2, z2) && G.terrain[_rtsIdx(x2, z2)] !== RTS_T_WATER && !_rtsBlocked(x2, z2)) {
          shore = { tx: x2, tz: z2 };
          /* the water cell it stands beside - a submarine has to be within TORPEDO range of
             the beach for the refusal to mean anything, and the deepest water is nowhere near */
          shoreWater = { tx: tx0, tz: tz0 };
        }
      }
    }
    /* a second water cell near the first, so a ship target can sit within torpedo range of a
       submarine that is itself within torpedo range of the beach */
    var shoreWater2 = null;
    if (shoreWater) {
      for (var rr = 1; rr <= 3 && !shoreWater2; rr++) {
        for (var ax = -rr; ax <= rr && !shoreWater2; ax++) for (var az = -rr; az <= rr && !shoreWater2; az++) {
          if (Math.max(Math.abs(ax), Math.abs(az)) !== rr) continue;
          var wx3 = shoreWater.tx + ax, wz3 = shoreWater.tz + az;
          if (_rtsInB(wx3, wz3) && G.terrain[_rtsIdx(wx3, wz3)] === RTS_T_WATER)
            shoreWater2 = { tx: wx3, tz: wz3 };
        }
      }
    }
    return { total: cells.length, body: best.length,
             deep: { tx: deep % RTS_N, tz: (deep / RTS_N) | 0 }, margin: deepScore,
             shore: shore, shoreWater: shoreWater, shoreWater2: shoreWater2, tile: RTS_TILE };
  });
  S.ok('the map actually has a sea to fight on', !sea.error && sea.body > 60,
       sea.error || (sea.body + ' connected water cells of ' + sea.total + ' total'));
  if (sea.error) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('...with open water away from the shore to put a ship in', sea.margin >= 2,
       'the deepest cell is ' + sea.margin + ' cells clear of any shore, at ' +
       sea.deep.tx + ',' + sea.deep.tz);
  S.ok('...and a shoreline to build against', !!sea.shore,
       sea.shore ? (sea.shore.tx + ',' + sea.shore.tz) : 'no buildable land beside the water');

  /* -------------------------------------------------------------- the two navies ----
     Both armies get a yard and it is the same building twice, so the interesting property is
     that neither can field the other's hulls - otherwise the faction split is decoration. */
  var roster = await g.page.evaluate(function () {
    var ships = RTS_UNITS.filter(function (u) { return u.sea; });
    var yards = RTS_STRUCTS.filter(function (s) { return s.produces === 'ship'; });
    var crossed = [];
    ships.forEach(function (u) {
      ['allied', 'soviet'].forEach(function (side) {
        if (u.side && u.side !== side && rtsBuildableBy(u, side))
          crossed.push(side + ' can field ' + u.key);
      });
    });
    /* A prerequisite names a CAPABILITY, not a building - see _rtsProvides. Resolved as a key
       alone, this reported that the Transport needs no shipyard: what it needs is called
       `shipyard`, and no structure IS one - the Naval Yard and the Sub Pen both provide it,
       which is how a single roster entry can be built by both armies. Namesake first, then the
       `provides` lists, exactly as _rtsProvides resolves it. */
    function providersOf(cap) {
      var out = RTS_STRUCTS.filter(function (d) { return (d.provides || []).indexOf(cap) >= 0; });
      var own = rtsStructDef(cap);
      if (own && out.indexOf(own) < 0) out.push(own);
      return out;
    }
    var noYard = ships.filter(function (u) {
      return !(u.needs || []).some(function (p) {
        return providersOf(p).some(function (d) { return d.produces === 'ship'; });
      });
    }).map(function (u) { return u.key; });
    return {
      ships: ships.map(function (u) { return u.key + ' (' + u.side + ')'; }),
      yards: yards.map(function (s) { return s.key + ' (' + s.side + ')'; }),
      allShore: yards.every(function (s) { return !!s.shore; }),
      crossed: crossed, noYard: noYard,
      perSide: ['allied', 'soviet'].map(function (side) {
        return side + ': ' + ships.filter(function (u) { return rtsBuildableBy(u, side); }).length;
      })
    };
  });
  S.ok('both armies have a shipyard', roster.yards.length >= 2, roster.yards.join(', '));
  S.eq('...and every one of them must be built against water', roster.allShore, true);
  S.ok('every ship needs a shipyard to build it', !roster.noYard.length,
       roster.noYard.join(', ') || roster.ships.join(', '));
  S.ok('neither army can field the other\'s ships', !roster.crossed.length,
       roster.crossed.join('; ') || roster.perSide.join(', '));

  /* -------------------------------------------------------- a yard needs a shore ----
     `shore:true` is the placement rule, and it is the only one of its kind in the game. The
     comment says what it is for: without it a shipyard goes in the middle of a field and a
     fleet appears out of dry land. */
  var place = await g.page.evaluate(function (s) {
    var G = window._rtsG;
    /* somewhere inland: clear ground with no water anywhere near it */
    var inland = null;
    for (var tz = 10; tz < RTS_N - 10 && !inland; tz++) {
      for (var tx = 10; tx < RTS_N - 10 && !inland; tx++) {
        var ok = true;
        for (var ox = -4; ox <= 6 && ok; ox++) for (var oz = -4; oz <= 6 && ok; oz++) {
          var x = tx + ox, z = tz + oz;
          if (!_rtsInB(x, z)) { ok = false; break; }
          if (G.terrain[_rtsIdx(x, z)] === RTS_T_WATER) ok = false;
          if (ox >= 0 && ox < 3 && oz >= 0 && oz < 3 && _rtsBlocked(x, z)) ok = false;
        }
        if (ok) inland = { tx: tx, tz: tz };
      }
    }
    /* and a spot whose footprint is on land but touches the water */
    var coastal = null;
    for (var i = 0; i < G.terrain.length && !coastal; i++) {
      if (G.terrain[i] !== RTS_T_WATER) continue;
      var wx = i % RTS_N, wz = (i / RTS_N) | 0;
      for (var dx = -3; dx <= 1 && !coastal; dx++) for (var dz = -3; dz <= 1 && !coastal; dz++) {
        var bx = wx + dx, bz = wz + dz, clear = true;
        for (var fx = 0; fx < 3 && clear; fx++) for (var fz = 0; fz < 3 && clear; fz++) {
          var cx = bx + fx, cz = bz + fz;
          /* _rtsCanPlace refuses ore under a footprint as well as blocked ground, so the
             search has to apply the same rule or it hands back a spot the game will reject
             for a reason that has nothing to do with the shore. */
          if (!_rtsInB(cx, cz) || G.terrain[_rtsIdx(cx, cz)] === RTS_T_WATER ||
              _rtsBlocked(cx, cz) || G.scrap[_rtsIdx(cx, cz)] > 0) clear = false;
        }
        if (clear && _rtsShoreOk('navalyard', bx, bz)) coastal = { tx: bx, tz: bz };
      }
    }
    return {
      inland: inland, coastal: coastal,
      inlandShoreOk: inland ? _rtsShoreOk('navalyard', inland.tx, inland.tz) : null,
      coastalShoreOk: coastal ? _rtsShoreOk('navalyard', coastal.tx, coastal.tz) : null,
      /* and the same question through the real placement gate the player goes through */
      inlandPlace: inland ? _rtsCanPlace('player', 'navalyard', inland.tx, inland.tz, true) : null,
      coastalPlace: coastal ? _rtsCanPlace('player', 'navalyard', coastal.tx, coastal.tz, true) : null,
      /* the control: an ordinary building has no such restriction on the same inland spot */
      inlandPower: inland ? _rtsCanPlace('player', 'power', inland.tx, inland.tz, true) : null
    };
  }, sea);
  S.ok('there is dry inland ground to try to build on', !!place.inland,
       place.inland ? (place.inland.tx + ',' + place.inland.tz) : 'none found');
  S.ok('...and a coastal spot on land beside the water', !!place.coastal,
       place.coastal ? (place.coastal.tx + ',' + place.coastal.tz) : 'none found');
  S.eq('a shipyard is refused inland', place.inlandShoreOk, false);
  S.eq('...by the placement gate the player actually goes through', place.inlandPlace, false);
  S.eq('...and accepted against the water', place.coastalShoreOk, true);
  S.eq('...where the player can really put it', place.coastalPlace, true);
  /* If an ordinary building were also refused there, the test above would be measuring blocked
     ground rather than the shore rule. */
  S.eq('the control: an ordinary building is happy on the same inland spot', place.inlandPower, true);

  /* ------------------------------------------------------------ ships float, tanks do not ----
     The domain rule, from both sides. _rtsBlocked takes a domain and answers differently for
     it; if it ever stopped, a ship would drive up a beach and a tank would drown. */
  var domain = await g.page.evaluate(function (s) {
    var G = window._rtsG;
    var w = s.deep, l = s.shore;
    return {
      waterForShip: _rtsBlocked(w.tx, w.tz, 'sea'),
      waterForLand: _rtsBlocked(w.tx, w.tz),
      landForShip: _rtsBlocked(l.tx, l.tz, 'sea'),
      landForLand: _rtsBlocked(l.tx, l.tz),
      shipDomain: _rtsDomainOf({ type: 'unit', def: 'gunboat' }),
      tankDomain: _rtsDomainOf({ type: 'unit', def: 'tank' })
    };
  }, sea);
  S.eq('a ship reads open water as passable', domain.waterForShip, false);
  S.eq('...and dry land as blocked', domain.landForShip, true);
  S.eq('a land unit reads that same water as blocked', domain.waterForLand, true);
  S.eq('...and the shore as passable', domain.landForLand, false);
  S.eq('a gunboat is a sea unit', domain.shipDomain, 'sea');
  S.eq('...and a tank is not', domain.tankDomain, null);

  /* and the same thing as movement, which is what the player sees */
  var sail = await g.page.evaluate(function (s) {
    var G = window._rtsG;
    var boat = _rtsSpawnUnit('player', 'gunboat', _rtsWX(s.deep.tx), _rtsWX(s.deep.tz));
    if (!boat) return { error: 'could not put a gunboat on the water' };
    var startedOn = G.terrain[_rtsIdx(_rtsTX(boat.x), _rtsTX(boat.z))] === RTS_T_WATER;
    /* order it at dry land and let it try for fifteen seconds */
    _rtsOrderMove(boat, _rtsWX(s.shore.tx), _rtsWX(s.shore.tz));
    for (var i = 0; i < 60 * 15; i++) _rtsTick(1 / 60);
    var endTx = _rtsTX(boat.x), endTz = _rtsTX(boat.z);
    var endedOnWater = _rtsInB(endTx, endTz) && G.terrain[_rtsIdx(endTx, endTz)] === RTS_T_WATER;
    var gap = Math.hypot(boat.x - _rtsWX(s.shore.tx), boat.z - _rtsWX(s.shore.tz));

    /* and a tank ordered out to sea */
    var tank = _rtsSpawnUnit('player', 'tank', _rtsWX(s.shore.tx), _rtsWX(s.shore.tz));
    var tankOK = !!tank, tankWet = false;
    if (tank) {
      _rtsOrderMove(tank, _rtsWX(s.deep.tx), _rtsWX(s.deep.tz));
      for (var j = 0; j < 60 * 15; j++) _rtsTick(1 / 60);
      var ttx = _rtsTX(tank.x), ttz = _rtsTX(tank.z);
      tankWet = _rtsInB(ttx, ttz) && G.terrain[_rtsIdx(ttx, ttz)] === RTS_T_WATER;
      tank.dead = true;
    }
    boat.dead = true;
    return { startedOn: startedOn, endedOnWater: endedOnWater, gap: gap, tankOK: tankOK, tankWet: tankWet,
             endTile: { tx: endTx, tz: endTz }, startTile: s.deep, goal: s.shore,
             terr: _rtsInB(endTx, endTz) ? G.terrain[_rtsIdx(endTx, endTz)] : 'OOB',
             water: RTS_T_WATER };
  }, sea);
  S.ok('a gunboat can be put to sea', !sail.error, sail.error || '');
  if (!sail.error) {
    S.eq('...and starts afloat', sail.startedOn, true);
    S.ok('a ship ordered onto dry land never gets there', sail.endedOnWater,
         'from ' + JSON.stringify(sail.startTile) + ' toward ' + JSON.stringify(sail.goal) +
         ', ended at ' + JSON.stringify(sail.endTile) + ' terrain=' + sail.terr + ' (water=' + sail.water + ')');
    S.ok('...it stops at the water\'s edge', sail.gap > 0.5, 'closest approach ' + sail.gap.toFixed(1));
    S.ok('a tank exists to try the reverse', sail.tankOK, '');
    S.eq('a tank ordered out to sea never gets wet', sail.tankWet, false);
  }

  /* -------------------------------------------------- the step test, on its own ----
     The check above goes through A*, which only ever hands a ship a route over water - so it
     proves the ROUTE is right and says nothing about the per-step collision test behind it.
     That test is the defence in depth the source describes, and the only way to reach it is to
     hand the ship a path it would never have been given: one waypoint, on the beach.

     Not an artificial worry. A hull can end up pointed at land without A* having sent it there -
     shoved by a neighbour, or following a path laid before something changed - and the step
     test is what is supposed to stop it. It has to refuse in the unit's OWN domain, and water
     reads as blocked ground to the land one. */
  var step = await g.page.evaluate(function (s) {
    var G = window._rtsG;
    var boat = _rtsSpawnUnit('player', 'gunboat', _rtsWX(s.shoreWater.tx), _rtsWX(s.shoreWater.tz));
    if (!boat) return { error: 'no gunboat' };
    var d = rtsUnitDef('gunboat');
    var target = { x: _rtsWX(s.shore.tx), z: _rtsWX(s.shore.tz) };
    /* aimed straight at the beach, already facing it, with a path that says go */
    boat.rot = Math.atan2(target.z - boat.z, target.x - boat.x);
    var wet = true;
    for (var i = 0; i < 60 * 6; i++) {
      boat.path = [{ x: target.x, z: target.z }]; boat.pi = 0;
      boat.jam = 0; boat.stuck = 0;                 /* the unstick is tested separately */
      _rtsSteer(boat, 1 / 60, d);
      var tx = _rtsTX(boat.x), tz = _rtsTX(boat.z);
      if (!_rtsInB(tx, tz) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_WATER) { wet = false; break; }
    }
    var end = { tx: _rtsTX(boat.x), tz: _rtsTX(boat.z) };
    var endTerr = _rtsInB(end.tx, end.tz) ? G.terrain[_rtsIdx(end.tx, end.tz)] : -1;
    boat.dead = true;
    return { wet: wet, end: end, endTerr: endTerr, water: RTS_T_WATER, goal: s.shore };
  }, sea);
  S.ok('a ship can be pointed at the beach directly', !step.error, step.error || '');
  if (!step.error) {
    S.ok('a step onto land is refused even when the path says to take it', step.wet,
         'ended at ' + step.end.tx + ',' + step.end.tz + ' terrain=' + step.endTerr +
         ' (water=' + step.water + '), aimed at ' + step.goal.tx + ',' + step.goal.tz);
  }

  /* --------------------------------------------- crowding, which also moves a hull ----
     Steering is not the only thing that changes a position. Units shove each other apart every
     frame, and that push has its own passability test - which has to ask in the pushed unit's
     domain for exactly the same reason. Water is blocked ground, so every hull afloat looked
     to that test like a unit jammed inside a building, and a jammed unit takes its shove
     UNCONDITIONALLY because it is trying to escape. Ships crowded against a coast could
     therefore walk one of their number onto the beach with no order given at all.

     Said plainly, because the mutation testing says so: this case does NOT currently
     discriminate. Reverting the domain on that push leaves it passing, because the step test
     above already refuses the land tile and a single shove is at most half a tile. The domain
     there is still wrong without the fix - a hull afloat is not a hull trapped in a building -
     and for a land unit the change is a no-op, so it is a correction worth making and a
     regression guard worth keeping. It is not a fix this spec proves. */
  var crowd = await g.page.evaluate(function (s) {
    var G = window._rtsG, boats = [], i;
    for (i = 0; i < 5; i++) {
      var b = _rtsSpawnUnit('player', 'gunboat', _rtsWX(s.shoreWater.tx), _rtsWX(s.shoreWater.tz));
      if (b) { b.x = _rtsWX(s.shoreWater.tx); b.z = _rtsWX(s.shoreWater.tz); boats.push(b); }
    }
    if (boats.length < 3) return { error: 'could not crowd enough hulls together' };
    for (i = 0; i < 60 * 8; i++) _rtsTick(1 / 60);
    var beached = boats.filter(function (b) {
      if (b.dead) return false;
      var tx = _rtsTX(b.x), tz = _rtsTX(b.z);
      return !_rtsInB(tx, tz) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_WATER;
    }).map(function (b) { return _rtsTX(b.x) + ',' + _rtsTX(b.z); });
    var n = boats.length;
    boats.forEach(function (b) { b.dead = true; });
    return { n: n, beached: beached };
  }, sea);
  S.ok('several hulls can be crowded onto one cell beside the shore', !crowd.error,
       crowd.error || (crowd.n + ' gunboats stacked at ' + sea.shoreWater.tx + ',' + sea.shoreWater.tz));
  if (!crowd.error) {
    S.ok('shoving each other apart never pushes one of them ashore', !crowd.beached.length,
         crowd.beached.length ? ('beached at ' + crowd.beached.join(' ')) :
                                ('all ' + crowd.n + ' still afloat after 8s of jostling'));
  }

  /* ================================================== what a weapon can reach ====
     THE TORPEDO. "A torpedo runs in the water and cannot climb out, so a submarine is helpless
     against anything on land. That single restriction is what makes the Missile Sub worth twice
     the price instead of being a strictly better hull."

     Checked at the level of the rule and then at the level of the decision, because the rule is
     consulted in two places - target acquisition and the moment of firing - and a submarine
     that acquires a tank it can never shoot sits off the beach refusing to look for anything
     else, which is a different bug from one that fires and misses. */
  var reach = await g.page.evaluate(function () {
    var torp = RTS_WEAPONS.torpedo, rocket = RTS_WEAPONS.subrocket;
    var ship = { type: 'unit', def: 'gunboat' };
    var tank = { type: 'unit', def: 'tank' };
    var man = { type: 'unit', def: 'rifle' };
    var bld = { type: 'struct', def: 'power' };
    return {
      seaOnly: !!torp.seaOnly,
      torpVsShip: _rtsWeaponReaches(torp, ship),
      torpVsTank: _rtsWeaponReaches(torp, tank),
      torpVsMan: _rtsWeaponReaches(torp, man),
      torpVsBuilding: _rtsWeaponReaches(torp, bld),
      rocketSeaOnly: !!rocket.seaOnly,
      rocketVsShip: _rtsWeaponReaches(rocket, ship),
      rocketVsBuilding: _rtsWeaponReaches(rocket, bld),
      rocketVsTank: _rtsWeaponReaches(rocket, tank)
    };
  });
  S.eq('the torpedo is declared sea-only', reach.seaOnly, true);
  S.eq('...it reaches a ship', reach.torpVsShip, true);
  S.eq('...and cannot touch a tank', reach.torpVsTank, false);
  S.eq('...nor infantry', reach.torpVsMan, false);
  S.eq('...nor a building', reach.torpVsBuilding, false);
  S.eq('the missile sub\'s weapon is NOT sea-only - that is what it is paying for',
       reach.rocketSeaOnly, false);
  S.eq('...so it reaches a building', reach.rocketVsBuilding, true);
  S.eq('...and a tank', reach.rocketVsTank, true);
  S.eq('...and a ship as well', reach.rocketVsShip, true);

  /* the decision, with both kinds of target genuinely in range */
  var subPick = await g.page.evaluate(function (s) {
    var G = window._rtsG;
    /* in the shallows beside the beach, not out in the deep - the whole point is that a shore
       target is genuinely within reach and refused anyway */
    var sub = _rtsSpawnUnit('player', 'sub', _rtsWX(s.shoreWater.tx), _rtsWX(s.shoreWater.tz));
    if (!sub) return { error: 'no submarine' };
    /* an enemy tank on the beach and an enemy gunboat on the water, both well inside 22 */
    var tank = _rtsSpawnUnit('enemy', 'tank', _rtsWX(s.shore.tx), _rtsWX(s.shore.tz));
    var foeShip = _rtsSpawnUnit('enemy', 'gunboat', _rtsWX(s.shoreWater2.tx), _rtsWX(s.shoreWater2.tz));
    var w = RTS_WEAPONS[rtsUnitDef('sub').weapon];
    var range = w.range;
    var tankDist = tank ? _rtsRangeTo(sub, tank) : null;
    var shipDist = foeShip ? _rtsRangeTo(sub, foeShip) : null;
    /* with ONLY the tank present, the sub must pick nothing at all */
    if (foeShip) foeShip.inside = true;                 /* hide it from acquisition */
    var landOnly = _rtsFindTarget(sub, range, w);
    if (foeShip) foeShip.inside = false;
    /* with both present it must pick the ship */
    var both = _rtsFindTarget(sub, range, w);
    /* the control: a gunboat's gun is not sea-only and DOES take the tank */
    var boat = _rtsSpawnUnit('player', 'gunboat', _rtsWX(s.shoreWater.tx), _rtsWX(s.shoreWater.tz));
    var bw = RTS_WEAPONS[rtsUnitDef('gunboat').weapon];
    var boatPick = boat ? _rtsFindTarget(boat, bw.range, bw) : null;
    var out = {
      range: range, tankDist: tankDist, shipDist: shipDist,
      landOnly: landOnly ? landOnly.def : null,
      both: both ? both.def : null,
      boatPick: boatPick ? boatPick.def : null,
      boatRange: bw.range
    };
    [sub, tank, foeShip, boat].forEach(function (e) { if (e) e.dead = true; });
    return out;
  }, sea);
  S.ok('a submarine and both kinds of target exist', !subPick.error, subPick.error || '');
  if (!subPick.error) {
    S.ok('the tank is genuinely inside the torpedo\'s range', subPick.tankDist < subPick.range,
         'tank at ' + subPick.tankDist.toFixed(1) + ' against a range of ' + subPick.range);
    S.eq('a submarine with only a shore target in reach picks NOTHING', subPick.landOnly, null);
    S.eq('...and picks the ship the moment there is one', subPick.both, 'gunboat');
    S.ok('the control: a gunboat, whose gun is not sea-only, takes the shore target',
         subPick.boatPick === 'tank' || subPick.boatPick === 'gunboat',
         'the gunboat picked ' + subPick.boatPick);
  }

  /* --------------------------------------------------- reach from the water ----
     "Long reach is the point of a ship - it is the only thing in the game that can hit a base
     without being able to be walked up to", and the Missile Sub "bombards the shore from
     further out than anything can answer." Both are claims about NUMBERS, and the numbers are
     in a table that anybody can edit. */
  var ranges = await g.page.evaluate(function () {
    function rangeOf(def) { var w = def && def.weapon && RTS_WEAPONS[def.weapon]; return w ? w.range : 0; }
    var shoreDefence = 0, shoreName = '';
    RTS_STRUCTS.forEach(function (d) {
      var r = rangeOf(d);
      if (r > shoreDefence) { shoreDefence = r; shoreName = d.key; }
    });
    var landUnit = 0, landName = '';
    RTS_UNITS.forEach(function (d) {
      if (d.sea || d.air) return;
      var r = rangeOf(d);
      if (r > landUnit) { landUnit = r; landName = d.key; }
    });
    var subR = rangeOf(rtsUnitDef('missilesub'));
    var destR = rangeOf(rtsUnitDef('destroyer'));
    return { shoreDefence: shoreDefence, shoreName: shoreName,
             landUnit: landUnit, landName: landName, sub: subR, dest: destR };
  });
  S.ok('the Missile Sub outranges every defensive structure',
       ranges.sub > ranges.shoreDefence,
       'missilesub ' + ranges.sub + ' against the best shore gun (' + ranges.shoreName + ') at ' + ranges.shoreDefence);
  /* NOT "further out than anything can answer", which is what the roster blurb says. Artillery
     matches the Missile Sub at 34, so a battery on the beach trades with it rather than being
     bombarded for free. That is a fair fight and arguably the better balance, but it is not
     what the description promises, so the assertion is written to the fact and the gap is
     reported rather than smoothed over. */
  S.ok('...and is at least the equal of the longest-reaching land unit',
       ranges.sub >= ranges.landUnit,
       'missilesub ' + ranges.sub + ' against the longest land weapon (' + ranges.landName +
       ') at ' + ranges.landUnit +
       (ranges.sub === ranges.landUnit ? ' - a TIE, so artillery can answer it' : ''));
  S.ok('the Destroyer also outreaches the shore', ranges.dest > ranges.shoreDefence,
       'destroyer ' + ranges.dest + ' against ' + ranges.shoreDefence);

  /* ==================================================== the air/ground contract ====
     _rtsFindTarget states it outright: "A weapon without `aa` cannot engage anything flying,
     and an aircraft's own weapons cannot reach another aircraft either - our helicopter carries
     no air-to-air, exactly as the Longbow does not."

     e2e/airforce tests the aaOnly half of this - that an AA gun ignores the ground. This is the
     other half, which nothing tested: that the ground ignores the AIR. Delete the guard and
     every tank in the game becomes an anti-aircraft gun, which is not a crash and not visible
     in any menu. */
  var airRule = await g.page.evaluate(function (s) {
    var G = window._rtsG;
    /* put the fight somewhere clear so nothing else wanders into it */
    var at = { x: _rtsWX(s.shore.tx), z: _rtsWX(s.shore.tz) };
    var tank = _rtsSpawnUnit('player', 'tank', at.x, at.z);
    if (!tank) return { error: 'no tank' };
    var heli = _rtsSpawnUnit('enemy', 'heli', at.x + 2, at.z + 2);
    if (!heli) { tank.dead = true; return { error: 'no aircraft' }; }
    var tw = RTS_WEAPONS[rtsUnitDef('tank').weapon];
    var dist = _rtsRangeTo(tank, heli);
    var tankPick = _rtsFindTarget(tank, tw.range, tw);
    /* the control: put an enemy TANK there too and the same gun takes it happily, which proves
       the refusal above is about the target being airborne and not about range or sides */
    var foeTank = _rtsSpawnUnit('enemy', 'tank', at.x + 2, at.z - 2);
    var withGround = _rtsFindTarget(tank, tw.range, tw);
    /* a rocket soldier carries `aa` and must take the aircraft */
    var man = _rtsSpawnUnit('player', 'rocket', at.x - 2, at.z);
    var mw = man ? RTS_WEAPONS[rtsUnitDef('rocket').weapon] : null;
    if (foeTank) foeTank.inside = true;                 /* only the aircraft on offer */
    var manPick = man ? _rtsFindTarget(man, mw.range, mw) : null;
    if (foeTank) foeTank.inside = false;
    /* and an aircraft's own weapon must not reach another aircraft */
    var hw = RTS_WEAPONS[rtsUnitDef('heli').weapon];
    var foeHeli = _rtsSpawnUnit('player', 'heli', at.x + 4, at.z + 2);
    /* Only the other aircraft on offer. Left on the board, the player's tank and rocket
       soldier are perfectly good targets for an enemy helicopter - it picked the tank, which
       is correct behaviour and says nothing at all about air-to-air. */
    [tank, man].forEach(function (e) { if (e) e.inside = true; });
    var heliPick = _rtsFindTarget(heli, hw.range, hw);
    /* the control: with the ground targets back, the same helicopter engages at once */
    [tank, man].forEach(function (e) { if (e) e.inside = false; });
    var heliGround = _rtsFindTarget(heli, hw.range, hw);
    var out = {
      dist: dist, tankRange: tw.range,
      tankPick: tankPick ? tankPick.def : null,
      withGround: withGround ? withGround.def : null,
      tankHasAA: !!tw.aa,
      manHasAA: !!(mw && mw.aa),
      manPick: manPick ? manPick.def : null,
      heliHasAA: !!hw.aa,
      heliPick: heliPick ? heliPick.def : null,
      heliGround: heliGround ? heliGround.def : null
    };
    [tank, heli, foeTank, man, foeHeli].forEach(function (e) { if (e) e.dead = true; });
    return out;
  }, sea);
  S.ok('a tank and an aircraft can be put nose to nose', !airRule.error, airRule.error || '');
  if (!airRule.error) {
    S.ok('the aircraft is well inside the tank\'s range', airRule.dist < airRule.tankRange,
         'aircraft at ' + airRule.dist.toFixed(1) + ' against a range of ' + airRule.tankRange);
    S.eq('the tank\'s gun is not anti-air', airRule.tankHasAA, false);
    S.eq('...so with only an aircraft in reach it picks NOTHING', airRule.tankPick, null);
    S.eq('...while a ground target at the same distance is taken at once', airRule.withGround, 'tank');
    S.eq('a rocket soldier does carry anti-air', airRule.manHasAA, true);
    S.eq('...and takes the aircraft', airRule.manPick, 'heli');
    S.eq('an aircraft carries no air-to-air', airRule.heliHasAA, false);
    S.eq('...so with only another aircraft in reach it picks NOTHING', airRule.heliPick, null);
    S.ok('...while the same helicopter takes a ground target at once',
         airRule.heliGround === 'tank' || airRule.heliGround === 'rocket',
         'it picked ' + airRule.heliGround);
  }

  /* ------------------------------------------------------ the opponent HAS a navy now ----
     This section used to be a note recording that it did not: no shipyard in the base plan,
     no `ship` category in the production mix, naval player-only by omission. Two things had
     to change to make it real, and the first was the map.

     A generated map put ONE lake at a hardcoded (88,88) while the starts rotate around a ring
     of eight, so whether anyone could reach the sea was down to which start came up. Measured
     across eight seeds: the opponent could place a shipyard on two of them, the player on
     one, and on five neither side could. Four ship types, two shipyards and every naval
     weapon were unreachable on most maps - for the PLAYER as much as the opponent. */
  var sea = await g.page.evaluate(function () {
    var out = { seeds: [] };
    for (var sd = 9001; sd <= 9006; sd++) {
      if (document.getElementById('rcgRts')) rtsClose();
      rtsOpen(sd);
      var U = window._rtsUI;
      if (U) { U.dead = true; try { cancelAnimationFrame(U.raf); } catch (e) {} }
      var G = window._rtsG, i;

      /* a shipyard this side could actually place, found the way _rtsAIPlace finds one */
      function spots(side) {
        var yard = rtsHouseSide(side) === 'allied' ? 'navalyard' : 'subpen', n = 0;
        var anchors = G.ents.filter(function (e) {
          return !e.dead && e.type === 'struct' && e.side === side; });
        for (var a = 0; a < anchors.length; a++) {
          var an = anchors[a], R = RTS_BUILD_RADIUS;
          for (var tx = an.tx - R; tx <= an.tx + R; tx++)
            for (var tz = an.tz - R; tz <= an.tz + R; tz++)
              if (_rtsCanPlace(side, yard, tx, tz)) n++;
        }
        return n;
      }
      /* the sea has to be ONE body or two fleets can never meet */
      var seen = new Uint8Array(RTS_N * RTS_N), total = 0, biggest = 0;
      for (i = 0; i < G.terrain.length; i++) if (G.terrain[i] === RTS_T_WATER) total++;
      for (i = 0; i < G.terrain.length; i++) {
        if (G.terrain[i] !== RTS_T_WATER || seen[i]) continue;
        var st = [i], n = 0; seen[i] = 1;
        while (st.length) {
          var c = st.pop(), x = c % RTS_N, z = (c / RTS_N) | 0; n++;
          for (var d = 0; d < 4; d++) {
            var nx = x + [1, -1, 0, 0][d], nz = z + [0, 0, 1, -1][d];
            if (!_rtsInB(nx, nz)) continue;
            var ni = _rtsIdx(nx, nz);
            if (seen[ni] || G.terrain[ni] !== RTS_T_WATER) continue;
            seen[ni] = 1; st.push(ni);
          }
        }
        if (n > biggest) biggest = n;
      }
      /* and the land war must be untouched by all that water */
      var land = new Uint8Array(RTS_N * RTS_N), sp = G.starts.player, se = G.starts.enemy;
      var ls = [_rtsIdx(sp.tx, sp.tz)]; land[ls[0]] = 1;
      while (ls.length) {
        var lc = ls.pop(), lx = lc % RTS_N, lz = (lc / RTS_N) | 0;
        for (var ld = 0; ld < 4; ld++) {
          var mx = lx + [1, -1, 0, 0][ld], mz = lz + [0, 0, 1, -1][ld];
          if (!_rtsInB(mx, mz)) continue;
          var mi = _rtsIdx(mx, mz);
          if (land[mi] || G.blocked[mi] === 2) continue;
          land[mi] = 1; ls.push(mi);
        }
      }
      var oreOut = 0;
      for (i = 0; i < G.scrap.length; i++) if (G.scrap[i] > 0 && !land[i]) oreOut++;

      out.seeds.push({ seed: sd, player: spots('player'), enemy: spots('enemy'),
                       water: total, biggest: biggest,
                       foeReachable: !!land[_rtsIdx(se.tx, se.tz)], oreStranded: oreOut,
                       seaWaypoint: !!(G.waypt && G.waypt.sea) });
    }
    return out;
  });
  var S6 = sea.seeds;
  S.ok('every seed gives the PLAYER a shore it can build a shipyard on',
       S6.every(function (r) { return r.player > 0; }),
       S6.map(function (r) { return r.player; }).join(', ') + ' placements');
  S.ok('...and the opponent one too, or its naval branch is decoration',
       S6.every(function (r) { return r.enemy > 0; }),
       S6.map(function (r) { return r.enemy; }).join(', ') + ' placements');
  S.ok('the sea is ONE body, so two fleets can actually meet',
       S6.every(function (r) { return r.biggest === r.water; }),
       S6.map(function (r) { return r.biggest + '/' + r.water; }).join('  '));
  S.ok('...without cutting the land route between the bases',
       S6.every(function (r) { return r.foeReachable; }), 'all ' + S6.length + ' seeds');
  S.ok('...or stranding ore behind it', S6.every(function (r) { return r.oreStranded === 0; }),
       S6.map(function (r) { return r.oreStranded; }).join(', ') + ' cells cut off');
  S.ok('and there is a sea waypoint for a fleet to steer at',
       S6.every(function (r) { return r.seaWaypoint; }),
       'a land waypoint would have a fleet steering at a beach it cannot reach');

  /* The plan itself, and the two guards that keep it from doing harm. */
  var plan = await g.page.evaluate(function () {
    var yards = RTS_STRUCTS.filter(function (s) { return s.produces === 'ship'; }).map(function (s) { return s.key; });
    if (document.getElementById('rcgRts')) rtsClose();
    window._RTS_DIFF = 'hard';
    rtsOpen(9001);
    var U = window._rtsUI;
    if (U) { U.dead = true; try { cancelAnimationFrame(U.raf); } catch (e) {} }
    var G = window._rtsG;
    for (var i = 0; i < 60 * 420; i++) { G.over = null; _rtsTick(1 / 60); }
    var teams = {};
    for (var id in G.teams) teams[G.teams[id].type.name] = (teams[G.teams[id].type.name] || 0) + 1;
    return {
      inRatio: yards.filter(function (k) { return RTS_AI.ratio[k] != null; }),
      inOrder: yards.filter(function (k) { return RTS_AI.buildOrder.indexOf(k) >= 0; }),
      mixKeys: Object.keys(RTS_AI.mix),
      house: rtsHouseSide('enemy'),
      builtYards: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'struct' &&
                    (rtsStructDef(e.def) || {}).produces === 'ship'; }).length,
      hulls: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'unit' &&
               (rtsUnitDef(e.def) || {}).sea; }).length,
      cap: RTS_AI.fleetPerYard,
      teams: teams,
      /* the gate: on a map with no reachable coast the plan must not demand a yard, or the
         walk returns it forever and everything after it is never built */
      shoreSpot: !!_rtsAIShoreSpot(rtsHouseSide('enemy') === 'allied' ? 'navalyard' : 'subpen')
    };
  });
  S.ok('the opponent has a shipyard in its base plan', plan.inRatio.length && plan.inOrder.length,
       'ratio: ' + plan.inRatio.join('/') + ', order: ' + plan.inOrder.join('/'));
  S.ok('...and a ship line in its production mix', plan.mixKeys.indexOf('ship') >= 0,
       plan.mixKeys.join('/'));
  S.ok('...and actually builds one', plan.builtYards > 0,
       plan.builtYards + ' yards as a ' + plan.house + ' house');
  S.ok('...and crews it', plan.hulls > 0, plan.hulls + ' hulls');
  S.ok('...up to the fleet cap and no further', plan.hulls <= plan.builtYards * plan.cap,
       plan.hulls + ' hulls against ' + plan.builtYards + ' x ' + plan.cap);
  /* A house builds one side's hulls only, so exactly one of the two naval team types is
     crewable by it. _rtsSuggestTeam counts IDLE units, not matching ones, so without a
     buildability check the uncrewable type passes the size test, takes a slot, recruits
     nobody, never reaches full strength and therefore never marches or frees the slot. */
  var wrong = plan.house === 'allied' ? 'Wolfpack' : 'Flotilla';
  var right = plan.house === 'allied' ? 'Flotilla' : 'Wolfpack';
  S.ok('a house never raises the naval team it cannot crew', !plan.teams[wrong],
       'as ' + plan.house + ': ' + JSON.stringify(plan.teams));
  S.ok('...and does raise the one it can', !!plan.teams[right], right + ': ' + (plan.teams[right] || 0));

  S.ok('the page logged no errors throughout', !g.errors.length,
       g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
