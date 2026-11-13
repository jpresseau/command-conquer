/* WHAT THE GAME LOOKS LIKE CLOSE TO - terrain3d.js (the blades of grass), world3d.js (a tuft throws
   no shadow), afloat3d.js (a ship sits in the water), render/icons.js (a cameo fills its tile).
   Each an A/B on one frozen frame, through its own switch:

     BLADES     at the nearest zoom open grass is finer than without them (R3.bladesOff); at the
                widest they are not drawn at all - the frame is the same to the byte; sand has
                its grains the same way
     TUFTS      on open grass with no unit on it the sun's pass changes nothing: with the tufts
                cast as they were (R3.tuftCast) there are dark smudges beside them
     AFLOAT     a ship at anchor has water drawn round it (R3.afloatAmt) - foam lighter than the
                sea and shade darker, round the hull and nowhere else; a boat under the surface
                has none
     CAMEOS     a tank's picture fills its plate, where the sprite's own margin left it a third
                (window.RTS_ICON_WHOLE); a building's, which had no margin, is as it was; the
                plate behind it is clear; a tile's name stands under its picture
     THE BAR    Save, Load and Sound each show a drawn picture of their own in place of an emoji,
                and keep the glyph as their text; muted, the speaker is the crossed one; REPAIR
                and SELL carry a drawn mark; the graphics button is one of the bar's */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('closeup');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(async function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1; G.fx.length = 0; G.sides.enemy.ai.next = 1e9;
    window.RTS_SKY_FORCE = 'day'; R3.cloudAmt = 0; R3.inkAmt = 0;
    function most(kind, r) {
      var best = null, bs = -1;
      for (var z = r + 2; z < RTS_N - r - 2; z += 2) for (var x = r + 2; x < RTS_N - r - 2; x += 2) {
        var s = 0;
        for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) { var k = _rtsIdx(x + dx, z + dz); if (G.terrain[k] === kind && (kind === RTS_T_WATER || (!_rtsBlocked(x + dx, z + dz) && !(G.scrap[k] > 0)))) s++; }
        if (s > bs) { bs = s; best = [_rtsWX(x), _rtsWX(z)]; }
      }
      return { at: best, share: bs / ((2 * r + 1) * (2 * r + 1)) };
    }
    var grass = most(RTS_T_GRASS, 6), sea = most(RTS_T_WATER, 4);
    o.grassShare = grass.share; o.seaShare = sea.share;
    G.ents.forEach(function (e) { if (e.type === 'unit' && Math.hypot(e.x - grass.at[0], e.z - grass.at[1]) < 60) e.dead = true; });
    function look(p, zi) { R.zi = zi; _rtsApplyCam(); _rtsLookAt(p[0], p[1]); _rtsRFrame(0); }
    function pic() { _rtsRFrame(0); var c = _rtsCompose(); return { d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; }
    function lum(d, q) { return 0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]; }
    function step(P, hw, hh) {
      var s = 0, n = 0, cx = P.w >> 1, cy = P.h >> 1;
      for (var y = cy - hh; y < cy + hh; y++) for (var x = cx - hw; x < cx + hw; x++) { var q = (y * P.w + x) * 4; s += Math.abs(lum(P.d, q) - lum(P.d, q + 4)) + Math.abs(lum(P.d, q) - lum(P.d, q + 4 * P.w)); n++; }
      return s / n / 2;
    }
    function differ(A, B, hw, hh, each) {
      var n = 0, cx = A.w >> 1, cy = A.h >> 1;
      for (var y = cy - hh; y < cy + hh; y++) for (var x = cx - hw; x < cx + hw; x++) {
        var q = (y * A.w + x) * 4, dd = Math.abs(A.d[q] - B.d[q]) + Math.abs(A.d[q + 1] - B.d[q + 1]) + Math.abs(A.d[q + 2] - B.d[q + 2]);
        if (dd >= 6) { n++; if (each) each(x, y, q); }
      }
      return n;
    }
    var ZMAX = RTS_ZOOMS.length - 1;

    /* ---------------- BLADES ---------------- */
    look(grass.at, ZMAX);
    R3.bladesOff = true; var bOff = pic();
    R3.bladesOff = false; var bOn = pic(), bOn2 = pic();
    o.blades = { off: step(bOff, 150, 100), on: step(bOn, 150, 100), control: differ(bOn, bOn2, 150, 100), near: _r3dNear(_rtsZoom() * (R3.scale || 1)) };
    look(grass.at, 0);
    R3.bladesOff = true; var fOff = pic();
    R3.bladesOff = false; var fOn = pic();
    o.bladesFar = { diff: differ(fOff, fOn, fOn.w >> 1, fOn.h >> 1), near: _r3dNear(_rtsZoom() * (R3.scale || 1)) };

    /* sand, the same way: its grains */
    var sand = most(RTS_T_SAND, 1);
    o.sandShare = sand.share;
    look(sand.at, ZMAX);
    R3.bladesOff = true; var sOff = pic();
    R3.bladesOff = false; var sOn = pic();
    o.sand = { off: step(sOff, 40, 28), on: step(sOn, 40, 28) };

    /* ---------------- TUFTS ---------------- */
    look(grass.at, ZMAX - 1);
    R3.shadowCacheOff = true;
    var q0 = R3.q; R3.q = { shadow: 0 }; var tNone = pic(); R3.q = q0;
    R3.tuftCast = false; var tNow = pic();
    R3.tuftCast = true; var tWas = pic();
    R3.tuftCast = false; R3.shadowCacheOff = false;
    var darker = 0;
    o.tufts = { now: differ(tNone, tNow, 200, 140), was: differ(tNone, tWas, 200, 140, function (x, y, q) { if (lum(tWas.d, q) < lum(tNone.d, q) - 4) darker++; }) };
    o.tufts.darker = darker;
    o.tufts.casts = R3.world.filter(function (m) { return m.cast !== undefined && m.cast < m.verts; }).length;

    /* ---------------- AFLOAT ---------------- */
    look(sea.at, ZMAX - 1);
    var ship = _rtsSpawnUnit('player', 'destroyer', sea.at[0], sea.at[1]);
    ship.x = sea.at[0]; ship.z = sea.at[1]; ship.rot = 0.5; ship.order = null;
    R3.afloatAmt = 0; var aOff = pic(); o.afloatsOff = R3.afloats;
    R3.afloatAmt = undefined; var aOn = pic(); o.afloats = R3.afloats;
    var sc = _rtsWorldToScreen(ship.x, _rtsElev(ship.x, ship.z), ship.z), ppu = _rtsZoom() * (sc.scale || 1), rr = (rtsUnitDef('destroyer').r || 2) * R3D_AFLOAT_LONG * ppu;
    var A = { n: 0, far: 0, lighter: 0, darker: 0 };
    differ(aOff, aOn, aOn.w >> 1, aOn.h >> 1, function (x, y, q) {
      A.n++;
      if (Math.hypot(x - sc.x, y - sc.y) > rr * 1.25) A.far++;
      if (lum(aOn.d, q) > lum(aOff.d, q) + 4) A.lighter++; else if (lum(aOn.d, q) < lum(aOff.d, q) - 4) A.darker++;
    });
    o.afloat = A;
    ship.hidden = 1; _rtsRFrame(0); o.afloatsHidden = R3.afloats; ship.hidden = 0;
    /* a tank stood beside her, in the same view: what it IS refuses it, not where it is */
    var tank = _rtsSpawnUnit('player', 'tank', grass.at[0], grass.at[1]);
    tank.x = ship.x + 6; tank.z = ship.z;
    _rtsRFrame(0); o.afloatsWithTank = R3.afloats; tank.dead = true;

    /* ---------------- CAMEOS ---------------- */
    function box(url) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () {
          var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          var x = c.getContext('2d'); x.drawImage(im, 0, 0);
          var d = x.getImageData(0, 0, c.width, c.height).data, x0 = c.width, x1 = -1, y0 = c.height, y1 = -1, clear = 0;
          for (var yy = 0; yy < c.height; yy++) for (var xx = 0; xx < c.width; xx++) { var a = d[(yy * c.width + xx) * 4 + 3]; if (a > 20) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); } else clear++; }
          res({ fill: Math.max(x1 - x0 + 1, y1 - y0 + 1) / c.width, clear: clear / (c.width * c.height) });
        };
        im.src = url;
      });
    }
    var now = _rtsMakeIcons('player');
    window.RTS_ICON_WHOLE = true; var was = _rtsMakeIcons('player'); window.RTS_ICON_WHOLE = false;
    o.cameo = { tank: await box(now.tank), tankWas: await box(was.tank), rifle: await box(now.rifle), power: await box(now.power), powerWas: await box(was.power) };
    var tile = document.querySelector('#rtsList .rts-tile .ico');
    o.tileImg = !!(tile && tile.tagName === 'IMG' && tile.naturalWidth > 0);
    R3.inkAmt = undefined;
    return o;
  });

  var bar = await g.page.evaluate(function () {
    function mask(el, pseudo) { var c = getComputedStyle(el, pseudo || null); return (c.webkitMaskImage || c.maskImage || '') + ''; }
    function one(id) { var b = document.getElementById(id), c = getComputedStyle(b), r = b.getBoundingClientRect(), k = getComputedStyle(b, '::before');
      return { text: b.textContent, font: parseFloat(c.fontSize), mask: mask(b, '::before'), w: parseFloat(k.width), bw: r.width }; }
    var o = { save: one('rtsSaveBtn'), load: one('rtsLoadBtn'), mute: one('rtsMute') };
    var m = document.getElementById('rtsMute'), A = window._rtsA;
    o.audio = !!A;
    if (A) { var on = mask(m, '::before'); rtsMuteToggle(); o.off = { cls: m.className, text: m.textContent, mask: mask(m, '::before') !== on && /^url\("data:image\/svg/.test(mask(m, '::before')) };
      rtsMuteToggle(); o.onCls = m.className; }
    o.ops = [].map.call(document.querySelectorAll('#rcgRts .rts-ops button[data-mode]'), function (b) { var i = b.querySelector('.ic'); return { text: b.textContent.trim(), ic: !!i, mask: i ? mask(i).slice(0, 40) : '', w: i ? i.getBoundingClientRect().width : 0 }; });
    var t = document.querySelector('#rtsList .rts-tile'), ir = t.querySelector('.ico').getBoundingClientRect(), nr = t.querySelector('.nm').getBoundingClientRect(), cr = t.querySelector('.ct').getBoundingClientRect(), tr = t.getBoundingClientRect();
    o.tile = { pic: ir.bottom - tr.top, name: nr.top - tr.top, cost: cr.bottom - tr.top, h: tr.height };
    var gb = document.getElementById('rtsGfxBtn'), gc = gb ? getComputedStyle(gb) : null;
    o.gfx = gb ? { bg: gc.backgroundColor, col: gc.color, radius: gc.borderRadius } : null;
    return o;
  });
  if (process.env.CLOSEUP_DUMP) console.log(JSON.stringify(out), JSON.stringify(bar));
  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (out.on) {
    var f2 = function (v) { return v.toFixed(2); };
    S.ok('the map has open grass and open sea to look at', out.grassShare > 0.8 && out.seaShare > 0.8, f2(out.grassShare) + ' grass, ' + f2(out.seaShare) + ' sea');
    /* blades */
    S.eq('control: the same frame twice is the same frame', out.blades.control, 0);
    S.eq('the nearest zoom is close to', out.blades.near, 1);
    S.ok('close to, grass is finer for its blades', out.blades.on > out.blades.off * 1.25, f2(out.blades.on) + ' levels between neighbours, ' + f2(out.blades.off) + ' without them');
    S.eq('the widest zoom is not', out.bladesFar.near, 0);
    S.eq('...and there the frame is the same to the byte, blades or none', out.bladesFar.diff, 0);
    /* tufts */
    S.ok('the meadow\'s chunks keep their tufts apart from what casts', out.tufts.casts > 0, out.tufts.casts + ' chunks');
    S.ok('cast as they were, the tufts put dark smudges on open grass', out.tufts.was > 150 && out.tufts.darker > out.tufts.was * 0.9, out.tufts.was + ' pixels, ' + out.tufts.darker + ' of them darker');
    S.ok('...and now the sun\'s pass changes next to nothing there', out.tufts.now < out.tufts.was * 0.1, out.tufts.now + ' pixels');
    /* afloat */
    S.eq('a destroyer at anchor has its water drawn', out.afloats, 1);
    S.eq('...and none with R3.afloatAmt 0', out.afloatsOff, 0);
    S.ok('...foam lighter than the sea and shade darker', out.afloat.lighter > 40 && out.afloat.darker > 40, out.afloat.lighter + ' lighter, ' + out.afloat.darker + ' darker of ' + out.afloat.n);
    S.eq('...round the hull and nowhere else', out.afloat.far, 0);
    S.eq('a boat under the surface has none', out.afloatsHidden, 0);
    S.eq('...nor has a tank', out.afloatsWithTank, 1);
    /* cameos */
    var C = out.cameo;
    S.ok('a build tile shows a picture', out.tileImg, String(out.tileImg));
    S.ok('a tank\'s picture fills its plate', C.tank.fill > 0.7, f2(C.tank.fill) + ' of the plate\'s side');
    S.ok('...where its sprite\'s margin left it under half', C.tankWas.fill < 0.5, f2(C.tankWas.fill));
    S.ok('...and so does a rifle squad\'s', C.rifle.fill > 0.7, f2(C.rifle.fill));
    S.ok('a building\'s had no margin and is as it was', Math.abs(C.power.fill - C.powerWas.fill) < 0.02 && C.power.fill > 0.7, f2(C.power.fill) + ' and ' + f2(C.powerWas.fill));
    S.ok('the plate behind a picture is clear', C.tank.clear > 0.3, f2(C.tank.clear) + ' of it clear');
  }
  S.ok('there is a patch of sand to look at', out.sandShare > 0.8, f2(out.sandShare));
  S.ok('close to, sand is grains', out.sand.on > out.sand.off * 1.5, f2(out.sand.on) + ' levels between neighbours, ' + f2(out.sand.off) + ' without them');
  S.ok('a tile\'s name and price stand under its picture, not over it', bar.tile.name >= bar.tile.pic - 0.5 && bar.tile.cost <= bar.tile.h + 0.5 && bar.tile.pic > bar.tile.h * 0.5,
       'the picture ends at ' + bar.tile.pic.toFixed(1) + ' px, the name starts at ' + bar.tile.name.toFixed(1) + ', of ' + bar.tile.h.toFixed(1));
  /* the bar */
  ['save', 'load', 'mute'].forEach(function (k) {
    var b = bar[k];
    S.ok('the ' + k + ' button shows a drawn picture, not its glyph', b.font === 0 && /^url\("data:image\/svg/.test(b.mask) && b.w > b.bw * 0.4, b.text + ' at font ' + b.font + ', its picture ' + b.w + ' of ' + b.bw + ' px');
  });
  S.ok('...each a different one', bar.save.mask !== bar.load.mask && bar.load.mask !== bar.mute.mask && bar.save.mask !== bar.mute.mask, '');
  S.ok('...and keeps its glyph as its text', bar.save.text === '\ud83d\udcbe' && bar.load.text === '\ud83d\udcc2' && bar.mute.text === '\ud83d\udd0a', [bar.save.text, bar.load.text, bar.mute.text].join(' '));
  if (bar.audio) {
    S.ok('muted, the speaker is the crossed one', /\boff\b/.test(bar.off.cls) && bar.off.mask && bar.off.text === '\ud83d\udd07', JSON.stringify(bar.off));
    S.ok('...and the plain one again with the sound back', !/\boff\b/.test(bar.onCls), bar.onCls);
  }
  S.ok('REPAIR and SELL carry a drawn mark beside the word', bar.ops.length === 2 && bar.ops.every(function (b) { return b.ic && /^url\("data:image\/svg/.test(b.mask) && b.w > 6; }) && bar.ops[0].text === 'REPAIR' && bar.ops[1].text === 'SELL', JSON.stringify(bar.ops));
  S.ok('the graphics button is one of the bar\'s: dark, rounded, light lettering', !!bar.gfx && /rgba\(255, 255, 255, 0\.0/.test(bar.gfx.bg) && parseFloat(bar.gfx.radius) >= 5 && bar.gfx.col !== 'rgb(0, 0, 0)', JSON.stringify(bar.gfx));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
