/* core/mind.js - MIND CONTROL, the crewless tank that is proof against it, and the sensor that
   finds what hides.

   THE MENTALIST. Its weapon (`mind` on rules/weapons.js `mindlink`) does no damage: the unit it
   reaches CHANGES SIDE. Only a unit - never a building - and never one that flies or is
   `mindproof` (another Mentalist, a Drone Tank); _rtsWeaponReaches says so, so it is never even
   aimed at one. The taken unit drops whatever it was doing, leaves its old side's team, leaves the
   old side's selection, and its passengers come with it. It is held while the Mentalist lives:
   when the Mentalist dies, or takes another, it goes back to the side it came from. What it
   carries for that is plain data on the unit (`mind:{ by, was }`), so a save keeps it.

   THE DRONE TANK has `hub:'relayhub'`: while its side has no finished Relay Hub with full power,
   every Drone Tank is OFFLINE - it stops where it stands and holds its fire (`e.offline`, read by
   core/units.js through _rtsOffline) - and comes back the moment a hub is up again.

   THE ECHO SENSOR's `detects` is the Destroyer's sonar on land (core/combat.js _rtsCloakAI finds a
   submerged boat with it already), and here it also unmasks a jammed unit (core/jammer.js). */
var RTS_MIND = { col: [1.25, 0.55, 1.6] };

function _rtsMindproof(o) {
  if (!o || o.type !== 'unit' || o.air) return true;
  return !!(rtsUnitDef(o.def) || {}).mindproof;
}
/* `e` reaches `tgt`: take it, freeing whatever it held before. */
function _rtsMindTake(e, tgt) {
  var G = window._rtsG;
  if (!tgt || tgt.dead || _rtsMindproof(tgt) || !_rtsHostile(tgt.side, e.side)) return false;
  var old = e.thrall != null && G.byId[e.thrall];
  if (old && old !== tgt) _rtsMindFree(old);
  var was = tgt.mind ? tgt.mind.was : tgt.side;           /* taken from a taker: home is still home */
  if (tgt.mind) { var prev = G.byId[tgt.mind.by]; if (prev) prev.thrall = null; }
  _rtsMindSwitch(tgt, e.side);
  tgt.mind = { by: e.id, was: was };
  e.thrall = tgt.id;
  G.minds = (G.minds || 0) + 1;
  return true;
}
/* Back to the side it came from. */
function _rtsMindFree(u) {
  if (!u || !u.mind) return;
  var was = u.mind.was, G = window._rtsG, by = G.byId[u.mind.by];
  if (by && by.thrall === u.id) by.thrall = null;
  u.mind = null;
  if (!u.dead) _rtsMindSwitch(u, was);
}
function _rtsMindSwitch(u, side) {
  var G = window._rtsG;
  u.side = side; u.order = null; u.target = null; u.path = null; u.goal = null; u.wq = null;
  if (u.sqd != null && G.teams[u.sqd]) _rtsTeamRemove(G.teams[u.sqd], u);
  var si = G.sel.indexOf(u); if (si >= 0 && side !== 'player') G.sel.splice(si, 1);
  (u.cargo || []).forEach(function (p) { if (!p.dead) { p.side = side; p.order = null; p.target = null; } });
}
/* Each tick, while anything is held: a holder that has died lets go. */
function _rtsMindTick() {
  var G = window._rtsG;
  if (!G.minds) return;
  var held = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (!u.mind) continue;
    var by = G.byId[u.mind.by];
    if (u.dead) { if (by && by.thrall === u.id) by.thrall = null; u.mind = null; continue; }
    if (!by || by.dead || by.thrall !== u.id) { _rtsMindFree(u); continue; }
    held++;
  }
  G.minds = held;
}

/* ------------------------------------------------------------------ the hub ---- */
/* Has `side` a finished Relay Hub with full power? Asked once per side per tick. */
function _rtsHubUp(side, key) {
  var G = window._rtsG, c = G.hubUp || (G.hubUp = {}), k = side + ':' + key;
  if (c.t === G.t && k in c) return c[k];
  if (c.t !== G.t) { G.hubUp = c = { t: G.t }; }
  return (c[k] = !!_rtsHas(side, key) && _rtsPowerFactor(side) >= 0.999);
}
/* A Drone Tank whose hub is down: core/units.js stops it and holds its fire. */
function _rtsOffline(e) {
  var d = rtsUnitDef(e.def);
  e.offline = d && d.hub && !_rtsHubUp(e.side, d.hub) ? 1 : 0;
  return !!e.offline;
}

/* --------------------------------------------------------------- the sensor ---- */
/* Is jammed unit `o` found by one of `side`'s sensors? */
function _rtsSensed(o, side) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var s = G.ents[i];
    if (s.type !== 'struct' || s.dead || s.building || s.side !== side) continue;
    var r = (rtsStructDef(s.def) || {}).detects;
    if (r && Math.hypot(o.x - s.x, o.z - s.z) <= r) return true;
  }
  return false;
}
