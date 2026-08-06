/* Two pieces of atmosphere that were written and then parked mid-change.

   1. INFANTRY FIDGETS. A soldier standing still plays RA's idle1/idle2 every so often. The
      parked patch had the frame table and the baker but nothing that CALLED them, so it did
      nothing at all - which is the interesting failure mode here, because a fidget that never
      fires is indistinguishable from a fidget that fires rarely.

      This environment has no game art - none ships in the repo, by design - so _rtsArtReady is
      false and the real baker returns null. Rather than declare it unverifiable, the SHP reader
      is stubbed with a synthetic sprite that RECORDS WHICH FRAMES ARE ASKED FOR. That tests our
      code, which is the part we wrote: does the table index where mods/ra/sequences/infantry.yaml
      says it should, and does the renderer choose those frames at the right moments. It cannot
      tell us the frames look right, and this does not claim to.

   2. WRECK FIRES. Purely procedural, so this half is tested for real: kill a tank and check the
      ground burns, check the fire cannot hurt anything, and check the exceptions - a sinking
      ship and a helicopter that died in the air do not leave a fire on the ground. */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');

(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var browser = await chromium.launch();
  var page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  var errs = [];
  page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
  await page.evaluate(function () { rtsOpen(7); for (var i = 0; i < 60 * 20; i++) _rtsTick(1 / 60); });

  var fails = [];

  /* ================= 1. the frame table ================= */
  var tbl = await page.evaluate(function () {
    /* a synthetic shp that notes every frame index the baker asks for */
    window.__asked = [];
    window._mixShp = function () {
      return { count: 512, width: 4, height: 4,
        frame: function (i) { window.__asked.push(i); var a = new Uint8Array(16); a.fill(1); return a; } };
    };
    window._rtsArtReady = function () { return true; };
    RTS_MIX.pal = new Uint8Array(768);
    _RTS_IDLEANIM = {};
    var got = _mixIdleAnim('rifle', 'player');
    var asked = window.__asked.slice();
    /* and a type whose numbers are completely different, to prove the table is per-type */
    window.__asked = [];
    var dog = _mixIdleAnim('dog', 'player');
    return {
      runs: got ? got.map(function (r) { return r.length; }) : null,
      first: asked[0], last: asked[asked.length - 1], count: asked.length,
      contiguous: asked.every(function (v, i) { return i === 0 || v === asked[i - 1] + 1 || v === 272; }),
      asked: asked,
      dogRuns: dog ? dog.map(function (r) { return r.length; }) : null,
      dogFirst: window.__asked[0],
      table: { e1: RTS_MIX_IDLE.e1, dog: RTS_MIX_IDLE.dog },
      cached: _mixIdleAnim('rifle', 'player') === got
    };
  });
  console.log('frame table');
  console.log('  rifle -> e1 ' + JSON.stringify(tbl.table.e1) + ': baked runs of ' +
              JSON.stringify(tbl.runs) + ', asked frames ' + tbl.first + '..' + tbl.last +
              ' (' + tbl.count + ')');
  console.log('  dog   -> ' + JSON.stringify(tbl.table.dog) + ': baked runs of ' +
              JSON.stringify(tbl.dogRuns) + ', first frame asked ' + tbl.dogFirst);
  console.log('  second call is cached: ' + tbl.cached);
  if (!tbl.runs || tbl.runs.join() !== '16,16')
    fails.push('rifle idles baked as ' + JSON.stringify(tbl.runs) + ', expected two runs of 16');
  if (tbl.first !== 256) fails.push('rifle idles start at frame ' + tbl.first + ', expected 256');
  if (tbl.last !== 287) fails.push('rifle idles end at frame ' + tbl.last + ', expected 287');
  if (!tbl.dogRuns || tbl.dogRuns.join() !== '7,11')
    fails.push('dog idles baked as ' + JSON.stringify(tbl.dogRuns) + ', expected 7 and 11');
  if (tbl.dogFirst !== 216) fails.push('dog idles start at frame ' + tbl.dogFirst + ', expected 216');
  if (!tbl.cached) fails.push('the bake is not cached - it re-decodes every frame, every frame');

  /* a short sprite must not produce a half-run */
  var short = await page.evaluate(function () {
    window._mixShp = function () {
      return { count: 260, width: 4, height: 4,      /* stops inside e1's first idle */
        frame: function () { var a = new Uint8Array(16); a.fill(1); return a; } };
    };
    _RTS_IDLEANIM = {};
    var got = _mixIdleAnim('rifle', 'player');
    return got ? got.map(function (r) { return r.length; }) : null;
  });
  console.log('  a sprite that stops at frame 260: ' + JSON.stringify(short) +
              ' (both runs are out of range, so nothing is baked)');
  if (short !== null) fails.push('a truncated sprite baked ' + JSON.stringify(short) +
                                 ' instead of refusing');

  /* ================= 2. when the renderer actually uses them ================= */
  var use = await page.evaluate(function () {
    window._mixShp = function () {
      return { count: 512, width: 4, height: 4,
        frame: function () { var a = new Uint8Array(16); a.fill(1); return a; } };
    };
    _RTS_IDLEANIM = {};
    var G = window._rtsG;
    /* two soldiers of the same type with DIFFERENT gaits, side by side */
    var men = G.ents.filter(function (e) { return !e.dead && e.type === 'unit' && e.def === 'rifle'; });
    while (men.length < 2) {
      var m = _rtsSpawnUnit('player', 'rifle', _rtsR.focus.x + men.length * 3, _rtsR.focus.z);
      if (!m) break;
      men.push(m);
    }
    if (men.length < 2) return { error: 'could not get two riflemen' };
    men[0].gait = 0; men[1].gait = 3;
    men.forEach(function (m) { m.path = null; m.pi = 0; m.target = null; m.prone = false; });

    /* the fidget canvases, by identity - drawImage is spied on to see which one is used */
    var runs = _mixIdleAnim('rifle', 'player');
    var idleSet = new Set();
    runs.forEach(function (r) { r.forEach(function (c) { idleSet.add(c); }); });

    var cv = document.createElement('canvas'); cv.width = cv.height = 64;
    var g = cv.getContext('2d');
    var drawn = null;
    var real = g.drawImage;
    g.drawImage = function (im) { if (drawn === null) drawn = im; return real.apply(this, arguments); };

    function sample(ent, seconds) {
      var hits = 0, n = 0, t0 = G.t;
      for (var s = 0; s < seconds * 10; s++) {
        G.t = t0 + s / 10;
        drawn = null;
        _rtsDrawUnit(g, ent, 1);
        n++;
        if (drawn && idleSet.has(drawn)) hits++;
      }
      G.t = t0;
      return { pct: Math.round(hits / n * 100), n: n };
    }
    /* the same window of time for both men, so a difference is the gait and nothing else */
    var a = sample(men[0], 40), b = sample(men[1], 40);
    /* now make one of them busy in each of the ways that should suppress it */
    men[0].target = men[1];
    var whileTarget = sample(men[0], 40);
    men[0].target = null;
    men[0].path = [{ x: 5, z: 5 }, { x: 6, z: 6 }]; men[0].pi = 0;
    var whileWalking = sample(men[0], 40);
    men[0].path = null;
    men[0].prone = true;
    var whileProne = sample(men[0], 40);
    men[0].prone = false;

    /* and do the two men fidget at the SAME moments? */
    var together = 0, apart = 0, t0 = G.t;
    for (var s = 0; s < 400; s++) {
      G.t = t0 + s / 10;
      drawn = null; _rtsDrawUnit(g, men[0], 1); var f0 = !!(drawn && idleSet.has(drawn));
      drawn = null; _rtsDrawUnit(g, men[1], 1); var f1 = !!(drawn && idleSet.has(drawn));
      if (f0 && f1) together++;
      if (f0 !== f1) apart++;
    }
    G.t = t0;
    /* a vehicle must never fidget - the table is infantry only */
    var veh = G.ents.filter(function (e) { return !e.dead && e.type === 'unit' &&
      rtsUnitDef(e.def).kind === 'vehicle'; })[0];
    var vehPct = veh ? sample(veh, 40).pct : -1;
    return { a: a.pct, b: b.pct, whileTarget: whileTarget.pct, whileWalking: whileWalking.pct,
             whileProne: whileProne.pct, together: together, apart: apart, vehPct: vehPct,
             vehDef: veh ? veh.def : null };
  });

  console.log('\nwhen the renderer uses them (percentage of sampled frames showing a fidget)');
  if (use.error) fails.push(use.error);
  else {
    console.log('  idle, gait 0: ' + use.a + '%      idle, gait 3: ' + use.b + '%');
    console.log('  with a target: ' + use.whileTarget + '%   walking: ' + use.whileWalking +
                '%   prone: ' + use.whileProne + '%');
    console.log('  vehicle (' + use.vehDef + '): ' + use.vehPct + '%');
    console.log('  two men over 40s: fidgeting together on ' + use.together +
                ' samples, out of step on ' + use.apart);
    if (!use.a) fails.push('an idle soldier never fidgets - the wiring does nothing, which is ' +
                           'exactly the state this was parked in');
    if (use.a > 60) fails.push('an idle soldier is fidgeting ' + use.a + '% of the time - that is ' +
                               'not an occasional fidget, that is a twitch');
    if (use.whileTarget) fails.push('a soldier with a target still fidgets (' + use.whileTarget + '%)');
    if (use.whileWalking) fails.push('a walking soldier fidgets (' + use.whileWalking + '%)');
    if (use.whileProne) fails.push('a prone soldier fidgets (' + use.whileProne + '%)');
    if (use.vehPct > 0) fails.push('a ' + use.vehDef + ' fidgets');
    if (!use.apart) fails.push('two soldiers fidget in perfect lockstep - gait is not staggering them');
  }

  /* ================= 3. wreck fires - real, no art needed ================= */
  var wreck = await page.evaluate(function () {
    var G = window._rtsG;
    function killOne(pick, mutate) {
      G.fx.length = 0;
      var u = G.ents.filter(pick)[0];
      if (!u) return { error: 'no unit matching' };
      if (mutate) mutate(u);
      var hpBefore = {};
      G.ents.forEach(function (e) { if (!e.dead) hpBefore[e.id] = e.hp; });
      _rtsKill(u);
      var fires = G.fx.filter(function (f) { return /fire/.test(f.kind); });
      /* the kind NOW: an fx object mutates as its chain advances, so reading .kind after the
         ticks below reports 'smoke' and makes it look as though no fire was ever made */
      var kind0 = fires[0] ? fires[0].kind : null;
      /* run the clock on and see it burn out, and hurt nothing on the way */
      var hurt = 0;
      for (var i = 0; i < 60 * 20; i++) {
        _rtsTick(1 / 60);
        if (i === 60 * 2) {
          G.ents.forEach(function (e) {
            if (!e.dead && hpBefore[e.id] !== undefined && e.hp < hpBefore[e.id]) hurt++;
          });
        }
      }
      var left = G.fx.filter(function (f) { return /fire/.test(f.kind); }).length;
      return { def: u.def, fires: fires.length, kind: kind0,
               endsAs: fires[0] ? fires[0].kind : null,
               attached: fires.some(function (f) { return f.att; }),
               at: fires[0] ? { dx: Math.round(fires[0].x - u.x), dz: Math.round(fires[0].z - u.z) } : null,
               hurt: hurt, left: left };
    }
    var tank = killOne(function (e) { return !e.dead && e.type === 'unit' &&
      rtsUnitDef(e.def).kind === 'vehicle' && !rtsUnitDef(e.def).sea; });
    var crushed = killOne(function (e) { return !e.dead && e.type === 'unit' &&
      rtsUnitDef(e.def).kind === 'infantry'; }, function (u) { u.crushed = true; });
    var air = killOne(function (e) { return !e.dead && e.type === 'unit' &&
      rtsUnitDef(e.def).kind === 'vehicle'; }, function (u) { u.def = 'heli'; });
    return { tank: tank, crushed: crushed, air: air };
  });
  console.log('\nwreck fires');
  var t = wreck.tank;
  if (t.error) fails.push('wreck: ' + t.error);
  else {
    console.log('  a ' + t.def + ' dies: ' + t.fires + ' fire, starts as ' + t.kind +
                ' and has become ' + t.endsAs + ' by the end, at the wreck' +
                (t.at ? ' offset ' + t.at.dx + ',' + t.at.dz : '') +
                ', attached to an owner: ' + t.attached);
    console.log('  20s later: ' + t.left + ' left burning, and it damaged ' + t.hurt + ' entities');
    if (!t.fires) fails.push('a destroyed vehicle leaves no fire');
    if (t.attached) fails.push('the wreck fire is attached to an owner - it will follow or damage');
    if (t.hurt) fails.push('the wreck fire damaged ' + t.hurt + ' entities - it must be scenery');
    if (t.left) fails.push('the wreck fire never burns out (' + t.left + ' still going after 20s)');
    if (t.at && (Math.abs(t.at.dx) > 1 || Math.abs(t.at.dz) > 1))
      fails.push('the fire is not at the wreck: offset ' + t.at.dx + ',' + t.at.dz);
  }
  console.log('  a crushed infantryman: ' + wreck.crushed.fires + ' fire (should be 0)');
  console.log('  a helicopter: ' + wreck.air.fires + ' fire (should be 0 - it died in the air)');
  if (wreck.crushed.fires) fails.push('a crushed infantryman left a burning wreck');
  if (wreck.air.fires) fails.push('a helicopter left a fire on the ground it never reached');

  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  console.log('\n' + (fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS'));
  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})();
