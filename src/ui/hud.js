/* ui/hud.js - the HUD overlay: readouts, the action cursor and the radar minimap.
   Part of rts.ui, which owns the DOM. */

/* ------------------------------------------------------------ HUD draw */
function _rtsDrawHud(dt) {
  var G = window._rtsG, U = window._rtsUI;
  var hud = document.getElementById('rtsHud'), g = hud.getContext('2d');
  var W = _rtsR.W, H = _rtsR.H;
  g.clearRect(0, 0, W, H);
  var i;
  /* a selection is a ring on the ground (render3d/ring3d.js); this pass draws the bars */
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
    /* THE RALLY POINT, drawn only while its building is selected. A rally you cannot see is a
       rally you cannot trust - you set it once and then have no way to check where it is, or
       whether the click landed at all. Shown for the selected building only, because a base of
       six producers would otherwise be a permanent cat's cradle across the map. */
    if (selected && e.rally && _rtsCanRally(e)) {
      var rp = _rtsWorldToScreen(e.rally.x, _rtsElev(e.rally.x, e.rally.z), e.rally.z);
      if (!rp.behind) {
        g.save();
        g.strokeStyle = 'rgba(142,240,122,0.55)';
        g.lineWidth = 1.5;
        g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(rp.x, rp.y); g.stroke();
        g.setLineDash([]);
        /* a flag, not a dot: at the far end of a dashed line a dot reads as an artefact */
        var fh = 13 * (rp.scale || 1);
        g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(rp.x, rp.y); g.lineTo(rp.x, rp.y - fh); g.stroke();
        g.strokeStyle = '#8ef07a'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(rp.x, rp.y); g.lineTo(rp.x, rp.y - fh); g.stroke();
        g.fillStyle = '#8ef07a';
        g.beginPath();
        g.moveTo(rp.x, rp.y - fh);
        g.lineTo(rp.x + fh * 0.62, rp.y - fh * 0.74);
        g.lineTo(rp.x, rp.y - fh * 0.48);
        g.closePath(); g.fill();
        g.restore();
      }
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
        g.strokeStyle = _rtsPingCol(f.kind);
        g.lineWidth = 2.5 * (1 - k) * fsc;
        g.beginPath();
        g.ellipse(sp.x, sp.y, (26 * k + 5) * fsc, (14 * k + 3) * fsc, 0, 0, 6.2832);
        g.stroke();
      }
    }
  }
  /* placement hint, in the gestures of the device in hand - in the message line's slot while
     the line is quiet (_rtsBannerTop) */
  var quiet = !(G.msgT > 0);
  if (U.place && quiet) _rtsBanner(g, W, _rtsPlaceHint(rtsStructDef(U.place).name, typeof _rtsTouchUI === 'function' && _rtsTouchUI()), _rtsBannerTop());
  /* AN ARMED SUPERWEAPON gets the banner placement has, and its cursor traces the ground it will
     cover (_rtsDrawCursor 'super'): the cursor showed the selection's right-click order instead -
     a no-entry over water, where the click laid the fog - and nothing showed the area */
  if (U.superArm) {
    var sdA = _rtsSuperDefOf(U.superArm);
    if (sdA && quiet) _rtsBanner(g, W, _rtsArmedHint(sdA.super, typeof _rtsTouchUI === 'function' && _rtsTouchUI()), _rtsBannerTop());
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
  if (U.superArm) return 'super';                /* the next click fires it: ui/superbar.js */
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
  /* With a producer selected the right button sets a rally point, so the cursor has to say so
     - otherwise the one control that has no other feedback also has no cursor. */
  var anyMaker = false;
  for (i = 0; i < G.sel.length; i++)
    if (G.sel[i] && G.sel[i].side === 'player' && _rtsCanRally(G.sel[i])) { anyMaker = true; break; }
  if (anyMaker && !mine.length) return 'rally';
  if (!mine.length) return (tgt && !tgt.dead) ? 'select' : null;
  /* AN ENEMY under the pointer is the attack reticle only if something selected can engage it,
     or is a specialist whose click means something else (an engineer, a loaded transport): a
     Flak Track given the reticle over a tank drove onto the tank, since its gun cannot bear */
  /* AN UNARMED UNIT is the reticle only where it has a job on the target - an engineer at a
     building it can take, a thief at a Refinery, a loaded transport's drop. A Repair Truck over
     an enemy tank was offered the reticle and given a drive onto its guns. A drone over an enemy
     unit shadows it, which is a move, not an attack. */
  if (tgt && tgt.side === 'enemy') {
    var shadow = false, asked = {};
    for (i = 0; i < mine.length; i++) {
      var sd0 = rtsUnitDef(mine[i].def) || {};
      /* a hull's reach is a ring scan, run every frame: asked once per kind of hull, which answers alike */
      if (sd0.sea && asked[mine[i].def]) continue;
      if (sd0.sea) asked[mine[i].def] = 1;
      if (sd0.weapon ? _rtsCanEngage(mine[i], tgt) && (!sd0.sea || _rtsHullReaches(mine[i], tgt)) : _rtsJobOn(mine[i], sd0, tgt)) return 'attack';
      if (sd0.orbits && tgt.type === 'unit') shadow = true;
    }
    return shadow ? 'move' : 'no';
  }
  /* your own transport with something selected that can get in: the board cursor */
  if (tgt && tgt.side === 'player' && tgt.type === 'unit' && !tgt.dead && _rtsIsTransport(tgt)) {
    for (i = 0; i < mine.length; i++) if (mine[i] !== tgt && _rtsCanBoard(mine[i], tgt)) return _rtsBoardReachable(tgt) ? 'board' : 'no';
  }
  var tx = _rtsTX(hit.x), tz = _rtsTX(hit.z);
  var onScrap = _rtsInB(tx, tz) && G.scrap[_rtsIdx(tx, tz)] > 0;
  var harv = false;
  for (i = 0; i < mine.length; i++) if (rtsUnitDef(mine[i].def).harvest) harv = true;
  if (harv && onScrap) return 'harvest';
  if (harv && tgt && tgt.side === 'player' && tgt.def === 'refinery') return 'deliver';
  /* Somewhere nothing selected can stand is a no-entry, not a move order that quietly fails -
     asked in each unit's own domain, so open water is a move for a hovercraft or a hull and a
     refusal for a tank (the order paths the same way: _rtsPathFor). An AIRCRAFT stands
     anywhere: _rtsDomainOf gives it the land's domain, and the cursor said no over the sea to a
     bomber whose move order (a straight line, _rtsPathFor) went there regardless. */
  if (!_rtsInB(tx, tz)) return 'no';
  /* a loaded craft or aircraft over dry ground puts its load down there (ui/select.js): the
     unload cursor, where the stand test said no to a Landing Craft whose click worked */
  var onW = G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER && !(G.tideDry && G.tideDry[_rtsIdx(tx, tz)]);
  for (i = 0; i < mine.length && !onW; i++) {
    var ld = rtsUnitDef(mine[i].def) || {};
    if ((ld.sea || ld.air) && ld.carries && _rtsCargoCount(mine[i])) return 'unload';
  }
  /* every selected hull aground: nothing it is ordered to do happens until the flood */
  var ag = 0;
  for (i = 0; i < mine.length; i++) if (_rtsAground(mine[i])) ag++;
  if (ag && ag === mine.length) return 'no';
  var stand = !!(tgt && tgt.side === 'player' && tgt.type === 'struct'), bombers = 0;   /* your own building: the move goes beside it */
  for (i = 0; i < mine.length; i++) {
    if (mine[i].air || !_rtsBlocked(tx, tz, _rtsDomainOf(mine[i]))) stand = true;
    if (rtsUnitDef(mine[i].def).carpets) bombers++;
  }
  /* bombers alone on attack-move lay their line across this ground: the reticle (ui/select.js) */
  if (U.attackMove && bombers && bombers === mine.length) return 'attack';
  if (!stand) return 'no';
  return U.attackMove ? 'amove' : 'move';
}
/* The ground an armed superweapon will cover, in cells: the weather's cells (core/wxsupers.js) */
function _rtsSuperRadius(key) {
  return key === 'fogbank' ? RTS_FOGBANK.r : key === 'thunder' ? RTS_THUNDER.r : 0;
}
/* ...traced round the ground under (x, y), projected point by point so it is the circle on the
   ground the 3D camera sees - an ellipse, leaning with the view */
