/* MORE WEATHER, in the picture - the sandstorm, the showers and the bolt (render3d/sky3d.js,
   skyfx3d.js, the ground's puddles in terrain3d.js, render/sky2d.js):

     SANDSTORM  the light goes ochre; sand drives across the view (R3.sandAmt takes it out);
                and the 2D picture takes the tint, with the sand driving across it
     SHOWERS    in a shower the rain falls; in a dry spell none does, and the ground dries -
                brighter as the spell goes on. (The puddles also shrink back as they dry, but at
                this zoom too few pixels of puddle are in view to measure it apart from that.)
     LIGHTNING  at a strike a bolt of light stands from the cloud to the ground (R3.boltOff takes
                it out); and in 2D too */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('weather');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    if (window._rtsUI) window._rtsUI.dead = true;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    G.ents.forEach(function (e) { if (e.type === 'unit') e.path = null; });
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    var yd = _rtsHas('player', 'yard');
    R.focus.x = yd.x + 16; R.focus.z = yd.z + 24; R.zi = RTS_ZOOMS.length - 3; _rtsApplyCam();
    function shot(sky, t) {
      window.RTS_SKY_FORCE = sky; G.t = t; G.fx.length = 0; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function stats(b) { var r = 0, gg = 0, bl = 0, n = 0; for (var k = 0; k < b.length; k += 16) { r += b[k]; gg += b[k + 1]; bl += b[k + 2]; n++; } return { r: r / n, g: gg / n, b: bl / n, l: (r + gg + bl) / 3 / n }; }
    function diff(a, b) { var n = 0, br = 0; for (var k = 0; k < a.length; k += 4) { var d = a[k] + a[k + 1] + a[k + 2] - b[k] - b[k + 1] - b[k + 2]; if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 24) n++; if (d > 150 && a[k] + a[k + 1] + a[k + 2] > 560) br++; } return { n: n, bright: br }; }

    /* SANDSTORM */
    var D = shot('day', 5), SA = shot('sand', 5);
    o.day = stats(D); o.sand = stats(SA); o.sandN = R3.sandN || 0;
    var q1 = R3.fxV ? R3.fxV.M.n : 0;
    R3.sandAmt = 0; var S0 = shot('sand', 5); R3.sandAmt = undefined;
    o.blown = diff(SA, S0).n; o.sandQuads = q1 - (R3.fxV ? R3.fxV.M.n : 0);

    /* SHOWERS: a shower, then the first dry spell from its start to its end */
    var t = RTS_SHOWER_FIRST, spell = null, shower = null;
    for (; t < 2000 && !(spell && shower); t += 0.5) {
      var w = _rtsShower(t);
      if (!spell && w.rain === 0) spell = { t0: t };
      else if (spell && !spell.t1 && w.rain > 0) spell.t1 = t - 0.5;
      if (spell && spell.t1 && !shower && w.rain === 1) shower = t + 5;
    }
    o.spell = spell; o.shower = shower;
    var W1 = shot('rain', shower); R3.rainAmt = 0; var W0 = shot('rain', shower); R3.rainAmt = undefined;
    o.falling = diff(W1, W0).n;
    var Dz1 = shot('rain', spell.t0 + 2); R3.rainAmt = 0; var Dz0 = shot('rain', spell.t0 + 2); R3.rainAmt = undefined;
    o.dryFalling = diff(Dz1, Dz0).n;
    var early = shot('rain', spell.t0 + 2), late = shot('rain', spell.t1 - 2);
    o.wet = [+_rtsShower(spell.t0 + 2).wet.toFixed(2), +_rtsShower(spell.t1 - 2).wet.toFixed(2)];
    o.dries = [stats(early).l, stats(late).l, diff(late, early).n];

    /* LIGHTNING: the first strike, at its brightest, and the moment after */
    var tS = RTS_THUNDER_FIRST + 0.02;
    var L1 = shot('rain', tS); R3.boltOff = true; var L0 = shot('rain', tS); R3.boltOff = false;
    o.bolt = diff(L1, L0);
    window.RTS_SKY_FORCE = 'rain'; G.t = tS; o.foot = _r3dBoltFoot(G);
    /* the bolt itself, not the glare at its foot: bright pixels round its upper reaches */
    o.boltUp = 0;
    if (o.foot) {
      var bp = _rtsBoltAt(o.foot[3]).pts, sc2 = CW / R3.cv.clientWidth;
      [1, 2].forEach(function (j) {                     /* above the fork, and far from the glare at the foot */
        var p = _rtsWorldToScreen(o.foot[0] + bp[j][0], o.foot[1] + bp[j][1], o.foot[2] + bp[j][2]), cx = Math.round(p.x * sc2), cy = Math.round(p.y * sc2);
        for (var yy = cy - 6; yy <= cy + 6; yy++) for (var xx = cx - 6; xx <= cx + 6; xx++) {
          if (xx < 0 || yy < 0 || xx >= CW || yy >= CH) continue;
          var q = ((CH - 1 - yy) * CW + xx) * 4;
          if (L1[q] + L1[q + 1] + L1[q + 2] > 600 && L1[q] + L1[q + 1] + L1[q + 2] - L0[q] - L0[q + 1] - L0[q + 2] > 150) o.boltUp++;
        }
      });
    }

    /* 2D */
    rts3dSet(false);
    function shot2(sky, t2) { window.RTS_SKY_FORCE = sky; G.t = t2; _rtsRFrame(0); var c = R.cv; return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
    var A0 = shot2('day', 5), A1 = shot2('sand', 5);
    o.sand2 = [stats(A0), stats(A1)];
    var A2 = shot2('sand', 5.3), F0 = shot2('fog', 5), F1 = shot2('fog', 5.3);
    o.sandMove2 = [diff(A1, A2).n, diff(F0, F1).n];
    var B1 = shot2('rain', tS), B0 = shot2('rain', tS + 0.8);
    o.bolt2 = diff(B1, B0).bright;
    window.RTS_SKY_FORCE = undefined;
    gl.getError(); rts3dSet(true); window.RTS_POST_ON = true; shot(undefined, 5); o.glErr = gl.getError();
    R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  var d = out.day, s = out.sand;
  S.ok('in a sandstorm the light goes ochre', s.r / s.b > (d.r / d.b) * 1.15,
       'red over blue ' + (s.r / s.b).toFixed(2) + ' against ' + (d.r / d.b).toFixed(2) + ' by day');
  S.ok('...and sand drives across the view', out.sandN > 100 && out.sandQuads >= out.sandN && out.blown > 1500, out.sandN + ' grains, ' + out.sandQuads + ' quads, ' + out.blown + ' pixels');
  S.ok('...in 2D as well', out.sand2[1].r / out.sand2[1].b > (out.sand2[0].r / out.sand2[0].b) * 1.1,
       (out.sand2[1].r / out.sand2[1].b).toFixed(2) + ' against ' + (out.sand2[0].r / out.sand2[0].b).toFixed(2));
  S.ok('...the sand driving across it there too, where a fog stands still', out.sandMove2[0] > 300 && out.sandMove2[1] < out.sandMove2[0] / 10, out.sandMove2.join(' against '));
  S.ok('the rain comes and goes: there is a dry spell and a shower after it', !!out.spell && !!out.spell.t1 && !!out.shower, JSON.stringify(out.spell) + ', shower at ' + out.shower);
  S.ok('in the shower the rain falls', out.falling > 400, out.falling + ' pixels of rain');
  S.ok('...in the dry spell none does', out.dryFalling === 0, out.dryFalling + ' pixels');
  S.ok('...and the ground dries through it, brighter as it goes', out.wet[1] < out.wet[0] - 0.2 && out.dries[1] > out.dries[0] && out.dries[2] > 2000,
       'wet ' + out.wet.join(' then ') + '; ' + out.dries[0].toFixed(1) + ' then ' + out.dries[1].toFixed(1) + ' bright, ' + out.dries[2] + ' pixels change');
  S.ok('at a strike a bolt stands from the cloud to the ground', !!out.foot && out.bolt.bright > 40 && out.boltUp > 10, out.boltUp + ' pixels lit white up the bolt, ' + out.bolt.bright + ' in all');
  S.ok('...and in 2D as well', out.bolt2 > 40, out.bolt2 + ' pixels');
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
