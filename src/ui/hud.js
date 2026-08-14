/* ui/hud.js - the HUD overlay: readouts, the action cursor and the radar minimap.
   Part of rts.ui, which owns the DOM. */

/* ------------------------------------------------------------ HUD draw */
function _rtsDrawHud(dt) {
  var G = window._rtsG, U = window._rtsUI;
  var hud = document.getElementById('rtsHud'), g = hud.getContext('2d');
  var W = _rtsR.W, H = _rtsR.H;
  g.clearRect(0, 0, W, H);
  var i;
  /* health bars: always for selected, and for anything damaged */
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.inside) continue;      /* no health bar for a passenger */
    /* The sprite pass culls by visibility; this pass did not, so a damaged enemy under the
       shroud drew its health bar on top of the black - a floating green stripe that both looks
       broken and tells you exactly where the hidden attack team is. */
    if (!_rtsEntSeen(e)) continue;
    var selected = G.sel.indexOf(e) >= 0;
    var hurt = e.hp < e.maxHp - 0.5;
    if (!selected && !hurt) continue;
    var top = (e.type === 'struct') ? rtsStructDef(e.def).h * 0.9 + 5 : 3.4;
    var s = _rtsWorldToScreen(e.x, top, e.z);
    if (s.behind || s.x < -60 || s.x > W + 60 || s.y < -40 || s.y > H + 40) continue;
    /* SIZED BY THE PROJECTION, NOT BY A LITERAL. _rtsWorldToScreen returns the scale to draw
       at as well as the point to draw at, and this pass read the point and ignored the scale -
       so a health bar was the same 46 pixels wide wherever the unit was, while the unit under
       it was not. It is invisible today because the scale is 1 under both orthographic
       cameras, and it is exactly the kind of thing that stays invisible until a perspective
       camera makes every bar on screen the wrong size at once. */
    var sc = s.scale || 1;
    var bw = (e.type === 'struct' ? 46 : 26) * sc, bh = 4 * sc;
    var frac = Math.max(0, e.hp / e.maxHp);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(s.x - bw / 2 - 1, s.y - bh - 1, bw + 2, bh + 2);
    g.fillStyle = frac > 0.6 ? '#5fdc7a' : (frac > 0.3 ? '#e8c35a' : '#e3574a');
    g.fillRect(s.x - bw / 2, s.y - bh, bw * frac, bh);
    /* BUILDING.CPP toggles IsWrenchVisible on the repair timer - the wrench blinks on a
       building under repair so you can see at a glance where your credits are going. */
    if (e.repair && (typeof _rtsPulse !== 'function' || _rtsPulse() > 0.45)) _rtsDrawWrench(g, s.x, s.y - bh - 9 * sc);
    if (selected) {
      /* corner brackets, the classic selection look */
      var r = (e.type === 'struct' ? rtsStructDef(e.def).w * _rtsR.cell * 0.5 : _rtsR.cell * 0.42) * sc;
      r = Math.max(10, Math.min(70, r));
      var cy = s.y + r * 0.55, L = Math.max(5, r * 0.42);
      g.strokeStyle = e.side === 'player' ? '#8ef07a' : '#ff8a7a';
      g.lineWidth = 2;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        var cx = s.x + c[0] * r, cz2 = cy + c[1] * r * 0.62;
        g.beginPath();
        g.moveTo(cx - c[0] * L, cz2); g.lineTo(cx, cz2); g.lineTo(cx, cz2 - c[1] * L);
        g.stroke();
      });
    }
  }
  /* drag box */
  if (U.drag && U.drag.moved) {
    var x0 = Math.min(U.drag.x0, U.drag.x1), y0 = Math.min(U.drag.y0, U.drag.y1);
    var w = Math.abs(U.drag.x1 - U.drag.x0), h = Math.abs(U.drag.y1 - U.drag.y0);
    g.strokeStyle = '#8ef07a'; g.lineWidth = 1.5;
    g.fillStyle = 'rgba(142,240,122,0.10)';
    g.fillRect(x0, y0, w, h); g.strokeRect(x0, y0, w, h);
  }
  /* order confirmation ping */
  if (U.flash) {
    U.flash.t += dt;
    if (U.flash.t > 0.55) U.flash = null;
    else {
      var f = U.flash, sp = _rtsWorldToScreen(f.x, 0.5, f.z), k = f.t / 0.55;
      if (!sp.behind) {
        var fsc = sp.scale || 1;                 /* the ping is on the ground, so it scales too */
        g.strokeStyle = f.kind === 'attack' ? '#ff6a52' : (f.kind === 'harvest' ? '#6fe3b8' : '#8ef07a');
        g.lineWidth = 2.5 * (1 - k) * fsc;
        g.beginPath();
        g.ellipse(sp.x, sp.y, (26 * k + 5) * fsc, (14 * k + 3) * fsc, 0, 0, 6.2832);
        g.stroke();
      }
    }
  }
  /* placement hint */
  if (U.place) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - 150, 14, 300, 26);
    g.fillStyle = '#cfe9ff'; g.font = '13px system-ui,sans-serif'; g.textAlign = 'center';
    g.fillText('Click to place ' + rtsStructDef(U.place).name + '  ·  Esc to cancel', W / 2, 31);
    g.textAlign = 'left';
  }
  /* The action cursor goes last so nothing draws over it. While one is showing the OS
     pointer is hidden, or you get two cursors fighting for the same few pixels. */
  var act = (U.mouse.over && !U.drag) ? _rtsActionAt(U.mouse.x, U.mouse.y) : null;
  var cv2 = document.getElementById('rtsCv');
  if (cv2) {
    var want = act ? 'none' : (U.mode ? 'crosshair' : 'crosshair');
    if (cv2.style.cursor !== want) cv2.style.cursor = want;
  }
  if (act) _rtsDrawCursor(g, U.mouse.x, U.mouse.y, act);
}
/* Drawn as strokes rather than a 🔧 glyph: an emoji here depends on a font the machine may
   not have, and a missing one silently draws nothing at all. */
