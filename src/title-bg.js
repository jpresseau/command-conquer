/* title-bg.js - the coast at dusk behind the title screen.

   The title was a dark gradient with a column of buttons on it: nothing on the screen said what
   the game is. Behind it now is the war for the coast - a dusk sky over the sea, a headland with a
   lighthouse whose beam sweeps the water, a fort on the far point, a warship crossing the horizon,
   and now and then the flash of a gun far down the shore.

   CHEAP, AND ONLY WHILE IT IS SEEN. Everything that does not move (the sky, the sun, the land and
   the fort, the vignette) is painted once into offscreen layers when the size changes; a frame
   draws those, and only the clouds, the glints on the water, the beam, the ship and the flashes are
   worked out per frame - at 30 frames a second, at no more than 1.5 device pixels a pixel. The loop
   stops the moment the title is hidden (a battle opened: #rtsHome.gone) or the tab is, and starts
   again when the title comes back. With reduced motion asked for it draws one frame and stops. */

var RTS_HOME_BG = { fps: 30, dpr: 1.5, horizon: 0.58 };
var _rtsHomeBg = null;

/* a small seeded random, so the coast is the same coast every visit */
function _rtsHomeBgRnd(seed) {
  var s = seed >>> 0;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function _rtsHomeBgLayer(w, h) {
  var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}
/* the land's edge against the sky: a ragged line from x0 to x1, its height at each step */
function _rtsHomeBgRidge(ctx, rnd, x0, x1, base, lift, step, rough) {
  ctx.beginPath(); ctx.moveTo(x0, base + 2);
  var y = base - lift * 0.5;
  for (var x = x0; x <= x1 + step; x += step) {
    var u = (x - x0) / Math.max(1, x1 - x0);
    var want = base - lift * Math.sin(Math.min(1, Math.max(0, u)) * Math.PI) * (0.75 + 0.25 * Math.sin(u * 7.1));
    y += (want - y) * 0.35 + (rnd() - 0.5) * rough;
    ctx.lineTo(Math.min(x, x1), y);
  }
  ctx.lineTo(x1, base + 2); ctx.closePath(); ctx.fill();
}

/* a headland's near shore, from where its ridge meets the sea (x0, y0) down to the foot of the
   screen at x1, ragged; side -1 fills toward the left edge, 1 toward the right */
function _rtsHomeBgShore(ctx, rnd, x0, y0, x1, y1, side) {
  var edge = side < 0 ? -4 : ctx.canvas.width + 4, n = 24;
  ctx.beginPath(); ctx.moveTo(edge, y0 - 2); ctx.lineTo(x0, y0 - 2);
  for (var i = 1; i <= n; i++) {
    var u = i / n, e = u * u;
    ctx.lineTo(x0 + (x1 - x0) * e + (rnd() - 0.5) * (y1 - y0) * 0.02, y0 + (y1 - y0) * u);
  }
  ctx.lineTo(edge, y1 + 4); ctx.closePath(); ctx.fill();
}

/* The still layers, for a w x h canvas (device pixels). */
function _rtsHomeBgBuild(B) {
  var w = B.w, h = B.h, hz = Math.round(h * RTS_HOME_BG.horizon), rnd = _rtsHomeBgRnd(1934);
  var sky = _rtsHomeBgLayer(w, h), c = sky.getContext('2d');
  /* the sky, deep blue overhead to the warm band at the sea's edge */
  var g = c.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#060a13'); g.addColorStop(0.42, '#0f1d31'); g.addColorStop(0.72, '#2a2c46');
  g.addColorStop(0.9, '#8a4a3a'); g.addColorStop(1, '#e09656');
  c.fillStyle = g; c.fillRect(0, 0, w, hz + 1);
  /* stars, only where the sky is dark */
  for (var i = 0; i < 90; i++) {
    var sx = rnd() * w, sy = rnd() * hz * 0.5, a = 0.15 + rnd() * 0.5;
    c.fillStyle = 'rgba(220,232,255,' + a.toFixed(2) + ')';
    c.fillRect(sx, sy, rnd() < 0.15 ? 2 : 1, 1);
  }
  /* the sun, low, a little right of centre, and its glow along the horizon */
  B.sunX = w * 0.62; B.sunY = hz - h * 0.018; B.hz = hz;
  var glow = c.createRadialGradient(B.sunX, B.sunY, 0, B.sunX, B.sunY, h * 0.55);
  glow.addColorStop(0, 'rgba(255,196,120,0.55)'); glow.addColorStop(0.18, 'rgba(240,140,80,0.22)');
  glow.addColorStop(1, 'rgba(240,140,80,0)');
  c.fillStyle = glow; c.fillRect(0, 0, w, hz + 1);
  c.fillStyle = '#ffd59a'; c.beginPath(); c.arc(B.sunX, B.sunY, Math.max(6, h * 0.028), Math.PI, 0); c.fill();
  /* the far shore along the horizon, blue with distance */
  c.fillStyle = '#26283c';
  _rtsHomeBgRidge(c, rnd, w * 0.22, w * 0.56, hz, h * 0.035, Math.max(4, w / 160), h * 0.004);
  c.fillStyle = '#1f2235';
  _rtsHomeBgRidge(c, rnd, w * 0.7, w * 0.92, hz, h * 0.025, Math.max(4, w / 160), h * 0.003);
  /* the sea: lit near the horizon, dark at the foot of the screen */
  var sg = c.createLinearGradient(0, hz, 0, h);
  sg.addColorStop(0, '#5a4a52'); sg.addColorStop(0.08, '#253246'); sg.addColorStop(0.5, '#111b2a'); sg.addColorStop(1, '#070b12');
  c.fillStyle = sg; c.fillRect(0, hz, w, h - hz);
  /* the sun's road on the water: a warm column under it, widening and fading as it comes near */
  for (var ry = hz; ry < h; ry += 2) {
    var f = (ry - hz) / (h - hz), half = w * (0.012 + f * 0.09), ra = 0.32 * Math.pow(1 - f, 1.6);
    var rg = c.createLinearGradient(B.sunX - half, 0, B.sunX + half, 0);
    rg.addColorStop(0, 'rgba(255,170,100,0)'); rg.addColorStop(0.5, 'rgba(255,170,100,' + ra.toFixed(3) + ')'); rg.addColorStop(1, 'rgba(255,170,100,0)');
    c.fillStyle = rg; c.fillRect(B.sunX - half, ry, half * 2, 2);
  }
  B.sky = sky;

  /* THE LAND in front: a headland on the left with its lighthouse, a point on the right with a fort */
  var land = _rtsHomeBgLayer(w, h), l = land.getContext('2d');
  l.fillStyle = '#0a0f18';
  _rtsHomeBgRidge(l, rnd, -w * 0.05, w * 0.3, hz + h * 0.02, h * 0.2, Math.max(4, w / 110), h * 0.012);
  /* its shore runs away from us toward the foot of the screen, so the sea widens as it comes near */
  _rtsHomeBgShore(l, rnd, w * 0.3, hz + h * 0.02, w * 0.06, h, -1);
  /* the lighthouse at the headland's tip */
  var lx = w * 0.235, lb = hz + h * 0.012, lh = Math.max(26, h * 0.12), lw = Math.max(5, h * 0.016);
  l.beginPath(); l.moveTo(lx - lw, lb); l.lineTo(lx - lw * 0.62, lb - lh); l.lineTo(lx + lw * 0.62, lb - lh); l.lineTo(lx + lw, lb); l.fill();
  l.fillRect(lx - lw * 0.9, lb - lh - lw * 1.2, lw * 1.8, lw * 1.3);
  B.lampX = lx; B.lampY = lb - lh - lw * 0.55; B.lampR = lw * 0.7;
  /* the point on the right, and the fort on it: a blockhouse, a tower and a mast */
  l.fillStyle = '#0b1019';
  _rtsHomeBgRidge(l, rnd, w * 0.74, w * 1.05, hz + h * 0.015, h * 0.11, Math.max(4, w / 110), h * 0.008);
  _rtsHomeBgShore(l, rnd, w * 0.74, hz + h * 0.015, w * 0.93, h, 1);
  var fx = w * 0.84, fb = hz - h * 0.05, u = Math.max(4, h * 0.012);
  l.fillRect(fx - u * 6, fb - u * 3, u * 12, u * 4);
  l.fillRect(fx - u * 2, fb - u * 8, u * 3.2, u * 6);
  l.fillRect(fx + u * 3.5, fb - u * 5, u * 2.2, u * 3);
  l.fillRect(fx + u * 7, fb - u * 12, u * 0.5, u * 10);
  l.fillRect(fx + u * 5.6, fb - u * 11.5, u * 3.3, u * 0.5);
  B.fortX = fx; B.fortY = fb - u * 8;
  /* the shore's lights along the fort, small and warm */
  l.fillStyle = 'rgba(255,190,110,0.9)';
  for (var k = 0; k < 6; k++) l.fillRect(fx - u * 5 + k * u * 2, fb - u * 1.6, Math.max(1, u * 0.35), Math.max(1, u * 0.35));
  B.land = land;

  /* the vignette over everything, so the menu reads against it */
  var vig = _rtsHomeBgLayer(w, h), v = vig.getContext('2d');
  var vg = v.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.2, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(4,7,12,0)'); vg.addColorStop(1, 'rgba(4,7,12,0.72)');
  v.fillStyle = vg; v.fillRect(0, 0, w, h);
  B.vig = vig;

  /* the clouds: soft bands, twice the screen wide, drifting */
  var cl = _rtsHomeBgLayer(w * 2, Math.round(h * 0.5)), q = cl.getContext('2d');
  for (var n = 0; n < 26; n++) {
    var cx = rnd() * w * 2, cy = h * (0.08 + rnd() * 0.36), rx = w * (0.08 + rnd() * 0.16), ry = h * (0.012 + rnd() * 0.02);
    var cg = q.createRadialGradient(cx, cy, 0, cx, cy, rx);
    var warm = cy > h * 0.3;
    cg.addColorStop(0, warm ? 'rgba(170,96,92,0.32)' : 'rgba(70,84,118,0.30)');
    cg.addColorStop(1, 'rgba(70,84,118,0)');
    q.save(); q.translate(cx, cy); q.scale(1, ry / rx); q.translate(-cx, -cy);
    q.fillStyle = cg; q.beginPath(); q.arc(cx, cy, rx, 0, Math.PI * 2); q.fill(); q.restore();
  }
  B.clouds = cl;

  /* the glints on the water: fixed places, each with its own beat */
  B.glints = [];
  for (var m = 0; m < 170; m++) {
    var gy = hz + Math.pow(rnd(), 1.6) * (h - hz);
    B.glints.push({ x: rnd() * w, y: gy, len: (2 + rnd() * 10) * (0.4 + (gy - hz) / (h - hz)) * (w / 900),
                    ph: rnd() * 6.283, sp: 0.6 + rnd() * 1.6 });
  }
  B.shots = [];
}

/* One frame at time t (seconds). */
function _rtsHomeBgFrame(B, t) {
  var c = B.ctx, w = B.w, h = B.h, hz = B.hz;
  c.globalCompositeOperation = 'source-over';
  c.drawImage(B.sky, 0, 0);
  /* clouds drift right to left, a screen every few minutes */
  var off = (t * w * 0.006) % w;
  c.globalAlpha = 0.9; c.drawImage(B.clouds, -off, 0); c.drawImage(B.clouds, w * 2 - off, 0); c.globalAlpha = 1;
  /* the warship on the horizon, crossing in about two minutes */
  var sx = ((t * w / 140) % (w * 1.3)) - w * 0.15, su = Math.max(3, h * 0.008);
  c.fillStyle = '#161a28';
  c.beginPath(); c.moveTo(sx - su * 7, hz); c.lineTo(sx - su * 6, hz - su * 1.2); c.lineTo(sx + su * 6.5, hz - su * 1.2); c.lineTo(sx + su * 7.5, hz); c.fill();
  c.fillRect(sx - su * 2, hz - su * 2.6, su * 4, su * 1.5); c.fillRect(sx - su * 0.4, hz - su * 4, su * 0.8, su * 1.6);
  /* the glints: warm in the sun's road, cool elsewhere */
  c.globalCompositeOperation = 'lighter';
  for (var i = 0; i < B.glints.length; i++) {
    var g = B.glints[i], a = Math.sin(t * g.sp + g.ph);
    if (a < 0.35) continue;
    var road = Math.max(0, 1 - Math.abs(g.x - B.sunX) / (w * 0.05 + (g.y - hz) * 0.5));
    var k = (a - 0.35) / 0.65 * (0.25 + road * 0.75);
    c.fillStyle = road > 0.1 ? 'rgba(255,190,120,' + (k * 0.9).toFixed(3) + ')' : 'rgba(150,180,220,' + (k * 0.35).toFixed(3) + ')';
    c.fillRect(g.x, g.y, g.len, Math.max(1, h / 700));
  }
  /* now and then a gun far down the shore: a flash, and its echo on the water */
  if (!B.next || t > B.next) {
    var rnd = Math.random;
    B.shots.push({ x: w * (0.26 + rnd() * 0.28), t: t });
    B.next = t + 2.5 + rnd() * 5;
  }
  B.shots = B.shots.filter(function (s) { return t - s.t < 0.9; });
  B.shots.forEach(function (s) {
    var age = (t - s.t) / 0.9, r = h * (0.02 + age * 0.03), a = (1 - age) * (1 - age);
    var fg = c.createRadialGradient(s.x, hz - h * 0.01, 0, s.x, hz - h * 0.01, r);
    fg.addColorStop(0, 'rgba(255,214,150,' + (0.85 * a).toFixed(3) + ')'); fg.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = fg; c.fillRect(s.x - r, hz - h * 0.01 - r, r * 2, r * 2);
  });
  c.globalCompositeOperation = 'source-over';
  c.drawImage(B.land, 0, 0);
  /* the lighthouse: its beam turning - long across the water as it swings toward the sea, gone
     behind the headland on the far side of its turn - and its lamp flaring as it faces us */
  c.globalCompositeOperation = 'lighter';
  var ph = t * 0.55, reach = Math.cos(ph), face = Math.max(0, Math.sin(ph));
  if (reach > 0.02) {
    var len = w * 0.55 * reach, half = h * 0.012 + len * 0.035, a0 = 0.22 * Math.sqrt(reach);
    var bg = c.createLinearGradient(B.lampX, 0, B.lampX + len, 0);
    bg.addColorStop(0, 'rgba(255,236,190,' + a0.toFixed(3) + ')'); bg.addColorStop(1, 'rgba(255,236,190,0)');
    c.fillStyle = bg;
    c.beginPath(); c.moveTo(B.lampX, B.lampY - B.lampR * 0.5);
    c.lineTo(B.lampX + len, B.lampY - half + h * 0.004); c.lineTo(B.lampX + len, B.lampY + half + h * 0.012);
    c.lineTo(B.lampX, B.lampY + B.lampR * 0.5); c.closePath(); c.fill();
  }
  var lr = B.lampR * (3 + face * face * 5);
  var lg = c.createRadialGradient(B.lampX, B.lampY, 0, B.lampX, B.lampY, lr);
  lg.addColorStop(0, 'rgba(255,240,200,0.95)'); lg.addColorStop(1, 'rgba(255,220,150,0)');
  c.fillStyle = lg; c.fillRect(B.lampX - lr, B.lampY - lr, lr * 2, lr * 2);
  /* the fort's beacon, blinking */
  if (Math.sin(t * 2.2) > 0.6) {
    c.fillStyle = 'rgba(255,90,70,0.95)'; c.fillRect(B.fortX + h * 0.084, B.fortY - h * 0.05, Math.max(2, h * 0.005), Math.max(2, h * 0.005));
  }
  c.globalCompositeOperation = 'source-over';
  c.drawImage(B.vig, 0, 0);
}

function _rtsHomeBgSize(B) {
  var cv = B.cv, d = Math.min(window.devicePixelRatio || 1, RTS_HOME_BG.dpr);
  var w = Math.max(1, Math.round(cv.clientWidth * d)), h = Math.max(1, Math.round(cv.clientHeight * d));
  if (w === B.w && h === B.h) return;
  cv.width = w; cv.height = h; B.w = w; B.h = h;
  _rtsHomeBgBuild(B);
}
function _rtsHomeBgShown() {
  var home = document.getElementById('rtsHome');
  return !!home && !home.classList.contains('gone') && !document.hidden;
}
function _rtsHomeBgTick(now) {
  var B = _rtsHomeBg;
  B.raf = 0;
  if (!_rtsHomeBgShown()) return;                  /* a battle, or the tab hidden: stop */
  if (!B.t0) B.t0 = now;
  if (now - (B.last || 0) >= 1000 / RTS_HOME_BG.fps - 1) {
    B.last = now; B.frames = (B.frames || 0) + 1;
    _rtsHomeBgSize(B);
    _rtsHomeBgFrame(B, (now - B.t0) / 1000);
  }
  B.raf = requestAnimationFrame(_rtsHomeBgTick);
}
/* Start (or keep) the backdrop going: on boot, and whenever the title comes back. */
function rtsHomeBgStart() {
  var cv = document.getElementById('rtsHomeBg');
  if (!cv || !cv.getContext) return;
  if (!_rtsHomeBg) _rtsHomeBg = { cv: cv, ctx: cv.getContext('2d'), w: 0, h: 0, raf: 0, frames: 0 };
  var B = _rtsHomeBg;
  if (!B.ctx) return;
  var still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (still) { _rtsHomeBgSize(B); _rtsHomeBgFrame(B, 12); B.frames++; return; }
  if (!B.raf && _rtsHomeBgShown()) B.raf = requestAnimationFrame(_rtsHomeBgTick);
}
(function () {
  rtsHomeBgStart();
  var home = document.getElementById('rtsHome');
  /* the title coming back (rtsHome removes .gone) restarts it; so does the tab coming back */
  if (home && window.MutationObserver) new MutationObserver(rtsHomeBgStart).observe(home, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', rtsHomeBgStart);
})();
