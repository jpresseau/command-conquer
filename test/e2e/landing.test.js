/* THE OPPONENT COULD NOT CROSS WATER.

   The landing craft shipped as a player-only verb. The opponent could build hulls and fight
   with them, but nothing in it ever loaded an army onto one - so a map whose halves are joined
   only by sea was a map where the player could reach the opponent and the opponent could not
   reach the player. That asymmetry is also why _rtsMapCheck still refuses such a map outright,
   and it is the reason this work exists.

   TEAMTYPE.CPP already had the answer and this repo had declined it in writing: the mission
   table's own comment read "UNLOAD/LOAD/DEPLOY (no transports, nothing deploys)". There are
   transports. LOAD and UNLOAD are ported now, and a `Landing` team type strings them together
   with the two verbs that follow - board the craft, land on the far shore, attack what is
   there.

   TWO THINGS ARE TESTED SEPARATELY AND ON PURPOSE, because each can pass while the other is
   broken and the pair of them looks like one feature:

     THE DECISION - is sailing worth it? A landing party raised where the tanks could simply
     drive is five units and a boat arriving later than walking, which is the engineer-in-the-
     mix mistake wearing a boat. The gate is asserted on a map where the answer is NO before it
     is asserted on one where the answer is YES.

     THE MANOEUVRE - given the team, does it actually load, cross and land? Driven from a team
     assembled by hand rather than from one the opponent saved up for, because what is under
     test is the mission script and not the economy that pays for it.

   THE ARENA IS SYNTHETIC, cut into the live grid: no maps ship in this repo, and a generated
   one is guaranteed a land route between the starts (see core/terrain.js), which is precisely
   the case where a crossing is NOT wanted. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('landing');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 8, { freeze: true });

  /* ------------------------------------------------------------- the decision ------------ */
  var decide = await g.page.evaluate(function () {
    var G = window._rtsG;
    var yd = _rtsHas('player', 'yard'), ey = _rtsHas('enemy', 'yard');
    if (!yd || !ey) return { error: 'no yards' };
    function fresh() { G.ai.crossT = null; }               /* the answer is cached - see the fn */
    function landing() {
      for (var i = 0; i < RTS_TEAM_TYPES.length; i++)
        if (RTS_TEAM_TYPES[i].name === 'Landing') return RTS_TEAM_TYPES[i];
      return null;
    }
    var out = { type: !!landing(), detour: RTS_AI_DETOUR };
    var ty = landing();
    out.crossingFlag = !!(ty && ty.crossing);
    out.missions = ty ? ty.missions.map(function (m) { return m[0]; }) : [];
    out.members = ty ? Object.keys(ty.members).sort() : [];

    /* 1. the generated map, untouched: there IS a road, so there is nothing to sail around */
    fresh();
    out.wantsOnLand = _rtsAIWorthCrossing();
    out.runOnLand = G.ai.crossRun; out.straightOnLand = G.ai.crossStraight;
    /* ...and without a shipyard it cannot be true whatever the map looks like */
    out.canBuildCraftOnLand = _rtsCanProduce('enemy', 'lst');

    /* 2. give it a shipyard, so only the map is left to decide */
    var yardKey = rtsHouseSide('enemy') === 'soviet' ? 'subpen' : 'navalyard';
    var placed = null;
    for (var r = 3; r < 40 && !placed; r++) {
      for (var ox = -r; ox <= r && !placed; ox++) for (var oz = -r; oz <= r && !placed; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
        var tx = _rtsTX(ey.x) + ox, tz = _rtsTX(ey.z) + oz;
        if (_rtsCanPlace('enemy', yardKey, tx, tz, true)) placed = { tx: tx, tz: tz };
      }
    }
    if (!placed) return { error: 'nowhere on this map to give the opponent a shipyard' };
    _rtsPlaceStruct('enemy', yardKey, placed.tx, placed.tz, true);
    G.sides.enemy.credits = 20000;
    fresh();
    out.yard = yardKey;
    out.canBuildCraft = _rtsCanProduce('enemy', 'lst');
    out.wantsWithYardOnly = _rtsAIWorthCrossing();       /* still no: the road is still there */

    /* 3. cut the map in two. Now there is no road at all.

       ACROSS WHICHEVER AXIS ACTUALLY SEPARATES THE TWO BASES. Cutting a vertical channel at
       their mid-x assumes they are side by side, and on this seed they are not: both Command
       Yards sit at tile column 65 and are separated north-to-south. The channel went straight
       through both of them, the "far shore" was the middle of the player's base, and the
       landing party was judged to have failed for arriving exactly where it was sent. */
    var d = window._rtsLandArena = (function () {
      var px = _rtsTX(yd.x), pz = _rtsTX(yd.z), ex2 = _rtsTX(ey.x), ez2 = _rtsTX(ey.z);
      var byX = Math.abs(ex2 - px) >= Math.abs(ez2 - pz);
      return { byX: byX,
               mid: Math.round(byX ? (px + ex2) / 2 : (pz + ez2) / 2),
               enemyAt: byX ? ex2 : ez2, playerAt: byX ? px : pz };
    })();
    var mid = d.mid, c0 = mid - 5, c1 = mid + 5;
    for (var a2 = 0; a2 < RTS_N; a2++) {
      for (var b2 = c0; b2 <= c1; b2++) {
        var ix = d.byX ? _rtsIdx(b2, a2) : _rtsIdx(a2, b2);
        G.terrain[ix] = RTS_T_WATER; G.blocked[ix] = 2; G.scrap[ix] = 0; G.gems[ix] = 0;
      }
    }
    G.scrapDirty = true;
    out.axis = d.byX ? 'east-west' : 'north-south';
    out.ends = [d.enemyAt, d.playerAt];
    fresh();
    out.wantsWhenSplit = _rtsAIWorthCrossing();
    /* WHY, if it says no. Every early return in _rtsAIWorthCrossing looks the same from
       outside, and a bare false tells you nothing about which one fired. */
    out.splitCanBuild = _rtsCanProduce('enemy', 'lst');
    out.splitWhyLocked = _rtsWhyLocked('enemy', 'lst');
    out.splitRun = G.ai.crossRun; out.splitStraight = G.ai.crossStraight;
    var f2 = _rtsHas('enemy', 'yard'), t2 = _rtsHas('player', 'yard');
    out.splitEnds = !!f2 && !!t2;
    out.splitHasPath = !!(f2 && t2 && _rtsPath(f2.x, f2.z, t2.x, t2.z, null));
    /* and the production gate: the craft is offered to the mix only when it is wanted */
    out.craftInMix = RTS_AI.mix.ship.some(function (e) { return e.key === 'lst'; });
    out.craftCap = RTS_AI.craftCap;
    out.channel = [c0, c1]; out.mid = mid;
    return out;
  });

  S.ok('the arena could be set up', !decide.error, decide.error || 'ok');
  if (decide.error) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  S.ok('there is a Landing team type', decide.type, '');
  S.ok('...gated on the crossing being worth it', decide.crossingFlag, '');
  S.eq('...whose script is board, land, attack, then hold to what it hit',
       decide.missions.join(','), 'load,unload,attack,tarcom');
  S.eq('...crewed by a craft and an army, not by a fleet',
       decide.members.join(','), 'lst,rifle,tank');

  /* THE HALF THAT STOPS THIS BEING A WASTE. A generated map always has a land route, so on one
     the answer must be no - otherwise every match pays for a boat it does not need. */
  S.ok('on a map with a road, sailing is NOT worth it', !decide.wantsOnLand,
       'land route ' + Math.round(decide.runOnLand || 0) + ' against a straight line of ' +
       Math.round(decide.straightOnLand || 0) + ', ratio ' + decide.detour + ' needed');
  S.ok('...and without a shipyard it cannot be, whatever the map looks like',
       !decide.canBuildCraftOnLand, String(decide.canBuildCraftOnLand));
  S.ok('a shipyard alone does not change the answer', !decide.wantsWithYardOnly,
       'the road is still there');
  S.ok('...though the craft is now buildable', decide.canBuildCraft, decide.yard);
  /* AND THE HALF THAT MAKES IT A FEATURE. */
  S.ok('cutting the map in two makes it worth it', decide.wantsWhenSplit,
       'channel at tiles ' + (decide.channel || []).join('-') +
       '; craft buildable ' + decide.splitCanBuild + ' (' + (decide.splitWhyLocked || 'not locked') +
       '), both yards ' + decide.splitEnds + ', land path ' + decide.splitHasPath +
       ', run ' + Math.round(decide.splitRun || 0) + ' vs ' + Math.round(decide.splitStraight || 0));
  S.ok('the craft is in the opponent\'s ship mix at all', decide.craftInMix, '');
  S.eq('...capped at the one a landing party needs', decide.craftCap, 1);

  /* ------------------------------------------------------------ the manoeuvre ------------ */
  var run = await g.page.evaluate(function () {
    var G = window._rtsG;
    var yd = _rtsHas('player', 'yard'), ey = _rtsHas('enemy', 'yard');
    /* The same axis the channel was cut across - carried over rather than recomputed, so the
       two halves of this spec cannot disagree about which way the water runs. */
    var d = window._rtsLandArena;
    var byX = d.byX, mid = d.mid, c0 = mid - 5, c1 = mid + 5;
    var enemyHigh = d.enemyAt > d.playerAt;              /* is the opponent on the high side? */
    var enemyBank = enemyHigh ? c1 + 1 : c0 - 1;
    var playerBank = enemyHigh ? c0 - 1 : c1 + 1;
    /* along = the coordinate the channel separates; across = the one that runs with it */
    function cellAt(along, across) { return byX ? [along, across] : [across, along]; }
    function alongOf(u) { return byX ? _rtsTX(u.x) : _rtsTX(u.z); }
    function open(along, across, dom) {
      var c = cellAt(along, across);
      return _rtsNearestOpen(c[0], c[1], dom === 'sea' ? 3 : 2, dom || null);
    }
    /* "across the water" is on the player's side of the band, whichever side that is */
    function isAcross(u) { return enemyHigh ? alongOf(u) < c0 : alongOf(u) > c1; }

    /* THE PLAYER, so the match does not end mid-crossing - and THE LANDING PARTY ITSELF, which
       is a correction rather than a convenience. The first run of this had the craft sail into
       range of the player's base, get sunk in the channel, and drown all four passengers: the
       assertion "the opponent puts an army on the far shore" then read 0 of 4, which is a true
       statement about the player's guns and says nothing at all about whether the opponent can
       execute a landing. That is the thing under test, so the party is kept standing and the
       question stays the one being asked. Whether a landing SURVIVES contact is a balance
       question and belongs to the ladder, not here. */
    var party = [];
    function keepAlive() {
      for (var k = 0; k < G.ents.length; k++) {
        var e = G.ents[k];
        if (!e.dead && e.side === 'player') e.hp = e.maxHp;
      }
      for (var p = 0; p < party.length; p++) if (!party[p].dead) party[p].hp = party[p].maxHp;
    }
    function step(secs, until) {
      for (var i = 0; i < secs * 60; i++) {
        _rtsTick(1 / 60); keepAlive();
        if (G.over) return 'the match ended';
        if (until && until()) return null;
      }
      return until ? 'timed out' : null;
    }
    /* A row where both banks are clear, so the party has somewhere to embark from and
       somewhere to land - the same search e2e/transport does, and for the same reason. */
    var row = null, bank = null, land = null, wet = null;
    var seed0 = byX ? _rtsTX(ey.z) : _rtsTX(ey.x);
    for (var dr = 0; dr < 40 && row === null; dr++) {
      for (var sgn = 1; sgn >= -1 && row === null; sgn -= 2) {
        var r0 = seed0 + dr * sgn;
        if (r0 < 4 || r0 > RTS_N - 5) continue;
        var b0 = open(enemyBank, r0, null);
        var l0 = open(playerBank, r0, null);
        var w0 = open(enemyHigh ? c1 : c0, r0, 'sea');
        if (b0 && l0 && w0) { row = r0; bank = b0; land = l0; wet = w0; }
        if (!dr) break;
      }
    }
    if (!row) return { error: 'no line has clear banks on both sides' };

    var ty = null;
    for (var i = 0; i < RTS_TEAM_TYPES.length; i++)
      if (RTS_TEAM_TYPES[i].name === 'Landing') ty = RTS_TEAM_TYPES[i];

    /* The party, put on the board by hand: the craft in the water on the opponent's side and
       the army on its bank. What is under test is the script, not the savings. */
    var lst = _rtsSpawnUnit('enemy', 'lst', _rtsWX(wet[0]), _rtsWX(wet[1]));
    var army = [];
    for (var a = 0; a < 2; a++)
      army.push(_rtsSpawnUnit('enemy', 'tank',
        _rtsWX(bank[0] + (byX ? 0 : a)), _rtsWX(bank[1] + (byX ? a : 0))));
    for (var b = 0; b < 2; b++)
      army.push(_rtsSpawnUnit('enemy', 'rifle',
        _rtsWX(bank[0] - (byX ? 0 : 1 + b)), _rtsWX(bank[1] - (byX ? 1 + b : 0))));
    if (!lst || army.some(function (u) { return !u; })) return { error: 'could not put the party on the board' };

    party = [lst].concat(army);
    var t = _rtsTeamMake(ty);
    _rtsTeamAdd(t, lst);
    army.forEach(function (u) { _rtsTeamAdd(t, u); });
    /* Everyone counts as having joined up: the gather phase is generic team machinery that
       other specs already cover, and it is not what this one is about. */
    t.members.forEach(function (m) { m.init = true; });

    var out = { row: row, channel: [c0, c1], byX: byX, enemyHigh: enemyHigh,
                startedOnEnemyBank: army.every(function (u) { return !isAcross(u); }),
                /* the premise: they could not walk there */
                noRoad: !_rtsPath(army[0].x, army[0].z, _rtsWX(land[0]), _rtsWX(land[1]), null) };

    /* full strength, so the team marches */
    var e1 = step(4, function () { return t.moving; });
    out.marching = !!t.moving; out.marchErr = e1;

    /* LOAD */
    var e2 = step(90, function () { return _rtsCargoCount(lst) >= 4 || t.cur > 0; });
    out.loadErr = e2;
    out.aboard = _rtsCargoCount(lst);
    out.leg = t.cur;

    /* UNLOAD - the crossing. Sampled, because "the craft did not get there" is four different
       faults wearing one result: no order, no route, a route to the wrong place, or arriving
       and failing to land. The trace names which. */
    var trace = [], tick = 0;
    var e3 = step(150, function () {
      if (t.beach && !out.beachAt) {
        out.beachAt = [_rtsTX(t.beach.x), _rtsTX(t.beach.z)];
        out.aimAt = t.target ? [_rtsTX(t.target.x), _rtsTX(t.target.z), t.target.def] : null;
      }
      if ((tick++ % 240) === 0) {
        trace.push('t' + Math.round(G.t) + ' leg' + t.cur + ' ' + (lst.order || 'none') +
                   ' @' + _rtsTX(lst.x) + ',' + _rtsTX(lst.z) +
                   ' path' + (lst.path ? lst.path.length - lst.pi : 0) +
                   ' hold' + _rtsCargoCount(lst));
      }
      return _rtsCargoCount(lst) === 0 && t.cur >= 2;
    });
    out.trace = trace;
    out.beach = t.beach ? [_rtsTX(t.beach.x), _rtsTX(t.beach.z)] : null;
    out.crossErr = e3;
    out.cargoAfter = _rtsCargoCount(lst);
    out.legAfter = t.cur;
    /* Past the FAR edge of the channel, not merely inside it: "the craft is somewhere in the
       water" was true before it had gone anywhere, which is a assertion that cannot fail. */
    out.craftTile = alongOf(lst);
    out.craftCrossed = enemyHigh ? alongOf(lst) < c0 + 2 : alongOf(lst) > c1 - 2;

    /* WHERE THE ARMY ENDED UP - the only thing that actually matters */
    out.ashore = army.filter(function (u) {
      return !u.dead && !u.inside && isAcross(u);
    }).length;
    out.alive = army.filter(function (u) { return !u.dead; }).length;
    out.stillAboard = army.filter(function (u) { return !!u.inside; }).length;
    out.onLand = army.filter(function (u) {
      if (u.dead || u.inside || !isAcross(u)) return false;
      var tx = _rtsTX(u.x), tz = _rtsTX(u.z);
      return _rtsInB(tx, tz) && G.terrain[_rtsIdx(tx, tz)] !== RTS_T_WATER;
    }).length;
    /* and that they can fight from where they were put down */
    out.canDrive = army.filter(function (u) {
      if (u.dead || u.inside) return false;
      return !!_rtsPath(u.x, u.z, yd.x, yd.z, null);
    }).length;
    return out;
  });

  S.ok('the crossing arena could be set up', !run.error, run.error || 'ok');
  if (!run.error) {
    S.note('channel ' + run.channel.join('-') + ' running ' + (run.byX ? 'north-south' : 'east-west') +
           ', line ' + run.row + ', the opponent on the ' + (run.enemyHigh ? 'high' : 'low') + ' bank');
    S.ok('the party starts on the opponent\'s own bank', run.startedOnEnemyBank, '');
    /* THE PREMISE. If they could walk there, landing them proves nothing. */
    S.ok('...and cannot walk to the far side', run.noRoad, String(run.noRoad));
    S.ok('the team reaches full strength and marches', run.marching, run.marchErr || '');

    S.ok('the army boards the craft', run.aboard >= 4,
         run.aboard + ' of 4 aboard' + (run.loadErr ? ' — ' + run.loadErr : ''));
    S.ok('...and the script moves on to the landing', run.legAfter >= 2,
         'leg ' + run.legAfter + (run.crossErr ? ' — ' + run.crossErr : ''));
    S.note('aimed at ' + JSON.stringify(run.aimAt) + ', landing point ' +
           JSON.stringify(run.beachAt) + '; the crossing: ' + (run.trace || []).join(' | '));
    S.ok('the craft crosses to the far side of the channel', run.craftCrossed,
         'ended at tile ' + run.craftTile + ', channel ' + run.channel.join('-'));
    S.eq('...and the hold is empty at the end of it', run.cargoAfter, 0);
    S.eq('...with nobody left flagged aboard', run.stillAboard, 0);

    /* THE WHOLE POINT. */
    S.ok('the opponent puts an army on the far shore', run.ashore >= 3,
         run.ashore + ' of 4 across, ' + run.alive + ' still alive');
    S.eq('...standing on land rather than in the water', run.onLand, run.ashore);
    S.ok('...able to reach the player\'s base on foot from where they landed',
         run.canDrive === run.ashore, run.canDrive + ' of ' + run.ashore + ' have a route');
  }

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
