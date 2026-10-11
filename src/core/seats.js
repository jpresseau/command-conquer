/* core/seats.js - who is playing which seat, and which seat's brain is thinking.
   Part of rts.core, the simulation.

   A battle has SEATS: 'player', the human's, and 'enemy', the computer opponent's - the keys every
   other file and every spec already reads, and they stay. What a seat is FOR is no longer its key:
   G.sides[k].ctl says who drives it ('human' or 'ai'), and .diff which difficulty a computer
   seat plays at. So the opponent's brain can drive any seat - the player's too, for self-play.

   THE BRAIN IS WRITTEN FROM ONE SEAT'S POINT OF VIEW. Its code says _rtsAIOn where it means "my
   side" and _rtsAIFoe() where it means "the side I fight"; _rtsUpdateAI (core/aisupers.js) runs
   each computer seat in turn with _rtsAIOn set to it, and the four places the simulation calls
   into the brain from outside its tick (_rtsAttacked, _rtsBaseIsAttacked, _rtsTeamTookDamage,
   the delivery muster) set it to the seat concerned. Outside those, _rtsAIOn is 'enemy', so in
   the shipped game - one computer seat - every line of the brain reads exactly what it read
   when it named 'enemy' and 'player' outright. unit/fingerprint holds that to the byte.

   A seat's brain state lives on the seat (G.sides[k].ai): its timers and caches, its team-type
   holds, its waypoints, its mending clock and the cells where mines cost it a unit. The names the
   brain has always used for them - G.ai, G.teamHold, G.waypt, G.mendT, G.mineHits - are kept, as
   accessors onto the brain that is thinking. They are not enumerable, so a save (a for-in walk
   of G) never sees them: each brain is reachable by one path only, which the encoder needs. */
var _rtsAIOn = 'enemy';

/* The seat this one fights: the NEAREST seat in play on another team, by start - so with two foes
   and an ally each brain takes the base across from its own. Two seats: the other one. */
function _rtsAIFoe(side) {
  var G = window._rtsG, me = side || _rtsAIOn, S = G && G.sides && G.sides[me];
  if (S && G.order) {
    var best = null, bd = 1e9, P = G.starts && G.starts[me];
    for (var i = 0; i < G.order.length; i++) {
      var k = G.order[i], O = G.sides[k];
      if (k === me || !O || O.team === S.team || O.lost) continue;
      var Q = G.starts && G.starts[k], d = P && Q ? Math.hypot(P.tx - Q.tx, P.tz - Q.tz) : i;
      if (d < bd) { bd = d; best = k; }
    }
    if (best) return best;
  }
  return me === 'player' ? 'enemy' : 'player';
}
/* WHO FIGHTS WHOM: two sides are hostile when they are on different teams. Every "is that an enemy"
   test asks this rather than "is that not mine", which with an ally on the field would have the
   ally's guns turned on the player. Unknown or missing sides are hostile to nobody. */
function _rtsHostile(a, b) {
  if (a === b || !a || !b) return false;
  var S = window._rtsG.sides, A = S[a], B = S[b];
  return !!(A && B) && A.team !== B.team;
}
/* On the human's team: what the player sees by, and never shoots at. */
function _rtsWithPlayer(side) {
  if (side === 'player') return true;
  var S = window._rtsG && window._rtsG.sides, A = S && S[side];
  return !!(A && S.player) && A.team === S.player.team;
}
/* Run fn with `side`'s brain thinking, and put the previous one back whatever happens. */
function _rtsAIAs(side, fn) {
  var was = _rtsAIOn;
  _rtsAIOn = side;
  try { return fn(); } finally { _rtsAIOn = was; }
}
function _rtsSeatAI(side) {
  var G = window._rtsG, S = G && G.sides && G.sides[side];
  return !!(S && S.ctl === 'ai');
}
/* A computer seat's brain, as _rtsNewGame starts the opponent's. */
function _rtsBrainNew() {
  return { next:0, wave:0, build:6, place:0, state:0, lastHit:-999, want:null, teamHold:{} };
}
/* Hand a seat to the computer at difficulty `diff`, with a fresh brain - self-play's setup. */
function _rtsSeatToAI(side, diff) {
  var G = window._rtsG, S = G.sides[side], B = _rtsBrainNew();
  S.ctl = 'ai'; S.diff = diff;
  B.next = RTS_WAVE_FIRST * _rtsBias(side).build;
  S.ai = B;
  return B;
}
function _rtsBrainOf(G) {
  var S = G.sides && G.sides[_rtsAIOn];
  return S && S.ai;
}
/* The brain's old global names, onto the brain that is thinking. Defined on every new G; a load
   applies its body onto a G that _rtsNewGame has just built, so they are already there. */
function _rtsBrainLink(G) {
  Object.defineProperty(G, 'ai', { configurable:true, enumerable:false,
    get: function () { return _rtsBrainOf(G); },
    set: function (v) { G.sides[_rtsAIOn].ai = v; } });
  ['teamHold', 'waypt', 'mendT', 'mineHits'].forEach(function (k) {
    Object.defineProperty(G, k, { configurable:true, enumerable:false,
      get: function () { var B = _rtsBrainOf(G); return B ? B[k] : undefined; },
      set: function (v) { var B = _rtsBrainOf(G); if (B) B[k] = v; } });
  });
}
/* Is team t this brain's? A team belongs to the seat that raised it (core/teams.js). */
function _rtsTeamMine(t) { return !!t && (t.side || 'enemy') === _rtsAIOn; }
/* The computer's opening, in the seat's own frame (`along` toward the foe). The opening defence is
   whichever one the seat's OWN army has: this list once hardcoded two Gun Turrets, which are the
   Compact's, so a Dominion opponent opened behind two Compact buildings it never sold or replaced. */
function _rtsAIOpening(side) {
  var turret = rtsBuildableBy(rtsStructDef('turret'), rtsHouseSide(side)) ? 'turret' : 'flametower';
  return [
    ['struct','yard',    0,  0], ['struct','power',  -1, -5],
    ['struct','refinery',5,  0], ['struct','barracks',4, -5],
    ['struct','factory', 4,  5], ['struct',turret,    9, -2], ['struct',turret,  9, 3],
    ['unit',  'harvester',11, 1], ['unit','rifle',   10, -2], ['unit','tank',   11, 3]
  ];
}
