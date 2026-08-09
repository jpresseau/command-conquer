/* core/ore.js - messages, ore growth (TIBERIUM adjacency) and low-power decay.
   Part of rts.core, the simulation. */

/* `secs` is for the one caller that needs a line which does NOT time out: when the simulation
   has been given up on, its countdown is driven by the very tick that stopped, so a message
   with an ordinary lifetime would either hang there by accident or vanish depending on where
   the throw landed. Saying "forever" explicitly is the honest version of both. */
function _rtsSay(m, secs) { var G = window._rtsG; G.msg = m; G.msgT = secs || 4; }

/* Ore regrows into partly-mined tiles and slowly seeds empty neighbours, so a worked-out
   field recovers instead of leaving a dead map (RULES.CPP: IsTGrowth / IsTSpread). */
/* MAP.CPP Map::Logic(). Ore growth is AMORTISED rather than done in one sweep: each frame
   scans `MAP_CELL_TOTAL / (GrowthRate * TICKS_PER_MINUTE)` cells from a rolling cursor, and
   candidates are collected by reservoir sampling -

       if (Random_Pick(0, Excess) <= Count) { add, or replace a random slot }
       Excess++

   - so the candidate list stays a bounded, roughly uniform sample of the whole map however
   much ore there is. When the cursor wraps, the sampled cells grow and spread. The win is
   that no frame ever pays for a full 112x112 pass; the old version walked every cell at once
   and that cost lands as a hitch on a slow machine. */
/* Random_Pick(0, hi), inclusive at both ends. */
function _rtsPick(rnd, hi) { return (rnd() * (hi + 1)) | 0; }
/* FacingType order, N first and clockwise, matching Adjacent_Cell(). */
var _RTS_FACE = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
/* Can_Tiberium_Germinate: on the map, nothing built on it, no ore already, and ground that
   could be BUILT on - which is stricter than "passable". Ore creeping across a road or a
   riverbank looks wrong and, worse, quietly makes unbuildable ground minable. */
function _rtsCanGerminate(tx, tz) {
  var G = window._rtsG;
  if (!_rtsInB(tx, tz)) return false;
  var i = _rtsIdx(tx, tz);
  if (G.scrap[i] > 0) return false;                 /* Overlay != OVERLAY_NONE */
  if (G.blocked[i] !== 0) return false;             /* a building or impassable terrain */
  return RTS_ORE_GROUND[G.terrain ? G.terrain[i] : RTS_T_GRASS] === true;
}
/* CELL.CPP Tiberium_Adjust. A cell's density is set from HOW MANY OF ITS EIGHT NEIGHBOURS
   also carry ore, through a lookup table. That single rule is what makes a field read as a
   field: the middle is thick, the edge thins out, and nothing needs a noise function.

       static int _adj[9]    = {0,1,3,4,6,7,8,10,11};
       static int _adjgem[9] = {0,0,0,1,1,1,2,2,2};   // and clamped to 2

   The gem table is the whole gem economy. A gem cell tops out at level 2 of 11, so a gem
   patch holds a fraction of the ore a gold field of the same area does - it is worth
   crossing the map for because each scoop pays 3x, not because there is a lot of it. */
