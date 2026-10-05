/* ui/input.js - binding pointer, touch and keyboard input, and what each key does.
   Part of rts.ui, which owns the DOM. */

/* --------------------------------------------------------------- input */
/* THE RADAR'S ORDER, for `mine` (the player's selected units) at world point w: attack what stands
   there if the cell has been explored, otherwise move - with the same two readings a right-click
   on the field gives a loaded transport (ui/select.js): sent at the enemy or at dry land, a
   Paradrop Plane, a Sky Crane or a landing craft is being told where to put its load down, not to
   hover there with it. The radar is the advertised way to order across the map, and it was the
   one route that gave the plane a plain move. Its own function so a spec can ask it. */
function _rtsRadarOrder(mine, w, attackMove) {
  var G = window._rtsG, tx = _rtsTX(w.x), tz = _rtsTX(w.z), i;
  if (!_rtsInB(tx, tz)) return false;
  var mapped = !!G.mapped[_rtsIdx(tx, tz)];
  /* Pick out anything standing there, but only if the cell has been explored. */
  var tgt = null;
  if (mapped) {
    for (i = 0; i < G.ents.length; i++) {
      var o = G.ents[i];
      if (o.dead || o.inside || o.side === 'player') continue;
      if (o.type === 'struct') {
        var sd = rtsStructDef(o.def);
        if (tx >= o.tx && tx < o.tx + sd.w && tz >= o.tz && tz < o.tz + sd.h) { tgt = o; break; }
      } else if (_rtsTX(o.x) === tx && _rtsTX(o.z) === tz) { tgt = o; break; }
    }
  }
  if (tgt) {
    var drops = 0;
    for (i = 0; i < mine.length; i++) {
      var mu = mine[i], md = rtsUnitDef(mu.def);
      if (!md.weapon && _rtsIsTransport(mu) && _rtsCargoCount(mu) && _rtsOrderUnloadAt(mu, tgt.x, tgt.z)) drops++;
      else _rtsOrderAttack(mu, tgt);
    }
    _rtsFlash(tgt.x, tgt.z, drops === mine.length ? 'harvest' : 'attack');
  } else {
    var onScrap = mapped && G.scrap[_rtsIdx(tx, tz)] > 0, onWater = G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER;
    var spread = _rtsFormation(mine.length);
    for (i = 0; i < mine.length; i++) {
      var u = mine[i], ud = rtsUnitDef(u.def);
      if (ud.harvest && onScrap) { _rtsOrderHarvest(u, tx, tz); continue; }
      if ((ud.sea || ud.air) && ud.carries && !onWater && _rtsCargoCount(u)
          && _rtsOrderUnloadAt(u, w.x + spread[i].x, w.z + spread[i].z)) continue;
      _rtsOrderMove(u, w.x + spread[i].x, w.z + spread[i].z, attackMove);
    }
    _rtsFlash(w.x, w.z, onScrap ? 'harvest' : 'move');
  }
  return true;
}

