/* THE SUN SEES THE MAP, AND EVERYTHING SHADES EVERYTHING.

   This is the third shadow system in the 3D mode and the first that is one. The first was a
   BLOB DISC per unit - a flat circle sized off its collision radius, which grounds a mesh and
   says nothing else. The second squashed each entity's own mesh onto the ground along the
   light, which is tank-shaped and turns with the hull, and still could not put shade anywhere
   but on the plane: a forest stood on ground as bright as the clearing beside it, a ridge threw
   nothing across the grass, and no building shaded its own courtyard.

   A shadow MAP has no such limit. Render the scene from the sun, keep the distance to the
   nearest surface it can see in every direction, and anything further from the sun than that
   is in shade - whatever it is standing on and whatever is standing on it. Measured against
   the pass it replaces: the planar shadows moved 2,714 pixels of a base view, this moves
   67,739 of the same one.

   WHAT FAILS, AND HOW EACH FAILURE LOOKS:

   - THE WORLD STOPS CASTING. Trees and rock are the map's own geometry, drawn from per-chunk
     buffers rather than from the entity walk, and it is entirely possible to wire the entity
     half of the pass and forget them. Graded with every entity removed, at the edge of a
     forest, where every shadow in the frame must therefore come from the world.

   - THE ENTITIES STOP CASTING, silently. This one has already happened once: paintEntities
     reads ART2W, which was assigned further down _r3dFrame than the sun's pass runs, so every
     entity went into the shadow map with an undefined scale - a NaN that drops the geometry
     without raising anything anywhere. The frame looked almost right, because the world still
     cast. Graded on a lone aircraft, high up, where a building's shadow would hide under its
     own footprint and prove nothing.

   - THE DIRECTION GOES BACK TO THE SHADING LIGHT'S. R3_LIGHT is the sprite baker's and sits 22
     degrees off the camera axis, so its shadows fall behind the things casting them - measured,
     within 2% of the object's own top. The sun's basis is built from the z-flipped light for
     that reason, and the assertion is a SIGN: down the screen and to the right.

   - IT ACNES. A lit surface samples its own depth, half the texels come back "further", and
     the whole map stipples. Graded on an empty map with nothing to cast at all, where any
     shaded pixel is the ground shadowing itself. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('shadows');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    rts3dToggle();
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    o.ready = !!R3.shadowReady;
    o.size = R3D_SHADOW_SIZE;

    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    gl.bindTexture(gl.TEXTURE_2D, R3.shadowTex);
    o.mag = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER);
    o.NEAREST = gl.NEAREST;

    /* ANYTHING THAT MOVES IN THE MAIN PASS HAS TO MOVE IN THE SUN'S. The sea's swell is a
       vertex displacement, and if the two shaders ever disagree about it the water's shadow
       stands still while the water rolls under it.

       This used to hold nine constants of its own and check that both sources mentioned all
       nine - which is the spec keeping a third copy of the very thing whose copies are the
       hazard, and would pass on two shaders that used the same numbers differently. The waves
       are one table now (render3d/wave3d.js) and both programs SPLICE the emitted GLSL, so
       the honest claim is that neither carries its own: the shared block appears verbatim in
       each compiled source, and the phase lines and the height sum inside the main pass's
       block are character-for-character the sun's. */
    o.waveN = R3D_WAVE.length;
    o.spliced = (R3D_SHADOW_VS.indexOf(R3D_WAVE_VGLSL) >= 0 ? 1 : 0) +
                (R3D_MESH_VS.indexOf(R3D_WAVE_VGLSL_LIT) >= 0 ? 1 : 0);
    function stmt(src, head) {
      var a = src.indexOf(head);
      return a < 0 ? null : src.slice(a, src.indexOf(';', a));
    }
    o.qShared = 0;
    for (var wi = 0; wi < R3D_WAVE.length; wi++) {
      var q1 = stmt(R3D_WAVE_VGLSL, 'float q' + wi + ' =');
      var q2 = stmt(R3D_WAVE_VGLSL_LIT, 'float q' + wi + ' =');
      if (q1 && q1 === q2) o.qShared++;
    }
    /* the sun's pass adds the sum straight into wp.y; the main pass keeps it in `hs` because
       the tone reads it again, so the two are compared as expressions rather than as lines */
    var sunSum = stmt(R3D_WAVE_VGLSL, 'wp.y += uWave.x * (');
    var litSum = stmt(R3D_WAVE_VGLSL_LIT, 'float hs =');
    o.sumSun = sunSum ? sunSum.slice(sunSum.indexOf('(') + 1, sunSum.lastIndexOf(')')) : 'a';
    o.sumLit = litSum ? litSum.slice(litSum.indexOf('=') + 1).trim() : 'b';

    function shot() {
      _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* R3.shadowReady gates both halves at once - the sun's pass does not run and the shading
       programs are told to skip the lookup - and changes nothing else about the frame. */
    function withAndWithout() {
      var A = shot();
      var keep = R3.shadowReady;
      R3.shadowReady = false;
      var B = shot();
      R3.shadowReady = keep;
      return { on: A, off: B };
    }
    function shaded(d) {
      var A = d.on, B = d.off, n = 0, sx = 0, sy = 0, tot = 0;
      for (var p = 0; p < A.length; p += 4) {
        tot++;
        if ((B[p] - A[p]) + (B[p + 1] - A[p + 1]) + (B[p + 2] - A[p + 2]) <= 8) continue;
        sx += (p >> 2) % CW; sy += (p >> 2) / CW | 0; n++;
      }
      return { px: n, pct: +(n / tot * 100).toFixed(1),
               cx: n ? (sx / n) / R.dpr : 0, cy: n ? (CH - 1 - sy / n) / R.dpr : 0 };
    }

    /* ---------- 1. the WORLD casts, with no entity anywhere ---------- */
    var best = null, bs = 0;
    for (var tz = 6; tz < RTS_N - 6; tz += 2) {
      for (var tx = 6; tx < RTS_N - 6; tx += 2) {
        var s = 0;
        for (var dz = -3; dz <= 3; dz++) {
          for (var dx = -3; dx <= 3; dx++) {
            if (G.terrain[_rtsIdx(tx + dx, tz + dz)] === RTS_T_TREE) s++;
          }
        }
        if (s > bs) { bs = s; best = [tx, tz]; }
      }
    }
    o.woodAt = best; o.woodDensity = bs;
    /* looked up BEFORE the entity list is emptied - _rtsHas walks it */
    var yard = _rtsHas('player', 'yard');
    var keepEnts = G.ents;
    G.ents = [];
    R.focus.x = _rtsWX(best[0] + 4); R.focus.z = _rtsWX(best[1] + 4);
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    _rtsRFrame(1 / 60);
    o.world = shaded(withAndWithout());

    /* ---------- 2. acne: an empty map shadows nothing ---------- */
    var keepWorld = R3.world, keepOre = R3.oreMesh, keepWater = R3.waterMesh;
    R3.world = []; R3.oreMesh = null; R3.waterMesh = null; R3.worldG = G;
    R.focus.x = yard.x; R.focus.z = yard.z; _rtsApplyCam();
    o.acne = shaded(withAndWithout());

    /* ---------- 3. every ENTITY casts, and down-right ---------- */
    /* A lone aircraft, high up. A building's shadow lands under its own footprint at this sun
       angle and proves nothing about whether it was drawn into the map at all. */
    var spot = _rtsNearestOpen(yard.tx + 3, yard.tz + 3, 12, null);
    var heli = spot ? _rtsSpawnUnit('player', 'heli', _rtsWX(spot[0]), _rtsWX(spot[1])) : null;
    o.flew = !!heli;
    if (heli) {
      heli.air = 1; heli.alt = 40; heli.rearming = 0;
      R.focus.x = heli.x; R.focus.z = heli.z; _rtsApplyCam();
      G.ents = [heli];
      var d3 = withAndWithout();
      var sh = shaded(d3);
      o.heliShadow = sh;
      /* the aircraft's own drawn centroid, from the unshadowed frame against an empty one */
      G.ents = [];
      var bare = shot();
      G.ents = [heli];
      var mx = 0, my = 0, mn = 0;
      for (var q = 0; q < d3.off.length; q += 4) {
        if (Math.abs(d3.off[q] - bare[q]) + Math.abs(d3.off[q + 1] - bare[q + 1]) +
            Math.abs(d3.off[q + 2] - bare[q + 2]) <= 8) continue;
        mx += (q >> 2) % CW; my += (q >> 2) / CW | 0; mn++;
      }
      o.heliSelf = mn ? { x: +((mx / mn) / R.dpr).toFixed(1),
                          y: +((CH - 1 - my / mn) / R.dpr).toFixed(1) } : null;
      if (o.heliSelf && sh.px) {
        o.dx = +(sh.cx - o.heliSelf.x).toFixed(1);
        o.dy = +(sh.cy - o.heliSelf.y).toFixed(1);
      }
    }
    R3.world = keepWorld; R3.oreMesh = keepOre; R3.waterMesh = keepWater;
    G.ents = keepEnts;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }

  S.ok('the sun has a depth map to draw into', out.ready && out.size >= 1024,
       out.size + ' square');

  /* Two channels of an RGBA8 target hold one number. Filtering them averages the high byte
     with its neighbour's and the low byte with its neighbour's SEPARATELY, which is not the
     average of the two depths and is not any depth at all. */
  S.ok('...sampled NEAREST, because its two channels are one packed number',
       out.mag === out.NEAREST,
       out.mag === out.NEAREST ? 'NEAREST' : 'LINEAR - which averages a high byte against a ' +
       'low byte and returns a depth that was never written');

  S.ok('the two passes displace the sea by the same wave',
       out.spliced === 2 && out.qShared === out.waveN && out.sumSun === out.sumLit,
       (out.spliced === 2 ? 'both shaders splice the one wave block' : 'a shader has its own ' +
        'copy of the swell (' + out.spliced + ' of 2 splice the shared one)') + ', ' +
       out.qShared + ' of ' + out.waveN + ' phase lines are character-for-character the same, ' +
       'and the height sum is "' + out.sumSun + '" on both sides' +
       ' - drift here leaves the water\'s shadow standing still while the water rolls under ' +
       'it. Held as nine constants copied into this spec before, which would pass on two ' +
       'shaders that used the same numbers differently');

  S.ok('the map has a wood to look at', out.woodDensity > 20,
       out.woodDensity + ' of 49 cells around ' + out.woodAt + ' are forest');

  /* The capability the planar pass never had: this frame contains no entity at all, so every
     shadow in it was cast by the map's own geometry. */
  S.ok('the world shades itself and the ground under it',
       out.world.pct > 12,
       out.world.pct + '% of a forest-edge frame changes when the sun\'s pass is suppressed, ' +
       'with every entity removed - the planar shadows that preceded this drew entities only, ' +
       'so the same measurement on them is exactly 0');

  /* Acne: nothing on the map, so nothing may be in shade. */
  S.ok('...and bare ground does not shadow itself', out.acne.pct < 0.5,
       out.acne.pct + '% of an empty map is shaded (' + out.acne.px + ' pixels) - a lit ' +
       'surface sampling its own depth is what stipples a shadow map');

  S.ok('an air unit was put up to check', out.flew, out.flew ? 'flying' : 'no air unit');
  if (out.flew) {
    /* The regression that has already happened once, and left no error anywhere. */
    S.ok('entities are drawn into the map at all',
         out.heliShadow && out.heliShadow.px > 100,
         (out.heliShadow ? out.heliShadow.px : 0) + ' pixels shaded by a lone aircraft - ' +
         'paintEntities reads ART2W, which used to be assigned further down the frame than ' +
         'the sun\'s pass runs, so every entity went in at an undefined scale and vanished');

    S.ok('...and the shadow falls down the screen and to the right',
         out.dx > 20 && out.dy > 20,
         'the shadow sits ' + out.dx + 'px right and ' + out.dy + 'px below the aircraft - ' +
         'with the shading light\'s own direction both of these go the other way, and the ' +
         'shadow hides behind the thing casting it');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
