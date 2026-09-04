/* Entities drawn many-to-a-call — render3d/inst3d.js.

   WHY IT EXISTS. Every entity used to be its own draw: placement went in as uniforms, the mesh
   was bound, drawArrays ran. Measured at a fixed camera with the bloom pass off:

     units on screen      0     10     20     40     80    160
     drawArrays          26     56     81    136    246    466

   1.50 calls per unit in the main pass and 1.25 more in the sun's, dead linear, carrying about
   1,370 vertices each. A phone's GL driver pays per CALL largely regardless of how much
   geometry rides on it, so a battle spent its frame on submission overhead while the vertex
   stage idled — which is the shape of the report this came from: the frame rate halves when
   the enemy attacks and recovers when they are beaten.

   THE SAFETY ARGUMENT IS ONE SENTENCE: the picture must not change. Placement moved from
   uniforms to per-instance attributes and the shader body was not touched, so the only thing
   that genuinely differs is the ORDER the entities reach the GPU in — grouped by mesh instead
   of by entity — and that is invisible only because every one of them is opaque and
   depth-tested. Nothing alpha-blended may join that walk without sorting it again.

   So this file asks two things: are there far fewer calls, and is it the same frame. The
   second is asked by rendering it both ways in ONE page — R3.inst.on false takes flushBatch
   down its per-instance fallback, which is the draw-per-entity this replaced — and comparing
   the two frames pixel for pixel. Measured against the pre-change build by hand the same way,
   0 of 448,000 pixels differed. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('instanced');

/* A fixed cast: same units, same places, same facings, a damaged building for the dim flag,
   and a pinned clock so the infantry bob and the sea are not moving under the comparison. */
