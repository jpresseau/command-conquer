/* RED ALERT - real Red Alert artwork, read from the player's own game files.

   Everything else in this project draws its own sprites, because there were no originals to
   draw with. There are now: `ra/mix.js`, `lcw.js`, `blowfish.js` and `shp.js` read the shipped
   archives, and this file is the seam between them and the renderer.

   WHY IT LOADS FROM DISK RATHER THAN SHIPPING WITH THE GAME. Red Alert was released as freeware
   by EA in 2008 and the archives are downloadable, but redistributing the artwork - especially
   re-cut into someone else's spritesheets - is a different thing from linking to the official
   package, and OpenRA, who have thought about this much longer than this project has,
   deliberately do not redistribute it either. So: no game data is committed here, the player
   points the game at their own copy once, and it is cached in their browser afterwards.

   Without content the game is exactly what it was - every procedural sprite still builds, and
   `_rtsArtReady()` is the only thing that decides which set the renderer gets. */

var RTS_MIX = {
  /* the archives worth asking for, and what each is needed for */
  /* sounds/speech carry no artwork - they are here because _mixShp and the sound lookup both
     walk this list, and an archive nobody looks in is an archive nobody can play. */
  /* THE EXPANSIONS COME LAST, DELIBERATELY. Counterstrike and Aftermath were already being
     opened - RTS_MIX_NEST descends into them, and the map scanner has always read scenarios out
     of them - but nothing ever looked in them for a sprite, so art that only exists there
     (mslo.shp, the Missile Silo) had no chance of being found no matter what the player owned.
     They are appended rather than prepended because _mixShp takes the first archive that has
     the name: last means "fill the gaps in the base game", not "reskin it". Aftermath does
     re-ship some base sprites, and quietly swapping those under a player who never installed
     it would be a change nobody asked for. */
  want: ['conquer.mix', 'temperat.mix', 'snow.mix', 'local.mix', 'hires.mix', 'sounds.mix',
         'speech.mix', 'scores.mix', 'allies.mix', 'russian.mix',
         'expand.mix', 'expand2.mix', 'hires1.mix', 'lores1.mix', 'nchires.mix'],
  open: {},                     /* name -> parsed archive */
  /* name -> the BYTES that archive was opened from, for the archives the game actually
     consults. Kept so persistence can store what is used rather than what was picked: point
     the loader at a 320 MB MAIN.MIX and this holds the ~16 MB of art archives out of it. */
  bytes: {},
  pal: null,                    /* the CURRENT theatre's palette, 256 x RGB */
  pals: {},                     /* theatre id -> palette, both loaded up front */
  ready: false,
  note: ''
};

/* ------------------------------------------------------------- theatres --
   A map names a theatre and everything visual follows from it: which archive the tiles come
   out of, what extension they carry, and which palette the whole screen is drawn with. RA
   ships the same tile geometry in each - w1.tem and w1.sno are the same water, painted twice -
   so a theatre is a lookup rather than a code path.

   Only the two are here. Interior is a genuinely different tileset (it shares 2 templates with
   temperate, not 264) and would need its own classification table, so a map asking for it is
   still refused rather than drawn wrong. */
var RTS_THEATRES = {
  TEMPERAT: { ext: '.tem', pal: 'temperat.pal', mix: 'temperat.mix', name: 'temperate' },
  SNOW:     { ext: '.sno', pal: 'snow.pal',     mix: 'snow.mix',     name: 'snow' }
};
var RTS_THEATRE = 'TEMPERAT';

/* Switching theatres repaints everything, so every cached bake has to go - the same
   invalidation _mixFinish does when artwork first arrives, and for the same reason: a cache
   made under the old palette will happily keep drawing summer units on a snow map. */
function rtsSetTheatre(id) {
  id = String(id || 'TEMPERAT').toUpperCase();
  if (!RTS_THEATRES[id]) id = 'TEMPERAT';
  if (id === RTS_THEATRE) return id;
  RTS_THEATRE = id;
  if (RTS_MIX.pals[id]) RTS_MIX.pal = RTS_MIX.pals[id];
  _RTS_SPR = null; _RTS_UFIT = {}; _RTS_USCALE = {};
  _RTS_TREES = null; _RTS_MIXTREES = null; _RTS_TILECACHE = null; _RTS_MIXDEBRIS = null;
  _RTS_MIXBIB = null; _RTS_SHROUDSPR = null; _RTS_MIXMAKE = null; _RTS_MIXDIE = null;
  _RTS_MIXFX = null; _RTS_MIXWATER = null;
  return id;
}
/* The file extension the current theatre's tiles carry. */
function _rtsThExt() { return (RTS_THEATRES[RTS_THEATRE] || RTS_THEATRES.TEMPERAT).ext; }

/* --------------------------------------------------------- full-screen art --
   The title screen. It is a PCX rather than an SHP or a template, which is why nothing else
   here could read it; ra/pcx.js exists for this one file and the handful like it.

   Returns a canvas, or null when the player has not supplied hires.mix. Null is the normal
   case, not an error - the game draws its own title card and always has. */
