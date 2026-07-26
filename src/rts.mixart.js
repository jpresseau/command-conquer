/* RC COMMAND - real Red Alert artwork, read from the player's own game files.

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
  want: ['conquer.mix', 'temperat.mix', 'local.mix', 'hires.mix'],
  open: {},                     /* name -> parsed archive */
  pal: null,                    /* the temperate palette, 256 x RGB */
  ready: false,
  note: ''
};

/* ------------------------------------------------------------------ names --
   Our keys against the originals'. The mapping is the whole reason this file can be short:
   every structure and vehicle we invented was modelled on something real, so almost all of
   them have a counterpart. Anything absent here keeps its procedural sprite, which is why a
   missing entry is a fallback rather than a hole. */
var RTS_MIX_BLD = {
  yard:'fact', power:'powr', apower:'apwr', refinery:'proc', factory:'weap',
  barracks:'barr', radar:'dome', lab:'atek', depot:'fix', silo:'silo',
  helipad:'hpad', turret:'gun', rocketpit:'sam', pillbox:'pbox',
  flametower:'ftur', kennel:'kenn', wall:'brik'
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
  return { c: c, head: Math.max(0, s.height - footD) };
}

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
function rtsMixLoadFiles(files, done) {
  var left = files.length, got = [];
  if (!left) { done && done('No files chosen.'); return; }
  for (var i = 0; i < files.length; i++) {
    (function (file) {
      var fr = new FileReader();
      fr.onload = function () {
        var name = String(file.name || '').toLowerCase();
        try {
          var a = window.RA_MIX.mixOpen(new Uint8Array(fr.result));
          if (a.error) got.push(name + ': ' + a.error);
          else { RTS_MIX.open[name] = a; got.push(name + ': ' + a.count + ' files'); }
        } catch (e) { got.push(name + ': ' + (e && e.message ? e.message : 'unreadable')); }
        if (--left === 0) _mixFinish(got, done);
      };
      fr.onerror = function () { got.push(file.name + ': could not be read'); if (--left === 0) _mixFinish(got, done); };
      fr.readAsArrayBuffer(file);
    })(files[i]);
  }
}

function _mixFinish(log, done) {
  var loc = RTS_MIX.open['local.mix'];
  if (loc && !loc.error) {
    var p = loc.read('temperat.pal');
    if (p) RTS_MIX.pal = window.RA_SHP.palOpen(p);
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
  done && done(RTS_MIX.ready ? null : RTS_MIX.note, RTS_MIX.note);
}

/* The picker's change handler. Kept here rather than in rts.ui.js because everything it talks
   to is in this file, and because the whole feature has to be removable in one piece. */
function rtsMixPicked(input) {
  var note = document.getElementById('rtsMixNote');
  if (note) note.textContent = 'Reading...';
  rtsMixLoadFiles(input.files, function (err, log) {
    if (!note) return;
    if (_rtsArtReady()) {
      note.textContent = 'Original artwork loaded. ' +
        Object.keys(RTS_MIX.open).length + ' archives read.';
      note.className = 'ok';
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
  var img = dv.getUint32(16, true);
  if (w !== RTS_TS || h !== RTS_TS || !n || img + n * w * h > d.length) return null;
  var out = [];
  for (i = 0; i < n; i++) out.push(d.subarray(img + i * w * h, img + (i + 1) * w * h));
  return { w: w, h: h, n: n, tile: out };
}

var _RTS_TILECACHE = null;
function _mixGround() {
  if (_RTS_TILECACHE) return _RTS_TILECACHE;
  if (!_rtsArtReady()) return null;
  var clear = _mixTiles('clear1.tem'), water = _mixTiles('w1.tem');
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
  for (var y = 0; y < RTS_TS; y++) {
    var row = (tz * RTS_TS + y) * S;
    for (var x = 0; x < RTS_TS; x++) {
      var idx = t[y * RTS_TS + x], o = (row + tx * RTS_TS + x) * 4;
      d[o] = pal[idx * 3]; d[o + 1] = pal[idx * 3 + 1]; d[o + 2] = pal[idx * 3 + 2]; d[o + 3] = 255;
    }
  }
  return true;
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
    var s = _mixShp(RTS_MIX_TREES[i] + '.tem');
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
    var s = _mixShp(base + '0' + i + '.tem');
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
  for (i = 0; i < RTS_MIX_DEBRIS.length; i++) { t = _mixTiles(RTS_MIX_DEBRIS[i] + '.tem'); if (t) rock.push(t.tile[0]); }
  for (i = 0; i < RTS_MIX_PROPS.length; i++)  { t = _mixTiles(RTS_MIX_PROPS[i] + '.tem');  if (t) props.push(t.tile[0]); }
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
