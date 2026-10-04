/* WRECK FIRES. Kill a tank and check the ground burns, check the fire cannot hurt anything, and
   check the exceptions - a sinking ship and a helicopter that died in the air do not leave a
   fire on the ground. */

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

  /* ================= wreck fires ================= */
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
