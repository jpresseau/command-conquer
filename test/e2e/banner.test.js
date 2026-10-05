/* THE BANNERS, WHERE A PLAYER CAN READ THEM (ui/hud.js _rtsBanner, _rtsBannerTop).

   The placement banner and an armed superweapon's are drawn on the HUD canvas, and the top
   strip, the compass and the message line are DOM laid OVER that canvas. The banners were drawn
   at y 14: under the strip's gradient at a desk, and behind its 40-pixel buttons on a phone -
   where the placement banner also told the player to click and press Esc.

   On a 360-pixel phone held upright, the same phone turned on its side, and a desk, for the
   longest building name and every superweapon's line:
   - the banner really is drawn: its box is inked on the HUD canvas through the game's own draw
     (the population, and the control for the next claim)
   - while a message is up it is not drawn, so the two never stack
   - it sits in the message line's slot, below the strip, clear of the compass and inside the
     field, in type of 10 pixels or more
   - turning the phone moves it with the message line, which the stylesheet moves
   - the phone's placement banner says drag and hold, never click or Esc; the desk's says both */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('banner');

/* every banner's box against the DOM over the field, and the game's own draw of the placement
   banner with the message line quiet and then busy */
function measure() {
  var U = window._rtsUI, G = window._rtsG, W = _rtsR.W, H = _rtsR.H;
  var hud = document.getElementById('rtsHud'), hg = hud.getContext('2d'), k = hud.width / W;
  var st = document.querySelector('#rcgRts .rts-stage').getBoundingClientRect();
  function rel(el) {
    if (!el || getComputedStyle(el).display === 'none') return null;
    var r = el.getBoundingClientRect();
    return r.width ? { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height } : null;
  }
  function hits(a, b) { return !!(a && b) && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  var strip = rel(document.querySelector('#rcgRts .rts-top')), compass = rel(document.getElementById('rtsCompass'));
  var touch = _rtsTouchUI(), msgTop = document.getElementById('rtsMsg').offsetTop;
  var longest = RTS_STRUCTS.slice().sort(function (a, b) { return b.name.length - a.name.length; })[0];
  var lines = [_rtsPlaceHint(longest.name, touch)];
  RTS_STRUCTS.forEach(function (d) { if (d.super) lines.push(_rtsArmedHint(d.super, touch)); });
  var boxes = lines.map(function (t) {
    hg.clearRect(0, 0, W, H);
    var b = _rtsBanner(hg, W, t, _rtsBannerTop());
    return { t: t, y: b.y, px: b.px, lines: b.lines, box: [b.x, b.y, b.w, b.h].map(Math.round),
             clearStrip: !!strip && b.y >= strip.y + strip.h - 0.5, clearCompass: !hits(b, compass), inside: b.x >= 0 && b.x + b.w <= W };
  });
  function inked(b) {
    var d = hg.getImageData(Math.round(b[0] * k), Math.round(b[1] * k), Math.round(b[2] * k), Math.round(b[3] * k)).data, n = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 100) n++;
    return n / (d.length / 4);
  }
  G.sel = []; U.flash = null; U.superArm = null;
  G.sides.player.ready = longest.key; U.place = longest.key;
  G.msgT = 0; _rtsDrawHud(0); var quiet = inked(boxes[0].box);
  G.msgT = 2; _rtsDrawHud(0); var busy = inked(boxes[0].box);
  G.msgT = 0; U.place = null;
  return { W: W, touch: touch, msgTop: msgTop, strip: strip, compass: compass, boxes: boxes, quiet: quiet, busy: busy };
}

function judge(name, m) {
  var b0 = m.boxes[0];
  S.ok(name + ': the placement banner is drawn - and not while a message is up, so the two never stack',
       m.boxes.length >= 3 && m.quiet > 0.9 && m.busy < 0.1, 'inked ' + m.quiet.toFixed(2) + ' of its box quiet, ' + m.busy.toFixed(2) + ' under a message');
  var bad = m.boxes.filter(function (b) { return !(b.y === m.msgTop && b.clearStrip && b.clearCompass && b.inside && b.px >= 10); });
  S.ok(name + ': every banner is in the message line\'s slot, below the strip, clear of the compass, inside the field, in type of 10 pixels or more',
       !!m.strip && !!m.compass && !bad.length,
       (m.compass ? '' : 'no compass on screen; ') + 'line at ' + m.msgTop + ', strip ' + JSON.stringify(m.strip) + ', compass ' + JSON.stringify(m.compass) +
       (bad.length ? '; off: ' + JSON.stringify(bad) : '; ' + m.boxes.length + ' banners, ' + m.boxes.filter(function (b) { return b.lines === 2; }).length + ' in two lines'));
  S.ok(name + ': the placement banner names this device\'s gestures',
       m.touch ? /^Drag to place .*hold its button to cancel$/.test(b0.t) && !/click|esc/i.test(b0.t) : /^Click to place .*Esc to cancel$/.test(b0.t), b0.t);
}

(async function () {
  var browser = await chromium.launch(), errs = [];

  var p = await openPage(browser, { device: devices['Galaxy S8'] });
  await p.start(7, 5, { freeze: true });
  var up = await p.page.evaluate(measure);
  judge('a 360-pixel phone', up);
  /* turned on its side: the observer resizes the field, and the banner follows the line */
  var w0 = up.W;
  await p.page.setViewportSize({ width: 740, height: 360 });
  var turned = await p.page.waitForFunction(function (w) { return _rtsR.W !== w; }, w0, { timeout: 20000 }).then(function () { return true; }, function () { return false; });
  var side = await p.page.evaluate(measure);
  judge('...turned on its side', side);
  S.ok('turning the phone moves the banner with the message line', turned && side.msgTop !== up.msgTop && side.boxes[0].y === side.msgTop,
       (turned ? '' : 'the field never resized; ') + 'line ' + up.msgTop + ' -> ' + side.msgTop + ', banner at ' + side.boxes[0].y);
  errs = errs.concat(p.errors);
  await p.close();

  var d = await openPage(browser, { width: 1100, height: 760, dpr: 1 });
  await d.start(7, 5, { freeze: true });
  judge('a desk', await d.page.evaluate(measure));
  errs = errs.concat(d.errors);
  await d.close();

  S.ok('the page logged no errors', !errs.length, errs.join(' | ') || 'clean');
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
