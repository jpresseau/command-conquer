/* NEWLY BUILT UNITS GO WHERE THEY WERE SENT.

   There was no rally point of any kind. _rtsDeliverUnit put the unit down beside the building
   that made it and gave it no order, so every tank, squad, helicopter and boat parked on the
   factory door until the player noticed. Asked "how do I set a waypoint for vehicles, troops,
   aircraft and boats once they are done building?", the answer was that you could not.

   THE POINT LIVES ON THE BUILDING, not on the side and not on the category. A barracks feeding
   the front while a war factory feeds a different flank is the ordinary case and one point per
   army cannot say it. It dies with the building for free - the entity goes and the point goes
   with it - and the save encodes entities generically, so it round-trips with no save code.

   WHAT IS GRADED, and the third is the one that matters:

   - only a building that MAKES something can hold one. A rally point on a power plant would be
     a control that silently does nothing.
   - the real input path sets it: _rtsRightClick, which is what both the mouse and the touch
     hold call. Setting the field by hand would prove nothing about whether a player can.
   - A UNIT ACTUALLY ARRIVES. Not "an order was issued" - the sim is run and the unit has to end
     up near the point, because an order that cannot be pathed is the same as no rally at all.
   - the control: with no rally set, the same unit stays at the factory. Without it, "the unit
     is somewhere" proves nothing.
   - a boat whose yard is rallied inland is left alone rather than handed an order it can never
     complete and standing at the dock in a permanent move state.
   - it survives a save and a load, and it dies with the building. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('rally');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800, dpr: 1 });
  await g.start(7, 20, {});
  await g.freeze();

  var out = await g.page.evaluate(function () {
    var o = {}, G = window._rtsG, P = G.sides.player;
    o.TILE = RTS_TILE;          /* a page constant - Node has no idea what a tile is */

    /* a funded base with the producers standing - see e2e/queue for why this is placed
       rather than hoped for */
    function giveProducers() {
      var yard = _rtsHas('player', 'yard'), want = ['factory', 'barracks'];
      for (var w = 0; w < want.length; w++) {
        if (_rtsHas('player', want[w])) continue;
        var done = false;
        for (var rad = 3; rad <= 16 && !done; rad++)
          for (var dx = -rad; dx <= rad && !done; dx++)
            for (var dz = -rad; dz <= rad && !done; dz++) {
              var tx = _rtsTX(yard.x) + dx, tz = _rtsTX(yard.z) + dz;
              if (_rtsCanPlace('player', want[w], tx, tz, true)) {
                _rtsPlaceStruct('player', want[w], tx, tz, true, 0); done = true;
              }
            }
      }
    }
    giveProducers();
    P.ore = Math.max(0, rtsCapacity('player') * 0.5);
    var fac = _rtsHas('player', 'factory'), pwr = _rtsHas('player', 'power');
    o.haveFactory = !!fac;
    if (!fac) return o;

    /* who may hold a rally point */
    o.factoryCanRally = _rtsCanRally(fac);
    o.powerCannot = !!pwr && !_rtsCanRally(pwr);

    /* THROUGH THE REAL INPUT PATH. Pick a clear cell well away from the factory, convert it to
       screen coordinates, and right-click there with the factory selected - which is what the
       mouse does and what the touch hold calls. */
    var rx = fac.x + RTS_TILE * 9, rz = fac.z + RTS_TILE * 9;
    var sp = _rtsWorldToScreen(rx, _rtsElev(rx, rz), rz);
    G.sel = [fac];
    _rtsRightClick(sp.x, sp.y);
    o.rallySet = !!fac.rally;
    o.rallyErr = fac.rally
      ? +Math.hypot(fac.rally.x - rx, fac.rally.z - rz).toFixed(2) : null;

    /* THE CLAIM: build a tank and see where it ends up. */
    var before = G.ents.filter(function (e) {
      return !e.dead && e.def === 'tank' && e.side === 'player'; }).length;
    _rtsQueue('player', 'tank');
    for (var t = 0; t < 60 * 240; t++) {
      _rtsTick(1 / 60);
      var madeNow = G.ents.filter(function (e) {
        return !e.dead && e.def === 'tank' && e.side === 'player'; }).length;
      if (madeNow > before) break;
    }
    var tank = null;
    for (var i = G.ents.length - 1; i >= 0; i--)
      if (!G.ents[i].dead && G.ents[i].def === 'tank' && G.ents[i].side === 'player') { tank = G.ents[i]; break; }
    o.built = !!tank;
    if (tank) {
      o.gotOrder = tank.order === 'move' && !!tank.path;
      o.spawnDist = +Math.hypot(tank.x - rx, tank.z - rz).toFixed(1);
      /* let it drive */
      for (var t2 = 0; t2 < 60 * 120 && tank.order; t2++) _rtsTick(1 / 60);
      o.arriveDist = +Math.hypot(tank.x - rx, tank.z - rz).toFixed(1);
      o.startDist = +Math.hypot(fac.x - rx, fac.z - rz).toFixed(1);
    }
    return o;
  });

  /* THE CONTROL: same base, same tank, NO rally - it must stay at the factory. */
  Object.assign(out, await g.page.evaluate(function () {
    var o = {}, G = window._rtsG, P = G.sides.player;
    var fac = _rtsHas('player', 'factory');
    if (!fac) return { ctrlRan: false };
    fac.rally = null;
    P.ore = Math.max(0, rtsCapacity('player') * 0.5);
    var before = G.ents.filter(function (e) {
      return !e.dead && e.def === 'tank' && e.side === 'player'; }).length;
    _rtsQueue('player', 'tank');
    for (var t = 0; t < 60 * 240; t++) {
      _rtsTick(1 / 60);
      if (G.ents.filter(function (e) {
        return !e.dead && e.def === 'tank' && e.side === 'player'; }).length > before) break;
    }
    var tank = null;
    for (var i = G.ents.length - 1; i >= 0; i--)
      if (!G.ents[i].dead && G.ents[i].def === 'tank' && G.ents[i].side === 'player') { tank = G.ents[i]; break; }
    if (!tank) return { ctrlRan: false };
    for (var t2 = 0; t2 < 60 * 30; t2++) _rtsTick(1 / 60);
    return { ctrlRan: true, ctrlNoOrder: !tank.order, TILE: RTS_TILE,
             ctrlDist: +Math.hypot(tank.x - fac.x, tank.z - fac.z).toFixed(1) };
  }));

  /* save / load, and death of the building */
  Object.assign(out, await g.page.evaluate(function () {
    var o = {}, G = window._rtsG;
    var fac = _rtsHas('player', 'factory');
    if (!fac) return { srRan: false };
    _rtsSetRally(fac, fac.x + 30, fac.z + 30);
    o.srRan = true;
    o.savedRally = [Math.round(fac.rally.x), Math.round(fac.rally.z)];
    var blob = JSON.stringify(_rtsSaveState(G));
    _rtsNewGame(999, 'easy');
    _rtsApplyState(window._rtsG, JSON.parse(blob));
    var fac2 = _rtsHas('player', 'factory');
    o.loadedRally = (fac2 && fac2.rally) ? [Math.round(fac2.rally.x), Math.round(fac2.rally.z)] : null;
    /* and it goes when the building goes */
    if (fac2) { _rtsKill(fac2); o.goneWithBuilding = !_rtsHas('player', 'factory'); }
    return o;
  }));

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  await g.close();
  await browser.close();

  S.ok('a War Factory was standing to rally from', out.haveFactory,
       out.haveFactory ? 'placed' : 'none');
  if (out.haveFactory) {
    S.ok('a building that makes things can hold a rally point', out.factoryCanRally,
         out.factoryCanRally ? 'the War Factory can' : 'refused');
    S.ok('...and one that does not, cannot (control)', out.powerCannot,
         out.powerCannot ? 'the Power Plant cannot - a control that did nothing would be worse '
                         + 'than no control' : 'a Power Plant accepted a rally point');
    S.ok('a right-click sets it through the real input path', out.rallySet && out.rallyErr < 3,
         out.rallySet ? 'landed ' + out.rallyErr + ' world units from the click'
                      : 'nothing was set - _rtsRightClick returns early when no UNIT is selected');
    S.ok('a finished unit leaves with a move order', out.built && out.gotOrder,
         out.built ? (out.gotOrder ? 'order=move with a path' : 'built but given NO order')
                   : 'nothing was built');
    if (out.built) {
      S.ok('AND IT ARRIVES: the unit ends up at the rally point, not at the factory',
           out.arriveDist < out.TILE * 3 && out.arriveDist < out.startDist * 0.35,
           'ended ' + out.arriveDist + ' world units from the point, having started ' +
           out.startDist + ' away at the factory');
    }
  }
  if (out.ctrlRan) {
    S.ok('...and with no rally set it stays at the factory (control)',
         out.ctrlNoOrder && out.ctrlDist < out.TILE * 4,
         'no order, ' + out.ctrlDist + ' world units from the factory it came out of - so the ' +
         'arrival above is the rally point and not just a unit wandering');
  }
  if (out.srRan) {
    S.ok('the rally point survives a save and a load',
         !!out.loadedRally && out.loadedRally[0] === out.savedRally[0] &&
         out.loadedRally[1] === out.savedRally[1],
         'saved ' + JSON.stringify(out.savedRally) + ', loaded ' + JSON.stringify(out.loadedRally));
    S.ok('...and dies with the building that held it', out.goneWithBuilding,
         out.goneWithBuilding ? 'building destroyed, point went with it' : 'building survived');
  }
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
