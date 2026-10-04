/* EXPLOSIONS ARE FIRE AND SMOKE NOW, NOT RED ALERT'S SPRITES - render3d/fxglsl3d.js, fxemit3d.js.

   Every effect in 3D was a few frames of pixel art on a quad. They are shaded now: a fireball is
   a cluster of billows that burst, climb, cool through white, orange and red and roll over into
   smoke; a fire is tongues of flame under a leaning column of soot; a splash is a crown of spray
   in a ring of foam. Each claim below is something the sprite could not do, measured on the
   built page with the sprite quads (RTS_FX_SPRITES) as the before-picture where there is one:

     THE GLARE      a blast lights the ground round it - and lights it, rather than painting it
                    orange: the grass stays green, brighter
     THE HAND-OFF   a fireball's billows roll on into the fire it chains to, with no jump
     THE CLOCK      an effect is a function of the game's state: a paused game is a still frame,
                    and a fire flickers on the game clock
     THE SMOKE      a column stands above what is burning
     THE ROOF       a fire on a building burns on its roof, where it can be seen
     THE GLOW       the bloom's emitter pass draws only what gives off light, so a frame of
                    nothing but smoke has no glow to blur
     THE ROUNDS     a rocket flies at its height trailing smoke; a rifle round is a dash
     THE DUST       a vehicle on the move raises dust behind it
     THE DRAWS      no draw is refused, in either path */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('fxshade');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    rtsSetArmySide('allied');
    _rtsNewGame(4242, 'easy');
    G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    window.RTS_POST_ON = false;             /* the bloom spreads everything; it has its own check */
    G.ents = G.ents.filter(function (e) { return e.type === 'struct'; });

    /* open grass: a 9x9 block of it, nearest the yard */
    var yd = _rtsHas('player', 'yard'), best = null, bd = 1e9;
    for (var tz = 6; tz < RTS_N - 6; tz++) for (var tx = 6; tx < RTS_N - 6; tx++) {
      var ok = true;
      for (var a = -4; a <= 4 && ok; a++) for (var b = -4; b <= 4 && ok; b++) {
        var j = _rtsIdx(tx + a, tz + b);
        if (G.terrain[j] !== RTS_T_GRASS || G.blocked[j] || G.gems[j]) ok = false;
      }
      var d = Math.abs(tx - yd.tx) + Math.abs(tz - yd.tz);
      if (ok && d < bd) { bd = d; best = [tx, tz]; }
    }
    o.grassAt = best;
    if (!best) return o;
    var X = _rtsWX(best[0]), Z = _rtsWX(best[1]);
    R.focus.x = X; R.focus.z = Z; R.zi = RTS_ZOOM_2D_STEPS - 1; _rtsApplyCam();

    function frame(fx) {
      G.fx.length = 0;
      if (fx) for (var k = 0; k < fx.length; k++) G.fx.push(fx[k]);
      _rtsRFrame(0);
      var t = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, t);
      return t;
    }
    function at(A, x, y) { var q = ((CH - 1 - Math.round(y)) * CW + Math.round(x)) * 4; return [A[q], A[q + 1], A[q + 2]]; }
    function diff(A, B) { var s = 0; for (var q = 0; q < A.length; q += 4) s += Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]); return s / (A.length / 4); }
    frame(null);
    var bare = frame(null);
    var c = _rtsGroundToScreen(X, Z), zoom = _rtsZoom();
    o.shaded = true;

    /* ---------- 1. the glare ----------
       The ground in a ring round the blast, outside its fireball and inside the reach of its
       light: the mean of a band from 2.3 to 3.3 fireball radii, sampled across the screen. */
    var boom = { kind: 'boom', x: X, y: 1, z: Z, t: 0.05, big: 1.6 };
    var lit = frame([boom]);
    var Rw = R3D_FX_R * 1.6, band = [0, 0, 0], bandB = [0, 0, 0], nb = 0;
    for (var ang = 0; ang < 6.283; ang += 0.2) for (var rr = 2.3; rr <= 3.3; rr += 0.25) {
      var p = _rtsGroundToScreen(X + Math.cos(ang) * Rw * rr, Z + Math.sin(ang) * Rw * rr);
      if (p.x < 2 || p.y < 2 || p.x > CW - 3 || p.y > CH - 3) continue;
      var c1 = at(lit, p.x, p.y), c0 = at(bare, p.x, p.y);
      for (var ch = 0; ch < 3; ch++) { band[ch] += c1[ch]; bandB[ch] += c0[ch]; }
      nb++;
    }
    o.band = band.map(function (v) { return Math.round(v / nb); });
    o.bandBare = bandB.map(function (v) { return Math.round(v / nb); });
    o.bandN = nb;
    window.RTS_FX_SPRITES = true;
    var sprite = frame([boom]), bandS = [0, 0, 0];
    for (ang = 0; ang < 6.283; ang += 0.2) for (rr = 2.3; rr <= 3.3; rr += 0.25) {
      p = _rtsGroundToScreen(X + Math.cos(ang) * Rw * rr, Z + Math.sin(ang) * Rw * rr);
      if (p.x < 2 || p.y < 2 || p.x > CW - 3 || p.y > CH - 3) continue;
      var c2 = at(sprite, p.x, p.y);
      for (ch = 0; ch < 3; ch++) bandS[ch] += c2[ch];
    }
    o.bandSprite = bandS.map(function (v) { return Math.round(v / nb); });
    window.RTS_FX_SPRITES = false;

    /* ---------- 2. the hand-off ----------
       The fireball's last moment against the first moment of the small fire it becomes - the
       same record, metamorphosed (core/transport.js). A fire that did NOT grow out of it (it
       has a `base`, from a burning host) is the control: the billows are not carried into that. */
    var end = frame([{ kind: 'boom', x: X, y: 1, z: Z, t: RTS_ANIMS.boom.dur - 0.001, big: 1.6 }]);
    var chained = frame([{ kind: 'firesmall', x: X, y: 1, z: Z, t: 0.001, big: 1.6 * 0.6, loops: RTS_ANIMS.firesmall.loops }]);
    var unrelated = frame([{ kind: 'firesmall', x: X, y: 1, z: Z, t: 0.001, big: 1.6 * 0.6, base: 2, loops: RTS_ANIMS.firesmall.loops }]);
    o.jump = +diff(end, chained).toFixed(2);
    o.jumpControl = +diff(end, unrelated).toFixed(2);
    o.fireballPx = 0;
    for (var q0 = 0; q0 < end.length; q0 += 4)
      if (Math.abs(end[q0] - bare[q0]) + Math.abs(end[q0 + 1] - bare[q0 + 1]) + Math.abs(end[q0 + 2] - bare[q0 + 2]) >= 12) o.fireballPx++;

    /* ---------- 3. the clock ---------- */
    var fire = { kind: 'firemed', x: X, y: 1, z: Z, t: 0.3, big: 1.2, loops: 3 };
    var t0 = G.t;
    var f1 = frame([fire]), f2 = frame([fire]);
    G.t = t0 + 0.13;
    var f3 = frame([fire]);
    G.t = t0;
    o.still = diff(f1, f2);
    o.flicker = +diff(f1, f3).toFixed(3);

    /* ---------- 4. the smoke ---------- */
    var sm = frame([{ kind: 'smoke', x: X, y: 1, z: Z, t: 0.2, big: 1.4, loops: 4 }]), sy = 0, sn = 0;
    for (var q = 0; q < sm.length; q += 4) {
      if (Math.abs(sm[q] - bare[q]) + Math.abs(sm[q + 1] - bare[q + 1]) + Math.abs(sm[q + 2] - bare[q + 2]) < 12) continue;
      sy += CH - 1 - ((q >> 2) / CW | 0); sn++;
    }
    o.smokePx = sn;
    o.smokeRise = sn ? +(c.y - sy / sn).toFixed(1) : 0;

    /* ---------- 5. the roof ---------- */
    var wf = null;
    for (i = 0; i < G.ents.length; i++) if (G.ents[i].def === 'factory') { wf = G.ents[i]; break; }
    o.factory = !!wf;
    if (wf) {
      R.focus.x = wf.x; R.focus.z = wf.z; _rtsApplyCam();
      frame(null);
      var bareF = frame(null);
      var onRoof = { kind: 'firebig', x: wf.x, y: 1, z: wf.z, t: 0.3, big: 2.2, att: wf.id, loops: 4 };
      function seen(A) { var n = 0; for (var q2 = 0; q2 < A.length; q2 += 4) if (A[q2] - bareF[q2] > 40 && A[q2] > A[q2 + 2] + 60) n++; return n; }
      o.roofFire = seen(frame([onRoof]));
      window.RTS_FX_SPRITES = true;
      o.roofFireSprite = seen(frame([onRoof]));
      window.RTS_FX_SPRITES = false;
      R.focus.x = X; R.focus.z = Z; _rtsApplyCam();
    }

    /* ---------- 6. the glow ---------- */
    window.RTS_POST_ON = true;
    frame([{ kind: 'smoke', x: X, y: 1, z: Z, t: 0.2, big: 1.4, loops: 4 }]);
    o.glowSmoke = R3.bloomOn;
    frame([boom]);
    o.glowBoom = R3.bloomOn;

    /* ---------- 8. rounds in flight ----------
       A rocket between its launcher and its mark: drawn in the world at the height it flies, a
       flame at its head and its smoke laid back toward the launcher - so what changes on screen
       runs a trail's length along its flight, not a square's width. And a round from a rifle is
       a dash racing along its line, not the line (e2e/tracer holds the 2D painter to the same). */
    var shooter = { id: 91, x: X - 30, z: Z };
    /* against the bare frame, so drawn the way it was: without the light pass, whose grade
       moves every pixel on the screen (and a check that anything changed then passes on all) */
    window.RTS_POST_ON = false;
    G.fx.length = 0; G.proj.length = 0;
    G.proj.push({ kind: 'missile', x: X, y: 1.4, z: Z, vx: 34, vz: 0, speed: 34, from: shooter });
    _rtsRFrame(0);
    var rk = new Uint8Array(CW * CH * 4);
    gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, rk);
    G.proj.length = 0;
    var x0 = 1e9, x1 = -1e9, rn = 0;
    for (q = 0; q < rk.length; q += 4) {
      if (Math.abs(rk[q] - bare[q]) + Math.abs(rk[q + 1] - bare[q + 1]) + Math.abs(rk[q + 2] - bare[q + 2]) < 18) continue;
      var rx = (q >> 2) % CW; x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); rn++;
    }
    o.rocketPx = rn; o.rocketSpan = rn ? x1 - x0 : 0; o.trailPx = +(9 * zoom).toFixed(0);
    var tr = frame([{ kind: 'tracer', x: X - 22, y: 1.3, z: Z, x2: X + 22, y2: 1.3, z2: Z, t: 0.01 }]);
    x0 = 1e9; x1 = -1e9; rn = 0;
    for (q = 0; q < tr.length; q += 4) {
      if (Math.abs(tr[q] - bare[q]) + Math.abs(tr[q + 1] - bare[q + 1]) + Math.abs(tr[q + 2] - bare[q + 2]) < 18) continue;
      rx = (q >> 2) % CW; x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); rn++;
    }
    o.roundPx = rn; o.roundSpan = rn ? x1 - x0 : 0; o.flightPx = +(44 * zoom).toFixed(0);
    window.RTS_POST_ON = true;

    /* ---------- 9. dust ----------
       The same tank on the same loose ground, once with somewhere to go and once parked: what
       changes is its dust, and it lies behind it (render3d/fxwake3d.js). */
    var dz = null, dd = 1e9;
    for (var sz = 8; sz < RTS_N - 8; sz++) for (var sx2 = 8; sx2 < RTS_N - 8; sx2++) {
      var loose = true;
      for (var ea = -3; ea <= 3 && loose; ea++) for (var eb = -2; eb <= 2 && loose; eb++) {
        var tj = _rtsIdx(sx2 + ea, sz + eb), tk = G.terrain[tj];
        if ((tk !== RTS_T_SAND && tk !== RTS_T_ROAD) || G.blocked[tj]) loose = false;
      }
      var dist2 = Math.abs(sx2 - best[0]) + Math.abs(sz - best[1]);
      if (loose && dist2 < dd) { dd = dist2; dz = [sx2, sz]; }
    }
    o.dustAt = dz;
    if (dz) {
      window.RTS_POST_ON = false;
      var DX = _rtsWX(dz[0]), DZ = _rtsWX(dz[1]);
      R.focus.x = DX; R.focus.z = DZ; _rtsApplyCam();
      G.fx.length = 0; G.proj.length = 0;
      var tank = _rtsSpawnUnit('player', 'tank', DX, DZ);
      tank.rot = 0; tank.path = [{ x: DX + 60, z: DZ }]; tank.pi = 0;
      _rtsRFrame(0);
      var mv = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, mv);
      tank.path = null;
      _rtsRFrame(0);
      var pk = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, pk);
      tank.dead = true; G.ents = G.ents.filter(function (e) { return e !== tank; });
      var tp = _rtsGroundToScreen(DX, DZ), dn = 0, dxs = 0;
      for (q = 0; q < mv.length; q += 4) {
        if (Math.abs(mv[q] - pk[q]) + Math.abs(mv[q + 1] - pk[q + 1]) + Math.abs(mv[q + 2] - pk[q + 2]) < 8) continue;
        dn++; dxs += (q >> 2) % CW;
      }
      o.dustPx = dn; o.dustBehind = dn ? +(tp.x * R.dpr - dxs / dn).toFixed(1) : 0;
      window.RTS_POST_ON = true;
      R.focus.x = X; R.focus.z = Z; _rtsApplyCam();
    }

    /* ---------- 7. the draws ---------- */
    gl.getError();
    var kinds = ['boom', 'pop', 'hit', 'piff', 'splash', 'smoke', 'firebig', 'firemed', 'firesmall'], errs = [];
    [false, true].forEach(function (post) {
      window.RTS_POST_ON = post;
      [false, true].forEach(function (spr) {
        window.RTS_FX_SPRITES = spr;
        kinds.forEach(function (k, n) {
          frame([{ kind: k, x: X + (n - 4) * 3, y: 1, z: Z, t: RTS_ANIMS[k].dur * 0.4, big: 1.2, loops: 2 }]);
          var e = gl.getError();
          if (e) errs.push(k + (spr ? ' sprite' : '') + (post ? ' post' : '') + ': ' + e);
        });
      });
    });
    window.RTS_FX_SPRITES = false; window.RTS_POST_ON = true;
    o.glErrs = errs;
    o.quadsPer = +(R3.fxQuads || 0);
    G.fx.length = 0;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.grassAt) {
    S.ok('open grass is found to set things off on', !!out.grassAt, String(out.grassAt));
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }

  var B = out.band, B0 = out.bandBare, BS = out.bandSprite;
  function lum(c) { return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114; }
  S.ok('a blast lights the ground round it, outside its fireball', lum(B) > lum(B0) + 15,
       'luma ' + lum(B0).toFixed(1) + ' -> ' + lum(B).toFixed(1) + ' over ' + out.bandN + ' samples, 2.3 to 3.3 radii out');
  S.ok('...which a sprite could not do', Math.abs(lum(BS) - lum(B0)) < 3,
       'with the sprite quads the same ground reads ' + lum(BS).toFixed(1));
  S.ok('...and it lights the grass rather than painting it: still green, just brighter',
       B[1] >= B[0] && B[1] > B0[1],
       'rgb ' + B0 + ' -> ' + B);

  S.ok('a fireball is still on screen at the end of its record', out.fireballPx > 1500, out.fireballPx + ' pixels');
  S.ok('...and the fire it becomes carries its billows on, with no jump between the two',
       out.jump < out.jumpControl * 0.35,
       'the picture moves ' + out.jump + ' across the chain, against ' + out.jumpControl + ' into a fire that did not grow out of it');

  S.eq('a paused game is a still frame: the same state draws the same picture', out.still, 0);
  S.ok('...and a fire flickers on the game clock', out.flicker > 0.05, 'mean change ' + out.flicker + ' over 0.13s');

  S.ok('a smoke column stands above what is burning', out.smokePx > 200 && out.smokeRise > 15,
       out.smokePx + ' pixels, centred ' + out.smokeRise + 'px above its source');

  S.ok('a war factory was found to set alight', out.factory, String(out.factory));
  if (out.factory) {
    S.ok('a fire on a building burns on its roof, in plain sight', out.roofFire > 400 && out.roofFire > out.roofFireSprite * 1.5,
         out.roofFire + ' pixels of flame, against ' + out.roofFireSprite + ' for the sprite at the building\'s feet');
  }

  S.ok('the bloom has a glow to blur when something is alight', out.glowBoom === true, String(out.glowBoom));
  S.ok('...and none from smoke, which gives off no light', out.glowSmoke === false, String(out.glowSmoke));

  S.ok('a rocket in flight is drawn in the world, its smoke laid back toward its launcher',
       out.rocketPx > 150 && out.rocketPx < 20000 && out.rocketSpan > out.trailPx * 0.7,
       out.rocketPx + ' pixels spanning ' + out.rocketSpan + 'px along its flight, against a ' + out.trailPx + 'px trail');
  S.ok('...and a rifle round is a dash racing along its line, not the line',
       out.roundPx > 20 && out.roundPx < 5000 && out.roundSpan < out.flightPx * 0.5,
       out.roundPx + ' pixels spanning ' + out.roundSpan + 'px of a ' + out.flightPx + 'px flight');
  S.ok('loose ground is found to drive a tank over', !!out.dustAt, String(out.dustAt));
  if (out.dustAt) {
    S.ok('...and a tank on the move raises dust that a parked one does not, behind it',
         out.dustPx > 300 && out.dustBehind > 10,
         out.dustPx + ' pixels of dust, centred ' + out.dustBehind + 'px behind the tank');
  }
  S.eq('no draw is refused, for any kind, in either path, with or without the post buffer', out.glErrs.join('; '), '');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
