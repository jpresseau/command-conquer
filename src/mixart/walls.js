/* mixart/walls.js - Red Alert's own sandbag wall, laid by connection mask.
   Part of rts.mixart, the player's own artwork.

   THIS ONE IS AN ACTUAL AUTOTILE, and it is the only piece of the tileset that is. The cliffs had
   to be classified from their pixels because the terrain classes encode passability rather than
   shape, and the shore had to be chosen by comparing pictures because whole templates cannot
   follow a one-cell coastline. A wall is different: RA's overlay walls are drawn from SIXTEEN
   frames indexed by WHICH NEIGHBOURS ARE ALSO WALL, and the piece for a given neighbourhood is
   simply frame[mask]. No fitting, no scoring, no measurement of how well it came out - it either
   joins or the bit order is wrong.

     N = 1    E = 2    S = 4    W = 8

   That order was confirmed by building walls out of it rather than by trusting a wiki: a cross, a
   pair of corners and a T-junction all come out continuous, and any transposition of the bits
   breaks them into stubs. sbag.shp is 32 frames of 24x24 - the sixteen above, then the same
   sixteen as rubble, which nothing here uses because our walls are terrain rather than something
   with hit points.

   What it replaces is one horizontal bag stack drawn on every wall cell, which is why a wall
   running north-south read as a ladder of separate blocks. */
var _RTS_WALLSET;

/* The other five wall types RA ships - cycl, brik, barb, wood, fenc - are the same 16-frame
   arrangement and would drop straight in. Only the sandbag is used because it is the only one
   our own terrain has ever meant: RTS_T_WALL is placed as a sandbag emplacement. */
var RTS_WALL_SHP = 'sbag.shp';

function _mixWallSet() {
  if (_RTS_WALLSET !== undefined) return _RTS_WALLSET;
  _RTS_WALLSET = null;
  if (!_rtsArtReady()) return null;
  var s = _mixShp(RTS_WALL_SHP);
  if (!s || s.count < 16 || s.width !== RTS_TS || s.height !== RTS_TS) return null;
  var out = [];
  for (var f = 0; f < 16; f++) {
    var fr = s.frame(f);
    if (!fr) return null;                    /* a partial set would join in some directions only */
    out.push(_mixFrameToCanvas(fr, s.width, s.height, RTS_MIX.pal));
  }
  return (_RTS_WALLSET = out);
}

/* Which frame a wall cell wants, from its four orthogonal neighbours. Pure - it takes the
   predicate rather than reaching for G - so the bit order can be checked without artwork. */
function _rtsWallMask(isWall, x, z) {
  return (isWall(x, z - 1) ? 1 : 0) | (isWall(x + 1, z) ? 2 : 0) |
         (isWall(x, z + 1) ? 4 : 0) | (isWall(x - 1, z) ? 8 : 0);
}
