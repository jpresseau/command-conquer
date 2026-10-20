/* core/idle.js - WHAT THE PLAYER IS NOT USING, said once: a harvester standing with no ore it can
   reach, the ore gone altogether, a harvester full with no Refinery, a Vehicle Works or Barracks
   with an empty line and the money to fill it. Each line carries where it is, so a tap on it looks
   there and selects the thing (ui/go.js). Computer seats manage their own, and a battle that is
   over says nothing. Rate-limited: one such line in RTS_IDLE_EVERY seconds, the same harvester
   once in RTS_IDLE_AGAIN, a line once until it has been used. Part of rts.core; unit/idle plays
   it headless. */

var RTS_IDLE_HARV = 12;      /* seconds a harvester stands before it is said */
var RTS_IDLE_LINE = 30;      /* seconds a line stands empty, with the money, before it is said */
var RTS_IDLE_EVERY = 45;     /* seconds between two idle lines */
var RTS_IDLE_AGAIN = 90;     /* seconds before the same harvester is said again */
var RTS_IDLE_OPENING = 90;   /* seconds of battle before a line is ever said */
var RTS_IDLE_RICH = 1000;    /* credits unspent, at least, before a line is said */
var RTS_IDLE_LINES = { vehicle: 'factory', infantry: 'barracks' };   /* the line, by its building - named from rules/structures.js */

function _rtsIdleSay(G, m, e) { G.idle.said = G.t; _rtsSay(m, 5, { x: e.x, z: e.z }, e); }
function _rtsIdleTick(dt) {
  var G = window._rtsG, S = G.sides.player;
  if (!S || S.ctl !== 'human' || G.over) return;
  var I = G.idle || (G.idle = { said: -999, line: {}, lineSaid: {}, gone: false });
  var free = G.t - I.said >= RTS_IDLE_EVERY, i, e, anyOre = null;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.side !== 'player' || e.type !== 'unit' || e.inside) continue;
    var d = rtsUnitDef(e.def);
    if (!d || !d.harvest) continue;
    /* standing: nothing to go to (harvest.js leaves it in toField with no tile), or full with
       nowhere to unload */
    var noRef = e.hstate === 'toRef' && !e.path && !_rtsHas('player', 'refinery');
    var standing = (e.hstate === 'toField' && !e.htile && !e.path) || noRef;
    e.idleT = standing ? (e.idleT || 0) + dt : 0;
    if (!standing || e.idleT < RTS_IDLE_HARV || !free) continue;
    if (noRef) {
      if (G.t - (e.idleSaid || -999) < RTS_IDLE_AGAIN) continue;
      e.idleSaid = G.t; free = false;
      _rtsIdleSay(G, 'A harvester is full, with no Refinery to unload at.', e);
      continue;
    }
    if (anyOre === null) { anyOre = false; for (var k = 0; k < G.scrap.length; k++) if (G.scrap[k] > 0) { anyOre = true; break; } }
    if (!anyOre) { if (!I.gone) { I.gone = true; _rtsIdleSay(G, 'The ore is gone: every field is mined out.', e); free = false; } continue; }
    if (G.t - (e.idleSaid || -999) < RTS_IDLE_AGAIN) continue;
    e.idleSaid = G.t; free = false;
    _rtsIdleSay(G, 'A harvester is idle: it can reach no ore. Send it yourself.', e);
  }
  /* the lines: empty, with a maker standing and the money for its cheapest unit */
  for (var cat in RTS_IDLE_LINES) {
    if (S.q[cat]) { I.lineSaid[cat] = false; I.line[cat] = 0; continue; }
    /* ...and real money, past the opening: a line empty at 0:30 with the starting credits is a
       player building a base, not one who forgot; said when there is twice its cheapest unit's
       price and at least 1000 lying unspent, after the first ninety seconds */
    var mk = _rtsHas('player', RTS_IDLE_LINES[cat]), cheapest = mk ? _rtsIdleCheapest(cat) : null;
    if (!mk || cheapest === null || G.t < RTS_IDLE_OPENING || rtsMoney(S) < Math.max(RTS_IDLE_RICH, 2 * cheapest)) { I.line[cat] = 0; continue; }
    I.line[cat] = (I.line[cat] || 0) + dt;
    if (I.line[cat] < RTS_IDLE_LINE || I.lineSaid[cat] || !free) continue;
    I.lineSaid[cat] = true; free = false;
    _rtsIdleSay(G, 'The ' + rtsStructDef(RTS_IDLE_LINES[cat]).name + ' is idle, with credits to spend.', mk);
  }
}
/* the cheapest unit of `cat` the player can make now, or null */
function _rtsIdleCheapest(cat) {
  var best = null;
  for (var i = 0; i < RTS_UNITS.length; i++) {
    var u = RTS_UNITS[i];
    if (u.kind !== cat || !_rtsCanProduce('player', u.key)) continue;
    var c = _rtsCostOf('player', u);
    if (best === null || c < best) best = c;
  }
  return best;
}
