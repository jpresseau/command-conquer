/* THE PICTURE A PLAYER FINDS THEIR UNITS IN - render3d/terrain3d.js (_grass), world3d.js (tufts),
   footing3d.js, resolve3d.js (_ink). Each an A/B on one frozen frame, through its own switch:

     THE MEADOW   open grass is calm: its fine contrast well under what the old ripple's was
                  (R3.grassLegacy), still green and less yellow, and nothing growing on it is far
                  darker than it is; sand, a material that is not grass, is the same to the byte
     THE SHADE    a tank and a rifleman each stand in shade of their own (R3.footAmt): darker
                  ground, never lighter, under them and nowhere else; the hull's lies along its
                  heading; a helicopter has none; by night it is lighter
     THE INK      a unit's rim is darkened (R3.inkAmt): on the unit's own pixels and not the
                  ground beside it, nothing lightened; open grass takes next to none; a fireball
                  in front of a hull is not inked; the LOW tier draws none */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('grounded');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1; G.fx.length = 0; G.sides.enemy.ai.next = 1e9;
    window.RTS_SKY_FORCE = 'day'; R3.cloudAmt = 0;
    /* a patch of one kind of ground, r cells each way, nearest the player's yard */
    var yd = _rtsHas('player', 'yard');
    function patch(kind, r) {
      var best = null, bd = 1e9;
      for (var z = r + 1; z < RTS_N - r - 1; z++) for (var x = r + 1; x < RTS_N - r - 1; x++) {
        var ok = true, d = (x - _rtsTX(yd.x)) * (x - _rtsTX(yd.x)) + (z - _rtsTX(yd.z)) * (z - _rtsTX(yd.z));
        if (d >= bd || (kind === RTS_T_GRASS && d < 100)) continue;
        for (var dz = -r; dz <= r && ok; dz++) for (var dx = -r; dx <= r && ok; dx++) {
          var k = _rtsIdx(x + dx, z + dz);
          if (G.terrain[k] !== kind || _rtsBlocked(x + dx, z + dz) || (G.scrap && G.scrap[k] > 0) || (G.ore && G.ore[k] > 0)) ok = false;
        }
        if (ok) { best = [_rtsWX(x), _rtsWX(z)]; bd = d; }
      }
      return best;
    }
    var grass = patch(RTS_T_GRASS, 4), sand = patch(RTS_T_SAND, 1);
    o.grass = grass; o.sand = sand;
    if (!grass || !sand) return o;
    G.ents.forEach(function (e) { if (e.type === 'unit' && Math.hypot(e.x - grass[0], e.z - grass[1]) < 40) e.dead = true; });
    function look(p, zi) { R.zi = zi; _rtsApplyCam(); _rtsLookAt(p[0], p[1]); _rtsRFrame(0); }
    function pic() { _rtsRFrame(0); var c = _rtsCompose(); return { d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; }
    function at(p) { var s = _rtsWorldToScreen(p[0], _rtsElev(p[0], p[1]), p[1]), k = (window._rtsR.dpr || 1); return { x: Math.round(s.x * k), y: Math.round(s.y * k), sc: s.scale || 1 }; }
    function lum(d, q) { return 0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]; }
    /* a box of the picture: its mean colour, its fine contrast, and how much of it is far darker than its middle */
    function box(P, c, hw, hh) {
      var n = 0, r = 0, gg = 0, b = 0, step = 0, L = [];
      for (var y = c.y - hh; y < c.y + hh; y++) for (var x = c.x - hw; x < c.x + hw; x++) {
        var q = (y * P.w + x) * 4, l = lum(P.d, q);
        r += P.d[q]; gg += P.d[q + 1]; b += P.d[q + 2]; n++; L.push(l);
        step += Math.abs(l - lum(P.d, q + 8)) + Math.abs(l - lum(P.d, q + 8 * P.w));
      }
      var srt = L.slice().sort(function (a, c2) { return a - c2; }), med = srt[srt.length >> 1], dark = 0;
      var deep = 0;
      for (var j = 0; j < L.length; j++) { if (L[j] < med * 0.72) dark++; if (L[j] < med * 0.55) deep++; }
      return { r: r / n, g: gg / n, b: b / n, step: step / n / 2, dark: dark / n, deep: deep / n, med: med };
    }
    function differ(A, B, c, hw, hh, each) {
      var n = 0;
      for (var y = Math.max(0, c.y - hh); y < Math.min(A.h, c.y + hh); y++) for (var x = Math.max(0, c.x - hw); x < Math.min(A.w, c.x + hw); x++) {
        var q = (y * A.w + x) * 4, dd = Math.abs(A.d[q] - B.d[q]) + Math.abs(A.d[q + 1] - B.d[q + 1]) + Math.abs(A.d[q + 2] - B.d[q + 2]);
        if (dd > 0) { n++; if (each) each(x, y, q, dd); }
      }
      return n;
    }
    var ZI = RTS_ZOOM_BASE_STEPS;

    /* ---------------- THE MEADOW ---------------- */
    R3.inkAmt = 0; R3.footAmt = 0;
    look(grass, ZI);
    var c0 = at(grass);
    R3.grassLegacy = true; var mOld = pic();
    R3.grassLegacy = false; var mNew = pic(), mNew2 = pic();
    o.meadow = { old: box(mOld, c0, 110, 70), now: box(mNew, c0, 110, 70), control: differ(mNew, mNew2, c0, 110, 70) };
    look(sand, ZI);
    var cs = at(sand);
    R3.grassLegacy = true; var sOld = pic();
    R3.grassLegacy = false; var sNew = pic();
    o.sandBox = box(sNew, cs, 30, 20); o.sandDiff = differ(sOld, sNew, cs, 30, 20);

    /* ---------------- THE SHADE ---------------- */
    look(grass, ZI);
    var tank = _rtsSpawnUnit('player', 'tank', grass[0] - 5, grass[1]), man = _rtsSpawnUnit('player', 'rifle', grass[0] + 5, grass[1]);
    tank.rot = 0; man.rot = 0;
    var ct = at([tank.x, tank.z]), cm = at([man.x, man.z]), ppu = _rtsZoom() * ct.sc;
    o.ppu = ppu;
    function shade(night) {
      window.RTS_SKY_FORCE = night ? 'night' : 'day';
      R3.footAmt = 0; var A = pic();
      R3.footAmt = undefined; var B = pic();
      var st = { n: 0, lighter: 0, far: 0, sum: 0, base: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, foots: R3.foots };
      differ(A, B, { x: A.w >> 1, y: A.h >> 1 }, A.w >> 1, A.h >> 1, function (x, y, q, dd) {
        if (dd < 4) return;
        st.n++; st.sum += dd; st.base += A.d[q] + A.d[q + 1] + A.d[q + 2];
        if (B.d[q] > A.d[q] + 1 || B.d[q + 1] > A.d[q + 1] + 1 || B.d[q + 2] > A.d[q + 2] + 1) st.lighter++;
        var dt = Math.hypot(x - ct.x, y - ct.y), dm = Math.hypot(x - cm.x, y - cm.y);
        if (dt > 3.2 * ppu && dm > 1.6 * ppu) st.far++;
        if (dt <= 3.2 * ppu) { st.x0 = Math.min(st.x0, x); st.x1 = Math.max(st.x1, x); st.y0 = Math.min(st.y0, y); st.y1 = Math.max(st.y1, y); }
      });
      st.frac = st.base ? st.sum / st.base : 0;
      return st;
    }
    R3.aaAmt = 0;                 /* the edge filter re-reads every edge the shade moves: out, for this */
    o.shade = shade(false);
    tank.rot = Math.PI / 2; o.shade90 = shade(false); tank.rot = 0;
    o.shadeNight = shade(true);
    R3.aaAmt = undefined;
    window.RTS_SKY_FORCE = 'day';
    R3.footAmt = 0; _rtsRFrame(0); o.footsOff = R3.foots;
    R3.footAmt = undefined;
    var airKey = RTS_UNITS.filter(function (d) { return d.air; })[0].key;
    var heli = _rtsSpawnUnit('player', airKey, grass[0], grass[1] + 5);
    o.heliAir = !!(heli && heli.air);
    _rtsRFrame(0); o.footsWithHeli = R3.foots;
    if (heli) heli.dead = true;

    /* ---------------- THE INK ---------------- */
    function ink(hw, hh, c) {
      R3.inkAmt = 0; var A = pic();
      R3.hideId = tank.id; var H = pic(); R3.hideId = null;
      R3.inkAmt = undefined; var B = pic();
      var st = { n: 0, lighter: 0, onUnit: 0, bright: 0, brightInked: 0 };
      differ(A, B, c, hw, hh, function (x, y, q, dd) {
        if (dd < 4) return;
        st.n++;
        if (B.d[q] > A.d[q] + 1 || B.d[q + 1] > A.d[q + 1] + 1 || B.d[q + 2] > A.d[q + 2] + 1) st.lighter++;
        if (Math.abs(A.d[q] - H.d[q]) + Math.abs(A.d[q + 1] - H.d[q + 1]) + Math.abs(A.d[q + 2] - H.d[q + 2]) > 6) st.onUnit++;
        if (lum(A.d, q) > 235) st.brightInked++;
      });
      for (var y = c.y - hh; y < c.y + hh; y++) for (var x = c.x - hw; x < c.x + hw; x++) { var q = (y * A.w + x) * 4; if (lum(A.d, q) > 235) st.bright++; }
      return st;
    }
    var hw = Math.round(3.4 * ppu), hh = Math.round(3.4 * ppu);
    o.ink = ink(hw, hh, ct);
    /* open grass, its tufts on it and no unit: the same box, a tank's length to the side */
    var cg = at([grass[0], grass[1] - 9]);
    o.inkGrass = ink(hw, hh, cg); o.inkGrassPx = 4 * hw * hh;
    /* a fireball in front of the hull */
    G.fx.push({ kind: 'boom', x: tank.x, y: 1.2, z: tank.z + 1.5, t: 0.12, big: 1.3 });
    o.inkFire = ink(hw, hh, ct);
    G.fx.length = 0;
    /* the LOW tier's table has no ink */
    var q0 = R3.q; R3.q = { ink: 0 };
    o.inkLow = ink(hw, hh, ct).n;
    R3.q = q0;
    o.tiers = R3D_TIERS.map(function (t) { return t.name + ':' + t.ink; }).join(' ');
    R3.inkAmt = undefined; R3.footAmt = undefined;
    return o;
  });

  if (process.env.GROUNDED_DUMP) console.log(JSON.stringify([out.meadow, out.ink, out.inkFire]));
  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('the map has open grass and a patch of sand to look at', !!out.grass && !!out.sand, JSON.stringify([out.grass, out.sand]));
  if (out.meadow) {
    var M = out.meadow, f1 = function (v) { return v.toFixed(1); };
    /* ---- the meadow ---- */
    S.eq('control: the same frame twice is the same frame', M.control, 0);
    S.ok('the patch is grass, before and after', M.old.g > M.old.r + 15 && M.old.g > M.old.b + 40 && M.now.g > M.now.r + 15 && M.now.g > M.now.b + 40,
         'rgb ' + [M.now.r, M.now.g, M.now.b].map(f1).join(' ') + ', was ' + [M.old.r, M.old.g, M.old.b].map(f1).join(' '));
    S.ok('the meadow is calm: its fine contrast well under the old ripple\'s', M.now.step < M.old.step * 0.6 && M.old.step > 12,
         f1(M.now.step) + ' levels between neighbours, ' + f1(M.old.step) + ' before');
    S.ok('...and less yellow', M.now.r / M.now.g < M.old.r / M.old.g - 0.02, (M.now.r / M.now.g).toFixed(3) + ' red to green, ' + (M.old.r / M.old.g).toFixed(3) + ' before');
    S.ok('...with nothing on it far darker than it is, where a tenth of the old was', M.now.dark < 0.05 && M.old.dark > 0.08,
         (M.now.dark * 100).toFixed(1) + '% under 0.72 of the median, ' + (M.old.dark * 100).toFixed(1) + '% before');
    S.ok('...and a tuft is the meadow\'s own green: next to none of the patch is near black', M.now.deep < 0.0015,
         (M.now.deep * 100).toFixed(2) + '% under 0.55 of the median');
    S.ok('the other patch is sand', out.sandBox.r > out.sandBox.g + 15 && out.sandBox.g > out.sandBox.b + 40, 'rgb ' + [out.sandBox.r, out.sandBox.g, out.sandBox.b].map(f1).join(' '));
    S.eq('...and sand is the same to the byte, old grass or new', out.sandDiff, 0);
    /* ---- the shade ---- */
    var A = out.shade, B = out.shade90, Nt = out.shadeNight;
    S.eq('a tank and a rifleman on the grass: two shades drawn', A.foots, 2);
    S.ok('the ground under them is darker for it', A.n > 1500 && A.frac > 0.08, A.n + ' pixels, ' + (A.frac * 100).toFixed(1) + '% darker on average');
    S.eq('...darker, none of it lighter', A.lighter, 0);
    S.eq('...and nowhere but under them', A.far, 0);
    S.ok('the hull\'s shade lies along its heading: wider heading east', (A.x1 - A.x0) > (B.x1 - B.x0) * 1.15, (A.x1 - A.x0) + ' px wide heading east, ' + (B.x1 - B.x0) + ' heading south');
    S.ok('...deeper heading south', (B.y1 - B.y0) > (A.y1 - A.y0) * 1.15, (B.y1 - B.y0) + ' px deep heading south, ' + (A.y1 - A.y0) + ' heading east');
    S.ok('by night it is lighter', Nt.n > 300 && Nt.frac < A.frac * 0.75, (Nt.frac * 100).toFixed(1) + '% by night, ' + (A.frac * 100).toFixed(1) + '% by day');
    S.eq('R3.footAmt 0 draws none', out.footsOff, 0);
    S.ok('a flier over the grass is in the air', out.heliAir, String(out.heliAir));
    S.eq('...and is given none', out.footsWithHeli, 2);
    /* ---- the ink ---- */
    var I = out.ink, Gr = out.inkGrass, F = out.inkFire;
    S.ok('the tank has an inked rim', I.n >= 60 && I.onUnit >= 60, I.n + ' pixels darkened round it, ' + I.onUnit + ' of them the tank\'s own');
    S.eq('...darkened, none lightened', I.lighter, 0);
    S.ok('...on the unit and not the ground beside it', I.onUnit / I.n >= 0.6 && I.n - I.onUnit <= Math.max(12, Gr.n * 1.6),
         (I.n - I.onUnit) + ' off the unit, where the same box of open grass has ' + Gr.n);
    S.ok('open grass, its tufts on it, takes next to none', Gr.n / out.inkGrassPx < 0.004, Gr.n + ' of ' + out.inkGrassPx + ' pixels');
    S.ok('a fireball is in front of the hull', F.bright > 1000, F.bright + ' pixels of it');
    S.ok('...and is not inked', F.brightInked < F.bright * 0.005, F.brightInked + ' of ' + F.bright);
    S.ok('...nor is the rim it glows over', F.n < I.n * 0.5, F.n + ' pixels darkened in the box, ' + I.n + ' with no fire');
    S.eq('a tier with no ink draws none', out.inkLow, 0);
    S.eq('...which is LOW, alone', out.tiers, 'HIGH:1 MEDIUM:1 LOW:0');
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
