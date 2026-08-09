/* mixart/frames.js - which frame of a SHP to draw: buildings, the sea, effects, dying
   infantry, build-up, moving parts, units, fidgets, the harvester. Part of rts.mixart. */

/* ------------------------------------------------------------- structures --
   A structure SHP's frame 0 is the finished building. The renderer wants the same shape the
   procedural baker returns - a canvas plus `head`, the headroom above the footprint - and the
   original's art is already drawn to the same convention: the footprint sits at the bottom. */
function _mixBuilding(key, side) {
  var nm = RTS_MIX_BLD[key];
  if (!nm) return null;
  var s = _mixShp(nm + '.shp');
  if (!s) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  var c = _mixFrameToCanvas(s.frame(0), s.width, s.height, pal);
  var d = rtsStructDef(key), footD = d.h * RTS_TS;
  /* THE SECOND FRAME IS THE DAMAGED BUILDING. Nearly every structure SHP in the game is two
     frames - scorched, holed, smoking - and drawing only frame 0 meant a base under fire looked
     untouched right up until it exploded. That is not just plainer, it is less readable: the
     original tells you which building is about to go at a glance.

     Frame 1 is the convention for a two-frame building, from mods/ra/sequences/structures.yaml
     (`damaged-idle: Start: 1`). The richer sets are not simply "frame 1" - the Gun Turret's 128
     frames are 64 facings twice over, the Silo's 10 are five fill levels twice over - so the
     damaged frame is taken as the START OF THE SECOND HALF, which is the same rule the yaml
     states for those (`Start: 9` on a 9-long silo stage list). For a plain 2-frame building
     that lands on frame 1, which is the common case. */
  var dmg = null, half = s.count >> 1;
  if (s.count >= 2) {
    var fr = s.frame(s.count === 2 ? 1 : half);
    if (fr) dmg = _mixFrameToCanvas(fr, s.width, s.height, pal);
  }
  var out = { c: c, dmg: dmg, head: Math.max(0, s.height - footD), half: half, n: s.count };

  /* Every frame, for the buildings that use more than two. Baked here rather than on demand
     because decoding an SHP frame mid-frame is a stall you can see, and the whole set is small:
     the largest is the Chronosphere at 58 frames of 48x48. Buildings not in the table keep just
     the two canvases above. */
  if (RTS_MIX_BLDANIM[key]) {
    out.frames = [];
    for (var f = 0; f < s.count; f++) {
      var ff = s.frame(f);
      out.frames.push(ff ? _mixFrameToCanvas(ff, s.width, s.height, pal) : c);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- the sea --
   RA animates water by ROTATING A BAND OF THE PALETTE rather than by holding animation frames -
   CONQUER.CPP's Color_Cycle steps it once every TIMER_SECOND/4 - which is why a static reading
   of the tiles produces a dead flat sea however many of them you sample.

   Which band was measured rather than looked up: OpenRA's RotationPaletteEffect names a
   RotationBase only for DESERT and leaves temperate on its default, so the answer came from
   asking what w1.tem is actually painted with. Its indices are 46,47,62,64-68,72,99,101 and
   w2.tem adds 96,98,100 - a run at 96..102, which is 0x60, the default the yaml does not state.

   Baked as RTS_WATER_STEPS complete tile sets, one per rotation position, so animating is
   picking a set rather than rebuilding anything. Seven sets of a handful of 24x24 tiles is
   nothing; re-baking the whole terrain canvas four times a second would not be. */
var RTS_WATER_BASE = 96, RTS_WATER_RANGE = 7, RTS_WATER_STEPS = 7;
var _RTS_MIXWATER = null;

function _mixWater() {
  if (!_rtsArtReady()) return null;
  if (_RTS_MIXWATER !== null) return _RTS_MIXWATER;
  _RTS_MIXWATER = false;
  /* THE SAME FIVE TILES THE BAKE USED. This asked for w1 alone, which is one tile, so every
     animated step held a single frame and the overlay's `(hash * set.length) | 0` could only
     ever be 0 - one tile stamped over every water cell on the map, on top of a bake that had
     correctly varied across five. See _mixWaterPool in mixart/tiles.js. */
  var pool = _mixWaterPool();
  if (!pool.length) return false;
  var src = { tile: pool };
  var base = RTS_MIX.pal;
  var steps = [];
  for (var st = 0; st < RTS_WATER_STEPS; st++) {
    /* rotate the band by `st`, leaving every other entry alone */
    var pal = new Uint8Array(base);
    for (var k = 0; k < RTS_WATER_RANGE; k++) {
      var from = RTS_WATER_BASE + ((k + st) % RTS_WATER_RANGE);
      var to = RTS_WATER_BASE + k;
      pal[to * 3] = base[from * 3];
      pal[to * 3 + 1] = base[from * 3 + 1];
      pal[to * 3 + 2] = base[from * 3 + 2];
    }
    var set = [];
    for (var t = 0; t < src.tile.length; t++) {
      var tile = src.tile[t];
      if (!tile) { set.push(null); continue; }
      var cv = _sprMake(RTS_TS, RTS_TS), im = cv.g.createImageData(RTS_TS, RTS_TS), d = im.data;
      for (var q = 0; q < RTS_TS * RTS_TS; q++) {
        var v = tile[q] * 3;
        d[q * 4] = pal[v]; d[q * 4 + 1] = pal[v + 1]; d[q * 4 + 2] = pal[v + 2]; d[q * 4 + 3] = 255;
      }
      cv.g.putImageData(im, 0, 0);
      set.push(cv.c);
    }
    steps.push(set);
  }
  return (_RTS_MIXWATER = steps);
}

/* ------------------------------------------------------------------ effects --
   Explosions, sparks, plumes and smoke. All of it was drawn here from discs and specks, and
   all of it is in conquer.mix as real animation - which matters more than the buildings did,
   because in a fight these are what is moving on screen almost all of the time.

   The mapping is by ROLE rather than by name, since our set and Westwood's do not partition the
   same way. A shell going off is a fireball; a rifle round hitting a hull is a dirty grey spark
   and specifically NOT a small fireball; a hit on water throws a column rather than a ball.

     boom    fball1     18   a shell or a vehicle going up
     hit     veh-hit3   14   a smaller strike - the frames are already the right size
     pop     piffpiff    8   an infantryman being hit
     piff    piff        4   a bullet on armour; ours had four frames too
     splash  h2o_exp2   10   a column of water
     smoke   smokey      7
     fire    fire3      15   what burns on a wreck

   `nuke` is separate because nothing here is the right shape for it: atomsfx is 27 frames of
   78x121, a mushroom cloud taller than it is wide, and scaling any of the others up to stand in
   for it is what the strike has been doing until now. */
var RTS_MIX_FX = {
  boom:   'fball1',   hit:    'veh-hit3', pop:  'piffpiff',
  piff:   'piff',     splash: 'h2o_exp2', smoke:'smokey',
  fire:   'fire3',    nuke:   'atomsfx'
};
var _RTS_MIXFX = null;

function _mixFxSet(role) {
  if (!_rtsArtReady()) return null;
  if (!_RTS_MIXFX) _RTS_MIXFX = {};
  if (_RTS_MIXFX[role] !== undefined) return _RTS_MIXFX[role];
  _RTS_MIXFX[role] = null;
  var nm = RTS_MIX_FX[role];
  if (!nm) return null;
  var s = _mixShp(nm + '.shp');
  if (!s || !s.count) return null;
  /* Effects are NOT team-coloured - an explosion belongs to nobody - so the plain palette is
     right here and using a remapped one would tint every fireball with whoever fired it. */
  var pal = RTS_MIX.pal, out = [];
  for (var f = 0; f < s.count; f++) {
    var fr = s.frame(f);
    if (fr) out.push(_mixFrameToCanvas(fr, s.width, s.height, pal));
  }
  return out.length ? (_RTS_MIXFX[role] = out) : null;
}

/* The whole set, in the shape _sprFx already returns, or null if the archives are absent.
   `flash` stays drawn: gunfire.shp is three frames of a muzzle bloom that reads as a blob at
   our zoom, and the drawn one is genuinely clearer. */
function _mixFx() {
  if (!_rtsArtReady()) return null;
  var boom = _mixFxSet('boom');
  if (!boom) return null;                  /* no artwork - keep the whole drawn set together */
  return {
    boom:   boom,
    piff:   _mixFxSet('piff')   || null,
    splash: _mixFxSet('splash') || null,
    smoke:  _mixFxSet('smoke')  || null,
    fire:   _mixFxSet('fire')   || null,
    hit:    _mixFxSet('hit')    || null,
    pop:    _mixFxSet('pop')    || null
  };
}

/* ------------------------------------------------------------ dying infantry --
   RA gives every foot soldier five ways to fall over. From mods/ra/sequences/infantry.yaml:

     die1  288 +8    die2  296 +8    die3  304 +8    die4  312 +12    die5  324 +18

   Unlike everything else about infantry these are NOT per-facing - a man falls the same way
   whichever direction he was pointing - so there are 54 frames total and the choice between
   them is just variety.

   Note die1..die5 start where the file's own numbering says, not at a multiple of anything:
   die4 is 12 long and die5 is 18, so walking them as five equal blocks lands mid-animation. */
var RTS_MIX_DIE = [ [288, 8], [296, 8], [304, 8], [312, 12], [324, 18] ];
var _RTS_MIXDIE = null;

function _mixDeath(key, side, variant) {
  if (!_rtsArtReady()) return null;
  var d = rtsUnitDef(key);
  if (!d || d.kind !== 'infantry') return null;
  var nm = RTS_MIX_UNIT[key];
  if (!nm) return null;
  if (!_RTS_MIXDIE) _RTS_MIXDIE = {};
  var ck = key + '|' + side + '|' + variant;
  if (_RTS_MIXDIE[ck] !== undefined) return _RTS_MIXDIE[ck];
  _RTS_MIXDIE[ck] = null;
  var s = _mixShp(nm + '.shp');
  var spec = RTS_MIX_DIE[variant % RTS_MIX_DIE.length];
  if (!s || s.count < spec[0] + spec[1]) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  var out = [];
  for (var f = 0; f < spec[1]; f++) {
    var fr = s.frame(spec[0] + f);
    if (fr) out.push(_mixFrameToCanvas(fr, s.width, s.height, pal));
  }
  return out.length ? (_RTS_MIXDIE[ck] = out) : null;
}

/* --------------------------------------------------------- under construction --
   A structure going up. RA ships this as a SEPARATE FILE per building - factmake.shp,
   powrmake.shp and so on, 21 of the 22 - drawn at exactly the finished building's dimensions,
   which makes it a straight substitution for the frames we were faking with a clip rectangle.

   The Concrete Wall is the one without: a wall section appears whole, which is correct, and a
   missing entry here is how that is expressed rather than a special case.

   Frames run assembled-from-nothing to finished, so progress maps straight onto the index. */
var _RTS_MIXMAKE = null;
function _mixMake(key, side) {
  if (!_rtsArtReady()) return null;
  if (!_RTS_MIXMAKE) _RTS_MIXMAKE = {};
  var ck = key + '|' + side;
  if (_RTS_MIXMAKE[ck] !== undefined) return _RTS_MIXMAKE[ck];
  _RTS_MIXMAKE[ck] = null;
  var nm = RTS_MIX_BLD[key];
  if (!nm) return null;
  var s = _mixShp(nm + 'make.shp');
  if (!s || !s.count) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  var out = [];
  for (var f = 0; f < s.count; f++) {
    var fr = s.frame(f);
    if (fr) out.push(_mixFrameToCanvas(fr, s.width, s.height, pal));
  }
  if (!out.length) return null;
  var d = rtsStructDef(key), footD = d.h * RTS_TS;
  return (_RTS_MIXMAKE[ck] = { frames: out, head: Math.max(0, s.height - footD) });
}

/* ------------------------------------------------- moving parts, per building --
   What each animated structure's extra frames ARE. Transcribed from
   mods/ra/sequences/structures.yaml rather than guessed, because the layouts do not follow one
   rule - some count from 0, some from 1, and the damaged set is a fixed offset that happens to
   equal half the frame count in every case here (which is what `half` above already computes).

     loop    cycles forever, whatever the building is doing        (Barracks: 10 frames)
     active  cycles only while the building is DOING its job       (Depot, Helipad, Tesla, ...)
     fill    picks a frame by how full the house's stores are      (Silo: 5 stages)
     facing  picks a frame by where the thing is AIMED             (Gun Turret: 32 facings)

   `active` is the interesting one: a building that animates constantly is wallpaper, while one
   that starts moving when it goes to work tells you something. */
var RTS_MIX_BLDANIM = {
  barracks: { kind: 'loop',   start: 0, len: 10, fps: 8 },
  depot:    { kind: 'active', start: 1, len: 6,  fps: 10 },
  helipad:  { kind: 'active', start: 1, len: 6,  fps: 10 },
  tesla:    { kind: 'active', start: 1, len: 9,  fps: 14 },
  pdox:     { kind: 'active', start: 0, len: 29, fps: 14 },
  iron:     { kind: 'active', start: 0, len: 11, fps: 10 },
  yard:     { kind: 'active', start: 1, len: 25, fps: 12 },
  silo:     { kind: 'fill',   start: 0, len: 5 },
  turret:   { kind: 'facing', start: 0, facings: 32 }
};

/* ----------------------------------------------------------------- units --
   RA stores vehicles at 32 facings, which is what this project already bakes since the facing
   count was corrected. A turreted vehicle keeps hull and turret in ONE file: frames 0..31 are
   the hull and 32..63 the turret, which lines up exactly with how the renderer draws them.

   Facing order runs the opposite way round from ours and starts somewhere else, and this was
   NOT worked out by reading - it was measured. Decoding all 32 turret frames of 2tnk.shp and
   taking the pixel furthest from centre (which is the barrel tip) gives the bearing each frame
   actually points at:

       frame  0 -> -93 deg (north)      frame 16 -> +94 deg (south)
       frame  8 -> -173 deg (west)      frame 24 ->  -7 deg (east)

   So RA's index starts at north and runs ANTICLOCKWISE, while ours starts east and runs
   clockwise. Solving  -90 - i*(360/n) = f*(360/n)  gives i = -n/4 - f.

   The first version of this had the quarter-turn's sign the other way and every vehicle drove
   sideways; a centroid-based check called it wrong but could not say by how much, because a
   turret's centroid barely moves. The barrel tip is the measurement that settles it. */
function _mixFacing(f, n) {
  var i = (-(n / 4) - f) % n;                  /* east-clockwise -> north-anticlockwise */
  return ((i % n) + n) % n;
}

function _mixUnit(key, side, prone, part) {
  var nm = RTS_MIX_UNIT[key];
  if (!nm) return null;
  var s = _mixShp(nm + '.shp');
  if (!s) return null;
  var d = rtsUnitDef(key), n = _sprFacingsFor(d);
  var inf = d.kind === 'infantry';
  var turreted = !!RTS_TURRETED[key];
  if (s.count < n) return null;
  if (part === 'turret' && (!turreted || s.count < n * 2)) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  var base = (part === 'turret') ? n : 0;
  var out = [], f, idx, fr;
  for (f = 0; f < n; f++) {
    if (inf) {
      /* Whether a type HAS crawl artwork is `IsCrawling` in IDATA.CPP - the Dog, Engineer, Spy
         and Thief are all built with it false - and our rules already carry that as `crawl`,
         because it was ported long before there was any artwork to apply it to.

         Gating on it matters more than it looks. A bounds check is not enough: frame 144 exists
         in all nine files, it just is not prone artwork in the ones without any, and what sits
         there instead is the DEATH sequence. The first version drew a pool of blood for every
         pinned engineer, dog and thief. */
      var crawls = prone && d.crawl;
      idx = crawls ? RTS_MIX_PRONE + _mixFacing(f, n) * RTS_MIX_PRONE_STRIDE
                   : RTS_MIX_STAND + _mixFacing(f, n);
      if (idx >= s.count) idx = RTS_MIX_STAND + _mixFacing(f, n);
    } else {
      idx = base + _mixFacing(f, n);
    }
    fr = s.frame(idx);
    out.push(fr ? _mixFrameToCanvas(fr, s.width, s.height, pal) : _sprMake(s.width, s.height).c);
  }
  return out;
}

/* ---------------------------------------------------------- infantry fidgets --
   A soldier standing still in RA is not at attention forever: every so often he shifts his
   weight, checks his rifle, stretches. The idle1/idle2 sequences carry it, single-facing,
   ticked at 120ms. Unlike stand/prone there is NO shared layout - every type parks its idles
   at a different offset - so this table is each type's numbers straight out of
   mods/ra/sequences/infantry.yaml, keyed by SHP name: [start, length] per variant. */
var RTS_MIX_IDLE = {
  e1:   [[256, 16], [272, 16]],
  e2:   [[384, 14], [399, 16]],
  e3:   [[272, 14], [287, 16]],
  e4:   [[384, 14], [399, 16]],
  e6:   [[121, 8],  [130, 14]],
  e7:   [[233, 14], [248, 14]],
  medi: [[178, 14]],
  thf:  [[120, 19]],
  dog:  [[216, 7],  [224, 11]]
};
var _RTS_IDLEANIM = {};
function _mixIdleAnim(key, side) {
  if (!_rtsArtReady()) return null;
  var ck = key + '|' + side;
  if (_RTS_IDLEANIM[ck] !== undefined) return _RTS_IDLEANIM[ck];
  _RTS_IDLEANIM[ck] = null;
  var nm = RTS_MIX_UNIT[key], tab = nm && RTS_MIX_IDLE[nm];
  if (!tab) return null;
  var s = _mixShp(nm + '.shp');
  if (!s) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  var out = [];
  for (var v = 0; v < tab.length; v++) {
    var run = [], start = tab[v][0], len = tab[v][1];
    if (start + len > s.count) continue;           /* a cut-down shp: skip the variant */
    for (var f = 0; f < len; f++) {
      var fr = s.frame(start + f);
      if (!fr) { run = null; break; }
      run.push(_mixFrameToCanvas(fr, s.width, s.height, pal));
    }
    if (run && run.length) out.push(run);
  }
  return out.length ? (_RTS_IDLEANIM[ck] = out) : null;
}

/* ------------------------------------------------------- the harvester at work --
   harv.shp is 111 frames, and the plain facing bake uses 32 of them. The rest are the three
   working animations, from mods/ra/sequences/vehicles.yaml:

     harvest    Start 32, Length 8, Facings 8   the scoop cycling while it eats a tile,
                                                facing-major: 8 consecutive frames per facing
     dock       Start 96, Length 8              tipping up over the refinery, one facing -
                                                the artwork bakes the pose in
     dock-loop  Start 104, Length 7             the ore pouring out while tipped

   These are what make the economy loop READ: a harvester that sits motionless in an ore field
   and then sits motionless beside the refinery looks parked, however often the credits tick.

   The 8-facing block goes through the same _mixFacing transform the infantry's 8-facing
   sequences do - their yaml is plain `Facings: 8` too, and that order was measured from the
   artwork rather than taken from a document. */
var _RTS_HARVANIM = {};
function _mixHarvAnim(side) {
  if (!_rtsArtReady()) return null;
  if (_RTS_HARVANIM[side] !== undefined) return _RTS_HARVANIM[side];
  _RTS_HARVANIM[side] = null;
  var s = _mixShp('harv.shp');
  if (!s || s.count < 111) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  function bake(idx) {
    var fr = s.frame(idx);
    return fr ? _mixFrameToCanvas(fr, s.width, s.height, pal) : null;
  }
  var harvest = [], f, t, ok = true;
  for (f = 0; f < 8 && ok; f++) {
    var row = [];
    for (t = 0; t < 8; t++) {
      var c = bake(32 + _mixFacing(f, 8) * 8 + t);
      if (!c) { ok = false; break; }
      row.push(c);
    }
    harvest.push(row);
  }
  var dock = [], pour = [];
  for (t = 0; t < 8 && ok; t++) { var cd = bake(96 + t); if (cd) dock.push(cd); else ok = false; }
  for (t = 0; t < 7 && ok; t++) { var cp = bake(104 + t); if (cp) pour.push(cp); else ok = false; }
  if (!ok) return null;
  return (_RTS_HARVANIM[side] = { harvest: harvest, dock: dock, pour: pour });
}

