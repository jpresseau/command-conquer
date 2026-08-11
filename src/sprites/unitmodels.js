/* sprites/unitmodels.js - the 3D model for every unit, yawed to each facing. Part of rts.sprites. */

/* ------------------------------------------------------------------- units --
   One model per type, yawed to each of eight facings and rendered separately. Because the
   model is rotated in 3D rather than the canvas being rotated in 2D, a tank at 45 degrees
   shows its side and its tracks correctly instead of being a smeared copy of the front. */
/* The size ladder, in art pixels of the baked canvas. A cell is RTS_TS = 24 px, so these read
   directly as "how many cells does this unit cover" - and that is the number that was wrong.
   A Battle Tank measured 69 px, just under THREE cells, which put it level with a 2x2 building
   and turned four of them into one unreadable slab. In the reference a light tank is about a
   cell and a half, a Mammoth a little over two, and infantry stay under one.

   The models below are authored at whatever scale is comfortable to write and brought onto
   this ladder by _sprUnitScale, so resizing a unit is one number here rather than three
   hundred hand-tuned coordinates, and it cannot silently change the unit's proportions. */
var RTS_UNIT_SPAN = {
  rifle:22, rocket:23, grenadier:22, flame:23, engineer:22, medic:22, thief:22, tanya:20,
  dog:17, buggy:30, light:33, tank:39, arty:41, heavy:47, harvester:43, mcv:46, apc:34, heli:40
};

/* Eight of the fifteen units are infantry, and at one cell tall their SILHOUETTES cannot be
   told apart - a rifleman and a medic are the same stack of boxes and no amount of modelling
   changes that. Rendering all eight as bare shapes proved it: one blob, eight times.

   In the reference they are told apart by COLOUR. So colour is the primary signal here and the
   prop is only the confirmation. The camera looks down (R3_K = 1.3), which makes the TOP of the
   helmet the largest single patch of any soldier - so `helm[1]`, the helmet's top face, is the
   identity marker, exactly the way the roof became the team colour on structures. body:null
   means "wear the team colour", which is what an ordinary rifleman does. */
var RTS_INF_KIT = {
  rifle:     { body:null,                  top:null,      prop:'#3f4650' },
  rocket:    { body:['#6b5a3a','#85714c'], top:'#6d727a', prop:'#8d8571' },
  grenadier: { body:['#8a5a20','#a87030'], top:'#d9a13c', prop:'#d9a13c' },
  flame:     { body:['#6b4a1c','#87602a'], top:'#e8531c', prop:'#e8a11c' },
  engineer:  { body:['#c99a1e','#e8bc3c'], top:'#f5d565', prop:'#2a2a26' },
  medic:     { body:['#cfcfc4','#eaeae0'], top:'#ffffff', prop:'#c8302a' },
  thief:     { body:['#22252b','#31363e'], top:'#17191d', prop:'#4b5360' },
  tanya:     { body:['#c4bca4','#e0d8bc'], top:'#a8452a', prop:'#2b3038' }
};

/* part: undefined = the whole unit, 'hull' = body only, 'turret' = turret only. Hull and
   turret bake into the same size canvas about the same origin, so drawing one over the other
   at the same screen position lines them up with no per-facing offset table. */
function _sprUnitModel(key, side, prone, part) {
  var d = rtsUnitDef(key), TM = RTS_PAL.team[side], VH = RTS_PAL.veh[side];
  var S = RTS_PAL.steel, DK = RTS_PAL.dark, O = RTS_PAL.ore, C = RTS_PAL.conc;
  var GN = RTS_PAL.gun;
  var m = [], i;

  /* Road wheels and a track run - the detail that separates a tracked vehicle from a box with
     dark stripes down its sides. The wheels sit proud of the hull, the skirt caps them, so at a
     diagonal facing you read wheel, skirt and hull as three separate values instead of one.

     _r3Cyl is a VERTICAL cylinder - its h runs along y - so anything lying along the ground has
     to be built from boxes. The road wheels are therefore a row of small blocks stepped proud of
     the track run rather than actual discs, which at this size reads the same and costs less. */
  function tracks(len, zoff, wheels, rad) {
    for (var s = -1; s <= 1; s += 2) {
      var z = s * zoff;
      _r3Slab(m, 0, 0, z, len, rad * 2.1, rad * 2.0, 0.9, DK[0], DK[1]);      /* track run */
      for (var k = 0; k < wheels; k++) {
        var wx = (k - (wheels - 1) / 2) * (len - rad * 2.4) / (wheels - 1);
        _r3Box(m, wx, rad * 0.45, z + s * rad * 0.5, rad * 1.5, rad * 1.2, rad * 1.1,
               (k % 2) ? DK[2] : DK[1], DK[2]);
      }
      _r3Box(m, 0, rad * 2.0, z, len - 1, 1.2, rad * 2.4, VH[2], VH[1]);      /* fender skirt */
    }
  }

  /* The chain is three files now - see sprites/unit-*.js. Each arm returns false for a key it
     does not own. Everything the branches need is handed over in X rather than rebuilt, so a
     model line reads the same as it did when this was one function. */
  var X = { m:m, TM:TM, VH:VH, S:S, DK:DK, O:O, C:C, GN:GN,
            d:d, prone:prone, part:part, side:side, tracks:tracks };
  if (!(_sprUnitGround(X, key) || _sprUnitAirSea(X, key))) {
    _r3Box(m, 0, 0, -5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 0, 5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 2.5, 0, 15, 4, 8, TM[0], TM[1]);
    _r3Box(m, 4, 6, 0, 8, 1.4, 1.4, DK[1], DK[3]);
  }

  var sc = _sprUnitScale(key);
  return sc === 1 ? m : _r3Scale(m, sc);
}
