/* core/spatial.js - the per-tick spatial index. Part of rts.core, the simulation.

   WHY IT EXISTS. Target acquisition walked the whole entity list, per armed unit, per tick.
   That is O(n^2), and measured on two armies standing in front of each other it dominated
   everything else the simulation does:

     units    _rtsTick    _rtsFindTarget          _rtsOverrun
        43     0.82ms       0.51ms  (63%)          0.09ms (10%)
       166     7.76ms       5.84ms  (75%)          0.93ms (12%)
       320    27.16ms      21.29ms  (78%)          3.76ms (14%)

   320 units is a big battle, not an absurd one, and at that size the SIMULATION ALONE was
   spending 27ms of a 16.7ms frame on a desktop-class CPU - before a single pixel was drawn.
   Doubling the army size very nearly quadrupled the cost, which is the signature of the two
   full-list scans above and of nothing else: per call, _rtsFindTarget went 11.4us -> 34.7us ->
   66.1us, dead linear in the number of entities.

   WHAT IT DOES. Once per tick the live entities are filed into square buckets; a scan then
   asks for the buckets covering its own radius instead of the whole map. The per-candidate
   test in each caller is UNCHANGED - this only shortens the list the test runs over, so a
   caller can only see fewer candidates, never different ones. That makes the whole change
   verifiable by one question, which test/e2e/spatial.test.js asks every tick of a real
   battle: does the indexed scan return the same object the full scan would have?

   THE PAD is what makes "fewer candidates" mean "fewer irrelevant candidates" rather than
   "fewer correct ones", and it is the only part of this file that can be wrong quietly. Three
   things let a candidate matter from further away than the radius a caller asks for:

     ELEVATION. _rtsElevReach hands a unit standing high up to RTS_ELEV_MAX * RTS_ELEV_RANGE
       of extra reach, so it really can shoot something outside its nominal range.
     MOVEMENT. The index is built at the top of the tick and entities move during it -
       _rtsSteer inside the entity loop, _rtsSeparate after it. dt is clamped to 0.1 and the
       fastest hull in the roster does 25 world units a second, so no entity travels more than
       ~2.5 units plus a separation shove of at most a couple more.
     BUILDING SIZE. _rtsRangeTo measures to a structure's EDGE, not its centre. That one is
       not handled by the pad at all: structures are filed into every bucket their footprint
       covers, which is exact and costs nothing since they never move.

   test/unit/spatial.js pins the pad against the first two of those, so a roster change that
   raises RTS_ELEV_MAX or adds a faster hull fails there rather than in a battle. */

/* Two tiles a bucket. Swept at 320 units, twice - once with the army packed a tile apart and
   once at a spacing a battle line actually holds:

     bucket        6      8     12     16     24     32
     packed    13.68  13.39  13.70  13.04  13.15  14.46   ms/tick
     spread     4.62   4.50   4.73   5.26   5.82   6.01

   Packed, the size barely matters - the candidates really are all within reach and no grid can
   make them fewer. Spread out, which is what a formation on the move looks like, the small
   buckets win by a quarter. */
var RTS_SP_CELL = 8;
/* Two pads, because the callers need different ones and the difference is most of the win.
   RTS_SP_MOVE covers everything moving DURING the tick the index was built for: dt is clamped
   to 0.1 and the fastest thing in the roster is the MiG at 30 world units a second, so 3.0 of
   travel, plus a separation shove that cannot exceed the widest radius in the game - 2.8, for
   the Cruiser. 5.8, rounded up. test/unit/spatial re-derives both from the roster and fails if
   an edit to rules/ outgrows this number, which is how the first draft's 5 was caught. RTS_SP_ELEV is only for a
   scan that will go on to ask _rtsElevReach, which hands a unit standing high up to
   RTS_ELEV_MAX * RTS_ELEV_RANGE of extra reach. A crusher looking for men under its tracks
   measures plain distance and must not pay for it. */
var RTS_SP_MOVE = 8;
var RTS_SP_ELEV = 5;

/* Not on window._rtsG, deliberately. _rtsSaveState serialises every enumerable field of the
   game state and of every entity, so an index parked there would be walked into the save file
   - a Map it cannot encode, and a per-entity ordinal that would show up as a difference in the
   save-identity tests. The index is derived state and is rebuilt every tick; it has no place
   in a save. */
var _RTS_SP = null;

function _rtsSpKey(cx, cz) { return (cx + 4096) * 8192 + (cz + 4096); }
function _rtsSpCellOf(v) { return Math.floor(v / RTS_SP_CELL); }

/* Buckets hold ORDINALS - positions in G.ents - not entity references.

   That is the difference between this being worth doing and not. A query has to hand its
   candidates back in entity-list order (see _rtsSpNear), and the first draft did it by sorting
   entity references with a comparator that did two Map lookups per comparison. Measured at 320
   units, that overhead ate most of what the bucketing saved: the target scan went 21.3ms with
   no index at all, 13.6ms sorting references, 7.2ms sorting integers. (The per-caller pads
   below landed in the same edit, so the second step is not the sort alone.) */
