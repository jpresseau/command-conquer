/* sprites/props.js - unit scaling and fit, pads, corpses, scorch, craters, fire, crates and
   the effect sheet. Part of rts.sprites, the sprite baker. */

/* How much to shrink a unit to land it on RTS_UNIT_SPAN. Measured once per key from the
   UNSCALED model - the memo is seeded with 1 first, so the _sprUnitModel call below reads that
   and returns raw geometry instead of recursing. The union of every variant is measured, not
   just the default one, so a prone squad and a turret half both end up on the same scale. */
var _RTS_USCALE = {};
function _sprUnitScale(key) {
  if (_RTS_USCALE[key] != null) return _RTS_USCALE[key];
  _RTS_USCALE[key] = 1;
  var models = [_sprUnitModel(key, 'player', false, null)];
  if (rtsUnitDef(key).kind === 'infantry') models.push(_sprUnitModel(key, 'player', true, null));
  var raw = _r3FitSize(models, 2), want = RTS_UNIT_SPAN[key];
  return (_RTS_USCALE[key] = (want && raw > 0) ? want / raw : 1);
}
/* The canvas every variant of one unit bakes into. It has to be the SAME square for all of
   them: hull and turret are drawn at the same screen position and would separate otherwise,
   and a prone squad that changed size would jump. So the size is measured from the union of
   every variant, at every facing, and memoised per key. */
var _RTS_UFIT = {};
function _sprUnitFit(key, side) {
  if (_RTS_UFIT[key] != null) return _RTS_UFIT[key];
  var models = [_sprUnitModel(key, side, false, null)];
  if (rtsUnitDef(key).kind === 'infantry') models.push(_sprUnitModel(key, side, true, null));
  return (_RTS_UFIT[key] = _r3FitSize(models, 2));
}
/* How many facings a unit is baked at. Red Alert uses THIRTY-TWO for vehicles and eight for
   infantry - `Facings: 32, UseClassicFacings: True` against a plain `Facings: 8` throughout
   mods/ra/sequences. We were baking eight for everything, which is why a tank turning in the
   original sweeps round while ours popped through 45-degree steps. Infantry really are eight in
   the original, so they stay eight; the cost is paid only where it shows. */
function _sprFacingsFor(d) { return d.kind === 'infantry' ? 8 : 32; }
function _sprFacings(key) { return _sprFacingsFor(rtsUnitDef(key)); }

function _sprUnit(key, side, prone, part) {
  if (typeof _rtsArtReady === 'function' && _rtsArtReady()) {
    var real = _mixUnit(key, side, prone, part);
    if (real) return real;
  }
  var m = _sprUnitModel(key, side, prone, part), size = _sprUnitFit(key, side);
  var frames = [], N = _sprFacings(key);
  /* Same RTS_PS scale-up the structures get - see sprites/bake.js. Applied AFTER the yaw so
     every facing is scaled identically, and the fit square grows with it so the measurement
     _r3FitSize made at 1x still holds: it is the worst case over 32 facings, and scaling is
     uniform, so nothing that fitted before can clip now. A unit is where the extra pixels pay
     best - an infantryman is about ten art pixels tall, and at that size a rifle is one. */
  for (var f = 0; f < N; f++) {
    var ym = _r3Yaw(m, -f / N * Math.PI * 2);
    var cv = _r3BakeCentred(RTS_PS === 1 ? ym : _r3Scale(ym, RTS_PS), size * RTS_PS);
    _sprEdge(cv);
    /* the turret is drawn ON the hull, so it must not cast a second ground shadow */
    var done = (part === 'turret') ? cv : _sprShadow(cv, 1 * RTS_PS, 2 * RTS_PS);
    done.ps = RTS_PS;
    frames.push(done);
  }
  return frames;
}
/* Which units carry a separately-rotating turret. Artillery is deliberately NOT on this list:
   a howitzer traverses on its chassis, and a fixed forward tube is what makes it read as
   artillery rather than as another tank. */
/* Which hulls carry a turret that aims independently of the body. The gun ships do - a cruiser,
   a destroyer and a gunboat all traverse their guns - and their SHPs are laid out that way, so
   leaving them out drew the turret frames as if they were hull facings. */
var RTS_TURRETED = { tank:1, light:1, heavy:1, destroyer:1, gunboat:1, cruiser:1 };