var _RTS_ADJ = [0, 1, 3, 4, 6, 7, 8, 10, 11];
var _RTS_ADJ_GEM = [0, 0, 0, 1, 1, 1, 2, 2, 2];
function _rtsTiberiumAdjust(G) {
  var lvl = new Uint8Array(RTS_N * RTS_N), tx, tz, i;
  for (tz = 0; tz < RTS_N; tz++) for (tx = 0; tx < RTS_N; tx++) {
    i = _rtsIdx(tx, tz);
    if (G.scrap[i] <= 0) continue;
    var count = 0;
    for (var f = 0; f < 8; f++) {
      var nx = tx + _RTS_FACE[f][0], nz = tz + _RTS_FACE[f][1];
      if (_rtsInB(nx, nz) && G.scrap[_rtsIdx(nx, nz)] > 0) count++;
    }
    lvl[i] = G.gems[i] ? Math.min(_RTS_ADJ_GEM[count], 2) : _RTS_ADJ[count];
  }
  for (i = 0; i < lvl.length; i++) {
    if (G.scrap[i] <= 0) continue;
    /* (OverlayData + 1) steps of ore, scaled onto this game's per-tile capacity. */
    /* RICHNESS scales the whole table. Tiberium_Adjust puts most of a blob at 7-8 ore
       neighbours and therefore near the top of _adj, which is nearly twice what the old
       radial falloff averaged - the same field footprints would have handed both sides
       double the economy. Scaling here rather than shrinking the fields matters: the
       footprints are what the AI's refinery placement and its harvesters navigate by, and
       pulling ore away from the bases stopped the Commando AI expanding at all (19
       buildings down to 8). Same map, same distances, less in each tile. */
    G.scrap[i] = (lvl[i] + 1) / RTS_ORE_LEVELS * RTS_SCRAP_TILE * RTS_ORE_RICHNESS;
  }
  G.scrapDirty = true;
}
function _rtsTickOre(dt) {
  var G = window._rtsG;
  if (!G.oreRnd) G.oreRnd = _rtsRngMake(G.seed ^ 0x5eed);
  if (!G.oreGrow) { G.oreGrow = []; G.oreSpread = []; G.oreScan = 0; G.oreGExcess = 0; G.oreSExcess = 0; }

  /* how many cells to look at this step so the whole map is covered in RTS_ORE_GROW_EVERY */
  /* Random_Pick(lo, hi) is INCLUSIVE of both ends, and the reservoir depends on that: with
     Excess 0 and Count 0 the original's test is `0 <= 0`, which is true, so the very first
     candidate always enters the list. Translating it as `rnd() * (excess+1) <= count` makes
     that first test `something-above-zero <= 0` - never true - and the list stays empty
     forever. Ore then silently never grows, with nothing thrown and nothing logged. */
  var total = RTS_N * RTS_N;
  var sub = Math.max(1, Math.ceil(total * dt / RTS_ORE_GROW_EVERY));
  var i, r;
  for (var n = 0; n < sub && G.oreScan < total; n++, G.oreScan++) {
    i = G.oreScan;
    var a = G.scrap[i];
    if (a <= 0) continue;
    if (G.gems[i]) continue;                 /* IsTGrowth is ore only - a gem field is finite */

    /* Can_Tiberium_Grow: `OverlayData >= 11` cannot grow any further. This full-tile test
       used to sit above BOTH lists, so a tile at full density was skipped outright and never
       spread either - exactly backwards, because Can_Tiberium_Spread wants the RICHEST cells
       and a full one is the likeliest seeder there is. The two questions are separate in
       CELL.CPP and have to be separate here. */
    if (a < RTS_SCRAP_TILE) {
      if (_rtsPick(G.oreRnd, G.oreGExcess) <= G.oreGrow.length) {
        if (G.oreGrow.length < RTS_ORE_SAMPLE) G.oreGrow.push(i);
        else G.oreGrow[(G.oreRnd() * G.oreGrow.length) | 0] = i;
      }
      G.oreGExcess++;
    }

    /* Can_Tiberium_Spread - only a rich cell can seed a neighbour */
    if (a > RTS_SCRAP_TILE * RTS_ORE_SPREAD_MIN) {
      if (_rtsPick(G.oreRnd, G.oreSExcess) <= G.oreSpread.length) {
        if (G.oreSpread.length < RTS_ORE_SAMPLE) G.oreSpread.push(i);
        else G.oreSpread[(G.oreRnd() * G.oreSpread.length) | 0] = i;
      }
      G.oreSExcess++;
    }
  }
  if (G.oreScan < total) return;

  /* the cursor has wrapped: apply what was sampled */
  G.oreScan = 0;
  var grew = false;
  for (n = 0; n < G.oreGrow.length; n++) {
    i = G.oreGrow[n];
    if (G.scrap[i] <= 0 || G.scrap[i] >= RTS_SCRAP_TILE) continue;
    G.scrap[i] = Math.min(RTS_SCRAP_TILE, G.scrap[i] + RTS_ORE_GROW_AMT);
    grew = true;
  }
  for (n = 0; n < G.oreSpread.length; n++) {
    i = G.oreSpread[n];
    if (G.oreRnd() >= RTS_ORE_SPREAD_CHANCE) continue;
    /* Spread_Tiberium: pick a random STARTING facing, then walk all eight in order and take
       the first cell that can germinate. Picking one direction at random and giving up when
       it fails - which is what this did - biases growth to the four cardinals and leaves
       permanent holes inside a field, because the one cell that could have been filled is
       only ever offered a 1-in-4 chance per attempt. */
    var tx = i % RTS_N, tz = (i / RTS_N) | 0;
    var off = _rtsPick(G.oreRnd, 7);
    for (var s = 0; s < 8; s++) {
      var fc = _RTS_FACE[(off + s) & 7];
      var nx = tx + fc[0], nz = tz + fc[1];
      if (!_rtsCanGerminate(nx, nz)) continue;
      G.scrap[_rtsIdx(nx, nz)] = RTS_SCRAP_TILE / RTS_ORE_LEVELS;   /* OverlayData = 0 */
      G.scrapDirty = true;           /* new tile - the render layer must re-lay the field */
      break;
    }
  }
  G.oreGrow.length = 0; G.oreSpread.length = 0;
  G.oreGExcess = 0; G.oreSExcess = 0;
  if (grew) G.oreGrew = true;
}

/* HouseClass::AI: "if there is insufficient power, then all buildings that are above half
   strength take a little bit of damage." Only buildings that actually DRAW power - the
   original notes this specifically so that land mines do not blow themselves up in a
   brownout. This is what makes losing your power plants cost something even before you
   notice the production slowdown. */
function _rtsPowerDamage(dt) {
  var G = window._rtsG;
  G.dmgT = (G.dmgT || 0) + dt;
  if (G.dmgT < RTS_DAMAGE_DELAY) return;
  G.dmgT = 0;
  for (var side in G.sides) {
    if (_rtsPowerFactor(side) >= 0.999) continue;
    for (var i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (e.dead || e.type !== 'struct' || e.side !== side || e.building || e.selling) continue;
      var d = rtsStructDef(e.def);
      if (d.power >= 0) continue;                     /* only what draws power */
      if (e.hp <= e.maxHp * RTS_COND_YELLOW) continue; /* "above half strength" */
      e.hp -= RTS_POWER_DAMAGE;
      e.hitT = 0.18;
    }
  }
}