function _rtsSpFile(e, ord) {
  if (!_RTS_SP) return;
  var cells = _RTS_SP.cells, k, b;
  /* A structure covers whole tiles and is filed across all of them, so a scan that reaches
     its EDGE finds it without the query needing to know how big it is. */
  var sd = e.type === 'struct' ? rtsStructDef(e.def) : null;
  if (sd) {
    var hw = sd.w * RTS_TILE / 2, hh = sd.h * RTS_TILE / 2;
    var x0 = _rtsSpCellOf(e.x - hw), x1 = _rtsSpCellOf(e.x + hw);
    var z0 = _rtsSpCellOf(e.z - hh), z1 = _rtsSpCellOf(e.z + hh);
    for (var cx = x0; cx <= x1; cx++) for (var cz = z0; cz <= z1; cz++) {
      k = _rtsSpKey(cx, cz); b = cells.get(k); if (b) b.push(ord); else cells.set(k, [ord]);
    }
    return;
  }
  k = _rtsSpKey(_rtsSpCellOf(e.x), _rtsSpCellOf(e.z));
  b = cells.get(k); if (b) b.push(ord); else cells.set(k, [ord]);
}

/* Rebuilt from scratch at the top of every tick. Cheap - one pass over the entity list, which
   is what a single target scan used to cost on its own. */
function _rtsSpBuild() {
  var G = window._rtsG;
  if (!G) { _RTS_SP = null; return; }
  if (!_RTS_SP) _RTS_SP = { cells: new Map(), g: null, n: 0 };
  _RTS_SP.cells.clear();
  _RTS_SP.g = G;
  _RTS_SP.n = G.ents.length;
  for (var i = 0; i < G.ents.length; i++) _rtsSpFile(G.ents[i], i);
}

/* Entities that come into being DURING a tick - a factory finishing, a crate's free unit, a
   transport unloading - are filed as they are created rather than being invisible to target
   acquisition until the next frame. Called from the two places anything is ever pushed onto
   G.ents; without it this change would quietly cost every new unit one frame of blindness.

   Nothing is ever REMOVED from the index. Dead entities are reaped from G.ents at the end of
   _rtsTick, after every scan has run, and until then their ordinals still point at them - and
   every caller already skips `o.dead`, because the full-list scans did too. */
function _rtsSpAdd(e) {
  var G = window._rtsG;
  if (!_RTS_SP || _RTS_SP.g !== G || _RTS_SP.n !== G.ents.length - 1) return;
  _rtsSpFile(e, G.ents.length - 1);
  _RTS_SP.n = G.ents.length;
}

/* Every live entity whose bucket touches the square around (x,z) of the given radius, IN
   ENTITY-LIST ORDER.

   The order is not a nicety. _rtsFindTarget keeps the first candidate of the best score and
   _rtsOverrun runs men down in the order it meets them - and _rtsScatter draws from the shared
   random stream - so a scan that visited the same objects in a different sequence would pick a
   different target on a tie and pull the simulation onto a different path. Returning them
   ordered by their position in G.ents makes the indexed scan and the full scan the same scan.

   Returns null when there is no index (before the first tick, or for a different match), and
   every caller falls back to the full list on null - so this file can be removed and the
   simulation still runs, just slowly. */
function _rtsSpNear(x, z, r, pad) {
  var G = window._rtsG;
  if (!_RTS_SP || _RTS_SP.g !== G) return null;
  /* THE LIST MOVED UNDER THE INDEX. Ordinals are positions in G.ents, so one splice makes
     every ordinal past it point at the wrong entity - and the last few point past the end.
     _rtsTick reaps its dead at the very bottom, after every scan has run, so this never bites
     mid-tick; it bites the moment anything asks BETWEEN ticks, which is where it was caught.
     Falling back to the full list is the honest answer: correct, and slow only for scans that
     happen outside the simulation step. */
  if (_RTS_SP.n !== G.ents.length) return null;
  var rr = r + RTS_SP_MOVE + (pad || 0), cells = _RTS_SP.cells, ents = G.ents;
  var x0 = _rtsSpCellOf(x - rr), x1 = _rtsSpCellOf(x + rr);
  var z0 = _rtsSpCellOf(z - rr), z1 = _rtsSpCellOf(z + rr);
  /* A radius wide enough to cover the map is not worth bucketing: hand back the list itself,
     which is both correct and faster than rebuilding it a cell at a time. */
  if ((x1 - x0 + 1) * (z1 - z0 + 1) >= cells.size) return ents;
  var ord = [];
  for (var cx = x0; cx <= x1; cx++) {
    for (var cz = z0; cz <= z1; cz++) {
      var b = cells.get(_rtsSpKey(cx, cz));
      if (!b) continue;
      for (var i = 0; i < b.length; i++) ord.push(b[i]);
    }
  }
  ord.sort(_rtsSpAsc);
  /* A structure sits in several buckets, so its ordinal can be collected more than once. The
     sort puts the copies next to each other and this drops them - cheaper than a Set, and the
     sort has to happen anyway. */
  var out = [], prev = -1;
  for (var j = 0; j < ord.length; j++) {
    if (ord[j] === prev) continue;
    prev = ord[j];
    out.push(ents[prev]);
  }
  return out;
}
function _rtsSpAsc(a, b) { return a - b; }

/* The widest sonar radius anyone in the roster carries, for _rtsCloakAI's bucketed scan.

   Computed from the roster rather than written down, and cached, because the number that
   matters is the largest `detects` in the game - a value a units.js edit is free to raise.
   Hard-coding it would have made a new hull with better sonar silently unable to find
   anything, which is the kind of break that looks like a balance problem for a month. */
var _RTS_SP_DET = 0;
function _rtsSpDetectMax() {
  if (_RTS_SP_DET) return _RTS_SP_DET;
  var m = RTS_SUB_DETECT, i;
  for (i = 0; i < RTS_UNITS.length; i++) if (RTS_UNITS[i].detects > m) m = RTS_UNITS[i].detects;
  for (i = 0; i < RTS_STRUCTS.length; i++) if (RTS_STRUCTS[i].detects > m) m = RTS_STRUCTS[i].detects;
  return (_RTS_SP_DET = m);
}
