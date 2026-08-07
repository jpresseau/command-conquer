/* The two numbers the end-of-match screen prints, and whether they are true.

   "Enemy units destroyed: N · Units lost: M" is the whole scoreboard, and it is the one
   readout in the game with no way to check it. A player cannot count what died off-screen, so
   a wrong number here is not a visible bug - it is a quiet lie, and it stays a lie for the
   whole match. This repo has fixed the same shape of thing before: a sell button that quoted a
   refund up to 3.3x what it paid, where "nothing was stolen; what was lost was the ability to
   trust the number you are deciding on".

   Both halves of the readout are counted one line apart in _rtsKill and they were not counting
   the same kind of thing. What is asserted here is that a kill is credited to whoever actually
   caused it, that nobody is credited for a death nobody caused, and that a readout labelled
   "units" counts units. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('scoreboard');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  await g.start(7, 10, { freeze: true });

  var res = await g.page.evaluate(function () {
    var G = window._rtsG, out = {};
    /* clear ground, far from anything that could wander into a blast */
    var spot = null;
    for (var tz = 15; tz < RTS_N - 20 && !spot; tz++)
      for (var tx = 15; tx < RTS_N - 20 && !spot; tx++) {
        var ok = true;
        for (var ox = -3; ox < 9 && ok; ox++) for (var oz = -3; oz < 9 && ok; oz++)
          if (!_rtsInB(tx + ox, tz + oz) || _rtsBlocked(tx + ox, tz + oz)) ok = false;
        if (!ok) continue;
        var near = G.ents.some(function (e) {
          return !e.dead && Math.hypot(e.x - _rtsWX(tx), e.z - _rtsWX(tz)) < RTS_TILE * 10;
        });
        if (!near) spot = { tx: tx, tz: tz };
      }
    if (!spot) return { error: 'nowhere clear to stage a death' };
    out.spot = spot;

    function victim(side, dx) {
      var u = _rtsSpawnUnit(side, 'rifle', _rtsWX(spot.tx) + (dx || 0), _rtsWX(spot.tz));
      if (u) { u.x = _rtsWX(spot.tx) + (dx || 0); u.z = _rtsWX(spot.tz); u.hp = u.maxHp; }
      return u;
    }
    function settle() { for (var i = 0; i < 10; i++) _rtsTick(1 / 60); }
    function scored(fn) {
      var before = G.stats.killed;
      var r = fn();
      settle();
      return { credited: G.stats.killed - before, extra: r };
    }

    /* ---- a shell the player fired: credited, once ---- */
    out.direct = scored(function () {
      var v = victim('enemy', 0);
      var mine = _rtsSpawnUnit('player', 'tank', _rtsWX(spot.tx) + 2, _rtsWX(spot.tz));
      _rtsDamage(v, 999, mine);
      var r = { dead: !!v.dead, hurtBy: v.hurtBy || null };
      if (mine) mine.dead = true;
      return r;
    });

    /* ---- a blast the player set off: also credited, and this is the case that only works
            because a splash now records who fired it ---- */
    out.splash = scored(function () {
      var v = victim('enemy', 0);
      _rtsSplash(_rtsWX(spot.tx), _rtsWX(spot.tz), RTS_TILE * 3, 500, 'player', 1, null);
      return { dead: !!v.dead, hurtBy: v.hurtBy || null };
    });

    /* ---- the opponent shelling its OWN soldier: nothing to do with the player ---- */
    out.friendlyFire = scored(function () {
      var v = victim('enemy', 0);
      _rtsSplash(_rtsWX(spot.tx), _rtsWX(spot.tz), RTS_TILE * 3, 500, 'enemy', 1, null);
      return { dead: !!v.dead, hurtBy: v.hurtBy || null };
    });

    /* ---- a crate booby trap: nobody's doing at all ---- */
    out.boobyTrap = scored(function () {
      var v = victim('enemy', 0);
      var opener = _rtsSpawnUnit('player', 'tank', _rtsWX(spot.tx) + 40, _rtsWX(spot.tz));
      _rtsCrateOpen({ tx: spot.tx, tz: spot.tz, kind: 'mine' }, opener);
      var r = { dead: !!v.dead, hurtBy: v.hurtBy || null };
      if (opener) opener.dead = true;
      return r;
    });

    /* ---- an enemy BUILDING: a loss for them, but not a "unit destroyed" ---- */
    out.building = scored(function () {
      var b = _rtsPlaceStruct('enemy', 'power', spot.tx + 3, spot.tz + 3, true);
      var mine = _rtsSpawnUnit('player', 'tank', _rtsWX(spot.tx) + 2, _rtsWX(spot.tz));
      _rtsDamage(b, b.maxHp + 1, mine);
      var r = { dead: !!b.dead, hurtBy: b.hurtBy || null };
      if (mine) mine.dead = true;
      return r;
    });

    /* ---- and the other half of the readout, for symmetry: the player's own losses ---- */
    var lost0 = G.stats.lostU;
    var mineU = victim('player', 0);
    var foe = _rtsSpawnUnit('enemy', 'tank', _rtsWX(spot.tx) + 2, _rtsWX(spot.tz));
    _rtsDamage(mineU, 999, foe);
    settle();
    out.lostUnit = G.stats.lostU - lost0;
    var lost1 = G.stats.lostU;
    var myBld = _rtsPlaceStruct('player', 'power', spot.tx + 6, spot.tz + 6, true);
    _rtsDamage(myBld, myBld.maxHp + 1, foe);
    settle();
    out.lostBuildingCountedAsUnit = G.stats.lostU - lost1;
    if (foe) foe.dead = true;
    return out;
  });

  S.ok('there is clear ground to stage a death on', !res.error, res.error || '');
  if (res.error) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  S.eq('a shell the player fired kills the target', res.direct.extra.dead, true);
  S.eq('...and is credited to the player, once', res.direct.credited, 1);
  S.eq('...having recorded who fired it', res.direct.extra.hurtBy, 'player');

  S.eq('a blast the player set off also kills', res.splash.extra.dead, true);
  S.eq('...records the player as the attacker', res.splash.extra.hurtBy, 'player');
  S.eq('...and is credited', res.splash.credited, 1);

  S.eq('the opponent shelling its own soldier kills it', res.friendlyFire.extra.dead, true);
  S.eq('...and records the OPPONENT as the attacker', res.friendlyFire.extra.hurtBy, 'enemy');
  S.eq('...so the player is credited with nothing', res.friendlyFire.credited, 0);

  S.eq('a crate booby trap kills whoever is standing on it', res.boobyTrap.extra.dead, true);
  S.eq('...with no attacker to record', res.boobyTrap.extra.hurtBy, null);
  S.eq('...and credits nobody', res.boobyTrap.credited, 0);

  S.eq('an enemy building can be destroyed', res.building.extra.dead, true);
  S.eq('...without counting toward "enemy UNITS destroyed"', res.building.credited, 0);

  S.eq('losing a unit counts against the player', res.lostUnit, 1);
  S.eq('...and losing a building does not count as a lost unit', res.lostBuildingCountedAsUnit, 0);

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
