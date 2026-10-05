/* core/airspace.js - aircraft keep their distance, and take turns on a pad. Part of rts.core.

   AIRCRAFT WERE NEVER IN THE CROWD (core/move.js, _rtsSeparate), on purpose: the ground's shove
   kept a helicopter off its own pad. But nothing replaced it, so aircraft sent at one place -
   a target, a rally point, the pad they all go home to - ended at exactly the same point, one on
   top of another. Five Attack Helis read as one, with their rotors fanned into a star, and only
   the top one could be clicked. So aircraft keep their own distance, from aircraft only:

     THE GAP     RTS_AIR_GAP centre to centre, opened at no more than RTS_AIR_PUSH a second, so a
                 stack drifts apart rather than jumping; two at exactly the same point part along
                 a direction drawn from their ids, so the same stack always opens the same way
     THE PAD     one aircraft on it at a time. A machine already rearming is never pushed (the
                 bug the old exclusion was about), and the others wait their turn hovering beside
                 it - or go to another pad, if there is a free one (_rtsRearmPad, core/move.js). */

/* how high an aircraft is drawn above the ground it is over: its altitude, or a hop off the pad
   while it rearms - the one figure the renderer and the picking both use (render/camera.js) */
function _rtsAirLift(e) {
  if (!e.air) return 0;
  if (e.rearming > 0) return 2;
  var a = e.alt || 12;
  return e.land ? a + (RTS_AIR_SET - a) * e.land : a;
}
/* World units of height per unit of that lift: what the 3D mode draws an aircraft at, and so
   what falls from one is drawn at too - its bombs (render3d/fxemit3d.js, render/fx.js) - and
   where a click on it lands (render/camera.js). One number, because the bombs were once drawn at
   the raw altitude: three times higher than the aircraft that had just dropped them. */
var RTS_AIR_ALT_K = 0.35;

/* A CHINOOK SETS DOWN TO WAIT. Idle over open ground - nothing to fly to - it eases down to
   RTS_AIR_SET over RTS_AIR_SETTLE seconds, which is where men climb in and out, and lifts again
   the moment it has somewhere to go. `land` runs 0 (flying) to 1 (down). Over water, a wall or
   a building it hovers: there is nothing to set down on. Only a transport does this; a gunship
   waiting for a target stays in the air. A SKY CRANE WITH A LOAD STAYS UP: the load hangs under
   its legs, so setting down would stand the crane on its own cargo; it comes down once the hook
   is empty. */
var RTS_AIR_SET = 1.2, RTS_AIR_SETTLE = 1.5;
function _rtsAirSettle(e, dt) {
  var d = rtsUnitDef(e.def) || {};
  if (!d.carries || d.paradrops) return;     /* a Paradrop Plane never sets down: core/paradrop.js */
  var idle = !e.order && (!e.path || e.pi >= e.path.length), tx = _rtsTX(e.x), tz = _rtsTX(e.z);
  var slung = d.slings && e.cargo && e.cargo.length > 0;
  var want = idle && !slung && _rtsInB(tx, tz) && !_rtsBlocked(tx, tz) ? 1 : 0, l = e.land || 0;
  if (want > l) e.land = Math.min(1, l + dt / RTS_AIR_SETTLE);
  else if (want < l) e.land = Math.max(0, l - dt / RTS_AIR_SETTLE);
}

var RTS_AIR_GAP = RTS_TILE * 1.6;          /* a rotor disc and a little air */
var RTS_AIR_PUSH = 6;                      /* world units a second, at the most */
var RTS_PAD_WAIT = RTS_TILE * 2.6;         /* how near a busy pad its queue hovers */

/* is someone other than `e` already on this pad? */
function _rtsPadBusy(pad, e) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o !== e && !o.dead && o.air && o.rearming > 0 && Math.hypot(o.x - pad.x, o.z - pad.z) <= RTS_TILE * 1.4) return true;
  }
  return false;
}

function _rtsAirSpread(dt) {
  /* the map's own edges: world coordinates are centred on the middle of the map */
  var G = window._rtsG, air = [], i, j, lo = _rtsWX(0), hi = _rtsWX(RTS_N - 1);
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && !e.inside && e.type === 'unit' && e.air) { air.push(e); _rtsAirSettle(e, dt); }
  }
  for (i = 0; i < air.length; i++) for (j = i + 1; j < air.length; j++) {
    /* on the pad, or set down on the ground: either way it holds and the other gives way */
    var a = air[i], b = air[j], ha = a.rearming > 0 || a.land > 0.5, hb = b.rearming > 0 || b.land > 0.5;
    if (ha && hb) continue;
    var dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= RTS_AIR_GAP) continue;
    if (d < 1e-3) { var ang = ((a.id || i) * 2.399 + (b.id || j) * 0.737) % (Math.PI * 2); dx = Math.cos(ang); dz = Math.sin(ang); d = 0; }
    else { dx /= d; dz /= d; }
    var step = Math.min((RTS_AIR_GAP - d) * 0.5, RTS_AIR_PUSH * dt);
    /* the one on the pad holds; whoever it is crowding takes the whole step */
    var sa = ha ? 0 : (hb ? 2 : 1), sb = hb ? 0 : (ha ? 2 : 1);
    a.x -= dx * step * sa; a.z -= dz * step * sa;
    b.x += dx * step * sb; b.z += dz * step * sb;
  }
  for (i = 0; i < air.length; i++) {
    air[i].x = Math.max(lo, Math.min(hi, air[i].x)); air[i].z = Math.max(lo, Math.min(hi, air[i].z));
  }
}
