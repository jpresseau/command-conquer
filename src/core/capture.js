/* core/capture.js - MISSION_CAPTURE, wrecks and survivors, repair and sell. Part of rts.core. */

/* ------------------------------------------------------------ capture — MISSION_CAPTURE

   An engineer walks into an enemy building and the building changes hands. The unit is spent
   doing it, which is what keeps the whole thing from being free: 600 credits and a walk across
   the map buys you one structure, and the structure keeps whatever damage it already had.

   Everything derived from ownership has to move with it. Power is a per-side sum, so both
   sides recalculate. The footprint's `owner` map is keyed by entity id rather than side, so it
   needs no change - which is exactly why it was built that way. And the blueprint node moves
   too, or the previous owner would keep trying to rebuild a building that is standing right
   there in someone else's colours. */
function _rtsCapture(eng, b) {
  var G = window._rtsG;
  if (!b || b.dead || b.type !== 'struct' || b.side === eng.side) return false;
  /* `from` is read AFTER the guard, not with it. Hoisted into the var line it dereferenced `b`
     before `!b` had been tested, so the null case threw a TypeError instead of returning false
     and the `!b` clause was unreachable. */
  var from = b.side;
  if (!rtsCapturable(b.def)) return false;
  /* A building that is being SOLD cannot be taken. Mission_Deconstruction is already running:
     the previous owner has collected the refund, the animation is playing backwards, and the
     structure removes itself a few seconds later whoever owns it by then. Accepting the capture
     handed the player a building that died anyway and CONSUMED THE ENGINEER doing it - 600
     credits and a walk across the map for nothing. Measured: captured mid-sale, dead six
     seconds later, engineer spent. The AI sells routinely (Repair_AI below ConditionRed, and
     AI_Raise_Money), so this is reachable by playing normally rather than by contrivance. */
  if (b.selling) return false;
  _rtsBaseDropNode(b);                       /* off the old owner's plan... */
  b.side = eng.side;
  _rtsBaseAdd(b.side, b.def, b.tx, b.tz);    /* ...and onto the new one's */
  b.target = null; b.cool = 0; b.repair = 0;
  /* Taking a building does not repair it, and a captured shell is a liability. A floor stops
     the pathological case of capturing something with 3 hp that dies before it is any use. */
  b.hp = Math.max(b.hp, b.maxHp * 0.25);
  _rtsRecalcPower(from); _rtsRecalcPower(b.side);
  /* And the loser's QUEUE, which capture was the one way of leaving unaudited. _rtsProdRecalc
     runs from _rtsKill for a destroyed structure, so losing a Naval Yard to a shell refunds
     whatever it was building; losing the same yard to an engineer did not, and the hull was
     simply never delivered. Measured from the other direction, which is the sharp one now that
     the opponent captures too: an engineer walks into the player's Naval Yard with a Destroyer
     at 90%, the player is charged the full 1000 credits over the next second, _rtsDeliverUnit
     finds no yard to spawn at, and nothing appears - no ship, no refund, no message. */
  _rtsProdRecalc(from);
  /* Anything that was shooting at it, or was ordered onto it, is now aiming at a friend. */
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (!o.dead && o.target === b && o.side === b.side) { o.target = null; if (o.order === 'attack') o.order = null; }
  }
  if (G.sel.indexOf(b) >= 0 && b.side !== 'player') G.sel.splice(G.sel.indexOf(b), 1);
  _rtsKill(eng);                              /* spent */
  var nm = rtsStructDef(b.def).name;
  if (b.side === 'player') { _rtsSay(nm + ' captured.'); if (typeof _rtsSfx === 'function') _rtsSfx('place'); }
  else _rtsSay('They have taken your ' + nm + '!');
  return true;
}
/* Thief: "any Thief that enters an enemy Ore Refinery will steal half the credits in that
   structure". This game keeps credits on the side rather than in the building, so the fraction
   comes off the treasury - same effect, and it still takes walking into a defended base. */
function _rtsSteal(th, b) {
  var G = window._rtsG, from = G.sides[b.side];
  /* Available_Money, so the store counts: a house sitting on full silos is exactly the house
     worth robbing, and taking only the loose change would make the thief useless against it. */
  var take = Math.floor(rtsMoney(from) * rtsUnitDef(th.def).steal);
  _rtsSpend(from, take);
  _rtsGrant(G.sides[th.side], take);
  _rtsKill(th);
  if (th.side === 'player') _rtsSay('Stole ' + take + ' credits.');
  else _rtsSay('They stole ' + take + ' credits from you!');
  if (typeof _rtsSfx === 'function') _rtsSfx(th.side === 'player' ? 'place' : 'deny');
  return take;
}
/* C4. "Can destroy buildings instantly if she is able to get adjacent to them." Instantly means
   instantly - no damage roll, no armour table. She survives, unlike the engineer and the thief,
   which is why she costs 1200 and is limited to one at a time. */
