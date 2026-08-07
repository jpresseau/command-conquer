/* mixart/theatres.js - which archives hold what, the full-screen art, and the SHP names
   for every structure and unit. Part of rts.mixart, the player's own artwork. */

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
  _RTS_MIXFX = null; _RTS_MIXWATER = null; _RTS_HARVANIM = {}; _RTS_IDLEANIM = {};
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
  /* The Soviet Airfield and the Allied AA Gun. Both measured as present in the BASE conquer.mix
     rather than assumed: afld.shp is 16 frames of 72x48 (3x2 cells, 8 healthy + 8 damaged, the
     layout _mixBuilding already expects) and agun.shp is 128 frames of 24x48 (1x2). Probed with
     the same hash lookup the loader uses, with mslo.shp as the control - it is absent from all
     eleven archives, exactly as its comment below claims. */
  afld:'afld', aagun:'agun',
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
  harvester:'harv', apc:'apc', mcv:'mcv', heli:'heli', mig:'mig', yak:'yak',
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

