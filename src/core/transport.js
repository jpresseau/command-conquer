/* core/transport.js - carrying units: loading, unloading and the transports themselves.
   Part of rts.core, the simulation. */

/* ------------------------------------------------------------------ transport --
   UNIT.CPP's passenger rules. A boarded passenger stays in G.ents - it is NOT spliced out -
   and carries `inside`, a reference to its transport. Keeping it in the entity list is what
   makes saving work for nothing: the save encoder walks G.ents and turns entity references
   into ids, so a passenger that had been lifted out of the list would round-trip as an inline
   copy and come back as something that merely looked like a unit. The cost is that every place
   which treats a unit as being ON THE MAP has to say so, and there are only four: the tick, the
   draw list, target acquisition and selection. */
function _rtsAboard(e) { return !!(e && e.inside); }
function _rtsCargoCount(t) { return t && t.cargo ? t.cargo.length : 0; }
function _rtsCanBoard(inf, t) {
  if (!inf || !t || inf.dead || t.dead || inf === t) return false;
  if (inf.side !== t.side || inf.inside) return false;
  if ((rtsUnitDef(inf.def) || {}).kind !== 'infantry') return false;
  var cap = (rtsUnitDef(t.def) || {}).carries || 0;
  return cap > 0 && _rtsCargoCount(t) < cap;
}
function _rtsBoard(inf, t) {
  if (!_rtsCanBoard(inf, t)) return false;
  var G = window._rtsG;
  if (!t.cargo) t.cargo = [];
  t.cargo.push(inf);
  inf.inside = t; inf.order = null; inf.target = null; inf.path = null; inf.prone = 0;
  var si = G.sel.indexOf(inf); if (si >= 0) G.sel.splice(si, 1);
  return true;
}
/* Detach_Object + Unlimbo + Scatter: passengers step out around the transport, one per free
   spot, and are given the guard/hunt behaviour of a unit that has just arrived. */
function _rtsUnload(t, force) {
  /* `force` is not a nicety. _rtsKill sets dead BEFORE it spills the cargo, so a plain
     "is it alive" guard here rejected the one call this rule exists for and every passenger
     stayed sealed in the wreck. The suite caught it; reading the code did not. */
  if (!t || (t.dead && !force) || !t.cargo || !t.cargo.length) return 0;
  var G = window._rtsG, n = 0;
  while (t.cargo.length) {
    var inf = t.cargo.pop();
    inf.inside = null;
    if (inf.dead) continue;
    var a = (n / 8) * Math.PI * 2 + t.rot, r = RTS_TILE * 1.1;
    inf.x = t.x + Math.cos(a) * r; inf.z = t.z + Math.sin(a) * r;
    inf.order = null; inf.path = null; inf.target = null;
    _rtsScatter(inf);
    n++;
  }
  return n;
}
/* UnitClass::Death, the transport half of the branch: infantry passengers survive and scatter,
   anything else is recorded as a kill and deleted. Ours can only carry infantry, so in practice
   everyone walks - which is the point of the unit. */
function _rtsSpillCargo(t) {
  if (!t || !t.cargo || !t.cargo.length) return 0;
  return _rtsUnload(t, true);
}

/* UNIT.CPP Try_To_Deploy. An MCV becomes a Command Yard, and three details from the original
   are worth having exactly:

   - the yard lands on the cell ADJACENT to the vehicle, not under it (`Adjacent_Cell(Coord,
     FACING_NW)`), so the footprint grows away from where the vehicle was standing;
   - placement is checked with Legal_Placement, which does NOT apply the build-radius rule -
     see the `anywhere` argument to _rtsCanPlace;
   - `building->Strength = Health_Ratio() * building->Class->MaxStrength`, so a wreck of an MCV
     deploys a wreck of a yard rather than a fresh one. That is the detail that stops a damaged
     MCV being a full repair.

   Returns false and leaves the vehicle alone when there is no room, which is what the original
   does before it says "cannot deploy here". */
