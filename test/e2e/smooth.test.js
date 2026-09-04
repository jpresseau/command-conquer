/* ROUND THINGS ARE ROUND, AND BOXES ARE STILL BOXES.

   Every model in this game is a face list, and until now every face carried ONE normal shared
   by all its vertices. For a box that is exactly right and must stay that way. For the
   cylinders, cones and vaults that make up every chimney, barrel roof, gun barrel, tree and
   turret housing it is the thing that made them read as tubes of flat strips: a 14-sided drum
   lit as 14 flat bands. Measured, a whole lit power plant resolved to 39 distinct tones.

   TWO CHANGES, AND NEITHER ONE WORKS WITHOUT THE OTHER.

   The primitives now emit a normal PER CORNER for their curved surfaces - the true radial one
   for a cylinder, the slant's for a cone, the ellipse's for a vault - and nothing at all for
   flat faces, which keep the face normal. That is emitted rather than recovered: a renderer
   can find shared corners and average the faces meeting there, and the first version of this
   did exactly that, but it costs a spatial hash over every vertex of every face and the world
   batch runs to hundreds of thousands of them. Measured, almost two seconds added to entering
   3D mode. The primitive knows the answer exactly and for free.

   And the shading moved from the vertex stage to the fragment stage. Without that the first
   change is invisible: shading a face once per vertex, when the interesting variation is
   ACROSS the face, is shading it once per facet no matter what its corners carry.

   WHAT IS GRADED. The normals, against the geometry they claim to describe - a cylinder's side
   normal has to be perpendicular to its axis and point away from it, which is checkable without
   rendering anything. That boxes did not get swept up in it. That a rotation carries them. And
   the picture: a building with two cylindrical chimneys, masked to its own pixels so the
   ground cannot contribute, counted in tones. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('smooth');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    /* ---------- 1. the primitives, with no renderer involved ---------- */
    var cyl = [];
    /* 14 is what this call asked for and it is NOT what it gets: _r3Seg floors every model
       primitive at R3_SEG_MIN, because the roster had drifted to eight different hand-picked
       counts and the smallest was an octagon. The spec asks for the old number on purpose -
       the floor is the thing under test, so hard-coding 24 here would pass whether it applied
       or not. */
    _r3Cyl(cyl, 3, 0, -2, 1.5, 4, '#808080', '#909090', 14);
    o.cylSeg = R3_SEG_MIN;
    o.cylFaces = cyl.length;
    /* the sides carry normals, the cap does not - a cap meets the side at a right angle */
    var withN = 0, flat = 0;
    for (i = 0; i < cyl.length; i++) { if (cyl[i].n) withN++; else flat++; }
    o.cylSmooth = withN; o.cylFlat = flat;

    /* THE NORMALS AGAINST THE GEOMETRY. A cylinder stands along y, so every side normal must
       be horizontal, unit length, and point from the AXIS toward its own vertex. Checked
       against the vertex positions rather than against the formula that made them. */
    var bad = 0, checked = 0, worstDot = 1, worstLen = 0;
    for (i = 0; i < cyl.length; i++) {
      var f = cyl[i];
      if (!f.n) continue;
      for (var k = 0; k < f.v.length; k++) {
        var n = f.n[k], p = f.v[k];
        var len = Math.hypot(n[0], n[1], n[2]);
        if (Math.abs(len - 1) > 1e-6) bad++;
        if (Math.abs(len - 1) > worstLen) worstLen = Math.abs(len - 1);
        /* from the axis (x = 3, z = -2) out to this vertex */
        var rx = p[0] - 3, rz = p[2] + 2, rm = Math.hypot(rx, rz) || 1;
        var dot = (n[0] * rx + n[2] * rz) / rm;
        if (dot < worstDot) worstDot = dot;
        if (dot < 0.9999 || Math.abs(n[1]) > 1e-6) bad++;
        checked++;
      }
    }
    o.cylChecked = checked; o.cylBad = bad;
    o.cylWorstDot = +worstDot.toFixed(5); o.cylWorstLen = +worstLen.toExponential(1);

    /* A BOX MUST NOT HAVE PICKED THIS UP. Smoothing a box rounds off its corners into a soft
       lump, which is the failure this whole thing has to avoid. */
    var box = [];
    _r3Box(box, 0, 0, 0, 2, 2, 2, '#808080');
    var boxN = 0;
    for (i = 0; i < box.length; i++) if (box[i].n) boxN++;
    o.boxFaces = box.length; o.boxSmooth = boxN;

    /* A ROTATION HAS TO CARRY THEM. Units are yawed to face their heading, and a normal left
       behind by the turn lights the hull as though it were still pointing north. */
    var turned = _r3Yaw(cyl, Math.PI / 2);
    var carried = 0, turnedOk = 0;
    for (i = 0; i < turned.length; i++) {
      if (!turned[i].n) continue;
      carried++;
      var n0 = cyl[i].n[0], n1 = turned[i].n[0];
      /* a quarter turn about y sends (x, y, z) to (-z, y, x) */
      if (Math.abs(n1[0] + n0[2]) < 1e-9 && Math.abs(n1[2] - n0[0]) < 1e-9) turnedOk++;
    }
    o.turnedCarried = carried; o.turnedOk = turnedOk;

    /* ---------- 2. the picture ---------- */
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    var gl = R3.gl;

    /* the power plant: a box body with two cylindrical stacks on it */
    var pp = null, ents = G.ents;
    for (i = 0; i < ents.length; i++) if (ents[i].def === 'power') { pp = ents[i]; break; }
    o.found = !!pp;
    if (!pp) return o;

    G.ents = [pp];
    R.focus.x = pp.x; R.focus.z = pp.z;
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    /* the sun's shade and the occlusion have structure of their own; this is about the shading
       of a lit curve, so take them out and leave the ramp on its own */
    R3.shadowReady = false; R3.aoAmt = 0; R3.aaAmt = 0;
    _rtsRFrame(1 / 60);

    var CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60);
      var t = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, t);
      return t;
    }
    var withB = shot();
    G.ents = [];
    var bare = shot();
    G.ents = [pp];

    /* THE MASK IS THE BUILDING AND NOTHING ELSE. The ground is baked pixel art with a texture
       of its own, and it would contribute more tones than the model does. */
    var tones = {}, npx = 0;
    for (i = 0; i < CW * CH; i++) {
      var q = i * 4;
      if (Math.abs(withB[q] - bare[q]) + Math.abs(withB[q + 1] - bare[q + 1]) +
          Math.abs(withB[q + 2] - bare[q + 2]) <= 10) continue;
      tones[withB[q] + ',' + withB[q + 1] + ',' + withB[q + 2]] = 1;
      npx++;
    }
    o.bldPx = npx;
    o.bldTones = Object.keys(tones).length;
    return o;
  });

  S.ok('a cylinder is emitted as sides plus a cap', out.cylFaces === out.cylSeg + 1,
       out.cylFaces + ' faces for a drum that asked for 14 sides and was floored at ' +
       out.cylSeg);

  S.ok('...whose sides carry a normal per corner and whose cap does not',
       out.cylSmooth === out.cylSeg && out.cylFlat === 1,
       out.cylSmooth + ' faces with per-corner normals, ' + out.cylFlat + ' without - the cap ' +
       'meets the side at a right angle and is meant to look like it does');

  /* Checked against the geometry, not against the formula that produced it. */
  S.ok('...and every one of those normals is the true radial one',
       out.cylBad === 0 && out.cylChecked > 0,
       out.cylChecked + ' corner normals, all unit length (worst error ' + out.cylWorstLen +
       ') and all pointing straight out from the axis (worst alignment ' + out.cylWorstDot +
       ') - a normal that is merely plausible here shades the drum as a lopsided tube');

  /* The guard on the whole idea: this must not round off the things that are meant to be hard. */
  S.ok('a box is left flat', out.boxSmooth === 0,
       out.boxFaces + ' faces, ' + out.boxSmooth + ' with per-corner normals - smoothing a box ' +
       'turns its corners into a soft lump, and every building here is mostly boxes');

  S.ok('a yaw carries the normals round with the vertices',
       out.turnedCarried > 0 && out.turnedOk === out.turnedCarried,
       out.turnedOk + ' of ' + out.turnedCarried + ' normals land where a quarter turn puts ' +
       'them - left behind, a turning unit lights as though it were still facing north');

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (out.on) {
    S.ok('a building with cylinders on it was found', out.found, out.found ? 'power' : 'none');
    if (out.found) {
      /* THE CLAIM, in the picture, and it grades the NORMALS: take the per-corner normals
         back out of the primitives and this same measurement returns to 41, which is about
         one tone per facet. The move to the fragment stage is a prerequisite rather than a
         separate claim - with the shading done at the corners the variation across a facet
         cannot appear at all, whatever those corners carry - and it is not isolated by any
         assertion here. */
      S.ok('a lit curve resolves as a gradient rather than as bands',
           out.bldTones > 90,
           out.bldTones + ' distinct tones across the ' + out.bldPx + ' pixels of a power ' +
           'plant - with the per-corner normals removed the same building measures 41, which ' +
           'is about one tone per facet');
    }
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
