/* render3d/soldier3d.js - a soldier worth zooming in on. Part of rts.render3d.

   The infantry model is the sprite baker's (sprites/unit-ground.js): a stack of boxes authored
   to read at twenty-two art pixels, where a limb is under a pixel wide and nothing finer
   survives the bake. The 3D mode draws the same man a hundred and more pixels tall, and there
   he was a bollard with a hat - so this is a second model of him for the 3D mode alone, built
   from the rounded parts this renderer can draw: limbs as tapered tubes between joints
   (_r3dLimb, forest3d.js), a head, a helmet, webbing over a torso that narrows to the waist, a
   pack, and a rifle held across the body in both hands. The sprite model is untouched, so the
   cameo and everything measured on its sprites stay exactly as they were.

   THE SAME MAN, NOT A NEW ONE. Same size (_sprUnitScale, the sprite model's own fit), same
   pair offset off the facing grid, same identity colours: the helmet's crown is the unit's
   marker and the uniform the team colour or the kit's (RTS_INF_KIT), so a medic is still the
   white one and a flamer still carries two bright tanks.

   AND HE WALKS. The sprite mesh is one pose and the 3D mode bobbed it up and down to suggest a
   march. There are four stride poses here - legs swinging, arms following, the back knee
   bending - and scene3d.js picks one by the unit's own gait while it is on the move, so a squad
   crossing the field is two men walking rather than two statues hopping. */

var R3D_STRIDE = 0.46;          /* how far a leg swings from upright at full stride, radians */

/* A ball, for joints and heads: rings of latitude, a normal straight out from the centre. */
function _r3dBall(out, x, y, z, r, col, seg, rings) {
  seg = seg || 12; rings = rings || 8;
  for (var j = 0; j < rings; j++) {
    var a0 = (j / rings - 0.5) * Math.PI, a1 = ((j + 1) / rings - 0.5) * Math.PI;
    for (var i = 0; i < seg; i++) {
      var b0 = i / seg * Math.PI * 2, b1 = (i + 1) / seg * Math.PI * 2, P = [], k;
      var pts = [[a0, b1], [a0, b0], [a1, b0], [a1, b1]];
      for (k = 0; k < 4; k++) {
        var ca = Math.cos(pts[k][0]);
        P.push([ca * Math.cos(pts[k][1]), Math.sin(pts[k][0]), ca * Math.sin(pts[k][1])]);
      }
      _r3F(out, P.map(function (n) { return [x + n[0] * r, y + n[1] * r, z + n[2] * r]; }), col, P);
    }
  }
}

/* One man at (mx, mz), facing +x. `pose` 0 stands; 1 to 4 are the stride, a quarter cycle
   apart. */
