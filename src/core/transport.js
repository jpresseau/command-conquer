/* core/transport.js - carrying units: loading, unloading and the transports themselves.
   Part of rts.core, the simulation. */

/* ------------------------------------------------------------------ transport --
   UNIT.CPP's passenger rules. A boarded passenger stays in G.ents - it is NOT spliced out -
   and carries `inside`, a reference to its transport. Keeping it in the entity list is what
   makes saving work for nothing: the save encoder walks G.ents and turns entity references
   into ids, so a passenger that had been lifted out of the list would round-trip as an inline
   copy and come back as something that merely looked like a unit. The cost is that every place
   which treats a unit as being ON THE MAP has to say so - and this comment used to claim there
   were only four of them (the tick, the draw list, target acquisition and selection), which was
   the more expensive half of the mistake, because it read as a closed list nobody need re-check.

   There are SIX. The two that were missing both work by walking G.ents and comparing positions,
   which is exactly how a passenger gets caught: it sits at its transport's coordinates.

     _rtsOverrun  - a tank driving past an APC crushed the squad sealed inside it.
     _rtsSplash   - a shell landing on a transport hit the hull and then every passenger, at
                    zero range, through no armour of their own.

   Both were found by a landing craft that kept losing its cargo in open water with nothing near
   it, and both are much older than the craft: they have been true of the APC all along. */
function _rtsAboard(e) { return !!(e && e.inside); }
function _rtsCargoCount(t) { return t && t.cargo ? t.cargo.length : 0; }
/* "Is this thing a transport?" as one predicate rather than as `carries` read at four call
   sites. Max_Passengers > 0 is the whole test in UNIT.CPP too. */
function _rtsIsTransport(e) {
  return !!(e && e.type === 'unit' && ((rtsUnitDef(e.def) || {}).carries || 0) > 0);
}
/* What a hold will accept. `takes` is declared on the type - an APC is a taxi for men, a
   landing craft is a ferry for an army - and infantry is the default so a type that says
   nothing keeps the rule it had. */
