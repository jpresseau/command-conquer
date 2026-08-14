/* WHAT CASTS A SHADOW, WHERE IT FALLS, AND WHY IT IS NOT BLACK.

   The 3D mode's shadows were BLOB DISCS: one flat circle per unit, sized off its collision
   radius. That grounds a mesh and says nothing else - every unit had the same round shadow
   whatever its shape, buildings had none at all, and an aircraft's disc sat directly under it
   as though it were parked. Under a camera that now has perspective, a round smudge under a
   tank is the last thing in the frame still pretending to be 2D.

   They are the entity's own mesh now, squashed onto the ground along the light. Three things
   have to be true of that, and each of them fails in a different way:

   THE DIRECTION HAD TO STOP BEING THE SHADING LIGHT'S. R3_LIGHT is the sprite baker's, chosen
   to light the face the camera sees most - upper-left and IN FRONT - which puts it 22 degrees
   off the camera's own axis. Its true shadow of a point at height h lands at screen dy -0.568h
   while the object's own top lands at -0.581h: a shadow hidden behind the object casting it,
   to within 2%, everywhere on screen and at every zoom. Flipping the light's z throws it down
   and to the right instead, which is where _sprShadow already puts the 2D game's. This spec
   pins the geometry rather than the constants - it flies a helicopter and measures where its
   shadow lands relative to it, which is a number only the real projection can produce.

   THE STENCIL IS THE DIFFERENCE BETWEEN A SHADOW AND A BLOT. A planar shadow puts every face
   of a model on the same patch of ground, so a six-sided box blends six times over. Measured
   both ways on the same frame: with the stencil, 89% of shadow pixels sit at exactly the
   single-blend alpha and NONE are darker than it; without it, 92% are over-blended and the
   commonest level is 0.99 - a black silhouette with all the shape lost inside it. The
   assertion is the share of over-blended pixels, because that is the number that separates
   them by a factor of a hundred.

   AND IT HAS TO DARKEN THE GROUND RATHER THAN REPLACE IT, which e2e/r3dlook already grades as
   a property of the picture and is not repeated here.

   HOW THE PASS IS SUPPRESSED FOR MEASUREMENT: R3D_SHADOW_A, its alpha. Zero makes the pass a
   no-op without changing a single other thing about the frame - not the draw order, not the
   depth buffer, not what geometry is submitted - so the difference between the two frames is
   the shadows and nothing else. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('shadows');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650, dpr: 1 });
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
    o.stencilBits = R3.gl.getParameter(R3.gl.STENCIL_BITS);
    o.sx = +R3D_SHADOW_SX.toFixed(4);
    o.sz = +R3D_SHADOW_SZ.toFixed(4);
    o.alpha = R3D_SHADOW_A;

    var yard = _rtsHas('player', 'yard');
    R.focus.x = yard.x; R.focus.z = yard.z;
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();

    /* Build the world once, then take it out of the frame. Trees and tufts do not cast (a
       million triangles drawn twice is the one thing that would not fit the budget) but they
       DO stand in front of shadows and change pixels for their own reasons, and every
       measurement below is a difference between two frames. */
    _rtsRFrame(1 / 60);
    R3.world = []; R3.oreMesh = null; R3.worldG = G;

    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* The frame with shadows and the frame without, and what the pass did between them. */
    function shadowDiff() {
      var A = shot();
      var keep = window.R3D_SHADOW_A;
      window.R3D_SHADOW_A = 0;
      var B = shot();
      window.R3D_SHADOW_A = keep;
      return { on: A, off: B };
    }
    /* every pixel the pass darkened, its blend ratio against the ground it fell on, and the
       centroid of the lot */
    function analyse(d) {
      var A = d.on, B = d.off, ratios = {}, n = 0, sx = 0, sy = 0;
      for (var p = 0; p < A.length; p += 4) {
        var delta = (B[p] - A[p]) + (B[p + 1] - A[p + 1]) + (B[p + 2] - A[p + 2]);
        if (delta <= 6) continue;
        var sum = B[p] + B[p + 1] + B[p + 2];
        if (sum < 40) continue;                       /* nothing to darken - skip near-black */
        var r = Math.round((1 - (A[p] + A[p + 1] + A[p + 2]) / sum) * 100) / 100;
        ratios[r] = (ratios[r] || 0) + 1;
        var px = (p >> 2) % CW, py = (p >> 2) / CW | 0;
        sx += px; sy += py; n++;
      }
      if (!n) return { px: 0 };
      var keys = Object.keys(ratios).map(Number);
      keys.sort(function (a, b) { return ratios[b] - ratios[a]; });
      var over = 0;
      keys.forEach(function (k) { if (k > window.R3D_SHADOW_A + 0.08) over += ratios[k]; });
      return {
        px: n, mode: keys[0],
        dominant: +(ratios[keys[0]] / n * 100).toFixed(1),
        over: +(over / n * 100).toFixed(1),
        /* readPixels is bottom-up; hand back CSS pixels the projection can be compared to */
        cx: (sx / n) / R.dpr, cy: (CH - 1 - sy / n) / R.dpr
      };
    }

    /* ---------- 1. a BUILDING casts, which a units-only disc never did ---------- */
    var keepEnts = G.ents;
    G.ents = [yard];
    o.building = analyse(shadowDiff());

    /* WHERE THE SHADOW SITS RELATIVE TO THE THING CASTING IT, which is the whole reason the
       shadow light is not the shading light. Height lifts a model UP the screen, so a shadow
       thrown up the screen lands behind the model's own body and is not a shadow anyone sees.
       Measured against the model's own drawn centroid rather than against a constant: take the
       frame with the yard and shadows off, take the frame with nothing on the map at all, and
       the pixels between them are the building. */
    var withB = shot();
    G.ents = [];
    var noB = shot();
    G.ents = [yard];
    var mx = 0, my = 0, mn = 0;
    for (var mp = 0; mp < withB.length; mp += 4) {
      if (Math.abs(withB[mp] - noB[mp]) + Math.abs(withB[mp + 1] - noB[mp + 1]) +
          Math.abs(withB[mp + 2] - noB[mp + 2]) <= 8) continue;
      mx += (mp >> 2) % CW; my += (mp >> 2) / CW | 0; mn++;
    }
    o.model = mn ? { x: +((mx / mn) / R.dpr).toFixed(1),
                     y: +((CH - 1 - my / mn) / R.dpr).toFixed(1), px: mn } : null;
    o.dropY = (o.model && o.building.px)
      ? +(o.building.cy - o.model.y).toFixed(1) : 0;

    /* ---------- 2. the stencil: one blend per pixel ---------- */
    o.stencilOn = { dominant: o.building.dominant, over: o.building.over, mode: o.building.mode };
    R3.stencil = false;
    var bad = analyse(shadowDiff());
    R3.stencil = o.stencilBits > 0;
    o.stencilOff = { dominant: bad.dominant, over: bad.over, mode: bad.mode };

    /* ---------- 3. a flying unit's shadow is displaced BY ITS ALTITUDE ---------- */
    G.ents = keepEnts;
    var heli = null;
    var spot = _rtsNearestOpen(yard.tx + 4, yard.tz + 4, 12, null);
    if (spot) heli = _rtsSpawnUnit('player', 'heli', _rtsWX(spot[0]), _rtsWX(spot[1]));
    if (!heli) {
      /* whatever this side's air unit is called, take the first that flies */
      var keys2 = Object.keys(RTS_UNITS || {});
      for (i = 0; i < keys2.length && !heli; i++) {
        var ud = rtsUnitDef(keys2[i]);
        if (ud && (ud.air || ud.kind === 'air') && spot) {
          heli = _rtsSpawnUnit('player', keys2[i], _rtsWX(spot[0]), _rtsWX(spot[1]));
        }
      }
    }
    o.flew = !!heli;
    if (heli) {
      heli.air = 1; heli.alt = 12; heli.rearming = 0;
      R.focus.x = heli.x; R.focus.z = heli.z;
      G.ents = [heli];
      var hy = (heli.alt || 12) * 0.35;               /* the frame's own altitude scaling */
      var d3 = analyse(shadowDiff());
      o.heli = d3;
      /* where the unit is, and where the documented projection says its shadow goes */
      var self = _rtsWorldToScreen(heli.x, hy, heli.z);
      var cast = _rtsGroundToScreen(heli.x + hy * R3D_SHADOW_SX, heli.z + hy * R3D_SHADOW_SZ);
      o.heliSelf = { x: +self.x.toFixed(1), y: +self.y.toFixed(1) };
      o.heliCast = { x: +cast.x.toFixed(1), y: +cast.y.toFixed(1) };
      o.heliMeasured = { x: +d3.cx.toFixed(1), y: +d3.cy.toFixed(1) };
      o.castErr = d3.px ? +Math.hypot(d3.cx - cast.x, d3.cy - cast.y).toFixed(1) : -1;
      o.selfErr = d3.px ? +Math.hypot(d3.cx - self.x, d3.cy - self.y).toFixed(1) : -1;
      G.ents = keepEnts;
    }

    /* ---------- 4. the shadow has the SHAPE of the thing casting it ---------- */
    /* A disc is a disc whichever way the tank points. A real silhouette is not: turning the
       hull a quarter turn has to change the outline the shadow makes on the ground. */
    var tank = null, tspot = _rtsNearestOpen(yard.tx + 6, yard.tz + 2, 12, null);
    if (tspot) tank = _rtsSpawnUnit('player', 'tank', _rtsWX(tspot[0]), _rtsWX(tspot[1]));
    o.hasTank = !!tank;
    if (tank) {
      R.focus.x = tank.x; R.focus.z = tank.z;
      G.ents = [tank];
      function silhouette(rot) {
        tank.rot = rot; tank.turret = rot;
        var A = shot();
        var keep2 = window.R3D_SHADOW_A;
        window.R3D_SHADOW_A = 0;
        var B = shot();
        window.R3D_SHADOW_A = keep2;
        var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
        for (var p = 0; p < A.length; p += 4) {
          if ((B[p] - A[p]) + (B[p + 1] - A[p + 1]) + (B[p + 2] - A[p + 2]) <= 6) continue;
          var px = (p >> 2) % CW, py = (p >> 2) / CW | 0;
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
          n++;
        }
        return n ? { w: x1 - x0 + 1, h: y1 - y0 + 1, px: n } : null;
      }
      var s0 = silhouette(0), s90 = silhouette(Math.PI / 2);
      o.rot0 = s0; o.rot90 = s90;
      if (s0 && s90) {
        o.aspect0 = +(s0.w / s0.h).toFixed(3);
        o.aspect90 = +(s90.w / s90.h).toFixed(3);
        o.aspectShift = +Math.abs(o.aspect0 - o.aspect90).toFixed(3);
      }
      G.ents = keepEnts;
    }
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }

  S.ok('the context carries a stencil buffer', out.stencilBits > 0,
       out.stencilBits + ' stencil bits - asked for in the context attributes, not assumed');

  /* Buildings had NO shadow at all under the blob discs, which were drawn for units only. */
  S.ok('a building casts a shadow', out.building.px > 400,
       out.building.px + ' pixels darkened by a lone construction yard (the blob discs it ' +
       'replaces were drawn for units only, so this was exactly 0)');

  S.ok('the stencil gives each pixel one blend, not one per face',
       out.stencilOn.over < 2 && out.stencilOn.dominant > 70,
       out.stencilOn.dominant + '% of shadow pixels sit at the single-blend alpha ' +
       out.alpha + ' and ' + out.stencilOn.over + '% are darker than it');

  S.ok('...which is worth having: without it the silhouette fills in solid',
       out.stencilOff.over > 50 && out.stencilOff.mode > 0.9,
       'the same frame with the stencil off is ' + out.stencilOff.over +
       '% over-blended, commonest level ' + out.stencilOff.mode + ' against ' +
       out.stencilOn.mode + ' - a black blot rather than a shadow');

  /* THE DESIGN CLAIM, and the one the constants alone cannot carry: flipping the light's z
     back would move the shader AND the expected position together, so a spec that only
     compares the two would pass with the shadow hidden. This compares the shadow to the
     BUILDING, and a shadow thrown up the screen lands behind the body that threw it. */
  S.ok('the shadow falls clear of the model, down the screen rather than behind it',
       out.model && out.dropY > 8,
       'the shadow centroid sits ' + out.dropY + 'px below the building\'s own centroid (' +
       (out.model ? out.model.y : '?') + ' -> ' + (out.building.px ? out.building.cy.toFixed(1) : '?') +
       ') - with the shading light\'s own direction this is NEGATIVE, because that light is 22 ' +
       'degrees off the camera axis and its shadow hides behind the thing casting it');

  S.ok('an air unit was put in the air to check', out.flew,
       out.flew ? 'flying' : 'no air unit could be spawned');
  if (out.flew) {
    /* The whole of the direction claim, as a measurement: the shadow is NOT under the
       aircraft, and it is where the projection along the shadow light says it is. */
    S.ok('a flying unit\'s shadow lies away from it, by its altitude',
         out.castErr >= 0 && out.castErr < 12 && out.selfErr > out.castErr * 2,
         'shadow centroid ' + out.heliMeasured.x + ',' + out.heliMeasured.y +
         ' - ' + out.castErr + 'px from where the projection along the shadow light puts it (' +
         out.heliCast.x + ',' + out.heliCast.y + ') and ' + out.selfErr +
         'px from the aircraft itself (' + out.heliSelf.x + ',' + out.heliSelf.y +
         '), which is where a blob disc sat');
  }

  S.ok('a tank is on the ground to check', out.hasTank && out.rot0 && out.rot90,
       out.rot0 ? (out.rot0.px + ' and ' + out.rot90.px + ' shadow pixels') : 'no tank');
  if (out.rot0 && out.rot90) {
    /* A disc is a disc whichever way the hull points. */
    S.ok('the shadow has the shape of the thing casting it, not a disc',
         out.aspectShift > 0.15,
         'turning the hull a quarter turn takes the shadow from ' + out.rot0.w + 'x' +
         out.rot0.h + ' (aspect ' + out.aspect0 + ') to ' + out.rot90.w + 'x' + out.rot90.h +
         ' (aspect ' + out.aspect90 + ') - a shift of ' + out.aspectShift +
         '; a disc does not change shape when the thing above it turns');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