/* The concrete apron a structure stands on. In the reference every building sits on a pale
   irregular pad noticeably larger than itself - it is what stops a base looking like
   furniture set down on a lawn. Baked per footprint size and reused. */
function _sprPad(wCells, hCells) {
  /* At the procedural density, like the building standing on it. A pad is one of the largest
     unbroken areas on the map - a 3x3 footprint is 92x88 pixels of it - and baked at RTS_TS it
     magnified six times on a dpr-3 phone while the building it belongs to magnified three. The
     ragged verge is the whole point of the shape, and a verge quantised to 12-pixel blocks is
     not ragged. Every length below is in pad pixels and scales with K; the noise is sampled at
     K times the frequency so the wobble keeps its size in ART pixels rather than becoming
     twice as fine and reading as a straight edge. */
  var K = RTS_PS;
  var W = (wCells * RTS_TS + 20) * K, H = (hCells * RTS_TS + 16) * K;
  var t = _sprMake(W, H), g = t.g, P = RTS_PAL.conc, seed = wCells * 31 + hCells * 7;
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x += 2) {
      /* Distance to the edge of a rounded rect, wobbled by noise, gives a ragged verge. */
      var dx = Math.max(0, Math.abs(x - W / 2) - (W / 2 - 11 * K));
      var dy = Math.max(0, Math.abs(y - H / 2) - (H / 2 - 9 * K));
      var e = Math.hypot(dx, dy) + (_sprVN(x, y, 9 * K, seed) - 0.5) * 9 * K;
      if (e > 5 * K) continue;
      var h = _sprHash(x >> 1, y >> 1, seed + 5);
      g.globalAlpha = e > 3 * K ? 0.5 : 1;
      _sprRect(g, x, y, 2, 2, h < 0.18 ? P[2] : (h < 0.66 ? P[0] : P[1]));
    }
  }
  g.globalAlpha = 1;
  t.c.ps = K;
  return t.c;
}

/* Corpses. INFANTRY.CPP leaves ANIM_CORPSE1..3 behind depending on how the soldier died,
   and they sit in LAYER_SURFACE - under everything. Stamped into the terrain here for the
   same reason the scorch marks are: permanent, and free after the frame they appear. */
function _sprCorpse() {
  var out = [];
  for (var v = 0; v < 3; v++) {
    var t = _sprMake(14, 12), g = t.g, seed = v * 71 + 5;
    g.globalAlpha = 0.75;
    for (var i = 0; i < 26; i++) {
      var x = 2 + _sprHash(i, v, seed) * 10, y = 3 + _sprHash(v, i, seed + 3) * 7;
      var h = _sprHash(i, i, seed + 7);
      _sprRect(g, x, y, 1 + (h * 2 | 0), 1, h < 0.45 ? '#3a2b28' : (h < 0.8 ? '#4a3733' : '#5c4038'));
    }
    g.globalAlpha = 0.5;
    _sprEll(g, 7, 9, 5, 2, '#20191a');
    g.globalAlpha = 1;
    out.push(t.c);
  }
  return out;
}

/* Scorch marks and craters - SmudgeClass in the original, SMUDGE_SCORCH1..6 and
   SMUDGE_CRATER1. Stamped permanently into the baked terrain, so a battlefield accumulates
   a record of what happened on it instead of resetting between explosions. */
