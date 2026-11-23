/* A FINISHED BUILDING IN THE WAY - ui/sidebar.js _rtsReadyFirst. A phone report: a Vehicle Works
   built but not yet placed left every vehicle locked, and tapping one said "Build a Vehicle Works
   first" to a player who just had. Now the tap picks the waiting building up for placing and says
   where it goes. Controls: with nothing waiting the old refusal stands, and a refusal the waiting
   building would not cure (no Barracks, while a Vehicle Works waits) is left alone. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('readyfirst');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760, dpr: 1 });
  await g.start(7, 2, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, G = window._rtsG, U = window._rtsUI, Sd = G.sides.player;
    G.sides.enemy.ai.next = 1e9;
    Sd.money = 99999; Sd.q.struct = null; U.place = null;
    function tap(key) { G.msg = null; U.place = null; _rtsItemClick(key); return { msg: G.msg, place: U.place, q: Sd.q.vehicle ? Sd.q.vehicle.key : null }; }
    o.pop = { factory: !!_rtsHas('player', 'factory'), barracks: !!_rtsHas('player', 'barracks'), tank: !!rtsUnitDef('tank') };
    Sd.ready = null;
    o.none = tap('tank');
    Sd.ready = 'factory';
    o.veh = tap('tank');
    o.inf = tap('rifle');
    o.bld = tap('power');
    return o;
  });

  S.ok('no Vehicle Works or Barracks standing, and a tank to tap (population)', !out.pop.factory && !out.pop.barracks && out.pop.tank, JSON.stringify(out.pop));
  S.ok('nothing waiting: a tank is refused as before (the control)', /Vehicle Works first/.test(out.none.msg || '') && out.none.place === null, JSON.stringify(out.none));
  S.ok('a Vehicle Works waiting: tapping a tank picks it up for placing', out.veh.place === 'factory' && out.veh.q === null, JSON.stringify(out.veh));
  S.ok('...and says where it goes', /Vehicle Works is ready .*tap the map/.test(out.veh.msg || ''), JSON.stringify(out.veh.msg));
  S.ok('a refusal it would not cure is left alone (no Barracks)', /Barracks/.test(out.inf.msg || '') && out.inf.place === null, JSON.stringify(out.inf));
  S.ok('another building tapped while one waits picks the waiting one up', out.bld.place === 'factory' && /tap the map/.test(out.bld.msg || ''), JSON.stringify(out.bld));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