function _mixPcx(name) {
  if (!window.RA_PCX) return null;
  var i, a, d = null;
  for (i = 0; i < RTS_MIX.want.length && !d; i++) {
    a = RTS_MIX.open[RTS_MIX.want[i]];
    if (a && !a.error && a.has(name)) d = a.read(name);
  }
  if (!d) return null;
  var img = window.RA_PCX.pcxOpen(d);
  if (!img || img.error || !img.pal) return null;
  var t = _sprMake(img.w, img.h);
  var im = t.g.createImageData(img.w, img.h);
  im.data.set(img.rgba());
  t.g.putImageData(im, 0, 0);
  return t.c;
}

var _RTS_TITLEART;
/* Cached, because the title screen re-runs this every time artwork arrives and decoding a
   256 KB image to put back the picture already on screen is pure waste. */
function _mixTitleArt() {
  if (_RTS_TITLEART !== undefined) return _RTS_TITLEART;
  return (_RTS_TITLEART = _mixPcx('title.pcx'));
}

/* ------------------------------------------------------------------ names --
   Our keys against the originals'. The mapping is the whole reason this file can be short:
   every structure and vehicle we invented was modelled on something real, so almost all of
   them have a counterpart. Anything absent here keeps its procedural sprite, which is why a
   missing entry is a fallback rather than a hole. */
var RTS_MIX_BLD = {
  yard:'fact', power:'powr', apower:'apwr', refinery:'proc', factory:'weap',
  barracks:'barr', radar:'dome', lab:'atek', depot:'fix', silo:'silo',
  helipad:'hpad', turret:'gun', rocketpit:'sam', pillbox:'pbox',
  flametower:'ftur', kennel:'kenn', wall:'brik',
  /* The Tesla Coil and the two shipyards, which were drawn procedurally only because nobody had
     looked for their art: tsla, syrd and spen are all sitting in conquer.mix. */
  tesla:'tsla', navalyard:'syrd', subpen:'spen',
  /* The superweapons. mslo.shp is in the expansion rather than conquer.mix - measured, not
     assumed: it is absent from all eleven base archives - so it draws its real sprite only for a
     player who owns Counterstrike or Aftermath and falls back to the procedural model for
     everyone else, exactly as an unowned theatre does. There is no GPS structure in the original
     at all: the satellite is a Tech Center power rather than a thing you place, so `gps` has no
     entry here and never will. */
  iron:'iron', pdox:'pdox', mslo:'mslo'
};
var RTS_MIX_UNIT = {
  buggy:'jeep', light:'1tnk', tank:'2tnk', heavy:'4tnk', arty:'arty',
  harvester:'harv', apc:'apc', mcv:'mcv', heli:'heli',
  rifle:'e1', rocket:'e3', grenadier:'e2', flame:'e4', engineer:'e6',
  medic:'medi', thief:'thf', tanya:'e7', dog:'dog'
};

/* Infantry are not a rotation set, they are a sequence table, and the layout comes straight
   from mods/ra/sequences/infantry.yaml:

       stand:        frames 0..7                    (one per facing)
       run:          Start 16, Length 6, Facings 8
       prone-stand:  Start 144, Stride 4, Facings 8 (so facing f is 144 + f*4)

   Only the two stances the renderer actually draws are wired up. The walk cycle is deliberately
   left for later: it needs the renderer to pick a frame from a sub-array per unit per tick, and
   that is a change to how every unit is drawn rather than a change to where sprites come from. */
var RTS_MIX_STAND = 0, RTS_MIX_PRONE = 144, RTS_MIX_PRONE_STRIDE = 4;
var RTS_MIX_RUN = 16, RTS_MIX_RUN_LEN = 6;

/* The walk cycle, as its own set: eight facings each holding six frames. Kept apart from the
   standing frames rather than folded in, because the renderer picks a stance first and a frame
   within it second, and a flat array cannot express that. */
function _mixWalk(key, side) {
  var nm = RTS_MIX_UNIT[key];
  if (!nm) return null;
  var d = rtsUnitDef(key);
  if (!d || d.kind !== 'infantry') return null;
  var s = _mixShp(nm + '.shp');
  if (!s) return null;
  var need = RTS_MIX_RUN + 8 * RTS_MIX_RUN_LEN;
  if (s.count < need) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  var out = [], f, k;
  for (f = 0; f < 8; f++) {
    var row = [], rf = _mixFacing(f, 8);
    for (k = 0; k < RTS_MIX_RUN_LEN; k++) {
      var fr = s.frame(RTS_MIX_RUN + rf * RTS_MIX_RUN_LEN + k);
      row.push(fr ? _mixFrameToCanvas(fr, s.width, s.height, pal)
                  : _sprMake(s.width, s.height).c);
    }
    out.push(row);
  }
  return out;
}

/* --------------------------------------------------------------- remapping --
   RA recolours a player's units by rewriting a RANGE of palette entries rather than by tinting
   the sprite - indices 80..95 are the team block, and every unit's artwork is drawn using them
   wherever it wants to show ownership. That is why the vehicles come out of the archive gold
   and green: those are the unremapped slots.

   Rebuilding the block from our own team colour keeps the original's shading intact - the ramp
   inside the block is preserved, only its hue moves - which is what a naive per-pixel tint
   destroys. */