function _sprScorch() {
  var out = [], TS = RTS_TS;
  for (var v = 0; v < 6; v++) {
    var t = _sprMake(TS, TS), g = t.g, seed = v * 313 + 29;
    for (var y = 0; y < TS; y += 2) {
      for (var x = 0; x < TS; x += 2) {
        /* THE BLOCK CENTRE, not its corner: _sprRect covers x..x+2, so measuring from the
           corner lets a block sit half over the border while still reporting a radius inside
           it. And `fade` is keyed to the TRUE geometric radius rather than the noisy one - the
           cutoff below is applied to a radius with a large noise term added, so a pixel out at
           the canvas edge could pass it and be drawn at whatever alpha the noise gave. Measured
           on the finished sprites, the six scorches carried up to alpha 103 of 255 ON their own
           border: the mark was cut off flat where it ran out of canvas, and since these are
           stamped permanently into the terrain, that left a hard dark RECTANGLE about a cell
           across under every firefight. The ragged outline the noise buys is unchanged; the
           alpha simply reaches zero before the edge now. */
        var dx = (x + 1 - TS / 2) / (TS / 2), dy = (y + 1 - TS / 2) / (TS / 2);
        var rr = Math.hypot(dx, dy);
        var fade = Math.max(0, Math.min(1, (0.86 - rr) / 0.26));
        if (fade <= 0.02) continue;
        var d = rr + (_sprVN(x, y, 7, seed) - 0.5) * 0.75;
        if (d > 0.92) continue;
        var h = _sprHash(x >> 1, y >> 1, seed);
        g.globalAlpha = (1 - d) * 0.85 * fade;
        _sprRect(g, x, y, 2, 2, h < 0.4 ? '#141210' : (h < 0.78 ? '#241f19' : '#312a22'));
      }
    }
    g.globalAlpha = 1;
    out.push(t.c);
  }
  return out;
}
function _sprCrater() {
  var TS = RTS_TS, t = _sprMake(TS, TS), g = t.g;
  for (var y = 0; y < TS; y += 2) {
    for (var x = 0; x < TS; x += 2) {
      /* The same clipped-square fault as the scorch, and worse here: the alpha was a STEP -
         0.6 all the way out to the cutoff rather than a falloff - so the crater's border alpha
         measured 153 of 255, which is 0.6 exactly. A hole in the ground with four straight
         sides. The rim and bowl structure below is untouched; `fade` only guarantees the mark
         runs out before the canvas does. */
      var dx = (x + 1 - TS / 2) / (TS / 2), dy = (y + 1 - TS / 2) / (TS / 2);
      var rr = Math.hypot(dx, dy);
      var fade = Math.max(0, Math.min(1, (0.84 - rr) / 0.24));
      if (fade <= 0.02) continue;
      var d = rr + (_sprVN(x, y, 6, 71) - 0.5) * 0.5;
      if (d > 0.88) continue;
      g.globalAlpha = (d > 0.6 ? 0.6 : 0.95) * fade;
      /* Lit north rim, dark bowl, so it reads as a hole rather than a stain. */
      var col = (d > 0.62 && dy < 0) ? '#6b6252' : (d < 0.35 ? '#171410' : '#2c261e');
      _sprRect(g, x, y, 2, 2, col);
    }
  }
  g.globalAlpha = 1;
  return t.c;
}
/* Flame frames. ANIM_FIRE_SMALL is what an explosion chains into and what rides a burning
   unit; it has to read at a glance without drowning the sprite underneath. */
