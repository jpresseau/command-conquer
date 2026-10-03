/* Naval combat, the half about the SEA: where a ship can be built, and that it stays on it.
   e2e/navair is the other half - what a weapon can reach, and the opponent's navy. One spec
   until it passed 500 lines; split at the seam between the sea and the weapons, each half
   opening its own match from the same seed, so either runs alone.

   Sea and air are the same kind of feature seen twice. Both add units that move where nothing
   else can, and both are held up entirely by RESTRICTIONS - a ship that could drive onto land,
   a torpedo that could climb a beach, a tank that could shoot down a plane, and each of them
   stops being a domain and becomes a strictly better version of the land game. The restrictions
   are the feature. Every one is a `continue` in a loop or a branch in a passability test, which
   is to say every one is a line that can be deleted without anything failing to run.

   Naval had no spec at all. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');
var { seaSurvey } = require('../lib/sea.js');

var S = new Suite('navsea');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  await g.start(7, 10, { freeze: true });

  /* ------------------------------------------------------------------- the sea ----
     A generated map is not guaranteed to be interesting, so the water is measured before
     anything is asserted about it. A spec that quietly did nothing on a dry map would be the
     worst outcome here: it would report success for a subsystem it never reached. */
  var sea = await g.page.evaluate(seaSurvey);
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


  S.ok('the page logged no errors throughout', !g.errors.length,
       g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
