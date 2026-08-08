/* The four superweapons, and the walk-in specialists that share their shape.

   Nothing here had a spec. Each of these is a button that does one thing once every few
   minutes, which is the worst possible shape for a bug: you find out it does nothing at the
   moment you were counting on it, and you cannot try again for five minutes.

   Charging is measured as a RATE over ten seconds rather than by waiting out a three-hundred
   second charge. The claim in the source is "dt, scaled by the power factor" - a rate says that
   in a thirtieth of the time, and waiting out the real charge would measure the clock instead.

   The nuke is measured on hit points rather than on death counts. The first version of this
   probe counted survivors in the blast radius, saw the number not move, and learned nothing at
   all: everything in the game has more hit points than the edge of a nuke does damage, so
   "nobody died" is the expected result and says nothing about whether the blast happened. The
   falloff table below is what the assertion is actually about.

   The last section is a defect: an engineer sent at a building the enemy had already started
   SELLING was accepted, walked the whole way, captured a structure that then deconstructed
   anyway, and was spent doing it. Six hundred credits for nothing, reachable by playing
   normally - the AI sells whenever Repair_AI cannot pay or AI_Raise_Money needs the cash. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('supers');

function harness() {
  window._SP = {
    open: function (seed) {
      if (document.getElementById('rcgRts')) rtsClose();
      rtsOpen(seed);
      var U = window._rtsUI;
      if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
      return window._rtsG;
    },
    step: function (s) { for (var i = 0; i < 60 * s; i++) _rtsTick(1 / 60); return window._rtsG; },
    /* A finished structure, placed at the first cell near (tx,tz) that will take it. */
    put: function (side, def, tx, tz) {
      for (var r = 0; r < 40; r++)
        for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
          if (r && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (_rtsCanPlace(side, def, tx + dx, tz + dz, true)) {
            var e = _rtsPlaceStruct(side, def, tx + dx, tz + dz, true);
            if (e) { e.building = 0; e.bprog = 1; _rtsRecalcPower(side); return e; }
          }
        }
      return null;
    },
    unit: function (side, def, tx, tz) {
      var c = _rtsNearestOpen(tx, tz, 16);
      return c ? _rtsSpawnUnit(side, def, _rtsWX(c[0]), _rtsWX(c[1])) : null;
    },
    yard: function (side) {
      return window._rtsG.ents.filter(function (e) {
        return !e.dead && e.type === 'struct' && e.side === side && e.def === 'yard'; })[0];
    },
    /* Force a charge to full. Every fire assertion is about what firing DOES; making each one
       wait out its real charge would turn this spec into twenty minutes of clock. */
    arm: function (side, key) {
      var Sd = window._rtsG.sides[side];
      Sd.supers = Sd.supers || {};
      Sd.supers[key] = { t: _rtsSuperDefOf(key).super.charge, ready: true, said: false };
    },
    rich: function (side, plants) {
      _rtsGrant(window._rtsG.sides[side], 300000);
      for (var i = 0; i < (plants || 10); i++) window._SP.put(side, 'apower', 30 + i * 4, 30);
      _rtsRecalcPower(side);
    }
  };
  return true;
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  var up = await g.page.evaluate(function (src) { return eval('(' + src + ')()'); }, harness.toString());
  S.ok('the harness is installed', up === true, String(up));

  /* ------------------------------------------------------------------ charging ----
     The charge lives on the HOUSE, which is the thing the source says out loud and the thing
     that is worth checking: if it lived on the building you could sell a silo at 99% and
     rebuild for a fresh missile, or own two silos and charge twice as fast. */
  var charge = await g.page.evaluate(function () {
    var G = window._SP.open(31), out = {};
    var yard = window._SP.yard('player');
    window._SP.rich('player', 10);
    ['mslo', 'iron', 'pdox', 'gps'].forEach(function (k) { window._SP.put('player', k, yard.tx + 8, yard.tz + 8); });
    window._SP.step(10);
    out.after10 = {};
    Object.keys(G.sides.player.supers).forEach(function (k) { out.after10[k] = +G.sides.player.supers[k].t.toFixed(2); });
    out.factor = +_rtsPowerFactor('player').toFixed(3);

    /* a second silo must not charge a second missile, nor charge the first one faster */
    var t0 = G.sides.player.supers.nuke.t;
    window._SP.put('player', 'mslo', yard.tx + 14, yard.tz + 14);
    window._SP.step(10);
    out.withTwoSilos = +(G.sides.player.supers.nuke.t - t0).toFixed(2);
    out.siloCount = G.ents.filter(function (e) { return !e.dead && e.def === 'mslo' && e.side === 'player'; }).length;

    /* browned out: the charge STALLS rather than resetting - a brownout costs tempo, not the
       whole investment. Measured as a rate, and against the charge it already had. */
    G.ents.forEach(function (e) { if (!e.dead && e.def === 'apower' && e.side === 'player') _rtsKill(e); });
    _rtsRecalcPower('player');
    var t1 = G.sides.player.supers.nuke.t;
    window._SP.step(10);
    out.brownFactor = +_rtsPowerFactor('player').toFixed(3);
    out.brownGain = +(G.sides.player.supers.nuke.t - t1).toFixed(2);
    out.keptCharge = +t1.toFixed(2);

    /* lose every silo and the charge goes with it - which is what closes the sell-at-99% door */
    G.ents.forEach(function (e) { if (!e.dead && e.def === 'mslo') _rtsKill(e); });
    window._SP.step(0.2);
    out.afterLosingTheBuilding = G.sides.player.supers.nuke === undefined ? 'charge dropped' : 'STILL THERE';
    return out;
  });
  S.near('ten seconds of full power is ten seconds of charge', charge.after10.nuke, 10, 0.2);
  S.ok('...for every super at once, since each has its own building',
       Object.keys(charge.after10).length === 4, Object.keys(charge.after10).join(', '));
  S.eq('the power factor is 1 with a surplus', charge.factor, 1);
  S.ok('a SECOND silo does not charge the missile any faster - the charge is on the house',
       Math.abs(charge.withTwoSilos - 10) < 0.2, charge.siloCount + ' silos, ' + charge.withTwoSilos + 's gained in 10s');
  S.ok('a brownout slows the charge rather than stopping it',
       charge.brownFactor < 1 && charge.brownGain > 0 && charge.brownGain < 10,
       'factor ' + charge.brownFactor + ', ' + charge.brownGain + 's gained in 10s');
  S.ok('...and does not throw away what was already charged', charge.keptCharge > 15,
       charge.keptCharge + 's still banked');
  S.eq('losing the last silo loses the charge', charge.afterLosingTheBuilding, 'charge dropped');

  /* ---------------------------------------------------------------- the nuke ----
     On hit points, against the falloff the rules actually describe. */
  var nuke = await g.page.evaluate(function () {
    var G = window._SP.open(31), out = {};
    out.curve = [1, 2, 3, 4].map(function (t) {
      var steps = Math.max(0, Math.min(RTS_SPREAD_MAX,
        Math.round(t * (RTS_SPREAD_STEPS / Math.max(0.5, RTS_NUKE_SPREAD)))));
      return { tiles: t, dmg: steps ? Math.round(RTS_NUKE_DAMAGE / steps) : RTS_NUKE_DAMAGE };
    });
    out.weakestStructure = Math.min.apply(null, RTS_STRUCTS.map(function (d) { return d.hp; }));

    window._SP.arm('player', 'nuke');
    out.offMap = { fired: _rtsSuperFire('player', 'nuke', -5, -5), stillReady: _rtsSuperReady('player', 'nuke') };

    var ey = window._SP.yard('enemy');
    var watch = G.ents.filter(function (e) {
      return !e.dead && Math.hypot(e.x - _rtsWX(ey.tx), e.z - _rtsWX(ey.tz)) <= RTS_NUKE_RADIUS * RTS_TILE;
    }).map(function (e) {
      return { o: e, def: e.def, hp0: e.hp,
               d: +(Math.hypot(e.x - _rtsWX(ey.tx), e.z - _rtsWX(ey.tz)) / RTS_TILE).toFixed(2) };
    });
    out.fired = _rtsSuperFire('player', 'nuke', ey.tx, ey.tz);
    out.spent = !_rtsSuperReady('player', 'nuke');
    out.queued = (G.strikes || []).length;
    /* the delay is the point: nothing may be hurt before it lands */
    window._SP.step(RTS_NUKE_DELAY - 0.5);
    out.beforeImpact = { flying: (G.strikes || []).length,
                         anyHurt: watch.some(function (r) { return r.o.dead || r.o.hp < r.hp0; }) };
    window._SP.step(1.0);
    out.afterImpact = { flying: (G.strikes || []).length };
    out.hits = watch.map(function (r) {
      return { def: r.def, d: r.d, took: Math.round(r.hp0 - (r.o.dead ? 0 : r.o.hp)),
               hp0: Math.round(r.hp0), dead: r.o.dead };
    });

    /* the blast has to reach infantry across the whole radius, which is what it is FOR */
    var G2 = window._SP.open(31), men = [];
    for (var i = 0; i < 5; i++) {
      var m = window._SP.unit('player', 'rifle', 60 + i, 60);
      if (m) { m.x = _rtsWX(60) + i * RTS_TILE; m.z = _rtsWX(60); men.push(m); }
    }
    window._SP.arm('player', 'nuke');
    _rtsSuperFire('player', 'nuke', 60, 60);
    window._SP.step(RTS_NUKE_DELAY + 0.5);
    out.infantry = { placed: men.length, killed: men.filter(function (m) { return m.dead; }).length,
                     spread: men.map(function (m) { return +(Math.abs(m.x - _rtsWX(60)) / RTS_TILE).toFixed(1); }).join(',') };
    return out;
  });
  S.ok('a nuke aimed off the map is refused AND not spent', !nuke.offMap.fired && nuke.offMap.stillReady,
       'fired ' + nuke.offMap.fired + ', still ready ' + nuke.offMap.stillReady);
  S.ok('a nuke aimed on the map fires and spends its charge', nuke.fired && nuke.spent && nuke.queued === 1,
       'fired ' + nuke.fired + ', queued ' + nuke.queued);
  S.ok('nothing is hurt before the missile lands - the delay is real',
       nuke.beforeImpact.flying === 1 && !nuke.beforeImpact.anyHurt,
       'still flying ' + nuke.beforeImpact.flying + ', anything hurt: ' + nuke.beforeImpact.anyHurt);
  S.eq('...and it does land', nuke.afterImpact.flying, 0);
  S.ok('everything in the radius takes damage', nuke.hits.length > 0 && nuke.hits.every(function (h) { return h.took > 0; }),
       nuke.hits.map(function (h) { return h.def + ' @' + h.d + 't -' + h.took + ' of ' + h.hp0; }).join('; '));
  S.ok('the blast clears infantry across the whole radius',
       nuke.infantry.killed === nuke.infantry.placed,
       nuke.infantry.killed + ' of ' + nuke.infantry.placed + ' at ' + nuke.infantry.spread + ' tiles');
  /* Printed, not asserted: the number the description now has to be honest about. Damage falls
     as 1/steps and the weakest structure in the game has more hit points than the edge does
     damage, so "levels everything within four tiles" was never true. */
  S.note('falloff: ' + nuke.curve.map(function (c) { return c.tiles + 't ' + c.dmg; }).join(', ') +
         '  vs the weakest structure at ' + nuke.weakestStructure + ' hp');

  /* -------------------------------------------------------- the iron curtain ----*/
  var iron = await g.page.evaluate(function () {
    var G = window._SP.open(31), out = {};
    var u = window._SP.unit('player', 'tank', 40, 40);
    var v = window._SP.unit('player', 'rifle', 40, 40);
    window._SP.arm('player', 'ironcurtain');
    out.fired = _rtsSuperFire('player', 'ironcurtain', _rtsTX(u.x), _rtsTX(u.z));
    out.covered = { tank: u.ironT, neighbour: v.ironT };
    var hp0 = u.hp;
    _rtsDamage(u, 500, null);
    out.blocked = { hp: Math.round(u.hp), unchanged: u.hp === hp0 };
    window._SP.step(RTS_IRON_TIME + 1);
    out.wornOff = u.ironT;
    var hp1 = u.hp;
    _rtsDamage(u, 500, null);
    out.afterExpiry = { from: Math.round(hp1), dead: u.dead };
    window._SP.arm('player', 'ironcurtain');
    out.emptyGround = { fired: _rtsSuperFire('player', 'ironcurtain', 4, 4),
                        stillReady: _rtsSuperReady('player', 'ironcurtain') };
    return out;
  });
  S.ok('the iron curtain covers what it is aimed at and everything of yours around it',
       iron.fired && iron.covered.tank === 30 && iron.covered.neighbour === 30,
       'tank ' + iron.covered.tank + 's, neighbour ' + iron.covered.neighbour + 's');
  S.ok('...and a covered unit takes no damage at all', iron.blocked.unchanged,
       '500 damage left it at ' + iron.blocked.hp);
  S.eq('...it wears off', iron.wornOff, 0);
  S.ok('...and then the same shot kills', iron.afterExpiry.dead, 'from ' + iron.afterExpiry.from + ' hp');
  S.ok('aimed where you own nothing it is refused, and NOT spent',
       !iron.emptyGround.fired && iron.emptyGround.stillReady,
       'fired ' + iron.emptyGround.fired + ', still ready ' + iron.emptyGround.stillReady);

  /* -------------------------------------------------------- the chronosphere ----
     The interesting part is that each unit needs its OWN cell: _rtsNearestOpen answers the same
     question the same way every time and has no idea another unit is about to be put where it
     just pointed, so asking it once per unit lands the whole group on one tile. */
  var chrono = await g.page.evaluate(function () {
    var G = window._SP.open(31), out = {}, i, sel = [];
    for (i = 0; i < 6; i++) { var t = window._SP.unit('player', 'tank', 30 + i, 30); if (t) sel.push(t); }
    var before = sel.map(function (e) { return { x: e.x, z: e.z }; });
    window._SP.arm('player', 'chrono');
    out.fired = _rtsSuperFire('player', 'chrono', 90, 90, sel);
    var cells = {};
    sel.forEach(function (e) { cells[_rtsTX(e.x) + ',' + _rtsTX(e.z)] = 1; });
    out.sent = sel.length;
    out.moved = sel.filter(function (e, k) { return e.x !== before[k].x || e.z !== before[k].z; }).length;
    out.distinctCells = Object.keys(cells).length;
    out.furthest = +Math.max.apply(null, sel.map(function (e) {
      return Math.hypot(e.x - _rtsWX(90), e.z - _rtsWX(90)) / RTS_TILE; })).toFixed(2);
    out.onBlocked = sel.filter(function (e) { return _rtsBlocked(_rtsTX(e.x), _rtsTX(e.z), _rtsDomainOf(e)); }).length;

    var many = [];
    for (i = 0; i < 14; i++) { var m = window._SP.unit('player', 'rifle', 30, 34); if (m) many.push(m); }
    window._SP.arm('player', 'chrono');
    _rtsSuperFire('player', 'chrono', 70, 70, many);
    out.cap = RTS_CHRONO_MAX;
    out.asked = many.length;
    out.arrived = many.filter(function (e) {
      return Math.hypot(e.x - _rtsWX(70), e.z - _rtsWX(70)) / RTS_TILE < 12; }).length;

    /* An empty selection. Snapshot every unit on the board first: the failure this catches is
       not "it returned true", it is "eight units the player never selected moved". */
    window._SP.arm('player', 'chrono');
    var all = G.ents.filter(function (e) { return !e.dead && e.type === 'unit' && e.side === 'player'; });
    var where = all.map(function (e) { return e.x + ',' + e.z; });
    out.nothingSelected = { fired: _rtsSuperFire('player', 'chrono', 50, 50, []),
                            stillReady: _rtsSuperReady('player', 'chrono') };
    out.strayJump = all.filter(function (e, k) { return (e.x + ',' + e.z) !== where[k]; }).length;
    out.watched = all.length;
    return out;
  });
  S.ok('a chronoshift moves every unit it was given', chrono.fired && chrono.moved === chrono.sent,
       chrono.moved + ' of ' + chrono.sent + ' moved');
  S.eq('...each onto its own cell, rather than stacked on one', chrono.distinctCells, chrono.sent);
  S.ok('...all of them near where it was aimed', chrono.furthest < 4, 'furthest ' + chrono.furthest + ' tiles');
  S.eq('...and none of them onto ground it cannot stand on', chrono.onBlocked, 0);
  S.eq('one jump carries no more than the cap', chrono.arrived, chrono.cap);
  /* A jump with nothing selected must be a REFUSAL. This failed on the spec's first run: an
     empty list fell into a fallback that picked the first eight units in G.ents and sent them,
     and spent the charge doing it. No caller reached it - the sidebar refuses an empty
     selection and the AI never fires the chronosphere at all - so it was dead code that would
     have teleported the harvester and the MCV the first time anything did. */
  S.ok('...and a jump with nothing selected is refused, with the charge kept',
       !chrono.nothingSelected.fired && chrono.nothingSelected.stillReady,
       'fired ' + chrono.nothingSelected.fired + ', still ready ' + chrono.nothingSelected.stillReady);
  S.eq('...and it moved nobody', chrono.strayJump, 0);

  /* ----------------------------------------------------------------- GPS ----
     It reveals the GROUND. `mapped` and `vis` are two different flags for exactly this reason:
     knowing where a valley is does not mean watching it, so an enemy unit standing in newly
     revealed territory has to stay hidden. */
  var gps = await g.page.evaluate(function () {
    var G = window._SP.open(31), out = {}, i, n = 0;
    for (i = 0; i < G.mapped.length; i++) if (G.mapped[i]) n++;
    out.before = n;
    out.total = G.mapped.length;
    _rtsFireGps('player');
    n = 0; var vis = 0;
    for (i = 0; i < G.mapped.length; i++) { if (G.mapped[i]) n++; if (G.vis[i]) vis++; }
    out.after = n;
    out.visible = vis;
    var foe = G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'unit'; });
    out.enemyUnits = foe.length;
    out.enemyUnitsSeen = foe.filter(function (e) { return _rtsEntSeen(e); }).length;
    return out;
  });
  S.ok('GPS maps the whole board', gps.after === gps.total, gps.before + ' -> ' + gps.after + ' of ' + gps.total);
  S.ok('...without making anything visible that was not', gps.visible < gps.total,
       gps.visible + ' cells actually watched of ' + gps.total);
  S.ok('...so enemy units in revealed-but-unwatched ground stay hidden',
       gps.enemyUnitsSeen === 0, gps.enemyUnitsSeen + ' of ' + gps.enemyUnits + ' enemy units visible');

  /* ------------------------------------------- an engineer and a building being SOLD ----
     The defect. Mission_Deconstruction is already running: the previous owner has taken the
     refund and the structure removes itself in a few seconds whoever owns it by then. Accepting
     the capture handed over a building that died anyway and consumed the engineer doing it. */
  var sale = await g.page.evaluate(function () {
    var G = window._SP.open(52), out = {};
    var doomed = window._SP.put('enemy', 'power', 60, 60);
    _rtsSell(doomed);
    var eng = window._SP.unit('player', 'engineer', doomed.tx + 2, doomed.tz + 2);
    out.refusedAtTheDoor = { took: _rtsCapture(eng, doomed), side: doomed.side, engineerAlive: !eng.dead };

    /* and the order is dropped mid-walk, so the engineer is not spent on the journey either */
    var G2 = window._SP.open(52);
    var mark = window._SP.put('enemy', 'power', 62, 62);
    var eng2 = window._SP.unit('player', 'engineer', mark.tx - 6, mark.tz - 6);
    eng2.order = 'capture'; eng2.target = mark; eng2.path = null;
    window._SP.step(0.5);
    out.orderHeldWhileValid = eng2.order;
    _rtsSell(mark);
    window._SP.step(0.5);
    out.orderAfterSaleStarts = eng2.order;
    out.engineerAfterSale = { alive: !eng2.dead, hasTarget: !!eng2.target };

    /* the control: an ordinary enemy building is still captured, or the guard above has simply
       broken capture rather than narrowed it */
    var G3 = window._SP.open(52);
    var ok = window._SP.put('enemy', 'power', 60, 60);
    var eng3 = window._SP.unit('player', 'engineer', ok.tx + 2, ok.tz + 2);
    var pow0 = G3.sides.player.powerMade;
    out.control = { took: _rtsCapture(eng3, ok), side: ok.side, engineerSpent: eng3.dead,
                    powerMoved: G3.sides.player.powerMade - pow0 };
    return out;
  });
  S.ok('an engineer is refused a building that is being sold',
       !sale.refusedAtTheDoor.took && sale.refusedAtTheDoor.side === 'enemy',
       'took ' + sale.refusedAtTheDoor.took + ', still ' + sale.refusedAtTheDoor.side + '\'s');
  S.ok('...and survives to be sent somewhere else', sale.refusedAtTheDoor.engineerAlive);
  S.eq('a capture order stands while the target is a normal building', sale.orderHeldWhileValid, 'capture');
  S.ok('...and is dropped the moment the target starts deconstructing',
       sale.orderAfterSaleStarts === null && sale.engineerAfterSale.alive,
       'order ' + sale.orderAfterSaleStarts + ', engineer alive ' + sale.engineerAfterSale.alive);
  S.ok('a normal enemy building is still captured, so the guard narrowed rather than broke it',
       sale.control.took && sale.control.side === 'player' && sale.control.engineerSpent,
       'took ' + sale.control.took + ', now ' + sale.control.side + '\'s, power moved ' + sale.control.powerMoved);

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