function _rtsDeploy(e) {
  var G = window._rtsG;
  if (!e || e.dead || e.type !== 'unit') return false;
  var d = rtsUnitDef(e.def);
  if (!d || !d.deploy) return false;
  var sd = rtsStructDef(d.deploy);
  if (!sd) return false;
  var tx = _rtsTX(e.x) - (sd.w - 1), tz = _rtsTX(e.z) - (sd.h - 1);
  if (!_rtsCanPlace(e.side, d.deploy, tx, tz, true)) {
    if (e.side === 'player') _rtsSay('Cannot deploy here.');
    return false;
  }
  var ratio = Math.max(0.01, Math.min(1, e.hp / e.maxHp));
  _rtsKillQuiet(e);
  var b = _rtsPlaceStruct(e.side, d.deploy, tx, tz, true, d.cost);
  b.hp = Math.max(1, Math.round(sd.hp * ratio));
  _rtsRecalcPower(e.side);
  if (e.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('place', b.x, b.z);
  return true;
}
/* Removing the vehicle without the wreck, the explosion or the kill credit - it was not
   destroyed, it turned into something. */
function _rtsKillQuiet(e) {
  var G = window._rtsG;
  e.dead = true;
  if (G.sel) { var i = G.sel.indexOf(e); if (i >= 0) G.sel.splice(i, 1); }
}

/* ANIM.CPP's AI + Middle + ChainTo, for the effect list.

   The ordering here is the point: Middle fires when the animation reaches its BIGGEST stage,
   so the scorch or crater is laid down while the fireball is at full size and covering it.
   Placing it at the start makes the mark visibly pop into existence next to the explosion. */
function _rtsAnimAI(dt) {
  var G = window._rtsG, i;
  for (i = G.fx.length - 1; i >= 0; i--) {
    var f = G.fx[i];
    var def = RTS_ANIMS[f.kind];
    if (!def || f.t < 0) continue;
    /* A finished death animation leaves the body. Stamped HERE rather than at the moment of
       death so the corpse appears under the soldier as he lands, not before he has fallen. */
    if (f.kind === 'die' && f.corpse && f.t >= def.dur) {
      _rtsAddCorpse(G, f.corpse);
      f.corpse = null;
    }

    /* An attached animation rides its object and burns it down. */
    if (f.att) {
      var host = G.byId[f.att];
      if (!host || host.dead) { if (host && !f.stick) host.burning = 0; f.att = 0; }
      else {
        f.x = host.x; f.z = host.z;
        if (def.damage) {
          f.acc = (f.acc || 0) + def.damage * dt;
          if (f.acc >= 1) {
            var dmg = Math.floor(f.acc); f.acc -= dmg;
            host.hp -= dmg;
            if (host.hp <= 0) { host.burned = 1; _rtsKill(host); f.att = 0; }
          }
        }
      }
    }

    if (!f.mid && f.t >= def.dur * def.biggest) {
      f.mid = 1;
      _rtsAnimMiddle(f, def);
    }
    if (f.t >= def.dur) {
      if (f.loops === undefined) f.loops = def.loops || 1;
      if (f.loops > 1) { f.loops--; f.t = 0; f.mid = 0; continue; }
      var nx = def.chain ? RTS_ANIMS[def.chain] : null;
      /* A chain naming an animation that does not exist used to throw here, mid-tick, and
         take the whole match with it - which is exactly what happened when the burn ladder
         replaced the old single `fire` and left `boom` pointing at a dead key. A typo in a
         data table should drop the effect, not stop the game. */
      if (def.chain && !nx) { G.fx.splice(i, 1); continue; }
      if (nx) {
        /* ChainTo: it does not end, it metamorphoses. */
        f.kind = def.chain; f.t = 0; f.mid = 0;
        f.loops = nx.loops || 1;
        /* Each rung of the burn ladder has its OWN drawn size in ADATA (23/14/11 px), so the
           step down is that ratio against the host's base scale - not a blind taper applied
           to whatever the previous stage happened to be. `f.base` is the host's scale; a
           chain on something with no base (a fireball guttering out) keeps the old rule. */
        if (nx.size && f.base) f.big = f.base * nx.size;
        else f.big = (f.big || 1) * 0.6;
        continue;
      }
      /* The flame is out. Clear the flag or the object can never catch fire again - it
         would sit permanently "burning" with nothing burning it. A sticky IMPACT anim is
         attached to the same object but is not its fire, so it must not put the fire out. */
      if (f.att && !f.stick) { var hz = G.byId[f.att]; if (hz) hz.burning = 0; }
      G.fx.splice(i, 1);
    }
  }
}
/* COMBAT.CPP Combat_Anim. */
function _rtsCombatAnim(dmg, x, z, big, stick) {
  var G = window._rtsG;
  if (!(dmg > 0)) return null;
  var tx = _rtsTX(x), tz = _rtsTX(z);
  var water = _rtsInB(tx, tz) && G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER;
  var kind = water ? 'splash' : (dmg < RTS_ANIM_PIFF ? 'piff' : (dmg < RTS_ANIM_BOOM ? 'hit' : 'boom'));
  /* scale with damage the way the original steps through its list, rather than one fixed size */
  var scale = (big || 1) * (0.7 + Math.min(1, dmg / 90) * 0.7);
  var fx = { kind:kind, x:x, y:1, z:z, t:0, big:scale };
  /* ADATA.CPP IsSticky - "sticks to unit in square". VehHit1/2/3 and Frag1 carry it; FBall1
     and ArtExp1 do not. The distinction is physical: a spark struck OFF something rides that
     thing, while a shell's fireball belongs to the ground where it went off. Without this a
     tank crossing the map at seven units a second leaves its own impact sparks hanging in
     mid-air behind it, which is what was happening to every moving target in the game.

     Only for the smaller kinds. A `boom` is a fireball, and RA does not stick those. */
  if (stick && !stick.dead && stick.type === 'unit' && kind !== 'boom' && kind !== 'splash') {
    fx.att = stick.id; fx.stick = 1;
  }
  G.fx.push(fx);
  /* And it makes a noise. There was a sound mapped for this, a synthesized branch for it, and
     a retrigger gap tuned for it - three places set up for an effect that nothing ever asked
     to play, so every weapon impact in the game landed in silence. The kind chosen above is
     the same one the sound wants, and the retrigger gaps in rts.audio.js are what keeps a
     firefight from becoming a wall of it. */
  if (typeof _rtsSfx === 'function' && (kind === 'hit' || kind === 'splash')) _rtsSfx(kind, x, z);
  return kind;
}
function _rtsAnimMiddle(f, def) {
  var G = window._rtsG;
  var tx = _rtsTX(f.x), tz = _rtsTX(f.z);
  if (!_rtsInB(tx, tz)) return;
  var i = _rtsIdx(tx, tz);
  if (G.terrain[i] === RTS_T_WATER) return;
  if (def.crater) {
    /* Reduce_Tiberium(6): a crater eats the ore it lands in. */
    if (G.scrap[i] > 0) {
      G.scrap[i] = Math.max(0, G.scrap[i] - RTS_CRATER_ORE * 10);
      if (G.scrap[i] <= 0) { G.gems[i] = 0; G.scrapDirty = true; }
    }
    if (!(G.scorch[i] & 8)) { G.scorch[i] = (G.scorch[i] & 7) | 8; G.newScorch.push(i); }
    return;
  }
  if (def.scorch && !(G.scorch[i] & 7)) {
    G.scorch[i] |= 1 + (((tx * 7 + tz * 13 + G.fx.length) % 6) | 0);
    G.newScorch.push(i);
  }
}

/* BUILDING.CPP Power_Output(): Class->Power * fixed(LastStrength, Class->MaxStrength).
   A power plant that has been shot up supplies proportionally less - so a raid on the
   generators browns out the base without having to level them. Drain is NOT scaled: a
   half-wrecked refinery still eats its full draw. Because output now moves with hit points
   this has to be recomputed every tick, not just when something is built or dies. */
function _rtsRecalcPower(side) {
  var G = window._rtsG, made = 0, used = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type !== 'struct' || e.side !== side || e.dead || e.building) continue;
    var d = rtsStructDef(e.def);
    if (d.power > 0) made += d.power * Math.max(0, Math.min(1, e.hp / e.maxHp));
    else used += -d.power;
  }
  G.sides[side].powerMade = Math.round(made); G.sides[side].powerUsed = used;
}
function _rtsPowerFactor(side) {
  var s = window._rtsG.sides[side];
  var p = s.powerUsed <= 0 ? 1 : s.powerMade / s.powerUsed;
  if (p > 1) p = 1;
  if (p < 1 && p > RTS_POWER_BAND) p = RTS_POWER_BAND;   /* the dead zone - see RTS_POWER_BAND */
  if (p < RTS_POWER_MIN) p = RTS_POWER_MIN;
  return p;
}
function _rtsHas(side, key) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type === 'struct' && e.side === side && e.def === key && !e.dead && !e.building) return e;
  }
  return null;
}
function _rtsAvailable(side, def) {
  if (!def.needs) return true;
  for (var i = 0; i < def.needs.length; i++) if (!_rtsHas(side, def.needs[i])) return false;
  return true;
}

