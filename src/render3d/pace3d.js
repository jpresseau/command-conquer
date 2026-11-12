/* render3d/pace3d.js - keeping the frame steady when the battle is heavy. Part of rts.render3d.

   Two things made a big fight choppy that no tier switch could fix, because neither is about how
   much the frame draws:

     MODEL BUILDS     every unit model, pose and running-gear position is built the first time
                      it is seen (_r3dMesh). Measured, the first frames of a 96-unit battle built
                      27, 17, 16 and 15 models and took 193, 170, 128 and 108 ms. So in the live
                      loop a frame may spend R3D_MESH_BUDGET ms on the optional ones - a pose, a
                      roll of the tracks, a turn of a propeller - and draws the unit's base model
                      until its turn comes; and spare time in a quick frame warms the base model
                      of every unit type in the match, before it arrives on screen
     THE PIXELS       a phone that cannot fill the screen at its own resolution in a fight is
                      held to the frame by drawing fewer pixels: R3.dyn, down a step at a time
                      to R3D_DYN_STEPS' last while frames are slow AND the time is the GPU's (the
                      frame's own script is quick), back up when there is room. Only in AUTO -
                      a tier the player chose is drawn as chosen - and before the tiers: a tier
                      steps down only once the resolution can go no lower (quality3d.js)

   A spec driving frames by hand has no budget (R3.meshBudget is undefined outside the live
   loop), so its pictures are the same however fast the machine. */

var R3D_MESH_BUDGET = 4;         /* ms a live frame may spend building the optional models */
var R3D_WARM_BUDGET = 3;         /* ms of spare time a quick frame gives to warming base models */
var R3D_WARM_QUICK = 12;         /* ms: a frame quicker than this has time to spare */
var R3D_DYN_STEPS = [1, 0.85, 0.72, 0.6];
var R3D_DYN_WINDOW = 1000;       /* ms of frames judged at a time */
var R3D_DYN_SLOW = 21;           /* ms: a median frame slower than this is worth fewer pixels */
var R3D_DYN_FAST = 14.5;         /* ms: ...and quicker than this, more */
var R3D_DYN_GPU = 0.45;          /* the share of a frame that must be waiting, not scripting, to blame the pixels */

function _r3dNow() { return (window.performance || Date).now(); }

/* The live loop's frame, either side of the draw. */
function _r3dPaceBegin() {
  var R3 = window._R3D;
  if (R3 && R3.on) R3.meshBudget = R3D_MESH_BUDGET;
}
function _r3dPaceEnd(js) {
  var R3 = window._R3D;
  if (!R3 || !R3.on) return;
  R3.meshBudget = undefined;
  if (js < R3D_WARM_QUICK && !R3.lost) _r3dWarm(R3, R3D_WARM_BUDGET);   /* not into a lost context: lost3d.js */
}

/* May an optional model be built now? Spends from the frame's budget when it is; a spec's frame
   (no budget) always may. */
function _r3dMeshMay(R3) { return R3.meshBudget === undefined || R3.meshBudget > 0; }
function _r3dMeshSpent(R3, ms) { if (R3.meshBudget !== undefined) R3.meshBudget -= ms; }

/* WARM-UP: the base model of every unit type that is in the match, on every side in it -
   whole, or as the parts the renderer draws it in - one at a time out of spare frame time, at
   both of the levels a unit is drawn at near. */
function _r3dWarm(R3, ms) {
  var G = window._rtsG, R = window._rtsR;
  if (!G || !R || !R.spr) return;
  if (!R3.warmQ || R3.warmFor !== G) {
    /* WHAT EACH SIDE CAN FIELD, not every unit there is: its own army's roster, and whatever of
       another's already stands on the map in its colours. It warmed every unit type for every
       side - 376 models, 46 MB of vertex buffers and half a second of frames, most of them for
       units neither army in the match can build. One it did not warm is built on first sight,
       as any was before there was a warm-up. R3.warmAll is the before-picture. */
    var sides = {}, here = {}, q = [];
    G.ents.forEach(function (e) { if (e.side) { sides[e.side] = 1; if (e.type === 'unit' && !e.dead) here[e.side + ':' + e.def] = 1; } });
    Object.keys(sides).forEach(function (sd) {
      var army = rtsHouseSide(sd);
      RTS_UNITS.forEach(function (u) {
        var def = u.key;
        if (!R3.warmAll && !here[sd + ':' + def] && !(G.order && G.order.indexOf(sd) >= 0 && rtsBuildableBy(u, army))) return;
        var tur = R.spr.turret && R.spr.turret[sd] && R.spr.turret[sd][def], AP = RTS_AIR_PARTS[def];
        if (tur) { q.push(['u', def, sd, 'hull']); q.push(['u', def, sd, 'turret']); }
        else if (AP && AP.rotor) { q.push(['u', def, sd, 'body']); q.push(['u', def, sd, 'rotor']); }
        else if (AP && AP.prop) { q.push(['u', def, sd, 'body']); q.push(['u', def, sd, 'prop0']); }
        else q.push(['u', def, sd, null]);
      });
    });
    R3.warmQ = q; R3.warmFor = G;
  }
  /* the level this zoom draws a unit at first (render3d/unit3d.js), then the other one at the back
     of the queue, so a zoom across R3D_LOD_MID_CELL finds both built */
  var t0 = _r3dNow(), now = _r3dLodMid(R3) && !_r3dLodFar(R3) ? R3D_LOD_MID : 0;
  while (R3.warmQ.length && _r3dNow() - t0 < ms) {
    var w = R3.warmQ.shift(), lv = w.length > 4 ? w[4] : now;
    _r3dMesh(w[0], w[1], w[2], w[3], false, 0, 0, lv);
    if (w.length < 5) R3.warmQ.push(w.concat([lv ? 0 : R3D_LOD_MID]));
  }
}

