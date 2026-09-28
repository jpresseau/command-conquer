/* THE OPPONENT DOES NOT WALL ITSELF IN, OR PARK IN ITS OWN DOORWAYS.

   The AI put each building on the legal cell nearest its anchor, packing the base tight, and
   nothing asked what a new footprint closed off. On seed 9004 - both armies - the pocket it
   sealed was the one its barracks delivers into: a four-cell lane between a silo, two
   refineries and the barracks itself. Eighteen to twenty infantry came out into it and stood
   there for the rest of the match, attack orders and all, with no path anywhere.
   _rtsSealsGround (core/basezone.js) now refuses a placement that cuts off open ground;
   unit/basespace holds the test on hand-drawn grids, and this holds the outcome on real ones.

   WHAT COUNTS AS SEALED. Free land that the map's main open region cannot reach, that was
   reachable when the match began (a pocket in the rocks is the map's, not the AI's), and that
   was NEVER under a building. That last clause is measured, not assumed: the opponent sells a
   power plant to put up an advanced one, and the footprint it leaves is a hole walled in by its
   neighbours. That hole was never open ground, nothing is delivered into it, and counting it
   would fail this spec for something that traps no one.

   AND ITS NEW UNITS WALK OUT OF THE DOOR. The opponent had no rally point, so every unit it built
   stood on the cell it was delivered to until a team took it, and most were never taken. Over the
   match, 35 to 74 per cent of its army stood within two cells of a factory or barracks, and on
   hard, seed 9006, tanks with attack orders sat behind the idle ones for up to a minute.
   _rtsAIMuster gives each production building a clear spot at the edge of the base to send them
   to. Measured here as the share of the opponent's idle ground army standing in a doorway,
   sampled every two seconds, with RTS_MUSTER_OFF as the before-picture.

   Ten matches against an idle player - which is the densest the opponent's base ever gets
   before the match ends - and seed 9004 again with the check switched off (RTS_OPEN_OFF), so
   the spec shows it can see the fault it guards against. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('basespace');
var SEEDS = [9001, 9002, 9003, 9004, 9005];
var H = 300;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  async function match(vs, seed, off, musterOff) {
    return g.page.evaluate(function (a) {
      window.RTS_OPEN_OFF = a[2];
      window.RTS_MUSTER_OFF = a[4];
      if (typeof rtsSetVoxSide === 'function') rtsSetVoxSide(a[0]);
      _rtsNewGame(a[1], 'normal');
      var G = window._rtsG, N = RTS_N, i;
      /* the main open region: the largest four-way component of free land */
      function main() {
        var lab = new Int32Array(N * N).fill(-1), q = new Int32Array(N * N), best = -1, bn = 0, id = 0;
        for (var s = 0; s < N * N; s++) {
          if (lab[s] >= 0 || G.blocked[s] !== 0) continue;
          var h = 0, t = 0; q[t++] = s; lab[s] = id;
          while (h < t) {
            var c = q[h++], x = c % N, z = (c / N) | 0;
            if (x > 0 && lab[c - 1] < 0 && G.blocked[c - 1] === 0) { lab[c - 1] = id; q[t++] = c - 1; }
            if (x < N - 1 && lab[c + 1] < 0 && G.blocked[c + 1] === 0) { lab[c + 1] = id; q[t++] = c + 1; }
            if (z > 0 && lab[c - N] < 0 && G.blocked[c - N] === 0) { lab[c - N] = id; q[t++] = c - N; }
            if (z < N - 1 && lab[c + N] < 0 && G.blocked[c + N] === 0) { lab[c + N] = id; q[t++] = c + N; }
          }
          if (t > bn) { bn = t; best = id; }
          id++;
        }
        return { lab: lab, best: best };
      }
      var m0 = main(), openAtStart = new Uint8Array(N * N), everBuilt = new Uint8Array(N * N);
      for (i = 0; i < N * N; i++) if (G.blocked[i] === 0 && m0.lab[i] === m0.best) openAtStart[i] = 1;
      function markBuilt() {
        G.ents.forEach(function (e) {
          if (e.dead || e.type !== 'struct') return;
          var d = rtsStructDef(e.def);
          for (var x = e.tx; x < e.tx + d.w; x++) for (var z = e.tz; z < e.tz + d.h; z++) if (_rtsInB(x, z)) everBuilt[_rtsIdx(x, z)] = 1;
        });
      }
      /* an idle ground unit of the opponent's within two cells of one of its unit factories */
      var idle = 0, door = 0;
      function doorway() {
        var fac = G.ents.filter(function (b) {
          if (b.dead || b.type !== 'struct' || b.side !== 'enemy' || b.building) return false;
          var p = rtsStructDef(b.def).produces;
          return p && p !== 'air' && p !== 'ship';
        });
        G.ents.forEach(function (e) {
          if (e.dead || e.type !== 'unit' || e.side !== 'enemy' || e.air || _rtsDomainOf(e)) return;
          if (rtsUnitDef(e.def).harvest || e.order || e.path || e.target || e.sqd != null) return;
          idle++;
          var ux = _rtsTX(e.x), uz = _rtsTX(e.z);
          if (fac.some(function (b) { var d = rtsStructDef(b.def);
                return ux >= b.tx - 2 && ux < b.tx + d.w + 2 && uz >= b.tz - 2 && uz < b.tz + d.h + 2; })) door++;
        });
      }
      for (var t = 0; t < 60 * a[3]; t++) {
        _rtsTick(1 / 60);
        if (t % 30 === 0) markBuilt();
        if (t % 120 === 0) doorway();
        if (G.over) break;
      }
      markBuilt();
      var m1 = main(), sealed = 0, trapped = 0;
      for (i = 0; i < N * N; i++) {
        if (G.blocked[i] !== 0 || m1.lab[i] === m1.best) continue;
        if (openAtStart[i] && !everBuilt[i]) sealed++;
      }
      G.ents.forEach(function (e) {
        if (e.dead || e.type !== 'unit' || e.side !== 'enemy' || e.air || _rtsDomainOf(e)) return;
        var j = _rtsIdx(_rtsTX(e.x), _rtsTX(e.z));
        if (G.blocked[j] === 0 && m1.lab[j] !== m1.best && openAtStart[j]) trapped++;
      });
      /* every muster point in use, and whether it stands in the harvest */
      var musters = 0, inHarvest = 0;
      G.ents.forEach(function (b) {
        if (b.dead || b.type !== 'struct' || b.side !== 'enemy' || !b.muster) return;
        musters++;
        if (!_rtsMusterAwayFromHarvest(b.muster.tx, b.muster.tz)) inHarvest++;
      });
      window.RTS_OPEN_OFF = false; window.RTS_MUSTER_OFF = false;
      return { musters: musters, inHarvest: inHarvest, sealed: sealed, trapped: trapped, t: Math.round(G.t), idle: idle, door: door,
               structs: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'struct'; }).length };
    }, [vs, seed, off, H, !!musterOff]);
  }

  var sealed = 0, trapped = 0, minStructs = 1e9, idle = 0, door = 0, worst = 0, worstAt = '';
  var musters = 0, inHarvest = 0;
  for (var si = 0; si < 2; si++) {
    var vs = ['allied', 'soviet'][si];
    for (var k = 0; k < SEEDS.length; k++) {
      var r = await match(vs, SEEDS[k], false);
      S.note(vs.padEnd(7) + ' seed ' + SEEDS[k] + '  ' + r.structs + ' buildings at ' + r.t + 's, ' +
             r.sealed + ' cells sealed, ' + r.trapped + ' units trapped, ' +
             (r.idle ? Math.round(r.door / r.idle * 100) : 0) + '% of the idle army in a doorway');
      sealed += r.sealed; trapped += r.trapped; minStructs = Math.min(minStructs, r.structs);
      idle += r.idle; door += r.door; musters += r.musters; inHarvest += r.inHarvest;
      var sh = r.idle ? r.door / r.idle : 0;
      if (sh > worst) { worst = sh; worstAt = vs + ' ' + SEEDS[k]; }
    }
  }
  /* both switches off: with muster points on, the base is laid out round them and this seed's
     pocket never forms, which would make the before-picture show nothing for the wrong reason */
  var before = [await match('allied', 9004, true, true), await match('soviet', 9004, true, true)];
  /* the doorway's before-picture, on the same ten matches */
  var idleB = 0, doorB = 0;
  for (si = 0; si < 2; si++) for (k = 0; k < SEEDS.length; k++) {
    var rb = await match(['allied', 'soviet'][si], SEEDS[k], false, true);
    idleB += rb.idle; doorB += rb.door;
  }
  var share = idle ? door / idle : 0, shareB = idleB ? doorB / idleB : 0;

  S.ok('the check can see the fault: seed 9004 as it was walls in its own barracks',
       before[0].trapped >= 10 && before[1].trapped >= 10 && before[0].sealed > 0 && before[1].sealed > 0,
       'allied ' + before[0].sealed + ' cells / ' + before[0].trapped + ' units, soviet ' +
       before[1].sealed + ' / ' + before[1].trapped);
  S.ok('every opponent built a dense base, which is where this happens', minStructs >= 14,
       'fewest buildings in any match: ' + minStructs);
  S.eq('no open ground is walled off by the opponent\'s buildings, in ten matches', sealed, 0);
  S.eq('...and none of its units ends the match trapped in its own base', trapped, 0);
  S.ok('the opponent has an idle army to measure', idle > 500 && idleB > 500,
       idle + ' idle-unit samples, ' + idleB + ' without muster points');
  S.ok('without muster points its idle army stands in the doorways', shareB > 0.3,
       Math.round(shareB * 100) + '% of it within two cells of a factory or barracks');
  S.ok('...and with them it walks out and waits at the edge of the base',
       share < 0.2 && share < shareB / 2,
       Math.round(share * 100) + '% in a doorway, against ' + Math.round(shareB * 100) + '% without');
  /* PER MATCH, because the aggregate hides the one that matters: when the base grows over the
     patch the army is waiting on, it is one match that goes back to the doorway, not all ten.
     Measured with the patch left unreserved (_rtsOnMuster skipped): soviet 9003 went to 21%
     while the other nine stayed at 2-7%, and the aggregate still read 5%. */
  S.ok('...in every match, not just on average', worst < 0.12,
       'worst ' + Math.round(worst * 100) + '% (' + worstAt + ')');
  /* THE WAITING ARMY IS NOT IN THE HARVEST. The first muster rule only asked for clear ground,
     and clear ground is often the ore field's edge. Measured over ten 420-second matches on
     hard: the opponent's harvesters unloaded 8% less, 27% less on the worst seed, and three of
     its bases finished with a third of their defences; RTS_MUSTER_OFF alone put every figure
     back, and so did keeping the patch off the ore and away from the refineries (income within
     1%, defences 80 against 79). Held here as the rule itself, checked on every patch in use at
     the end of every match - the economic run is too long to repeat on every test run. */
  S.ok('the opponent is using muster points', musters >= 15, musters + ' in use across ten matches');
  S.eq('...and none of them stands in the harvest - on ore or beside a refinery', inHarvest, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
