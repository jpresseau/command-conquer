/* THE MAP BEFORE THE BATTLE, ON THE TITLE (preview.js, title.js, skirmish.js):

     DRAWN       the title draws the next map - a coast, so there is water in the picture - and
                 names its seed, with no battle left live behind it
     ANOTHER     ↻ rolls a new seed and a different picture
     THE SETUP   INLAND redraws the same seed with far less water (the sea goes; rivers stay)
     THE PROMISE START BATTLE plays the seed the title showed, and the title after rolls a new one */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('preview');

function read() {
  var cv = document.getElementById('rtsPrevCv'), c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height).data, blue = 0, dark = 0;
  for (var i = 0; i < d.length; i += 4) { if (d[i + 2] > d[i] + 20 && d[i + 2] > d[i + 1] + 10) blue++; if (d[i] + d[i + 1] + d[i + 2] < 30) dark++; }
  var txt = document.getElementById('rtsPrevSeed').textContent, m = /map (\d+)/.exec(txt);
  var sum = 0; for (var k = 0; k < d.length; k += 97) sum = (sum * 31 + d[k]) | 0;
  return { seed: m ? +m[1] : null, blue: blue, dark: dark, hash: sum, live: !!window._rtsG, txt: txt };
}
function drawn(p, not) {
  return p.waitForFunction(function (not) { var m = /map (\d+)/.exec(document.getElementById('rtsPrevSeed').textContent); return !!m && +m[1] !== not; }, not, { timeout: 30000 }).catch(function () {});
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await p.evaluate(function () { try { localStorage.removeItem('bw.skirmish'); } catch (e) {} rtsSkirmishSync(); });
  await drawn(p, null);
  var a = await p.evaluate(read);
  S.ok('DRAWN: the title draws the next map, a coast with water in it, and names its seed, with no battle live behind it',
       !!a.seed && a.blue > 300 && a.dark < 2000 && !a.live, JSON.stringify(a));

  /* ---------- another ---------- */
  var at = await p.evaluate(function () { var b = document.getElementById('rtsPrevRoll'); b.scrollIntoView({ block: 'center' }); var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(at.x, at.y);
  await drawn(p, a.seed);
  var b = await p.evaluate(read);
  S.ok('ANOTHER: ↻ rolls a new seed and a different picture', !!b.seed && b.seed !== a.seed && b.hash !== a.hash, JSON.stringify({ a: a.seed, b: b.seed }));

  /* ---------- the setup ---------- */
  await p.evaluate(function () { rtsSkirmishSet('water', 'inland'); });
  await p.waitForFunction(function () { return /laying/.test(document.getElementById('rtsPrevSeed').textContent) === false; }, null, { timeout: 30000 }).catch(function () {});
  await drawn(p, null);
  var c = await p.evaluate(read);
  /* an inland map keeps its rivers and lakes - it is the sea that goes - so the measure is the coast's blue against it */
  S.ok('THE SETUP: INLAND redraws the same seed with far less water', c.blue < b.blue / 2 && c.seed === b.seed, JSON.stringify({ coast: b.blue, inland: c.blue, seed: c.seed }));
  await p.evaluate(function () { rtsSkirmishSet('water', 'coast'); });
  await drawn(p, null);

  /* ---------- the promise ---------- */
  var shown = await p.evaluate(function () { return +/map (\d+)/.exec(document.getElementById('rtsPrevSeed').textContent)[1]; });
  at = await p.evaluate(function () { var b = document.getElementById('rtsGo'); b.scrollIntoView({ block: 'center' }); var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(at.x, at.y);
  await p.waitForFunction(function () { return !!(window._rtsG && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  var played = await p.evaluate(function () { var G = window._rtsG; var U = window._rtsUI; if (U) { U.dead = true; try { cancelAnimationFrame(U.raf); } catch (e) {} } return G ? G.seed : null; });
  S.ok('THE PROMISE: START BATTLE plays the seed the title showed', played === shown, JSON.stringify({ shown: shown, played: played }));
  await p.evaluate(function () { rtsClose(); });
  await drawn(p, shown);
  var next = await p.evaluate(read);
  S.ok('...and the title after rolls a new one', !!next.seed && next.seed !== shown && !next.live, JSON.stringify({ shown: shown, next: next.seed }));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
