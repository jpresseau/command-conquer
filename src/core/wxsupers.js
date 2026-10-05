/* core/wxsupers.js - weather called down: the Compact's Fog Bank and the Dominion's Thunderhead.

   The weather of the whole battle is the map's (core/skyplay.js). These two put weather on ONE
   place, for a while, where a side chooses - the third superweapon each army has, from its own
   building (rules/structures.js `mist`, `spire`). Both live in G.wx as cells: { kind, x, z, r,
   t, side, id }, centred where they were called, r in world units, t the seconds left.

     FOG BANK     RTS_FOGBANK.r cells across the middle, RTS_FOGBANK.time seconds. Nothing SEES or
                  is seen through it past RTS_FOGBANK.see cells: a sight disc from inside is
                  capped to that (_rtsVisTick), ground inside is only revealed that close to the
                  eye looking at it (_rtsSightFrom), and no shooter finds a target past it when
                  either is in the bank (_rtsFindTarget). Like the sky's fog it takes no side -
                  the caller's own guns are as blind in it - and a gun given its target keeps
                  its reach. So it hides an advance, or blinds a fortified line to one.
     THUNDERHEAD  RTS_THUNDER.r cells, RTS_THUNDER.time seconds. Every RTS_THUNDER.every seconds
                  lightning strikes the caller's enemy under it - an aircraft first, then a
                  vehicle, a building, a man, the one nearest the eye of the storm - for
                  RTS_THUNDER.dmg. And no armed aircraft of either side flies in it: one caught
                  in it goes home as in the sky's storm (_rtsStormGrounds), and stays down until
                  this storm has blown out, so a storm over an airfield holds the whole wing. */

var RTS_FOGBANK = { r: 9, time: 120, see: 3 };
var RTS_THUNDER = { r: 8, time: 60, every: 3, dmg: 80 };

function _rtsWxCells() { var G = window._rtsG; return (G && G.wx) || []; }
function _rtsWxAt(kind, x, z) {
  var W = _rtsWxCells();
  for (var i = 0; i < W.length; i++) if (W[i].kind === kind && Math.hypot(x - W[i].x, z - W[i].z) <= W[i].r) return W[i];
  return null;
}
function _rtsInFogBank(x, z) { return !!_rtsWxAt('fog', x, z); }
function _rtsWxCall(side, kind, tx, tz, r, time) {
  var G = window._rtsG;
  if (!_rtsInB(tx, tz)) return null;
  G.wx = G.wx || [];
  G.wxN = (G.wxN || 0) + 1;
  var c = { kind: kind, x: _rtsWX(tx), z: _rtsWX(tz), r: r * RTS_TILE, t: time, side: side, id: G.wxN, boltT: RTS_THUNDER.every };
  G.wx.push(c);
  G.visDirty = 1;
  return c;
}
function _rtsFireFogBank(side, tx, tz) {
  if (!_rtsWxCall(side, 'fog', tx, tz, RTS_FOGBANK.r, RTS_FOGBANK.time)) return false;
  _rtsSay(side === 'player' ? 'Fog Bank down. Nothing sees through it past ' + RTS_FOGBANK.see + ' cells.' : 'The enemy has called down a fog bank.');
  if (typeof _rtsSfx === 'function') _rtsSfx('build');
  return true;
}
function _rtsFireThunder(side, tx, tz) {
  if (!_rtsWxCall(side, 'storm', tx, tz, RTS_THUNDER.r, RTS_THUNDER.time)) return false;
  _rtsSay(side === 'player' ? 'Thunderhead breaking. Nothing flies in it.' : 'The enemy has called a thunderstorm down on us.');
  if (typeof _rtsSfx === 'function') _rtsSfx('rocket');
  return true;
}

/* A sight disc from (x, z), in cells: capped inside a fog bank. */
function _rtsWxSight(x, z, cells) { return _rtsInFogBank(x, z) ? Math.min(cells, RTS_FOGBANK.see) : cells; }
/* Can a shooter at e find o at this distance? Not past the bank's reach when either is in one. */
function _rtsWxFinds(e, o, dist) {
  if (!_rtsWxCells().length || dist <= RTS_FOGBANK.see * RTS_TILE) return true;
  return !_rtsInFogBank(e.x, e.z) && !_rtsInFogBank(o.x, o.z);
}
/* The fog banks a sight disc from (tx, tz) out to `range` cells could reach, or null for none. */
function _rtsWxBanksNear(tx, tz, range) {
  var W = _rtsWxCells(), out = null, x = _rtsWX(tx), z = _rtsWX(tz);
  for (var i = 0; i < W.length; i++) {
    if (W[i].kind !== 'fog' || Math.hypot(x - W[i].x, z - W[i].z) > W[i].r + range * RTS_TILE) continue;
    (out = out || []).push(W[i]);
  }
  return out;
}

/* The lightning's mark: the enemy under the storm, aircraft first, nearest the eye. */
var RTS_BOLT_RANK = { air: 0, vehicle: 1, struct: 2, infantry: 3 };
function _rtsBoltTarget(c) {
  var G = window._rtsG, best = null, bk = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.inside || e.side === c.side || !e.side || e.hidden) continue;
    var d = Math.hypot(e.x - c.x, e.z - c.z);
    if (d > c.r) continue;
    var kind = e.type === 'struct' ? 'struct' : (rtsUnitDef(e.def) || {}).kind;
    var k = (RTS_BOLT_RANK[kind] != null ? RTS_BOLT_RANK[kind] : 3) * 1e4 + d;
    if (k < bk) { bk = k; best = e; }
  }
  return best;
}
function _rtsWxTick(dt) {
  var G = window._rtsG, W = G.wx || [], i;
  for (i = W.length - 1; i >= 0; i--) {
    var c = W[i];
    c.t -= dt;
    if (c.t <= 0) { W.splice(i, 1); G.visDirty = 1; continue; }
    if (c.kind !== 'storm') continue;
    c.boltT -= dt;
    if (c.boltT > 0) continue;
    c.boltT += RTS_THUNDER.every;
    var hit = _rtsBoltTarget(c);
    if (!hit) continue;
    /* the kill is the caller's (capture.js counts a kill by hurtBy, as a mine's and a splash's
       are), without a source entity: a cell cannot carry the threat weighting a unit would */
    hit.hurtBy = c.side;
    _rtsDamage(hit, RTS_THUNDER.dmg, null, false);
    (G.bolts = G.bolts || []).push({ x: hit.x, z: hit.z, t: 0 });
    G.fx.push({ kind: 'boom', x: hit.x, y: 1, z: hit.z, t: 0, big: 1.4 });
    if (typeof _rtsSfx === 'function') _rtsSfx('boom', hit.x, hit.z);
  }
  /* the bolts the renderer draws, for their instant */
  if (G.bolts) for (i = G.bolts.length - 1; i >= 0; i--) if ((G.bolts[i].t += dt) > 0.35) G.bolts.splice(i, 1);
}
