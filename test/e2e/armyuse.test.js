/* THE OPPONENT USES ITS ARMY - core/escorts.js.

   Before this, 80 to 89 per cent of the opponent's fighting army had no order, no squad and no
   target, averaged over a match. A team recruits only the unit types its composition names, so
   everything else the opponent bought - Light Tanks, Artillery, V2s, grenadiers, flamers - had no
   route out of the base but the endgame hunt, and unit/aiplan measured 49 such vehicles bought
   across eight matches with not one shot fired at the player. Now idle fighters at home march as
   escorts with whichever team is on the move, graded by difficulty (RTS_DIFF keep / commit).

   Measured against a player who builds nothing and cannot die - the base-defence spec's harness -
   so every match runs its full length and the question is only what the opponent does with what
   it has. Counted from the opponent's first wave on: before that it holds everything at home on
   purpose, and counting the opening would measure the wave timer. RTS_ESCORT_OFF is the
   before-picture, in the same page.

     IDLE        the share of the opponent's fighting army standing idle at home
     REACH       units of a type NO team lists, seen within striking distance of the player's
                 base - the exact population that used to never leave
     THE LADDER  every rung uses its army, and hard clearly more of it than easy */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('armyuse');
var SECS = 360;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  async function match(vs, diff, off) {
    return g.page.evaluate(function (a) {
      window.RTS_ESCORT_OFF = a[2];
      if (typeof rtsSetArmySide === 'function') rtsSetArmySide(a[0]);
      _rtsNewGame(9001, a[1]);
      var G = window._rtsG;
      /* the unit types no team composition names */
      var listed = {};
      RTS_TEAM_TYPES.forEach(function (t) { for (var k in t.members) listed[k] = 1; });
      var home = _rtsHas('player', 'yard');
      var idle = 0, army = 0, reached = {}, reachedN = 0, seen = {};
      for (var t = 0; t < a[3] * 60; t++) {
        _rtsTick(1 / 60);
        for (var k = 0; k < G.ents.length; k++) {
          var e = G.ents[k];
          /* buildings only - an unkillable unit chased home would sit in the opponent's base
             drawing its fire for ever; see e2e/basedef */
          if (e.side === 'player' && !e.dead && e.type === 'struct') e.hp = e.maxHp;
        }
        if (!G.ai.wave || t % 60) continue;
        G.ents.forEach(function (u) {
          if (u.dead || u.side !== 'enemy' || u.type !== 'unit' || u.air) return;
          var d = rtsUnitDef(u.def);
          if (!d || d.harvest || d.sea) return;
          army++;
          if (!u.order && !u.target && !u.path && u.sqd == null) idle++;
          if (!listed[u.def] && home && Math.hypot(u.x - home.x, u.z - home.z) < RTS_TILE * 14 && !seen[u.id]) {
            seen[u.id] = 1; reachedN++; reached[u.def] = (reached[u.def] || 0) + 1;
          }
        });
      }
      window.RTS_ESCORT_OFF = false;
      return { idle: idle, army: army, reachedN: reachedN,
               reached: Object.keys(reached).sort().map(function (k) { return k + '×' + reached[k]; }).join(' '),
               wave: G.ai.wave };
    }, [vs, diff, off, SECS]);
  }

  var rows = {};
  for (var vs of ['allied', 'soviet']) {
    for (var d of ['easy', 'normal', 'hard']) {
      var r = await match(vs, d, false);
      rows[vs + ':' + d] = r;
      S.note(vs.padEnd(7) + d.padEnd(7) + (r.army ? Math.round(r.idle / r.army * 100) : '-') + '% idle after the first wave, ' +
             r.reachedN + ' units of unlisted types reached the player' + (r.reached ? ' (' + r.reached + ')' : ''));
    }
    var b = await match(vs, 'normal', true);
    rows[vs + ':before'] = b;
    S.note(vs.padEnd(7) + 'normal without escorts: ' + Math.round(b.idle / b.army * 100) + '% idle, ' +
           b.reachedN + ' units of unlisted types reached the player');
  }
  function share(r) { return r.army ? r.idle / r.army : 1; }

  ['allied', 'soviet'].forEach(function (vs) {
    var n = rows[vs + ':normal'], b = rows[vs + ':before'];
    S.ok(vs + ': there is an army to measure, after a first wave', n.army > 1000 && b.army > 1000 && n.wave > 0,
         n.army + ' unit-samples with escorts, ' + b.army + ' without');
    /* 0.5, not the 0.7 this was written with: the before-picture shrank when the army got a
       ceiling (RTS_DIFF `army`). Measured at normal's 42: 59% and 63% idle without escorts,
       against 77% and 81% with no ceiling. A smaller army has less to leave standing. */
    S.ok(vs + ': without escorts most of it stands idle at home', share(b) > 0.5,
         Math.round(share(b) * 100) + '%');
    S.ok(vs + ': with them, most of it is at work', share(n) < 0.5 && share(n) < share(b) - 0.25,
         Math.round(share(n) * 100) + '% idle against ' + Math.round(share(b) * 100) + '%');
    S.ok(vs + ': the units no team lists used to never leave the base', b.reachedN <= 2,
         b.reachedN + ' reached the player without escorts');
    /* 3, not 5, for the same reason: under the ceiling there are fewer of them to send.
       Measured at normal's 42: 6 and 3, against 22 and 10 with no ceiling - and 0 without
       escorts either way. */
    S.ok(vs + ': ...and now they go to the fight', n.reachedN >= 3 && n.reachedN > b.reachedN,
         n.reachedN + ' reached the player (' + n.reached + ')');
    var e = rows[vs + ':easy'], h = rows[vs + ':hard'];
    /* EASY AGAINST HARD, not every adjacent pair. Measured on both armies: allied easy 22%,
       normal 11%, hard 12%; soviet easy 21%, normal 20%, hard 13%. The middle rung sits within
       a point of a neighbour either way, which one seed per army cannot resolve; the ends are
       eight to ten points apart on both. Survival-time ordering across all three rungs is
       e2e/ladder's to hold. */
    S.ok(vs + ': every difficulty uses its army, and hard clearly more of it than easy',
         Math.max(share(e), share(n), share(h)) < share(b) - 0.3 && share(h) < share(e) - 0.05,
         'idle: easy ' + Math.round(share(e) * 100) + '%, normal ' + Math.round(share(n) * 100) +
         '%, hard ' + Math.round(share(h) * 100) + '% (normal without escorts ' + Math.round(share(b) * 100) + '%)');
  });
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