function _r3dSoldierMan(m, key, mx, mz, pose, lead, K) {
  var BD = K.BD, BL = K.BL, HD = K.HD, HL = K.HL, SK = K.SK, DK = K.DK, S = K.S, kit = K.kit;
  var ph = pose ? (pose - 1) / 4 * Math.PI * 2 : 0;
  var sw = pose ? Math.cos(ph) * R3D_STRIDE * lead : 0.12 * lead;       /* + swings the near leg on */
  var lift = pose ? Math.max(0, Math.sin(ph)) : 0;
  var hipY = 3.05 - (pose ? 0.12 * Math.abs(Math.cos(ph)) : 0);        /* lower at full stride */
  /* LEGS: thigh and shin as tubes, a knee between, a boot at the end */
  for (var s = -1; s <= 1; s += 2) {
    var th = sw * s, z = mz + s * 0.72;
    var bend = (th < 0 ? 0.55 : 0.15) + lift * 0.35 * (s > 0 ? 1 : 0);
    var kx = mx + Math.sin(th) * 1.55, ky = hipY - Math.cos(th) * 1.55;
    var fx = kx + Math.sin(th - bend) * 1.5, fy = Math.max(0.28, ky - Math.cos(th - bend) * 1.5);
    _r3dLimb(m, mx, hipY, z, kx, ky, z, 0.74, 0.6, 10, DK[1]);
    _r3dBall(m, kx, ky, z, 0.6, DK[1], 8, 5);
    _r3dLimb(m, kx, ky, z, fx, fy, z, 0.6, 0.48, 10, DK[1]);
    _r3Box(m, fx + 0.3, fy - 0.3, z, 1.4, 0.62, 0.78, DK[2], DK[0]);     /* boot */
  }
  /* TORSO: a waist narrower than the chest, the unit's colour, leaning a little into the walk */
  var lean = pose ? 0.35 : 0.15, cx = mx + lean, cy = 5.45;
  _r3dLimb(m, mx, hipY - 0.2, mz, cx, cy, mz, 1.32, 1.66, 14, BD);
  _r3Cyl(m, cx, cy - 0.05, mz, 1.66, 0.25, BL, BL, 14);                  /* shoulders' top */
  _r3dLimb(m, mx, hipY - 0.05, mz, mx + 0.02, hipY + 0.45, mz, 1.44, 1.44, 14, DK[2]);   /* belt */
  _r3Box(m, mx + 1.3, hipY + 0.15, mz, 0.35, 0.5, 0.6, S[2], S[3]);     /* buckle */
  /* webbing: two straps and pouches on the chest, where the camera sees them */
  _r3Box(m, cx - 0.1, hipY + 0.5, mz - 0.72, 2.9, 2.0, 0.36, DK[2], DK[1]);
  _r3Box(m, cx - 0.1, hipY + 0.5, mz + 0.72, 2.9, 2.0, 0.36, DK[2], DK[1]);
  _r3Box(m, cx + 1.2, hipY + 0.7, mz - 0.6, 0.55, 0.8, 0.7, DK[1], DK[0]);
  _r3Box(m, cx + 1.2, hipY + 0.7, mz + 0.6, 0.55, 0.8, 0.7, DK[1], DK[0]);
  _r3Slab(m, mx - 1.65, hipY + 0.6, mz, 1.4, 2.4, 2.6, 0.35, DK[1], DK[0]);  /* pack */
  /* NECK, HEAD, HELMET. The helmet is wide and the crown is the unit's marker, as on the
     sprite: it is the patch the camera looks straight down on */
  _r3dLimb(m, cx, cy, mz, cx + 0.05, cy + 0.55, mz, 0.42, 0.4, 10, SK);
  _r3dBall(m, cx + 0.12, cy + 1.05, mz, 0.8, SK, 12, 8);
  _r3Cyl(m, cx, cy + 1.25, mz, 1.45, 0.24, HD, HD, 20);                  /* brim */
  _r3Cone(m, cx, cy + 1.49, mz, 1.34, 1.12, 0.44, HD, 20);               /* the rounded crown */
  _r3Cyl(m, cx, cy + 1.92, mz, 1.13, 0.18, HL, HL, 20);                  /* the marker */
  /* ARMS and what they carry */
  var arm = pose ? Math.cos(ph) * 0.35 * lead : 0;
  function armTo(zs, ex, ey, ez, hx, hy, hz) {
    var sx = cx - 0.05, sy = cy - 0.25, sz = mz + zs * 1.55;
    _r3dBall(m, sx, sy, sz, 0.66, BD, 10, 6);
    _r3dLimb(m, sx, sy, sz, ex, ey, ez, 0.55, 0.45, 10, BD);
    _r3dLimb(m, ex, ey, ez, hx, hy, hz, 0.45, 0.36, 10, BD);
    _r3dBall(m, hx, hy, hz, 0.4, SK, 8, 5);
  }
  if (key === 'rocket') {
    /* the launcher on the right shoulder, long enough to stand proud both ends */
    armTo(-1, cx + 0.9, cy - 0.6, mz - 1.5, cx + 1.9, cy + 0.2, mz - 1.3);
    armTo(1, cx + 1.0, cy - 1.0, mz + 1.2, cx + 1.6, cy - 0.4, mz + 0.2);
    _r3dLimb(m, cx - 4.2, cy + 0.55, mz - 1.3, cx + 4.6, cy + 0.55, mz - 1.3, 0.62, 0.62, 16, S[1]);
    _r3dLimb(m, cx - 4.6, cy + 0.55, mz - 1.3, cx - 3.8, cy + 0.55, mz - 1.3, 0.8, 0.72, 16, DK[0]);
    _r3Box(m, cx + 1.4, cy + 1.0, mz - 1.3, 1.0, 0.6, 0.4, DK[2], DK[1]);    /* sight */
  } else if (key === 'flame') {
    armTo(-1, cx + 0.9, cy - 1.3 + arm * 0.3, mz - 1.2, cx + 2.0, cy - 1.0, mz - 0.6);
    armTo(1, cx + 0.8, cy - 1.4, mz + 1.2, cx + 1.9, cy - 1.1, mz + 0.2);
    _r3Cyl(m, mx - 1.9, hipY, mz - 0.75, 0.72, 4.4, kit.prop, '#f7c93a', 16);
    _r3Cyl(m, mx - 1.9, hipY, mz + 0.75, 0.72, 4.4, kit.prop, '#f7c93a', 16);
    _r3dLimb(m, cx + 1.4, cy - 1.1, mz - 0.4, cx + 4.6, cy - 0.8, mz - 0.2, 0.3, 0.24, 10, DK[1]);
    _r3dBall(m, cx + 4.7, cy - 0.78, mz - 0.2, 0.3, '#e8531c', 8, 5);
  } else if (key === 'engineer') {
    armTo(-1, cx + 0.5 + arm, cy - 1.5, mz - 1.5, cx + 0.9 + arm, cy - 2.6, mz - 1.6);
    armTo(1, cx - 0.2 - arm, cy - 1.5, mz + 1.5, cx - 0.1 - arm, cy - 2.7, mz + 1.6);
    _r3Box(m, cx + 0.9 + arm, cy - 4.4, mz - 1.6, 2.0, 1.5, 1.0, kit.prop, S[1]);   /* toolbox */
    _r3Box(m, cx + 0.9 + arm, cy - 2.95, mz - 1.6, 1.2, 0.25, 0.3, S[1], S[3]);    /* handle */
  } else if (key === 'medic') {
    armTo(-1, cx + 0.5 + arm, cy - 1.5, mz - 1.5, cx + 1.0 + arm, cy - 2.5, mz - 1.5);
    armTo(1, cx - 0.2 - arm, cy - 1.5, mz + 1.5, cx - 0.1 - arm, cy - 2.7, mz + 1.6);
    _r3Box(m, cx + 1.0 + arm, cy - 4.0, mz - 1.5, 1.6, 1.2, 1.0, '#eaeae0', '#ffffff');  /* bag */
    /* the red cross, flat on the pack, where the camera sees it */
    _r3Box(m, mx - 1.35, hipY + 2.85, mz, 0.9, 0.2, 2.2, kit.prop, kit.prop);
    _r3Box(m, mx - 1.35, hipY + 2.85, mz, 2.2, 0.2, 0.9, kit.prop, kit.prop);
  } else if (key === 'thief') {
    armTo(-1, cx + 0.5 + arm, cy - 1.5, mz - 1.5, cx + 1.0 + arm, cy - 2.5, mz - 1.5);
    armTo(1, cx - 0.2 - arm, cy - 1.5, mz + 1.5, cx - 0.1 - arm, cy - 2.7, mz + 1.6);
    _r3Box(m, mx + 0.6, hipY - 0.6, mz + 1.5, 1.8, 1.6, 1.0, kit.prop, S[1]);       /* satchel */
  } else if (key === 'tanya') {
    armTo(-1, cx + 1.2, cy - 0.8, mz - 1.4, cx + 2.4, cy - 0.5, mz - 1.3);
    armTo(1, cx + 1.2, cy - 0.8, mz + 1.4, cx + 2.4, cy - 0.5, mz + 1.3);
    _r3Box(m, cx + 3.0, cy - 0.65, mz - 1.3, 1.4, 0.5, 0.35, kit.prop, DK[3]);    /* pistols */
    _r3Box(m, cx + 3.0, cy - 0.65, mz + 1.3, 1.4, 0.5, 0.35, kit.prop, DK[3]);
  } else if (key === 'grenadier') {
    armTo(-1, cx - 1.0, cy + 0.4, mz - 1.5, cx - 1.6, cy + 1.5, mz - 1.3);           /* cocked */
    armTo(1, cx + 1.1, cy - 1.0, mz + 1.3, cx + 1.9, cy - 0.6, mz + 0.6);
    _r3dBall(m, cx - 1.75, cy + 1.95, mz - 1.3, 0.55, kit.prop, 10, 6);
    for (var g = 0; g < 3; g++) _r3dBall(m, mx + 0.9, hipY + 0.25, mz - 0.8 + g * 0.8, 0.3, '#d9a13c', 8, 5);
  } else {
    /* THE RIFLE, held across the body in both hands: stock at the right shoulder, the muzzle
       forward and down a little, a magazine under it */
    var r0x = cx + 0.4, r0y = cy - 0.55, r0z = mz - 0.95, r1x = cx + 4.2, r1y = cy - 0.95, r1z = mz - 0.05;
    armTo(-1, cx + 0.7, cy - 1.5, mz - 1.5, cx + 1.25, cy - 0.85, mz - 0.75);
    armTo(1, cx + 1.9, cy - 1.2, mz + 1.0, cx + 2.75, cy - 0.85, mz - 0.35);
    _r3dLimb(m, r0x - 0.6, r0y + 0.05, r0z - 0.1, r1x, r1y, r1z, 0.36, 0.28, 8, kit.prop);
    _r3dLimb(m, r1x, r1y, r1z, r1x + 1.5, r1y - 0.15, r1z + 0.05, 0.14, 0.14, 8, DK[3]);  /* barrel */
    _r3Box(m, cx + 2.0, cy - 1.65, mz - 0.5, 0.45, 0.8, 0.3, DK[2], DK[1]);          /* magazine */
  }
}

