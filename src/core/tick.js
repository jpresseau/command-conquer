/* core/tick.js - _rtsTick: one step of the whole simulation, in order. Part of rts.core. */

function _rtsTick(dt) {
  var G = window._rtsG;
  if (!G || G.over) return;
  if (dt > 0.1) dt = 0.1;                        /* never let a stall fast-forward the battle */
  G.t += dt;
  /* File everything into buckets before anything scans. See core/spatial.js: the target scan
     used to walk the whole entity list per unit per tick, which cost 27ms a frame at 320
     units. Rebuilt here rather than kept up to date incrementally, because one pass over the
     list is what a SINGLE one of those scans used to cost. */
  _rtsSpBuild();
  _rtsSpotTick();
  _rtsJamTick(dt);                               /* which Jammers' fields are up: core/jammer.js */                                /* what the Spotters see: core/spotter.js */
  _rtsSkyPlayTick();                             /* the weather takes part: core/skyplay.js */
  if (G.msgT > 0) G.msgT -= dt;

  _rtsTickOre(dt);
  _rtsVisTick(dt);
  _rtsSupersTick(dt);
  _rtsStrikesTick(dt);
  _rtsIronTick(dt);
  _rtsWxTick(dt);                                /* fog banks and thunderheads: core/wxsupers.js */
  _rtsPowerDamage(dt);
  /* Power_Output tracks hit points, so it has to be re-totalled before anything reads it. */
  _rtsRecalcPower('player'); _rtsRecalcPower('enemy');
  _rtsTickProduction('player', dt);
  _rtsTickProduction('enemy', dt);
  _rtsUpdateAI(dt);
  _rtsTriggersTick(dt);

  var i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead) continue;
    if (e.inside) continue;                      /* riding in a transport - see _rtsAboard */
    if (e.type === 'unit') _rtsUpdateUnit(e, dt); else _rtsUpdateStruct(e, dt);
  }
  _rtsSeparate(dt);
  _rtsAirSpread(dt);                             /* aircraft keep their own distance: core/airspace.js */
  _rtsUpdateProj(dt);

  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
  _rtsAnimAI(dt);
  _rtsCrateAI(dt);
  _rtsDroneTick();                               /* Recon Drones circle where they stop: core/drone.js */
  _rtsSeaMineTick(dt);                           /* Mine Boats restock, sonar finds sea mines: core/seamines.js */
  _rtsEscortTick(dt);                            /* Flak Cruisers keep station on the fleet: core/flakship.js */
  _rtsBombsTick(dt);                             /* the Heavy Bomber's bombs fall and burst: core/bomber.js */
  _rtsFixTick(dt);                               /* Repair Trucks go to the damaged: core/repairtruck.js */
  _rtsSweepTick(dt);                             /* the Mine Sweeper finds and clears: core/sweeper.js */
  _rtsMineTick(dt);                              /* the Mine Layer's: core/mines.js */
  _rtsTideTick(dt);                              /* the sea goes out and comes back: core/tide.js */
  for (i = G.fx.length - 1; i >= 0; i--) {
    var fxi = G.fx[i];
    fxi.t += dt;
    if (fxi.kind === 'debris') {
      fxi.x += fxi.vx * dt; fxi.z += fxi.vz * dt;
      fxi.vy -= 34 * dt; fxi.y += fxi.vy * dt;
      if (fxi.y < 0) { fxi.y = 0; fxi.vy = -fxi.vy * 0.35; fxi.vx *= 0.5; fxi.vz *= 0.5; }
      if (fxi.t > 1.6) G.fx.splice(i, 1);
      continue;
    }
    if (!RTS_ANIMS[fxi.kind] && fxi.t > 0.75) G.fx.splice(i, 1);
  }
  /* CountDown. A destroyed structure keeps burning on the map for a moment before it is
     actually removed; everything else is reaped as soon as its death effects are in flight.
     Nothing set `reaped` before this, so dead entities accumulated in the list forever. */
  for (i = G.ents.length - 1; i >= 0; i--) {
    e = G.ents[i];
    if (!e.dead) continue;
    if (e.wreck > 0) { e.wreck -= dt; continue; }
    G.ents.splice(i, 1);
    delete G.byId[e.id];
  }

  /* a mission keeps its own goals and calls its own result (core/campaign.js) */
  if (G.mission) { _rtsMissionTick(G, dt); return; }
  /* win / lose: losing every structure ends it, the way it did in the originals */
  var pAlive = 0, eAlive = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.type !== 'struct') continue;
    if (e.side === 'player') pAlive++; else eAlive++;
  }
  if (!pAlive) { G.over = 'lose'; G.sides.player.lost = true; }
  else if (!eAlive) { G.over = 'win'; G.sides.enemy.lost = true; }
}
