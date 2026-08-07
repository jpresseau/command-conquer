/* core/triggers.js - TRIGGER.CPP: trigger instances, events and actions. Part of rts.core. */

/* ------------------------------------------------------------ main tick */
/* ========================================================= triggers (TRIGGER.CPP) --
   Find_Or_Make: ONE live trigger instance per trigger TYPE, shared by everything attached to
   it. TriggerTypeClass is the definition (in RTS_TRIGGERS); this is TriggerClass, the
   instance, and it carries the mutable per-event state TDEventClass holds. */
function _rtsTrigType(name) {
  for (var i = 0; i < RTS_TRIGGERS.length; i++) if (RTS_TRIGGERS[i].name === name) return RTS_TRIGGERS[i];
  return null;
}
function _rtsTEventReset(inst, slot) {
  var T = inst.type, spec = (slot === 1) ? T.event1 : T.event2;
  var td = (slot === 1) ? inst.td1 : inst.td2;
  td.tripped = false;
  /* "if (Event == TEVENT_TIME) td.Timer = Data.Value * (TICKS_PER_MINUTE/10)" */
  td.timer = (spec && spec[0] === 'time') ? (spec[1] || 0) * RTS_TIMER_TICK : 0;
}
function _rtsTrigFindOrMake(name) {
  var G = window._rtsG;
  if (!G.trig) _rtsTrigInit(G);
  if (G.trig[name]) return G.trig[name];
  var T = _rtsTrigType(name);
  if (!T) return null;
  var inst = { name:name, type:T, td1:{ tripped:false, timer:0 }, td2:{ tripped:false, timer:0 },
    attach:0, cell:null, fired:0 };
  G.trig[name] = inst;
  _rtsTEventReset(inst, 1); _rtsTEventReset(inst, 2);
  return inst;
}
function _rtsTrigDestroy(inst) {
  var G = window._rtsG;
  /* Detach_This_From_All: nothing may keep pointing at a deleted trigger. */
  for (var i = 0; i < G.ents.length; i++) if (G.ents[i].trig === inst.name) G.ents[i].trig = null;
  delete G.trig[inst.name];
}
function _rtsTrigInit(G) {
  G.trig = {};
  G.globals = {};
  G.mtimer = { active:false, t:0 };
  G.justBuilt = { player:{ struct:null, unit:null }, enemy:{ struct:null, unit:null } };
  G.lost = { player:{ units:0, structs:0 }, enemy:{ units:0, structs:0 } };
  for (var i = 0; i < RTS_TRIGGERS.length; i++) _rtsTrigFindOrMake(RTS_TRIGGERS[i].name);
}

/* TEventClass::operator(). Three classes of event, handled in the order the original does:
   forced first, then the latch, then ambient, then the notify gate, then polled house state. */
function _rtsTEvent(inst, slot, event, obj, forced) {
  var G = window._rtsG, T = inst.type;
  var spec = (slot === 1) ? T.event1 : T.event2;
  var td = (slot === 1) ? inst.td1 : inst.td2;
  if (!spec) return false;
  var name = spec[0], arg = spec[1];
  var def = RTS_TEVENTS[name];
  if (!def) return false;

  /* "If this trigger event has been forced, then no further checks are required." */
  if (forced) td.tripped = true;
  /* THE LATCH. Once tripped, an event stays true until Reset - which is the only reason
     `and` can span time at all: event 1 may trip minutes before event 2. */
  if (td.tripped) return true;

  if (name === 'none') return false;
  if (name === 'globalSet')   return !!G.globals[arg];
  if (name === 'globalClear') return !G.globals[arg];
  if (name === 'timerExpired') return !!(G.mtimer.active && G.mtimer.t <= 0);
  if (name === 'time')        return td.timer <= 0;

  /* "just by the fact that this routine is called" - these are only true when REPORTED. */
  if (def.kind === 'notify') {
    if (name !== 'any' && event !== name && event !== 'any') return false;
    if (name !== 'any') { td.tripped = true; }
    return true;
  }

  var who = (def.who === 'arg') ? arg : T.house;
  var S = G.sides[who];
  if (!S) return false;
  switch (name) {
    case 'credits':        return rtsMoney(S) >= arg;
    case 'nUnitsLost':     return G.lost[who].units >= arg;
    case 'nBuildingsLost': return G.lost[who].structs >= arg;
    case 'build':          if (G.justBuilt[who].struct !== arg) return false; td.tripped = true; return true;
    case 'buildUnit':      if (G.justBuilt[who].unit !== arg) return false;  td.tripped = true; return true;
    case 'noFactories':    return !_rtsHas(who, 'factory') && !_rtsHas(who, 'barracks') && !_rtsHas(who, 'yard');
    case 'buildingExists': return !!_rtsHas(who, arg);
    case 'lowPower':       return S.powerMade < S.powerUsed;
    case 'houseDiscovered': return _rtsHouseSeen(who);
    case 'buildingsDestroyed': return !_rtsAnyAlive(who, 'struct');
    case 'unitsDestroyed':     return !_rtsAnyAlive(who, 'unit');
    case 'allDestroyed':       return !_rtsAnyAlive(who, 'struct') && !_rtsAnyAlive(who, 'unit');
    default: return false;
  }
}
function _rtsAnyAlive(side, type) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === side && e.type === type) return true;
  }
  return false;
}
/* IsDiscovered: has the player actually laid eyes on anything this house owns? The shroud
   already records that per cell, so no separate flag is needed. */
