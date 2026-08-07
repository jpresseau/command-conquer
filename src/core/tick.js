/* core/tick.js - _rtsTick: one step of the whole simulation, in order. Part of rts.core. */

function _rtsTick(dt) {
  var G = window._rtsG;
  if (!G || G.over) return;
  if (dt > 0.1) dt = 0.1;                        /* never let a stall fast-forward the battle */
  G.t += dt;
  if (G.msgT > 0) G.msgT -= dt;

  _rtsTickOre(dt);
  _rtsVisTick(dt);
  _rtsSupersTick(dt);
  _rtsStrikesTick(dt);
  _rtsIronTick(dt);
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
  _rtsUpdateProj(dt);

  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
  _rtsAnimAI(dt);
  _rtsCrateAI(dt);
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

  /* win / lose: losing every structure ends it, the way it did in the originals */
  var pAlive = 0, eAlive = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.type !== 'struct') continue;
    if (e.side === 'player') pAlive++; else eAlive++;
  }
  if (!pAlive) { G.over = 'lose'; G.sides.player.lost = true; }
  else if (!eAlive) { G.over = 'win'; G.sides.enemy.lost = true; }
  /* EVA calls the result. Announced here rather than in the UI so it fires however the battle
     ended, including the scripted paths above that set G.over directly. */
  if (G.over && !G.overSaid) {
    G.overSaid = 1;
    if (typeof rtsEva === 'function') rtsEva(G.over === 'win' ? 'won' : 'lost');
  }
}
