/* core/move.js - getting there: aircraft, path requests, steering and unit separation.
   Part of rts.core, the simulation. */

function _rtsRearmPad(e) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var b = G.ents[i];
    if (b.dead || b.building || b.type !== 'struct' || b.side !== e.side) continue;
    if (!(rtsStructDef(b.def) || {}).rearm) continue;
    var dd = Math.hypot(b.x - e.x, b.z - e.z);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}
function _rtsAirTick(e, dt, d) {
  if (!e.air) return false;
  /* topping up on the pad */
  if (e.rearming > 0) {
    e.rearming -= dt;
    if (e.rearming <= 0) { e.ammo = d.ammo || 0; e.rearming = 0; e.order = null; e.target = null; }
    return true;                                   /* it does nothing else while reloading */
  }
  if (e.ammo > 0) return false;
  var pad = _rtsRearmPad(e);
  if (!pad) {
    /* nowhere to go: it has to crash */
    _rtsDamage(e, e.hp + 1, null, false);
    return true;
  }
  e.target = null;
  if (Math.hypot(pad.x - e.x, pad.z - e.z) <= RTS_TILE * 1.4) {
    e.path = null; e.goal = null; e.rearming = d.rearm || 6;
    return true;
  }
  if (!e.path || !e.goal || Math.hypot(pad.x - e.goal.x, pad.z - e.goal.z) > RTS_TILE) {
    e.order = 'rearm'; e.goal = { x:pad.x, z:pad.z };
    e.path = _rtsPathFor(e, pad.x, pad.z); e.pi = 0;
  }
  /* TRUE, not false. An aircraft on its way home has to own the tick: returning false let the
     ordinary unit logic run straight afterwards and overwrite the course, so the helicopter
     sat where it was with an empty rack and a pad it never flew to. It was the assertion that
     said so - the pad lookup and the crash rule both passed on their own. */
  return true;
}

/* An aircraft does not use the pathfinder at all. Terrain, walls and other units are all
   irrelevant to it, so its "route" is the single waypoint it is heading for and it flies
   straight there. Routing every path request through here means no call site has to remember
   which kind of unit it is holding. */
function _rtsPathFor(e, gx, gz) {
  if (e && e.air) return [{ x:gx, z:gz }];
  /* A ship asks the same pathfinder a different question - see _rtsBlocked. Routed through
     here for the same reason the aircraft case is: no call site should have to know. */
  return _rtsPath(e.x, e.z, gx, gz, _rtsDomainOf(e));
}

