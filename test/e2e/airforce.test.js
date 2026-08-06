/* The Soviet air force, and the Allied answer to it.

   Until now the Soviets had no aircraft at all - no airfield, no plane, an Aircraft tab that was
   empty for half the players - while the Allies flew the Attack Heli. The fix is not just a
   roster entry: what has to be true is that the thing can be BUILT, that it FLIES, that it
   KILLS what it is meant to kill and not what it is not, that it comes home to rearm, and that
   the other army can shoot it down. Each of those is asserted separately, because a unit that
   exists in a menu and cannot do any of them is worse than no unit.

   The Allied AA Gun is in the same spec on purpose. Before this, the only two weapons in the
   game that could touch an aircraft were the Rocket Squad's launcher (both armies) and the
   Rocket Turret (Soviet), so the Allies had no anti-air STRUCTURE - invisible while they were
   the only side that flew, and indefensible the moment they were not. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('airforce');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1200, height: 850 });
  await g.start(7, 5);

  /* ---------- 1. both armies can reach an air force at all ---------- */
  var reach = await g.page.evaluate(function () {
    var out = {};
    ['allied', 'soviet'].forEach(function (side) {
      var pads = RTS_STRUCTS.filter(function (s) { return s.produces === 'air' && rtsBuildableBy(s, side); });
      var planes = RTS_UNITS.filter(function (u) { return u.kind === 'air' && rtsBuildableBy(u, side); });
      var aa = [];
      RTS_STRUCTS.concat(RTS_UNITS).forEach(function (d) {
        var w = d.weapon && RTS_WEAPONS[d.weapon];
        if (w && w.aa && rtsBuildableBy(d, side)) aa.push(d.key);
      });
      /* split here, inside the page, where the tables live - the node side has no roster */
      var aaStructs = aa.filter(function (k) { return RTS_STRUCTS.some(function (s) { return s.key === k; }); });
      out[side] = { pads: pads.map(function (s) { return s.key; }),
                    planes: planes.map(function (u) { return u.key; }),
                    aa: aa, aaStructs: aaStructs };
    });
    return out;
  });
  ['allied', 'soviet'].forEach(function (side) {
    var r = reach[side];
    S.ok(side + ' has somewhere to fly from', r.pads.length > 0, r.pads.join(', ') || 'NOTHING');
    S.ok(side + ' has something to fly', r.planes.length > 0, r.planes.join(', ') || 'NOTHING');
    /* the point of the AA Gun: BOTH armies need a static answer, not just infantry */
    S.ok(side + ' has an anti-air BUILDING, not just infantry', r.aaStructs.length > 0,
         'anti-air: ' + r.aa.join(', ') + '  (structures: ' + (r.aaStructs.join(', ') || 'NONE') + ')');
  });
  S.ok('the two air forces are different aircraft',
       reach.allied.planes.join() !== reach.soviet.planes.join(),
       reach.allied.planes.join(',') + ' vs ' + reach.soviet.planes.join(','));

  /* ---------- 2. a Soviet player can actually build one, through the real gate ---------- */
  var build = await g.page.evaluate(function () {
    rtsSetVoxSide('soviet');
    rtsClose(); rtsOpen(7);
    var G = window._rtsG, Sp = G.sides.player;
    var before = _rtsCanQueue('player', 'mig');
    /* give it the prerequisites the tech tree asks for, by placing them rather than by
       bypassing the check - the gate is part of what is on test */
    var yd = _rtsHas('player', 'yard');
    function put(key) {
      for (var r = 3; r <= 16; r++) for (var a = 0; a < 24; a++) {
        var tx = _rtsTX(yd.x + Math.cos(a / 24 * 6.283) * r * RTS_TILE) - 1;
        var tz = _rtsTX(yd.z + Math.sin(a / 24 * 6.283) * r * RTS_TILE) - 1;
        if (_rtsCanPlace('player', key, tx, tz)) {
          var e = _rtsPlaceStruct('player', key, tx, tz);
          if (e) { e.building = 0; e.bprog = 1; return e; }
        }
      }
      return null;
    }
    var chain = ['power', 'refinery', 'barracks', 'radar', 'afld'];
    var built = {};
    chain.forEach(function (k) { built[k] = !!put(k); });
    Sp.credits = 20000;
    var after = _rtsCanQueue('player', 'mig');
    var yakToo = _rtsCanQueue('player', 'yak');
    /* and the Allies cannot build the Soviet aircraft, whatever they have standing */
    var crossed = rtsBuildableBy(rtsUnitDef('mig'), 'allied') ||
                  rtsBuildableBy(rtsUnitDef('heli'), 'soviet');
    return { before: before, after: after, yakToo: yakToo, built: built, crossed: crossed };
  });
  S.eq('a Soviet player cannot build a MiG with no airfield', build.before, false);
  S.ok('the tech chain went up', Object.keys(build.built).every(function (k) { return build.built[k]; }),
       JSON.stringify(build.built));
  S.eq('...and with an Airfield standing, the MiG is buildable', build.after, true);
  S.eq('...and so is the Yak', build.yakToo, true);
  S.ok('neither army can build the other\'s aircraft', !build.crossed);

  /* ---------- 3. it flies, it shoots the right things, and it comes home ---------- */
  var fly = await g.page.evaluate(function () {
    var G = window._rtsG;
    var pad = _rtsHas('player', 'afld');
    var mig = _rtsSpawnUnit('player', 'mig', pad.x + 6, pad.z + 6);
    if (!mig) return { error: 'could not spawn a MiG' };

    /* Over terrain nothing on the ground could cross - and the NEAREST such cell, ordered
       through the real _rtsOrderMove rather than by setting fields by hand. Writing goal/order
       directly looked like an order and was not one: the aircraft never moved, and the spec
       would have reported that as "aircraft cannot fly" when the truth was "the test never
       told it to". */
    var wall = null, bestD = 1e9;
    for (var tz = 4; tz < RTS_N - 4; tz++)
      for (var tx = 4; tx < RTS_N - 4; tx++) {
        if (!_rtsBlocked(tx, tz)) continue;
        var d = Math.hypot(_rtsWX(tx) - mig.x, _rtsWX(tz) - mig.z);
        /* at least 30 world units away, or "it flew over a wall" is satisfied by a wall it was
           already standing on and the assertion proves nothing about flight */
        if (d > 30 && d < bestD) { bestD = d; wall = { tx: tx, tz: tz }; }
      }
    if (!wall) return { error: 'no blocked ground far enough away to fly to' };
    var gx = _rtsWX(wall.tx), gz = _rtsWX(wall.tz);
    _rtsOrderMove(mig, gx, gz, false);
    var d0 = Math.hypot(mig.x - gx, mig.z - gz), best = d0;
    for (var i = 0; i < 60 * 40; i++) { _rtsTick(1 / 60); best = Math.min(best, Math.hypot(mig.x - gx, mig.z - gz)); }
    var flewOver = best < RTS_TILE * 1.5;
    var overBlocked = _rtsBlocked(_rtsTX(mig.x), _rtsTX(mig.z));

    /* What it can and cannot hurt. rtsVerses takes a TARGET ENTITY, not an armour name - it
       reads rtsArmour(tgt) itself - so handing it a string returned the same number for every
       class and made both aircraft look identical. Real entities, spawned for the purpose. */
    var probeTank = _rtsSpawnUnit('enemy', 'tank', pad.x + 40, pad.z + 40);
    var probeMan  = _rtsSpawnUnit('enemy', 'rifle', pad.x + 44, pad.z + 40);
    var wv = RTS_WEAPONS[rtsUnitDef('mig').weapon];
    var vsHeavy = wv.dmg * rtsVerses(wv, probeTank);
    var vsMen = wv.dmg * rtsVerses(wv, probeMan);
    var yw = RTS_WEAPONS[rtsUnitDef('yak').weapon];
    var yakMen = yw.dmg * rtsVerses(yw, probeMan);
    var yakHeavy = yw.dmg * rtsVerses(yw, probeTank);
    _rtsKill(probeTank); _rtsKill(probeMan);

    /* ammo runs out and it goes home rather than loitering with an empty rack */
    mig.ammo = 0;
    var beforeState = mig.rearming || 0;
    for (var j = 0; j < 60 * 60; j++) _rtsTick(1 / 60);
    var home = Math.hypot(mig.x - pad.x, mig.z - pad.z);
    var rearmed = mig.ammo > 0;
    return { flewOver: flewOver, overBlocked: overBlocked, d0: d0, best: best,
             vsHeavy: vsHeavy, vsMen: vsMen, yakMen: yakMen, yakHeavy: yakHeavy,
             home: home, rearmed: rearmed, ammo: mig.ammo, alive: !mig.dead };
  });
  S.ok('a MiG can be put in the air', !fly.error, fly.error || '');
  S.ok('it flies over ground nothing else can cross', fly.flewOver,
       'closed from ' + fly.d0.toFixed(1) + ' to ' + fly.best.toFixed(1) +
       (fly.overBlocked ? ', ending over a blocked cell' : ''));
  S.ok('the MiG hurts armour far more than infantry', fly.vsHeavy > fly.vsMen * 3,
       fly.vsHeavy.toFixed(1) + ' per shot vs heavy armour, ' + fly.vsMen.toFixed(1) + ' vs men');
  S.ok('the Yak is the other way round', fly.yakMen > fly.yakHeavy * 3,
       fly.yakMen.toFixed(1) + ' vs men, ' + fly.yakHeavy.toFixed(1) + ' vs heavy armour');
  S.ok('an empty aircraft returns to its airfield and rearms', fly.rearmed && fly.alive,
       'ended ' + fly.home.toFixed(1) + ' from the pad with ' + fly.ammo + ' rounds');

  /* ---------- 4. and the other army can shoot it down ---------- */
  var shootDown = await g.page.evaluate(function () {
    var out = {};
    [['allied', 'aagun'], ['soviet', 'rocketpit']].forEach(function (c) {
      var side = c[0], gunKey = c[1];
      rtsSetVoxSide(side);
      rtsClose(); rtsOpen(7);
      var G = window._rtsG, yd = _rtsHas('player', 'yard'), gun = null;
      for (var r = 3; r <= 16 && !gun; r++) for (var a = 0; a < 24 && !gun; a++) {
        var tx = _rtsTX(yd.x + Math.cos(a / 24 * 6.283) * r * RTS_TILE) - 1;
        var tz = _rtsTX(yd.z + Math.sin(a / 24 * 6.283) * r * RTS_TILE) - 1;
        if (_rtsCanPlace('player', gunKey, tx, tz)) {
          gun = _rtsPlaceStruct('player', gunKey, tx, tz);
          if (gun) { gun.building = 0; gun.bprog = 1; }
        }
      }
      if (!gun) { out[side] = { error: 'could not place a ' + gunKey }; return; }
      /* an enemy aircraft parked inside its arc */
      var plane = _rtsSpawnUnit('enemy', side === 'allied' ? 'mig' : 'heli', gun.x + 8, gun.z);
      if (!plane) { out[side] = { error: 'could not spawn the aircraft' }; return; }
      plane.order = 'hold';
      var hp0 = plane.hp;
      for (var i = 0; i < 60 * 30 && !plane.dead; i++) _rtsTick(1 / 60);
      out[side] = { gun: gunKey, killed: plane.dead, hp0: hp0, hp: plane.hp, secs: 30 };
    });
    return out;
  });
  ['allied', 'soviet'].forEach(function (side) {
    var r = shootDown[side];
    if (r.error) { S.ok(side + ' anti-air', false, r.error); return; }
    S.ok(side + "'s " + r.gun + ' shoots down an enemy aircraft', r.killed,
         'hp ' + r.hp0 + ' -> ' + (r.killed ? 'destroyed' : r.hp) + ' in ' + r.secs + 's');
  });

  /* and the AA Gun really is anti-air ONLY - otherwise it is a Gun Turret with a longer reach
     and the Soviet SAM site it mirrors is strictly worse.

     Asserted on the TARGETING DECISION rather than on a tank's health after a fight. Two
     earlier versions of this measured hit points and both were confounded: the first blamed the
     gun for damage the surrounding base did, and the second isolated the tank by geometry at
     t=0 and then watched a mobile neighbour close the 1.5 units it was short over the next
     twenty seconds. What the change actually says is "this weapon will not choose a ground
     target", and _rtsFindTarget is where that is decided. */
  var picks = await g.page.evaluate(function () {
    rtsSetVoxSide('allied');
    rtsClose(); rtsOpen(7);
    var G = window._rtsG, yd = _rtsHas('player', 'yard'), gun = null;
    for (var r = 3; r <= 16 && !gun; r++) for (var a = 0; a < 24 && !gun; a++) {
      var tx = _rtsTX(yd.x + Math.cos(a / 24 * 6.283) * r * RTS_TILE) - 1;
      var tz = _rtsTX(yd.z + Math.sin(a / 24 * 6.283) * r * RTS_TILE) - 1;
      if (_rtsCanPlace('player', 'aagun', tx, tz)) {
        gun = _rtsPlaceStruct('player', 'aagun', tx, tz);
        if (gun) { gun.building = 0; gun.bprog = 1; }
      }
    }
    if (!gun) return { error: 'could not place an AA Gun' };
    var w = RTS_WEAPONS[rtsStructDef('aagun').weapon];

    /* clear the field of enemies so the only candidates are the ones put there deliberately */
    G.ents.filter(function (e) { return e.side === 'enemy' && !e.dead; })
          .forEach(function (e) { e.dead = true; });

    var tank = _rtsSpawnUnit('enemy', 'tank', gun.x + 6, gun.z);
    var man  = _rtsSpawnUnit('enemy', 'rifle', gun.x + 5, gun.z + 2);
    var groundPick = _rtsFindTarget(gun, w.range, w);
    var plane = _rtsSpawnUnit('enemy', 'heli', gun.x + 7, gun.z + 1);
    var airPick = _rtsFindTarget(gun, w.range, w);

    /* the control: the Soviet Rocket Turret, which is aa AND ground, must still pick the tank */
    var pit = null;
    for (var r2 = 3; r2 <= 16 && !pit; r2++) for (var a2 = 0; a2 < 24 && !pit; a2++) {
      var tx2 = _rtsTX(yd.x + Math.cos(a2 / 24 * 6.283) * r2 * RTS_TILE) - 1;
      var tz2 = _rtsTX(yd.z + Math.sin(a2 / 24 * 6.283) * r2 * RTS_TILE) - 1;
      if (_rtsCanPlace('player', 'rocketpit', tx2, tz2)) {
        pit = _rtsPlaceStruct('player', 'rocketpit', tx2, tz2);
        if (pit) { pit.building = 0; pit.bprog = 1; }
      }
    }
    var pitPick = null;
    if (pit) {
      var pw = RTS_WEAPONS[rtsStructDef('rocketpit').weapon];
      var t2 = _rtsSpawnUnit('enemy', 'tank', pit.x + 6, pit.z);
      pitPick = _rtsFindTarget(pit, pw.range, pw);
      pitPick = pitPick ? pitPick.def : null;
    }
    return { aaOnly: !!w.aaOnly, aa: !!w.aa,
             groundPick: groundPick ? groundPick.def : null,
             airPick: airPick ? airPick.def : null,
             pitPick: pitPick, hadPit: !!pit };
  });
  S.ok('the AA Gun is declared anti-air and anti-air only',
       !picks.error && picks.aa && picks.aaOnly, picks.error || ('aa ' + picks.aa + ', aaOnly ' + picks.aaOnly));
  S.eq('with only a tank and a rifleman in reach, it picks NOTHING', picks.groundPick, null);
  S.eq('...and the moment an aircraft arrives, it picks that', picks.airPick, 'heli');
  S.ok('the control: the Rocket Turret still engages ground targets',
       picks.hadPit && picks.pitPick === 'tank', 'it picked ' + picks.pitPick);

  /* ---------- 5. the opponent actually uses it ----------
     THE LADDER CANNOT SEE THIS CHANGE, which is why this section exists. Every ladder match ends
     around 200 seconds with the idle player dead, and the opponent does not reach an airfield
     until roughly 257s - so the balance metric measured IDENTICALLY before and after the air
     force was added, and citing it as evidence of safety would have been citing a number that
     could not have moved. What is asserted here is what a long game does instead.

     G.over is cleared each tick to keep the match running past the idle player's defeat. That is
     not a real game; it is the only way to watch what the opponent DEVELOPS, which is where the
     fleet cap has to hold. */
  var longGame = await g.page.evaluate(function () {
    rtsSetVoxSide('allied');               /* so the opponent is Soviet and flies MiGs and Yaks */
    rtsClose(); rtsOpen(7);
    _rtsNewGame(9001, 'hard');
    var G = window._rtsG, padAt = null, planeAt = null, peak = 0, peakPads = 0, over = 0;
    for (var i = 0; i < 60 * 700; i++) {
      if (G.over) { G.over = null; }
      _rtsTick(1 / 60);
      if (i % 60) continue;
      var pads = 0, air = 0;
      for (var k = 0; k < G.ents.length; k++) {
        var e = G.ents[k];
        if (e.dead || e.side !== 'enemy') continue;
        if (e.type === 'struct' && !e.building && (rtsStructDef(e.def) || {}).produces === 'air') pads++;
        else if (e.type === 'unit' && (rtsUnitDef(e.def) || {}).kind === 'air') air++;
      }
      if (pads && padAt === null) padAt = Math.round(G.t);
      if (air && planeAt === null) planeAt = Math.round(G.t);
      if (air > peak) { peak = air; peakPads = pads; }
      if (air > pads) over++;
    }
    var defs = {};
    G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' &&
      (rtsUnitDef(e.def) || {}).kind === 'air'; })
          .forEach(function (e) { defs[e.def] = (defs[e.def] || 0) + 1; });
    return { padAt: padAt, planeAt: planeAt, peak: peak, peakPads: peakPads, over: over, defs: defs };
  });
  S.ok('the opponent builds an airfield in a long game', longGame.padAt !== null,
       'first pad at ' + longGame.padAt + 's');
  S.ok('...and flies from it', longGame.planeAt !== null,
       'first aircraft at ' + longGame.planeAt + 's, fleet peaked at ' + longGame.peak +
       ' ' + JSON.stringify(longGame.defs));
  /* Measured BEFORE the cap: thirty-four aircraft, almost all Yaks, because the opponent was
     rich, aircraft are their own production line, and nothing said stop. RA's own rule is one
     aircraft per pad. */
  S.ok('the fleet never outgrows the pads that service it', longGame.over === 0,
       'peak ' + longGame.peak + ' aircraft against ' + longGame.peakPads +
       ' pads; over the cap on ' + longGame.over + ' of the sampled seconds');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