var SCENE = function (n) {
  var g = window._rtsG, C = RTS_N * RTS_TILE / 2;
  for (var j = g.ents.length - 1; j >= 0; j--)
    if (g.ents[j].type === 'unit') { delete g.byId[g.ents[j].id]; g.ents.splice(j, 1); }
  g.fx.length = 0;
  if (g.proj) g.proj.length = 0;
  for (var k = 0; k < n; k++) {
    var e = _rtsSpawnUnit(k & 1 ? 'enemy' : 'player',
                          ['rifle', 'tank', 'rocket', 'buggy', 'harvester'][k % 5],
                          C - 30 + (k % 10) * 6, C - 24 + ((k / 10) | 0) * 6);
    if (e) { e.rot = (k * 0.7) % 6.283; e.turret = (k * 1.3) % 6.283; }
  }
  for (j = 0; j < g.ents.length; j++) {
    if (g.ents[j].type !== 'struct') continue;
    g.ents[j].hp = g.ents[j].maxHp * 0.2;        /* one dimmed building in the picture */
    break;
  }
  g.t = 12.5;
  _rtsR.focus.x = C; _rtsR.focus.z = C; _rtsApplyCam();
}.toString();

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 20, { freeze: true, mode3d: true });

  /* ---------- 1. the same frame, drawn both ways ---------- */
  var same = await g.page.evaluate(function (src) {
    var R3 = window._R3D;
    if (!R3 || !R3.gl) return { err: 'the 3D renderer did not start' };
    eval('(' + src + ')')(60);
    function shot() {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      return R3.cv.toDataURL('image/png');
    }
    var inst = R3.inst && R3.inst.on;
    var withInst = shot();
    /* ...and the draw-per-entity path this replaced, in the same page, on the same scene */
    var keep = R3.inst.on;
    R3.inst.on = false;
    var without = shot();
    R3.inst.on = keep;
    /* back to instanced, to be sure the flip is not one-way */
    var again = shot();
    return { err: null, inst: inst, a: withInst, b: without, c: again,
             w: R3.cv.width, h: R3.cv.height };
  }, SCENE);

  if (same.err) { S.ok('the 3D renderer started', false, same.err); }
  else {
    S.ok('this browser can instance at all', same.inst,
         same.inst ? 'yes — otherwise every count below is the fallback path'
                   : 'NO: neither WebGL2 nor ANGLE_instanced_arrays, so nothing below is under test');

    var cmp = await g.page.evaluate(async function (d) {
      function load(u) { return new Promise(function (r) {
        var i = new Image(); i.onload = function () { r(i); }; i.src = u; }); }
      var A = await load(d[0]), B = await load(d[1]);
      var c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
      var x = c.getContext('2d');
      x.drawImage(A, 0, 0); var da = x.getImageData(0, 0, c.width, c.height).data;
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(B, 0, 0); var db = x.getImageData(0, 0, c.width, c.height).data;
      var diff = 0, max = 0, worst = null, ink = 0;
      for (var i = 0; i < da.length; i += 4) {
        /* how much of the frame is not the background, so a comparison of two blank canvases
           cannot pass as a match */
        if (da[i] || da[i + 1] || da[i + 2]) ink++;
        var v = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]),
                         Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
        if (v) { diff++; if (v > max) { max = v; worst = [(i / 4) % c.width, ((i / 4) / c.width) | 0]; } }
      }
      return { px: da.length / 4, diff: diff, max: max, worst: worst, ink: ink };
    }, [same.a, same.b]);

    S.eq('instancing draws the same frame as the draw-per-entity path it replaced', cmp.diff, 0);
    S.ok('...on a frame with something in it', cmp.ink > cmp.px * 0.5,
         (100 * cmp.ink / cmp.px).toFixed(0) + '% of ' + cmp.px + ' pixels carry the scene');
    if (cmp.diff) S.note('worst pixel ' + JSON.stringify(cmp.worst) + ', off by ' + cmp.max);
    S.eq('...and flipping back is not one-way', same.a === same.c, true);
  }

  /* ---------- 2. what it costs in calls ---------- */
  var cost = await g.page.evaluate(function (src) {
    var R3 = window._R3D, gl = R3.gl, scene = eval('(' + src + ')');
    var acc = null, oDA = gl.drawArrays;
    gl.drawArrays = function () { if (acc) acc.n++; return oDA.apply(gl, arguments); };
    var oDI = null, oDIe = null;
    if (gl.drawArraysInstanced) { oDI = gl.drawArraysInstanced;
      gl.drawArraysInstanced = function () { if (acc) acc.n++; return oDI.apply(gl, arguments); }; }
    var ext = gl.getExtension('ANGLE_instanced_arrays');
    if (ext && ext.drawArraysInstancedANGLE) { oDIe = ext.drawArraysInstancedANGLE;
      ext.drawArraysInstancedANGLE = function () { if (acc) acc.n++; return oDIe.apply(ext, arguments); }; }
    window.RTS_POST_ON = false;                  /* bloom is 5 calls, priced elsewhere */
    function calls(n) {
      scene(n);
      for (var w = 0; w < 3; w++) _rtsRFrame(1 / 60);
      acc = { n: 0 };
      for (var i = 0; i < 10; i++) _rtsRFrame(1 / 60);
      var r = acc.n / 10; acc = null;
      return +r.toFixed(1);
    }
    var out = { on: {}, off: {} };
    [0, 40, 160].forEach(function (n) { out.on[n] = calls(n); });
    var keep = R3.inst.on; R3.inst.on = false;
    [0, 40, 160].forEach(function (n) { out.off[n] = calls(n); });
    R3.inst.on = keep;
    return out;
  }, SCENE);

  var slopeOn = (cost.on[160] - cost.on[0]) / 160;
  var slopeOff = (cost.off[160] - cost.off[0]) / 160;
  S.ok('a unit on screen no longer costs a draw call of its own', slopeOn < 0.5,
       slopeOn.toFixed(2) + ' calls per unit instanced against ' + slopeOff.toFixed(2) +
       ' one at a time — 160 units is ' + cost.on[160] + ' calls against ' + cost.off[160]);
  S.ok('...and the saving grows with the battle', cost.off[160] / cost.on[160] >= 4,
       'at 160 units: ' + (cost.off[160] / cost.on[160]).toFixed(1) + 'x fewer; at 40 units ' +
       (cost.off[40] / cost.on[40]).toFixed(1) + 'x');
  S.note('an empty field is ' + cost.on[0] + ' calls either way — the terrain, the sea and the ' +
         'world batches were never per-entity');

  /* THE ONE FAILURE THE PICTURE CANNOT SEE. Batching is only safe because the buckets are
     emptied at the start of every pass; stop emptying them and the frame is IDENTICAL -
     drawing the same opaque, depth-tested instances again changes nothing - while the work
     grows without bound every frame. Tried as a mutation, it passed every assertion above and
     took the spec from 17 seconds to 113. So the count itself is the assertion: two entities
     are drawn per unit at most (hull and turret) in each of the two passes, and whatever the
     number is on one frame it has to be the same number twenty frames later. */
  var steady = await g.page.evaluate(function (src) {
    var R3 = window._R3D;
    eval('(' + src + ')')(60);
    for (var w = 0; w < 3; w++) _rtsRFrame(1 / 60);
    _rtsRFrame(1 / 60);
    var first = R3.instDrawn;
    for (var i = 0; i < 20; i++) _rtsRFrame(1 / 60);
    var live = 0, g2 = window._rtsG;
    for (var j = 0; j < g2.ents.length; j++) if (!g2.ents[j].dead) live++;
    return { first: first, last: R3.instDrawn, live: live };
  }, SCENE);

  S.eq('the batches are emptied every pass, so the work per frame holds still',
       steady.last, steady.first);
  S.ok('...at about two placements per entity per pass',
       steady.first > steady.live && steady.first <= steady.live * 4,
       steady.first + ' placements a frame for ' + steady.live + ' live entities, over two passes');

  /* ---------- 3. what the 3D view spends its geometry budget on ----------

     The models are tessellated richer for this view than for the sprite baker - see _R3_DETAIL
     in r3d/curves.js: a sprite is 22 to 44 art pixels across and cannot show a rounded edge,
     while this draws the same model at 100 to 200 and, since instancing, draws every copy of it
     in one call. That is only affordable inside a budget, and the budget is triangles submitted
     per frame, which is the number that transfers off a machine whose GPU is SwiftShader.

     THE CEILING IS THE POINT. Raising the detail level is one constant, and the effect is
     invisible until a phone drops frames; this makes it visible here instead. The numbers below
     are a 160-unit battle - far past what a real skirmish reaches, which is nearer 64 - with
     both passes running, so it is the worst case rather than the usual one. */
  var budget = await g.page.evaluate(function (src) {
    var R3 = window._R3D, gl = R3.gl, scene = eval('(' + src + ')');
    var acc = null;
    var oDA = gl.drawArrays;
    gl.drawArrays = function (m, f, c) { if (acc) acc.t += c / 3; return oDA.apply(gl, arguments); };
    if (gl.drawArraysInstanced) {
      var oDI = gl.drawArraysInstanced;
      gl.drawArraysInstanced = function (m, f, c, n) { if (acc) acc.t += c / 3 * n; return oDI.apply(gl, arguments); };
    }
    var ext = gl.getExtension('ANGLE_instanced_arrays');
    if (ext && ext.drawArraysInstancedANGLE) {
      var oE = ext.drawArraysInstancedANGLE;
      ext.drawArraysInstancedANGLE = function (m, f, c, n) { if (acc) acc.t += c / 3 * n; return oE.apply(ext, arguments); };
    }
    window.RTS_POST_ON = false;
    function tri(n) {
      scene(n);
      for (var w = 0; w < 4; w++) _rtsRFrame(1 / 60);
      acc = { t: 0 };
      for (var i = 0; i < 10; i++) _rtsRFrame(1 / 60);
      var r = acc.t / 10; acc = null;
      return Math.round(r);
    }
    var full = tri(160), world = tri(0);
    /* and the same model as the baker builds it, to show the two levels really do differ */
    function tris(f) { var t = 0; for (var i = 0; i < f.length; i++) t += Math.max(0, f[i].v.length - 2); return t; }
    var bake = tris(_sprUnitModel('tank', 'player', false, null));
    var view = _r3DetailHigh(function () { return tris(_sprUnitModel('tank', 'player', false, null)); });
    return { full: full, world: world, bake: bake, view: view };
  }, SCENE);

  S.ok('a 160-unit battle stays inside the per-frame triangle budget', budget.full <= 3200000,
       budget.full.toLocaleString() + ' triangles a frame over both passes, of which ' +
       budget.world.toLocaleString() + ' is the visible world and ' +
       (budget.full - budget.world).toLocaleString() + ' the entities');
  S.ok('...and the entities do not dwarf the ground they stand on',
       (budget.full - budget.world) <= budget.world * 4,
       'entities are ' + ((budget.full - budget.world) / budget.world).toFixed(2) +
       'x the visible world batch');
  S.ok('the 3D view really does build a richer model than the sprite baker',
       budget.view > budget.bake * 1.5,
       'a Battle Tank is ' + budget.view + ' triangles for this view against ' + budget.bake +
       ' for the bake - the same model, tessellated twice');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
