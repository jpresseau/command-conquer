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
/* Lay one where the layer stands - or on a cell beside it, which is how the opponent's layer
   puts one exactly on its planned cell when a move order stops it a cell short (aimines.js).
   False, and the player told why, when it cannot. */
function _rtsLayMine(e, atx, atz) {
  var G = window._rtsG, tx = _rtsTX(e.x), tz = _rtsTX(e.z);
  if (atx != null) {
    if (Math.abs(atx - tx) > 1 || Math.abs(atz - tz) > 1) return false;
    tx = atx; tz = atz;
  }
  if (!G.mines) G.mines = [];
  if (_rtsMinesLeft(e) <= 0) {
    if (e.side === 'player') _rtsSay(rtsUnitDef(e.def).sea ? 'Out of mines - bring it alongside your shipyard to restock.' : 'Out of mines - a Repair Bay will restock it.');
    return false;
  }
  if (_rtsMineAt(tx, tz)) { if (e.side === 'player') _rtsSay('There is already a mine here.'); return false; }
  /* on ground, or - from a Mine Boat (core/seamines.js) - on water, and nowhere else; and never
     on a bridge's deck, which is water underneath and a road on top */
  var sea = !!rtsUnitDef(e.def).sea, ci = _rtsInB(tx, tz) ? _rtsIdx(tx, tz) : -1;
  if (ci < 0 || (G.terrain[ci] === RTS_T_WATER) !== sea || (sea && _rtsIsBridgeCell(ci))) {
    /* and the player told why, as the other refusals tell: D on a deck or a dried flat did
       nothing at all, which read as a broken key */
    if (e.side === 'player') _rtsSay(sea ? 'Mines go in open water - not under a bridge.' : 'Mines go in the ground - not on a deck, nor on the flats.');
    return false;
  }
  G.mines.push({ tx: tx, tz: tz, side: e.side, arm: RTS_MINE.arm, sea: sea });
  e.mines--;
  if (e.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('place', e.x, e.z);
  return true;
}
/* What a side may see: its own mines, and those a Mine Sweeper of its has found (core/sweeper.js). */
function _rtsMineShown(m, side) { side = side || 'player'; return m.side === side || !!(m.seen && m.seen[side]); }

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
    if (hit && (rtsUnitDef(u.def) || {}).sweeps) continue;      /* a Mine Sweeper never sets one off */
    if (!hit || hit.side === u.side || hit.gone) continue;
    /* A SEA MINE GOES OFF UNDER WHAT FLOATS - a hull, a hovercraft - and a land mine under what
       walks or drives, the hovercraft again. A tank crossing a flat the tide has dried, or a
       bridge, is not afloat over the mine under it; a hull is never over a land mine at all. */
    var dom = _rtsDomainOf(u);
    if (hit.sea ? !dom : (dom && dom !== 'hover')) continue;
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
    /* where a mine on land cost a side a unit - the opponent's sweeper goes there (core/sweeper.js) */
    if (u.side === 'enemy' && !hit.sea) (G.mineHits = G.mineHits || []).push({ tx: hit.tx, tz: hit.tz });
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