function _rtsDemo(c, b) {
  var nm = rtsStructDef(b.def).name;
  _rtsKill(b);
  c.order = null; c.target = null; c.path = null;
  if (c.side === 'player') _rtsSay(nm + ' demolished.');
  else _rtsSay('Your ' + nm + ' has been demolished!');
  if (typeof _rtsSfx === 'function') _rtsSfx('boom', b.x, b.z);
  return true;
}
/* How close an engineer has to get: just outside the footprint, measured from the nearest
   edge rather than the centre, or a 3x3 building would need the engineer to stand inside it. */
function _rtsAtStruct(u, b, slack) {
  var d = rtsStructDef(b.def);
  var cx = Math.min(Math.max(u.x, _rtsWX(b.tx)), _rtsWX(b.tx + d.w - 1));
  var cz = Math.min(Math.max(u.z, _rtsWX(b.tz)), _rtsWX(b.tz + d.h - 1));
  return Math.hypot(u.x - cx, u.z - cz) <= (slack || RTS_TILE * 1.3);
}
/* Where a walk-in unit should actually path to. NOT the building's centre: a footprint is
   blocked ground, so asking the pathfinder for the middle of a barracks returns a route to
   somewhere near it and the unit orbits the building forever without ever arriving. Measured:
   a commando ordered onto a 2x2 barracks from three tiles out held station at 12-14 units for
   the whole test and never triggered.

   This returns a point one tile OUTSIDE the nearest footprint edge, on the side the unit is
   already on - open ground, close enough to satisfy _rtsAtStruct on arrival. */