/* ------------------------------------------------------- action cursor --
   What would happen if you clicked right now? The original changes the mouse shape as it
   passes over the map - move, attack, enter, no-entry - so the answer is always on screen
   instead of being something you find out by trying it. This mirrors the decisions
   _rtsRightClick actually makes, so the cursor cannot promise an order the click will not
   give. (Built from this game's own action set - DISPLAY.CPP was not among the files mined.) */
function _rtsActionAt(mx, my) {
  var G = window._rtsG, U = window._rtsUI;
  if (!G || G.over) return null;
  if (U.place) return null;                      /* the ghost is already the feedback */
  if (U.mode === 'repair' || U.mode === 'sell') {
    var h0 = _rtsPickAt(mx, my), t0 = h0 && h0.ent;
    if (t0 && t0.side === 'player' && t0.type === 'struct') return U.mode;
    return 'no';
  }
  var hit = _rtsPickAt(mx, my);
  if (!hit) return null;
  var tgt = hit.ent;
  var mine = [], i;
  /* Runs inside the render loop, so one bad entry must not take the whole frame down. */
  for (i = 0; i < G.sel.length; i++) {
    var sv = G.sel[i];
    if (sv && !sv.dead && !sv.inside && sv.side === 'player' && sv.type === 'unit') mine.push(sv);
  }
  if (!mine.length) return (tgt && !tgt.dead) ? 'select' : null;
  if (tgt && tgt.side === 'enemy') return 'attack';
  var tx = _rtsTX(hit.x), tz = _rtsTX(hit.z);
  var onScrap = _rtsInB(tx, tz) && G.scrap[_rtsIdx(tx, tz)] > 0;
  var harv = false;
  for (i = 0; i < mine.length; i++) if (rtsUnitDef(mine[i].def).harvest) harv = true;
  if (harv && onScrap) return 'harvest';
  if (harv && tgt && tgt.side === 'player' && tgt.def === 'refinery') return 'deliver';
  /* Somewhere no ground unit can stand is a no-entry, not a move order that quietly fails. */
  if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz)) return 'no';
  return U.attackMove ? 'amove' : 'move';
}
function _rtsDrawCursor(g, x, y, kind) {
  if (!kind) return;
  g.save(); g.translate(x, y); g.lineCap = 'round'; g.lineJoin = 'round';
  var col = { move:'#8ef07a', amove:'#ffd473', attack:'#ff6a5a', harvest:'#ffd473',
    deliver:'#8ef07a', select:'#9fd0ff', repair:'#ffd473', sell:'#ff9a4a', no:'#ff6a5a' }[kind] || '#8ef07a';
  /* every shape is stroked twice: a fat dark pass first so it stays legible on pale ore */
  for (var pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? col : 'rgba(0,0,0,0.75)';
    g.lineWidth = pass ? 2 : 4.5;
    if (kind === 'attack') {                       /* reticle with a gap at the cardinals */
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke();
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        g.beginPath(); g.moveTo(d[0] * 5, d[1] * 5); g.lineTo(d[0] * 12, d[1] * 12); g.stroke();
      });
    } else if (kind === 'no') {                    /* circle with a bar through it */
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-5.7, -5.7); g.lineTo(5.7, 5.7); g.stroke();
    } else if (kind === 'select') {                /* four corner ticks */
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        g.beginPath();
        g.moveTo(c[0] * 9, c[1] * 4); g.lineTo(c[0] * 9, c[1] * 9); g.lineTo(c[0] * 4, c[1] * 9);
        g.stroke();
      });
    } else if (kind === 'harvest' || kind === 'deliver') {   /* a scoop */
      g.beginPath(); g.arc(0, 1, 7, 0.15, Math.PI - 0.15); g.stroke();
      g.beginPath(); g.moveTo(0, -9); g.lineTo(0, -2); g.stroke();
      if (kind === 'deliver') { g.beginPath(); g.moveTo(-4, -6); g.lineTo(0, -10); g.lineTo(4, -6); g.stroke(); }
    } else if (kind === 'sell') {                  /* banknote */
      g.beginPath(); g.rect(-9, -6, 18, 12); g.stroke();
      g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.stroke();
    } else if (kind === 'repair') {
      g.restore(); _rtsDrawWrench(g, x, y); g.save(); g.translate(x, y);
      break;
    } else {                                       /* move / attack-move: a chevron */
      g.beginPath(); g.moveTo(-7, -3); g.lineTo(0, 5); g.lineTo(7, -3); g.stroke();
      g.beginPath(); g.moveTo(0, 5); g.lineTo(0, -8); g.stroke();
      if (kind === 'amove') { g.beginPath(); g.arc(0, -1, 10, 0, Math.PI * 2); g.stroke(); }
    }
  }
  g.restore();
}
function _rtsDrawWrench(g, x, y) {
  g.save(); g.translate(x, y); g.rotate(-0.6); g.lineCap = 'round';
  for (var pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? '#ffd473' : 'rgba(0,0,0,0.8)';
    g.lineWidth = pass ? 2 : 4.5;
    g.beginPath(); g.moveTo(0, -3); g.lineTo(0, 5); g.stroke();              /* handle */
    g.beginPath(); g.arc(0, -5, 2.8, 0.75, Math.PI * 2 - 0.75); g.stroke();  /* open jaw */
  }
  g.restore();
}
/* Is the radar working? A Radar Dome, standing and finished, with the base not in power
   deficit. Everything the radar panel does - drawing, clicking to move the view, right-clicking
   to order - is gated on this one answer, so they can never disagree. */
