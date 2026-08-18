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
  /* Derived from the clean canvas, so it is the same size and must report the same scale -
     otherwise a building would jump in size the moment it took damage. */
  made.dmg.ps = made.c.ps;
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

/* The building's raw 3D model, as the face list the chain produces - separated from the bake
   so the live 3D renderer can draw the same geometry the sprite baker flattens. Coordinates
   are art pixels, unscaled: the sprite path applies RTS_PS on its way into the bake and the
   3D path applies its own world scale, so the model itself stays neutral. */
function _sprBuildingModel(key, side) {
  var def = rtsStructDef(key), TM = RTS_PAL.team[side];
  var W = def.w * RTS_TS, D = def.h * RTS_TS;
  var C = RTS_PAL.conc, S = RTS_PAL.steel, DK = RTS_PAL.dark, B = RTS_PAL.bld[side];
  /* K = brick, SD = sand, P = pale block. See RTS_PAL.mat - a base in the reference is built
     from several materials, and painting all of it in one team-tinted grey-blue is what made
     ours read as a set of blue boxes. */
  var K = RTS_PAL.mat.brick, SD = RTS_PAL.mat.sand, P = RTS_PAL.mat.pale;
  /* AS = asphalt, RU = rust, WH = whitewash, CU = copper, OL = painted olive. The fourteen
     structures that were built entirely from the three grey ramps now have somewhere to go;
     see RTS_PAL.mat for what each is evidence for. */
  var AS = RTS_PAL.mat.asphalt, RU = RTS_PAL.mat.rust, WH = RTS_PAL.mat.white,
      CU = RTS_PAL.mat.copper, OL = RTS_PAL.mat.olive;
  var m = [], i;
  /* Facade detail. In the reference a wall is never one flat colour - it carries pale
     pilasters and rows of lit windows, and that is a lot of what separates a building from
     a coloured box. Mounted 1.5 units proud of the wall face so they read cleanly. */
  function winRow(z, y, cx, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, cx + (k - (count - 1) / 2) * gap, y, z, w, h, 1.5, RTS_PAL.glass, RTS_PAL.glass);
    }
  }
  /* The same row on a side wall - boxes laid along z instead of x. winRow only ever put
     windows on the two faces that happen to point up and down the screen, so every structure
     in the game had two blank flanks, and at a 49-degree camera a flank is most of what you
     see of a building standing to your left or right. */
  function winSide(x, y, cz, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, x, y, cz + (k - (count - 1) / 2) * gap, 1.5, h, w, RTS_PAL.glass, RTS_PAL.glass);
    }
  }
  /* ALL FOUR WALLS AT ONCE: pilasters and two rows of glazing round the whole box. One call
     where a model used to carry none, and it is the cheapest legibility in the set - a lit
     window is the thing that says "building" at any distance, and these had blank concrete.
     Sized off the footprint so every structure gets a row that fits it. */
  function facade(y, h, hw, hd) {
    var nW = Math.max(2, Math.round(hw / 5)), nD = Math.max(2, Math.round(hd / 5));
    var gw = (hw * 2 - 6) / nW, gd = (hd * 2 - 6) / nD;
    winRow(hd, y, 0, nW, gw, 2.8, h);
    winRow(-hd, y, 0, nW, gw, 2.8, h);
    winSide(hw, y, 0, nD, gd, 2.8, h);
    winSide(-hw, y, 0, nD, gd, 2.8, h);
    pilasters(hd, y - 1.2, 0, nW + 1, gw, 1.3, h + 3.0);
    pilasters(-hd, y - 1.2, 0, nW + 1, gw, 1.3, h + 3.0);
  }
  function pilasters(z, y, cx, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, cx + (k - (count - 1) / 2) * gap, y, z, w, h, 1.5, B.trim, B.trim);
    }
  }

  /* ------------------------------------------------------------------ ROOFSCAPE --
     THE CAMERA LOOKS DOWN AT THESE. R3_K is 1.3, so a building does show a real front
     elevation - but the roof is still the largest unbroken area on almost every sprite, and it
     was a flat plate carrying one team band. The exception is the Construction Yard, whose
     vault is corrugated for exactly this reason and which is the best-reading building in the
     set. That is the whole argument: do everywhere what already fixed the yard.

     These are deliberately SMALL HARD-EDGED OBJECTS rather than surface texture. The shading
     pass already puts a smooth ramp across a flat plane; what a plane cannot produce is a cast
     edge, an occluded crease, or a second material meeting the first. Each of these gives all
     three, and the depth-buffer AO in r3d/render.js darkens every join for free.

     Placed in roof-plane coordinates - (x, z) across the roof, `y` the height of the surface
     they stand on - so callers position furniture the same way whatever is underneath. */

  /* A drum vent or extractor housing: cylinder with a darker cap, so it reads as a hole. */
  function vent(x, y, z, r, h) {
    _r3Cyl(m, x, y, z, r, h, S[1], S[3], 16);
    _r3Cyl(m, x, y + h, z, r * 0.82, 0.8, DK[1], DK[0], 16);
  }
  /* A boxed duct run. `alongZ` lays it down the depth instead of across the width: ducts on a
     real roof run one way and turn, and alternating them is what stops a roof reading as a
     grid of identical lumps. */
  function duct(x, y, z, len, alongZ, w) {
    var t = w || 3.2;
    _r3Box(m, x, y, z, alongZ ? t : len, 2.6, alongZ ? len : t, S[2], S[0]);
    var n = Math.max(2, Math.round(len / 5));                 /* seam ribs along its length */
    for (var q = 0; q < n; q++) {
      var f = (q - (n - 1) / 2) * (len / n);
      _r3Box(m, x + (alongZ ? 0 : f), y + 2.6, z + (alongZ ? f : 0),
             alongZ ? t + 0.6 : 1.0, 0.5, alongZ ? 1.0 : t + 0.6, S[3], S[1]);
    }
  }
  /* A glazed panel let INTO the roof. Same glass the window rows use, so a base reads as lit
     from above as well as from its faces - and unlike a wall window it is visible from every
     direction at this camera angle. */
  function skylight(x, y, z, w, d) {
    _r3Box(m, x, y, z, w + 1.4, 0.9, d + 1.4, B.trim, B.trim);           /* frame */
    _r3Box(m, x, y + 0.9, z, w, 0.5, d, RTS_PAL.glass, RTS_PAL.glass);
  }
  /* An access hatch or plant housing - a low block with a lid a shade darker. */
  function hatch(x, y, z, w, d, h) {
    _r3Box(m, x, y, z, w, h || 2.2, d, C[1], C[3]);
    _r3Box(m, x, y + (h || 2.2), z, w * 0.9, 0.6, d * 0.9, DK[1], DK[2]);
  }
  /* A thin mast with a cross-piece. Cheap silhouette above the roofline, which is how a
     building is read when it is half behind another one. */
  function aerial(x, y, z, h) {
    _r3Box(m, x, y, z, 0.9, h, 0.9, S[3], S[2]);
    _r3Box(m, x, y + h * 0.72, z, 4.4, 0.7, 0.7, S[2], S[1]);
  }
  /* A parapet: posts along two roof edges. Breaks the silhouette against the ground behind it,
     which is the one place the rim light in r3d/render.js has nothing to work with. */
  function parapet(y, z0, z1, x0, x1, step) {
    for (var px = x0; px <= x1 + 0.01; px += (step || 6)) {
      _r3Box(m, px, y, z0, 1.1, 2.4, 1.1, C[3], C[1]);
      _r3Box(m, px, y, z1, 1.1, 2.4, 1.1, C[3], C[1]);
    }
  }

  /* A ROOF, FURNISHED. The note above the roofscape helpers says the roof is the largest
     unbroken area on almost every building and that the camera looks down at it - and then
     most models called none of them. This is that argument applied to the whole roster in one
     call: a deterministic spread of vents, ducts, hatches and a parapet, laid out from the
     roof's own footprint so it fits whatever it is put on.

     Deterministic from (hw, hd) rather than random: the same building must bake to the same
     sprite every run, or the 2D art changes between loads. */
  function roofscape(y, hw, hd) {
    var i, sx = hw * 0.55, sz = hd * 0.55;
    vent(-sx, y, -sz, 2.2, 3.0);
    vent(sx, y, sz * 0.2, 1.9, 2.6);
    duct(0, y, -sz * 0.55, hw * 1.1, false, 3.0);
    duct(sx * 0.55, y, sz * 0.8, hd * 0.8, true, 2.6);
    hatch(-sx * 0.6, y, sz * 0.75, 5.0, 4.4, 1.8);
    for (i = 0; i < 3; i++)
      _r3Box(m, (i - 1) * (hw * 0.5), y, sz * 0.35, 2.0, 1.2, 2.0, S[2], S[1]);
    parapet(y, -hd + 1.5, hd - 1.5, -hw + 1.5, hw - 1.5, Math.max(5, hw / 2.2));
  }

  /* ---------------------------------------------------------------- GROUND CLUTTER --
     A building at 382 triangles was eight boxes and a cylinder, which is what a base of them
     read as: clean geometric solids sitting on clean ground. Measured across the roster before
     this, the mean was 382 triangles a structure against 175 for a single TREE - the thing the
     player looks at all match had less shape in it than the scenery.

     These are the cheap, repeatable pieces that make a structure look OCCUPIED. Each is one to
     four primitives, and the point of having them here rather than inline in each model is that
     six calls in a model file buy twenty primitives of detail - so the files stay readable while
     the geometry gets five times denser.

     They are DELIBERATELY NOT ground cover. Nothing here scatters gravel or paints the floor: a
     pipe run, a ladder and a stair are structure, they occlude each other, they cast, and the
     depth-buffer AO darkens where they meet the wall. That is the difference between detail and
     padding, and this project's graphics rules draw exactly that line. */

  /* A pipe run with end flanges. Reads as plant even at two pixels wide, because the flanges
     break the tube into segments that catch the light separately.

     THE AXIS IS REAL, and it was not the first time. This took an `alongZ` flag and ignored it:
     _r3Cyl builds along Y and only along Y, so every call - including the one that asked for a
     horizontal feed line - drew the same vertical riser. A flag a helper accepts and discards is
     worse than no flag, because the call site reads as if it said something. So a horizontal run
     is built here out of a box tube with collar rings, which is what the shape needs anyway: at
     the size these are drawn a square section and a round one are the same two pixels, and the
     collars are the part that reads.

     axis: 'y' (default) rises from y; 'x' and 'z' run centred on (x,y,z) along that axis. */
  function pipe(x, y, z, len, axis, r) {
    var rr = r || 1.3, fr = rr * 1.45;
    if (!axis || axis === 'y') {
      _r3Cyl(m, x, y, z, rr, len, S[1], S[2], 16);
      _r3Cyl(m, x, y, z, fr, 1.0, S[3], S[3], 16);
      _r3Cyl(m, x, y + len - 1.0, z, fr, 1.0, S[3], S[3], 16);
      return;
    }
    var aZ = (axis === 'z'), d = rr * 2;
    _r3Box(m, x, y - rr, z, aZ ? d : len, d, aZ ? len : d, S[1], S[2]);
    for (var e = 0; e < 2; e++) {
      var f = (e ? 0.5 : -0.5) * len + (e ? -0.5 : 0.5);
      _r3Box(m, x + (aZ ? 0 : f), y - fr, z + (aZ ? f : 0),
             aZ ? fr * 2 : 1.0, fr * 2, aZ ? 1.0 : fr * 2, S[3], S[3]);
    }
  }
  /* A wall ladder: two stiles and rungs. The rungs are what read - a row of hard little
     shadows up an otherwise flat face. */
  function ladder(x, y, z, h) {
    _r3Box(m, x - 1.5, y, z, 0.5, h, 0.5, S[2], S[2]);
    _r3Box(m, x + 1.5, y, z, 0.5, h, 0.5, S[2], S[2]);
    for (var r = 2; r < h; r += 3) _r3Box(m, x, y + r, z, 3.4, 0.4, 0.4, S[3], S[3]);
  }
  /* A handrail along a roof edge or catwalk: posts plus a top rail. */
  function rail(x, y, z, len, alongZ) {
    var n = Math.max(2, Math.round(len / 5));
    for (var q = 0; q <= n; q++) {
      var f = (q / n - 0.5) * len;
      _r3Box(m, x + (alongZ ? 0 : f), y, z + (alongZ ? f : 0), 0.5, 3.2, 0.5, S[3], S[3]);
    }
    _r3Box(m, x, y + 3.2, z, alongZ ? 0.5 : len, 0.4, alongZ ? len : 0.5, S[2], S[2]);
  }
  /* Entrance steps, descending out from a front wall along +z. Three treads, each a shade
     darker as it drops into the shadow of the one above - the AO pass deepens that join for
     free. No orientation flag: the version that had one carried a branch nothing called, which
     is a branch nobody has ever seen drawn. Add the other axis when a building wants it. */
  function steps(x, y, z, w) {
    for (var t = 0; t < 3; t++) {
      _r3Box(m, x, y - t * 1.1, z + t * 1.5, w, 1.1, 1.6 + t * 1.5, C[t === 2 ? 3 : 1], C[1]);
    }
  }
  /* A drum: fuel, water or waste, depending on what it stands next to. Two tones so the band
     round its middle reads at distance. */
  function drum(x, y, z, r, h, col) {
    var c = col || RU;
    _r3Cyl(m, x, y, z, r || 2.2, h || 4.5, c[1], c[0], 16);
    _r3Cyl(m, x, y + (h || 4.5) * 0.45, z, (r || 2.2) * 1.08, 0.7, c[3], c[3], 16);
  }
  /* A stack of crates. Offset on purpose - a neat stack reads as one box. */
  function crates(x, y, z) {
    _r3Box(m, x, y, z, 4.2, 3.4, 4.2, SD[1], SD[0]);
    _r3Box(m, x + 1.1, y + 3.4, z - 0.8, 3.4, 2.8, 3.4, SD[2], SD[1]);
  }
  /* A floodlight on a pole, angled in. Every base in the reference has these and they are the
     tallest thin thing on the site, so they carry the silhouette above the roofline. */
  function floodlight(x, y, z, h) {
    _r3Box(m, x, y, z, 1.0, h || 13, 1.0, S[3], S[2]);
    _r3Box(m, x, y + (h || 13), z, 3.2, 2.2, 2.4, DK[1], DK[0]);
    _r3Box(m, x, y + (h || 13) + 0.4, z + 1.3, 2.6, 1.6, 0.5, RTS_PAL.glass, RTS_PAL.glass);
  }
  /* A SANDBAG REVETMENT: two staggered courses of bags ringing a gun position. Every defence
     in the reference sits in one, and ours sat on bare concrete - which is most of why the
     turret and the pillbox read as garden ornaments next to a power plant.

     Staggered on purpose. One course of evenly spaced boxes reads as a dotted line; offsetting
     the upper course by half a bag makes the joints break up and the row reads as stacked. The
     ring is elliptical so it fits a rectangular footprint rather than only a square one. */
  function sandbags(y, rx, rz, n) {
    var cnt = n || 14;
    for (var q = 0; q < cnt; q++) {
      for (var c = 0; c < 2; c++) {
        var a = ((q + c * 0.5) / cnt) * Math.PI * 2;
        _r3Box(m, Math.cos(a) * rx, y + c * 1.7, Math.sin(a) * rz,
               3.0, 1.8, 3.0, RTS_PAL.bag[(q + c) & 1], RTS_PAL.bag[1]);
      }
    }
  }
  /* An ammunition point: a low box of shells beside the gun it feeds. Three rounds standing in
     a crate, which is the smallest thing on a defence that still says what the defence eats. */
  function ammo(x, y, z) {
    _r3Box(m, x, y, z, 5.0, 2.2, 3.6, OL[0], OL[1]);
    for (var q = 0; q < 3; q++)
      _r3Cyl(m, x + (q - 1) * 1.5, y + 2.2, z, 0.6, 2.6, CU[1], CU[0], 16);
  }

  /* Roof plant: a finned condenser unit. The fins are the whole point - six thin slabs give a
     roof something that shades as a row rather than as a plate. */
  function plant(x, y, z, w, d) {
    _r3Box(m, x, y, z, w, 3.2, d, S[1], S[0]);
    for (var f = 0; f < 6; f++)
      _r3Box(m, x + (f - 2.5) * (w / 6.5), y + 3.2, z, w / 12, 1.6, d * 0.86, S[3], S[2]);
  }

  /* The chain is four files now - see sprites/bld-*.js. It was one 500-line function, and
     the size guard in unit/layout caught it the first time a model needed a paragraph of
     explanation. Each arm returns false for a key it does not own. */
  var X = { m:m, W:W, D:D, C:C, S:S, DK:DK, B:B, K:K, SD:SD, P:P, TM:TM,
            winRow:winRow, pilasters:pilasters, winSide:winSide, facade:facade,
            AS:AS, RU:RU, WH:WH, CU:CU, OL:OL,
            vent:vent, duct:duct, skylight:skylight, hatch:hatch,
            aerial:aerial, parapet:parapet,
            roofscape:roofscape,
            pipe:pipe, ladder:ladder, rail:rail, steps:steps, drum:drum,
            crates:crates, floodlight:floodlight, plant:plant,
            sandbags:sandbags, ammo:ammo };
  _sprBldBase(X, key) || _sprBldTech(X, key) || _sprBldWar(X, key) || _sprBldSuper(X, key);
  return m;
}
function _sprBuildingClean(key, side) {
  var def = rtsStructDef(key);
  var W = def.w * RTS_TS, D = def.h * RTS_TS;
  var m = _sprBuildingModel(key, side);
  /* Baked at RTS_PS times RA's resolution - see RTS_PS in sprites/bake.js for why that is a
     separate number from RTS_TS rather than a bigger RTS_TS. The MODEL is authored in art
     pixels and scaled here rather than every model being rewritten: _r3Scale already exists
     for exactly this, the footprint grows with it, and `head` comes back in the same units the
     canvas is in, so the renderer's one division by `ps` corrects all three together. */
  var r = _r3BakeFootprint(RTS_PS === 1 ? m : _r3Scale(m, RTS_PS), W * RTS_PS, D * RTS_PS);
  _sprEdge(r.c);
  var out = _sprShadow(r.c, 3 * RTS_PS, 3 * RTS_PS);
  out.ps = RTS_PS;
  return { c: out, head: r.head };
}

