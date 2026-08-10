/* THE OPPONENT COULD NOT CAPTURE.

   _rtsCapture has always been side-agnostic, and the unit tick has always driven a `capture`
   order for whoever holds one - but nothing ever gave the opponent one. rules/ai.js said why,
   and the reason was honest: "capturing is a decision about a specific building at a specific
   moment, and an AI that buys engineers without a plan for them just donates 600 credits to
   whatever shoots them first." There was no plan. There is one now, and it is the same shape
   as the landing craft's: a question asked of the map, and a purchase gated on the answer.

   FOUR THINGS ARE TESTED SEPARATELY, because each can pass while the others are broken:

     THE DECISION - is there a building worth taking? A gate that says yes to everything is the
     engineer-in-the-mix mistake with extra steps, and one that says yes to an UNCAPTURABLE
     building is worse: the order is dropped at the wall and the engineer stands there. Asserted
     against the six that cannot be captured, against the cost table that ranks a Construction
     Yard at zero, and against guns on the approach.

     THE MANOEUVRE - given the team, does it walk in and take the building? Driven from a team
     assembled by hand, because what is under test is the mission script and not the economy.

     THE AFTERMATH - what a captured building does to the side that now owns it. This is the
     half that did not exist before this change, and it is where the interesting bugs were: the
     whole codebase assumed a side's buildings are all in one place, because until an engineer
     could move one between sides, they were.

     THE ACCOUNTING - an engineer bought is an engineer used. The cap must bound the waste
     rather than freeze the gate shut, and the two failure modes are opposites. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('capture');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 10, { freeze: true });

  /* ------------------------------------------------------------- the decision ------------ */
  var decide = await g.page.evaluate(function () {
    var G = window._rtsG, out = {};
    function fresh() { G.ai.capT = null; }
    /* The house has to be awake for the gate to open at all - see _rtsAIWorthCapturing. Every
       case below is about WHICH building, so the alert is set once and left. */
    G.ai.wave = 1;

    var ty = null;
    for (var i = 0; i < RTS_TEAM_TYPES.length; i++)
      if (RTS_TEAM_TYPES[i].name === 'Snatch') ty = RTS_TEAM_TYPES[i];
    out.type = !!ty;
    out.members = ty ? Object.keys(ty.members).sort() : [];
    out.missions = ty ? ty.missions.map(function (m) { return m[0]; }) : [];
    out.suicide = !!(ty && ty.suicide);
    out.reinforce = !!(ty && ty.reinforce);
    out.gateFlag = !!(ty && ty.capture);

    /* 1. THE SIX THAT CANNOT BE CAPTURED. Ranked by _rtsEvalObject's Math.max(cost,hp) - the
       value function the attack quarries use - four of the top of the player's building list
       are uncapturable, which is exactly why capture needs its own chooser. */
    out.uncapturable = RTS_STRUCTS.filter(function (d) { return d.capturable === false; })
                                  .map(function (d) { return d.key; }).sort();

    /* 2. THE CONSTRUCTION YARD IS FREE, so a chooser keyed on price ranks the best capture in
       the game below a Power Plant. */
    out.yardCost = rtsStructDef('yard').cost;
    out.yardWorth = _rtsCaptureWorth({ def:'yard' });
    out.powerWorth = _rtsCaptureWorth({ def:'power' });
    out.refWorth = _rtsCaptureWorth({ def:'refinery' });

    /* 3. the gate finds a real, capturable target on the generated map */
    fresh();
    out.worth = _rtsAIWorthCapturing();
    out.tgt = G.ai.capTgt ? G.ai.capTgt.def : null;
    out.tgtCapturable = G.ai.capTgt ? rtsCapturable(G.ai.capTgt.def) : null;
    out.tgtIsPlayers = G.ai.capTgt ? G.ai.capTgt.side : null;

    /* 4. ...and it is not merely finding SOMETHING: put a wall of guns round the target and it
       has to give up. An engineer has 45 hp, no armour and no weapon; past a couple of guns
       covering the approach it does not arrive, so the prize is irrelevant. */
    var tgt = G.ai.capTgt;
    var guns = [];
    if (tgt) {
      for (var k = 0; k < 4; k++) {
        var b = { id:90000 + k, side:'player', type:'struct', def:'pillbox', dead:false,
                  x:tgt.x + (k - 1.5) * 3, z:tgt.z + 4, tx:_rtsTX(tgt.x), tz:_rtsTX(tgt.z),
                  hp:400, maxHp:400 };
        G.ents.push(b); guns.push(b);
      }
    }
    out.gunsSeen = tgt ? _rtsCaptureGuns(tgt) : -1;
    fresh();
    out.worthGuarded = _rtsAIWorthCapturing();
    for (var q = 0; q < guns.length; q++) guns[q].dead = true;
    G.ents = G.ents.filter(function (e) { return !e.dead || e.type !== 'struct'; });

    /* 5. and with the house asleep it is no, whatever the map looks like */
    G.ai.wave = 0; G.ai.lastHit = null; var tSave = G.t; G.t = 5;
    fresh();
    out.worthAsleep = _rtsAIWorthCapturing();
    G.t = tSave; G.ai.wave = 1;
    fresh();
    out.worthAwake = _rtsAIWorthCapturing();
    return out;
  });

  S.ok('there is a Snatch team type', decide.type, 'ok');
  S.eq('...whose script is take it, then fight for what is left',
       decide.missions.join(','), 'capture,attack,tarcom');
  S.eq('...crewed by an engineer and an escort', decide.members.join(','), 'engineer,rifle,tank');
  S.ok('...flagged so the gate can refuse it', decide.gateFlag, 'capture:true');
  /* Both of these are load-bearing rather than flavour - see the type's own comment. */
  S.ok('...suicide, so the lag rule cannot freeze the walk-in', decide.suicide, 'suicide:true');
  S.ok('...and not reinforcing, because the engineer dies on SUCCESS',
       !decide.reinforce, 'reinforce:false');

  S.eq('six buildings cannot be captured at all', decide.uncapturable.join(','),
       'gps,iron,mslo,pdox,silo,wall');
  S.eq('the Construction Yard costs nothing, so price cannot rank it', decide.yardCost, 0);
  S.ok('...and is scored on what it does instead', decide.yardWorth > decide.refWorth,
       'yard ' + decide.yardWorth + ' vs refinery ' + decide.refWorth);
  S.ok('...where a price-ranked chooser would put it below a Power Plant',
       decide.powerWorth < decide.yardWorth, 'power ' + decide.powerWorth);

  S.ok('the opponent finds a building worth taking', decide.worth, 'target: ' + decide.tgt);
  S.ok('...one that can actually be captured', decide.tgtCapturable === true, 'capturable');
  S.eq("...and one of the PLAYER's", decide.tgtIsPlayers, 'player');
  S.ok('four guns covering it are seen', decide.gunsSeen >= 4, 'counted ' + decide.gunsSeen);
  S.ok('...and the walk is called off', !decide.worthGuarded,
       'guns ' + decide.gunsSeen + ' over the limit of ' + 2);
  S.ok('a sleeping house buys no engineer, whatever the map looks like', !decide.worthAsleep,
       'the team that would use it cannot be raised yet');
  S.ok('...and wants one again once it is awake', decide.worthAwake, 'gate reopens');

  /* ------------------------------------------------------------- the manoeuvre ----------- */
  var run = await g.page.evaluate(function () {
    var G = window._rtsG, out = { trace: [] };
    G.ai.wave = 1;

    /* A target the engineer can plainly reach: the player's Power Plant, with the approach
       clear. Worth is not the subject here - the walk is - so the gate is not consulted. */
    var tgt = null;
    for (var i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (!e.dead && e.side === 'player' && e.type === 'struct' && rtsCapturable(e.def)) { tgt = e; break; }
    }
    if (!tgt) return { error: 'no capturable player building' };
    out.aim = tgt.def;
    out.aimAt = [tgt.tx, tgt.tz];
    out.wasPlayers = tgt.side === 'player';

    /* Spawn the team beside the target rather than across the map: the walk is _rtsSteer's job
       and it has its own spec. What is under test here is the LEG - that it issues a capture
       order, that it survives a bullet, and that it notices the side flip. */
    var spot = _rtsNearestOpen(tgt.tx + 6, tgt.tz + 6, 20, null);
    var sx = _rtsWX(spot[0]), sz = _rtsWX(spot[1]);
    var made = [];
    function spawn(def, dx, dz) {
      var u = _rtsSpawnUnit('enemy', def, sx + dx, sz + dz);
      if (u) made.push(u);
      return u;
    }
    var eng = spawn('engineer', 0, 0);
    spawn('tank', 3, 0); spawn('tank', -3, 0);
    spawn('rifle', 0, 3); spawn('rifle', 0, -3);
    out.spawned = made.length;
    if (!eng) return { error: 'no engineer' };

    var ty = null;
    for (i = 0; i < RTS_TEAM_TYPES.length; i++)
      if (RTS_TEAM_TYPES[i].name === 'Snatch') ty = RTS_TEAM_TYPES[i];
    var t = _rtsTeamMake(ty);
    if (!t) return { error: 'team not made' };
    /* Crewed by hand and flagged into action, rather than waiting for the recruiter: what is
       under test is the mission script, not the recruiting that fills a team. */
    for (i = 0; i < made.length; i++) _rtsTeamAdd(t, made[i]);
    for (i = 0; i < t.members.length; i++) t.members[i].init = true;
    t.moving = true; t.hasBeen = true; t.under = false;
    t.zone = _rtsTeamCentre(t);
    G.ai.capTgt = tgt; G.ai.capT = G.t;
    out.crewed = t.members.length;

    /* THE BULLET, twice over, because there are two separate defences and each can fail alone.

       Took_Damage retargets a team onto whoever shot it, and the guard that would stop that
       only fires when the current target has a weapon of its own - which no building worth
       capturing does. A capture team is `suicide`, which opts out of retargeting entirely, so
       the first shot proves the team is not distracted.

       The second is the one that matters if the first is ever relaxed: t.target is CLOBBERED by
       hand with a player unit, which is exactly what Took_Damage would have done to a
       non-suicide team. The capture must carry on regardless, because its objective is not
       kept there. Storing it in t.target is the obvious implementation and it is the one that
       silently loses the building to a stray round. */
    var hitAt = null, clobbered = null, clobberSurvived = null;
    for (i = 0; i < 60 * 60; i++) {
      _rtsTick(1 / 60);
      if (i === 120) {
        var vic = null;
        for (var m = 0; m < t.members.length; m++)
          if (!t.members[m].dead && t.members[m].def !== 'engineer') vic = t.members[m];
        var shooter = null;
        for (var p = 0; p < G.ents.length; p++) {
          var pu = G.ents[p];
          if (!pu.dead && pu.side === 'player' && pu.type === 'unit' && rtsUnitDef(pu.def).weapon) { shooter = pu; break; }
        }
        if (vic && shooter) {
          _rtsTeamTookDamage(vic, shooter);
          hitAt = t.capt ? t.capt.def : null;
          out.retargeted = !!t.target;
          /* ...and now the clobber a non-suicide team would have suffered. */
          t.target = shooter;
          clobbered = t.target === shooter;
        }
      }
      if (i === 130 && clobbered) clobberSurvived = (t.capt === tgt) && eng.order === 'capture';
      if (i % 300 === 0) {
        out.trace.push('t' + Math.round(i / 60) + ' leg' + (t.cur | 0) +
                       ' eng' + (eng.dead ? 'X' : eng.order || '-') +
                       ' capt' + (t.capt ? t.capt.def : '-') +
                       ' side:' + tgt.side);
      }
      if (tgt.side !== 'player') break;
    }
    out.captAfterHit = hitAt;
    out.clobbered = clobbered;
    out.clobberSurvived = clobberSurvived;
    out.took = tgt.side;
    out.engSpent = eng.dead;
    out.secs = Math.round(i / 60);
    out.leg = t.cur | 0;
    /* The team must not be PINNED on a building it now owns. It should still be alive and
       fighting - the script is capture, then attack, then hold to what it hit - but nothing it
       is aiming at may be the captured building, which is alive and friendly forever and which
       the .dead completion test every other leg uses can never see the end of. */
    for (var s = 0; s < 60 * 30; s++) _rtsTick(1 / 60);
    out.teamAlive = !!G.teams[t.id];
    out.legEnd = t.cur | 0;
    out.aimsAtOwn = !!(t.target === tgt || t.capt === tgt);
    return out;
  });

  if (run.error) S.ok('the capture arena could be set up', false, run.error);
  else {
    S.ok('the capture arena could be set up', true, 'aimed at ' + run.aim + ' ' + JSON.stringify(run.aimAt));
    S.eq('the team is crewed', run.crewed, 5);
    S.note('the walk-in: ' + run.trace.join(' | '));
    S.eq('a bullet into the escort does not move the capture objective', run.captAfterHit, run.aim);
    S.ok('...because a capture team ignores distractions by design', !run.retargeted,
         'suicide, so Took_Damage does not retarget');
    /* The defence that holds even without that one. */
    S.ok('t.target can be clobbered with a player unit', run.clobbered, 'clobbered by hand');
    S.ok('...and the capture carries on regardless, because it is not kept there',
         run.clobberSurvived, 'objective and order both intact');
    S.eq('the opponent takes the building', run.took, 'enemy');
    S.ok('...spending the engineer to do it', run.engSpent, 'engineer consumed');
    S.ok('...within the leg', run.secs < 60, 'took ' + run.secs + 's');
    S.ok('the team moves on to the next leg rather than stalling on the capture',
         run.legEnd >= 1, 'leg ' + run.legEnd + ' of 3');
    S.ok('...and is not pinned on the building it now owns', !run.aimsAtOwn,
         run.teamAlive ? 'still fighting, aiming elsewhere' : 'disbanded');
  }

  /* ------------------------------------------------------------- the aftermath ----------- */
  var after = await g.page.evaluate(function () {
    var G = window._rtsG, out = {};
    /* Everything below is about a building the OPPONENT owns that stands in the PLAYER's base.
       Before this change that state was unreachable, so nothing was written to survive it. */
    var mine = null;
    for (var i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (!e.dead && e.side === 'enemy' && e.type === 'struct' && !rtsStructDef(e.def).weapon
          && !_rtsInBase('enemy', e.x, e.z)) { mine = e; break; }
    }
    out.haveCaptured = !!mine;
    if (!mine) return out;
    out.capturedDef = mine.def;

    var c = _rtsBaseCentre('enemy');
    out.centre = { x:Math.round(c.x), z:Math.round(c.z), r:Math.round(c.r) };
    /* The plain Recalc_Center, for comparison: a cost-weighted mean over every building of the
       side, which is what this was before the centre was seeded on the densest point. */
    var plain = _rtsBaseMean('enemy', null, 0);
    out.plain = { x:Math.round(plain.x), z:Math.round(plain.z), r:Math.round(plain.r) };
    out.drag = Math.round(Math.hypot(plain.x - c.x, plain.z - c.z));
    out.rInflation = Math.round(plain.r - c.r);
    /* ABSOLUTE, not merely different from the plain mean. "The guarded centre moved in the right
       direction" is satisfied by any wrong answer that happens to differ, so the real questions
       are asked directly: does the centre land on the opponent's OWN buildings, and is the
       radius bounded by a base rather than by the map?

       `homeAway` is the distance from the computed centre to the opponent's home Command Yard,
       which is the one building that is unambiguously at home. */
    var home = _rtsHasHome('enemy', 'yard') || _rtsHasHome('enemy', 'factory');
    out.homeAway = home ? Math.round(Math.hypot(home.x - c.x, home.z - c.z)) : null;
    out.plainHomeAway = home ? Math.round(Math.hypot(home.x - plain.x, home.z - plain.z)) : null;
    out.reach = RTS_BASE_REACH;
    /* ...and how far the opponent's buildings actually are from that centre, so the radius can
       be judged against something real rather than against itself. */
    var far = 0, own = 0;
    for (i = 0; i < G.ents.length; i++) {
      var s = G.ents[i];
      if (s.dead || s.side !== 'enemy' || s.type !== 'struct') continue;
      own++;
      far = Math.max(far, Math.hypot(s.x - c.x, s.z - c.z));
    }
    out.ownStructs = own;
    out.farthest = Math.round(far);

    /* THE LEVER. One shot at a captured building used to disband every team below the survival
       priority and send the opponent's garrison on an attack-move across the map to guard it. */
    var shooter = null;
    for (i = 0; i < G.ents.length; i++) {
      var u = G.ents[i];
      if (!u.dead && u.side === 'player' && u.type === 'unit' && rtsUnitDef(u.def).weapon) { shooter = u; break; }
    }
    out.haveShooter = !!shooter;
    if (shooter) {
      shooter.baseTimer = 0;
      out.recalled = _rtsBaseIsAttacked(mine, shooter);
      /* ...while a building genuinely AT HOME still triggers it, or the fix has broken the
         behaviour rather than scoped it. */
      var home = null;
      for (i = 0; i < G.ents.length; i++) {
        var h = G.ents[i];
        if (!h.dead && h.side === 'enemy' && h.type === 'struct' && !rtsStructDef(h.def).weapon
            && _rtsInBase('enemy', h.x, h.z)) { home = h; break; }
      }
      out.haveHome = !!home;
      if (home) { shooter.baseTimer = 0; out.recalledHome = _rtsBaseIsAttacked(home, shooter); }
    }

    /* _rtsHas answers in creation order and the player's base is laid first, so a captured
       building of the player's is the FIRST one _rtsHas('enemy', ...) finds. */
    var plainHas = _rtsHas('enemy', mine.def);
    var homeHas = _rtsHasHome('enemy', mine.def);
    out.plainHasIsCaptured = plainHas === mine;
    out.homeHasIsCaptured = homeHas === mine;
    out.homeHasInBase = homeHas ? _rtsInBase('enemy', homeHas.x, homeHas.z) : null;
    return out;
  });

  if (!after.haveCaptured) S.ok('the opponent now owns a building outside its own base', false,
                                'the manoeuvre did not leave one');
  else {
    S.ok('the opponent now owns a building outside its own base', true, after.capturedDef);
    S.note('base centre ' + JSON.stringify(after.centre) +
           ' against the plain mean ' + JSON.stringify(after.plain));
    S.ok('the captured building does not drag the base centre across the map',
         after.drag > 0, 'the plain mean is ' + after.drag + ' world units off');
    S.ok('...nor inflate the base radius, which is read as "how big is my base"',
         after.rInflation > 0, 'radius ' + after.centre.r + ' against a plain ' + after.plain.r);
    /* The absolute forms, because "different from the plain mean" is satisfied by any wrong
       answer that happens to differ. */
    S.ok('the centre lands on the opponent\'s own base, not between the two',
         after.homeAway != null && after.homeAway <= after.reach,
         after.homeAway + ' world units from its own yard, within a base reach of ' + after.reach);
    /* Not "the plain mean is outside the reach" - it need not be, and on this seed it is 77
       against a reach of 88, which is inside. The property that matters is that it is dragged
       MATERIALLY further off than the seeded centre, which it is by a factor of four here. */
    S.ok('...where the plain mean is dragged several times further off',
         after.plainHomeAway > after.homeAway * 2,
         'plain mean ' + after.plainHomeAway + ' away against ' + after.homeAway);
    S.ok('the radius describes a base rather than the map',
         after.centre.r <= after.reach,
         'r ' + after.centre.r + ' against a reach of ' + after.reach +
         '; farthest building it owns is ' + after.farthest + ' out, over ' + after.ownStructs);
    S.ok('there is a player unit to fire the shot', after.haveShooter, 'ok');
    S.eq('shooting the captured building recalls nobody', after.recalled, 0);
    S.ok('...while shooting one at home still does', after.haveHome && after.recalledHome > 0,
         'recalled ' + after.recalledHome);
    S.ok('_rtsHas answers with the captured building, being older', after.plainHasIsCaptured,
         'creation order');
    S.ok('..._rtsHasHome does not', !after.homeHasIsCaptured, 'picks the one at home');
    S.ok('...and what it picks really is at home', after.homeHasInBase === true, 'in base');
  }

  /* ------------------------------------------------------------- the accounting ---------- */
  var acct = await g.page.evaluate(function () {
    var G = window._rtsG, out = {};
    out.cap = RTS_AI.engCap;
    var mix = RTS_AI.mix.infantry.filter(function (e) { return e.key === 'engineer'; })[0];
    out.entry = mix ? { at:mix.at, w:mix.w } : null;
    /* The `at` has to sit above the floor _rtsAIUnits is only ever called above, or it is a
       threshold that reads as live and can never skip anything. */
    out.floor = RTS_AI.infantryReserve;
    out.inInfantry = !!mix;
    out.inVehicle = RTS_AI.mix.vehicle.some(function (e) { return e.key === 'engineer'; });
    out.kind = rtsUnitDef('engineer').kind;

    /* An IDLE engineer must still count, or the gate buys another and another: the team that
       would employ one cannot be raised until the house is alerted, and nothing is employed
       before then. */
    var e1 = _rtsSpawnUnit('enemy', 'engineer', _rtsWX(4), _rtsWX(4));
    if (e1) { e1.order = null; e1.target = null; e1.sqd = null; }
    out.countsIdle = _rtsAIEngineers();
    if (e1) e1.dead = true;
    out.countsAfterDeath = _rtsAIEngineers();
    return out;
  });

  S.ok('the engineer is in the mix', acct.inInfantry, JSON.stringify(acct.entry));
  S.eq('...in the INFANTRY list, which is the queue its kind goes to', acct.kind, 'infantry');
  S.ok('...and not in the vehicle list, where it would cost a whole pass and buy nothing',
       !acct.inVehicle, 'absent');
  S.ok('...at a threshold that can actually bind', acct.entry.at > acct.floor,
       'at ' + acct.entry.at + ' against a bank never below ' + acct.floor);
  S.eq('the opponent may hold one engineer', acct.cap, 1);
  S.eq('an idle engineer still counts against that cap', acct.countsIdle, 1);
  S.eq('...and stops counting when it dies', acct.countsAfterDeath, 0);

  S.ok('the page logged no errors', g.errors.length === 0,
       g.errors.length ? g.errors.slice(0, 2).join(' | ') : 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