function _rtsRadarLit() {
  var G = window._rtsG;
  if (!G || !_rtsHas('player', 'radar')) return false;
  var PS = G.sides.player;
  return PS.powerMade >= PS.powerUsed;
}
function _rtsDrawMini() {
  var G = window._rtsG, mini = document.getElementById('rtsMini');
  if (!mini) return;
  var g = mini.getContext('2d'), S = mini.width, sc = S / RTS_N, i;
  /* No Radar Dome, no radar. In the originals the map panel is dead until you build the
     structure that powers it, and it goes dead again the moment that structure is destroyed
     or the base browns out - which is what makes bombing the dome worth doing. Powered means
     the whole side is not in deficit; the same condition that stops a turret firing. */
  var dome = _rtsHas('player', 'radar');
  if (!_rtsRadarLit()) {
    /* IN CSS PIXELS, NOT BACKING-STORE PIXELS. The radar's backing store is sized to the map -
       188px - and the element is shown at whatever the layout gives it, which on a phone is
       84px. A font set in backing-store units therefore renders at 84/188 of its nominal size:
       `bold 11px` drew this label at 4.9 CSS pixels, which is not small type, it is a smudge.
       Scaled by the ratio the two lines come out at the size they say they are, and then
       shrunk to fit if the panel is too narrow to hold them - which at 84px it is. */
    var cssW = mini.getBoundingClientRect().width || S;
    var k = S / cssW;                             /* backing pixels per CSS pixel */
    var top = dome ? 'NO POWER' : 'NO RADAR';
    var sub = dome ? 'restore power' : 'build a Radar Dome';
    function _fit(txt, wantCss, weight) {
      var px = wantCss;
      for (;;) {
        g.font = weight + (px * k) + 'px ui-monospace,monospace';
        if (px <= 6 || g.measureText(txt).width <= S * 0.9) return px;
        px -= 0.5;
      }
    }
    g.fillStyle = '#0a0d12'; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(120,150,190,0.42)';
    g.textAlign = 'center';
    var t1 = _fit(top, 12, 'bold ');
    g.fillText(top, S / 2, S / 2 - 3 * k);
    var t2 = _fit(sub, 9.5, '');
    g.fillText(sub, S / 2, S / 2 + (t1 + 4) * k);
    g.textAlign = 'left';
    return;
  }
  /* The radar mirrors the terrain layer, so forest, ridges, the lake and the roads are all
     legible at a glance - the whole point of having a radar rather than a blank green square. */
  var TCOL = ['#374626', '#22391b', '#6a665c', '#2b4c6b', '#5a4e39', '#8a7c58', '#a89663'];
  g.fillStyle = TCOL[0]; g.fillRect(0, 0, S, S);
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    var idx = _rtsIdx(tx, tz);
    /* the radar shows what you have explored, and nothing else */
    if (G.mapped && !G.mapped[idx]) { g.fillStyle = '#0a0d12'; g.fillRect(tx * sc, tz * sc, sc, sc); continue; }
    if (G.scrap[idx] > 0) g.fillStyle = G.gems[idx] ? '#9b7ae8' : '#c9a03a';
    else {
      var tk = G.terrain ? G.terrain[idx] : 0;
      if (tk === 0) continue;
      g.fillStyle = TCOL[tk] || TCOL[0];
    }
    g.fillRect(tx * sc, tz * sc, sc, sc);
  }
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || !_rtsEntSeen(e)) continue;
    g.fillStyle = e.side === 'player' ? '#5ea8ff' : '#ff6a52';
    if (e.type === 'struct') {
      var d = rtsStructDef(e.def);
      var ico = (typeof _rtsRadarIcon === 'function') ? _rtsRadarIcon(e.def, e.side) : null;
      if (ico) g.drawImage(ico, e.tx * sc, e.tz * sc, d.w * sc, d.h * sc);
      else g.fillRect(e.tx * sc, e.tz * sc, d.w * sc, d.h * sc);
    } else {
      var mx = (e.x / RTS_TILE + RTS_N / 2) * sc, mz = (e.z / RTS_TILE + RTS_N / 2) * sc;
      g.fillRect(mx - 1.5, mz - 1.5, 3, 3);
    }
  }
  /* CAMERA VIEWPORT BOX, hung on the centre of what is visible rather than on the focus. The
     two are the same point under both orthographic cameras and are not under the perspective
     one - the visible ground reaches further up the screen than down it - so this asked
     _rtsViewSpan for the centre as well as the size. */
  var span = RTS_N * RTS_TILE;
  var vs = _rtsViewSpan(), vw = vs.w, vh = vs.h;
  /* CONQUER.CPP pulses the radar box on CC_PULSE_COLOR rather than drawing it flat white. */
  var pv = (typeof _rtsPulse === 'function') ? _rtsPulse() : 0.6;
  g.strokeStyle = 'rgba(255,255,255,' + (0.45 + pv * 0.75).toFixed(2) + ')';
  g.lineWidth = 1.5;
  g.strokeRect((vs.cx - vw / 2) / span * S + S / 2, (vs.cz - vh / 2) / span * S + S / 2,
               vw / span * S, vh / span * S);
}