/* THE PIXELS, fed by the live loop: `dt` the ms since the last frame, `js` the ms the last frame
   spent in script.

   A DESCENT IS A TRIAL, AND SO IS A STEP BACK UP. This stepped down whenever a window was slow
   and the wait was not script, and up only under R3D_DYN_FAST - and both halves were wrong on a
   phone, found by feeding it a phone's frame times:
     - held at 30 by its own power saving (every frame 33 ms, 5 of script), the wait reads as the
       GPU's: it went to 0.6 in seven seconds - a third of the pixels, three buffers remade - and
       stayed, for no frame gained
     - on a 60 Hz screen a frame is never under 16.7 ms, so 14.5 was never seen: one heavy spell
       and the picture stayed at 0.6 to the end of the match, the tiers held down with it
   So a descent remembers the frame time it started from and the step it left. A window that
   beats that by R3D_Q_GAIN keeps the step it is on; one that does not goes a step lower, since a
   display's frame times come in whole refreshes and one step may not reach the next; and at the
   last step with nothing gained it goes back where it began and waits, twice as long each time
   it is wrong (R3D_DYN_HOLD). And "fast" is measured against the quickest window the display has
   shown (D.floor), not a constant: R3D_DYN_UP windows at that pace try a step up, which is
   undone - and waited out the same way - if the next window is slow again. */
var R3D_DYN_HOLD = 20000;        /* ms a descent that gained nothing waits before another; doubled each time, to R3D_DYN_HOLD_MAX */
var R3D_DYN_HOLD_MAX = 320000;
var R3D_DYN_UP = 3;              /* windows at the display's own pace before a step up is tried */
var R3D_DYN_NEAR = 1.15;         /* within this of the quickest window seen is "at the display's pace" */
function _r3dDynFeed(dt, js, now) {
  var R3 = window._R3D;
  if (!R3 || !R3.on || _r3dQualityWant() !== 'auto' || !(dt > 0) || dt > 250) return;
  var D = R3.dynA || (R3.dynA = { t0: now + R3D_Q_SETTLE, s: [], j: [] });
  if (R3.dyn === undefined) R3.dyn = 1;
  if (now < D.t0) return;
  D.s.push(dt); D.j.push(js || 0);
  if (now - D.t0 < R3D_DYN_WINDOW) return;
  var s = D.s.slice().sort(function (a, b) { return a - b; }), j = D.j.slice().sort(function (a, b) { return a - b; });
  var med = s[s.length >> 1], mj = j[j.length >> 1];
  D.s.length = 0; D.j.length = 0; D.t0 = now;
  var gpu = med - mj > med * R3D_DYN_GPU, slow = med > R3D_DYN_SLOW && gpu, last = R3D_DYN_STEPS.length - 1;
  R3.dynBound = med > R3D_DYN_SLOW ? (gpu ? 'gpu' : 'js') : null;
  if (!(D.floor <= med)) D.floor = med;                  /* the quickest window this display has shown */
  var i = R3D_DYN_STEPS.indexOf(R3.dyn), T = D.trial;
  if (i < 0) i = 0;
  function set(k) { R3.dyn = R3D_DYN_STEPS[k]; }          /* the next frame sizes its buffer by it (_r3dResize) */
  if (R3.dynLegacy) {                                     /* the before-picture: down while slow, up only under a constant */
    if (slow && i < last) set(i + 1); else if (med < R3D_DYN_FAST && i > 0) set(i - 1);
    return;
  }
  if (T && T.down) {
    /* it paid: this step stays - and the step above is not tried at once, since the frames are quick only because of it */
    if (med < T.base * R3D_Q_GAIN) { D.trial = null; D.wait = 0; D.upHold = now + (D.upWait || R3D_DYN_HOLD); }
    else if (i < last) set(i + 1);                                            /* not yet: one more may reach the next refresh */
    else { set(T.from); D.trial = null; D.wait = Math.min(R3D_DYN_HOLD_MAX, (D.wait || R3D_DYN_HOLD / 2) * 2); D.hold = now + D.wait; }
    D.fast = 0;
    return;
  }
  if (T && T.up) {
    D.trial = null; D.fast = 0;
    if (slow) { set(T.from); D.upWait = Math.min(R3D_DYN_HOLD_MAX, (D.upWait || R3D_DYN_HOLD / 2) * 2); D.upHold = now + D.upWait; }
    else D.upWait = 0;
    return;
  }
  if (slow && i < last && !(now < D.hold)) { D.trial = { down: true, from: i, base: med }; D.fast = 0; set(i + 1); return; }
  var quick = med < R3D_DYN_FAST || med <= D.floor * R3D_DYN_NEAR;
  if (quick && !slow && i > 0 && !(now < D.upHold)) {
    D.fast = (D.fast || 0) + 1;
    if (D.fast >= R3D_DYN_UP) { D.trial = { up: true, from: i }; D.fast = 0; set(i - 1); }
  } else D.fast = 0;
}
/* Has the resolution a step left to give? While it has, a slow GPU-bound frame is its business
   and not the tiers'. */
function _r3dDynRoom(now) {
  var R3 = window._R3D, D = R3 && R3.dynA;
  /* ...not while it is waiting out a descent that gained nothing: then fewer pixels are not the
     answer, and the tiers may try theirs. `now`: the feed's clock (the live loop's) */
  if (D && D.hold > (now === undefined ? _r3dNow() : now) && !D.trial) return false;
  return !!(R3 && R3.dyn !== undefined && R3.dynBound === 'gpu' && R3.dyn > R3D_DYN_STEPS[R3D_DYN_STEPS.length - 1]);
}
