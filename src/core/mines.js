/* core/mines.js - the Mine Layer's mines: laid, armed, hidden, and set off.

   The Mine Layer's verb is DENIAL: a road, a ford or a gap in a wall that the enemy will pay to
   cross. A mine is not an entity - nothing targets it, it does not count toward anyone's base,
   and the structure loop would otherwise tick it - so it lives in G.mines beside the crates,
   and is saved with the rest of G.

   A mine belongs to the side that laid it. It ARMS a moment after it goes down, so the layer
   can drive off its own mine, and from then on it is set off by the first ENEMY ground unit -
   vehicle or infantry - to stand on its cell. Aircraft pass over. That unit takes the charge;
   the blast round it is an ordinary splash, so it can hurt anything beside it, the layer's own
   side included: it is a mine. A side sees only its own mines (_rtsMineShown). */

var RTS_MINE = {
  dmg: 380,          /* to what set it off: most of a Battle Tank, all of a squad */
  splash: 120,       /* ...and a blast round it for whatever stands beside */
  radius: 5,         /* world units - a little over a cell */
  arm: 1.5,          /* seconds before a fresh mine will go off */
  restock: 4         /* seconds a Repair Bay takes to load one mine back onto a layer */
};

function _rtsMinesLeft(e) {
  var d = rtsUnitDef(e.def);
  if (!d || !d.mines) return 0;
  if (e.mines == null) e.mines = d.mines;
  return e.mines;
}
function _rtsMineAt(tx, tz) {
  var G = window._rtsG;
  if (!G.mines) return null;
  for (var i = 0; i < G.mines.length; i++) if (G.mines[i].tx === tx && G.mines[i].tz === tz) return G.mines[i];
  return null;
}
/* Lay one where the layer stands. False, and the player told why, when it cannot. */
function _rtsLayMine(e) {
  var G = window._rtsG, tx = _rtsTX(e.x), tz = _rtsTX(e.z);
  if (!G.mines) G.mines = [];
  if (_rtsMinesLeft(e) <= 0) { if (e.side === 'player') _rtsSay('Out of mines - a Repair Bay will restock it.'); return false; }
  if (_rtsMineAt(tx, tz)) { if (e.side === 'player') _rtsSay('There is already a mine here.'); return false; }
  if (!_rtsInB(tx, tz) || G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER) return false;
  G.mines.push({ tx: tx, tz: tz, side: e.side, arm: RTS_MINE.arm });
  e.mines--;
  if (e.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('place', e.x, e.z);
  return true;
}
/* What a side may see: its own mines, and nobody else's. */
function _rtsMineShown(m, side) { return m.side === (side || 'player'); }

function _rtsMineTick(dt) {
  var G = window._rtsG;
  if (!G.mines || !G.mines.length) return;
  var armed = {}, n = 0, i;
  for (i = 0; i < G.mines.length; i++) {
    var m = G.mines[i];
    if (m.arm > 0) { m.arm -= dt; continue; }
    armed[_rtsIdx(m.tx, m.tz)] = m; n++;
  }
  if (!n) return;
  for (i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.type !== 'unit' || u.air || u.inside) continue;
    var hit = armed[_rtsIdx(_rtsTX(u.x), _rtsTX(u.z))];
    if (!hit || hit.side === u.side || hit.gone) continue;
    hit.gone = true;
    var x = _rtsWX(hit.tx), z = _rtsWX(hit.tz);
    /* Under the unit, not beside it: the one that set it off takes the whole charge wherever
       in the cell it stood - a splash alone falls off so steeply that a tank on the edge of
       the cell took a fifth of it. The blast round it is a splash, and spares that unit. */
    u.hurtBy = hit.side;
    _rtsDamage(u, RTS_MINE.dmg, null);
    _rtsSplash(x, z, RTS_MINE.radius, RTS_MINE.splash, hit.side, 1, u);
    G.fx.push({ kind: 'boom', x: x, y: 1, z: z, t: 0, big: 1.3 });
    G.shake = Math.max(G.shake || 0, 0.5);
    if (typeof _rtsSfx === 'function') _rtsSfx('boom', x, z);
    if (u.side === 'player') _rtsSay('Mine!');
  }
  G.mines = G.mines.filter(function (m) { return !m.gone; });
}
/* A Repair Bay loads mines back onto a layer parked on it, one every RTS_MINE.restock seconds. */
function _rtsMineRestock(v, dt) {
  var d = rtsUnitDef(v.def);
  if (!d || !d.mines || _rtsMinesLeft(v) >= d.mines) return;
  v.mineT = (v.mineT || 0) + dt;
  if (v.mineT >= RTS_MINE.restock) { v.mineT = 0; v.mines++; }
}
