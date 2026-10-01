/* render/sky2d.js - the time of day and the weather, in the 2D picture. Part of rts.render; the
   skies themselves are render3d/sky3d.js, which both renderers read.

   The 2D battlefield is baked art, so the hour is laid over it rather than lit into it: the
   lit side's colour multiplied over the whole frame, then the haze, then - at dusk, at night
   and in rain - a warm pool round every building's door and ahead of every vehicle on the
   move, added back. The rain is streaks across the screen. Drawn over the finished
   battlefield and under the post pass (render/frame.js), so the HUD and the overlay keep
   their own colours. */
function _rtsSky2D(g, G) {
  if (typeof _rtsSkyName !== 'function' || !G) return;
  var S = _rtsSkyNow(G);
  if (!S || S === R3D_SKIES.day) return;
  var cv = g.canvas, W = cv.width, H = cv.height, i;
  var dpr = W / (cv.clientWidth || W);
  function c255(v) { return Math.max(0, Math.min(255, Math.round(v * 255))); }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgb(' + c255(S.L[0]) + ',' + c255(S.L[1]) + ',' + c255(S.L[2]) + ')';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  if (S.haze[3] > 0) {
    g.fillStyle = 'rgba(' + c255(S.haze[0]) + ',' + c255(S.haze[1]) + ',' + c255(S.haze[2]) + ',' + S.haze[3] + ')';
    g.fillRect(0, 0, W, H);
  }
  /* the lamps, added back */
  if (S.night > 0) {
    g.globalCompositeOperation = 'lighter';
    var zr = (typeof _rtsZoom === 'function' ? _rtsZoom() : 1) * dpr, E = G.ents || [];
    var pool = function (x, z, r, a) {
      var p = _rtsGroundToScreen(x, z), px = p.x * dpr, py = p.y * dpr, rr = r * zr;
      if (px < -rr || py < -rr || px > W + rr || py > H + rr) return;
      var gr = g.createRadialGradient(px, py, 0, px, py, rr);
      gr.addColorStop(0, 'rgba(255,200,130,' + (a * S.night).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,200,130,0)');
      g.fillStyle = gr;
      g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    };
    for (i = 0; i < E.length; i++) {
      var e = E[i];
      if (e.dead) continue;
      if (e.type === 'struct' && !e.building) {
        var d = rtsStructDef(e.def);
        if (d && !d.wall) pool(e.x, e.z + d.h * RTS_TILE / 2 + 1, 5 + d.w * 1.5, 0.45);
      } else if (e.type === 'unit' && !e.air && e.path) {
        var ud = rtsUnitDef(e.def);
        if (ud && ud.kind === 'vehicle' && !ud.sea) pool(e.x + Math.cos(e.rot) * 4, e.z + Math.sin(e.rot) * 4, 5, 0.4);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
  /* the rain: streaks down and across the screen, each on its own short fall */
  if (S.rain > 0) {
    var t = G.t || 0, m = Math.round(W * H / 5200);
    g.strokeStyle = 'rgba(200,215,235,0.35)';
    g.lineWidth = Math.max(1, dpr);
    g.beginPath();
    for (i = 0; i < m; i++) {
      var ph = _sprHash(i, 3, 991), cyc = t / 0.45 + ph, ep = Math.floor(cyc), p = cyc - ep;
      var x0 = _sprHash(i, ep, 993) * W, y0 = (_sprHash(ep, i, 997) * 1.2 - 0.2) * H + p * H * 0.25;
      g.moveTo(x0, y0); g.lineTo(x0 - 4 * dpr, y0 + 16 * dpr);
    }
    g.stroke();
  }
  /* the sandstorm: ochre streaks driven across the screen on the wind */
  if (S.sand > 0) {
    var td = G.t || 0, nd = Math.round(W * H / 3000);
    g.strokeStyle = 'rgba(222,176,112,0.45)';
    g.lineWidth = Math.max(1, dpr);
    g.beginPath();
    for (i = 0; i < nd; i++) {
      var dp = _sprHash(i, 9, 971), dc = td / 0.7 + dp, de = Math.floor(dc), dq = dc - de;
      var dx = (_sprHash(i, de, 973) * 1.3 - 0.3) * W + dq * W * 0.3, dy = _sprHash(de, i, 977) * H;
      g.moveTo(dx, dy); g.lineTo(dx + 22 * dpr, dy + 3 * dpr);
    }
    g.stroke();
  }
  /* the lightning: the bolt, from the top of the screen to where it strikes (_rtsBoltAt) */
  if (S.flash > 0.05 && typeof _rtsLightning === 'function') {
    var bolt = _rtsBoltAt(_rtsLightning(G.t || 0).n), fx0 = bolt.u * W, fy0 = bolt.v * H, bs = fy0 / 26;
    g.strokeStyle = 'rgba(225,232,255,' + Math.min(1, S.flash * 1.4).toFixed(3) + ')';
    g.lineWidth = 3 * dpr;
    g.beginPath();
    bolt.pts.forEach(function (p, k) { var px = fx0 + p[0] * bs * 2, py = fy0 - p[1] * bs; if (k) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
  }
  /* the snow: soft white flakes drifting down */
  if (S.snow > 0) {
    var ts = G.t || 0, ns = Math.round(W * H / 4200);
    g.fillStyle = 'rgba(245,248,252,0.8)';
    for (i = 0; i < ns; i++) {
      var sp = _sprHash(i, 5, 983), sc = ts / 3 + sp, se = Math.floor(sc), sq = sc - se;
      var sx = (_sprHash(i, se, 985) * W + Math.sin(ts * 1.3 + i) * 6 * dpr), sy = (_sprHash(se, i, 987) * 0.4 + sq) * H;
      g.beginPath(); g.arc(sx, sy % H, (1 + _sprHash(i, 7, 989)) * dpr, 0, 6.283); g.fill();
    }
  }
  g.restore();
}
