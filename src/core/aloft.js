/* core/aloft.js - ALOFT: the airship, the drones and the aircraft that never reload.

   ENDLESS (`endless` on the unit): an aircraft that carries what it fires for as long as it flies -
   the Leviathan, the Jetpack Trooper. core/move.js never sends one home to a pad, and core/combat.js
   never counts its rounds, so it neither runs dry nor crashes for want of a pad.

   THE DROP (`drop` on rules/weapons.js `levbomb`): the Leviathan's bombs fall from where it is,
   onto whatever is under it, through the Heavy Bomber's own falling bombs (core/bomber.js
   G.bombs) with the weapon's own damage and reach. Its range is short, so it has to float over
   what it means to hit.

   THE CARRIER (`launch` on `hornets`): its shot is a Hornet - a drone - launched at the target, up
   to RTS_ALOFT.hornets in the air at once. A Hornet fights as any aircraft does until its rack is
   empty or its target gone, then flies home and lands on its Carrier, which counts it back in.
   With no Carrier to go home to, it falls out of the sky. Hornets are never built (`spawned`:
   core/production.js will not queue one, ui/sidebar.js does not show one). */
var RTS_ALOFT = { hornets: 3, dock: RTS_TILE * 1.8 };

function _rtsEndless(d) { return !!(d && d.endless); }

/* The Leviathan's bomb: down from where it is. */
function _rtsSkyDrop(e, w, raw) {
  var G = window._rtsG;
  (G.bombs || (G.bombs = [])).push({ x: e.x, z: e.z, y: e.alt || 14, t: w.drop.fall, side: e.side, from: e.id, dmg: raw, rad: w.drop.rad });
}

/* ------------------------------------------------------------------ hornets ---- */
function _rtsHornetsOf(c) {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) { var o = G.ents[i]; if (!o.dead && o.mother === c.id) n++; }
  return n;
}
/* The Carrier's shot: a Hornet away at `tgt`, if it has one to spare - the opponent's where the
   flak is not (below). */
function _rtsLaunch(e, tgt, w) {
  if (!tgt || tgt.dead || _rtsHornetsOf(e) >= RTS_ALOFT.hornets) return false;
  tgt = _rtsLaunchAim(e, tgt, w);
  if (!tgt) return false;
  var h = _rtsSpawnUnit(e.side, w.launch, e.x, e.z);
  if (!h) return false;
  h.mother = e.id;
  _rtsOrderAttack(h, tgt);
  if (typeof _rtsSfx === 'function') _rtsSfx('rocket', e.x, e.z);
  return true;
}
/* A Hornet's tick, ahead of the aircraft's (core/move.js _rtsAirTick): true while it is going home,
   false to leave it to fight. */
function _rtsHornetTick(e, dt) {
  var G = window._rtsG, c = G.byId[e.mother];
  if (!c || c.dead) { _rtsDamage(e, e.hp + 1, null, false); return true; }   /* nowhere to land */
  var busy = e.ammo > 0 && e.target && !e.target.dead;
  if (busy) return false;
  e.target = null; e.order = 'home';
  var d = Math.hypot(c.x - e.x, c.z - e.z);
  if (d <= RTS_ALOFT.dock) { _rtsKillQuiet(e); return true; }                 /* aboard, and counted back in */
  if (!e.goal || Math.hypot(c.x - e.goal.x, c.z - e.goal.z) > RTS_TILE) {
    e.goal = { x: c.x, z: c.z }; e.path = _rtsPathFor(e, c.x, c.z); e.pi = 0;
  }
  return true;
}

/* -------------------------------------------------------------------- flak ---- */
/* WHERE THE FLAK IS NOT (batch 12g). Sent at the player's base, the opponent's Carrier launched
   its Hornets into the anti-air round it, and every one was shot down on the way in: 29 for 34
   damage in sixteen battles. A Hornet costs nothing - the next goes up as soon as one is lost -
   so what was lost was the sortie, and the fault was the aim. _rtsFlakOver counts the guns that
   can shoot at aircraft, hostile to `side`, whose reach takes in a point (x, z) - by each gun's
   own reach, and a margin for the aircraft that has to hang there to fire or to drop. A gun
   still being built covers nothing, nor one dead for want of power. `teams`: a team sent at
   buildings that flies, or has a Carrier in it - a Falcon's Raid, the Leviathan's Zeppelin, a
   Strike Group - values a building less for every such gun over it (core/teams.js
   _rtsTeamTarget), as a raid values a harvester less for every gun guarding it. Not a team that
   hunts whatever it finds: what it hunts moves in and out of cover, and measured on those - the
   MiGs and Yaks - the rule cost the Dominion (docs/roster-ra2-12.md). */
var RTS_FLAK = { margin: RTS_TILE * 2, teams: true };
/* ...a team member that flies, or launches what does */
function _rtsFlies(m) {
  var d = !m.dead && rtsUnitDef(m.def);
  return !!(d && (d.air || (RTS_WEAPONS[d.weapon] || {}).launch));
}
function _rtsFlakReach(g) {
  var ws = _rtsGuns(g), r = 0;
  for (var k = 0; k < ws.length; k++) if (ws[k] && ws[k].aa && ws[k].range > r) r = ws[k].range;
  return r;
}
function _rtsFlakOver(side, x, z) {
  var G = window._rtsG, n = 0, far = 0, k;
  for (k in RTS_WEAPONS) if (RTS_WEAPONS[k].aa && RTS_WEAPONS[k].range > far) far = RTS_WEAPONS[k].range;
  var list = _rtsSpNear(x, z, far + RTS_FLAK.margin) || G.ents;
  for (var i = 0; i < list.length; i++) {
    var g = list[i];
    if (g.dead || g.inside || g.building || !_rtsHostile(g.side, side)) continue;
    var r = _rtsFlakReach(g);
    if (!r) continue;
    var sd = g.type === 'struct' && rtsStructDef(g.def);
    if (sd && sd.needsPower && _rtsPowerFactor(g.side) < 0.999) continue;
    r += RTS_FLAK.margin;
    if ((g.x - x) * (g.x - x) + (g.z - z) * (g.z - z) <= r * r) n++;
  }
  return n;
}
/* The opponent's Carrier sends its Hornets at what it was sent at if no flak covers it, and
   otherwise at the most worth having in its reach that none covers - a harvester on the ore, a
   hull, a building on the shore - or holds them. A player's Carrier does as it is told. */
function _rtsLaunchAim(e, tgt, w) {
  if (!_rtsSeatAI(e.side) || !_rtsFlakOver(e.side, tgt.x, tgt.z)) return tgt;
  var G = window._rtsG, best = null, bv = 0, list = _rtsSpNear(e.x, e.z, w.range) || G.ents;
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (o.dead || o.inside || o.hidden || !_rtsHostile(o.side, e.side) || !_rtsGunEngages(w, o)) continue;
    var d = _rtsRangeTo(e, o);
    if (d > w.range || _rtsFlakOver(e.side, o.x, o.z)) continue;
    var v = _rtsEvalObject(e, o, d, w, true);
    if (v > bv) { bv = v; best = o; }
  }
  return best;
}
