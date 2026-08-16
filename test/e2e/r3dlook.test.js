/* HOW THE 3D MODE LOOKS, as opposed to whether it works.

   r3dlive covers the seams that would make the mode WRONG - the projection contract, the blit.
   This covers the three things that made it look worse than the 2D mode it is supposed to
   improve on, each of which is a property of the picture rather than of the geometry.

   THE GROUND'S MAGNIFICATION FILTER. The ground texture is the 2D renderer's own baked terrain
   canvas, and the 2D renderer draws it with imageSmoothingEnabled = false, deliberately and at
   length: art at 24 art pixels a cell magnified to 144 device pixels has to land on hard pixel
   blocks, because the alternative is not more detail, it is the same detail smeared. The GL
   side shared one texture-parameter helper between the ground and the fog and got LINEAR for
   both, so at max zoom - about six times magnification - every baked pixel became a six-pixel
   gradient. The two textures want OPPOSITE filters and the spec pins both: NEAREST magnifies
   the ground, LINEAR still magnifies the fog, whose whole job is to be a soft boundary.
   Minification stays LINEAR on both, because NEAREST there drops texels and shimmers on pan.

   THE CAST SHADOWS. Drawn through the mesh program, which had no alpha, so a shadow was
   opaque - it did not darken the ground, it replaced it, and read as a hole cut in the map
   rather than as shade. Asserted as a property of the picture: under a shadow the ground must
   still be VARIED, because a hole is one flat colour and shade over textured ground is not.
   (What casts has been through three forms since - a blob disc, the entity's own mesh squashed
   flat, and now a shadow map, see e2e/shadows - but this claim is about the BLEND, not about
   what is casting, and it holds for whatever is.)

   THE SAVED MODE. A player who picks 3D picks it for the game. It survives a fresh rtsOpen. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('r3dlook');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 420, height: 760, dpr: 2 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, R = _rtsR;

    /* --- the filters, read back off the live textures --- */
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    R.zi = RTS_ZOOMS.length - 1; R.cell = RTS_ZOOMS[R.zi];
    var yard = _rtsHas('player', 'yard');
    /* put units under the camera on ground proven open - a base at rest may have none in
       view, and the shadow measurement below would then be reporting a harness fault */
    var made = 0;
    for (var sp2 = 0; sp2 < 3; sp2++) {
      var sp = _rtsNearestOpen(yard.tx + 2 + sp2, yard.tz + 7, 10, null);
      if (sp && _rtsSpawnUnit('player', 'tank', _rtsWX(sp[0]), _rtsWX(sp[1]))) made++;
    }
    o.spawned = made;
    R.focus.x = _rtsWX(yard.tx + 3); R.focus.z = _rtsWX(yard.tz + 7);
    for (var t = 0; t < 40; t++) _rtsTick(1 / 60);
    _rtsRFrame(1 / 60);

    var gl = R3.gl;
    function filters(tex) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      return { mag: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER),
               min: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER) };
    }
    var gf = filters(R3.terrainTex), ff = filters(R3.fogTex);
    o.NEAREST = gl.NEAREST; o.LINEAR = gl.LINEAR;
    o.groundMag = gf.mag; o.groundMin = gf.min;
    o.fogMag = ff.mag; o.fogMin = ff.min;

    /* --- the shadows: shade over ground, not a hole in it ---

       Rather than guess where a disc lands, the spec finds it: render once with the shadow
       mesh and once with it suppressed (draw() no-ops on a null mesh), and the pixels that
       DIFFER are exactly the shadow footprint. Then the property is measured over that
       footprint in both frames.

       The metric is the spread, not the mean. An opaque disc paints one flat colour, so the
       standard deviation over its footprint collapses to zero however dark it is; a blend
       leaves (1 - alpha) of whatever the ground was doing, so the spread survives roughly in
       proportion. Mean brightness is checked too, because a "shadow" that darkens nothing
       would also preserve the spread perfectly. */
    var cv = document.getElementById('rtsCv'), ctx = cv.getContext('2d');
    function grab() { return ctx.getImageData(0, 0, cv.width, cv.height).data; }
    var withS = grab();
    /* SUPPRESSED BY R3.shadowReady, which gates both halves of the shadow map at once - the
       sun's pass does not run and the shading programs are told to skip the lookup - and
       changes nothing else about the frame. (This has been through two earlier forms: a
       zero-vertex stand-in for the blob-disc mesh, then the planar pass's alpha. Both of those
       shadow systems are gone; the map subsumed them.) */
    var keep = R3.shadowReady;
    R3.shadowReady = false;
    _rtsRFrame(1 / 60);
    var noS = grab();
    R3.shadowReady = keep;
    _rtsRFrame(1 / 60);

    var lum = function (d, p) { return 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]; };
    var W = cv.width, H = cv.height;
    var mask = new Uint8Array(W * H);
    var changed = 0;
    for (var q = 0; q < withS.length; q += 4) {
      if (Math.abs(withS[q] - noS[q]) + Math.abs(withS[q + 1] - noS[q + 1]) +
          Math.abs(withS[q + 2] - noS[q + 2]) > 6) { mask[q >> 2] = 1; changed++; }
    }
    /* ERODE THE EDGE AWAY BEFORE MEASURING. The canvas is multisampled, so the rim of a disc
       is a ramp between shaded and bare ground - and on a disc this small the rim is a large
       share of it. Measured over the raw footprint an OPAQUE disc scored a HIGHER spread than
       bare ground (ratio 1.16), because the rim alone runs the full 21-to-81 range: the metric
       was reading antialiasing, not shading. Only interior pixels - those whose eight
       neighbours are all inside the footprint - say what the disc does to the ground under it. */
    var idxs = [];
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var m = y * W + x;
        if (!mask[m]) continue;
        if (mask[m - 1] && mask[m + 1] && mask[m - W] && mask[m + W] &&
            mask[m - W - 1] && mask[m - W + 1] && mask[m + W - 1] && mask[m + W + 1]) {
          idxs.push(m << 2);
        }
      }
    }
    o.changed = changed;
    o.footprint = idxs.length;
    if (idxs.length > 40) {
      var mA = 0, mB = 0, j;
      for (j = 0; j < idxs.length; j++) { mA += lum(withS, idxs[j]); mB += lum(noS, idxs[j]); }
      mA /= idxs.length; mB /= idxs.length;
      var vA = 0, vB = 0;
      for (j = 0; j < idxs.length; j++) {
        vA += Math.pow(lum(withS, idxs[j]) - mA, 2);
        vB += Math.pow(lum(noS, idxs[j]) - mB, 2);
      }
      o.meanShaded = +mA.toFixed(1); o.meanBare = +mB.toFixed(1);
      o.sdShaded = +Math.sqrt(vA / idxs.length).toFixed(2);
      o.sdBare = +Math.sqrt(vB / idxs.length).toFixed(2);
      o.sdRatio = o.sdBare > 0.5 ? +(o.sdShaded / o.sdBare).toFixed(3) : -1;
    }

    /* --- the shader is the baker's shading, not a second copy of it ---

       gl3d.js and r3d/render.js light the same models for two different outputs, and the only
       thing keeping them agreeing is that the shader reads its constants from the baker rather
       than repeating them. It used to repeat them, and had drifted: its own 0.40/0.74 ambient
       and diffuse against the baker's 0.34/0.70, no specular and no sky term at all. This
       asserts the mechanism that stops it drifting again - the numbers in the compiled shader
       source ARE R3_AMB, R3_DIF, R3_LIGHT and the baker's half-vector - rather than asserting
       any particular value, which would just be the drift written down twice more.

       BOTH STAGES, because which one does the shading is an implementation detail and has
       already changed once: it moved to the fragment shader so that a curve could be lit
       across a face rather than at its corners. What must not change is that the numbers come
       from the baker, and that is true wherever they are evaluated. */
    var vs = R3D_MESH_VS + R3D_MESH_FS;
    o.hasAmb = vs.indexOf(R3_AMB.toFixed(4)) >= 0;
    o.hasDif = vs.indexOf(R3_DIF.toFixed(4)) >= 0;
    o.hasLight = vs.indexOf(R3_LIGHT[0].toFixed(6)) >= 0;
    var half = (function () {
      var h = [R3_LIGHT[0] + R3_VIEW[0], R3_LIGHT[1] + R3_VIEW[1], R3_LIGHT[2] + R3_VIEW[2]];
      var m = Math.hypot(h[0], h[1], h[2]);
      return [h[0] / m, h[1] / m, h[2] / m];
    })();
    o.hasHalf = vs.indexOf(half[0].toFixed(6)) >= 0;
    o.hasSky = vs.indexOf('sky') >= 0;
    o.strayLiterals = (vs.indexOf('0.40 + 0.74') >= 0) || (vs.indexOf('-0.38, 0.76, 0.53') >= 0);

    /* --- the preference survives a fresh match --- */
    o.stored = null;
    try { o.stored = window.localStorage.getItem('rcc.mode3d'); } catch (e) {}
    /* close and reopen the battle exactly as the UI would */
    var host = document.getElementById('rcgRts');
    if (host) host.remove();
    window._rtsUI = null;
    if (window._R3D) window._R3D.on = false;
    rtsOpen(4242);
    o.reopened = !!(window._R3D && window._R3D.on);
    o.btnOn = !!(document.getElementById('rts3dBtn') || {}).classList &&
              document.getElementById('rts3dBtn').classList.contains('on');
    return o;
  });

  S.ok('the mode turns on', out.on, out.on ? 'on' : 'no WebGL');
  if (out.on) {
    S.ok('the ground magnifies with NEAREST, like the 2D renderer draws it',
         out.groundMag === out.NEAREST,
         'MAG=' + (out.groundMag === out.NEAREST ? 'NEAREST' : 'LINEAR') +
         ' - LINEAR turned every baked pixel into a six-pixel gradient at max zoom');
    S.ok('...and minifies with LINEAR, so panning does not shimmer',
         out.groundMin === out.LINEAR, 'MIN=' + (out.groundMin === out.LINEAR ? 'LINEAR' : 'NEAREST'));
    S.ok('the fog still magnifies with LINEAR - its job is to be a soft edge',
         out.fogMag === out.LINEAR, 'MAG=' + (out.fogMag === out.LINEAR ? 'LINEAR' : 'NEAREST'));

    S.ok('the cast shadows cover real ground to measure', out.footprint > 40,
         out.changed + ' pixels change when the shadow mesh is suppressed, ' + out.footprint +
         ' of them interior once the multisampled rim is eroded off');
    if (out.footprint > 40) {
      S.ok('a cast shadow darkens the ground', out.meanShaded < out.meanBare - 4,
           'mean luminance ' + out.meanBare + ' -> ' + out.meanShaded + ' under the shadows');
      S.ok('...without replacing it - the ground keeps its detail through the shade',
           out.sdRatio > 0.4,
           'spread over the footprint ' + out.sdBare + ' -> ' + out.sdShaded +
           ' (ratio ' + out.sdRatio + '; an opaque disc is one flat colour, ratio 0)');
    }

    S.ok('the shader takes its light from the sprite baker rather than repeating it',
         out.hasAmb && out.hasDif && out.hasLight,
         'ambient/diffuse/light constants of r3d/primitives.js found in the compiled shader');
    S.ok('...including the specular half-vector and the sky bounce the baker uses',
         out.hasHalf && out.hasSky,
         'half-vector ' + (out.hasHalf ? 'present' : 'MISSING') +
         ', sky term ' + (out.hasSky ? 'present' : 'MISSING'));
    S.ok('...and carries no hand-copied light of its own to drift', !out.strayLiterals,
         out.strayLiterals ? 'found the old inline constants' : 'no duplicated constants');

    S.ok('the chosen mode is remembered', out.stored === '1', 'stored ' + JSON.stringify(out.stored));
    S.ok('...and a fresh battle opens in it', out.reopened,
         out.reopened ? '3D restored on rtsOpen' : 'dropped back to 2D');
    S.ok('...with the button showing it', out.btnOn, out.btnOn ? 'lit' : 'not lit');
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
