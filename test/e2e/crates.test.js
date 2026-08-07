/* Crates, opened one at a time.

   Nine kinds, and every one of them announces itself the same way: a line of text, a sound,
   the crate gone from the map. That is the whole problem. The announcement is not evidence -
   a bonus that was stored and never read, a reveal that lifted nobody's shroud, a free vehicle
   that failed to spawn all look exactly like a working crate from the outside, and the player
   has no way to tell. So each kind is opened and its EFFECT measured: the credits, the hit
   points, the shroud, the entity list, the damage.

   _rtsCrateOpen is called directly rather than by walking a unit onto whatever the map
   happened to roll. The pickup path is tested once, properly, on a real crate; after that,
   waiting for the right kind to appear at random would make the spec both slow and flaky, and
   the effects are what is under test.

   unit/crates covers the table - the weights, the caps and whether each modifier is read back
   anywhere at all. This is what the modifiers DO. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('crates');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  await g.start(7, 10, { freeze: true });

  /* ------------------------------------------------------------ on the map ---- */
  var laid = await g.page.evaluate(function () {
    var G = window._rtsG;
    var bad = (G.crates || []).filter(function (c) {
      var i = _rtsIdx(c.tx, c.tz);
      return !_rtsInB(c.tx, c.tz) || G.blocked[i] !== 0 || G.scrap[i] > 0;
    });
    var cells = {}, dup = 0;
    (G.crates || []).forEach(function (c) {
      var k = c.tx + ',' + c.tz;
      if (cells[k]) dup++;
      cells[k] = 1;
    });
    return { n: (G.crates || []).length, max: RTS_CRATE_MAX, bad: bad.length, dup: dup,
             kinds: (G.crates || []).map(function (c) { return c.kind; }),
             lives: (G.crates || []).map(function (c) { return Math.round(c.t); }),
             lo: RTS_CRATE_TIME * 30, hi: RTS_CRATE_TIME * 120 };
  });
  S.eq('the map is laid out with its full complement of crates', laid.n, laid.max);
  S.eq('...none of them on blocked ground or buried in ore', laid.bad, 0);
  S.eq('...and no two on the same cell', laid.dup, 0);
  S.ok('...each with a life inside the half-to-twice CrateTime window',
       laid.lives.every(function (t) { return t >= laid.lo - 1 && t <= laid.hi + 1; }),
       laid.lives.join('s, ') + 's (window ' + laid.lo + '-' + laid.hi + 's)');

  /* ----------------------------------------------------------- picking one up ----
     The real path, once: put a unit on a crate's cell and tick. What has to happen is that the
     crate goes AND another appears - "Create_Crate removes the old one and places a new one,
     so the count on the map is constant for the whole match". */
  var pickup = await g.page.evaluate(function () {
    var G = window._rtsG;
    if (!G.crates.length) return { error: 'no crates to pick up' };
    var cr = G.crates[0], was = G.crates.length;
    var u = _rtsSpawnUnit('player', 'tank', _rtsWX(cr.tx), _rtsWX(cr.tz));
    if (!u) return { error: 'could not put a unit on the crate' };
    u.x = _rtsWX(cr.tx); u.z = _rtsWX(cr.tz);
    var here = G.crates.some(function (c) { return c.tx === cr.tx && c.tz === cr.tz; });
    _rtsTick(1 / 60);
    var stillHere = G.crates.some(function (c) { return c.tx === cr.tx && c.tz === cr.tz; });
    var out = { was: was, here: here, stillHere: stillHere, now: G.crates.length,
                dirty: G.crateDirty };
    u.dead = true;
    return out;
  });
  S.ok('a crate is there to drive onto', !pickup.error && pickup.here, pickup.error || '');
  if (!pickup.error) {
    S.eq('driving onto it takes it', pickup.stillHere, false);
    S.eq('...and another is placed, so the count on the map never falls', pickup.now, pickup.was);
    S.ok('...and the renderer is told to redraw', !!pickup.dirty, 'crateDirty=' + pickup.dirty);
  }

  /* Both sides. "a crate does not know whose army it is under, and an opponent that drives
     over free money should get it." */
  var enemyGets = await g.page.evaluate(function () {
    var G = window._rtsG;
    var cr = G.crates[0], was = G.crates.length;
    var u = _rtsSpawnUnit('enemy', 'tank', _rtsWX(cr.tx), _rtsWX(cr.tz));
    if (!u) return { error: 'no enemy unit' };
    u.x = _rtsWX(cr.tx); u.z = _rtsWX(cr.tz);
    _rtsTick(1 / 60);
    var gone = !G.crates.some(function (c) { return c.tx === cr.tx && c.tz === cr.tz; });
    u.dead = true;
    return { gone: gone, count: G.crates.length, was: was };
  });
  S.ok('the opponent picks crates up too', !enemyGets.error && enemyGets.gone,
       enemyGets.error || 'taken by an enemy unit');
  S.eq('...and the count still holds', enemyGets.count, enemyGets.was);

  /* ================================================== what is in each box ====
     Every kind, opened deliberately, with the effect measured rather than the message read. */
  var open = await g.page.evaluate(function () {
    var G = window._rtsG, out = {};
    function crate(kind, tx, tz) { return { tx: tx, tz: tz, kind: kind }; }
    /* somewhere clear, well away from anything that could confound a splash */
    var spot = null;
    for (var tz = 20; tz < RTS_N - 20 && !spot; tz++)
      for (var tx = 20; tx < RTS_N - 20 && !spot; tx++) {
        var ok = true;
        for (var ox = -4; ox <= 4 && ok; ox++) for (var oz = -4; oz <= 4 && ok; oz++)
          if (!_rtsInB(tx + ox, tz + oz) || _rtsBlocked(tx + ox, tz + oz)) ok = false;
        if (ok) {
          var occupied = G.ents.some(function (e) {
            return !e.dead && Math.hypot(e.x - _rtsWX(tx), e.z - _rtsWX(tz)) < RTS_TILE * 6;
          });
          if (!occupied) spot = { tx: tx, tz: tz };
        }
      }
    if (!spot) return { error: 'nowhere clear to open a crate' };
    out.spot = spot;

    function subject(side, key) {
      var u = _rtsSpawnUnit(side || 'player', key || 'tank', _rtsWX(spot.tx), _rtsWX(spot.tz));
      if (u) { u.x = _rtsWX(spot.tx); u.z = _rtsWX(spot.tz); }
      return u;
    }

    /* ---- money: a GRANT, so the storage cap must not eat it ---- */
    var S1 = G.sides.player;
    var u1 = subject();
    var before = rtsMoney(S1);
    var res = _rtsCrateOpen(crate('money', spot.tx, spot.tz), u1);
    out.money = { kind: res, before: before, after: rtsMoney(S1), range: RTS_CRATE_MONEY };
    /* and again with the treasury already at capacity */
    S1.credits = S1.cap != null ? S1.cap : S1.credits;
    var atCap = rtsMoney(S1);
    _rtsCrateOpen(crate('money', spot.tx, spot.tz), u1);
    out.moneyAtCap = { before: atCap, after: rtsMoney(S1) };
    u1.dead = true;

    /* ---- heal ---- */
    var u2 = subject();
    u2.hp = Math.max(1, Math.round(u2.maxHp * 0.2));
    var hurt = u2.hp;
    _rtsCrateOpen(crate('heal', spot.tx, spot.tz), u2);
    out.heal = { hurt: hurt, healed: u2.hp, max: u2.maxHp };
    u2.dead = true;

    /* ---- the four multipliers, and that they are actually applied ---- */
    out.mult = {};
    [['armour', 'armor'], ['fpower', 'fire'], ['rapid', 'rof'], ['speed', 'speed']].forEach(function (p) {
      var u = subject();
      var was = rtsCrateMult(u, p[1]);
      _rtsCrateOpen(crate(p[0], spot.tx, spot.tz), u);
      var now = rtsCrateMult(u, p[1]);
      /* stack it until it stops moving, to see the cap bite */
      for (var i = 0; i < 12; i++) _rtsCrateOpen(crate(p[0], spot.tx, spot.tz), u);
      out.mult[p[1]] = { was: was, afterOne: now, capped: rtsCrateMult(u, p[1]),
                         cap: RTS_CRATE_CAP[p[1]] };
      u.dead = true;
    });

    /* ---- reveal: the player's shroud only ---- */
    var hidden = 0, i;
    for (i = 0; i < G.mapped.length; i++) { G.mapped[i] = 0; }
    for (i = 0; i < G.mapped.length; i++) if (!G.mapped[i]) hidden++;
    var uE = subject('enemy');
    _rtsCrateOpen(crate('reveal', spot.tx, spot.tz), uE);
    var afterEnemy = 0;
    for (i = 0; i < G.mapped.length; i++) if (G.mapped[i]) afterEnemy++;
    uE.dead = true;
    var uP = subject('player');
    _rtsCrateOpen(crate('reveal', spot.tx, spot.tz), uP);
    var afterPlayer = 0;
    for (i = 0; i < G.mapped.length; i++) if (G.mapped[i]) afterPlayer++;
    uP.dead = true;
    out.reveal = { total: G.mapped.length, hidden: hidden, afterEnemy: afterEnemy,
                   afterPlayer: afterPlayer };

    /* ---- a free vehicle, for each army ---- */
    out.unit = {};
    ['player', 'enemy'].forEach(function (side) {
      var u = subject(side);
      var got = [], tries = 24;
      for (var k = 0; k < tries; k++) {
        var n0 = G.ents.length;
        var r = _rtsCrateOpen(crate('unit', spot.tx, spot.tz), u);
        if (G.ents.length > n0) {
          var made = G.ents[G.ents.length - 1];
          got.push(made.def);
          made.dead = true;
        }
      }
      out.unit[side] = { got: got, army: rtsHouseSide(side),
                         pool: RTS_CRATE_UNITS.slice() };
      u.dead = true;
    });

    /* ---- the booby trap ---- */
    var victim = subject();
    victim.hp = victim.maxHp;
    var bystander = _rtsSpawnUnit('player', 'tank', _rtsWX(spot.tx) + RTS_TILE * 6, _rtsWX(spot.tz));
    if (bystander) { bystander.x = _rtsWX(spot.tx) + RTS_TILE * 6; bystander.z = _rtsWX(spot.tz); bystander.hp = bystander.maxHp; }
    var enemyNear = _rtsSpawnUnit('enemy', 'rifle', _rtsWX(spot.tx) + 1, _rtsWX(spot.tz) + 1);
    if (enemyNear) { enemyNear.x = _rtsWX(spot.tx) + 1; enemyNear.z = _rtsWX(spot.tz) + 1; enemyNear.hp = enemyNear.maxHp; }
    var shooter = _rtsSpawnUnit('player', 'tank', _rtsWX(spot.tx), _rtsWX(spot.tz));
    var killsBefore = shooter ? (shooter.kills || 0) : 0;
    var vHp = victim.hp, eHp = enemyNear ? enemyNear.hp : null;
    _rtsCrateOpen(crate('mine', spot.tx, spot.tz), victim);
    out.mine = {
      victimBefore: vHp, victimAfter: victim.hp, victimMax: victim.maxHp,
      enemyBefore: eHp, enemyAfter: enemyNear ? enemyNear.hp : null,
      bystanderBefore: bystander ? bystander.maxHp : null,
      bystanderAfter: bystander ? bystander.hp : null,
      radius: RTS_CRATE_MINE_RADIUS, dmg: RTS_CRATE_MINE_DMG,
      killsBefore: killsBefore, killsAfter: shooter ? (shooter.kills || 0) : 0,
      credited: G.ents.filter(function (e) { return e.kills; }).length
    };
    [victim, bystander, enemyNear, shooter].forEach(function (e) { if (e) e.dead = true; });
    return out;
  });

  S.ok('there is clear ground to open crates on', !open.error, open.error ||
       ('at ' + open.spot.tx + ',' + open.spot.tz));
  if (open.error) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  /* ---- money ---- */
  var gained = open.money.after - open.money.before;
  S.ok('a money crate pays out', gained > 0, gained + ' credits');
  S.ok('...within the range the rules give', gained >= open.money.range[0] && gained <= open.money.range[1],
       gained + ' against ' + open.money.range[0] + '-' + open.money.range[1]);
  /* "A GRANT, not harvest: crate money is found money and the storage cap must not eat it." */
  S.ok('...and a full treasury does not swallow it', open.moneyAtCap.after > open.moneyAtCap.before,
       open.moneyAtCap.before + ' -> ' + open.moneyAtCap.after + ' with storage already full');

  /* ---- heal ---- */
  S.ok('a repair kit was opened on a damaged unit', open.heal.hurt < open.heal.max,
       open.heal.hurt + ' of ' + open.heal.max + ' hp');
  S.eq('...and it goes back to full', open.heal.healed, open.heal.max);

  /* ---- the multipliers ---- */
  Object.keys(open.mult).forEach(function (k) {
    var m = open.mult[k];
    S.eq('a unit starts with no ' + k + ' bonus', m.was, 1);
    S.ok('...and one crate moves it', m.afterOne !== 1,
         '1 -> ' + m.afterOne.toFixed(3) + ' (cap ' + m.cap + ')');
    S.ok('...in the right direction', k === 'rof' ? m.afterOne < 1 : m.afterOne > 1,
         k === 'rof' ? 'lower is faster: ' + m.afterOne.toFixed(3) : m.afterOne.toFixed(3));
    S.near('...and thirteen of them stop exactly at the cap', m.capped, m.cap, 1e-9);
  });

  /* ---- reveal ---- */
  S.ok('the map starts shrouded for this test', open.reveal.hidden > 0,
       open.reveal.hidden + ' of ' + open.reveal.total + ' cells unmapped');
  S.eq('the opponent opening a map-data crate reveals nothing of yours', open.reveal.afterEnemy, 0);
  S.eq('...and you opening one reveals all of it', open.reveal.afterPlayer, open.reveal.total);

  /* ---- a free vehicle ---- */
  ['player', 'enemy'].forEach(function (side) {
    var u = open.unit[side];
    S.ok('a vehicle crate hands ' + side + ' a unit', u.got.length > 0,
         u.got.length + ' of 24 opens produced one: ' + u.got.join(', '));
    var outside = u.got.filter(function (k) { return u.pool.indexOf(k) < 0; });
    S.ok('...drawn from the crate list', !outside.length, outside.join(', ') || 'all from the list');
  });
  /* The fix this spec found: the list is shared and holds an Allied-only Light Tank, so a
     Soviet house could be handed a hull it cannot field, cannot replace and does not have in
     its sidebar. Whichever army opens it must only ever get its own. */
  var wrongArmy = await g.page.evaluate(function (got) {
    var bad = [];
    ['player', 'enemy'].forEach(function (side) {
      var army = rtsHouseSide(side);
      (got[side] || []).forEach(function (k) {
        var d = rtsUnitDef(k);
        if (d && !rtsBuildableBy(d, army)) bad.push(side + ' (' + army + ') was handed ' + k);
      });
    });
    return bad;
  }, { player: open.unit.player.got, enemy: open.unit.enemy.got });
  S.ok('...and never one belonging to the other army', !wrongArmy.length,
       wrongArmy.slice(0, 4).join('; ') ||
       ('player is ' + open.unit.player.army + ', opponent is ' + open.unit.enemy.army +
        '; nothing crossed over in 48 opens'));

  /* ---- the booby trap ---- */
  S.ok('a booby trap hurts the unit that opened it',
       open.mine.victimAfter < open.mine.victimBefore,
       open.mine.victimBefore + ' -> ' + open.mine.victimAfter + ' hp');
  S.ok('...and everything else close by, whatever side it is on',
       open.mine.enemyAfter !== null && open.mine.enemyAfter < open.mine.enemyBefore,
       'an enemy soldier beside it: ' + open.mine.enemyBefore + ' -> ' + open.mine.enemyAfter);
  S.eq('...but nothing outside the blast radius',
       open.mine.bystanderAfter, open.mine.bystanderBefore);
  /* "Damage comes from the crate itself rather than from a side, so it is nobody's kill and
     cannot be farmed for credit."

     True, and worth asserting as an outcome - but the mechanism is broader than the comment
     suggests, and mutation testing is what showed it. _rtsSplash hands _rtsDamage a null
     source for EVERY blast, whoever fired it, so no splash in the game credits a kill: not a
     booby trap, not a shell, not an explosion. The crate passes null in both its side and its
     source argument, so there is no edit downstream that makes this assertion fail. It records
     a property that holds rather than one this spec can break, which is the honest way to
     leave it. See the note below for what that means outside crates. */
  S.eq('...and no unit is credited with the kill', open.mine.killsAfter, open.mine.killsBefore);
  S.eq('...nor any other unit on the field', open.mine.credited, 0);
  S.note('kill credit is skipped for ALL splash damage, not only booby traps - _rtsSplash ' +
         'always passes a null source to _rtsDamage. A unit finished off by a tank shell\'s ' +
         'blast rather than its direct hit earns its killer nothing, and `kills` feeds the ' +
         'threat weighting in _rtsEvalObject. Reported, not changed: it is the same for both ' +
         'sides and the ladder was measured with it.');

  /* ------------------------------------------ and the bonuses actually bite ----
     Storing a multiplier and reading it back proves the crate wrote something down. Whether
     the GAME reads it is a different question, and the one that matters: unit/crates checks
     every modifier is consulted somewhere in the source, and these two check the effect at the
     far end. Armour and speed because both are measurable in a single step - one divides the
     damage, one scales the distance covered. */
  var bite = await g.page.evaluate(async function (spot) {
    var G = window._rtsG;
    function at(side, key, dx) {
      var u = _rtsSpawnUnit(side, key, _rtsWX(spot.tx) + (dx || 0), _rtsWX(spot.tz));
      if (u) { u.x = _rtsWX(spot.tx) + (dx || 0); u.z = _rtsWX(spot.tz); }
      return u;
    }
    /* ---- armour divides incoming damage ---- */
    var plain = at('player', 'tank', 0), armoured = at('player', 'tank', RTS_TILE * 3);
    plain.hp = plain.maxHp; armoured.hp = armoured.maxHp;
    _rtsCrateOpen({ tx: spot.tx, tz: spot.tz, kind: 'armour' }, armoured);
    _rtsDamage(plain, 100, null);
    _rtsDamage(armoured, 100, null);
    var arm = { plainLost: plain.maxHp - plain.hp, armLost: armoured.maxHp - armoured.hp,
                mult: rtsCrateMult(armoured, 'armor') };
    plain.dead = true; armoured.dead = true;

    /* ---- speed scales the ground covered ---- */
    var slow = at('player', 'tank', 0), fast = at('player', 'tank', RTS_TILE * 3);
    _rtsCrateOpen({ tx: spot.tx, tz: spot.tz, kind: 'speed' }, fast);
    var s0 = { x: slow.x, z: slow.z }, f0 = { x: fast.x, z: fast.z };
    var goalX = _rtsWX(spot.tx), goalZ = _rtsWX(spot.tz) + RTS_TILE * 18;
    _rtsOrderMove(slow, goalX, goalZ);
    _rtsOrderMove(fast, goalX + RTS_TILE * 3, goalZ);
    for (var i = 0; i < 60 * 4; i++) _rtsTick(1 / 60);
    var sp = { slow: Math.hypot(slow.x - s0.x, slow.z - s0.z),
               fast: Math.hypot(fast.x - f0.x, fast.z - f0.z),
               mult: rtsCrateMult(fast, 'speed') };
    slow.dead = true; fast.dead = true;
    return { arm: arm, sp: sp };
  }, open.spot);
  S.ok('an unarmoured tank takes the full hit', bite.arm.plainLost > 0,
       bite.arm.plainLost + ' hp of a 100 damage hit');
  S.ok('...and armour plating measurably reduces it', bite.arm.armLost < bite.arm.plainLost,
       bite.arm.armLost + ' hp against ' + bite.arm.plainLost + ' (armour ×' + bite.arm.mult + ')');
  S.near('...by exactly the crate\'s multiplier',
         bite.arm.plainLost / bite.arm.armLost, bite.arm.mult, 0.02);
  S.ok('both tanks set off', bite.sp.slow > 1 && bite.sp.fast > 1,
       'stock covered ' + bite.sp.slow.toFixed(1) + ', tuned ' + bite.sp.fast.toFixed(1));
  S.ok('...and an engine tune covers more ground in the same four seconds',
       bite.sp.fast > bite.sp.slow * 1.1,
       bite.sp.fast.toFixed(1) + ' against ' + bite.sp.slow.toFixed(1) +
       ' (speed ×' + bite.sp.mult + ')');

  /* ------------------------------------------------------------- determinism ----
     Crates draw from their OWN generator, which the source is emphatic about: placing them off
     the main stream is what keeps a seeded match comparable with the run before it. The
     observable half of that is that the same seed lays out the same crates. */
  var det = await g.page.evaluate(function () {
    function layout() {
      rtsOpen(11);
      var G = window._rtsG;
      return (G.crates || []).map(function (c) { return c.kind + '@' + c.tx + ',' + c.tz; }).join(' ');
    }
    var a = layout(), b = layout();
    return { a: a, b: b };
  });
  S.eq('the same seed lays out the same crates', det.a, det.b);
  S.ok('...and there is something to compare', det.a.length > 0, det.a);

  S.ok('the page logged no errors throughout', !g.errors.length,
       g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
