/* core/sweeper.js - the Mine Sweeper: the answer to a minefield.

   The verb is CLEARING. A mine is invisible to the side it is meant for (core/mines.js), so until
   now a minefield had no answer but to lose a tank on it. The sweeper is that answer:

     IT FINDS     every enemy mine within RTS_SWEEP.see cells of it is SEEN by its side from then
                  on (m.seen[side]) - drawn for the player like their own (render/frame.js), so
                  the rest of the column can be steered round it
     IT CLEARS    a seen mine within RTS_SWEEP.reach cells is cleared in RTS_SWEEP.clear seconds
                  - the flail beats it out - and left idle it drives to the nearest one it has
                  found, so parked at the edge of a field it works through the field by itself
     IT IS SAFE   it never sets a mine off (core/mines.js asks `sweeps`)

   The opponent buys one once a player mine has cost it a unit (_rtsAISupport, core/aimines.js),
   and sends it round the places where that happened (G.mineHits), nearest first. */

var RTS_SWEEP = { see: 4, reach: 1.5, clear: 1.5 };

function _rtsSweeps(u) { return !!(rtsUnitDef(u.def) || {}).sweeps; }
/* Refused a route a moment ago (u.noRouteT, stamped by whoever asked): do not ask again yet. The
   same breath _rtsOrderAttack takes between asks (core/orders.js RTS_REFUSED_RETRY). */
function _rtsRouteRefused(u) { return u.noRouteT != null && window._rtsG.t - u.noRouteT < RTS_REFUSED_RETRY; }

function _rtsSweepTick(dt) {
  var G = window._rtsG, M = G.mines, i, k;
  var sw = G.ents.filter(function (u) { return !u.dead && !u.inside && u.type === 'unit' && _rtsSweeps(u); });
  if (!sw.length) return;
  for (i = 0; i < sw.length; i++) {
    var u = sw[i], near = null, nd = 1e9, cleared = 0;
    for (k = 0; M && k < M.length; k++) {
      var m = M[k];
      if (m.gone || m.side === u.side) continue;
      var d = Math.hypot(_rtsWX(m.tx) - u.x, _rtsWX(m.tz) - u.z) / RTS_TILE;
      if (d <= RTS_SWEEP.see) (m.seen = m.seen || {})[u.side] = 1;
      if (!(m.seen && m.seen[u.side])) continue;
      if (m.sea) continue;                                        /* seen, but a sea mine: not its to clear */
      if (d <= RTS_SWEEP.reach) {
        m.sweep = (m.sweep || 0) + dt;
        if (m.sweep >= RTS_SWEEP.clear) {
          m.gone = true; cleared++;
          G.fx.push({ kind: 'boom', x: _rtsWX(m.tx), y: 0.5, z: _rtsWX(m.tz), t: 0, big: 0.5 });
        }
        continue;
      }
      if (d < nd) { nd = d; near = m; }
    }
    if (cleared && u.side === _rtsAIFoe()) _rtsSay(cleared === 1 ? 'Mine cleared.' : cleared + ' mines cleared.');
    /* idle, with a mine found and not yet in reach: go and beat it out. ONCE IN A WHILE WHEN
       THERE IS NO WAY: a seen mine behind a wall, or across water, refused the move, and the
       refusal left the sweeper idle - so this asked for the route again every tick, a fresh A*
       over the whole map thirty times a second for as long as the mine lay there. */
    if (near && !u.order && (!u.path || u.pi >= u.path.length) && !_rtsRouteRefused(u)) {
      _rtsOrderMove(u, _rtsWX(near.tx), _rtsWX(near.tz), false);
      if (!u.order) u.noRouteT = G.t;
    }
  }
  if (M) G.mines = M.filter(function (m) { return !m.gone; });
}

/* The opponent's sweeper: round the places a player mine cost it a unit, nearest first. */
function _rtsAISweepTick() {
  var G = window._rtsG, H = G.mineHits;
  if (!H || !H.length) return;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.inside || u.side !== _rtsAIOn || u.type !== 'unit' || !_rtsSweeps(u)) continue;
    if (u.order || (u.path && u.pi < u.path.length)) continue;           /* busy, or clearing */
    if (_rtsRouteRefused(u)) continue;                                   /* no way there just now */
    var best = null, bd = 1e9;
    for (var k = 0; k < H.length; k++) {
      var h = H[k];
      if (h.swept) continue;
      var d = Math.hypot(_rtsWX(h.tx) - u.x, _rtsWX(h.tz) - u.z);
      if (d <= RTS_TILE * 1.5) { h.swept = 1; continue; }
      if (d < bd) { bd = d; best = h; }
    }
    if (best) { _rtsOrderMove(u, _rtsWX(best.tx), _rtsWX(best.tz), false); if (!u.order) u.noRouteT = G.t; }
  }
  /* a place swept is a place done with: the list held every hit of the match, and the buy gate
     (core/aimines.js) read its length, so a sweeper was bought again for ground long since cleared */
  if (H.some(function (h) { return h.swept; })) G.mineHits = H.filter(function (h) { return !h.swept; });
}