function _rtsTakes(t) { return (rtsUnitDef(t.def) || {}).takes || ['infantry']; }
function _rtsCanBoard(inf, t) {
  if (!inf || !t || inf.dead || t.dead || inf === t) return false;
  if (inf.side !== t.side || inf.inside) return false;
  var pd = rtsUnitDef(inf.def) || {};
  /* Nothing that swims or flies gets into a boat. */
  if (pd.sea || pd.air) return false;
  /* AND NO TRANSPORT INSIDE A TRANSPORT, which RA does allow and we deliberately do not. The
     tick skips anything with `inside` (see core/tick.js), so an APC riding in a landing craft
     would never run its own update - and it is that update which drags its passengers along.
     The squads inside it would stay standing on the beach while the craft sailed away, still
     flagged as cargo of a hull a hundred tiles offshore. Allowing it means making the
     ride-along recurse and making a sinking cascade; refusing it is one line and no lie. */
  if (_rtsIsTransport(inf)) return false;
  if (_rtsTakes(t).indexOf(pd.kind) < 0) return false;
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
/* How far from the hull a passenger may be set down, in tiles. THREE, and the number is the
   rule rather than a tolerance: at five, a landing craft sitting in the middle of a five-tile
   channel found the bank three cells away and put a Battle Tank on it - the tank crossed twelve
   world units of open water on foot. The craft has to nose in. Small enough that "bring it
   closer to shore" is a real instruction, large enough that a beach with a cliff a cell behind
   it still works. */
var RTS_UNLOAD_REACH = 3;
/* Where one passenger can be set down.

   THE SPOT IS CHOSEN IN THE PASSENGER'S OWN DOMAIN, not the transport's, and that is the whole
   difference between an APC and a landing craft. An APC unloads onto the ground it is itself
   standing on, so the old ring - eight positions at 1.1 tiles, taken on trust - was always
   right. A landing craft is sitting IN THE WATER: every cell of that ring is sea, and a ring
   taken on trust would put five tanks in the sea, unable to move, permanently.

   So the ring position is the PREFERENCE and the passenger's own passability is the rule.
   Null means this one has nowhere to stand, and the caller keeps it aboard rather than
   deleting it into the water. */
/* How far from the hull a passenger may be set down, in tiles. THREE, and the number is the
   rule rather than a tolerance: at five, a landing craft sitting in the middle of a five-tile
   channel found the bank three cells away and put a Battle Tank on it - the tank crossed twelve
   world units of open water on foot. The craft has to nose in. Small enough that "bring it
   closer to shore" is a real instruction, large enough that a beach with a cliff a cell behind
   it still works. */
var RTS_UNLOAD_REACH = 3;
function _rtsUnloadSpot(t, p, n) {
  var a = (n / 8) * Math.PI * 2 + t.rot, r = RTS_TILE * 1.1;
  var wx = t.x + Math.cos(a) * r, wz = t.z + Math.sin(a) * r;
  var dom = _rtsDomainOf(p), tx = _rtsTX(wx), tz = _rtsTX(wz);
  if (_rtsInB(tx, tz) && !_rtsBlocked(tx, tz, dom)) return { x:wx, z:wz };
  var open = _rtsNearestOpen(tx, tz, RTS_UNLOAD_REACH, dom);
  return open ? { x:_rtsWX(open[0]), z:_rtsWX(open[1]) } : null;
}
/* Detach_Object + Unlimbo + Scatter: passengers step out around the transport, one per free
   spot, and are given the guard/hunt behaviour of a unit that has just arrived. Returns how
   many actually got out, which is what lets the caller say "there is nowhere to unload here"
   instead of appearing to do nothing. */
function _rtsUnload(t, force) {
  /* `force` is not a nicety. _rtsKill sets dead BEFORE it spills the cargo, so a plain
     "is it alive" guard here rejected the one call this rule exists for and every passenger
     stayed sealed in the wreck. The suite caught it; reading the code did not. */
  if (!t || (t.dead && !force) || !t.cargo || !t.cargo.length) return 0;
  var n = 0, held = [];
  while (t.cargo.length) {
    var inf = t.cargo.pop();
    if (inf.dead) { inf.inside = null; continue; }
    var at = _rtsUnloadSpot(t, inf, n);
    if (!at) { held.push(inf); continue; }
    inf.inside = null;
    inf.x = at.x; inf.z = at.z;
    inf.order = null; inf.path = null; inf.target = null;
    /* Scatter needs to know what to scatter AWAY from. Called with one argument it computed
       atan2(z - undefined, ...) = NaN, failed its own bounds check and returned having done
       nothing - so "and scatter" has never happened. The hull is the thing to step away
       from. */
    _rtsScatter(inf, t.x, t.z);
    n++;
  }
  t.cargo = held;
  return n;
}
/* UnitClass::Death, the transport half of the branch.

   An APC's infantry survive the wreck and walk away, and that one rule is what makes an APC a
   good buy instead of a coffin. A LANDING CRAFT SUNK IN OPEN WATER IS THE OTHER HALF of the
   same rule, and RA is explicit about it: the cargo goes down with the ship. There is no beach
   to swim to.

   Both fall out of one sentence - everyone who can be put ashore is put ashore, everyone who
   cannot drowns - so there is no `if it is a boat` anywhere. A craft wrecked while nosed against
   the beach lands its cargo; the same craft caught mid-channel takes all five with it, which is
   what keeps a crossing a decision rather than a formality. */
function _rtsSpillCargo(t) {
  if (!t || !t.cargo || !t.cargo.length) return 0;
  var out = _rtsUnload(t, true);
  while (t.cargo.length) {
    var lost = t.cargo.pop();
    lost.inside = null;
    if (!lost.dead) _rtsKill(lost);
  }
  return out;
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
/* Does this side own something that satisfies `need`? A prerequisite names a CAPABILITY, not a
   particular building - the Refinery needs power, and it does not care which plant supplies it.

   Without that distinction an Advanced Power Plant does not count as power, and the consequence
   is a base that locks itself out of its own tech tree. Measured on the opponent, seed 9001, ten
   minutes with the player kept alive: it ended with two Advanced Power Plants and ZERO Power
   Plants - it had built the advanced ones and then sold the basic ones as redundant, which is
   exactly what its own `lowerPower` strategy is for - and from then on _rtsCanProduce('refinery')
   was false. It wanted a fourth refinery for 368 of those seconds, had 405 legal places to put
   one and the money to pay for it, and was refused 30 times in the last five minutes.

   THE PLAYER HAS THE SAME TRAP. Build an Advanced Power Plant, sell your Power Plants because
   they are now redundant, and the Refinery and Barracks disappear from the sidebar with nothing
   to say why. */
function _rtsProvides(side, need) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type !== 'struct' || e.side !== side || e.dead || e.building) continue;
    if (e.def === need) return e;
    var d = rtsStructDef(e.def);
    if (d && d.provides && d.provides.indexOf(need) >= 0) return e;
  }
  return null;
}
function _rtsAvailable(side, def) {
  if (!def.needs) return true;
  for (var i = 0; i < def.needs.length; i++) if (!_rtsProvides(side, def.needs[i])) return false;
  return true;
}

