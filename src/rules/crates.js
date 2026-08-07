/* rules/crates.js - the crate table and the shroud constants. Part of rts.rules. */

/* ---------------------------------------------------------------- crates --
   CRATE.CPP. A crate is a map OVERLAY, not an object: `Put_Crate` stamps one into a cell and
   `Get_Crate` clears it. Crates do not accumulate - each one carries a timer, and when it
   expires the crate is removed and re-created somewhere else, so the map always holds the
   same number of them however long the match runs.

     Timer = Random_Pick(CrateTime * TICKS_PER_MINUTE/2, CrateTime * TICKS_PER_MINUTE*2)

   ...so a crate lives between half and twice `CrateTime`. Placement re-rolls a random map
   location until the cell is clear to build.

   `WaterCrateChance` and `OVERLAY_WATER_CRATE` are deliberately NOT ported. In the original,
   `Is_Clear_To_Build(SPEED_FLOAT)` means clear for something that FLOATS, and a crate bobbing
   in the sea is collectable because RA has ships. This game has no naval units and its water
   cells are blocked outright, so a water crate would be loot nobody could ever reach - and
   worse than useless, because it would hold one of the three crate slots hostage for its
   entire lifetime. Measured before it was cut: with water cells blocked, the placement search
   rejected every one of them and fell through to land 120 times out of 120, so the feature
   was already dead code pretending to work.

   WHAT IS NOT IN CRATE.CPP: the effects. That file creates, places and removes crates and
   says nothing about what is inside one. The list below is ours, built from the crate
   ANIMATIONS in ADATA.CPP - DOLLAR, ARMOR, FPOWER, RAPID, SPEED, INVUN, MINE, GPSBOX and the
   rest are the powerups the original shipped, because each one needed art. What each is
   worth here is a balance decision this repository is making, not a quotation.

   `w` is the pick weight. The money crate is the common one because it is the one that is
   never a disappointment; the mine is the reason driving over an unknown crate is a decision
   rather than free loot. */
/* NOT Rule.CrateMaximum, which is 255 - an upper bound, not a target. RULES.CPP has
   CrateMinimum(1)/CrateMaximum(255) and the real count is derived from map size. Three is
   ours, and now says so. */
var RTS_CRATE_MAX = 3;
var RTS_CRATE_TIME = 10;           /* RULES.CPP CrateTime(10), in minutes. Was 3, invented. */
var RTS_CRATE_TRIES = 200;         /* give up re-rolling rather than spin forever */
var RTS_CRATES = [
  { key:'money',  w:22, name:'Credits',        anim:'DOLLAR' },
  { key:'heal',   w:12, name:'Repair kit',     anim:'—' },
  { key:'armour', w:11, name:'Armour plating', anim:'ARMOR',  mult:{ armor:1.25 } },
  { key:'fpower', w:11, name:'Firepower',      anim:'FPOWER', mult:{ fire:1.3 } },
  { key:'rapid',  w:9,  name:'Rapid reload',   anim:'RAPID',  mult:{ rof:0.75 } },
  { key:'speed',  w:9,  name:'Engine tune',    anim:'SPEED',  mult:{ speed:1.35 } },
  { key:'reveal', w:8,  name:'Map data',       anim:'GPSBOX' },
  { key:'unit',   w:9,  name:'Abandoned vehicle', anim:'—' },
  { key:'mine',   w:9,  name:'Booby trap',     anim:'MINE' }
];
/* RULES.CPP SoloCrateMoney(2000) - a single figure, not a range. The spread is kept because
   a crate that always pays exactly the same is a worse decision than one that might not be
   worth the detour, but it is now centred on the real number instead of on 800. */
var RTS_CRATE_MONEY = [1400, 2600];
var RTS_CRATE_MINE_DMG = 90;
var RTS_CRATE_MINE_RADIUS = RTS_TILE * 2.2;
/* What a free-vehicle crate can contain: things that are useful on their own, in the open,
   with no support. An engineer or a thief handed to you in the middle of nowhere is a unit
   with nothing to do. */
/* UDATA.CPP marks the MCV "Can this be a goodie surprise from a crate? true", and that is the
   one entry here that can change a match: a player who has lost their Command Yard and cannot
   build anything is not out of the game while a crate might still hand them one. */
var RTS_CRATE_UNITS = ['buggy', 'light', 'tank', 'harvester', 'mcv'];
/* A unit may keep stacking bonuses, but not without limit - a tank that has hoovered up six
   firepower crates stops being a tank. */
var RTS_CRATE_CAP = { fire:2.2, armor:2.2, speed:1.9, rof:0.45 };

/* ---------------------------------------------------------------- shroud --
   MAP.CPP Sight_From(). Two flags per cell, and the distinction is the whole feature:

     IsMapped  - this cell has been explored. Once lifted it stays lifted.
     IsVisible - this cell is inside something's sight range RIGHT NOW.

   So the map has three states, not two: black where you have never been, dimmed where you
   have been but are not looking, and clear where you are. Enemy units vanish when they leave
   your sight; enemy buildings you have already seen stay drawn, because they are part of what
   you remember about the map.

   Sight_From caps sight range at ten cells and tests true circular distance, so the revealed
   area is a disc rather than a square. */
var RTS_SIGHT_MAX = 10;
var RTS_SIGHT_BONUS = 2;     /* the rules' `sight` is in world units; this widens the disc */
var RTS_VIS_HZ = 15;         /* the visibility sweep runs on the original's 15 FPS clock */
/* How far explored-but-unseen ground is darkened. This was 0.45, and it was the single
   largest reason the game did not look like what it is imitating - far more than the palette.
   Most of what is on screen at any moment is ground you have explored but are not currently
   looking at, so nearly half the light was being taken out of the majority of every frame.

   Measured on the same view, with the lifted palette underneath:

     0.45  median 57   p95  76   62% of the frame below 64
     0.30  median 71   p95  95   33%
     0.22  median 79   p95 106   13%
     0.00  median 100  p95 134    3%

   0.22 keeps the distinction between "seen now" and "remembered" plainly readable while
   letting the ground read as daylight. The SHROUD is untouched - ground you have never
   explored is still black, and enemy units still vanish when they leave your sight. Only the
   brightness of terrain memory changed. */
var RTS_FOG_DIM = 0.22;

/* Sight range in TILES for a structure or unit definition. */
function rtsSightTiles(def) {
  return Math.max(3, Math.min(RTS_SIGHT_MAX, Math.round((def.sight || 12) / RTS_TILE) + RTS_SIGHT_BONUS));
}

