/* mixart/tiles.js - terrain templates, bibs, shroud, trees, ore and debris.
   Part of rts.mixart, the player's own artwork. */

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
  var clear = _mixTiles('clear1' + ex);
  if (!clear) return null;
  /* OPEN WATER IS FIVE TILES, NOT ONE. w1 is a single 24x24 tile and asking for it alone put the
     same one in every water cell on the map - a lake of one repeating speckle, which is what made
     the sea read as flat colour once the drawn ripples on top of it were dropped. w2 is a 2x2
     template whose four tiles are all open water too, so the pool is w1 plus those four. */
  var w1 = _mixTiles('w1' + ex), w2 = _mixTiles('w2' + ex), pool = [];
  [w1, w2].forEach(function (t) {
    if (!t) return;
    for (var i = 0; i < t.tile.length; i++) if (t.tile[i]) pool.push(t.tile[i]);
  });
  var water = pool.length ? { w: RTS_TS, h: RTS_TS, n: pool.length, tile: pool } : null;
  return (_RTS_TILECACHE = { clear: clear, water: water });
}

/* Paint one cell of the baked terrain canvas straight out of a template. Returns false when
   there is nothing suitable, so the caller falls back to its own noise for that cell. */
function _mixPaintCell(d, S, tx, tz, kind, seed) {
  var g = _mixGround();
  if (!g) return false;
  var set = null;
  if (kind === RTS_T_WATER && g.water) set = g.water;
  /* A wall and a road stand ON clear ground, and both used to be left out of this - so with the
     player's files loaded every sandbag cell wore a pale square of the PROCEDURAL grass, one cell
     exactly, against RA's darker real grass all around it. Invisible until sbag.shp arrived and
     stopped covering the whole cell; the road had the same hole showing through its dithered
     verge the entire time. The cell is repainted here and whatever stands on it goes on top. */
  else if (kind === RTS_T_GRASS || kind === RTS_T_TREE ||
           kind === RTS_T_WALL || kind === RTS_T_ROAD) set = g.clear;
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
  /* THE ART CHECK COMES FIRST, and it is the only sibling here that had it the other way round.
     Caching `false` before asking whether there is any artwork meant one frame rendered before
     the archives arrived poisoned the answer for the whole session: the player loaded their
     files, every other bake was cleared and redone, and the fog kept its blocky fallback edges
     instead of shadow.shp's cut diagonals until they reloaded the page. Measured at 3.6% of the
     screen's pixels. Nothing is cached until there is something real to cache. */
  if (!_rtsArtReady()) return false;
  _RTS_SHROUDSPR = false;
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