/* --------------------------------------------------------- unit update */
function _rtsSteer(e, dt, d) {
  /* Follow the current path with a capped turn rate, then push apart from neighbours.
     Separation runs after movement so units settle into a loose formation instead of
     stacking into a single point. */
  if (!e.path || e.pi >= e.path.length) { e.path = null; return false; }
  var wp = e.path[e.pi], dx = wp.x - e.x, dz = wp.z - e.z, dist = Math.hypot(dx, dz);
  var last = (e.pi === e.path.length - 1);
  if (dist < (last ? d.r * 0.9 + 0.4 : RTS_TILE * 0.55)) {
    e.pi++;
    if (e.pi >= e.path.length) { e.path = null; return false; }
    return true;
  }
  var want = Math.atan2(dz, dx), diff = want - e.rot;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  var turn = Math.min(Math.abs(diff), d.turn * dt) * (diff < 0 ? -1 : 1);
  e.rot += turn;
  /* a vehicle slows while it is still swinging round; infantry just walk */
  var align = Math.max(0, 1 - Math.abs(diff) / 1.6);
  var sp = d.speed * (d.kind === 'infantry' ? Math.max(0.35, align) : align * align);
  sp *= _rtsBias(e.side).speed;                    /* GroundspeedBias */
  sp *= rtsCrateMult(e, 'speed');
  if (e.prone) sp *= RTS_PRONE_SPEED;
  var nx = e.x + Math.cos(e.rot) * sp * dt, nz = e.z + Math.sin(e.rot) * sp * dt;
  /* THE UNIT'S OWN DOMAIN, and both of the tests below have to ask in it. They used to ask in
     the land domain whatever was moving, and for a ship that is not a small error - it is the
     whole of naval movement.

     Water carries blocked=2 (terrain), so a hull sitting in open water read as standing on a
     blocked tile, which set `freeing` and turned the step test off ENTIRELY. A gunboat ordered
     at the beach sailed up it and parked on dry land; nothing in its way - cliffs, buildings,
     the shore itself - was ever consulted again. Measured before the fix: ordered from water at
     87,80 to land at 81,76, it arrived, on the land tile.

     The slide fallback three lines down had the domain right all along, which is what made this
     survive: the one path that could have caught a ship crossing a coastline was the one path a
     ship never reached. */
  var dom = _rtsDomainOf(e);
  /* While standing on a blocked tile, movement is unrestricted - that is how a unit
     extracts itself from a footprint it ended up inside. Blocking it here as well would
     make the escape waypoint unreachable and re-trap it. */
  var freeing = _rtsBlocked(_rtsTX(e.x), _rtsTX(e.z), dom);
  /* Nothing on the ground is in an aircraft's way - not walls, not cliffs, not the footprint
     of the very pad it is trying to land on. That last one is what actually bit: a helicopter
     flew home, stopped dead 5.9 world units out (the pad's half-width plus its own radius) and
     hovered there with an empty rack, because the ordinary "is that cell blocked" test was
     refusing to let it over the building. */
  if (!e.air && !freeing && _rtsBlocked(_rtsTX(nx), _rtsTX(nz), dom)) {
    /* SLIDE ALONG THE WALL BEFORE GIVING UP ON THE STEP. The step is tested as one movement, so
       a diagonal that clips a blocked cell was refused entirely even when moving along a single
       axis was perfectly legal - the unit ground to a halt against a corner it could have walked
       past. Try each axis on its own first; taking the free one is what a unit brushing a wall
       should do, and it is also the difference between a wedge that recovers and one that lasts
       the rest of the match. Defence in depth for the clear-line fix above, not a substitute:
       fixing only this would leave A* still handing out impossible straight lines. */
    var domS = dom;
    var slid = false;
    if (!_rtsBlocked(_rtsTX(nx), _rtsTX(e.z), domS)) { e.x = nx; slid = true; }
    else if (!_rtsBlocked(_rtsTX(e.x), _rtsTX(nz), domS)) { e.z = nz; slid = true; }
    /* A SLIDE IS NOT PROGRESS, so the stuck timer keeps running through it. Zeroing it here was
       a regression of mine that the control assertion in test/e2e/pathing caught: a unit
       brushing a long wall slid along it happily for ever, never accumulating enough `stuck` to
       repath, and one ordinary order in four stopped completing - ending 45 world units from a
       goal it used to reach. Sliding buys a step out of a corner; it must not also buy silence
       from the repath below. */
    e.stuck = (e.stuck || 0) + dt;
    if (slid && e.stuck <= 0.5) return true;
    /* Repath to the FINAL destination, not to the waypoint we happen to be blocked on.
       Repathing to the waypoint loses the real goal: a unit whose path was cut short (e.g.
       it started inside a footprint and only got an escape waypoint) would otherwise spend
       forever re-targeting the tile it is already standing on. */
    if (e.stuck > 0.5) {
      var g = e.goal || wp;
      e.path = _rtsPathFor(e, g.x, g.z); e.pi = 0; e.stuck = 0;
    }
    /* Last-resort unstick. A unit can end up genuinely wedged - pinned against a footprint
       by the units behind it, with every forward step blocked and every repath returning the
       same blocked line. After a few seconds of getting nowhere, lift it to the nearest open
       tile. Bounded and rare, and it beats a unit that ignores orders for the rest of the
       match; every real RTS has some version of this. */
    e.jam = (e.jam || 0) + dt;
    if (e.jam > 3) {
      /* IN THE UNIT'S OWN DOMAIN. Without it this lifted a wedged unit to the nearest tile
         that was open ON LAND - and for a ship pressed against a coastline, wedged is the
         normal state of being ordered somewhere it cannot go. It was teleported onto the
         beach three seconds later. That is how a gunboat ordered at the shore ended up parked
         on sand even after the step test was taught about water: the step refused every
         move, the refusals fed the jam timer, and the unstick then did what the step had just
         forbidden. A rescue hatch has to obey the same rule as the door. */
      var open = _rtsNearestOpen(_rtsTX(e.x), _rtsTX(e.z), 6, dom);
      if (open) { e.x = _rtsWX(open[0]); e.z = _rtsWX(open[1]); }
      e.jam = 0; e.stuck = 0;
      var g2 = e.goal || wp;
      e.path = _rtsPathFor(e, g2.x, g2.z); e.pi = 0;
    }
    return true;
  }
  e.stuck = 0; e.jam = 0; e.x = nx; e.z = nz;
  return true;
}
function _rtsSeparate(dt) {
  var G = window._rtsG, i, j;
  var buckets = {}, cell = RTS_TILE * 2;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.inside || e.type !== 'unit') continue;
    /* Aircraft are not in the crowd. They share no space with anything on the ground, and
       leaving them in this pass was what stopped a helicopter ever reaching its pad: the
       separation step shoved it back out to about six world units every time it closed, so it
       hovered just off the apron with an empty rack forever. */
    if (e.air) continue;
    /* Ships crowd only with ships. A gunboat and a tank can never occupy the same cell - one
       is on water and the other cannot be - so putting them in one bucket makes them shove
       each other through a shoreline they should not be able to cross. Same shape of mistake
       as leaving aircraft in this pass, which is what kept a helicopter off its own pad. */
    var dom = _rtsDomainOf(e) || 'land';
    var k = dom + ':' + ((e.x / cell) | 0) + ':' + ((e.z / cell) | 0);
    (buckets[k] || (buckets[k] = [])).push(e);
  }
  for (var key in buckets) {
    var parts = key.split(':'), kd = parts[0], bx = +parts[1], bz = +parts[2], near = [];
    for (var ox = -1; ox <= 1; ox++) for (var oz = -1; oz <= 1; oz++) {
      var b = buckets[kd + ':' + (bx + ox) + ':' + (bz + oz)];
      if (b) near = near.concat(b);
    }
    var mine = buckets[key];
    for (i = 0; i < mine.length; i++) {
      var a = mine[i];
      for (j = 0; j < near.length; j++) {
        var o = near[j];
        if (o === a || o.dead) continue;
        var dx = a.x - o.x, dz = a.z - o.z, d2 = dx * dx + dz * dz, min = a.r + o.r;
        if (d2 >= min * min || d2 < 1e-6) continue;
        var d = Math.sqrt(d2), push = (min - d) * 0.5;
        var ux = dx / d * push, uz = dz / d * push;
        var ax = a.x + ux, az = a.z + uz;
        /* If a is already standing on a blocked tile, take the push unconditionally - it is
           trying to get out. Refusing it there is what leaves the odd unit jammed inside a
           footprint while its neighbours shove it back in every frame.

           ASKED IN THE PUSHED UNIT'S OWN DOMAIN, for the same reason _rtsSteer has to: water is
           blocked ground, so every hull afloat looked to this test like a unit stuck inside a
           building and took every shove unconditionally - including the ones that put it on the
           beach. Two ships crowding each other could walk one of them ashore with no order
           given, and once ashore the same test kept it "escaping" and it never came back. */
        var domA = _rtsDomainOf(a);
        if (_rtsBlocked(_rtsTX(a.x), _rtsTX(a.z), domA) ||
            !_rtsBlocked(_rtsTX(ax), _rtsTX(az), domA)) { a.x = ax; a.z = az; }
      }
    }
  }
}
