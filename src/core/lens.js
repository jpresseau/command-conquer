/* core/lens.js - THE LENS BEAM: towers that pool their shots, and a tank whose shot forks.

   A Lens Tower that fires gathers the idle towers around it. Any Lens Tower of the same side,
   finished, with its own gun ready (`cool` run out), within RTS_LENS.relay cells of the firing
   tower OR of a tower already gathered, relays into it: so a line of towers passes the light
   down the line, and the firing tower's beam grows by RTS_LENS.add of itself per relay, up to
   RTS_LENS.max of them. Every relay then waits a full reload, which is the price - a cluster
   spends all of itself on one target, and a cluster facing several targets at once is only as
   strong as its towers one at a time. Power is already settled by then: _rtsFire refuses an
   unpowered tower before it gets here, and power is the side's, so its relays have it too.

   A Lens Tank's beam strikes its target and then forks onto up to RTS_LENS.forks of the enemies
   standing within RTS_LENS.fork cells of it, nearest first, each taking RTS_LENS.share of the
   shot through its own armour. Never a friend, never the target twice, never what the beam
   cannot reach (an aircraft, a submarine under water), and never someone inside a transport.

   Both draw `beam` effects (render3d/fxemit3d.js): relay to relay to the firing tower, and
   target to each fork. */
var RTS_LENS = { relay: 8, max: 6, add: 0.5, fork: 3, forks: 4, share: 0.5,
                 towerY: 5.0, tankY: 1.7 };          /* where the lens sits, above the ground (sprites/lens.js) */

/* The shot itself, from the lens: a tower's crown or a tank's turret, to the target. */
function _rtsLensBeamFx(e, tgt) {
  var st = e.type === 'struct';
  return { kind: 'beam', x: e.x, y: st ? RTS_LENS.towerY : RTS_LENS.tankY, z: e.z, x2: tgt.x, y2: 1.3, z2: tgt.z, t: 0, lens: st ? 1.3 : 1 };
}

/* The towers that relay into `e`'s shot, each as { o, to }: the tower and the one it passes its
   light to. Kept in a local list rather than on the entities, which a save writes out whole. */
function _rtsLensRelays(e) {
  var G = window._rtsG, out = [], from = [e], took = [], i, j, o, R = RTS_LENS.relay * RTS_TILE;
  for (i = 0; i < from.length && out.length < RTS_LENS.max; i++) {
    for (j = 0; j < G.ents.length && out.length < RTS_LENS.max; j++) {
      o = G.ents[j];
      if (o === e || o.dead || o.type !== 'struct' || o.def !== e.def || o.side !== e.side) continue;
      if (o.building > 0 || o.cool > 0 || took.indexOf(o) >= 0) continue;
      if (Math.hypot(o.x - from[i].x, o.z - from[i].z) > R) continue;
      took.push(o); from.push(o);
      out.push({ o: o, to: from[i] });
    }
  }
  return out;
}
/* Gather the relays for one shot: they spend their reload and draw their beams, and the shot's
   damage multiplier comes back. */
function _rtsLensRelay(e, w) {
  var G = window._rtsG, rs = _rtsLensRelays(e), bias = _rtsBias(e.side);
  for (var i = 0; i < rs.length; i++) {
    var r = rs[i].o, to = rs[i].to;
    r.cool = w.cool * bias.rof;
    r.fire = 0.09;
    G.fx.push({ kind: 'beam', x: r.x, y: RTS_LENS.towerY, z: r.z, x2: to.x, y2: RTS_LENS.towerY, z2: to.z, t: 0, lens: 1 });
  }
  return 1 + RTS_LENS.add * rs.length;
}
/* The enemies a forking beam goes on to from `tgt`, nearest first. */
function _rtsLensForks(e, tgt, w) {
  var G = window._rtsG, R = RTS_LENS.fork * RTS_TILE, near = _rtsSpNear(tgt.x, tgt.z, R) || G.ents, c = [];
  for (var i = 0; i < near.length; i++) {
    var o = near[i];
    if (o === tgt || o.dead || o.inside || o.hidden || o.air || o.def === 'wall') continue;
    if (!_rtsHostile(o.side, e.side) || !_rtsWeaponReaches(w, o)) continue;
    if (o.type === 'unit' && (rtsUnitDef(o.def) || {}).kind === 'air') continue;
    var d = Math.hypot(o.x - tgt.x, o.z - tgt.z);
    if (d <= R) c.push({ o: o, d: d, i: i });
  }
  c.sort(function (a, b) { return a.d - b.d || a.i - b.i; });
  return c.slice(0, RTS_LENS.forks).map(function (k) { return k.o; });
}
/* `raw` is the shot before the target's armour: each fork takes its share through its own. */
function _rtsLensFork(e, tgt, w, raw) {
  var G = window._rtsG, fs = _rtsLensForks(e, tgt, w);
  for (var i = 0; i < fs.length; i++) {
    var o = fs[i];
    G.fx.push({ kind: 'beam', x: tgt.x, y: 1.3, z: tgt.z, x2: o.x, y2: 1.3, z2: o.z, t: 0, lens: 0.6 });
    _rtsDamage(o, raw * RTS_LENS.share * rtsVerses(w, o), e);
  }
  return fs.length;
}