function _rtsBindInput() {
  var cv = document.getElementById('rtsCv'), U = window._rtsUI;
  cv.oncontextmenu = function (e) { e.preventDefault(); return false; };
  cv.onmousedown = function (e) {
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    /* the order - or, with the repair/sell cursor up, dropping it - waits for the release: a
       right button that DRAGS is grabbing the map (ui/navigate.js), and only the release can
       tell the two apart */
    /* in 3D the middle button, or Alt with the right, turns the camera instead (ui/orbit.js) */
    if (e.button === 2) { _rtsGrabStart(2, mx, my, e.altKey && _rtsIn3D()); return; }
    if (e.button === 1) { e.preventDefault(); _rtsGrabStart(1, mx, my, _rtsIn3D()); return; }
    /* a left press while a grab holds the pointer may be anywhere - over the sidebar, off the
       battlefield - and still arrive here: it is not a click on the ground at those numbers */
    if (U.grab) return;
    if (U.superArm) { _rtsSuperClick(mx, my); return; }
    if (U.mode) { _rtsModeClick(mx, my); return; }
    if (U.place) { _rtsTryPlace(mx, my); return; }
    U.drag = { x0:mx, y0:my, x1:mx, y1:my, add:e.shiftKey || e.ctrlKey, moved:false };
  };
  /* A GRAB KEEPS THE POINTER: with it captured, the drag goes on over the sidebar and the
     release comes back here, instead of the view stopping dead at the canvas's edge. Letting go
     out there, the browser sends the mouseleave it held back, so the edge scroll stays off
     (e2e/navigate). */
  cv.onpointerdown = function (e) {
    if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) {
      try { cv.setPointerCapture(e.pointerId); } catch (_e) {}
    }
  };
  cv.onmousemove = function (e) {
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    U.mouse.x = mx; U.mouse.y = my; U.mouse.over = true;
    if (U.grab) {
      /* a release the page never heard (the window lost focus mid-drag) is still a release */
      if (e.buttons !== undefined && !(e.buttons & (U.grab.button === 2 ? 2 : 4))) _rtsGrabEnd();
      else _rtsGrabMove(mx, my);
    }
    if (U.drag) { U.drag.x1 = mx; U.drag.y1 = my;
      if (Math.abs(mx - U.drag.x0) > 4 || Math.abs(my - U.drag.y0) > 4) U.drag.moved = true; }
    if (U.place) {
      var p = _rtsGroundAt(mx, my);
      if (p) { var def = rtsStructDef(U.place);
        var tx = _rtsTX(p.x) - ((def.w / 2) | 0), tz = _rtsTX(p.z) - ((def.h / 2) | 0);
        _rtsGhostMove(tx, tz, _rtsCanPlace('player', U.place, tx, tz)); }
    }
  };
  cv.onmouseleave = function () { U.mouse.over = false; };
  cv.onmouseup = function (e) {
    if (e.button === 1 || e.button === 2) {
      var gb = U.grab && U.grab.button === e.button ? _rtsGrabEnd() : null;
      /* a right press that never dragged is the order it always was, as it was pressed */
      if (gb && gb.button === 2 && !gb.moved) _rtsGrabClick(gb);
      else if (gb && gb.button === 1 && !gb.moved && gb.orbit) _rtsOrbitReset();   /* middle-click */
      if (e.button === 2) U.drag = null;
      return;
    }
    if (!U.drag) return;
    var dg = U.drag; U.drag = null;
    if (dg.moved) _rtsBoxSelect(dg);
    else _rtsClickSelect(dg.x0, dg.y0, dg.add);
  };
  cv.onwheel = function (e) {
    e.preventDefault();
    /* Toward the point under the cursor, gliding between the ladder's rungs - ui/navigate.js. */
    var r = cv.getBoundingClientRect(), quiet = !(e.timeStamp - (U.wheelT || -1e9) < RTS_WHEEL_QUIET);
    U.wheelT = e.timeStamp;
    if (e.ctrlKey) U.ctrlWheelT = e.timeStamp;
    var md = e.deltaMode, dy = Math.abs(e.deltaY);    /* the mode read first: see _rtsWheelRungs */
    _rtsZoomToward(_rtsWheelRungs(e, quiet, U.wheelNotch), e.clientX - r.left, e.clientY - r.top);
    if (quiet) U.wheelNotch = md === 0 && dy >= RTS_WHEEL_MIN ? dy : 0;   /* this gesture's click size */
  };
  /* SAFARI ON A MAC pinches with GestureEvents, and left alone they magnify the whole page. A
     touchscreen has its pinch in the touch handlers below, and a browser that also sends the
     pinch as a ctrl-wheel has it there, so this acts only when neither did. */
  var gs = 1;
  cv.addEventListener('gesturestart', function (e) { e.preventDefault(); gs = e.scale || 1; });
  cv.addEventListener('gesturechange', function (e) {
    e.preventDefault();
    var sc = e.scale || 1, r = cv.getBoundingClientRect();
    if ('ontouchstart' in window || e.timeStamp - (U.ctrlWheelT || -1e9) < 250) { gs = sc; return; }
    _rtsZoomToward(Math.log(sc / gs) / Math.LN2, e.clientX - r.left, e.clientY - r.top);
    gs = sc;
  });
  var mini = document.getElementById('rtsMini');
  function miniWorld(e) {
    var r = mini.getBoundingClientRect();
    var fx = (e.clientX - r.left) / r.width, fz = (e.clientY - r.top) / r.height;
    var span = RTS_N * RTS_TILE;
    return { x:(fx - 0.5) * span, z:(fz - 0.5) * span };
  }
  function miniGo(e) {
    if (!_rtsRadarLit()) return;          /* a dark panel commands nothing and jumps nowhere */
    var w = miniWorld(e);
    _rtsR.focus.x = w.x; _rtsR.focus.z = w.z;
    _rtsClampFocus();
  }
  /* RADAR.CPP's RTacticalClass::Action: a click on the radar with units selected ISSUES AN
     ORDER, it does not move the view. That is how you commit an army across the map without
     scrolling to it. Only a restricted set of actions is allowed from the radar - MOVE,
     NOMOVE, ATTACK, ENTER, CAPTURE, SABOTAGE - and anything else falls through to nothing.

     Two deliberate differences. RA puts the order on the LEFT button because its right button
     toggles radar zoom; this game has no radar zoom and already uses right-click as the one
     context-sensitive order button everywhere else, so the order stays on the right and the
     left button keeps moving the view. Consistency with the rest of this game's input beats
     matching a binding whose other half does not exist here.

     The shroud rule is kept exactly: `shadow = !IsMapped` means an unexplored cell cannot be
     targeted, only moved to. */
  function miniOrder(e) {
    var G = window._rtsG;
    if (!G || G.over) return false;
    if (!_rtsRadarLit()) { _rtsSay('No radar — build a Radar Post to command from the map.'); return false; }
    var mine = [], i;
    for (i = 0; i < G.sel.length; i++) {
      var sv = G.sel[i];
      if (sv && !sv.dead && !sv.inside && sv.side === 'player' && sv.type === 'unit') mine.push(sv);
    }
    if (!mine.length) return false;
    var w = miniWorld(e);
    if (!_rtsRadarOrder(mine, w, !!U.attackMove)) return false;
    if (typeof _rtsSfx === 'function') _rtsSfx('order');
    return true;
  }
  /* LEFT button only. mousedown fires for every button, so without this guard the
     right-click order ALSO recentred the view - the army got its order and the camera
     jumped away from whatever the player was watching. */
  mini.onmousedown = function (e) { if (e.button !== 0) return; U.miniDrag = true; miniGo(e); };
  mini.onmousemove = function (e) { if (U.miniDrag) miniGo(e); };
  mini.oncontextmenu = function (e) { e.preventDefault(); miniOrder(e); return false; };
  /* A BUTTON RELEASED ANYWHERE IS A BUTTON RELEASED. cv.onmouseup only fires over the canvas, so
     dragging a selection box off the edge - onto the sidebar, out of the window - and letting go
     left U.drag set: the rubber band went on tracking a cursor whose button was no longer down,
     and nothing was ever selected. This finishes the drag wherever the release happens, which is
     also what the miniDrag flag below has always needed.

     NAMED AND STORED, because rtsClose has to take it off again. As an anonymous listener this
     was the one thing rtsClose forgot, and its closure held U, and U held the canvases: measured
     at +202 DOM nodes, +59 listeners, ~6MB of detached canvas and 27MB of RSS PER MATCH, for
     ever. Removing only this one listener took the leak to zero - the sprite cache and the
     ResizeObserver were collecting correctly on their own. */
  U.onWinUp = function (e) {
    var UU = window._rtsUI;
    if (!UU) return;
    UU.miniDrag = false;
    /* a grab let go off the battlefield pans no further and orders nothing */
    if (UU.grab && (!e || e.button === UU.grab.button)) _rtsGrabEnd();
    if (UU.drag && (!e || e.button !== 2)) {
      var dg = UU.drag; UU.drag = null;
      if (dg.moved) _rtsBoxSelect(dg);
      /* a click that started on the battlefield and ended off it is not a click ON anything,
         so an unmoved release outside the canvas selects nothing rather than guessing */
    } else if (UU.drag) UU.drag = null;
  };
  window.addEventListener('mouseup', U.onWinUp);
  _rtsNavBindWindow(U);            /* the menu after a right drag, keys across a lost focus */

  /* ------------------------------------------------------------------ touch --
     EVERY WAY OF MOVING THE CAMERA NEEDED HARDWARE A PHONE DOES NOT HAVE. Panning was WASD,
     the arrow keys, or holding the pointer against a screen edge; zoom was the wheel; and the
     one order button was the right one. On an iPhone there is no keyboard, nothing hovers, and
     there is no second button - so the map could not be moved at all. Reported exactly that.

     The gestures are the ones a phone map already uses, so nothing has to be learnt:

       drag one finger      pan the battlefield
       tap                  select, or place a building / fire a superweapon when one is armed
       long-press (350ms)   the context order - what right-click does on a desktop
       pinch two fingers    zoom about the fingers, and move them together to pan,
                            continuously (ui/navigate.js)

     DRAG PANS RATHER THAN BOX-SELECTS, which is the one place this deliberately differs from
     the mouse. A drag is the only gesture a phone has for moving a map, and a player who
     cannot move is stuck; box-select has a keyboard-free alternative in Ctrl+A's on-screen
     equivalents and in tapping units one at a time, so it is the affordance that gives way.

     Written on touch events rather than pointer events on purpose: Safari synthesises a
     delayed mouse sequence from taps, and the existing mouse handlers would fire a second
     time from the same finger. Every handler here calls preventDefault, which suppresses that
     synthesis as well as the page's own scroll and double-tap zoom. */
  var T = { id: null, x0: 0, y0: 0, lx: 0, ly: 0, moved: false, t0: 0, hold: 0, pinch: 0, mid: null };
  function _tXY(t) { var r = cv.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; }
  /* FINGERS ON THE BATTLEFIELD, not every finger on the glass: e.touches counts one resting on
     the sidebar too, which made a one-finger drag a pinch against a finger that never moves */
  function _tGap(e) {
    var a = e.targetTouches[0], b = e.targetTouches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function _tMid(e) { var a = _tXY(e.targetTouches[0]), b = _tXY(e.targetTouches[1]); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function _tClearHold() { if (T.hold) { clearTimeout(T.hold); T.hold = 0; } }
  U.clearHold = _tClearHold;             /* rtsClose has to be able to reach it - see rtsClose */
  /* THE GHOST HAS TO FOLLOW THE FINGER. _rtsGhostMove keeps its own tile rather than reading
     U.mouse, and its only caller was cv.onmousemove - which a touchscreen never fires. So the
     translucent footprint sat at map cell (0,0) for the whole placement while the player
     dragged around looking for somewhere to put a Power Plant, with nothing on screen showing
     where it would land or whether the ground was legal. Same three lines the mouse path runs. */
  function _tGhost(p) {
    if (!U.place) return;
    var g = _rtsGroundAt(p.x, p.y);
    if (!g) return;
    var def = rtsStructDef(U.place);
    var tx = _rtsTX(g.x) - ((def.w / 2) | 0), tz = _rtsTX(g.z) - ((def.h / 2) | 0);
    _rtsGhostMove(tx, tz, _rtsCanPlace('player', U.place, tx, tz));
  }

  cv.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (e.targetTouches.length >= 2) { _tClearHold(); T.id = null; T.pinch = _tGap(e); T.mid = _tMid(e); T.ang = null; _rtsTwist(e, T); return; }
    var t = e.changedTouches[0], p = _tXY(t);
    T.id = t.identifier; T.x0 = T.lx = p.x; T.y0 = T.ly = p.y;
    T.moved = false; T.t0 = Date.now(); T.pinch = 0;
    /* The pointer is parked under the finger so anything that reads U.mouse - the building
       ghost, the superweapon cursor - lines up with where the player is actually touching. */
    U.mouse.x = p.x; U.mouse.y = p.y; U.mouse.over = true;
    _tGhost(p);
    /* A press held in one place is the second button. Cancelled by movement below, so a pan
       never fires an order. */
    _tClearHold();
    T.hold = setTimeout(function () {
      T.hold = 0;
      if (T.moved || T.id === null) return;
      /* A STEADY FINGER WHILE PLACING IS STILL A PLACEMENT. _rtsRightClick reads U.place as
         "cancel", so resting a finger for a third of a second while lining up a building
         silently threw the placement away and touchend then did nothing - the same tap placed
         it fine at 120ms and cancelled it at 500ms, with nothing on screen saying why. Leave
         T.id intact so touchend still places it. */
      if (U.place) return;
      T.id = null;                                  /* consumed: touchend must not also select */
      if (U.mode) { rtsMode(U.mode); return; }
      _rtsRightClick(T.x0, T.y0);
      if (typeof _rtsSfx === 'function') _rtsSfx('order');
    }, 350);
  }, { passive: false });

  cv.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.targetTouches.length >= 2) {
      /* Pinch, about the fingers: it follows them, a doubling of their spread a rung. */
      var gap = _tGap(e), mid = _tMid(e);
      if (!T.pinch) { T.pinch = gap; T.mid = mid; return; }
      /* the midpoint keeps its grip on the ground, as one finger does: two fingers pan too */
      if (T.mid) _rtsHoldGround(_rtsGroundAt(T.mid.x, T.mid.y), mid.x, mid.y);
      T.mid = mid;
      _rtsTwist(e, T, mid);                /* two fingers twisted turn the 3D camera: ui/orbit.js */
      var ratio = gap / T.pinch;
      _rtsZoomToward(Math.log(ratio) / Math.LN2, mid.x, mid.y); T.pinch = gap;
      return;
    }
    if (T.id === null) return;
    var t = null, i;
    for (i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === T.id) { t = e.changedTouches[i]; break; }
    }
    if (!t) return;
    var p = _tXY(t);
    U.mouse.x = p.x; U.mouse.y = p.y;
    _tGhost(p);
    if (!T.moved && Math.abs(p.x - T.x0) + Math.abs(p.y - T.y0) > 8) { T.moved = true; _tClearHold(); }
    /* While placing, a drag is aiming the footprint - not panning the map out from under it */
    if (T.moved && U.place) { T.lx = p.x; T.ly = p.y; return; }
    if (T.moved) {
      /* The finger holds its grip on the ground: dragging moves the camera the opposite way
         and the world tracks the fingertip one-for-one.

         THROUGH THE PROJECTION'S OWN INVERSE, NOT THROUGH THE ZOOM. This divided the pixel
         delta by _rtsZoom() on both axes, which is the right answer only for a camera looking
         straight down. In 3D the view is tilted - screenY is (wz - focus.z) * cos(tilt) * zoom
         - so a vertical drag of N pixels is N / (zoom * cos(tilt)) world units, not N / zoom.
         At the tilt in force when this was found - 0.62, since leaned further - that cosine was
         0.8139, so every vertical pan in 3D moved the ground 18.6% less than the finger asked
         for: the map slid out from under the fingertip, on a
         phone, where this control is the only way to move the camera at all.

         Asking _rtsGroundAt where each fingertip is and taking the world difference is correct
         for ANY projection, because it is the projection's own inverse doing the arithmetic.
         Both calls read the same focus, so their difference is the true ground displacement -
         and this keeps working unchanged if the camera ever gains perspective or yaw. */
      _rtsHoldGround(_rtsGroundAt(T.lx, T.ly), p.x, p.y);   /* exact on slopes: ui/navigate.js */
      if (_rtsR.zAnchor) _rtsR.zAnchor = { x: p.x, y: p.y };  /* a pinch's glide left over pivots on the finger */
    }
    T.lx = p.x; T.ly = p.y;
  }, { passive: false });

  function _tEnd(e) {
    e.preventDefault();
    if (T.id === null) {
      T.pinch = 0;
      /* ONE FINGER LEFT IS ONE FINGER DOWN. touchstart drops T.id the moment a second finger
         lands, so after a pinch the finger still on the glass belonged to nobody: the next
         drag moved the camera not at all, and zoom-then-look-around - the most natural pair of
         gestures on a phone - needed both fingers lifted and the whole thing started again.
         Adopt whatever is still touching, from where it is now. */
      if (e.targetTouches && e.targetTouches.length === 1) {
        var rem = _tXY(e.targetTouches[0]);
        T.id = e.targetTouches[0].identifier;
        T.x0 = T.lx = rem.x; T.y0 = T.ly = rem.y;
        T.moved = false; T.t0 = Date.now();
        U.mouse.x = rem.x; U.mouse.y = rem.y; U.mouse.over = true;
      }
      return;
    }
    var t = null, i;
    for (i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === T.id) { t = e.changedTouches[i]; break; }
    }
    if (!t) return;
    _tClearHold();
    var wasMoved = T.moved;
    T.id = null; T.pinch = 0;
    var last = _tXY(t);
    U.mouse.over = false;
    /* PLACING IS PRESS, DRAG, RELEASE. A phone has no hover, so the only way to see where a
       building will land before committing is to drag the ghost there and let go - and the
       drag above aims rather than pans while U.place is set. The release places it at the
       finger's LAST position, not the first. */
    if (U.place) { _rtsTryPlace(last.x, last.y); return; }
    if (wasMoved) return;                           /* that was a pan, not a tap */
    /* A tap is the left button: the armed cursors first, then plain selection. */
    if (U.superArm) { _rtsSuperClick(T.x0, T.y0); return; }
    if (U.mode)     { _rtsModeClick(T.x0, T.y0); return; }
    _rtsClickSelect(T.x0, T.y0, false);
  }
  cv.addEventListener('touchend', _tEnd, { passive: false });
  cv.addEventListener('touchcancel', function (e) {
    e.preventDefault(); _tClearHold(); T.id = null; T.pinch = 0; U.mouse.over = false;
  }, { passive: false });

  /* The radar takes a finger too: drag to move the view, exactly as the left button does. */
  mini.addEventListener('touchstart', function (e) {
    e.preventDefault(); miniGo(e.touches[0]);
  }, { passive: false });
  mini.addEventListener('touchmove', function (e) {
    e.preventDefault(); miniGo(e.touches[0]);
  }, { passive: false });
}
