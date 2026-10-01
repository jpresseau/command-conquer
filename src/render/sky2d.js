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
  var n = window.RTS_SKY_FORCE || _rtsSkyName(G), S = R3D_SKIES[n];
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
  g.restore();
}
