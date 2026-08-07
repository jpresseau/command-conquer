/* sprites/assemble.js - _rtsSprites: bakes the whole sheet once and hands it back.
   Part of rts.sprites, the sprite baker. */

function _rtsSprites() {
  if (_RTS_SPR) return _RTS_SPR;
  var S = { ore: _sprOre(RTS_PAL.ore, false), gem: _sprOre(RTS_PAL.gem, true),
    bld: {}, unit: {}, prone: {}, fx: _sprFx(), pad: {} };
  RTS_STRUCTS.forEach(function (d) { S.pad[d.key] = _sprPad(d.w, d.h); });
  S.bag = _sprSandbag();
  S.wave = _sprWaterCycle();
  S.scorch = _sprScorch();
  S.crater = _sprCrater();
  S.crate = _sprCrate();
  S.fire = _sprFire();
  S.corpse = _sprCorpse();
  ['player', 'enemy'].forEach(function (side) {
    S.bld[side] = {}; S.unit[side] = {};
    RTS_STRUCTS.forEach(function (d) { S.bld[side][d.key] = _sprBuilding(d.key, side); });
    S.hull = S.hull || {}; S.turret = S.turret || {};
    S.hull[side] = {}; S.turret[side] = {};
    RTS_UNITS.forEach(function (d) {
      if (RTS_TURRETED[d.key]) {
        /* A turreted unit is only ever DRAWN as hull + turret, so baking the combined body as
           well was pure waste - 32 canvases per unit per side that nothing referenced. `unit`
           aliases the hull instead of duplicating it. */
        S.hull[side][d.key] = _sprUnit(d.key, side, false, 'hull');
        S.turret[side][d.key] = _sprUnit(d.key, side, false, 'turret');
        S.unit[side][d.key] = S.hull[side][d.key];
      } else {
        S.unit[side][d.key] = _sprUnit(d.key, side);
      }
    });
    S.prone[side] = {};
    RTS_UNITS.forEach(function (d) {
      if (d.kind === 'infantry') S.prone[side][d.key] = _sprUnit(d.key, side, true);
    });
    /* The walk cycle only exists with real artwork - there is no procedural equivalent, and a
       missing entry simply means the renderer keeps drawing the standing frame. */
    S.walk = S.walk || {}; S.walk[side] = {};
    if (typeof _mixWalk === 'function') {
      RTS_UNITS.forEach(function (d) {
        if (d.kind !== 'infantry') return;
        var w = _mixWalk(d.key, side);
        if (w) S.walk[side][d.key] = w;
      });
    }
  });
  /* One flame set, referenced twice. `_sprFx` cannot call `_sprFire()` itself without
     baking a second identical set of canvases - same pixels, twice the memory, and two
     things that are supposed to be the same fire drifting apart the moment either is
     retuned. Assigned here, where both already exist. */
  S.fx.fire = S.fire;
  _RTS_SPR = S;
  return S;
}
