/* GOING TO WHAT WAS SAID, WITH THE REAL PAGE (ui/go.js, core/idle.js, core/response.js, ui/hud.js):

     THE LINE     a base under attack: the message line is tappable, and a real click on it looks
                  at the building that was hit
     SPACE        looks there again from anywhere, after the line has gone
     THE RADAR    rings the spot in red for a while, with a Radar Post up
     IDLE         the ore gone, the line names a harvester and a tap selects it */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('alert');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await g.start(7, 3, { freeze: true });

  /* ---------- the line ---------- */
  var hit = await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard'), e = _rtsHas('enemy', 'yard');
    _rtsR.focus.x = e.x; _rtsR.focus.z = e.z; _rtsClampFocus();
    _rtsAttacked('player', y);
    _rtsSyncSidebar(0);
    var m = document.getElementById('rtsMsg'), r = m.getBoundingClientRect();
    var vs = _rtsViewSpan();
    return { cls: m.className, text: m.textContent, far: Math.hypot(vs.cx - y.x, vs.cz - y.z) / RTS_TILE, at: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, yard: { x: y.x, z: y.z } };
  });
  /* where the view is looking: its centre's distance from the yard, and whether the yard is in it */
  function looking(y) { var vs = _rtsViewSpan(); return { off: +(Math.hypot(vs.cx - y.x, vs.cz - y.z) / RTS_TILE).toFixed(2), inView: Math.abs(vs.cx - y.x) < vs.w / 2 && Math.abs(vs.cz - y.z) < vs.h / 2, line: document.getElementById('rtsMsg').className }; }
  S.ok('THE LINE: a base under attack, the message line is tappable', /\bgo\b/.test(hit.cls) && /under attack/.test(hit.text) && hit.far > 20, JSON.stringify({ cls: hit.cls, far: hit.far }));
  await p.mouse.click(hit.at.x, hit.at.y);
  var looked = await p.evaluate(function (a) { eval(a[0]); return looking(a[1]); }, [looking.toString(), hit.yard]);
  S.ok('...and a real click on it looks at the building that was hit: in view, near the centre, from more than twenty tiles off', looked.inView && looked.off < 10 && looked.off < hit.far / 4, JSON.stringify({ before: hit.far, after: looked }));

  /* ---------- space ---------- */
  await p.evaluate(function () { var G = window._rtsG, e = _rtsHas('enemy', 'yard'); _rtsR.focus.x = e.x; _rtsR.focus.z = e.z; _rtsClampFocus(); G.msgT = 0; _rtsSyncSidebar(0); });
  await p.keyboard.press(' ');
  var sp = await p.evaluate(function (a) { eval(a[0]); return looking(a[1]); }, [looking.toString(), hit.yard]);
  S.ok('SPACE: looks there again from anywhere, after the line has gone', sp.inView && sp.off < 10 && !/\bgo\b/.test(sp.line), JSON.stringify(sp));

  /* ---------- the radar ---------- */
  var ring = await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard');
    var rad = _rtsMBuild('player', 'radar', y.tx + 5, y.tz + 1);
    _rtsRecalcPower('player');
    function reds() {
      _rtsDrawMini();
      var mini = document.getElementById('rtsMini'), c = mini.getContext('2d'), S = mini.width, sc = S / RTS_N;
      var cx = (G.alert.x / RTS_TILE + RTS_N / 2) * sc, cz = (G.alert.z / RTS_TILE + RTS_N / 2) * sc, n = 0;
      var d = c.getImageData(Math.max(0, cx - 14 | 0), Math.max(0, cz - 14 | 0), 28, 28).data;
      for (var i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 140 && d[i + 2] < 130) n++;
      return n;
    }
    var now = reds();
    G.alert.t = G.t - 30;                                   /* long over */
    var later = reds();
    return { lit: _rtsRadarLit(), radar: !!rad, now: now, later: later };
  });
  S.ok('THE RADAR: with a Radar Post up, the spot is ringed in red, and not once the ring is over', ring.lit && ring.now >= 6 && ring.later <= 1, JSON.stringify(ring));

  /* ---------- idle ---------- */
  /* a harvester with a refinery to work for, then no ore anywhere; a second at a time until the
     line is up, since the battle says other things too and the loop is frozen while we click */
  var idle = await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard');
    _rtsMBuild('player', 'refinery', y.tx - 5, y.tz, 'ref');
    _rtsMUnits('player', 'harvester', y.tx - 5, y.tz + 3, 1, 'harv');
    _rtsSyncSidebar(0);                     /* the new building's "New construction options." now, not over the line */
    G.scrap.fill(0);
    var m = document.getElementById('rtsMsg'), secs = 0;
    for (; secs < 24 && !/ore is gone/.test(G.msg || ''); secs++) { for (var i = 0; i < 60; i++) _rtsTick(1 / 60); }
    _rtsSyncSidebar(0);
    var r = m.getBoundingClientRect();
    return { text: m.textContent, cls: m.className, secs: secs, at: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, sel: G.msgSel && G.msgSel.def };
  });
  if (/ore is gone/.test(idle.text)) await p.mouse.click(idle.at.x, idle.at.y);
  var picked = await p.evaluate(function () { var G = window._rtsG; return G.sel.length === 1 && G.sel[0] === G.msgSel ? G.sel[0].def : null; });
  S.ok('IDLE: the ore gone, the line names a harvester and a tap selects it', /ore is gone/.test(idle.text) && /\bgo\b/.test(idle.cls) && !!picked,
       JSON.stringify({ text: idle.text, picked: picked }));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
