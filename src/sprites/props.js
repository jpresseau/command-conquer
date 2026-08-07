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
  for (var f = 0; f < N; f++) {
    var cv = _r3BakeCentred(_r3Yaw(m, -f / N * Math.PI * 2), size);
    _sprEdge(cv);
    /* the turret is drawn ON the hull, so it must not cast a second ground shadow */
    frames.push(part === 'turret' ? cv : _sprShadow(cv, 1, 2));
  }
  return frames;
}
/* Which units carry a separately-rotating turret. Artillery is deliberately NOT on this list:
   a howitzer traverses on its chassis, and a fixed forward tube is what makes it read as
   artillery rather than as another tank. */
var RTS_TURRETED = { tank:1, light:1, heavy:1 };

/* The concrete apron a structure stands on. In the reference every building sits on a pale
   irregular pad noticeably larger than itself - it is what stops a base looking like
   furniture set down on a lawn. Baked per footprint size and reused. */
function _sprPad(wCells, hCells) {
  var W = wCells * RTS_TS + 20, H = hCells * RTS_TS + 16;
  var t = _sprMake(W, H), g = t.g, P = RTS_PAL.conc, seed = wCells * 31 + hCells * 7;
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x += 2) {
      /* Distance to the edge of a rounded rect, wobbled by noise, gives a ragged verge. */
      var dx = Math.max(0, Math.abs(x - W / 2) - (W / 2 - 11));
      var dy = Math.max(0, Math.abs(y - H / 2) - (H / 2 - 9));
      var e = Math.hypot(dx, dy) + (_sprVN(x, y, 9, seed) - 0.5) * 9;
      if (e > 5) continue;
      var h = _sprHash(x >> 1, y >> 1, seed + 5);
      g.globalAlpha = e > 3 ? 0.5 : 1;
      _sprRect(g, x, y, 2, 2, h < 0.18 ? P[2] : (h < 0.66 ? P[0] : P[1]));
    }
  }
  g.globalAlpha = 1;
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
        var dx = (x - TS / 2) / (TS / 2), dy = (y - TS / 2) / (TS / 2);
        var d = Math.hypot(dx, dy) + (_sprVN(x, y, 7, seed) - 0.5) * 0.75;
        if (d > 0.92) continue;
        var h = _sprHash(x >> 1, y >> 1, seed);
        g.globalAlpha = (1 - d) * 0.85;
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
      var dx = (x - TS / 2) / (TS / 2), dy = (y - TS / 2) / (TS / 2);
      var d = Math.hypot(dx, dy) + (_sprVN(x, y, 6, 71) - 0.5) * 0.5;
      if (d > 0.88) continue;
      g.globalAlpha = d > 0.6 ? 0.6 : 0.95;
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
  var out = [], n = 5;
  for (var f = 0; f < n; f++) {
    var t = _sprMake(16, 20), g = t.g, seed = f * 97 + 11;
    for (var i = 0; i < 16; i++) {
      var yy = 19 - (i * 1.1 + _sprHash(i, f, seed) * 5);
      var wob = Math.sin((i / 16) * 3.1 + f * 1.3) * 3;
      var wx = 8 + wob - 2, w = Math.max(1, 5 - i * 0.25);
      var k = i / 16;
      var col = k < 0.32 ? '#fff2c0' : (k < 0.55 ? '#ffcf6a' : (k < 0.78 ? '#ff9a2e' : '#e0561c'));
      _sprRect(g, wx, yy, w, 2, col);
    }
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
  var t = _sprMake(RTS_TS, RTS_TS), g = t.g, c = RTS_TS / 2;
  _sprRect(g, c - 7, c - 2, 14, 4, '#2b2117');           /* shadow under it */
  _sprRect(g, c - 7, c - 8, 14, 11, '#9c7038');          /* crate body */
  _sprRect(g, c - 7, c - 8, 14, 2, '#c08f4c');           /* lit top edge */
  _sprRect(g, c - 7, c + 1, 14, 2, '#6b4a22');           /* shaded bottom edge */
  _sprRect(g, c - 7, c - 4, 14, 1, '#c9a05a');           /* slat lines */
  _sprRect(g, c - 7, c - 1, 14, 1, '#c9a05a');
  _sprRect(g, c - 1, c - 8, 2, 11, '#6b4a22');           /* upright brace */
  _sprRect(g, c - 4, c - 6, 3, 3, '#e8c661');            /* stencil mark */
  return t.c;
}
function _sprFx() {
  var boom = [], i;
  var cols = ['#fff4cc', '#ffd070', '#ff9a2e', '#e0561c', '#8a3410', '#3a2418'];
  for (i = 0; i < 6; i++) {
    var s = 20 + i * 13, t = _sprMake(s, s), g = t.g, c = s / 2;
    _sprDisc(g, c, c, c - 1 - i * 0.5, cols[Math.min(5, i)]);
    if (i < 4) _sprDisc(g, c, c, (c - 1) * 0.55, cols[Math.max(0, i - 1)]);
    if (i < 3) for (var k = 0; k < 6; k++) {                     /* debris specks */
      var a = k / 6 * 6.283 + i;
      _sprRect(g, c + Math.cos(a) * c * 0.8, c + Math.sin(a) * c * 0.8, 2, 2, cols[i + 1]);
    }
    boom.push(t.c);
  }
  var flash = [];
  for (i = 0; i < 3; i++) {
    var f = _sprMake(9, 9);
    _sprDisc(f.g, 4.5, 4.5, 4 - i, i === 0 ? '#fff6d0' : (i === 1 ? '#ffd070' : '#ff9a30'));
    flash.push(f.c);
  }
  /* Combat_Anim's PIFF: a small dirty spark, for a bullet strike. Grey-white, not fire -
     a rifle round hitting a hull does not look like a shell going off. */
  var piff = [];
  for (i = 0; i < 4; i++) {
    var ps = 8 + i * 4, pt = _sprMake(ps, ps), pg = pt.g, pc = ps / 2;
    var pcol = ['#ffffff', '#dfe6ee', '#9fadbb', '#6b7784'][i];
    _sprDisc(pg, pc, pc, Math.max(1, (ps / 2 - 1) * (i < 2 ? 0.55 : 0.8)), pcol);
    for (var pk = 0; pk < 4; pk++) {
      var pa = pk / 4 * 6.283 + i * 0.7;
      _sprRect(pg, pc + Math.cos(pa) * pc * 0.7, pc + Math.sin(pa) * pc * 0.7, 1, 1, '#f2f6fa');
    }
    piff.push(pt.c);
  }
  /* ...and the water set: a column of water thrown up, with a ring spreading on the surface.
     Drawn as a ring plus a collapsing column rather than a pale disc - a filled circle at
     this size reads as a cloud, not as a shell landing in a lake. The canvas has to stay
     SQUARE: the effect renderer draws every frame at width x width. */
  var splash = [];
  for (i = 0; i < 5; i++) {
    var ss = 20 + i * 9, st = _sprMake(ss, ss), sg = st.g, sc = ss / 2;
    var kk = i / 4;
    /* the ring, flattened because the camera looks along the ground plane */
    var rr = (sc - 2) * (0.28 + kk * 0.72);
    for (var sk = 0; sk < 22; sk++) {
      var sa = sk / 22 * 6.283;
      _sprRect(sg, sc + Math.cos(sa) * rr, sc + Math.sin(sa) * rr * 0.42, 2, 2,
        i < 3 ? '#eaf6fc' : '#b6d6e6');
    }
    /* the column: tall and bright at first, collapsing back into the ring */
    if (i < 3) {
      var cw = 5 - i, ch = ss * 0.5 * (1 - kk * 0.7);
      _sprRect(sg, sc - cw / 2, sc - ch, cw, ch, '#dff0f8');
      _sprRect(sg, sc - cw / 2, sc - ch, cw, Math.max(2, ch * 0.35), '#ffffff');
    }
    /* droplets, thrown up and out */
    for (var dk = 0; dk < 9; dk++) {
      var da = dk / 9 * 6.283 + i, dd = rr * (0.7 + _sprHash(dk, i, 7) * 0.6);
      _sprRect(sg, sc + Math.cos(da) * dd, sc + Math.sin(da) * dd * 0.42 - (2 - kk * 2) * 3,
        2, 2, '#ffffff');
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
    var ms = 30, mt = _sprMake(ms, ms), mg = mt.g, mc = ms / 2, mu = i / 5;
    var puffs = [[0.00, 0.16, '#6b6560'], [0.30, 0.22, '#7b746e'],
                 [0.62, 0.26, '#8a837c'], [0.92, 0.30, '#98918a']];
    for (var pk2 = 0; pk2 < puffs.length; pk2++) {
      var rise = puffs[pk2][0] + mu * 0.5;
      if (rise > 1.15) continue;
      var rad = ms * puffs[pk2][1] * (0.45 + rise * 0.85) * (1 - mu * 0.25);
      _sprDisc(mg, mc + Math.sin(rise * 4.1 + i) * ms * 0.10,
        ms - 3 - rise * (ms - 6), Math.max(1, rad), puffs[pk2][2]);
    }
    smoke.push(mt.c);
  }
  var drawn = { boom: boom, flash: flash, piff: piff, splash: splash, fire: fire, smoke: smoke };
  /* The originals win where they exist, role by role, keeping the drawn one for anything the
     archives do not cover - so a partial set degrades to a mixture rather than to nothing. */
  var real = (typeof _mixFx === 'function') ? _mixFx() : null;
  if (real) {
    for (var rk in real) if (real[rk]) drawn[rk] = real[rk];
  }
  return drawn;
}