function _rtsSuperRing(g, x, y) {
  var U = window._rtsUI, R = U && _rtsSuperRadius(U.superArm), gp = R && _rtsGroundAt(x, y);
  if (!gp) return;
  g.beginPath();
  for (var a = 0; a <= 36; a++) {
    var ang = a / 36 * Math.PI * 2, p = _rtsGroundToScreen(gp.x + Math.cos(ang) * R * RTS_TILE, gp.z + Math.sin(ang) * R * RTS_TILE);
    if (a) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y);
  }
  g.stroke();
}
/* The order ping's colour. An attack-move is the cursor's amber: it flashed the plain move's
   green, so the one confirmation of the order looked like the order it is not. */
function _rtsPingCol(kind) {
  return { attack:'#ff6a52', harvest:'#6fe3b8', amove:'#ffd473' }[kind] || '#8ef07a';
}
/* What the placement banner says. A phone has no Esc key and no hover: it places by dragging
   the ghost and letting go (ui/input.js), and cancels by holding the building's button
   (ui/sidebar.js) - the banner told it to click and press Esc. */
function _rtsPlaceHint(name, touch) {
  return touch ? 'Drag to place ' + name + '  ·  hold its button to cancel'
               : 'Click to place ' + name + '  ·  Esc to cancel';
}
/* What an armed superweapon's banner says: what to do with it, and how to put it down */
function _rtsArmedHint(sup, touch) {
  var h = _rtsSuperHint(sup), cut = h.indexOf('— ');
  return (cut >= 0 ? h.slice(cut + 2) : h).replace(/\.$/, '') + '  ·  ' + (touch ? 'tap its button to cancel' : 'Esc to cancel');
}
/* WHERE A BANNER GOES: in the message line's own slot, drawn only while the line is quiet. The
   banners were drawn at y 14, and the top strip is DOM laid OVER the HUD canvas - so a banner
   sat under the strip's gradient at a desk and behind its 40-pixel buttons on a phone. The
   line's top is the stylesheet's (44, 56 on a phone, 52 held sideways): read once, and again
   after every resize, which is where a rotation passes (ui/shell.js). */
