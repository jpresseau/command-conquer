/* sprites/models.js - the 3D models for every structure, rendered to a sprite once at load.
   Part of rts.sprites, the sprite baker. */

/* ============================================================ 3D MODELS ==
   Every structure and unit is a small 3D model, rendered to a sprite once at load by
   src/r3d. See there for why: the originals were made exactly this way, and
   hand-drawn pixel art does not reproduce the result.

   Coordinates are art pixels. A 3x3 building's footprint is 72x72, centred on the origin,
   with y=0 at ground level and +y up. Build from the ground upward - every part sits on
   something below it, so the y offsets read as a running total. */
function _sprBuilding(key, side) {
  /* Real artwork wins when the player has pointed the game at their own game files; everything
     below is the fallback that got this project to the point where it could ask. */
  if (typeof _rtsArtReady === 'function' && _rtsArtReady()) {
    var real = _mixBuilding(key, side);
    if (real) return real;
  }
  /* The drawn set gets a damaged look too, or "buildings show their wounds" is a feature only
     the players who loaded their archives ever see. There is no second hand-drawn sprite to
     switch to, so one is DERIVED: scorch the finished canvas, punch a few dark holes through
     it, and let the silhouette stand. Built here, after the real-art path has had its chance,
     so it costs nothing for anyone using the originals. */
  var made = _sprBuildingClean(key, side);
  made.dmg = _sprBldDamaged(made.c, key);
  return made;
}

/* Take a finished building canvas and make it look hit: darken it unevenly, burn a few holes
   through the roof, and leave soot around them. Deterministic per key, so a given building
   always breaks the same way rather than shimmering between frames.

   NOT _sprScorch - that name was already taken further down by the ground scorch marks, and
   declaring it twice silently replaced one with the other. The only symptom was every
   procedurally-drawn building handing back an ARRAY where a canvas was expected. */
function _sprBldDamaged(src, key) {
  var t = _sprMake(src.width, src.height), g = t.g;
  g.drawImage(src, 0, 0);
  var W = src.width, H = src.height, seed = 0;
  for (var q = 0; q < key.length; q++) seed = (seed * 31 + key.charCodeAt(q)) & 0xffff;

  /* uneven soot, only where the building actually is - composited so it cannot spill onto
     the transparent surround and give the sprite a square halo */
  g.globalCompositeOperation = 'source-atop';
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x += 2) {
      var n = _sprVN(x, y, 7, seed + 3);
      if (n < 0.42) continue;
      g.globalAlpha = 0.16 + (n - 0.42) * 0.5;
      _sprRect(g, x, y, 2, 2, n > 0.8 ? '#1a1410' : '#2b2420');
    }
  }
  g.globalAlpha = 1;

  /* holes: a handful of dark bites out of the upper half, where a roof would be */
  for (var i = 0; i < 5; i++) {
    var hx = W * (0.18 + _sprHash(i, 1, seed) * 0.64);
    var hy = H * (0.15 + _sprHash(i, 2, seed) * 0.5);
    var hr = Math.max(2, Math.min(W, H) * (0.05 + _sprHash(i, 3, seed) * 0.06));
    g.globalAlpha = 0.85;
    _sprEll(g, hx, hy, hr, hr * 0.7, '#140f0c');
    g.globalAlpha = 0.4;
    _sprEll(g, hx + hr * 0.4, hy + hr * 0.5, hr * 0.9, hr * 0.6, '#3a2a1e');
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return t.c;
}

function _sprBuildingClean(key, side) {
  var def = rtsStructDef(key), TM = RTS_PAL.team[side];
  var W = def.w * RTS_TS, D = def.h * RTS_TS;
  var C = RTS_PAL.conc, S = RTS_PAL.steel, DK = RTS_PAL.dark, B = RTS_PAL.bld[side];
  /* K = brick, SD = sand, P = pale block. See RTS_PAL.mat - a base in the reference is built
     from several materials, and painting all of it in one team-tinted grey-blue is what made
     ours read as a set of blue boxes. */
  var K = RTS_PAL.mat.brick, SD = RTS_PAL.mat.sand, P = RTS_PAL.mat.pale;
  var m = [], i;
  /* Facade detail. In the reference a wall is never one flat colour - it carries pale
     pilasters and rows of lit windows, and that is a lot of what separates a building from
     a coloured box. Mounted 1.5 units proud of the wall face so they read cleanly. */
  function winRow(z, y, cx, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, cx + (k - (count - 1) / 2) * gap, y, z, w, h, 1.5, RTS_PAL.glass, RTS_PAL.glass);
    }
  }
  function pilasters(z, y, cx, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, cx + (k - (count - 1) / 2) * gap, y, z, w, h, 1.5, B.trim, B.trim);
    }
  }

  /* The chain is four files now - see sprites/bld-*.js. It was one 500-line function, and
     the size guard in unit/layout caught it the first time a model needed a paragraph of
     explanation. Each arm returns false for a key it does not own. */
  var X = { m:m, W:W, D:D, C:C, S:S, DK:DK, B:B, K:K, SD:SD, P:P, TM:TM,
            winRow:winRow, pilasters:pilasters };
  _sprBldBase(X, key) || _sprBldTech(X, key) || _sprBldWar(X, key) || _sprBldSuper(X, key);
  var r = _r3BakeFootprint(m, W, D);
  _sprEdge(r.c);
  return { c: _sprShadow(r.c, 3, 3), head: r.head };
}