function _rtsApproach(u, b) {
  var d = rtsStructDef(b.def);
  var cx = Math.min(Math.max(u.x, _rtsWX(b.tx)), _rtsWX(b.tx + d.w - 1));
  var cz = Math.min(Math.max(u.z, _rtsWX(b.tz)), _rtsWX(b.tz + d.h - 1));
  var dx = u.x - cx, dz = u.z - cz, L = Math.hypot(dx, dz);
  if (L < 0.001) return { x:cx, z:cz };
  /* 0.85 of a tile, not a whole one. _rtsWX returns cell CENTRES, so a full tile out from the
     last cell centre lands ~1.3 units beyond the arrival threshold - and steering stops a
     little short of any waypoint on top of that. Measured, a whole tile left the commando
     parked 5.3 units from the clamped edge against a 5.2 threshold: stuck by a tenth of a unit. */
  return { x:cx + dx / L * RTS_TILE * 0.85, z:cz + dz / L * RTS_TILE * 0.85 };
}
function _rtsKill(e) {
  var G = window._rtsG;
  if (e.dead) return;
  e.dead = true;
  /* Infantry cry out when they die - ten recorded takes, and until now not one of them ever
     played: the identification table knew what they were and nothing asked for them. */
  if (e.type === 'unit' && typeof rtsDeathCry === 'function') rtsDeathCry(e);
  /* the passengers walk away from it - or go down with it, if there is no shore to walk to */
  if (e.cargo && e.cargo.length) _rtsSpillCargo(e);
  if (e.type === 'struct') { _rtsFootprint(e, false); _rtsRecalcPower(e.side); }
  if (e.type === 'struct' && e.selling) {
    /* Sold, not destroyed: a puff of dust where it stood, and no fireworks. */
    G.fx.push({ kind:'pop', x:e.x, y:1, z:e.z, t:0, big:1.6 });
    _rtsBaseDropNode(e);          /* a sale is a decision not to have it - see _rtsBaseDropNode */
  }
  else if (e.type === 'struct') {
    /* Losing a building is announced; losing one of THEIRS is not. */
    if (e.side === 'player' && typeof rtsEva === 'function') rtsEva('lostbldg');
    var sd = rtsStructDef(e.def);
    /* "Since there are volatile fuels used in the Flame Tower, it damages nearby units and
       structures if destroyed." Friendly fire included - that is the whole drawback, and it is
       why you do not build a row of them through the middle of your own base. */
    if (sd.deathBlast) {
      for (var bi = 0; bi < G.ents.length; bi++) {
        var bt = G.ents[bi];
        if (bt === e || bt.dead) continue;
        var bd = Math.hypot(bt.x - e.x, bt.z - e.z);
        if (bd > sd.deathBlast.radius) continue;
        _rtsDamage(bt, sd.deathBlast.dmg * (1 - bd / sd.deathBlast.radius), null);
      }
      G.fx.push({ kind:'boom', x:e.x, y:1, z:e.z, t:0, big:3.4 });
    }
    G.fx.push({ kind:'boom', x:e.x, y:1, z:e.z, t:0, big:Math.max(2, sd.w * 0.7) });
    /* Secondary blasts walking across the footprint on a delay, then debris thrown clear.
       A structure going down should be an event; one puff was not. */
    var rn = _rtsRngMake((e.id * 7919) >>> 0);
    for (var b = 0; b < 3 + sd.w; b++) {
      G.fx.push({ kind:'boom', t:-0.10 - rn() * 0.5, big:0.8 + rn() * 0.9,
        x:e.x + (rn() - 0.5) * sd.w * RTS_TILE, y:1, z:e.z + (rn() - 0.5) * sd.h * RTS_TILE });
    }
    /* BUILDING.CPP Take_Damage: shakes = Class->Cost_Of() / 400, then Shake_The_Screen.
       So a cheap power plant going up does not move the camera at all and the war factory
       rattles the whole screen - the shake reports what you just lost. */
    G.shake = Math.min(1, G.shake + ((rtsStructDef(e.def).cost / 400) | 0) * 0.12);
    e.wreck = RTS_WRECK_TIME;      /* CountDown: burn on the map before being removed */
    /* Drop_Debris marks every cell the building stood on: mostly craters, some scorch. */
    _rtsWreckGround(e);
    _rtsDropDebris(e);
    for (var k = 0; k < 9 + sd.w * 3; k++) {
      var a = rn() * 6.283, sp = 4 + rn() * 15;
      G.fx.push({ kind:'debris', x:e.x, y:2 + rn() * 3, z:e.z, t:0,
        vx:Math.cos(a) * sp, vz:Math.sin(a) * sp, vy:7 + rn() * 11, big:0.6 + rn() * 0.8 });
    }
  } else {
    G.fx.push({ kind:'pop', x:e.x, y:1, z:e.z, t:0, big:1 });
    var ud = rtsUnitDef(e.def);
    if (ud.kind === 'infantry') {
      /* The original's own falling-over animation, as an EFFECT rather than by keeping the
         soldier alive: he is already off the board as far as the rules are concerned, and
         extending an entity's life to play a picture is how a corpse ends up blocking a path or
         soaking a shell. The corpse is stamped when the animation finishes instead of now. */
      var _dv = (e.id * 7) % 5;
      var _dseq = (typeof _mixDeath === 'function') ? _mixDeath(e.def, e.side, _dv) : null;
      if (_dseq) {
        G.fx.push({ kind:'die', x:e.x, y:0, z:e.z, t:0, seq:_dseq,
                    corpse:{ x:e.x, z:e.z, v:(e.id * 5) % 3 } });
      } else {
        _rtsAddCorpse(G, { x:e.x, z:e.z, v:(e.id * 5) % 3 });
      }
    } else {
      /* Take_Damage: half the time a crew member bails out of a wrecked vehicle, wounded and
         running. Not from one that was crushed - there is nobody left to climb out. */
      if (!e.crushed && _rtsRnd() < RTS_CREW_CHANCE) {
        var cell = _rtsNearestOpen(_rtsTX(e.x), _rtsTX(e.z), 4);
        if (cell) {
          var crew = _rtsSpawnUnit(e.side, 'rifle', _rtsWX(cell[0]), _rtsWX(cell[1]));
          if (crew) {
            crew.hp = Math.max(5, Math.round(crew.maxHp * (0.15 + _rtsRnd() * 0.35)));
            crew.fear = RTS_FEAR.PANIC;
            _rtsScatter(crew, e.x, e.z);
          }
        }
      }
      /* "Very strong units that have an explosion will also rock the screen." */
      if (ud.hp > 400) G.shake = Math.min(1, G.shake + 0.12);
      /* The wreck burns. An UNATTACHED ladder fire - no `att`, so it damages nothing and
         nothing owns it - that burns itself down through the existing chain: ~4s of flame
         guttering into ~7s of smoke. It is what makes ground where a battle just happened
         look like ground where a battle just happened. Land vehicles only: a sinking ship
         leaves water, and a helicopter dies where it FELL FROM, not where it lands. */
      if (!e.crushed && !ud.sea && ud.kind !== 'air') {
        var wkind = (e.r || 1) >= 1.2 ? 'firemed' : 'firesmall';
        var wbase = 0.55 + (e.r || 1) * 0.28;
        G.fx.push({ kind:wkind, x:e.x, y:1, z:e.z, t:0, base:wbase,
                    big:wbase * RTS_ANIMS[wkind].size, loops:RTS_ANIMS[wkind].loops || 1 });
      }
    }
  }
  if (typeof _rtsSfx === 'function')
    _rtsSfx(e.selling ? 'place' : (e.type === 'struct' ? 'boom' : 'pop'), e.x, e.z);
  if (e.side === 'player' && e.type === 'unit') G.stats.lostU++;
  /* HouseClass::UnitsLost / BuildingsLost, which TEVENT's N*_DESTROYED events read. A sold
     building is not a loss - only something that was actually destroyed counts. */
  if (G.lost && G.lost[e.side] && !e.selling) {
    if (e.type === 'unit') G.lost[e.side].units++; else G.lost[e.side].structs++;
  }
  _rtsTrigNotify('destroyed', e, null);
  /* WhoLastHurtMe: a thing that burns to death is still someone's kill. Scoring it off the
     victim's side alone credited the player for units the AI's own fires finished off.

     The `!e.hurtBy` half of that test was doing the same damage from the other end, and this
     is the line the end-of-match screen prints as "Enemy units destroyed". Nothing that died
     to an explosion recorded an attacker - _rtsSplash never read the side it was handed - so
     the fallback handed EVERY blast death to the player: a crate booby trap going off under
     an enemy soldier, the opponent's own artillery splashing its own infantry, an enemy
     aircraft crashing for want of a pad. All three measured as a player kill. Now that a
     blast records who set it off, the test can ask the question it meant to.

     And it counts UNITS, the way `lostU` two lines up already did. Without the filter a
     number labelled "units destroyed" was also counting every enemy building, so the two
     halves of the same readout were not measuring the same kind of thing. A sold building is
     not a kill either, which the loss counter above says in its own comment. */
  if (e.side === 'enemy' && e.type === 'unit' && !e.selling && e.hurtBy === 'player') G.stats.killed++;
  var si = G.sel.indexOf(e); if (si >= 0) G.sel.splice(si, 1);
  /* SIDEBAR.CPP Recalc is only called when a FACTORY is destroyed - it is an exhaustive
     sweep and the comment is explicit that it should not run for every casualty. */
  if (e.type === 'struct') {
    var gone = _rtsProdRecalc(e.side);
    if (gone.length && e.side === 'player') {
      var gd = rtsStructDef(gone[0]) || rtsUnitDef(gone[0]);
      _rtsSay('Construction halted — ' + (gd ? gd.name : gone[0]) + ' abandoned.');
    }
  }
}