var RTS_REMAP_LO = 80, RTS_REMAP_HI = 95;

function _mixTeamPal(base, hex) {
  var pal = new Uint8Array(base);
  var t = _sprCol(hex);
  for (var i = RTS_REMAP_LO; i <= RTS_REMAP_HI; i++) {
    /* position within the block, 0 = lightest in RA's ordering */
    var f = (i - RTS_REMAP_LO) / (RTS_REMAP_HI - RTS_REMAP_LO);
    /* a ramp from near-white through the team colour to near-black, matching how the block is
       used: highlights at the top, shadow at the bottom */
    var k = f < 0.5 ? (1 - f * 2) : 0, d = f < 0.5 ? 0 : (f - 0.5) * 2;
    for (var c = 0; c < 3; c++) {
      var v = t[c] * (1 - d) + 0 * d;         /* darken toward the bottom of the ramp */
      v = v + (255 - v) * k * 0.75;           /* lighten toward the top */
      pal[i * 3 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return pal;
}

/* A SHP frame is palette indices; index 0 is transparent. RA also reserves index 4 for the
   drop shadow, which is drawn as translucent black rather than as a palette colour - painting
   it literally puts a hard green blob under every unit. */
var RTS_SHADOW_INDEX = 4;

function _mixFrameToCanvas(fr, w, h, pal) {
  var cv = _sprMake(w, h), g = cv.g;
  var img = g.createImageData(w, h), d = img.data;
  for (var i = 0; i < w * h; i++) {
    var v = fr[i], o = i * 4;
    if (v === 0) { d[o + 3] = 0; continue; }
    if (v === RTS_SHADOW_INDEX) { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 90; continue; }
    d[o] = pal[v * 3]; d[o + 1] = pal[v * 3 + 1]; d[o + 2] = pal[v * 3 + 2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv.c;
}

function _mixShp(name) {
  var i, a;
  for (i = 0; i < RTS_MIX.want.length; i++) {
    a = RTS_MIX.open[RTS_MIX.want[i]];
    if (a && !a.error && a.has(name)) {
      var s = window.RA_SHP.shpOpen(a.read(name));
      if (!s.error) return s;
    }
  }
  return null;
}

function _rtsArtReady() { return !!(RTS_MIX.ready && RTS_MIX.pal); }

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
  var src = _mixTiles('w1' + _rtsThExt());
  if (!src || !src.tile || !src.tile.length) return false;
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

/* ------------------------------------------------------------------ load --
   Handed a list of File objects from a picker. Each is read, parsed, and kept; the palette is
   pulled out of local.mix. Everything is reported rather than assumed, because a player who
   picks the wrong folder should be told which archive is missing. */
/* Above this, an archive is opened by INDEX and its useful parts sliced out; below it, the
   whole file is read, which is simpler and costs nothing on a 2 MB conquer.mix.

   The threshold exists because a retail MAIN.MIX is a few hundred megabytes and reading one
   whole peaked the heap at 641 MB - twice the file, because FileReader hands back an
   ArrayBuffer and the copy into a Uint8Array is another. That survived on a desktop and would
   not survive on a phone, and this ships as an installable PWA. Measured, not assumed. */
var RTS_MIX_BIG = 32 << 20;

function _mixSlice(file, from, len) {
  return new Promise(function (res) {
    var fr = new FileReader();
    fr.onload = function () { res(new Uint8Array(fr.result)); };
    fr.onerror = function () { res(null); };
    fr.readAsArrayBuffer(file.slice(from, from + len));
  });
}

/* A big archive is a container: what is wanted from it is the dozen nested archives, which come
   to a few tens of megabytes between them, not the hundreds of megabytes of video around them.
   So the index is read from the head and only the wanted entries are sliced out - and because
   those slices are ordinary archives, everything downstream keeps working synchronously,
   which it must: _mixShp and the sound lookup are called from inside the render loop. */
function _mixLoadBig(file, got) {
  var name = String(file.name || '').toLowerCase();
  return _mixSlice(file, 0, Math.min(RTS_MIX_HEAD, file.size)).then(function (head) {
    if (!head) { got.push(name + ': could not be read'); return; }
    var top;
    try { top = window.RA_MIX.mixOpen(head); } catch (e) { top = { error: 'unreadable' }; }
    if (!top || top.error) { got.push(name + ': ' + ((top && top.error) || 'unreadable')); return; }
    got.push(name + ': ' + top.count + ' entries, read by index (' +
             Math.round(file.size / 1048576) + ' MB not loaded)');

    var wanted = RTS_MIX.want.concat(RTS_MIX_NEST).filter(function (v, i, a) { return a.indexOf(v) === i; });
    return wanted.reduce(function (chain, nm) {
      return chain.then(function () {
        if (RTS_MIX.open[nm]) return;                       /* a direct pick already won */
        var rec = top.byId(window.RA_MIX.mixHash(nm));
        if (!rec || rec.offset + rec.size > file.size) return;
        return _mixSlice(file, rec.offset, rec.size).then(function (bytes) {
          if (!bytes) return;
          var sub;
          try { sub = window.RA_MIX.mixOpen(bytes); } catch (e) { return; }
          if (!sub || sub.error) return;
          RTS_MIX.open[nm] = sub;
          if (RTS_MIX.want.indexOf(nm) >= 0) RTS_MIX.bytes[nm] = bytes;
          got.push('  ' + nm + ': ' + sub.count + ' files (sliced out of ' + name + ')');
        });
      });
    }, Promise.resolve());
  });
}
var RTS_MIX_HEAD = 6 << 20;      /* enough index for any real archive */

/* A DISC IMAGE IS A BAG OF ARCHIVES. Anyone who still has their Red Alert CDs has .iso files,
   not a folder of .mix files, and the archives are inside the image. ra/iso.js reads the disc's
   directory - a real one, with names in it, unlike a MIX index - so every archive on the disc can
   be listed rather than guessed at.

   Each one is handed onward as `file.slice(offset, offset + size)` with a name pinned to it. A
   file in a 2048-byte-sector image is a CONTIGUOUS byte range, so that slice IS the archive, and
   everything downstream - the small/big split, _mixLoadBig's index-only read of MAIN.MIX,
   _mixDescend, the IndexedDB persistence - carries on unchanged and unaware. Nothing is read
   into memory here: slicing a Blob does not copy it.

   Returns the replacement list. An image that will not parse contributes its reason to `got` and
   nothing else, which is how a DVD of family photos ends up saying so rather than saying
   nothing. */
function _mixExpandIso(list, got) {
  if (!window.RA_ISO) return Promise.resolve(list);
  var isos = list.filter(_mixIsIsoName), rest = list.filter(function (f) { return !_mixIsIsoName(f); });
  if (!isos.length) return Promise.resolve(list);

  return isos.reduce(function (chain, file) {
    return chain.then(function () {
      var nm = String(file.name || 'disc');
      return window.RA_ISO.isoOpen(function (from, len) {
        return _mixSlice(file, from, len);
      }, file.size).then(function (iso) {
        if (!iso || iso.error) { got.push(nm + ': ' + ((iso && iso.error) || 'unreadable')); return; }
        var mixes = iso.files.filter(function (e) { return /\.mix$/i.test(e.name); });
        if (!mixes.length) {
          got.push(nm + ': an ISO with ' + iso.files.length + ' files but no .mix archives in it');
          return;
        }
        mixes.forEach(function (e) {
          var b = file.slice(e.offset, e.offset + e.size);
          b.name = e.name.toLowerCase();          /* the rest of the loader matches lower-case */
          rest.push(b);
        });
        got.push(nm + (iso.label ? ' (' + iso.label + ')' : '') + ': ' + mixes.length +
                 ' archives on the disc — ' + mixes.map(function (e) { return e.name; }).join(', '));
      }, function () { got.push(nm + ': could not be read'); });
    });
  }, Promise.resolve()).then(function () { return rest; });
}
function _mixIsIsoName(f) { return /\.iso$/i.test(String(f && f.name || '')); }

function rtsMixLoadFiles(files, done) {
  var list = [], i;
  for (i = 0; i < files.length; i++) list.push(files[i]);
  if (!list.length) { done && done('No files chosen.'); return; }
  var got = [];
  _mixExpandIso(list, got).then(function (expanded) { _mixLoadList(expanded, got, done); });
}

function _mixLoadList(list, got, done) {
  if (!list.length) { _mixFinish(got, done); return; }

  /* Small archives first and in parallel; big ones one at a time, so two 300 MB files cannot
     both be part-way through a slice at once. */
  var small = list.filter(function (f) { return f.size <= RTS_MIX_BIG; });
  var big   = list.filter(function (f) { return f.size > RTS_MIX_BIG; });

  Promise.all(small.map(function (file) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () {
        var name = String(file.name || '').toLowerCase();
        try {
          var raw = new Uint8Array(fr.result);
          var a = window.RA_MIX.mixOpen(raw);
          if (a.error) got.push(name + ': ' + a.error);
          else {
            RTS_MIX.open[name] = a;
            if (RTS_MIX.want.indexOf(name) >= 0) RTS_MIX.bytes[name] = raw;
            got.push(name + ': ' + a.count + ' files');
          }
        } catch (e) { got.push(name + ': ' + (e && e.message ? e.message : 'unreadable')); }
        res();
      };
      fr.onerror = function () { got.push(file.name + ': could not be read'); res(); };
      fr.readAsArrayBuffer(file);
    });
  })).then(function () {
    return big.reduce(function (chain, f) {
      return chain.then(function () { return _mixLoadBig(f, got); });
    }, Promise.resolve());
  }).then(function () {
    _mixFinish(got, done);
  }, function (e) {
    got.push('load failed: ' + ((e && e.message) || e));
    _mixFinish(got, done);
  });
}

/* MAIN.MIX is a container of containers: conquer, local, temperat and hires are all nested
   inside it. Descending one level means a player can point at that one file instead of hunting
   down four - and since a MIX index stores hashes rather than names, the only way to find a
   nested archive is to ask for it by name, which is what this list is for.

   Only archives NOT already loaded are taken, so a directly chosen file always wins over a
   copy found inside something else. */
var RTS_MIX_NEST = ['conquer.mix', 'local.mix', 'temperat.mix', 'hires.mix', 'lores.mix',
                    'snow.mix', 'interior.mix', 'allies.mix', 'russian.mix', 'general.mix',
                    'redalert.mix', 'expand.mix', 'expand2.mix', 'aftrmath.mix',
                    /* the expansions' own art archives, one level further in: Aftermath keeps
                       its sprites in expand2.mix but its sidebar cameos in hires1.mix. */
                    'hires1.mix', 'lores1.mix', 'nchires.mix',
                    /* the audio: sounds and speech ship loose, the SCORE does not - scores.mix
                       is inside MAIN.MIX, which is why most players have the effects and not
                       the music until they point at that one file. */
                    'sounds.mix', 'speech.mix', 'scores.mix',
                    /* allies.mix and russian.mix look like faction data and are almost entirely
                       AUD - 34 sounds each, the side-specific speech. Measured, not assumed:
                       reading every entry and checking for an AUD header found them. */
                    'allies.mix', 'russian.mix'];

function _mixDescend(log) {
  var outer = Object.keys(RTS_MIX.open), i, j, grew = 0;
  for (i = 0; i < outer.length; i++) {
    var a = RTS_MIX.open[outer[i]];
    if (!a || a.error) continue;
    for (j = 0; j < RTS_MIX_NEST.length; j++) {
      var nm = RTS_MIX_NEST[j];
      if (RTS_MIX.open[nm] || !a.has(nm)) continue;
      var bytes = a.read(nm);
      if (!bytes) continue;
      try {
        var sub = window.RA_MIX.mixOpen(bytes);
        if (sub && !sub.error) {
          RTS_MIX.open[nm] = sub;
          /* a view into the parent's buffer; persisting it copies only this range */
          if (RTS_MIX.want.indexOf(nm) >= 0) RTS_MIX.bytes[nm] = bytes;
          log.push('  ' + nm + ': ' + sub.count + ' files (inside ' + outer[i] + ')');
          grew++;
        }
      } catch (e) { /* a nested archive that will not open is not the outer one's fault */ }
    }
  }
  return grew;
}

function _mixFinish(log, done) {
  /* one level is enough for MAIN.MIX -> general.mix -> the art archives */
  if (_mixDescend(log)) _mixDescend(log);
  /* Both theatre palettes, up front. They are 768 bytes each and live in the same archive, so
     loading only the current one would mean a map switch could find itself without a palette
     long after the picker has gone. */
  var loc = RTS_MIX.open['local.mix'];
  if (loc && !loc.error) {
    for (var th in RTS_THEATRES) {
      var p = loc.read(RTS_THEATRES[th].pal);
      if (p) RTS_MIX.pals[th] = window.RA_SHP.palOpen(p);
    }
    RTS_MIX.pal = RTS_MIX.pals[RTS_THEATRE] || RTS_MIX.pals.TEMPERAT || RTS_MIX.pal;
  }
  var haveArt = !!(RTS_MIX.open['conquer.mix'] && !RTS_MIX.open['conquer.mix'].error);
  RTS_MIX.ready = !!(haveArt && RTS_MIX.pal);
  RTS_MIX.note = log.join('\n');
  if (!haveArt) RTS_MIX.note += '\nconquer.mix is the one with the artwork in it.';
  if (!RTS_MIX.pal) RTS_MIX.note += '\nlocal.mix is needed for the palette.';
  /* every cached bake has to go, or the game keeps drawing the sprites it made before
     the content arrived */
  if (RTS_MIX.ready) { _RTS_SPR = null; _RTS_UFIT = {}; _RTS_USCALE = {};
                       _RTS_TREES = null; _RTS_MIXTREES = null; _RTS_TILECACHE = null;
                       _RTS_MIXDEBRIS = null; }
  /* Anything that keys off "is there artwork" is told HERE, at the single point where that
     becomes true, rather than by each path that might have delivered it. The editor button was
     hidden the first time round because it was announced from the file picker only, so artwork
     arriving from IndexedDB - the normal case on every visit after the first - left the button
     hidden with a full palette sitting behind it. */
  if (RTS_MIX.ready && typeof rtsShowEditor === 'function') rtsShowEditor();
  if (RTS_MIX.ready && typeof rtsBuildVoxSide === 'function') rtsBuildVoxSide();
  if (RTS_MIX.ready && typeof rtsShowTitleArt === 'function') rtsShowTitleArt();
  /* new archives can only ADD sounds, so the "not found" cache is the one that must go */
  if (typeof rtsSndReset === 'function') rtsSndReset();
  done && done(RTS_MIX.ready ? null : RTS_MIX.note, RTS_MIX.note);
}

/* The picker's change handler. Kept here rather than in rts.ui.js because everything it talks
   to is in this file, and because the whole feature has to be removable in one piece. */
function rtsMixPicked(input) {
  var note = document.getElementById('rtsMixNote');
  var picked = input.files;
  if (note) note.textContent = 'Reading...';
  rtsMixLoadFiles(picked, function (err, log) {
    if (_rtsArtReady() && typeof rtsStoreSaveMix === 'function') {
      /* Chosen once, not once per visit. 13 MB of archives is far too much for localStorage,
         so this goes to IndexedDB; see src/rts.store.js. */
      rtsStoreSaveMix().then(function (saved) {
        if (note && saved) {
          note.textContent += ' Kept in this browser — it will load itself next time. ';
          /* the way out has to be offered here too, not only after a restore: the visit that
             stores the files is the one where a player might want to undo it */
          if (typeof rtsAddForget === 'function') rtsAddForget(note);
        }
      });
    }
    if (!note) return;
    if (_rtsArtReady()) {
      note.textContent = 'Original artwork loaded. ' +
        Object.keys(RTS_MIX.open).length + ' archives read.';
      note.className = 'ok';
      /* the button stops being an instruction the moment it is obeyed, not on the next visit */
      if (typeof rtsPickDoneArt === 'function') rtsPickDoneArt();
    } else {
      note.textContent = (log || err || 'Nothing usable in those files.');
      note.className = 'bad';
    }
  });
}

/* ------------------------------------------------------------------ tiles --
   Terrain templates (.tem) are a different container again: a short header, then `count` tiles
   of width x height RAW palette indices back to back. No compression at all.

   The header field order took a moment - the obvious reading put ImgStart at offset 12, which
   is the FILE SIZE, and produced tiles that ran off the end of the buffer. It is at 16:

       0  uint16 width        (24)
       2  uint16 height       (24)
       4  uint16 count
      16  uint32 imgStart

   Only the base ground is taken from here. Rock, cliffs, trees and the ore fields stay
   procedural: those are multi-tile templates with real placement rules in the original, and
   half-applying them would look worse than either end state. */
function _mixTiles(name) {
  var i, a, d = null;
  for (i = 0; i < RTS_MIX.want.length && !d; i++) {
    a = RTS_MIX.open[RTS_MIX.want[i]];
    if (a && !a.error && a.has(name)) d = a.read(name);
  }
  if (!d || d.length < 40) return null;
  var dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  var w = dv.getUint16(0, true), h = dv.getUint16(2, true), n = dv.getUint16(4, true);
  var img = dv.getUint32(16, true), imgEnd = dv.getUint32(36, true);
  if (w !== RTS_TS || h !== RTS_TS || !n || imgEnd <= img || imgEnd + n > d.length) return null;
  /* EMPTY TILES ARE NOT STORED. Straight after the image data is one byte per tile POSITION
     giving the image slot it uses, with 255 meaning "this cell of the template is blank". A
     reader that assumes `count` tiles are present computes a size larger than the file and
     rejects it - which is what the first version did, silently dropping 43 of the ~300
     temperate templates, every one of them a shore or cliff piece with a hole in it. */
  var map = d.subarray(imgEnd, imgEnd + n), out = [];
  for (i = 0; i < n; i++) {
    var slot = map[i];
    var o = img + slot * w * h;
    out.push((slot === 255 || o + w * h > imgEnd) ? null : d.subarray(o, o + w * h));
  }
  return { w: w, h: h, n: n, tile: out };
}

var _RTS_TILECACHE = null;
function _mixGround() {
  if (_RTS_TILECACHE) return _RTS_TILECACHE;
  if (!_rtsArtReady()) return null;
  var ex = _rtsThExt();
  var clear = _mixTiles('clear1' + ex), water = _mixTiles('w1' + ex);
  if (!clear) return null;
  return (_RTS_TILECACHE = { clear: clear, water: water });
}

/* Paint one cell of the baked terrain canvas straight out of a template. Returns false when
   there is nothing suitable, so the caller falls back to its own noise for that cell. */
function _mixPaintCell(d, S, tx, tz, kind, seed) {
  var g = _mixGround();
  if (!g) return false;
  var set = null;
  if (kind === RTS_T_WATER && g.water) set = g.water;
  else if (kind === RTS_T_GRASS || kind === RTS_T_TREE) set = g.clear;
  if (!set) return false;
  var v = (_sprHash(tx, tz, seed + 137) * set.n) | 0;
  if (v >= set.n) v = set.n - 1;
  var t = set.tile[v], pal = RTS_MIX.pal;
  if (!t) return false;
  for (var y = 0; y < RTS_TS; y++) {
    var row = (tz * RTS_TS + y) * S;
    for (var x = 0; x < RTS_TS; x++) {
      var idx = t[y * RTS_TS + x], o = (row + tx * RTS_TS + x) * 4;
      d[o] = pal[idx * 3]; d[o + 1] = pal[idx * 3 + 1]; d[o + 2] = pal[idx * 3 + 2]; d[o + 3] = 255;
    }
  }
  return true;
}



/* -------------------------------------------------------------------- bibs --
   The concrete apron under a building. RA calls it a BIB and ships three, sized to the
   building above them:

     bib3   2 cells wide   4 frames
     bib2   3 cells wide   6 frames
     bib1   4 cells wide   8 frames

   All of them are two cells TALL, and all of them are SHPs carrying a theatre extension rather
   than terrain templates - the same trick the trees use, and the reason reading them with the
   template header gives nonsense (a width of 8 and a height of 0).

   Frames run left-to-right, top row then bottom. Our own drawn pad is a pale blob noticeably
   larger than the building; the original is a tyre-marked strip that lines up with the
   footprint exactly, which is why a base drawn with these looks built rather than pasted on. */
var RTS_MIX_BIBS = { 2: 'bib3', 3: 'bib2', 4: 'bib1' };
var _RTS_MIXBIB = null;

function _mixBib(wCells) {
  if (!_rtsArtReady()) return null;
  if (!_RTS_MIXBIB) _RTS_MIXBIB = {};
  var key = String(wCells);
  if (_RTS_MIXBIB[key] !== undefined) return _RTS_MIXBIB[key];
  _RTS_MIXBIB[key] = null;
  var nm = RTS_MIX_BIBS[wCells];
  if (!nm) return null;                       /* 1-cell things - walls, turrets - get no bib */
  var s = _mixShp(nm + _rtsThExt());
  if (!s || s.width !== RTS_TS || s.height !== RTS_TS) return null;
  var need = wCells * 2;
  if (s.count < need) return null;
  var pal = RTS_MIX.pal, out = [];
  for (var f = 0; f < need; f++) {
    var fr = s.frame(f);
    out.push(fr ? _mixFrameToCanvas(fr, s.width, s.height, pal) : _sprMake(RTS_TS, RTS_TS).c);
  }
  return (_RTS_MIXBIB[key] = { w: wCells, h: 2, tile: out });
}

/* ----------------------------------------------------------------- shroud --
   RA's own shroud tiles. `shadow.shp` in conquer.mix is 48 frames of 24x24 - exactly one
   tile - and each frame is a SHAPE: the diagonal wedges and corner nibbles that make the
   explored/unexplored boundary look cut rather than pixel-stepped.

   The frame you want is chosen by which NEIGHBOURS are unexplored, packed into a byte. The
   mapping from that byte to a frame number is not derivable - it is the order Westwood happened
   to store the frames in - so it is transcribed from OpenRA's ra/rules/world.yaml, whose
   ShroudRenderer carries the same list:

     Index: 255, 16, 32, 48, ... 5, 10, 15, 255

   read as "frame 0 covers edge-mask 255, frame 1 covers 16, ...". Inverted here into
   mask -> frame, which is the direction the renderer asks in.

   The bits, from OpenRA's Edges enum:

     0x01 top-left   0x02 top-right   0x04 bottom-right   0x08 bottom-left     (corners)
     0x10 top        0x20 right       0x40 bottom         0x80 left            (sides)

   A CORNER bit is only set when neither of its two adjacent sides is - otherwise the side
   piece already covers that corner, and setting both asks for a frame that does not exist. */
var RTS_SHROUD_INDEX = [
  255, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240,
  20, 40, 56, 65, 97, 130, 148, 194, 24, 33, 66, 132, 28, 41, 67, 134,
  1, 2, 4, 8, 3, 6, 12, 9, 7, 14, 13, 11, 5, 10, 15, 255
];
var _RTS_SHROUDMAP = null;
function _mixShroudMap() {
  if (_RTS_SHROUDMAP) return _RTS_SHROUDMAP;
  var m = new Int16Array(256);
  for (var i = 0; i < 256; i++) m[i] = -1;
  /* forwards, so an earlier frame wins a duplicate - 255 appears twice and frame 0 is the
     one the original uses for a fully-enclosed cell */
  for (var f = RTS_SHROUD_INDEX.length - 1; f >= 0; f--) m[RTS_SHROUD_INDEX[f]] = f;
  return (_RTS_SHROUDMAP = m);
}

/* The 48 frames as canvases, drawn in BLACK at the frame's own alpha. shadow.shp is a mask -
   its palette indices are shades, not colours - so the useful reading is "how opaque is this
   pixel", and index 0 is the transparent one. */
var _RTS_SHROUDSPR = null;
function _mixShroud() {
  if (_RTS_SHROUDSPR !== null) return _RTS_SHROUDSPR;
  _RTS_SHROUDSPR = false;
  if (!_rtsArtReady()) return false;
  var s = _mixShp('shadow.shp');
  if (!s || s.count < 48 || s.width !== RTS_TS || s.height !== RTS_TS) return false;
  var out = [];
  for (var f = 0; f < 48; f++) {
    var fr = s.frame(f);
    var t = _sprMake(RTS_TS, RTS_TS);
    if (fr) {
      var im = t.g.createImageData(RTS_TS, RTS_TS), dd = im.data;
      for (var k = 0; k < RTS_TS * RTS_TS; k++) {
        dd[k * 4] = 4; dd[k * 4 + 1] = 6; dd[k * 4 + 2] = 9;
        dd[k * 4 + 3] = fr[k] ? 255 : 0;
      }
      t.g.putImageData(im, 0, 0);
    }
    out.push(t.c);
  }
  return (_RTS_SHROUDSPR = out);
}

/* ------------------------------------------------------------------ trees --
   The forest. Trees are `.tem` files - SHPs with a theatre extension rather than templates,
   which is why probing for `t01.shp` found nothing. Frame 0 is the standing tree; the rest are
   the burning/felled sequence, which nothing here uses yet.

   Only the 48x48 singles are taken. tc01..tc05 are 72x48 and 96x72 clumps that occupy several
   cells and would need the placement rules that go with them; a clump dropped on a one-cell
   forest tile overlaps its neighbours and reads as a mess. */
var RTS_MIX_TREES = ['t01','t02','t03','t05','t06','t07','t08','t10','t11','t12','t13','t14',
                     't15','t16','t17'];
var _RTS_MIXTREES = null;

function _mixTrees() {
  if (_RTS_MIXTREES) return _RTS_MIXTREES;
  if (!_rtsArtReady()) return null;
  var out = [], i;
  for (i = 0; i < RTS_MIX_TREES.length; i++) {
    var s = _mixShp(RTS_MIX_TREES[i] + _rtsThExt());
    if (!s || s.width !== 48) continue;
    var fr = s.frame(0);
    if (!fr) continue;
    var c = _mixFrameToCanvas(fr, s.width, s.height, RTS_MIX.pal);
    /* The renderer wants footprint + headroom, the same shape the procedural trees return. A
       tree stands on ONE cell with everything above it overhang. */
    out.push({ c: c, head: Math.max(0, s.height - RTS_TS) });
  }
  return out.length ? (_RTS_MIXTREES = out) : null;
}

/* -------------------------------------------------------------------- ore --
   Ore and gems are overlay SHPs wearing the theatre extension, like the trees: gold01..gold04
   with TWELVE density frames each, gem01..gem04 with three. The original grows a field through
   those twelve stages, which is three times the resolution our own four-stage sprite had - so
   the renderer asks the sprite set how many stages it has rather than assuming.

   Four files x twelve frames is the variant axis and the density axis in one place: the file
   picked per cell is the variant, the frame within it is how full that cell is. */
function _mixOre(gem) {
  if (!_rtsArtReady()) return null;
  var base = gem ? 'gem' : 'gold', sets = [], i;
  for (i = 1; i <= 4; i++) {
    var s = _mixShp(base + '0' + i + _rtsThExt());
    if (s && s.count) sets.push(s);
  }
  if (!sets.length) return null;
  var stages = sets[0].count, out = [], st, v;
  for (st = 0; st < stages; st++) {
    var row = [];
    for (v = 0; v < sets.length; v++) {
      var set = sets[v], idx = Math.min(st, set.count - 1), fr = set.frame(idx);
      row.push(fr ? _mixFrameToCanvas(fr, set.width, set.height, RTS_MIX.pal)
                  : _sprMake(RTS_TS, RTS_TS).c);
    }
    out.push(row);
  }
  return out;
}

/* ----------------------------------------------------------------- debris --
   The single-cell scatter. `rf01`..`rf07` are loose rock on grass and `p01`..`p04` are set
   dressing - fallen logs, a wreck, a crashed aircraft - all 24x24 and all self-contained, which
   is exactly why they are the only part of the tileset that can be placed automatically.

   Everything larger in that file is a hand-authored piece from the map editor's palette; see the
   note in CLAUDE.md about why cliffs are not done this way. */
var RTS_MIX_DEBRIS = ['rf01','rf02','rf03','rf04','rf05','rf06','rf07'];
var RTS_MIX_PROPS  = ['p01','p02','p03','p04','b1'];
var _RTS_MIXDEBRIS = null;

function _mixDebris() {
  if (_RTS_MIXDEBRIS) return _RTS_MIXDEBRIS;
  if (!_rtsArtReady()) return null;
  var rock = [], props = [], i, t;
  for (i = 0; i < RTS_MIX_DEBRIS.length; i++) { t = _mixTiles(RTS_MIX_DEBRIS[i] + _rtsThExt()); if (t && t.tile[0]) rock.push(t.tile[0]); }
  for (i = 0; i < RTS_MIX_PROPS.length; i++)  { t = _mixTiles(RTS_MIX_PROPS[i] + _rtsThExt());  if (t && t.tile[0]) props.push(t.tile[0]); }
  if (!rock.length) return null;
  return (_RTS_MIXDEBRIS = { rock: rock, props: props });
}

/* Stamped straight into the baked terrain's pixels, skipping index 0 so the tile's own
   transparent margin does not punch a hole in the ground under it. */
function _mixStamp(d, S, tile, px, pz) {
  var pal = RTS_MIX.pal;
  for (var y = 0; y < RTS_TS; y++) {
    var gy = pz + y; if (gy < 0 || gy >= S) continue;
    for (var x = 0; x < RTS_TS; x++) {
      var gx = px + x; if (gx < 0 || gx >= S) continue;
      var v = tile[y * RTS_TS + x]; if (!v) continue;
      var o = (gy * S + gx) * 4;
      d[o] = pal[v * 3]; d[o + 1] = pal[v * 3 + 1]; d[o + 2] = pal[v * 3 + 2]; d[o + 3] = 255;
    }
  }
}
