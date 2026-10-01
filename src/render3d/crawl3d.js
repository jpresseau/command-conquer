/* render3d/crawl3d.js - a soldier on his belly. Part of rts.render3d.

   Under fire the infantry go prone (core/combat.js, _rtsFearAI), and a prone squad that is
   ordered on CRAWLS (RTS_PRONE_SPEED). The 3D mode drew that as the sprite's prone pose: a
   block, a cube and a plate, still while it moved. This is the same man as soldier3d.js,
   lying down - legs out behind, up on his elbows, head raised under the helmet, weapon
   forward - and four crawl poses: one knee drawn up and the other arm reaching, then the
   other side, the way a man crawls.

   THE CAMERA STILL READS HIM BY HIS HELMET. Lying down the helmet's crown is still the highest
   thing on him, so the unit's marker stays the patch the camera looks straight down on, and
   what he carries rides low on his back. */

var R3D_CRAWL_KNEE = 1.25;      /* how far forward a drawn-up knee comes, model units */

/* One man at (mx, mz), head toward +x. `pose` 0 lies still with the weapon braced; 1 to 4 are
   the crawl, a quarter cycle apart. */
function _r3dCrawlMan(m, key, mx, mz, pose, K) {
  var BD = K.BD, BL = K.BL, HD = K.HD, HL = K.HL, SK = K.SK, DK = K.DK, S = K.S, kit = K.kit;
  var ph = pose ? (pose - 1) / 4 * Math.PI * 2 : 0;
  var hipX = mx - 1.5, cx = mx + 1.4, hy = 0.95, cy = 1.15;
  /* LEGS: out behind him, a little apart; a crawling man draws one knee up and out */
  for (var s = -1; s <= 1; s += 2) {
    var z = mz + s * 0.7, up = pose ? 0.5 + 0.5 * Math.sin(ph) * -s : 0;
    var kx = hipX - 1.5 + up * R3D_CRAWL_KNEE, kz = z + s * (0.15 + up * 1.0);
    var fx = kx - 1.45 + up * 0.35, fz = kz - s * up * 0.3;
    _r3dLimb(m, hipX, hy, z, kx, 0.62, kz, 0.72, 0.58, 10, DK[1]);
    _r3dBall(m, kx, 0.62, kz, 0.58, DK[1], 8, 5);
    _r3dLimb(m, kx, 0.62, kz, fx, 0.5, fz, 0.58, 0.46, 10, DK[1]);
    _r3Box(m, fx - 0.25, 0.05, fz, 0.7, 0.9, 0.78, DK[2], DK[0]);           /* boot, toe down */
  }
  /* TORSO: lying along the ground, chest a little higher than the hips - up on the elbows */
  _r3dLimb(m, hipX, hy, mz, cx, cy, mz, 1.18, 1.32, 14, BD);
  _r3dLimb(m, hipX - 0.1, hy, mz, hipX + 0.4, hy + 0.05, mz, 1.26, 1.26, 14, DK[2]);   /* belt */
  /* NECK, HEAD AND HELMET, the head up to look where he is going */
  var hx = cx + 1.25, hyy = 1.95;
  _r3dLimb(m, cx, cy + 0.3, mz, hx - 0.3, hyy - 0.2, mz, 0.42, 0.4, 10, SK);
  _r3dBall(m, hx, hyy, mz, 0.78, SK, 12, 8);
  _r3Cyl(m, hx - 0.1, hyy + 0.18, mz, 1.4, 0.22, HD, HD, 20);              /* brim */
  _r3Cone(m, hx - 0.1, hyy + 0.4, mz, 1.3, 1.08, 0.42, HD, 20);            /* the crown */
  _r3Cyl(m, hx - 0.1, hyy + 0.82, mz, 1.09, 0.16, HL, HL, 20);             /* the marker */
  /* ARMS: on the elbows, one reaching forward while the other draws back */
  var hands = [];
  for (var a = -1; a <= 1; a += 2) {
    var reach = pose ? Math.sin(ph) * a * 0.7 : 0.2;
    var sx = cx - 0.1, sz = mz + a * 1.35, ex = cx + 0.9 + reach, ez = mz + a * 1.7;
    var wx = ex + 1.5 + reach * 0.4, wz = mz + a * 0.55;
    _r3dBall(m, sx, cy + 0.2, sz, 0.6, BD, 10, 6);
    _r3dLimb(m, sx, cy + 0.2, sz, ex, 0.45, ez, 0.52, 0.44, 10, BD);
    _r3dLimb(m, ex, 0.45, ez, wx, 0.7, wz, 0.44, 0.36, 10, BD);
    _r3dBall(m, wx, 0.7, wz, 0.38, SK, 8, 5);
    hands.push([wx, wz]);
  }
  var hR = hands[0], hL = hands[1], fwd = Math.max(hR[0], hL[0]);
  /* WHAT HE CARRIES, low on his back or out in front of him */
  if (key === 'rocket') {
    _r3dLimb(m, mx - 3.4, 1.75, mz - 0.9, mx + 4.4, 1.75, mz - 0.9, 0.55, 0.55, 16, S[1]);
    _r3dLimb(m, mx - 3.8, 1.75, mz - 0.9, mx - 3.1, 1.75, mz - 0.9, 0.72, 0.66, 16, DK[0]);
  } else if (key === 'flame') {
    for (var t = -1; t <= 1; t += 2)
      _r3dLimb(m, hipX - 0.2, 1.75, mz + t * 0.62, hipX + 2.6, 1.75, mz + t * 0.62, 0.6, 0.6, 14, kit.prop);
    _r3dLimb(m, hR[0], 0.75, hR[1], fwd + 2.6, 0.8, mz - 0.2, 0.28, 0.22, 10, DK[1]);
    _r3dBall(m, fwd + 2.7, 0.8, mz - 0.2, 0.28, '#e8531c', 8, 5);
  } else if (key === 'medic' || key === 'engineer' || key === 'thief') {
    _r3Box(m, hipX + 1.4, 1.55, mz, 2.4, 0.75, 2.0, kit.prop === '#c8302a' ? '#eaeae0' : kit.prop, DK[1]);
    if (key === 'medic') {
      _r3Box(m, hipX + 1.4, 2.3, mz, 0.7, 0.12, 1.8, kit.prop, kit.prop);   /* the red cross */
      _r3Box(m, hipX + 1.4, 2.3, mz, 1.8, 0.12, 0.7, kit.prop, kit.prop);
    }
  } else if (key === 'tanya') {
    _r3Box(m, hR[0] + 0.7, 0.55, hR[1], 1.4, 0.5, 0.35, kit.prop, DK[3]);   /* pistols */
    _r3Box(m, hL[0] + 0.7, 0.55, hL[1], 1.4, 0.5, 0.35, kit.prop, DK[3]);
  } else {
    /* the rifle, out in front between the hands, the muzzle on the line he is crawling */
    _r3dLimb(m, cx + 0.2, 0.95, mz - 0.6, fwd + 1.6, 0.8, mz - 0.15, 0.34, 0.26, 8, kit.prop);
    _r3dLimb(m, fwd + 1.6, 0.8, mz - 0.15, fwd + 3.0, 0.78, mz - 0.1, 0.13, 0.13, 8, DK[3]);
    if (key === 'grenadier')
      for (var g = 0; g < 3; g++) _r3dBall(m, hipX + 0.6, 1.9, mz - 0.8 + g * 0.8, 0.3, '#d9a13c', 8, 5);
  }
  if (key !== 'flame' && key !== 'medic' && key !== 'engineer' && key !== 'thief')
    _r3Box(m, hipX + 0.5, 1.5, mz, 2.2, 0.75, 2.3, DK[1], DK[0]);           /* pack, low */
}

/* The pose a prone soldier is drawn in: 0 lying still; 1 to 4 through the crawl while he is on
   the move - slower than a walk, about one full crawl cycle every 1.6 seconds. */
function _r3dCrawlPose(e, t) {
  if (!e.path || !e.prone) return 0;
  return 1 + (Math.floor(t * 2.5 + (e.gait || 0) * 0.5) & 3);
}