function _rtsBannerTop() {
  var U = window._rtsUI;
  if (U && U.bannerY) return U.bannerY;
  var m = document.getElementById('rtsMsg'), y = (m && m.offsetTop) || 44;
  if (U) U.bannerY = y;
  return y;
}
/* A banner across the top of the field at y, as wide as its words: the boxes were a fixed 300
   and 380 pixels, which a long building name overran. Centred, it keeps 56 pixels clear at each
   side for the compass that shares its height at the right. Too wide, it breaks at its ' · '
   into two lines, and only then steps its type down. Returns what it drew, for the specs. */
function _rtsBanner(g, W, text, y) {
  var room = W - 136, px = 13, lines = [text], tw, i;
  function widest() { var m = 0; for (var k = 0; k < lines.length; k++) m = Math.max(m, g.measureText(lines[k]).width); return m; }
  g.font = px + 'px system-ui,sans-serif'; tw = widest();
  if (tw > room && text.indexOf('  ·  ') > 0) { lines = text.split('  ·  '); tw = widest(); }
  while (tw > room && px > 9) { px--; g.font = px + 'px system-ui,sans-serif'; tw = widest(); }
  var bw = Math.min(W - 112, Math.ceil(tw) + 24), lh = px + 4, bh = 26 + (lines.length - 1) * lh;
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - bw / 2, y, bw, bh);
  g.fillStyle = '#cfe9ff'; g.textAlign = 'center';
  for (i = 0; i < lines.length; i++) g.fillText(lines[i], W / 2, y + 17 + i * lh);
  g.textAlign = 'left';
  return { x: W / 2 - bw / 2, y: y, w: bw, h: bh, tw: tw, px: px, lines: lines.length };
}
/* An unarmed unit's job on an enemy target, as _rtsRightClick gives it (ui/select.js) */
function _rtsJobOn(u, d, tgt) {
  if (tgt.type === 'struct' && ((d.capture && rtsCapturable(tgt.def)) || (d.steal && tgt.def === d.stealFrom))) return true;
  return _rtsIsTransport(u) && _rtsCargoCount(u) > 0;
}
function _rtsDrawCursor(g, x, y, kind) {
  if (!kind) return;
  g.save(); g.translate(x, y); g.lineCap = 'round'; g.lineJoin = 'round';
  var col = { move:'#8ef07a', amove:'#ffd473', attack:'#ff6a5a', harvest:'#ffd473',
    deliver:'#8ef07a', select:'#9fd0ff', repair:'#ffd473', sell:'#ff9a4a', no:'#ff6a5a',
    rally:'#8ef07a', board:'#9fd0ff', unload:'#9fd0ff', super:'#cfe9ff' }[kind] || '#8ef07a';
  /* every shape is stroked twice: a fat dark pass first so it stays legible on pale ore */
  for (var pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? col : 'rgba(0,0,0,0.75)';
    g.lineWidth = pass ? 2 : 4.5;
    if (kind === 'attack') {                       /* reticle with a gap at the cardinals */
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke();
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        g.beginPath(); g.moveTo(d[0] * 5, d[1] * 5); g.lineTo(d[0] * 12, d[1] * 12); g.stroke();
      });
    } else if (kind === 'rally') {                 /* the same flag the marker uses */
      g.beginPath(); g.moveTo(0, 8); g.lineTo(0, -9); g.stroke();
      g.beginPath(); g.moveTo(0, -9); g.lineTo(7, -6); g.lineTo(0, -3); g.closePath(); g.stroke();
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
    } else if (kind === 'board') {                 /* an arrow down into an open hold */
      g.beginPath(); g.moveTo(-8, -2); g.lineTo(-8, 8); g.lineTo(8, 8); g.lineTo(8, -2); g.stroke();
      g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 4); g.stroke();
      g.beginPath(); g.moveTo(-4, 0); g.lineTo(0, 4); g.lineTo(4, 0); g.stroke();
    } else if (kind === 'super') {                 /* cross-hairs, and the ground it will cover */
      g.restore(); g.save(); g.lineCap = 'round';
      g.strokeStyle = pass ? col : 'rgba(0,0,0,0.75)'; g.lineWidth = pass ? 2 : 4.5;
      _rtsSuperRing(g, x, y);
      g.translate(x, y);
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        g.beginPath(); g.moveTo(d[0] * 3, d[1] * 3); g.lineTo(d[0] * 11, d[1] * 11); g.stroke();
      });
    } else if (kind === 'unload') {                /* an arrow up out of an open hold */
      g.beginPath(); g.moveTo(-8, -2); g.lineTo(-8, 8); g.lineTo(8, 8); g.lineTo(8, -2); g.stroke();
      g.beginPath(); g.moveTo(0, 4); g.lineTo(0, -10); g.stroke();
      g.beginPath(); g.moveTo(-4, -6); g.lineTo(0, -10); g.lineTo(4, -6); g.stroke();
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
    var sub = dome ? 'restore power' : 'build a Radar Post';
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
      /* a deck reads as road, and flats the tide has gone out from as sand: core/tide.js */
      g.fillStyle = TCOL[tk === RTS_T_WATER && _rtsIsBridgeCell(idx) ? RTS_T_ROAD : tk === RTS_T_WATER && G.tideDry && G.tideDry[idx] ? RTS_T_SAND : tk] || TCOL[0];
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
  /* STATIC over an enemy Jammer's field (core/jammer.js): the radar cannot read it - where the
     radar reads at all. Under the unexplored shroud there is nothing to disturb, and a disc of
     static there marked the army the Jammer was hiding from across the map. */
  var JF = G.jam && G.jam.enemy;
  for (i = 0; JF && i < JF.length; i++) {
    if (!_rtsRadarStaticShown(G, JF[i])) continue;
    var jx = (JF[i].x / RTS_TILE + RTS_N / 2) * sc, jz = (JF[i].z / RTS_TILE + RTS_N / 2) * sc, jr = JF[i].r / RTS_TILE * sc;
    for (var jn = 0; jn < 90; jn++) {
      var ja = Math.random() * Math.PI * 2, jd = Math.sqrt(Math.random()) * jr, jv = (120 + Math.random() * 135) | 0;
      g.fillStyle = 'rgb(' + jv + ',' + jv + ',' + jv + ')';
      g.fillRect(jx + Math.cos(ja) * jd - 1, jz + Math.sin(ja) * jd - 1, 2, 2);
    }
  }
  /* THE PLAYER'S OWN JAMMER COVER, traced in the radar's blue: where a column is hidden (the 3D
     view rings it round a selected Jammer, render3d/ring3d.js) */
  var JM = G.jam && G.jam.player;
  for (i = 0; JM && i < JM.length; i++) {
    g.strokeStyle = 'rgba(94,168,255,0.85)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc((JM[i].x / RTS_TILE + RTS_N / 2) * sc, (JM[i].z / RTS_TILE + RTS_N / 2) * sc, JM[i].r / RTS_TILE * sc, 0, Math.PI * 2); g.stroke();
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
  if (vs.poly) {
    /* the 3D camera's view is a trapezoid, turned however the camera faces (cam3d.js) */
    g.beginPath();
    for (var q = 0; q < vs.poly.length; q++) {
      var qx = vs.poly[q].x / span * S + S / 2, qz = vs.poly[q].z / span * S + S / 2;
      if (q) g.lineTo(qx, qz); else g.moveTo(qx, qz);
    }
    g.closePath(); g.stroke();
  } else {
    g.strokeRect((vs.cx - vw / 2) / span * S + S / 2, (vs.cz - vh / 2) / span * S + S / 2,
                 vw / span * S, vh / span * S);
  }
}

