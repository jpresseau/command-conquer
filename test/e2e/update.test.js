/* A NEWER BUILD, SAID ON THE TITLE - update.js, build.py's build.txt. The title fetches the stamp
   build.py writes beside the page and, if it names another build, shows a line with UPDATE NOW;
   only on the title, so a battle is never interrupted.

     STAMP    build.txt is the stamp the page carries (the same build wrote both)
     SAME     the deployed stamp is this build's: no line
     NEWER    another stamp: the line, with a button that is what a tap at its centre lands on
     BATTLE   during a battle the title is gone, and the line with it
     JUNK     markup or a long body is not a build stamp: no line */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('update');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760, dpr: 1 });
  var p = g.page;
  /* the deployed stamp, played by the page's own fetch: the service worker answers build.txt
     before a Playwright route would see it */
  async function deployed(text) {
    await p.evaluate(function (t) {
      if (!window.__realFetch) window.__realFetch = window.fetch;
      window.fetch = function (u, o) { return /build\.txt/.test(String(u)) ? Promise.resolve(new Response(t, { status: 200 })) : window.__realFetch(u, o); };
    }, text);
  }

  var o = await p.evaluate(async function () {
    var o = {}, n = document.getElementById('rtsUpdate');
    o.here = _rtsBuildHere(); o.file = (await (await fetch('build.txt', { cache: 'no-store' })).text()).trim();
    o.same = await rtsUpdateCheck(); o.sameShown = !n.hidden;
    return o;
  });
  await deployed('abc1234 · 2099-01-01\n');
  var newer = await p.evaluate(async function () {
    var n = document.getElementById('rtsUpdate'), r = await rtsUpdateCheck();
    n.scrollIntoView({ block: 'center' });
    var b = n.querySelector('button'), bb = b.getBoundingClientRect(), hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
    return { r: r, shown: !n.hidden && n.offsetParent !== null, text: n.textContent, hit: hit === b, onclick: b.getAttribute('onclick') };
  });
  await deployed('<script>x</script>');
  var junk = await p.evaluate(async function () { var r = await rtsUpdateCheck(); return { r: r, shown: !document.getElementById('rtsUpdate').hidden }; });
  await deployed('abc1234 · 2099-01-01\n');
  await g.start(7, 1, { freeze: true });
  var battle = await p.evaluate(async function () { await rtsUpdateCheck(); var n = document.getElementById('rtsUpdate'); return { visible: !!(n && n.offsetParent !== null) }; });

  S.ok('STAMP: build.txt is the stamp the page carries', !!o.here && o.file === o.here, JSON.stringify({ here: o.here, file: o.file }));
  S.ok('SAME: the deployed build is this one - no line', o.same === false && !o.sameShown, JSON.stringify(o));
  S.ok('NEWER: another build up - the line shows', newer.r === true && newer.shown && /new version/i.test(newer.text), JSON.stringify(newer));
  S.ok('...and its UPDATE NOW button is what a tap at its centre lands on, and reloads', newer.hit && /rtsUpdateNow/.test(newer.onclick || ''), JSON.stringify(newer));
  S.ok('JUNK: markup is not a build stamp - no line', junk.r === false && !junk.shown, JSON.stringify(junk));
  S.ok('BATTLE: in a battle the line is not on screen', !battle.visible, JSON.stringify(battle));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