/* ------------------------------------------------- wrecks and survivors --
   BUILDING.CPP Drop_Debris(): every cell the building covered is marked - a quarter of them
   scorched, the rest cratered - and some of the crew stumble out of the ruin. */
function _rtsWreckGround(e) {
  var G = window._rtsG, d = rtsStructDef(e.def);
  for (var tx = e.tx; tx < e.tx + d.w; tx++) for (var tz = e.tz; tz < e.tz + d.h; tz++) {
    if (!_rtsInB(tx, tz)) continue;
    var i = _rtsIdx(tx, tz);
    if (G.terrain[i] === RTS_T_WATER) continue;
    var r = ((tx * 73856093) ^ (tz * 19349663) ^ (e.id * 83492791)) >>> 0;
    if ((r % 4) === 0) {                       /* 25% scorch ... */
      if (!(G.scorch[i] & 7)) { G.scorch[i] = (G.scorch[i] & 8) | (1 + (r >>> 8) % 6); G.newScorch.push(i); }
    } else if (!(G.scorch[i] & 8)) {           /* ... else a crater */
      G.scorch[i] = (G.scorch[i] & 7) | 8; G.newScorch.push(i);
    }
  }
}
/* How_Many_Survivors(): (Raw_Cost * SurvivorFraction) / cost of a rifle squad, bounded 1..5.
   A big expensive building holds more people than a generator shed. */
function _rtsSurvivorCount(e) {
  var d = rtsStructDef(e.def), e1 = rtsUnitDef('rifle');
  var n = Math.floor((d.cost * RTS_SURVIVOR_FRACTION) / Math.max(1, e1.cost));
  return Math.max(1, Math.min(5, n));
}
/* Put `n` survivors out of the wreck. They come out terrified, which is what makes a
   building falling over read as people dying rather than a prop being removed. */