function _sprFire() {
  /* A TONGUE, NOT A STACK OF BARS. The previous generator drew sixteen horizontal bars up a
     wobbling axis, 5 pixels wide at the bottom and 1 at the top, each 2 tall and stepping up by
     1.1 - so they OVERLAPPED into a solid slab at the base and separated into a thin stalk at
     the tip. Rendered, that is a wide white splash with an orange stick out of the top of it;
     it reads as a candle, or as spilled paint, and it is the sprite a burning building wears
     for as long as it burns. Doubling its density made it a smoother version of the same wrong
     shape, which is what sent this back for a rewrite rather than a rescale.

     A flame is a FIELD, so this evaluates one. Height runs 0 at the fuel to 1 at the tip; the
     half-width pinches to nothing at the very base (fire necks where it leaves what it is
     burning), swells through the lower third and tapers to a point. Colour comes from a
     temperature that falls both with height and with distance from the axis, which is what puts
     a white core inside a yellow body inside an orange edge - a bar chart cannot do that,
     because every pixel in a bar is the same colour. The axis snakes, the tip height varies per
     frame, and both are hashed, so five frames flicker instead of pulsing.

     Authored in art pixels and scaled by K on the way in, like everything else here. */
  var K = RTS_PS, out = [], n = 5;
  var W = 16 * K, H = 20 * K;
  for (var f = 0; f < n; f++) {
    var t = _sprMake(W, H), seed = f * 97 + 11;
    var img = t.g.createImageData(W, H), d = img.data;
    /* how far up the canvas this frame's tip reaches - the flicker */
    var top = 0.78 + _sprHash(f, 3, seed) * 0.22;
    for (var y = 0; y < H; y++) {
      var h = (H - 1 - y) / (H - 1);                 /* 0 at the base, 1 at the top */
      if (h > top) continue;
      var hn = h / top;                              /* 0..1 within this frame's flame */
      /* the axis snakes, more freely the higher it gets */
      var ax = W / 2 + Math.sin(hn * 3.4 + f * 1.9) * W * 0.15 * hn;
      /* pinched at the fuel, widest in the lower third, pointed at the tip */
      var hw = W * 0.44 * Math.pow(1 - hn, 0.62) * Math.min(1, 0.18 + hn * 7);
      if (hw < 0.6) continue;
      for (var x = 0; x < W; x++) {
        var dd = Math.abs(x + 0.5 - ax) / hw;
        if (dd > 1) continue;
        /* temperature: hottest on the axis and low down, with a little noise so the edge of
           the tongue is ragged rather than a clean parabola */
        var temp = (1 - dd * dd * 0.85) * (1 - hn * 0.72)
                 + (_sprVN(x * 2, y * 2 + f * 40, 3 * K, seed) - 0.5) * 0.22;
        var col;
        if (temp > 0.74) col = [255, 246, 214];
        else if (temp > 0.52) col = [255, 214, 122];
        else if (temp > 0.32) col = [255, 150, 48];
        else if (temp > 0.14) col = [220, 84, 26];
        else col = [140, 46, 18];
        /* the outer millimetre fades, so the tongue has an edge rather than a cutout */
        var a = dd > 0.86 ? Math.max(0, (1 - dd) / 0.14) : 1;
        var o = (y * W + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
        d[o + 3] = Math.round(255 * a);
      }
    }
    t.g.putImageData(img, 0, 0);
    t.c.ps = K;
    out.push(t.c);
  }
  return out;
}

/* Muzzle flashes and explosions, as small frame strips. */
/* A crate: a wooden box, bright against both the grass and the ore, because an object the
   player is meant to notice and go and get has to be findable at this zoom.

   ONE version, not two. CRATE.CPP also places OVERLAY_WATER_CRATE on cells that are clear
   for SPEED_FLOAT - but that is collectable in the original because RA has ships, and this
   game has none. See the note on RTS_CRATES. */
function _sprCrate() {
  /* At the procedural density, like everything else the player looks AT rather than walks on.
     Every length here is in art pixels and carries K, so the crate is the same size on screen
     and its slats and stencil land on a grid K times finer. */
  var K = RTS_PS, TS = RTS_TS * K;
  var t = _sprMake(TS, TS), g = t.g, c = TS / 2;
  _sprRect(g, c - 7 * K, c - 2 * K, 14 * K, 4 * K, '#2b2117');    /* shadow under it */
  _sprRect(g, c - 7 * K, c - 8 * K, 14 * K, 11 * K, '#9c7038');   /* crate body */
  _sprRect(g, c - 7 * K, c - 8 * K, 14 * K, 2 * K, '#c08f4c');    /* lit top edge */
  _sprRect(g, c - 7 * K, c + 1 * K, 14 * K, 2 * K, '#6b4a22');    /* shaded bottom edge */
  _sprRect(g, c - 7 * K, c - 4 * K, 14 * K, K, '#c9a05a');        /* slat lines */
  _sprRect(g, c - 7 * K, c - 1 * K, 14 * K, K, '#c9a05a');
  _sprRect(g, c - 1 * K, c - 8 * K, 2 * K, 11 * K, '#6b4a22');    /* upright brace */
  _sprRect(g, c - 4 * K, c - 6 * K, 3 * K, 3 * K, '#e8c661');     /* stencil mark */
  t.c.ps = K;
  return t.c;
}
/* BAKED AT THE PROCEDURAL DENSITY, like everything else that stands on the map.

   These were the last sprites still authored one-to-one against RA's 24-pixel cell, and the
   only reason nobody noticed is that an explosion is over in half a second. Measured on a dpr-3
   phone at the top zoom, where a cell covers 144 device pixels: buildings and units are baked
   at RTS_TS * RTS_PS and magnify 3x, while every fireball, muzzle flash, bullet strike, splash
   and smoke puff magnified SIX times. The blockiest thing on the screen was the thing a
   firefight makes you look at.

   Every size here is a seed that the rest of the frame derives from - `s` and `c` for the
   fireball, `ps`/`pc`, `ss`/`sc`, `ms`/`mc` for the others - so scaling the seed scales the
   whole construction, and the discs are then rasterised on the finer grid rather than being
   blown up afterwards. That is the difference between more pixels and more detail: the lobes
   come out round instead of stepped. Only the handful of absolute feature sizes - a 2-pixel
   debris speck, a 1-pixel spark - need the factor written on them, and they carry it so they
   stay the same size ON SCREEN rather than shrinking to nothing.

   Each canvas is tagged with the density it was baked at, and every draw site divides by that
   tag, exactly as the building and unit paths already do. Real Red Alert artwork carries no
   tag, reads as 1, and is untouched - which matters here because `_mixFx` replaces these
   role by role, so a mixed set has both densities in it at once. */
function _sprFx() {
  var boom = [], i, K = RTS_PS;
  var cols = ['#fff4cc', '#ffd070', '#ff9a2e', '#e0561c', '#8a3410', '#3a2418'];
  /* A FIREBALL, NOT A BULLSEYE. The first version drew each frame as two concentric filled
     circles, and in play that read as a flat white disc punched into the picture - the palette
     ramp was right and the SHAPE was wrong, because nothing that explodes is round. Each frame
     is now a cluster of overlapping lobes: dark rim lobes first, then hot lobes drawn smaller
     and biased UP-CENTRE, so every frame has an irregular silhouette, a bright core that sits
     above centre the way a real fireball lifts, and a dark fringe for the hot colours to read
     against. Late frames pull the hot lobes apart and let the soot dominate, which is the
     collapse into smoke. Deterministic per frame - explosions must not shimmer between bakes. */
  for (i = 0; i < 6; i++) {
    var s = (20 + i * 13) * K, t = _sprMake(s, s), g = t.g, c = s / 2;
    var rim = cols[Math.min(5, i + 2)], hot = cols[Math.min(5, i)], core = cols[Math.max(0, i - 1)];
    var spread = 0.30 + i * 0.09;                 /* lobes drift apart as the ball collapses */
    for (var lb = 0; lb < 7; lb++) {
      var la = lb / 7 * 6.283 + i * 0.9;
      var lr = c * spread * (0.5 + _sprHash(lb, i, 31) * 0.8);
      var lx = c + Math.cos(la) * lr, ly = c + Math.sin(la) * lr;
      _sprDisc(g, lx, ly, c * (0.42 - i * 0.03) * (0.7 + _sprHash(i, lb, 37) * 0.5), rim);
    }
    for (var lh = 0; lh < 5; lh++) {
      var ha = lh / 5 * 6.283 + i * 1.7;
      var hr = c * spread * 0.7 * (0.4 + _sprHash(lh, i, 41) * 0.8);
      /* biased up: heat rises, so the bright side of the ball is the top */
      var hx = c + Math.cos(ha) * hr, hy = c - c * 0.08 + Math.sin(ha) * hr * 0.8;
      _sprDisc(g, hx, hy, c * (0.30 - i * 0.025) * (0.7 + _sprHash(lh, i, 43) * 0.5), hot);
    }
    if (i < 4) _sprDisc(g, c, c - c * 0.12, c * (0.16 - i * 0.02), core);
    if (i < 3) for (var k = 0; k < 6; k++) {                     /* debris specks */
      var a = k / 6 * 6.283 + i;
      _sprRect(g, c + Math.cos(a) * c * 0.8, c + Math.sin(a) * c * 0.8, 2 * K, 2 * K, cols[i + 1]);
    }
    boom.push(t.c);
  }
  var flash = [];
  for (i = 0; i < 3; i++) {
    var f = _sprMake(9 * K, 9 * K);
    _sprDisc(f.g, 4.5 * K, 4.5 * K, (4 - i) * K,
             i === 0 ? '#fff6d0' : (i === 1 ? '#ffd070' : '#ff9a30'));
    flash.push(f.c);
  }
  /* Combat_Anim's PIFF: a small dirty spark, for a bullet strike. Grey-white, not fire -
     a rifle round hitting a hull does not look like a shell going off. */
  var piff = [];
  for (i = 0; i < 4; i++) {
    var ps = (8 + i * 4) * K, pt = _sprMake(ps, ps), pg = pt.g, pc = ps / 2;
    var pcol = ['#ffffff', '#dfe6ee', '#9fadbb', '#6b7784'][i];
    _sprDisc(pg, pc, pc, Math.max(K, (ps / 2 - K) * (i < 2 ? 0.55 : 0.8)), pcol);
    for (var pk = 0; pk < 4; pk++) {
      var pa = pk / 4 * 6.283 + i * 0.7;
      _sprRect(pg, pc + Math.cos(pa) * pc * 0.7, pc + Math.sin(pa) * pc * 0.7, K, K, '#f2f6fa');
    }
    piff.push(pt.c);
  }
  /* ...and the water set: a column of water thrown up, with a ring spreading on the surface.
     Drawn as a ring plus a collapsing column rather than a pale disc - a filled circle at
     this size reads as a cloud, not as a shell landing in a lake. The canvas has to stay
     SQUARE: the effect renderer draws every frame at width x width. */
  var splash = [];
  for (i = 0; i < 5; i++) {
    var ss = (20 + i * 9) * K, st = _sprMake(ss, ss), sg = st.g, sc = ss / 2;
    var kk = i / 4;
    /* the ring, flattened because the camera looks along the ground plane */
    var rr = (sc - 2 * K) * (0.28 + kk * 0.72);
    for (var sk = 0; sk < 22; sk++) {
      var sa = sk / 22 * 6.283;
      _sprRect(sg, sc + Math.cos(sa) * rr, sc + Math.sin(sa) * rr * 0.42, 2 * K, 2 * K,
        i < 3 ? '#eaf6fc' : '#b6d6e6');
    }
    /* the column: tall and bright at first, collapsing back into the ring */
    if (i < 3) {
      var cw = (5 - i) * K, ch = ss * 0.5 * (1 - kk * 0.7);
      _sprRect(sg, sc - cw / 2, sc - ch, cw, ch, '#dff0f8');
      _sprRect(sg, sc - cw / 2, sc - ch, cw, Math.max(2 * K, ch * 0.35), '#ffffff');
    }
    /* droplets, thrown up and out */
    for (var dk = 0; dk < 9; dk++) {
      var da = dk / 9 * 6.283 + i, dd = rr * (0.7 + _sprHash(dk, i, 7) * 0.6);
      _sprRect(sg, sc + Math.cos(da) * dd, sc + Math.sin(da) * dd * 0.42 - (2 - kk * 2) * 3 * K,
        2 * K, 2 * K, '#ffffff');
    }
    splash.push(st.c);
  }
  /* Flame, for ADATA's burn ladder. Deliberately NOT a new generator: `_sprFire()` already
     draws this game's flame, for a building coming apart, and a burning building should not
     look like a different fire from a dying one. It returns 16x20 - taller than wide, which
     is what a flame is - so the effect renderer had to stop forcing every frame square. */
  var fire = null;   /* filled in by _rtsSprites from the ONE flame set - see below */
  /* SmokeM: what a fire leaves when it has burnt down. Grey, rising, thinning out. Drawn
     with the same square-canvas rule the effect renderer needs. */
  var smoke = [];
  for (i = 0; i < 6; i++) {
    var ms = 30 * K, mt = _sprMake(ms, ms), mg = mt.g, mc = ms / 2, mu = i / 5;
    var puffs = [[0.00, 0.16, '#6b6560'], [0.30, 0.22, '#7b746e'],
                 [0.62, 0.26, '#8a837c'], [0.92, 0.30, '#98918a']];
    for (var pk2 = 0; pk2 < puffs.length; pk2++) {
      var rise = puffs[pk2][0] + mu * 0.5;
      if (rise > 1.15) continue;
      var rad = ms * puffs[pk2][1] * (0.45 + rise * 0.85) * (1 - mu * 0.25);
      _sprDisc(mg, mc + Math.sin(rise * 4.1 + i) * ms * 0.10,
        ms - 3 * K - rise * (ms - 6 * K), Math.max(K, rad), puffs[pk2][2]);
    }
    smoke.push(mt.c);
  }
  /* Tag before the real-art override, so a mixed set keeps each role's own density. */
  [boom, flash, piff, splash, smoke].forEach(function (set) {
    for (var q = 0; q < set.length; q++) set[q].ps = K;
  });
  var drawn = { boom: boom, flash: flash, piff: piff, splash: splash, fire: fire, smoke: smoke };
  /* The originals win where they exist, role by role, keeping the drawn one for anything the
     archives do not cover - so a partial set degrades to a mixture rather than to nothing. */
  var real = (typeof _mixFx === 'function') ? _mixFx() : null;
  if (real) {
    for (var rk in real) if (real[rk]) drawn[rk] = real[rk];
  }
  return drawn;
}

