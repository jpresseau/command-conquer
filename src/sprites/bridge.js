/* sprites/bridge.js - the bridges, in the 2D picture. Part of rts.sprites; where they are is
   core/bridge.js.

   A bridge's cells are water that land units may cross, and the 2D terrain bake painted them
   as water - so in 2D a column of tanks drove across the open sea. Painted into the bake here,
   after the coast and before anything that stands on the ground: a shadow cast on the water
   down and to the right (the bake's light is from the upper left), the deck, a parapet each
   side with its posts, and an abutment at each shore. */
function _sprDrawBridges(g, G, TS) {
  /* a loaded map draws its own ground, crossings and all - and has no generated bridges anyway */
  if (window._RTS_MAP) return;
  (G.bridges || []).forEach(function (b) {
    /* the deck's rectangle in bake pixels: every cell it covers, corner to corner */
    var ex = b.tx + b.dx * (b.len - 1) + b.px * (b.w - 1), ez = b.tz + b.dz * (b.len - 1) + b.pz * (b.w - 1);
    var rx = Math.min(b.tx, ex) * TS, rz = Math.min(b.tz, ez) * TS;
    var rw = (Math.abs(ex - b.tx) + 1) * TS, rh = (Math.abs(ez - b.tz) + 1) * TS;
    /* a pixel in from the water either side */
    if (b.px) { rx += 1; rw -= 2; } else { rz += 1; rh -= 2; }
    g.save();
    /* shadow on the water */
    g.fillStyle = 'rgba(8, 16, 28, 0.38)';
    g.fillRect(rx + TS * 0.25, rz + TS * 0.3, rw, rh);
    /* deck */
    g.fillStyle = '#5f5d58';
    g.fillRect(rx, rz, rw, rh);
    /* a little tone along the run, so it is not a flat swatch */
    g.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (var k = 0; k < b.len; k++) if (k & 1) {
      var sx = (b.tx + b.dx * k) * TS, sz = (b.tz + b.dz * k) * TS;
      g.fillRect(b.px ? rx : sx, b.pz ? rz : sz, b.px ? rw : TS, b.pz ? rh : TS);
    }
    /* parapets: a pale rail down each side, posts on it every half cell */
    var pw = Math.max(2, TS / 8);
    g.fillStyle = '#b3aea1';
    if (b.px) { g.fillRect(rx, rz, pw, rh); g.fillRect(rx + rw - pw, rz, pw, rh); }
    else { g.fillRect(rx, rz, rw, pw); g.fillRect(rx, rz + rh - pw, rw, pw); }
    g.fillStyle = '#7d796f';
    for (var p = 0; p <= b.len * 2; p++) {
      var t = p * TS / 2;
      if (b.px) { g.fillRect(rx, rz + t - 1, pw, 2); g.fillRect(rx + rw - pw, rz + t - 1, pw, 2); }
      else { g.fillRect(rx + t - 1, rz, 2, pw); g.fillRect(rx + t - 1, rz + rh - pw, 2, pw); }
    }
    /* abutments: a block of stone where the deck meets each shore */
    g.fillStyle = '#8a857a';
    var ab = TS * 0.3;
    if (b.px) { g.fillRect(rx - 2, rz - ab / 2, rw + 4, ab); g.fillRect(rx - 2, rz + rh - ab / 2, rw + 4, ab); }
    else { g.fillRect(rx - ab / 2, rz - 2, ab, rh + 4); g.fillRect(rx + rw - ab / 2, rz - 2, ab, rh + 4); }
    g.restore();
  });
}
