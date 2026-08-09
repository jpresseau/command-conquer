/* SUBMARINES THAT DID NOT SUBMERGE.

   Both Soviet boats were ordinary hulls that happened to carry torpedoes. There was no cloak
   flag anywhere in the roster and nothing in the code read one, so a Submarine sat on the
   surface being shot at by anything with a gun that reached the water - while the Destroyer's
   own roster line has always read "the Allied answer to a submarine", a promise nothing
   implemented. The two Soviet hulls and the Allied one that exists to counter them were, in
   play, three boats with different damage numbers.

   The rule is TECHNO.CPP's Cloaking_AI and it is two sentences:

     a cloaked object that FIRES will decloak, and stays up for a moment afterwards;
     anything close enough FINDS it, and a hull with sonar finds it from much further out.

   That is the whole of it, and between them they are the counterplay: you cannot be hit by a
   submarine without it showing itself, and you can go and look for one if you buy the hull that
   looks. Everything reads one flag, `hidden`, computed by the boat itself once a tick - see
   _rtsCloakAI - so target acquisition and the player's own screen can never disagree about
   whether a boat is there.

   THE ARENA IS SYNTHETIC, and it is cut into the live grid: no maps ship in this repo, and
   where a generated map puts its water is not a place to hang assertions. A lake is carved,
   boats are placed in it, and the sim is stepped by hand. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('stealth');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 6, { freeze: true });

  var r = await g.page.evaluate(function () {
    var G = window._rtsG, yd = _rtsHas('player', 'yard');
    if (!yd) return { error: 'no command yard' };
    /* a lake, well clear of either base, and the tile coordinates of its middle */
    var lx = _rtsTX(yd.x) + 14, lz = _rtsTX(yd.z) + 6, W = 22, H = 14;
    if (lx + W >= RTS_N || lz + H >= RTS_N) { lx = 30; lz = 30; }
    var tx, tz;
    for (tz = lz; tz < lz + H; tz++) {
      for (tx = lx; tx < lx + W; tx++) {
        var ix = _rtsIdx(tx, tz);
        G.terrain[ix] = RTS_T_WATER; G.blocked[ix] = 2; G.scrap[ix] = 0; G.gems[ix] = 0;
      }
    }
    G.scrapDirty = true;
    function wx(t) { return _rtsWX(t); }
    function step(secs) { for (var i = 0; i < secs * 60; i++) { _rtsTick(1 / 60); if (G.over) return false; } return true; }
    /* Every boat placed here is put on the water by tile, so nothing is ever accidentally
       spawned on land where its own passability would strand it. */
    var midz = lz + (H >> 1);

    var out = { detect: RTS_SUB_DETECT, surface: RTS_SUB_SURFACE, tile: RTS_TILE,
                sonar: (rtsUnitDef('destroyer') || {}).detects,
                cloakers: ['sub', 'missilesub'].filter(function (k) {
                  return !!(rtsUnitDef(k) || {}).cloak; }) };

    /* ---------------- 1. a submarine on its own is not there ---------------- */
    var sub = _rtsSpawnUnit('enemy', 'sub', wx(lx + 4), wx(midz));
    if (!sub) return { error: 'could not launch a submarine' };
    /* EVERY BOAT HERE IS PINNED AND SILENCED, and both halves are needed.

       `cool` is the reload timer and _rtsUpdateUnit will not fire while one is running, so a
       large value means a boat never shoots of its own accord - while _rtsFire, called directly
       below, does not consult it. Without that, a torpedo fired mid-step surfaces the submarine
       and every "is it hidden now" afterwards is really "did it happen to shoot just then".

       MISSION_STICKY does the other half. A submarine left on its own acquires the gunboat and
       DRIVES AT IT - it cannot fire, but it closes to inside RTS_SUB_DETECT and gives itself
       away, so "it submerged again" came back false for a reason that had nothing to do with
       submerging. Hold clears the path and refuses to chase, which is exactly what a controlled
       arena wants. The distances in this spec are the point of it; nothing may drift. */
    function pin(u) { u.cool = 9999; u.target = null; u.order = 'hold'; u.path = null; }
    function silence() { pin(sub); if (typeof boat !== 'undefined' && boat) pin(boat);
                         if (typeof dd !== 'undefined' && dd && !dd.dead) pin(dd); }
    var boat = null, dd = null;
    silence();
    step(1);
    out.hidden = !!sub.hidden;
    out.seen = _rtsEntSeen(sub);
    /* and therefore not clickable: _rtsPickAt refuses what _rtsEntSeen refuses */
    _rtsR.focus.x = sub.x; _rtsR.focus.z = sub.z; _rtsClampFocus();
    var sp = _rtsWorldToScreen(sub.x, 1, sub.z);
    var hit = _rtsPickAt(sp.x, sp.y);
    out.clickable = !!(hit && hit.ent === sub);

    /* ---------------- 2. nothing can acquire it ---------------- */
    /* THE CONTROL, and its distance is the whole of it. The Gunboat has to be somewhere it
       could shoot the submarine if only it could find it - inside its own sight AND its own
       weapon range - while being outside RTS_SUB_DETECT and carrying no sonar. Sight is 20 and
       the gun reaches 24, against a detect floor of 10, so four and a bit tiles is the window.
       Parked at seven, as this first read, it was outside its own sight: "it cannot acquire the
       submarine" was then true of any boat anywhere and proved nothing at all. */
    boat = _rtsSpawnUnit('player', 'gunboat', wx(lx + 4) + RTS_TILE * 4.4, wx(midz));
    if (!boat) return { error: 'could not launch a gunboat' };
    out.gunboatSight = rtsUnitDef('gunboat').sight / RTS_TILE;
    out.gunboatGap = Math.hypot(boat.x - sub.x, boat.z - sub.z) / RTS_TILE;
    out.gunboatReach = _rtsReach(boat) / RTS_TILE;
    silence();
    step(1);
    out.acquired = !!_rtsFindTarget(boat, rtsUnitDef('gunboat').sight, RTS_WEAPONS.navalgun);
    /* AND NOW THE ONE THAT MATTERS. Section 1 asked whether the player could see a submarine
       sitting alone in the fog, and the answer was no for a reason that has nothing to do with
       cloaking - there was nothing out there to see with. Mutation-testing said so: breaking
       _rtsEntSeen's cloak check outright left this spec fully green.

       With the gunboat parked 4.4 tiles off and 5 tiles of sight, the water the submarine is in
       is LIT. That is the case: in plain view, in daylight, and still not there. */
    var stx = _rtsTX(sub.x), stz = _rtsTX(sub.z);
    out.waterIsLit = _rtsVisible(stx, stz);
    out.seenInTheLight = _rtsEntSeen(sub);
    _rtsR.focus.x = sub.x; _rtsR.focus.z = sub.z; _rtsClampFocus();
    var sp2 = _rtsWorldToScreen(sub.x, 1, sub.z);
    var hit2 = _rtsPickAt(sp2.x, sp2.y);
    out.clickableInTheLight = !!(hit2 && hit2.ent === sub);
    var subHp0 = sub.hp;
    silence();
    step(12);
    out.shotAt = subHp0 - sub.hp;
    out.stillHidden = !!sub.hidden;

    /* ---------------- 3. it has to surface to shoot ---------------- */
    /* Its own torpedo reaches 22 and the gunboat is at 28, so it closes first. Rather than
       drive it, the shot is taken directly - what is being measured is the consequence of
       firing, not the approach. */
    var boatHp0 = boat.hp;
    _rtsFire(sub, boat, RTS_WEAPONS.torpedo);
    out.decloakSet = sub.decloak;
    step(0.5);
    out.upAfterFiring = !sub.hidden;
    out.visibleAfterFiring = _rtsEntSeen(sub);
    /* the window in which it can be answered */
    out.acquirableWhileUp = !!_rtsFindTarget(boat, rtsUnitDef('gunboat').sight, RTS_WEAPONS.navalgun);
    out.hurtIt = boat.hp <= boatHp0;      /* the torpedo did land - the shot was real */
    silence();
    step(RTS_SUB_SURFACE + 1);
    out.downAgain = !!sub.hidden;

    /* ---------------- 4. sonar, and the lack of it ---------------- */
    /* The Gunboat stays exactly where it is, and the Destroyer is put at THE SAME DISTANCE.
       That is what makes this a measurement of sonar rather than of range: two hulls, one gap,
       and only one of them finds the boat. */
    silence();
    dd = _rtsSpawnUnit('player', 'destroyer', sub.x + RTS_TILE * 4.4, sub.z + RTS_TILE * 0.2);
    if (!dd) return { error: 'could not launch a destroyer' };
    out.destroyerGap = Math.hypot(dd.x - sub.x, dd.z - sub.z) / RTS_TILE;
    silence();
    step(1);
    out.foundBySonar = !sub.hidden;
    out.visibleToSonar = _rtsEntSeen(sub);
    out.acquiredBySonar = !!_rtsFindTarget(dd, rtsUnitDef('destroyer').sight, RTS_WEAPONS.navalheavy);
    /* and it goes dark again the moment the sonar leaves */
    dd.x = wx(lx + W - 2); dd.z = wx(lz + H - 2);
    silence();
    step(1);
    out.darkAgain = !!sub.hidden;
    out.sonarGapWhenLost = Math.hypot(dd.x - sub.x, dd.z - sub.z) / RTS_TILE;
    _rtsKillQuiet(dd);

    /* ---------------- 5. proximity finds one without sonar ---------------- */
    boat.x = sub.x + RTS_SUB_DETECT * 0.6; boat.z = sub.z;
    silence();
    step(1);
    out.foundClose = !sub.hidden;
    boat.x = sub.x + RTS_SUB_DETECT * 2.0; boat.z = sub.z;
    silence();
    step(1);
    out.hiddenAgain = !!sub.hidden;
    out.backedOffTo = Math.hypot(boat.x - sub.x, boat.z - sub.z) / RTS_TILE;

    /* ---------------- 6. and one of YOUR OWN is still on your screen ---------------- */
    var mine = _rtsSpawnUnit('player', 'sub', wx(lx + 3), wx(lz + 2));
    pin(mine);
    step(1);
    out.mineHidden = !!mine.hidden;
    out.mineSeen = _rtsEntSeen(mine);          /* yours: drawn awash, not removed */
    out.mineSelectable = _rtsIsArmy(mine);
    /* ...and hidden from the OPPONENT's acquisition by the same flag */
    var foe = _rtsSpawnUnit('enemy', 'gunboat', wx(lx + 10), wx(lz + 2));
    pin(foe); pin(mine);
    step(1);
    out.foeAcquiresMine = !!_rtsFindTarget(foe, rtsUnitDef('gunboat').sight, RTS_WEAPONS.navalgun);
    out.foeGap = Math.hypot(foe.x - mine.x, foe.z - mine.z) / RTS_TILE;

    /* ---------------- 7. a save remembers whether it was down ---------------- */
    mine.decloak = 0; pin(mine); step(1);
    var before = { hidden: !!mine.hidden, id: mine.id };
    var body = (typeof _rtsSaveState === 'function') ? _rtsSaveState(G) : null;
    out.saveable = !!body;
    if (body) {
      var json = JSON.stringify(body);
      _rtsApplyState(G, JSON.parse(json));
      var back = window._rtsG.byId[before.id];
      out.survivedSave = !!back;
      out.hiddenAfterLoad = back ? !!back.hidden : null;
      out.hiddenBeforeSave = before.hidden;
      out.saveBytes = json.length;
    }
    return out;
  });

  S.ok('the arena could be cut', !r.error, r.error || 'ok');
  if (!r.error) {
    S.eq('both Soviet boats are cloakers', JSON.stringify(r.cloakers), '["sub","missilesub"]');
    S.note('detect floor ' + (r.detect / r.tile).toFixed(1) + ' tiles, destroyer sonar ' +
           (r.sonar / r.tile).toFixed(1) + ' tiles, surfaced for ' + r.surface + 's');
    S.ok('a destroyer sees further than the floor everything else has', r.sonar > r.detect,
         r.sonar + ' vs ' + r.detect);

    S.ok('a submarine runs submerged', r.hidden, String(r.hidden));
    S.ok('...so the player cannot see it', !r.seen, String(r.seen));
    S.ok('...and cannot click on it either', !r.clickable, String(r.clickable));

    S.note('gunboat parked ' + r.gunboatGap.toFixed(1) + ' tiles off, with ' +
           r.gunboatSight.toFixed(1) + ' tiles of sight, ' + r.gunboatReach.toFixed(1) +
           ' tiles of reach, and no sonar');
    /* Without this the "it cannot acquire it" below is true of any boat parked anywhere. */
    S.ok('the gunboat is close enough to see and to shoot it, if only it could find it',
         r.gunboatGap < r.gunboatReach && r.gunboatGap < r.gunboatSight,
         r.gunboatGap.toFixed(1) + ' tiles, inside sight ' + r.gunboatSight.toFixed(1) +
         ' and reach ' + r.gunboatReach.toFixed(1));
    S.ok('...and far enough out that mere proximity does not give it away',
         r.gunboatGap > r.detect / r.tile,
         r.gunboatGap.toFixed(1) + ' vs a detect floor of ' + (r.detect / r.tile).toFixed(1));
    S.ok('...but cannot acquire it', !r.acquired, String(r.acquired));
    /* THE CASE SECTION 1 ONLY LOOKED LIKE IT WAS MAKING. A submarine alone in the fog is
       invisible whether or not cloaking works at all; this one is sitting in water the gunboat
       is lighting up. */
    S.ok('the water the submarine is in is lit by the gunboat', r.waterIsLit,
         String(r.waterIsLit));
    S.ok('...and it is STILL not visible, in plain sight', !r.seenInTheLight,
         String(r.seenInTheLight));
    S.ok('...nor clickable, so it cannot be ordered attacked either', !r.clickableInTheLight,
         String(r.clickableInTheLight));
    S.eq('...and lands nothing on it over twelve seconds', r.shotAt, 0);
    S.ok('...while it stays down', r.stillHidden, String(r.stillHidden));

    /* THE COUNTERPLAY. Firing costs it the cloak, or it is a gun with no answer. */
    S.ok('firing puts it on the surface', r.upAfterFiring, String(r.upAfterFiring));
    S.ok('...its torpedo really did land, so this is the cost of a real shot', r.hurtIt,
         String(r.hurtIt));
    S.eq('...for exactly the surfacing window', r.decloakSet, r.surface);
    S.ok('...during which the player can see it', r.visibleAfterFiring, String(r.visibleAfterFiring));
    S.ok('...and the gunboat that could not find it a moment ago now can',
         r.acquirableWhileUp, String(r.acquirableWhileUp));
    S.ok('...and it submerges again once the window passes', r.downAgain, String(r.downAgain));

    S.note('destroyer at ' + r.destroyerGap.toFixed(1) + ' tiles, gunboat still at ' +
           r.gunboatGap.toFixed(1));
    S.ok('the two hulls are at the same distance, so this measures sonar and not range',
         Math.abs(r.destroyerGap - r.gunboatGap) < 0.5,
         r.destroyerGap.toFixed(2) + ' vs ' + r.gunboatGap.toFixed(2));
    S.ok('a Destroyer finds it at a range the Gunboat cannot', r.foundBySonar,
         String(r.foundBySonar));
    S.ok('...and the player sees what the sonar sees', r.visibleToSonar, String(r.visibleToSonar));
    S.ok('...and can shoot it', r.acquiredBySonar, String(r.acquiredBySonar));
    S.ok('...and it goes dark again when the sonar leaves', r.darkAgain,
         r.sonarGapWhenLost.toFixed(1) + ' tiles away');

    S.ok('anything that gets close enough finds one without sonar', r.foundClose,
         String(r.foundClose));
    S.ok('...and loses it again when it backs off to ' + r.backedOffTo.toFixed(1) + ' tiles',
         r.hiddenAgain, String(r.hiddenAgain));

    /* YOUR OWN. The flag is about the boat, not about who is asking - so the same line that
       hides it from the opponent must not hide it from you. */
    S.ok('your own submarine is submerged too', r.mineHidden, String(r.mineHidden));
    S.ok('...but stays on your screen, drawn awash', r.mineSeen, String(r.mineSeen));
    S.ok('...and stays part of your army', r.mineSelectable, String(r.mineSelectable));
    S.ok('...while the opponent, ' + r.foeGap.toFixed(1) + ' tiles off, cannot acquire it',
         !r.foeAcquiresMine, String(r.foeAcquiresMine));

    S.ok('the battle can be saved with a submarine in it', r.saveable, String(r.saveable));
    S.ok('...and the boat comes back', r.survivedSave, String(r.survivedSave));
    S.eq('...still submerged, rather than surfacing on load',
         r.hiddenAfterLoad, r.hiddenBeforeSave);
  }

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