function _rtsHouseSeen(side) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== side) continue;
    var tx = _rtsTX(e.x), tz = _rtsTX(e.z);
    if (_rtsInB(tx, tz) && G.mapped[_rtsIdx(tx, tz)]) return true;
  }
  return false;
}

/* TActionClass::operator(). Returns whether it did anything - TRIGGER.CPP gates the
   trigger's own deletion/reset on this, so a failed action leaves the trigger armed. */
function _rtsTAction(inst, spec, obj, cell) {
  var G = window._rtsG;
  if (!spec) return false;
  var act = spec[0], arg = spec[1];
  if (!RTS_TACTIONS[act]) return false;
  var i, t, ty;
  switch (act) {
    case 'none': return false;
    case 'text':
      /* Rate-limited; see RTS_MESSAGE_DELAY. Returning false leaves the trigger armed. */
      if (!G.msgSaid) G.msgSaid = {};
      if (G.msgSaid[arg] != null && G.t - G.msgSaid[arg] < RTS_MESSAGE_DELAY) return false;
      G.msgSaid[arg] = G.t; _rtsSay(arg); return true;
    case 'playSound': if (typeof _rtsSfx === 'function') _rtsSfx(arg); return true;
    case 'win':
      /* "Really the house value is only used to determine if it is the player or computer." */
      if (arg === 'player') { G.over = 'win'; G.sides.enemy.lost = true; }
      else { G.over = 'lose'; G.sides.player.lost = true; }
      return true;
    case 'lose':
      if (arg === 'player') { G.over = 'lose'; G.sides.player.lost = true; }
      else { G.over = 'win'; G.sides.enemy.lost = true; }
      return true;
    case 'setGlobal':   G.globals[arg] = true;  return true;
    case 'clearGlobal': G.globals[arg] = false; return true;
    case 'autocreate':  G.alerted = true; return true;
    case 'baseBuilding': G.noBuild = !arg; return true;
    case 'beginProduction': G.sides[arg].producing = true; return true;
    case 'preferredTarget': G.preferred = G.preferred || {}; G.preferred[inst.type.house] = arg; return true;
    case 'allHunt': if (arg === 'enemy') { _rtsAIAllToHunt(); return true; } return false;
    case 'fireSale': G.sides[arg].fireSale = true; return true;
    case 'revealAll':
      for (i = 0; i < G.mapped.length; i++) G.mapped[i] = 1;
      return true;
    case 'revealSome':
      var w = _rtsWayptPos(arg);
      if (!w) return false;
      _rtsSightFrom(_rtsTX(w.x), _rtsTX(w.z), Math.min(RTS_SIGHT_MAX, 10));
      return true;
    case 'startTimer': if (G.mtimer.active) return false; G.mtimer.active = true; return true;
    case 'stopTimer':  if (!G.mtimer.active) return false; G.mtimer.active = false; return true;
    case 'setTimer':   G.mtimer.t = (arg || 0) * RTS_TIMER_TICK; G.mtimer.active = true; return true;
    case 'addTimer':   G.mtimer.t += (arg || 0) * RTS_TIMER_TICK; return true;
    /* "if (MissionTimer <= value) MissionTimer = 0" - it clamps, it does not go negative. */
    case 'subTimer':   G.mtimer.t = Math.max(0, G.mtimer.t - (arg || 0) * RTS_TIMER_TICK); return true;
    case 'createTeam':
      ty = _rtsTeamTypeByName(arg);
      if (!ty) return false;
      _rtsTeamMake(ty); return true;
    case 'destroyTeam':
      ty = _rtsTeamTypeByName(arg);
      if (!ty) return false;
      var n = 0;
      for (var tid in G.teams) if (G.teams[tid].type === ty) { _rtsTeamDisband(G.teams[tid]); n++; }
      return n > 0;
    case 'reinforce':
      ty = _rtsTeamTypeByName(arg);
      if (!ty) return false;
      return _rtsTeamReinforce(ty);
    case 'destroyObject':
      if (!obj || obj.dead) return false;
      _rtsDamage(obj, obj.hp + 1, null);
      return true;
    /* "A forced trigger will force an existing trigger of that type or will create a trigger
       of that type and then force it to be sprung." */
    case 'forceTrigger':
      var other = _rtsTrigFindOrMake(arg);
      if (!other) return false;
      _rtsTrigSpring(other, 'any', null, null, true);
      return true;
    /* "Destroying a trigger means that all triggers of that type will be destroyed." */
    case 'destroyTrigger':
      if (!G.trig[arg]) return false;
      _rtsTrigDestroy(G.trig[arg]);
      return true;
    default: return false;
  }
}
function _rtsTeamTypeByName(name) {
  for (var i = 0; i < RTS_TEAM_TYPES.length; i++) if (RTS_TEAM_TYPES[i].name === name) return RTS_TEAM_TYPES[i];
  return null;
}
/* Do_Reinforcements: build the team's whole composition at the house's own waypoint. It
   REPORTS FAILURE if nothing could be placed, which is exactly the case TRIGGER.CPP's
   `if (ok)` gate exists for - the trigger stays armed and tries again. */
