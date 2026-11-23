/* WHAT OPENING A BATTLE PAYS - sprites/props.js _sprUnit, sprites/assemble.js, render/icons.js,
   title.js _rtsOpenSoon. A phone report: START BATTLE said "DEPLOYING..." for one to two minutes
   on a screen that looked frozen. Measured, 17 of the 22 s a start took here was baking every
   unit at every facing for every side, which the WebGL battlefield never draws. Now:

     LAZY    a unit's facings, a building's sprite and a cameo are made on first read, and a
             facing read is the same canvas as one baked the old way
     THE PLATE  the cameo plate is sized from the models' bounds, and that is the size the baked
             sprites need
     COVER   a tap on START puts up a cover with a moving bar before the work, and takes it down
             after */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('startcost');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760, dpr: 1 });
  var p = g.page;

  /* ---- the cover, on a real START ---- */
  var at = await p.evaluate(function () {
    document.getElementById('rtsGo').click();
    var L = document.getElementById('rtsLoad'), i = L && L.querySelector('.bar i');
    return { up: !!L && !L.hidden && getComputedStyle(L).display !== 'none', battle: !!document.getElementById('rcgRts'),
             anim: i ? getComputedStyle(i).animationName : '' };
  });
  await p.waitForFunction(function () { return !!window._rtsUI; }, null, { timeout: 120000 });
  await p.waitForFunction(function () { var L = document.getElementById('rtsLoad'); return L && L.hidden; }, null, { timeout: 30000 }).catch(function () {});
  var after = await p.evaluate(function () { var L = document.getElementById('rtsLoad'); return { hidden: !!(L && L.hidden), display: L ? getComputedStyle(L).display : '' }; });

  var out = await p.evaluate(function () {
    var o = {}, Sp = _rtsSprites();
    function baked(obj, k) { var d = Object.getOwnPropertyDescriptor(obj, k); return !!d && !d.get; }
    var fr = Sp.unit.enemy.tank;
    o.len = fr.length; o.n = _sprFacings('tank');
    o.tankBaked = [0, 3, 6, 17].map(function (f) { return baked(fr, f); });
    o.bldBaked = baked(Sp.bld.enemy, 'factory');
    var c = fr[3];
    o.after3 = baked(fr, 3); o.other = baked(fr, 4);
    /* the old way, for the same facing */
    var m = _sprUnitModel('tank', 'enemy', false, 'hull'), size = _sprUnitFit('tank', 'enemy');
    var old = _sprUnitFacing(m, size, 3, o.n, 'hull');
    var a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, b = old.getContext('2d').getImageData(0, 0, old.width, old.height).data, diff = 0, ink = 0;
    for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) diff++; if (i % 4 === 3 && a[i]) ink++; }
    o.same = { w: c.width === old.width && c.height === old.height, diff: diff, ink: ink };
    /* the plate from bounds against the baked sprites */
    var big = 0, k;
    for (k = 0; k < RTS_STRUCTS.length; k++) { var s = Sp.bld.player[RTS_STRUCTS[k].key].c; big = Math.max(big, s.width, s.height); }
    for (k = 0; k < RTS_UNITS.length; k++) { var u = Sp.unit.player[RTS_UNITS[k].key][6]; big = Math.max(big, u.width, u.height); }
    o.plate = _rtsIconPlate(Sp, 'player'); o.plateBaked = Math.max(160, Math.ceil((big + 16) / 16) * 16);
    var ic = window._rtsUI.icons;
    o.iconLazy = !baked(ic, 'cruiser'); var url = ic.cruiser; o.iconMade = baked(ic, 'cruiser') && /^data:image\/png/.test(url);
    return o;
  });

  S.ok('COVER: a tap on START puts the cover up before the battle is made', at.up && !at.battle, JSON.stringify(at));
  S.ok('...with a moving bar (a CSS animation, which runs while script is busy)', at.anim === 'rtsLoadRun', at.anim);
  S.ok('...and it is down once the battle is open', after.hidden && after.display === 'none', JSON.stringify(after));
  S.ok('a tank has its full set of facings (population)', out.len === out.n && out.n === 32, out.len + ' of ' + out.n);
  S.ok('LAZY: the enemy tank\'s facings are not baked by opening a battle', out.tankBaked.every(function (b) { return !b; }), JSON.stringify(out.tankBaked));
  S.ok('...nor the enemy\'s Vehicle Works sprite', !out.bldBaked, String(out.bldBaked));
  S.ok('...reading a facing bakes that one and keeps it, and no other', out.after3 && !out.other, JSON.stringify({ a: out.after3, b: out.other }));
  S.ok('...and it is the same picture the old bake made', out.same.w && out.same.diff === 0 && out.same.ink > 50, JSON.stringify(out.same));
  S.ok('THE PLATE: sized from bounds, it is the size the baked sprites need', out.plate === out.plateBaked, out.plate + ' against ' + out.plateBaked);
  S.ok('a cameo off the tab in view is not made until read, then is a picture', out.iconLazy && out.iconMade, JSON.stringify({ lazy: out.iconLazy, made: out.iconMade }));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