function _rtsEvacuate(e, n, scared) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var cell = _rtsExitCell(e, Math.cos(i * 1.9), Math.sin(i * 1.9));
    if (!cell) break;
    var u = _rtsSpawnUnit(e.side, 'rifle', _rtsWX(cell[0]), _rtsWX(cell[1]));
    if (!u) break;
    if (scared) { u.fear = RTS_FEAR.PANIC; _rtsScatter(u, e.x, e.z); }
    out.push(u);
  }
  return out;
}
function _rtsDropDebris(e) {
  /* IsSurvivorless: "destroyed by some method that would prevent survivors". A building that
     burned down has no crew left to run out of it. */
  if (e.burned) return;
  var n = 0, want = _rtsSurvivorCount(e);
  for (var i = 0; i < want; i++) if (_rtsRnd() < RTS_SURVIVOR_ODDS) n++;
  if (n) _rtsEvacuate(e, n, true);
}

/* --------------------------------------------------------- repair / sell --
   Repair_AI + Sell_Back + Mission_Deconstruction. Repair is a toggle on the building (the
   blinking wrench), not a one-shot: it eats credits a step at a time and gives up on its
   own when the money runs out. */
function _rtsToggleRepair(e) {
  if (!e || e.dead || e.type !== 'struct' || e.building || e.selling) return false;
  if (e.hp >= e.maxHp && !e.repair) return false;
  e.repair = e.repair ? 0 : 1; e.rtimer = 0;
  return true;
}
function _rtsRepairCost(e) {
  return rtsStructDef(e.def).cost * RTS_REPAIR_STEP * RTS_REPAIR_PCT;
}
function _rtsRepairAI(e, dt) {
  var G = window._rtsG, S = G.sides[e.side];
  if (e.hp >= e.maxHp) { e.hp = e.maxHp; e.repair = 0; return; }
  e.rtimer = (e.rtimer || 0) + dt;
  if (e.rtimer < RTS_REPAIR_RATE) return;
  e.rtimer = 0;
  var cost = _rtsRepairCost(e);
  if (rtsMoney(S) < cost) {
    /* Repair_AI gives up when it cannot pay, and the AI sells rather than sit on a wreck. */
    e.repair = 0;
    if (e.side === 'player') _rtsSay('Not enough credits to keep repairing.');
    else if (e.hp < e.maxHp * RTS_COND_RED) _rtsSell(e);
    return;
  }
  _rtsSpend(S, cost);
  e.hp = Math.min(e.maxHp, e.hp + e.maxHp * RTS_REPAIR_STEP);
}
/* Sell_Back: half the RAW price back straight away - see rtsRawCost, which subtracts the free
   unit the building shipped with - then the building deconstructs (the build-up animation
   played backwards) and its crew walks out. */
function _rtsSell(e) {
  var G = window._rtsG;
  if (!e || e.dead || e.type !== 'struct' || e.selling) return false;
  if (e.def === 'yard') return false;           /* selling the Command Yard is suicide, not a sale */
  e.selling = 1; e.repair = 0; e.building = 1; e.bprog = 1;
  /* Refund_Money against the PurchasePrice the object carries, not against the sticker
     price. `paid` is absent only on a save written before this existed. */
  var price = (e.paid == null) ? rtsStructDef(e.def).cost : e.paid;
  /* Raw_Cost is taken off what was actually PAID, not off the sticker, so a building bought at
     a discount cannot be sold back at a profit either. */
  var fd = rtsStructDef(e.def), fu = fd && fd.freeUnit ? rtsUnitDef(fd.freeUnit) : null;
  var raw = Math.max(0, price - (fu ? fu.cost : 0));
  var back = Math.round(raw * RTS_REFUND_PCT
    * (e.hp / e.maxHp * 0.5 + 0.5));           /* a wreck is worth less than a clean building */
  _rtsGrant(G.sides[e.side], back);
  if (e.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('build');
  /* THE AMOUNT GRANTED, returned, so the message can say what actually happened. The sidebar
     printed cost x RefundPercent - the sticker price, ignoring both the free unit the building
     shipped with and the damage multiplier - and was out by up to 3.3x: a full-health Refinery
     announced 1000 credits back and paid 300, and a wrecked Power Plant quoted the same 150 as
     a pristine one. Nothing was stolen; what was lost was the ability to trust the number you
     are deciding on. Callers that only want success still get a truthy value. */
  return back;
}
