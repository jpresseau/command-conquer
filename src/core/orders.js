/* core/orders.js - what a unit is told to do: move, hold, board, unload, capture, attack,
   harvest.

   Split out of core/production.js, which had grown to hold the build queues, the placement
   rules, the difficulty multipliers AND every order in the game, and tipped over the 500-line
   guard the moment hold-position moved in. Production decides what EXISTS; this file decides
   what it does next, and the two only meet where a finished unit is handed its maker's rally
   point. */

/* STOP WHERE YOU ARE. UNIT.CPP's MISSION_GUARD: the unit drops what it was doing and holds the
   ground it is on, still shooting what comes into range. Lived inline in the S keydown, which
   made it a control only a keyboard could give - the same fault the MCV's deploy had, and the
   reason both now sit behind one function that the key and the on-screen button call.

   A harvester is skipped on purpose: it has no weapon, so "hold position" on one is just an
   idle harvester, and telling the ore truck to stop is never what the player meant by
   selecting everything and pressing stop. */
function _rtsHoldSelected() {
  var G = window._rtsG, held = 0;
  if (!G || !G.sel) return 0;
  for (var i = 0; i < G.sel.length; i++) {
    var u = G.sel[i];
    if (!u || u.dead || u.side !== 'player' || u.type !== 'unit') continue;
    if ((rtsUnitDef(u.def) || {}).harvest) continue;
    u.order = 'hold'; u.path = null; u.goal = null; u.susp = null; held++;
  }
  return held;
}
function _rtsOrderMove(e, x, z, attackMove) {
  if (e.type !== 'unit') return;
  e.order = attackMove ? 'amove' : 'move';
  e.target = null; e.hstate = null;
  e.goal = { x:x, z:z };                       /* remembered so a blocked repath keeps aiming here */
  e.path = _rtsPathFor(e, x, z); e.pi = 0;
  if (!e.path) { e.order = null; }
}
/* Ordering infantry onto a friendly transport is a board order, not an attack - the original
   runs it over the radio (RADIO_TRYING_TO_LOAD / RADIO_ROGER). The passenger walks there and
   boards when it arrives, which is handled in the move completion below. */
function _rtsOrderBoard(inf, t) {
  if (!_rtsCanBoard(inf, t)) return false;
  inf.order = 'board'; inf.target = t; inf.hstate = null;
  inf.goal = { x:t.x, z:t.z };
  inf.path = _rtsPathFor(inf, t.x, t.z); inf.pi = 0;
  return true;
}
/* "Put them down over there." The craft is sent to the spot in ITS OWN domain - _rtsPath walks
   a goal it cannot occupy out to the nearest cell it can, so a click on the beach becomes the
   open water closest to that beach - and the cargo steps ashore when it arrives. One order, not
   a move followed by a keypress, because the point on the map the player clicked is the whole
   instruction. Returns false when there is no route, which leaves the transport as it was. */
function _rtsOrderUnloadAt(t, x, z) {
  if (!t || t.type !== 'unit' || !_rtsCargoCount(t)) return false;
  t.order = 'unload'; t.target = null; t.hstate = null;
  t.goal = { x:x, z:z };
  t.path = _rtsPathFor(t, x, z); t.pi = 0;
  /* No route at all - unload where it stands, which is what the player asked for as nearly as
     it can be done, and what the U key would have done anyway. */
  if (!t.path) { t.order = null; return false; }
  return true;
}
/* "Go and take that." One definition of what a capture order IS, because there are two callers
   now - the player's right-click and the opponent's capture leg - and a squad walking in for
   one side must be walking in on exactly the same terms as for the other. The route is left to
   the unit tick rather than pathed here: _rtsApproach needs the unit's bearing on the building
   to pick which side to stand on, and that is only right once it is actually moving. */
function _rtsOrderCapture(u, b) {
  if (!u || u.type !== 'unit' || !b || b.type !== 'struct') return false;
  if (b.dead || b.selling || b.side === u.side || !rtsCapturable(b.def)) return false;
  u.order = 'capture'; u.target = b; u.hstate = null;
  u.path = null; u.goal = null; u.susp = null;
  return true;
}
function _rtsOrderAttack(e, tgt) {
  if (e.type !== 'unit') return;
  var d = rtsUnitDef(e.def);
  if (!d.weapon) { _rtsOrderMove(e, tgt.x, tgt.z, false); return; }
  /* "Dogs can only attack infantrymen" - INFANTRY.CPP downgrades ACTION_ATTACK to ACTION_NONE
     rather than letting the order stand, so ordering a dog onto a tank is a move order. */
  var _ow = RTS_WEAPONS[d.weapon];
  if (_ow && _ow.maul && !(tgt.type === 'unit' && (rtsUnitDef(tgt.def) || {}).kind === 'infantry')) {
    _rtsOrderMove(e, tgt.x, tgt.z, false); return;
  }
  e.order = 'attack'; e.target = tgt; e.hstate = null;
  e.goal = { x:tgt.x, z:tgt.z };
  e.path = _rtsPathFor(e, tgt.x, tgt.z); e.pi = 0;
}
function _rtsOrderHarvest(e, tx, tz) {
  var d = rtsUnitDef(e.def);
  if (!d.harvest) return;
  e.order = 'harvest'; e.target = null;
  e.htile = (tx != null) ? { tx:tx, tz:tz } : null;
  e.hstate = e.carry >= d.capacity ? 'toRef' : 'toField';
  e.path = null;
}

/* ---------------------------------------------------------- difficulty --
   RULES.CPP's DifficultyClass is applied to a whole HOUSE, not to individual units, and it
   is a set of multipliers rather than special-case code. Everything the enemy does goes
   through _rtsBias; the player's side always gets the identity table, so a bias can never
   silently change how your own units behave. */
var _RTS_NOBIAS = { name:'Player', iq:5, fire:1, speed:1, armor:1, rof:1, cost:1, build:1, wall:true, scan:true };
/* A crate bonus lives on the UNIT that picked it up, multiplying the house-wide bias rather
   than replacing it. `_rtsBias` answers for a whole side and is difficulty; this answers for
   one object and is what it has found lying around. A unit with no bonuses costs one property
   lookup, which is why this is a plain function rather than a merged object built per call. */