/* The squad as the sprite model lays it out - two men off the facing grid, a hero alone - at
   the sprite model's own scale. Prone, they lie and crawl (render3d/crawl3d.js). */
function _r3dSoldierModel(key, side, prone, pose) {
  if (key === 'dog') return null;
  var TM = RTS_PAL.team[side], kit = RTS_INF_KIT[key] || RTS_INF_KIT.rifle;
  var K = { kit: kit, DK: RTS_PAL.dark, S: RTS_PAL.steel, SK: '#c8a882',
            BD: kit.body ? kit.body[0] : TM[0], BL: kit.body ? kit.body[1] : TM[1],
            HD: TM[2], HL: kit.top || TM[3] };
  var m = [], men = (key === 'tanya') ? [[0, 0]] : [[3.6, -1.5], [-3.6, 1.5]];
  for (var i = 0; i < men.length; i++) {
    /* the two men step off on opposite feet, so a squad does not march in lockstep */
    var pi = pose ? ((pose - 1 + i * 2) % 4) + 1 : 0;
    if (prone) _r3dCrawlMan(m, key, men[i][0], men[i][1], pi, K);
    else _r3dSoldierMan(m, key, men[i][0], men[i][1], pi, i ? -1 : 1, K);
  }
  var sc = _sprUnitScale(key);
  return sc === 1 ? m : _r3Scale(m, sc);
}

/* The pose a soldier is drawn in: 0 standing, 1 to 4 through the stride while it moves - a
   full stride about every 0.8 seconds, started at its own gait so a squad is out of step. */
function _r3dSoldierPose(e, t) {
  if (!e.path || e.prone) return 0;
  return 1 + (Math.floor(t * 5 + (e.gait || 0) * 0.5) & 3);
}