function _rtsTeamReinforce(ty) {
  var w = _rtsWayptPos('home');
  if (!w) return false;
  var t = _rtsTeamMake(ty), made = 0, k, n;
  for (k in ty.members) {
    for (n = 0; n < ty.members[k]; n++) {
      var off = _rtsTeamSpread(made);
      var u = _rtsSpawnUnit('enemy', k, w.x + off.x, w.z + off.z);
      if (u) { _rtsTeamAdd(t, u); u.init = true; made++; }
    }
  }
  if (!made) { _rtsTeamDisband(t); return false; }
  return true;
}

/* TriggerClass::Spring. */
function _rtsTrigSpring(inst, event, obj, cell, forced) {
  var T = inst.type, e1, e2 = false, exec = false;

  e1 = _rtsTEvent(inst, 1, event, obj, forced);

  /* "Forced triggers must presume that the cell parameter is invalid" and bypass
     EventControl entirely - a chained trigger does not re-check its own conditions. */
  if (forced) {
    cell = inst.cell;
    exec = true;
  } else {
    switch (T.control || 'only') {
      case 'and':
        e2 = _rtsTEvent(inst, 2, event, obj, forced);
        exec = (e1 && e2); break;
      case 'linked':
      case 'or':
        e2 = _rtsTEvent(inst, 2, event, obj, forced);
        exec = (e1 || e2); break;
      default:
        exec = e1; break;
    }
  }
  if (!exec) return false;

  /* SEMIPERSISTANT detaches as it goes and only actually springs once the LAST attachment
     is gone. */
  if (T.persist === 'semi') {
    if (obj) obj.trig = null;
    inst.attach--;
    if (inst.attach > 0) return false;
  }

  var ok = false;
  if (T.control === 'linked') {
    /* Each event fires ITS OWN action rather than both firing together. */
    if (e1 || forced) ok = _rtsTAction(inst, T.action1, obj, cell) || ok;
    if (e2 && !forced) ok = _rtsTAction(inst, T.action2, obj, cell) || ok;
  } else if ((T.actionControl || 'and') === 'only') {
    ok = _rtsTAction(inst, T.action1, obj, cell);
  } else {
    ok = _rtsTAction(inst, T.action1, obj, cell);
    ok = _rtsTAction(inst, T.action2, obj, cell) || ok;
  }

  /* "If at least one action was performed, then consider this trigger to have completed."
     An action that reported failure leaves the trigger armed to try again. */
  if (ok) {
    inst.fired++;
    if (T.persist === 'volatile' || (T.persist === 'semi' && inst.attach <= 1)) {
      _rtsTrigDestroy(inst);
    } else {
      _rtsTEventReset(inst, 1); _rtsTEventReset(inst, 2);
    }
  }
  return ok;
}
/* The notification path: something happened to an object, tell its trigger. */
function _rtsTrigNotify(event, obj, cell) {
  var G = window._rtsG;
  if (!G || !G.trig) return;
  if (obj && obj.trig && G.trig[obj.trig]) { _rtsTrigSpring(G.trig[obj.trig], event, obj, cell, false); return; }
  for (var name in G.trig) _rtsTrigSpring(G.trig[name], event, obj, cell, false);
}
function _rtsTriggersTick(dt) {
  var G = window._rtsG;
  if (!G.trig) _rtsTrigInit(G);
  if (G.mtimer.active && G.mtimer.t > 0) G.mtimer.t = Math.max(0, G.mtimer.t - dt);
  var name, inst;
  for (name in G.trig) {
    inst = G.trig[name];
    if (inst.td1.timer > 0) inst.td1.timer = Math.max(0, inst.td1.timer - dt);
    if (inst.td2.timer > 0) inst.td2.timer = Math.max(0, inst.td2.timer - dt);
  }
  /* LogicTriggers get an ANY pass every frame; that is how ambient and polled events are
     ever noticed without something reporting them. */
  for (name in G.trig) {
    inst = G.trig[name];
    if (!G.trig[name]) continue;
    _rtsTrigSpring(inst, 'any', null, null, false);
  }
  /* Just_Built is a one-frame signal, cleared after the pass that could read it. */
  G.justBuilt.player.struct = G.justBuilt.player.unit = null;
  G.justBuilt.enemy.struct = G.justBuilt.enemy.unit = null;
}

