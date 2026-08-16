/* AN ORE FIELD IS GROUND, NOT A SCATTER OF CONES.

   In 2D the deposit is a painted tile. render/frame.js skips that tile in 3D on purpose - the
   crystals there are real geometry and a flat gold tile drawn over them buries ~50k triangles
   of them, which was measured and fixed once already. What nobody then put back was the
   COLOUR: the crystals ended up standing on plain green grass, so a field read as a few
   hundred identical yellow cones scattered across a lawn. Nothing said a deposit was under
   them, and the grass-tuft scatter - which runs on grass cells, and an ore field sits on grass
   cells - put dark green spikes up between them for good measure.

   THE FIX IS THE FOG'S OWN TRICK, because it is the same shape of problem: a signal at one
   value per CELL, that has to fade at its edges and follow a number the game keeps changing.
   One texel per cell, magnified LINEAR, blended over the ground.

   WHAT THIS SPEC PINS, and how each one fails differently:

   - THE GROUND IS GOLD. Measured as the mean colour of a window over the densest field on the
     map: with the stain the red channel leads, without it the green channel does, because
     without it you are looking at grass.

   - IT FADES RATHER THAN ENDING ON A CELL, and that is the whole reason it is a LINEAR
     texture rather than the flat quads that were tried first - those came out as a heap of
     overlapping paper squares, because a quad's hard straight edge reads louder than the
     colour it carries. Pinned STRUCTURALLY, as e2e/r3dlook pins the ground's and the fog's
     filters, because the picture cannot carry it: the frame is `stain*a + terrain*(1-a)`, so
     differencing the two frames leaves `a * (stain - terrain)` and the terrain's own
     per-pixel variation is still in there. A metric built on that would read the ground's
     texture and call it a gradient. The filter is the claim, and switching it to NEAREST is
     the regression it guards.

   - IT FOLLOWS WHAT IS LEFT. Working a field down has to take the colour with it, or the map
     lies about where the ore still is - which is a gameplay signal, not a decoration.

   - AND NO GRASS GROWS THROUGH IT. Measured structurally rather than by pixel: rebuild the
     world with the field zeroed and count the triangles that come back. Those are the tufts
     that used to stand between the crystals.

   THE BUDGET IS PART OF THE CLAIM. e2e/r3dlive holds the map to a million triangles of
   geometry; taking tufts out of the ore fields spends ~70k of that, and it goes to the forest
   - which is where world3d.js's own note says the budget belongs - rather than back onto the
   floor. Checked here so the two moves are measured together. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('ore3d');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 640, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;

    /* the middle of the biggest field on this map */
    var best = null, bs = 0;
    for (var tz = 6; tz < RTS_N - 6; tz++) {
      for (var tx = 6; tx < RTS_N - 6; tx++) {
        var s = 0;
        for (var dz = -3; dz <= 3; dz++) {
          for (var dx = -3; dx <= 3; dx++) if (G.scrap[_rtsIdx(tx + dx, tz + dz)] > 0) s++;
        }
        if (s > bs) { bs = s; best = [tx, tz]; }
      }
    }
    o.fieldAt = best; o.fieldDensity = bs;
    if (!best) return o;
    R.focus.x = _rtsWX(best[0]); R.focus.z = _rtsWX(best[1]);
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    _rtsRFrame(1 / 60);

    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* RTS_ORE_TEX_A is the stain's coverage; zero is the picture before this change - the
       crystals and everything else untouched, the deposit's colour gone. */
    function withoutStain() {
      var keep = window.RTS_ORE_TEX_A;
      window.RTS_ORE_TEX_A = 0;
      var b = shot();
      window.RTS_ORE_TEX_A = keep;
      return b;
    }
    function meanIn(buf, x0, y0, w, h) {
      var r = 0, gg = 0, b2 = 0, n = 0;
      for (var y = y0; y < y0 + h; y++) {
        for (var x = x0; x < x0 + w; x++) {
          var p = (y * CW + x) * 4;
          r += buf[p]; gg += buf[p + 1]; b2 += buf[p + 2]; n++;
        }
      }
      return { r: +(r / n).toFixed(1), g: +(gg / n).toFixed(1), b: +(b2 / n).toFixed(1) };
    }

    /* ---------- 1. the ground is gold, and without the stain it is grass ---------- */
    var A = shot(), B = withoutStain();
    var wx0 = (CW >> 1) - 90, wy0 = (CH >> 1) - 90;
    o.stained = meanIn(A, wx0, wy0, 180, 180);
    o.bare = meanIn(B, wx0, wy0, 180, 180);
    o.stainedLead = +(o.stained.r - o.stained.g).toFixed(1);
    o.bareLead = +(o.bare.r - o.bare.g).toFixed(1);

    /* ---------- 2. the edge is a ramp, not a step ---------- */
    gl.bindTexture(gl.TEXTURE_2D, R3.oreTex);
    o.oreMag = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER);
    o.oreMin = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER);
    o.LINEAR = gl.LINEAR; o.NEAREST = gl.NEAREST;
    o.cellPx = R.cell * R.dpr;
    /* the texture really is one texel per cell - LINEAR only buys a soft edge because the
       thing being magnified is that coarse */
    o.texW = R3.oreCv.width; o.texH = R3.oreCv.height; o.cells = RTS_N;

    /* ---------- 3. it follows what is left ---------- */
    var before = meanIn(shot(), wx0, wy0, 180, 180);
    var keepScrap = G.scrap.slice ? G.scrap.slice() : new Float32Array(G.scrap);
    for (i = 0; i < RTS_N * RTS_N; i++) G.scrap[i] *= 0.12;
    var after = meanIn(shot(), wx0, wy0, 180, 180);
    G.scrap.set(keepScrap);
    _rtsRFrame(1 / 60);
    o.fullLead = +(before.r - before.g).toFixed(1);
    o.spentLead = +(after.r - after.g).toFixed(1);

    /* ---------- 4. no grass through the field, measured as geometry ---------- */
    var withOre = R3.worldTris;
    for (i = 0; i < RTS_N * RTS_N; i++) G.scrap[i] = 0;
    _r3dWorldBuild(G);
    var noOre = R3.worldTris;
    G.scrap.set(keepScrap);
    _r3dWorldBuild(G); _r3dOreBuild(G);
    o.tuftTrisSaved = Math.round(noOre - withOre);
    o.worldTris = Math.round(R3.worldTris);
    o.oreTris = R3.oreMesh ? Math.round(R3.oreMesh.verts / 3) : 0;
    o.totalTris = o.worldTris + o.oreTris;

    /* ---------- 5. gems read as a different mineral ---------- */
    /* Forced rather than hunted for: a generated map may carry no gems at all, and the claim
       is about the colour the field takes, not about this seed's geology. */
    if (!G.gems) G.gems = new Uint8Array(RTS_N * RTS_N);
    var gx = best[0], gz = best[1];
    for (var dz2 = -2; dz2 <= 2; dz2++) {
      for (var dx2 = -2; dx2 <= 2; dx2++) {
        var gi = _rtsIdx(gx + dx2, gz + dz2);
        G.gems[gi] = 1;
        G.scrap[gi] = RTS_SCRAP_TILE *
          (typeof RTS_ORE_RICHNESS === 'number' ? RTS_ORE_RICHNESS : 1);
      }
    }
    _r3dOreBuild(G);
    var gemShot = shot();
    o.gem = meanIn(gemShot, (CW >> 1) - 40, (CH >> 1) - 40, 80, 80);
    o.gemBlueLead = +(o.gem.b - o.gem.g).toFixed(1);
    o.oreBlueLead = +(o.stained.b - o.stained.g).toFixed(1);
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('the map has an ore field to look at', out.fieldDensity > 30,
       out.fieldDensity + ' of 49 cells around ' + out.fieldAt + ' carry ore');

  S.ok('the ground under an ore field is gold',
       out.stainedLead > 20,
       'red leads green by ' + out.stainedLead + ' over the field (' + out.stained.r + ',' +
       out.stained.g + ',' + out.stained.b + ')');

  /* Measured as the SHIFT rather than as the sign of the bare frame: the window has crystals
     in it, and they are gold in both frames, so the unstained mean sits near neutral rather
     than convincingly green. What the change did is the difference between the two. */
  S.ok('...and it is the stain that makes it gold - without it the crystals stand on grass',
       out.stainedLead - out.bareLead > 25,
       'suppressing the stain takes the window from ' + out.stained.r + ',' + out.stained.g +
       ',' + out.stained.b + ' to ' + out.bare.r + ',' + out.bare.g + ',' + out.bare.b +
       ' - a red-over-green lead of ' + out.stainedLead + ' down to ' + out.bareLead);

  /* The whole reason this is a LINEAR texture rather than the flat quads that were tried. */
  S.ok('the field is one texel per cell, magnified LINEAR, so its edge is a ramp',
       out.oreMag === out.LINEAR && out.texW === out.cells,
       out.texW + 'x' + out.texH + ' texels for ' + out.cells + ' cells, MAG=' +
       (out.oreMag === out.LINEAR ? 'LINEAR' : 'NEAREST') + ' over a ' + out.cellPx +
       '-pixel cell - NEAREST here is the grid of hard squares this replaced');

  S.ok('working a field down takes its colour with it',
       out.spentLead < out.fullLead * 0.65,
       'red leads green by ' + out.fullLead + ' at full and ' + out.spentLead +
       ' with the field at 12% - the map has to say where the ore still is');

  S.ok('no grass grows through the deposit',
       out.tuftTrisSaved > 10000,
       out.tuftTrisSaved + ' triangles of grass tuft used to stand between the crystals ' +
       '(the scatter runs on grass cells, and an ore field sits on grass cells)');

  S.ok('...and the budget it frees goes to the forest, not back onto the floor',
       out.totalTris > 1000000,
       out.worldTris + ' world + ' + out.oreTris + ' ore = ' + out.totalTris +
       ' triangles, still over the million e2e/r3dlive holds the map to');

  S.ok('a gem field reads as a different mineral, not as gold',
       out.gemBlueLead > 20 && out.oreBlueLead < 0,
       'over gems blue leads green by ' + out.gemBlueLead + ' (' + out.gem.r + ',' +
       out.gem.g + ',' + out.gem.b + '); over ore it trails by ' + (-out.oreBlueLead));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
