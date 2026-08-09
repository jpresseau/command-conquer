/* THE APC HAD FIVE SEATS AND NO DOOR.

   Everything about carrying units was implemented and commented: _rtsCanBoard, _rtsBoard, the
   ride-along in _rtsUpdateUnit, the unload ring, and UNIT.CPP's Death rule that spills infantry
   out of a wreck instead of killing them with it. The one thing missing was the way in. The
   board check sat inside _rtsRightClick's `if (tgt.side === 'enemy')` block, guarded by
   `tgt.side === mu.side` - and `mine` is filtered to your own units two lines earlier, so those
   two conditions can never both hold. The branch was unreachable from the moment it was written.

   Measured before the fix, seed 7, one rifle squad right-clicked onto its own APC:

     order after the click   'move'      (not 'board')
     squad's target          not the APC
     APC cargo after 100s    0 of 5
     final distance          0.75 tiles - it walked over and stood there

   Calling _rtsOrderBoard by hand in the same match loaded it on the first try. The transport
   worked; the only route a player has to it did not.

   THIS SPEC CLICKS. Every assertion here goes through _rtsRightClick with real screen
   coordinates, because that is precisely the layer the bug was in - a spec that called
   _rtsOrderBoard would have passed against the broken build. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('transport');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1280, height: 800 });
  await g.start(7, 5, { freeze: true });

  var r = await g.page.evaluate(function () {
    var G = window._rtsG, yd = _rtsHas('player', 'yard');
    if (!yd) return { error: 'no command yard' };
    function screen(e) {
      _rtsR.focus.x = e.x; _rtsR.focus.z = e.z; _rtsClampFocus();
      return _rtsWorldToScreen(e.x, 1, e.z);
    }
    function run(secs) {
      for (var i = 0; i < secs * 60; i++) { _rtsTick(1 / 60); if (G.over) return false; }
      return true;
    }
    var out = { cap: (rtsUnitDef('apc') || {}).carries };

    /* ---- one squad, right-clicked onto its own APC ---- */
    var apc = _rtsSpawnUnit('player', 'apc', yd.x + RTS_TILE * 4, yd.z);
    var inf = _rtsSpawnUnit('player', 'rifle', yd.x + RTS_TILE * 4, yd.z + RTS_TILE * 3);
    if (!apc || !inf) return { error: 'could not spawn an APC and a squad' };
    G.sel.length = 0; G.sel.push(inf);
    var sc = screen(apc);
    out.picked = (_rtsPickAt(sc.x, sc.y) || {}).ent === apc;
    _rtsRightClick(sc.x, sc.y);
    out.order = inf.order;                       /* 'move' before the fix */
    out.aimed = inf.target === apc;
    if (!run(60)) return { error: 'match ended' };
    out.cargo = _rtsCargoCount(apc);
    out.aboard = !!inf.inside;
    /* A passenger stays in G.ents - that is what makes the save work - so the four places that
       mean "on the map" have to say so. Two of them are checked here. */
    out.inEnts = G.ents.indexOf(inf) >= 0;
    out.selectable = _rtsIsArmy(inf);
    out.selected = G.sel.indexOf(inf) >= 0;

    /* ---- and it rides along rather than staying where it got in ---- */
    var was = { x: inf.x, z: inf.z };
    _rtsOrderMove(apc, yd.x - RTS_TILE * 10, yd.z + RTS_TILE * 8, false);
    if (!run(30)) return { error: 'match ended' };
    out.moved = Math.hypot(apc.x - was.x, apc.z - was.z) / RTS_TILE;
    out.ridesAlong = Math.hypot(inf.x - apc.x, inf.z - apc.z) < 0.001;

    /* ---- a group: five get in, the sixth and the tank do not ---- */
    var apc2 = _rtsSpawnUnit('player', 'apc', yd.x + RTS_TILE * 8, yd.z);
    var squad = [], k;
    for (k = 0; k < 6; k++)
      squad.push(_rtsSpawnUnit('player', 'rifle', yd.x + RTS_TILE * 8, yd.z + RTS_TILE * (3 + k * 0.6)));
    var tank = _rtsSpawnUnit('player', 'tank', yd.x + RTS_TILE * 8, yd.z + RTS_TILE * 7);
    G.sel.length = 0;
    squad.forEach(function (s2) { if (s2) G.sel.push(s2); });
    if (tank) G.sel.push(tank);
    out.group = G.sel.length;
    var sc2 = screen(apc2);
    _rtsRightClick(sc2.x, sc2.y);
    out.boardOrders = squad.filter(function (s2) { return s2 && s2.order === 'board'; }).length;
    /* The APC takes 5. The sixth squad and the tank cannot get in, and must still have been
       given the move order rather than dropped on the floor. */
    out.tankOrder = tank ? tank.order : null;
    if (!run(90)) return { error: 'match ended' };
    out.cargo2 = _rtsCargoCount(apc2);
    out.left = squad.filter(function (s2) { return s2 && !s2.dead && !s2.inside; }).length;
    out.tankAboard = tank ? !!tank.inside : null;

    /* ---- U unloads, and they come out around it ---- */
    G.sel.length = 0; G.sel.push(apc2);
    var before = _rtsCargoCount(apc2);
    var n = 0; G.sel.forEach(function (t) { n += _rtsUnload(t); });
    out.unloadedNow = n;
    out.cargoAfterUnload = _rtsCargoCount(apc2);
    out.outAgain = squad.filter(function (s2) { return s2 && !s2.dead && !s2.inside; }).length;
    out.unloadedBefore = before;

    /* ---- and the wreck rule: passengers walk away from a destroyed APC ---- */
    G.sel.length = 0; G.sel.push(inf);
    var sc3 = screen(apc);
    G.sel.length = 0; G.sel.push(inf);
    out.stillAboard = _rtsCargoCount(apc);
    _rtsKill(apc);
    out.spilled = !inf.dead && !inf.inside;
    return out;
  });

  S.ok('the match could be set up', !r.error, r.error || 'ok');
  if (!r.error) {
    S.eq('an APC has five seats', r.cap, 5);
    S.ok('right-clicking one picks the APC itself', r.picked, String(r.picked));
    /* THE BUG, in one assertion. */
    S.eq('...and that is a BOARD order, not a move order', r.order, 'board');
    S.ok('...aimed at the transport', r.aimed, String(r.aimed));
    S.eq('the squad ends up inside it', r.cargo, 1);
    S.ok('...and is marked aboard', r.aboard, String(r.aboard));
    S.ok('a passenger stays in the entity list, so a save can find it', r.inEnts, String(r.inEnts));
    S.ok('...but is no longer part of your army on the map', !r.selectable, String(r.selectable));
    S.ok('...and is dropped from the selection', !r.selected, String(r.selected));

    S.note('the APC drove ' + r.moved.toFixed(1) + ' tiles with it aboard');
    S.ok('the transport can then drive off', r.moved > 4, r.moved.toFixed(2) + ' tiles');
    S.ok('...and the passenger rides along instead of staying put', r.ridesAlong,
         String(r.ridesAlong));

    S.eq('a group of six squads and a tank is selected', r.group, 7);
    S.eq('...all six squads take the board order', r.boardOrders, 6);
    S.eq('...the tank, which cannot get in, is given a move order instead', r.tankOrder, 'move');
    S.eq('...five of them fit', r.cargo2, 5);
    S.eq('...one is left outside', r.left, 1);
    S.eq('...and the tank never gets in', r.tankAboard, false);

    S.eq('U unloads the whole hold at once', r.unloadedNow, r.unloadedBefore);
    S.eq('...leaving it empty', r.cargoAfterUnload, 0);
    S.eq('...with everyone back on the map', r.outAgain, 6);

    S.eq('the first APC still has its passenger', r.stillAboard, 1);
    S.ok('...who walks away when it is destroyed rather than dying in it', r.spilled,
         String(r.spilled));
  }

  /* ================================================================== the landing craft ==

     A SYNTHETIC CHANNEL, and it is synthetic on purpose. No maps ship in this repo, and a
     generated one has water wherever the seed put it - which is not a place to hang assertions.
     So the arena is cut into the live grid: a five-tile band of water down the full height of
     the map, between the two starts, after which the two halves genuinely have no land route
     between them. That is asserted rather than assumed, because it is the whole premise: if a
     tank can walk round the channel then getting it across proves nothing.

     WHAT THIS DOES NOT CLAIM is that such a map would load. _rtsMapCheck's reachability flood
     is four-way and LAND ONLY, so a real map whose halves join only by sea is refused before
     the battle starts - deliberately, and it stays that way. The reason is the opponent: there
     is no amphibious logic in the AI (see the note in rules/ai.js), so on a sea-split map the
     player could cross and the opponent could not, and the "battle" would be one side shelling
     a base that can never answer. The craft is for maps that HAVE a land route and also have
     water - an island of ore, a flank the road does not reach, a beach behind the guns. That
     limit is pinned as its own assertion below so that lifting it has to be a decision. */
  var sea = await g.page.evaluate(function () {
    var G = window._rtsG;
    /* THE PLAYER IS KEPT STANDING for the whole of this arena, exactly as e2e/raid does.
       Cutting an eleven-tile channel through the middle of a live match is a violent thing to do
       to it, and the match started ENDING partway through the crossing - which turns every
       assertion after that point into "the battle finished first" rather than into anything
       about transports.

       ONE SIDE, NOT BOTH, and that is a correction rather than a detail. Healing everything
       means nothing ever dies, both armies accumulate for the whole run, and the per-tick cost
       goes quadratic in the entity count: the first attempt at this ran for many minutes without
       reaching a single assertion. Healing the player alone removes the loss condition - which
       is all that was wanted - while the opponent's units still die to the player's defences and
       the population stays bounded. */
    function keepAlive() {
      for (var k = 0; k < G.ents.length; k++) {
        var e = G.ents[k];
        if (!e.dead && e.side === 'player') e.hp = e.maxHp;
      }
    }
    function run(secs, until) {
      for (var i = 0; i < secs * 60; i++) {
        _rtsTick(1 / 60);
        keepAlive();
        if (G.over) return 'match ended';
        if (until && until()) return null;
      }
      return until ? 'timed out' : null;
    }
    var yd = _rtsHas('player', 'yard'), ey = _rtsHas('enemy', 'yard');
    if (!yd || !ey) return { error: 'no yards' };

    /* the channel, midway between the two starts */
    /* ELEVEN TILES WIDE, and the width is chosen rather than picked: RTS_UNLOAD_REACH is 3, so
       a narrow channel has a usable bank within reach from the middle of it and "unloading in
       open water" would not be open water at all. Measured on a five-tile channel: the craft
       sat in the centre and put its passenger on a bank three cells away, which is the case
       this arena exists to forbid. From the middle of eleven, every bank is five cells off. */
    var mid = Math.round((_rtsTX(yd.x) + _rtsTX(ey.x)) / 2);
    var c0 = mid - 5, c1 = mid + 5;
    for (var tz = 0; tz < RTS_N; tz++) {
      for (var tx = c0; tx <= c1; tx++) {
        var ix = _rtsIdx(tx, tz);
        G.terrain[ix] = RTS_T_WATER; G.blocked[ix] = 2;
        G.scrap[ix] = 0; G.gems[ix] = 0;
      }
    }
    G.scrapDirty = true;
    /* PICK THE ROW, do not assume one. Taking the yard's row and stepping two cells off each
       edge quietly depends on what the map generator happened to put there: on this seed the
       cell east of the channel was inside a forest, so `east` came back as the nearest open land
       TEN cells further on, and _rtsPath could then find no water within reach of it - the
       unload order was refused and four assertions failed for a reason that had nothing to do
       with transports. So both banks are searched for, and the row is one where each bank is
       open ground within two cells of the water. */
    var row = null, west = null, east = null, wet = null;
    for (var dr = 0; dr < 40 && !row; dr++) {
      for (var sgn = 1; sgn >= -1 && !row; sgn -= 2) {
        var r0 = _rtsTX(yd.z) + dr * sgn;
        if (r0 < 4 || r0 > RTS_N - 5) continue;
        var w0 = _rtsNearestOpen(c0 - 1, r0, 2, null);
        var e0 = _rtsNearestOpen(c1 + 1, r0, 2, null);
        var s0 = _rtsNearestOpen(mid, r0, 3, 'sea');
        if (w0 && e0 && s0) { row = r0; west = w0; east = e0; wet = s0; }
        if (!dr) break;
      }
    }
    if (!west || !east || !wet) return { error: 'no row has clear banks on both sides of the channel' };
    var out = {
      channel: [c0, c1], row: row,
      banks: [c0 - west[0], east[0] - c1],
      /* what the unload order has to be able to path to, reported so a refusal is legible */
      seaByEast: !!_rtsNearestOpen(east[0], east[1], 6, 'sea'),
      /* THE PREMISE. No land route from one bank to the other, in either direction. */
      landRoute: !!_rtsPath(_rtsWX(west[0]), _rtsWX(west[1]), _rtsWX(east[0]), _rtsWX(east[1]), null),
      seaRoute: !!_rtsPath(_rtsWX(wet[0]), _rtsWX(wet[1]), _rtsWX(wet[0]), _rtsWX(wet[1] + 8), 'sea')
    };

    /* ---- a Battle Tank crosses ---- */
    var lst = _rtsSpawnUnit('player', 'lst', _rtsWX(wet[0]), _rtsWX(wet[1]));
    var tank = _rtsSpawnUnit('player', 'tank', _rtsWX(west[0]), _rtsWX(west[1]));
    if (!lst || !tank) return { error: 'could not put a craft and a tank on the board' };
    out.startedWest = _rtsTX(tank.x) < c0;
    out.canBoard = _rtsCanBoard(tank, lst);
    /* nose the craft against the west bank so the tank has something to walk to */
    var pier = _rtsNearestOpen(c0, west[1], 6, 'sea');
    _rtsOrderMove(lst, _rtsWX(pier[0]), _rtsWX(pier[1]), false);
    var e1 = run(30, function () { return !lst.path; });
    G.sel.length = 0; G.sel.push(tank);
    _rtsR.focus.x = lst.x; _rtsR.focus.z = lst.z; _rtsClampFocus();
    var sp = _rtsWorldToScreen(lst.x, 1, lst.z);
    _rtsRightClick(sp.x, sp.y);
    out.tankOrder = tank.order;
    var e2 = run(60, function () { return !!tank.inside; });
    out.aboard = !!tank.inside;
    out.loadErr = e2;

    /* ...and is put down on the far bank by a right-click on it */
    if (out.aboard) {
      G.sel.length = 0; G.sel.push(lst);
      var ep = _rtsWorldToScreen(_rtsWX(east[0]), 1, _rtsWX(east[1]));
      _rtsR.focus.x = _rtsWX(east[0]); _rtsR.focus.z = _rtsWX(east[1]); _rtsClampFocus();
      ep = _rtsWorldToScreen(_rtsWX(east[0]), 1, _rtsWX(east[1]));
      _rtsRightClick(ep.x, ep.y);
      out.craftOrder = lst.order;
      var e3 = run(120, function () { return !_rtsCargoCount(lst); });
      out.unloadErr = e3;
      out.landedAlive = !tank.dead && !tank.inside;
      var ttx = _rtsTX(tank.x), ttz = _rtsTX(tank.z);
      out.landedOnLand = _rtsInB(ttx, ttz) && G.terrain[_rtsIdx(ttx, ttz)] !== RTS_T_WATER;
      out.landedEast = ttx > c1;
      /* and it can drive once it is there - a unit put down on a cell it cannot occupy is
         ashore in name only */
      out.canDrive = !!_rtsPath(tank.x, tank.z, _rtsWX(east[0] + 4), _rtsWX(east[1] + 4), null);
    }

    /* ---- unloading in open water is refused, and says so ---- */
    var lst2 = _rtsSpawnUnit('player', 'lst', _rtsWX(wet[0]), _rtsWX(wet[1] + 10));
    var rider = _rtsSpawnUnit('player', 'rifle', _rtsWX(west[0]), _rtsWX(west[1]));
    /* WHY, if the passenger ever stops being there. A rider that quietly vanishes from a hold
       fails four assertions at once and none of them says what happened to it - which is how
       the first run of this spec read, before the crush and blast rules were fixed. Everything
       that touches it is recorded and reported, so the next disappearance names its cause. */
    var log = [], realKill = window._rtsKill, realDmg = window._rtsDamage;
    window._rtsKill = function (x) {
      if (x === rider) log.push('killed at t=' + Math.round(G.t) + (x.crushed ? ' CRUSHED' : '') +
                                ' by ' + (x.hurtBy || '?') + ' hp=' + Math.round(x.hp));
      return realKill.apply(null, arguments);
    };
    window._rtsDamage = function (t, dmg, from) {
      if (t === rider) log.push('hit for ' + Math.round(dmg) + ' at t=' + Math.round(G.t) +
                                ' by ' + (from ? from.def : 'a blast'));
      return realDmg.apply(null, arguments);
    };
    var pier2 = _rtsNearestOpen(c0, west[1], 6, 'sea');
    _rtsOrderMove(lst2, _rtsWX(pier2[0]), _rtsWX(pier2[1]), false);
    run(30, function () { return !lst2.path; });
    _rtsOrderBoard(rider, lst2);
    run(60, function () { return !!rider.inside; });
    out.riderAboard = !!rider.inside;
    /* out to the middle of the channel, where every cell within reach is water */
    _rtsOrderMove(lst2, _rtsWX(mid), _rtsWX(west[1] + 20), false);
    run(60, function () { return !lst2.path; });
    G.msg = '';
    out.midChannel = _rtsUnload(lst2);
    out.stillAboard = _rtsCargoCount(lst2);
    G.sel.length = 0; G.sel.push(lst2);
    _rtsKeyDown({ key: 'u', preventDefault: function () {} });
    out.said = G.msg || '';

    /* ---- and a craft sunk out there takes its cargo down ---- */
    var was = rider.dead;
    _rtsKill(lst2);
    out.drowned = !was && rider.dead;
    out.notLeftAboard = !rider.inside;
    window._rtsKill = realKill; window._rtsDamage = realDmg;
    out.riderLog = log;

    /* ---- the same craft wrecked against the beach lands them instead ---- */
    var lst3 = _rtsSpawnUnit('player', 'lst', _rtsWX(pier2[0]), _rtsWX(pier2[1]));
    var rider2 = _rtsSpawnUnit('player', 'rifle', _rtsWX(west[0]), _rtsWX(west[1]));
    _rtsOrderBoard(rider2, lst3);
    run(60, function () { return !!rider2.inside; });
    out.rider2Aboard = !!rider2.inside;
    _rtsKill(lst3);
    out.beachedSurvivor = !rider2.dead && !rider2.inside;
    var r2x = _rtsTX(rider2.x), r2z = _rtsTX(rider2.z);
    out.beachedOnLand = !rider2.dead && _rtsInB(r2x, r2z) &&
                        G.terrain[_rtsIdx(r2x, r2z)] !== RTS_T_WATER;
    out.setup = e1;
    return out;
  });

  S.ok('the channel arena could be cut', !sea.error, sea.error || 'ok');
  if (!sea.error) {
    S.note('channel at tiles ' + sea.channel.join('-') + ', row ' + sea.row +
           ', banks ' + sea.banks.join(' and ') + ' cells off the water');
    S.ok('the far bank has water within reach for the craft to unload from', sea.seaByEast,
         String(sea.seaByEast));
    /* THE PREMISE, asserted. */
    S.ok('the two banks have no land route between them', !sea.landRoute,
         sea.landRoute ? 'a tank could walk round - the arena proves nothing' : 'genuinely split');
    S.ok('...and the water between them is navigable', sea.seaRoute, String(sea.seaRoute));

    S.ok('the tank starts on the west bank', sea.startedWest, String(sea.startedWest));
    S.ok('a landing craft accepts a VEHICLE, which an APC does not', sea.canBoard,
         String(sea.canBoard));
    S.eq('right-clicking the craft is a board order', sea.tankOrder, 'board');
    S.ok('...and the tank gets aboard from the beach', sea.aboard, sea.loadErr || 'aboard');

    S.eq('right-clicking the far bank is an unload order', sea.craftOrder, 'unload');
    S.ok('the hold is empty by the end of the crossing', !sea.unloadErr, sea.unloadErr || 'unloaded');
    S.ok('...and the tank is alive and out', sea.landedAlive, String(sea.landedAlive));
    /* THE BUG THE DOMAIN-AWARE UNLOAD EXISTS FOR: the old ring put passengers at eight fixed
       positions round the hull without asking whether they could stand there, and round a boat
       every one of those is open sea. */
    S.ok('...standing on LAND rather than in the sea', sea.landedOnLand, String(sea.landedOnLand));
    S.ok('...on the far bank', sea.landedEast, String(sea.landedEast));
    S.ok('...and able to drive off from where it was put down', sea.canDrive, String(sea.canDrive));

    S.note('what happened to the second craft\'s passenger: ' +
           ((sea.riderLog || []).join(' / ') || 'nothing touched it'));
    S.ok('a squad boards the second craft', sea.riderAboard, String(sea.riderAboard));
    S.eq('unloading in mid-channel puts nobody ashore', sea.midChannel, 0);
    S.eq('...and keeps them aboard rather than losing them', sea.stillAboard, 1);
    S.ok('...and the U key says why instead of appearing to do nothing',
         /nowhere to unload/i.test(sea.said), JSON.stringify(sea.said));

    S.ok('a craft sunk in open water takes its cargo down with it', sea.drowned,
         String(sea.drowned));
    S.ok('...and does not leave a live passenger flagged aboard a wreck', sea.notLeftAboard,
         String(sea.notLeftAboard));

    S.ok('a squad boards the third craft, beached', sea.rider2Aboard, String(sea.rider2Aboard));
    S.ok('the SAME hull wrecked against the beach lands its cargo instead', sea.beachedSurvivor,
         String(sea.beachedSurvivor));
    S.ok('...on dry ground', sea.beachedOnLand, String(sea.beachedOnLand));
  }

  /* ---- the boarding rules, as a table ---- */
  var rules = await g.page.evaluate(function () {
    /* Bare entity shells rather than spawned units, and deliberately: _rtsCanBoard is a
       question about two TYPES and reads nothing but side, def, dead and inside. Spawning real
       ones needs somewhere legal to put them - a submarine cannot be placed on grass, and the
       Command Yard this used to measure from is not guaranteed to still be standing by the time
       the crossing sections have run. That is not a property of the boarding rules. */
    function fake(def, side) { return { type: 'unit', def: def, side: side || 'player', dead: false }; }
    function pair(a, b) { return !!_rtsCanBoard(fake(a), fake(b)); }
    return {
      infIntoApc: pair('rifle', 'apc'),
      tankIntoApc: pair('tank', 'apc'),
      infIntoLst: pair('rifle', 'lst'),
      tankIntoLst: pair('tank', 'lst'),
      harvIntoLst: pair('harvester', 'lst'),
      apcIntoLst: pair('apc', 'lst'),
      lstIntoLst: pair('lst', 'lst'),
      subIntoLst: pair('sub', 'lst'),
      heliIntoLst: pair('heli', 'lst'),
      takesApc: (rtsUnitDef('apc') || {}).takes,
      takesLst: (rtsUnitDef('lst') || {}).takes,
      lstSide: (rtsUnitDef('lst') || {}).side || 'both',
      lstNeeds: (rtsUnitDef('lst') || {}).needs
    };
  });
  S.ok('infantry get into an APC', rules.infIntoApc, String(rules.infIntoApc));
  S.ok('a tank does not', !rules.tankIntoApc, String(rules.tankIntoApc));
  S.ok('infantry get into a landing craft', rules.infIntoLst, String(rules.infIntoLst));
  S.ok('...and so does a tank', rules.tankIntoLst, String(rules.tankIntoLst));
  S.ok('...and a Harvester, which is what makes an island of ore worth taking',
       rules.harvIntoLst, String(rules.harvIntoLst));
  /* Refused on purpose - the tick skips anything flagged `inside`, so an APC riding in a craft
     would never run the update that drags ITS passengers along, and they would be left standing
     on the beach still flagged as its cargo. Stated in _rtsCanBoard, pinned here. */
  S.ok('a loaded APC may NOT ride in a craft - no transport inside a transport',
       !rules.apcIntoLst, String(rules.apcIntoLst));
  S.ok('...nor may a craft ride in a craft', !rules.lstIntoLst, String(rules.lstIntoLst));
  S.ok('nothing that swims gets in a boat', !rules.subIntoLst, String(rules.subIntoLst));
  S.ok('...nor anything that flies', !rules.heliIntoLst, String(rules.heliIntoLst));
  S.note('takes: apc ' + JSON.stringify(rules.takesApc) + ', lst ' + JSON.stringify(rules.takesLst));
  S.eq('the craft belongs to both armies', rules.lstSide, 'both');
  S.eq('...off the shipyard capability rather than one side\'s building',
       JSON.stringify(rules.lstNeeds), '["shipyard"]');

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
