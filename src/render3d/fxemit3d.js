/* render3d/fxemit3d.js - what each effect IS: a handful of shaded quads, placed from its age
   alone. Part of rts.render3d; fxglsl3d.js shades them and fx3d.js draws them.

   STATELESS, AND THAT IS A DESIGN DECISION RATHER THAN A SHORTCUT. Everything below is a
   function of the effect record, its age and the game clock - nothing is remembered between
   frames. So a paused game shows a frozen fireball, a spec that renders one frame at a chosen
   age gets that age exactly, a save restores mid-explosion, and there is no particle list to
   leak, to sync with G.fx, or to disagree with it. The simulation already carries what a
   particle system would have been for: a fireball CHAINS into a small fire and the fire into
   smoke (RTS_ANIMS), so a blast's long tail is still a record in G.fx for eleven seconds.

   THE ONE HAND-OFF. A fireball's own record lasts 0.75s, and its billows should roll on for
   longer than that. When the record metamorphoses into the small fire it leaves behind, the
   fire's first loop is still that same blast: same position, so the same seed, and an age that
   carries straight on from where the fireball's stopped. So the billows continue from the fire's
   record, with nothing kept anywhere to remember them. */

/* In world units of DEPTH: how far a quad is pulled toward the eye so the ground in front of it
   does not cut off its lower half. Over half of a large blast's height, under a building's -
   the gap between those is wide enough that this needs no tuning. See fx3d.js. */
var R3D_FX_LIFT = 2.2;

/* WHETHER THE SHADED EFFECTS ARE DRAWING: not under RTS_FX_SPRITES, the before-picture, and not
   on a device that could not build their program (fx3d.js falls back to the sprites). */
function _r3dFxShaded() {
  var R3 = window._R3D;
  return !(typeof RTS_FX_SPRITES !== 'undefined' && RTS_FX_SPRITES) && !(R3 && R3.fx2Fail);
}
/* Which effects this pass owns. The nuke's mushroom, a soldier's death and the old single
   `fire` keep their 2D path: one-offs with their own artwork and anchoring. Tracers and flying
   debris are lines and chunks the sprite quads could not draw, so they are this pass's only
   when it is shading - and so are the rounds in flight in G.proj (_r3dFxProj). render/fx.js
   asks this, so the two sides cannot disagree about who draws what. */
function _r3dFxOwns(kind) {
  if (kind === 'nuke' || kind === 'die' || kind === 'fire') return false;
  if (kind === 'tracer' || kind === 'debris') return _r3dFxShaded();
  return true;
}

var R3D_FXT_BLOB = 1, R3D_FXT_FLASH = 2, R3D_FXT_SPARK = 3, R3D_FXT_RING = 4,
    R3D_FXT_LIGHT = 5, R3D_FXT_SPRAY = 6, R3D_FXT_FLAME = 7, R3D_FXT_STREAK = 8, R3D_FXT_TRAIL = 9;
/* floats a vertex: position 3, quad-local xy + lift + type 4, age/seed/opacity/heat 4, tint 3 */
var R3D_FX_STRIDE = 14;
var R3D_FX_QUAD = 6 * R3D_FX_STRIDE;

/* In depth units: clear of the swell's crests (wave3d.js), which rise over a patch laid on the sea */
var R3D_FX_SEA_LIFT = 1.6;
/* A fireball's radius at big 1, in world units - about the visible body of the sprite it
   replaced, which was 4.95 units across with its transparent margin. */
var R3D_FX_R = 1.9;

/* the colours things are, lit side; the shader takes the shaded side from these */
var R3D_FX_SMOKE = [0.46, 0.42, 0.38];
var R3D_FX_SOOT = [0.30, 0.29, 0.28];
var R3D_FX_DUST = [0.70, 0.62, 0.48];
var R3D_FX_FOAM = [0.94, 0.97, 0.98];
var R3D_FX_SPARKC = [1.0, 0.78, 0.42];
var R3D_FX_DROPS = [0.80, 0.90, 0.96];
var R3D_FX_GLARE = [1.35, 0.72, 0.30];
var R3D_FX_BOLT = [1.0, 0.72, 0.36];        /* a shell's glow */
var R3D_FX_ROUND = [1.0, 0.94, 0.72];       /* a rifle or machine-gun round */
var R3D_FX_TRAILC = [0.74, 0.72, 0.70];     /* a rocket's smoke, lit side */
var R3D_FX_CHUNK = [0.16, 0.15, 0.14];      /* debris */

function _r3dFxH(a, b) { var h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }
function _r3dFxSmooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/* A batch: vertices, and one sort key a quad (its depth toward the eye). */
function _r3dFxBatch() { return { a: new Float32Array(R3D_FX_QUAD * 64), key: new Float32Array(64), n: 0, v: 0 }; }
/* Everything a frame's emission needs: the two batches, and where the sorted copy goes. `gnd`
   scales what an effect puts on the GROUND - its glare and its rings - and is R3.fxGroundAmt,
   there so a spec can take those out and measure the fire alone, as R3.aoAmt does for the
   occlusion (resolve3d.js). */
function _r3dFxView() { return { M: _r3dFxBatch(), L: _r3dFxBatch(), out: new Float32Array(R3D_FX_QUAD * 64), ord: [], gnd: 1 }; }

/* BACK TO FRONT. Smoke is blended, and blending is ordered: a far puff drawn over a near one
   shows through it. Additive light does not care, and is sorted along with the rest. Returns
   the main batch, reordered, ready to upload. */
function _r3dFxOrder(V) {
  var M = V.M, ord = V.ord, i;
  ord.length = M.n;
  for (i = 0; i < M.n; i++) ord[i] = i;
  ord.sort(function (a, b) { return M.key[a] - M.key[b]; });
  if (V.out.length < M.n * R3D_FX_QUAD) V.out = new Float32Array(M.a.length);
  for (i = 0; i < M.n; i++) V.out.set(M.a.subarray(ord[i] * R3D_FX_QUAD, (ord[i] + 1) * R3D_FX_QUAD), i * R3D_FX_QUAD);
  return V.out.subarray(0, M.n * R3D_FX_QUAD);
}
function _r3dFxQuad(B, key) {
  if (B.n >= B.key.length) {
    var ka = new Float32Array(B.key.length * 2); ka.set(B.key); B.key = ka;
    var na = new Float32Array(B.a.length * 2); na.set(B.a); B.a = na;
  }
  B.key[B.n] = key;
  B.v = B.n * R3D_FX_QUAD;
  B.n++;
}
function _r3dFxV(B, x, y, z, qx, qy, lift, type, k, s, op, heat, c) {
  var a = B.a, o = B.v;
  a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = qx; a[o + 4] = qy; a[o + 5] = lift; a[o + 6] = type;
  a[o + 7] = k; a[o + 8] = s; a[o + 9] = op; a[o + 10] = heat;
  a[o + 11] = c[0]; a[o + 12] = c[1]; a[o + 13] = c[2];
  B.v += R3D_FX_STRIDE;
}

/* A quad facing the camera, centred at (x, y, z), hw across and hh up the screen. Across is the
   camera's right, R = (cos yaw, 0, sin yaw), and up the screen is UP = (cos tilt * sin yaw,
   sin tilt, -cos tilt * cos yaw) - at yaw 0 world x and (0, sin, -cos), which is what these were
   written as while the camera faced north (see fx3d.js, and cam3d.js for the yaw). The blended
   quads are sorted by how far toward the eye they are, along the camera's own depth. */
function _r3dFxYaw(V) { return V.cy === undefined ? [1, 0] : [V.cy, V.sy]; }
function _r3dFxKey(V, x, y, z) { var w = _r3dFxYaw(V); return (-x * w[1] + z * w[0]) * V.sp + y * V.cp; }
var R3D_FX_CORNERS = [-1, 1, 1, 1, 1, -1, -1, 1, 1, -1, -1, -1];
function _r3dFxBill(B, V, x, y, z, hw, hh, lift, type, k, s, op, heat, c) {
  if (op <= 0.002) return;
  /* counted, so the bloom's emitter pass can stand down when nothing here gives off light */
  if (type === R3D_FXT_FLASH || type === R3D_FXT_SPARK || type === R3D_FXT_FLAME || (type === R3D_FXT_BLOB && heat > 0.12)) B.lit = (B.lit || 0) + 1;
  _r3dFxQuad(B, _r3dFxKey(V, x, y, z));
  var w = _r3dFxYaw(V), rx = hw * w[0], rz = hw * w[1];
  var ux = V.cp * w[1] * hh, uy = V.sp * hh, uz = -V.cp * w[0] * hh;
  for (var i = 0; i < 12; i += 2) {
    var qx = R3D_FX_CORNERS[i], qy = R3D_FX_CORNERS[i + 1];
    _r3dFxV(B, x + rx * qx + ux * qy, y + uy * qy, z + rz * qx + uz * qy, qx, qy, lift, type, k, s, op, heat, c);
  }
}
/* A quad from one point to another, w wide across the screen - a round in flight, a trail. q.x
   runs -1 at the first point to 1 at the second. Its corners keep their own depths, since a
   streak can run a long way into the screen. */
function _r3dFxStreak(B, V, x0, y0, z0, x1, y1, z1, w, lift, type, k, s, op, heat, c) {
  if (op <= 0.002) return;
  /* the run across and up the screen, and the screen's perpendicular to it, in world terms */
  var yw = _r3dFxYaw(V), dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  var ax = dx * yw[0] + dz * yw[1], au = dx * V.cp * yw[1] + dy * V.sp - dz * V.cp * yw[0];
  var al = Math.sqrt(ax * ax + au * au) || 1;
  var px = -au / al * w * 0.5, pu = ax / al * w * 0.5;
  var ox = px * yw[0] + pu * V.cp * yw[1], oy = pu * V.sp, oz = px * yw[1] - pu * V.cp * yw[0];
  if (type === R3D_FXT_STREAK) B.lit = (B.lit || 0) + 1;
  _r3dFxQuad(B, _r3dFxKey(V, (x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5));
  var P = [[x0 - ox, y0 - oy, z0 - oz, -1, -1], [x1 - ox, y1 - oy, z1 - oz, 1, -1], [x1 + ox, y1 + oy, z1 + oz, 1, 1],
           [x0 - ox, y0 - oy, z0 - oz, -1, -1], [x1 + ox, y1 + oy, z1 + oz, 1, 1], [x0 + ox, y0 + oy, z0 + oz, -1, 1]];
  for (var i = 0; i < 6; i++) _r3dFxV(B, P[i][0], P[i][1], P[i][2], P[i][3], P[i][4], lift, type, k, s, op, heat, c);
}
/* The same, standing on its base rather than hanging round its centre - a flame, a plume. */
function _r3dFxStand(B, V, x, y, z, hw, hh, lift, type, k, s, op, heat, c) {
  var w = _r3dFxYaw(V);
  _r3dFxBill(B, V, x + V.cp * w[1] * hh, y + V.sp * hh, z - V.cp * w[0] * hh, hw, hh, lift, type, k, s, op, heat, c);
}
/* A patch lying ON the ground, r in radius, over an n x n grid that follows the terrain: one
   flat quad on a slope sinks into the uphill side and floats off the downhill one. */
function _r3dFxDecal(B, V, x, z, r, n, lift, type, k, s, op, c) {
  if (op <= 0.002) return;
  var i, j, u0, u1, v0, v1;
  /* on the sea the swell heaves above a flat patch and cuts it into pieces, so it rides higher */
  if (V.water(x, z)) lift = Math.max(lift, R3D_FX_SEA_LIFT);
  function corner(u, v) {
    var wx = x + u * r, wz = z + v * r;
    _r3dFxV(B, wx, V.ground(wx, wz) + 0.12, wz, u, v, lift, type, k, s, op, 0, c);
  }
  for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
    u0 = -1 + 2 * i / n; u1 = -1 + 2 * (i + 1) / n; v0 = -1 + 2 * j / n; v1 = -1 + 2 * (j + 1) / n;
    var mz = z + (v0 + v1) * 0.5 * r, mx = x + (u0 + u1) * 0.5 * r;
    _r3dFxQuad(B, _r3dFxKey(V, mx, V.ground(mx, mz), mz) - 50);
    corner(u0, v0); corner(u1, v0); corner(u1, v1); corner(u0, v0); corner(u1, v1); corner(u0, v1);
  }
}
/* over half a quad's height clears the floor in front of it; never more than the sprite pass
   allowed, which is what keeps a building in front of a blast able to hide it */
function _r3dFxLift(h) { return Math.min(R3D_FX_LIFT, h * 0.9 + 0.2); }

/* The seed: fixed for an effect that stays where it went off, and taken from the thing it
   rides when it rides something, so a burning tank's flames do not reshuffle as it drives. */
function _r3dFxSeed(f) {
  if (f.att) return _r3dFxH(f.att, 7.7);
  return _r3dFxH(Math.round(f.x * 8), Math.round(f.z * 8));
}

/* A FIREBALL: a flash, a glare on the ground, a shock ring, sparks, and a cluster of billows
   that burst out, climb, cool from white through orange to red and roll over into smoke.
   `a` is seconds since detonation and runs on past the record into the fire it chains to;
   `life` scales the whole thing (a pop is a small, quick fireball). */
function _r3dFxBall(V, x, gy, fy, z, a, big, seed, life, water) {
  var R = R3D_FX_R * big, cy = gy + fy + R * 0.15, M = V.M;
  /* the ground takes the glare less the higher the burst, and no shock ring from one in the air */
  var near = Math.max(0.3, Math.min(1, 1 - (fy - 1) / (R * 3))) * V.gnd;
  if (a < 0.6 * life) _r3dFxDecal(V.L, V, x, z, Math.max(6, R * 4.2), 4, 0.6, R3D_FXT_LIGHT, 0, seed, Math.exp(-a / life * 6) * near, R3D_FX_GLARE);
  if (a < 0.25 * life) _r3dFxBill(M, V, x, cy, z, R * 1.7, R * 1.7, _r3dFxLift(R * 1.7), R3D_FXT_FLASH, 0, seed, Math.exp(-a / life * 12), 0, R3D_FX_SPARKC);
  if (a < 0.45 * life && fy < R) _r3dFxDecal(M, V, x, z, R * 2.6, 4, 0.5, R3D_FXT_RING, a / (0.45 * life), seed, 0.5 * V.gnd, water ? R3D_FX_FOAM : R3D_FX_DUST);
  if (a < 0.7 * life) _r3dFxBill(M, V, x, cy, z, R * 2.6, R * 2.6, _r3dFxLift(R), R3D_FXT_SPARK, a / (0.7 * life), seed, 1, 0, R3D_FX_SPARKC);
  var nb = Math.min(13, 7 + Math.floor(big * 2));
  for (var i = 0; i < nb; i++) {
    var sd = seed * 97 + i;
    var h1 = _r3dFxH(sd, 1), h2 = _r3dFxH(sd, 2), h3 = _r3dFxH(sd, 3), h4 = _r3dFxH(sd, 4), h5 = _r3dFxH(sd, 5);
    var la = (a - h3 * 0.08 * life) / life, bl = 1.5 + h4 * 0.6;
    if (la <= 0 || la >= bl) continue;
    var az = h1 * 6.2832, el = 0.15 + h2 * 1.1, ce = Math.cos(el);
    var out = R * (0.2 + 0.75 * (1 - Math.exp(-la * 7)));
    var br = R * (0.42 + 0.3 * h5) * (0.55 + 0.75 * (1 - Math.exp(-la * 4)));
    var op = Math.min(1, la / 0.03) * (1 - _r3dFxSmooth(0.55, 1.0, la / bl));
    _r3dFxBill(M, V, x + ce * Math.cos(az) * out, cy + Math.sin(el) * out * 0.8 + la * R * 0.55,
               z + ce * Math.sin(az) * out, br, br, _r3dFxLift(br), R3D_FXT_BLOB, la / bl,
               _r3dFxH(sd, 6), op, Math.max(0, 0.9 + 0.25 * h5 - la * (1.7 + h4 * 1.4)), R3D_FX_SMOKE);
  }
}

/* A SMALLER IMPACT - a round striking armour, a shell going into dirt: a spit of flame, sparks
   and a puff of whatever it hit. `k` is the record's own age, 0 to 1. */
function _r3dFxImpact(V, x, y0, z, k, big, seed, heavy) {
  var R = R3D_FX_R * big * (heavy ? 0.8 : 0.5), M = V.M, cy = y0 + R * 0.3;
  if (heavy) _r3dFxDecal(V.L, V, x, z, Math.max(4, R * 3.5), 3, 0.6, R3D_FXT_LIGHT, 0, seed, Math.exp(-k * 5) * 0.6 * V.gnd, R3D_FX_GLARE);
  _r3dFxBill(M, V, x, cy, z, R * 1.4, R * 1.4, _r3dFxLift(R), R3D_FXT_FLASH, 0, seed, Math.exp(-k * 7) * (heavy ? 1 : 0.8), 0, R3D_FX_SPARKC);
  _r3dFxBill(M, V, x, cy, z, R * 2.4, R * 2.4, _r3dFxLift(R), R3D_FXT_SPARK, k, seed, 1, 0, R3D_FX_SPARKC);
  var np = heavy ? 3 : 1;
  for (var i = 0; i < np; i++) {
    var sd = seed * 53 + i, pr = R * (0.55 + 0.5 * k) * (0.8 + 0.4 * _r3dFxH(sd, 2));
    _r3dFxBill(M, V, x + (_r3dFxH(sd, 3) - 0.5) * R, cy + k * R * 0.8 + i * R * 0.3,
               z + (_r3dFxH(sd, 4) - 0.5) * R * 0.6, pr, pr, _r3dFxLift(pr), R3D_FXT_BLOB, k,
               _r3dFxH(sd, 5), 0.8 * (1 - _r3dFxSmooth(0.4, 1.0, k)), heavy ? Math.max(0, 0.9 - k * 2.5) : 0,
               heavy ? R3D_FX_SMOKE : R3D_FX_DUST);
  }
}

/* A SPLASH: a plume thrown up off the water and falling back, a ring of foam, and droplets. */
function _r3dFxSplash(V, x, y0, z, k, big, seed) {
  var R = R3D_FX_R * big, M = V.M;
  _r3dFxDecal(M, V, x, z, R * 2.2, 3, 0.5, R3D_FXT_RING, k, seed, 0.6 * V.gnd, R3D_FX_FOAM);
  _r3dFxStand(M, V, x, y0 - R * 0.1, z, R * 1.3, R * 1.5, _r3dFxLift(R), R3D_FXT_SPRAY, k, seed, 1, 0, R3D_FX_FOAM);
  _r3dFxBill(M, V, x, y0 + R * 0.4, z, R * 2.2, R * 2.2, _r3dFxLift(R), R3D_FXT_SPARK, k, seed, 0.8, 0, R3D_FX_DROPS);
}

/* A FIRE: tongues of flame, a glare that flickers with them, and a column of soot leaning
   downwind. `w` is how far the fire spreads - a burning refinery burns across its roof. */
function _r3dFxFire(V, x, y0, z, big, w, seed, nt, fade) {
  var H = 3.0 * big, T = V.t + seed * 10, M = V.M, j;
  var sw = Math.max(w, H * 0.45);
  for (j = 0; j < nt; j++) {
    /* spread across the screen more than into it, and tied apart toward the eye: the camera's
       right and its depth, whichever way it faces */
    var oa = j ? (_r3dFxH(seed, j + 11) - 0.5) * sw : 0, od = (j ? (_r3dFxH(seed, j + 17) - 0.5) * sw * 0.6 : 0) + 0.01 * j;
    var fw = _r3dFxYaw(V), ox = oa * fw[0] - od * fw[1], oz = oa * fw[1] + od * fw[0];
    var fl = 0.8 + 0.12 * Math.sin(T * 7.3 + j * 2.1) + 0.08 * Math.sin(T * 13.1 + j * 4.7);
    var hh = H * fl * (j ? 0.5 + 0.35 * _r3dFxH(seed, j + 23) : 1) * 0.5;
    _r3dFxStand(M, V, x + ox, y0 - hh * 0.08, z + oz, hh * 0.8, hh, _r3dFxLift(hh), R3D_FXT_FLAME,
                T + j * 1.7, _r3dFxH(seed, j + 29), fade, 1.0, R3D_FX_SPARKC);
  }
  _r3dFxDecal(V.L, V, x, z, Math.max(3, H * 2.2 + w), 3, 0.6, R3D_FXT_LIGHT, 0, seed,
              (0.2 + 0.05 * Math.sin(T * 9.1)) * fade * V.gnd, R3D_FX_GLARE);
  _r3dFxColumn(V, x, y0 + H * 0.6, z, H, seed, T, 0.7 * fade, R3D_FX_SOOT);
}

/* A COLUMN OF SMOKE: puffs born at its foot, climbing, swelling and thinning, leaning with the
   wind. Each puff is a phase of one clock, so the column is continuous and needs no memory. */
function _r3dFxColumn(V, x, y0, z, H, seed, T, op, tint) {
  var n = 5;
  for (var p = 0; p < n; p++) {
    var cyc = T * 0.33 + p / n, ph = cyc - Math.floor(cyc), gen = Math.floor(cyc);
    var pr = H * (0.3 + 0.55 * ph);
    _r3dFxBill(V.M, V, x + ph * H * 0.9, y0 + ph * H * 2.8, z - ph * H * 0.3, pr, pr, _r3dFxLift(pr),
               R3D_FXT_BLOB, ph, _r3dFxH(seed * 31 + p, gen), Math.sin(ph * Math.PI) * op, 0, tint);
  }
}

/* How high a burning thing's fire stands, and how wide it spreads: on a building, across the
   roof; on anything else, where the record says. The roof is the mesh's own top. */
function _r3dFxHost(f, gy) {
  var G = window._rtsG, h = f.att && G.byId ? G.byId[f.att] : null;
  if (h && h.type === 'struct' && !h.dead) {
    var d = rtsStructDef(h.def), m = _r3dMesh('b', h.def, h.side);
    var top = m && m.top ? m.top * RTS_TILE / RTS_TS : 2;
    return { y: gy + top * 0.8, w: Math.min(d.w, d.h) * RTS_TILE * 0.55 };
  }
  return { y: gy + (f.y || 0) * 0.4, w: 0 };
}

/* A ROUND: the 2D painter's dash (render/fx.js) - a short bright streak racing from the muzzle
   to the mark in 0.06s - at the height it was fired at, with a flash at the muzzle. */
function _r3dFxTracer(V, f) {
  var TRL = 0.06;
  if (f.t > TRL) return;
  var y0 = V.ground(f.x, f.z) + (f.y || 1.3), y1 = V.ground(f.x2, f.z2) + (f.y2 || 1.3);
  var vx = f.x2 - f.x, vy = y1 - y0, vz = f.z2 - f.z, len = Math.sqrt(vx * vx + vz * vz) || 1;
  var u = Math.min(1, f.t / TRL + 0.28), u0 = Math.max(0, u - Math.min(len * 0.34, 4.4) / len);
  _r3dFxStreak(V.M, V, f.x + vx * u0, y0 + vy * u0, f.z + vz * u0, f.x + vx * u, y0 + vy * u, f.z + vz * u,
               0.22, 0.6, R3D_FXT_STREAK, 0, 0, 0.95 * (1 - f.t / TRL), 0, R3D_FX_ROUND);
  if (f.t < 0.035) _r3dFxBill(V.M, V, f.x, y0, f.z, 0.55, 0.55, 0.6, R3D_FXT_FLASH, 0, 0, 0.9, 0, R3D_FX_SPARKC);
}

/* A CHUNK thrown off a dying building: dark, glowing for its first moments, with a wisp of smoke
   behind it along its flight. Its seed is its size, which is random per chunk and never changes. */
function _r3dFxDebris(V, f) {
  var y = V.ground(f.x, f.z) + Math.max(0, f.y) + 0.15, r = 0.3 * (f.big || 1), seed = _r3dFxH(Math.round((f.big || 1) * 997), 3);
  var fade = f.t > 1.2 ? Math.max(0, (1.6 - f.t) / 0.4) : 1;
  _r3dFxBill(V.M, V, f.x, y, f.z, r, r, _r3dFxLift(r), R3D_FXT_BLOB, f.t, seed, fade, Math.max(0, 1.0 - f.t * 2.2), R3D_FX_CHUNK);
  var sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy + f.vz * f.vz) || 1;
  if (f.y > 0.3) _r3dFxStreak(V.M, V, f.x - f.vx / sp * 2.2, y - f.vy / sp * 2.2, f.z - f.vz / sp * 2.2, f.x, y, f.z,
                              r * 1.6, _r3dFxLift(r), R3D_FXT_TRAIL, f.t * sp, seed, 0.5 * fade, 2.2, R3D_FX_SMOKE);
}

/* ROUNDS IN FLIGHT (G.proj), at the height they fly at - the 2D painter put a square on the
   ground under them. A shell is a hot bolt; a rocket is a flame with its smoke laid down in the
   world behind it, as far back as its launcher. Hidden where the player cannot see, as in 2D. */
function _r3dFxProj(G, V) {
  var P = G.proj || [], vis = typeof _rtsVisible === 'function';
  for (var i = 0; i < P.length; i++) {
    var p = P[i];
    if (vis && !_rtsVisible(_rtsTX(p.x), _rtsTX(p.z))) continue;
    var sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz) || 1, dx = p.vx / sp, dz = p.vz / sp;
    var y = V.ground(p.x, p.z) + (p.y || 1.4), seed = _r3dFxH(p.from && p.from.id || 1, 11);
    var fx = p.from ? p.x - p.from.x : 9, fz = p.from ? p.z - p.from.z : 0;
    var flown = Math.sqrt(fx * fx + fz * fz);
    /* THE MUZZLE: a round barely out of the barrel lights it up - three frames of a cannon's
       flash, a little more of a launcher's - and the flash is where the barrel is, not the round */
    if (p.from && flown < 3) _r3dFxBill(V.M, V, p.from.x + dx * 1.2, y, p.from.z + dz * 1.2, 1.2, 1.2, 1,
                                        R3D_FXT_FLASH, 0, seed, 1 - flown / 3, 0, R3D_FX_SPARKC);
    if (p.kind === 'missile' || p.kind === 'rocket') {
      var L = Math.max(0.5, Math.min(9, flown));
      _r3dFxStreak(V.M, V, p.x - dx * L, y, p.z - dz * L, p.x, y, p.z, 1.1, 0.8, R3D_FXT_TRAIL, flown, seed, 0.75, L, R3D_FX_TRAILC);
      _r3dFxBill(V.M, V, p.x, y, p.z, 0.75, 0.75, 0.8, R3D_FXT_FLASH, 0, seed, 1, 0, R3D_FX_SPARKC);
    } else {
      _r3dFxStreak(V.M, V, p.x - dx * 2.6, y, p.z - dz * 2.6, p.x, y, p.z, 0.4, 0.8, R3D_FXT_STREAK, 0, seed, 1, 0, R3D_FX_BOLT);
      _r3dFxBill(V.M, V, p.x, y, p.z, 0.45, 0.45, 0.8, R3D_FXT_FLASH, 0, seed, 0.7, 0, R3D_FX_SPARKC);
    }
  }
}

/* Everything G.fx and G.proj hold that this pass owns, and what moving things leave behind them,
   into the two batches. */
function _r3dFxEmit(G, V) {
  var A = RTS_ANIMS, i;
  _r3dFxProj(G, V);
  if (typeof _r3dFxWakes === 'function') _r3dFxWakes(G, V);     /* dust and wakes - fxwake3d.js */
  if (typeof _r3dFxAlive === 'function') _r3dFxAlive(G, V);     /* stacks, beacons - alive3d.js */
  if (typeof _r3dFxSky === 'function') _r3dFxSky(G, V);         /* lamps, rain, fog - skyfx3d.js */
  if (typeof _r3dFxMuzzle === 'function') _r3dFxMuzzle(G, V);   /* guns going off - combat3d.js */
  if (typeof _r3dFxAir === 'function') _r3dFxAir(G, V);         /* contrails, afterburners - air3d.js */
  if (typeof _r3dFxHurt === 'function') _r3dFxHurt(G, V);       /* the smoke of the damaged - hurt3d.js */
  for (i = 0; i < G.fx.length; i++) {
    var f = G.fx[i];
    if (f.t < 0 || !_r3dFxOwns(f.kind)) continue;
    if (f.kind === 'tracer') { _r3dFxTracer(V, f); continue; }
    if (f.kind === 'debris') { _r3dFxDebris(V, f); continue; }
    var def = A[f.kind];
    if (!def) continue;
    var big = f.big || 1, seed = _r3dFxSeed(f), gy = V.ground(f.x, f.z), k = Math.min(1, f.t / def.dur);
    var water = V.water(f.x, f.z);
    if (f.kind === 'boom') _r3dFxBall(V, f.x, gy, f.y || 0, f.z, f.t, big, seed, 1, water);
    /* a pop is a small quick fireball whose billows have to be gone when its record is: the
       longest-lived billow runs 2.1 of its own lives, so a life of dur / 2.1 ends them together */
    else if (f.kind === 'pop') _r3dFxBall(V, f.x, gy, f.y || 0, f.z, f.t, big * 0.7, seed, def.dur / 2.1, water);
    else if (f.kind === 'hit') _r3dFxImpact(V, f.x, gy + (f.y || 0), f.z, k, big, seed, true);
    else if (f.kind === 'piff') _r3dFxImpact(V, f.x, gy + (f.y || 0), f.z, k, big, seed, false);
    else if (f.kind === 'splash') _r3dFxSplash(V, f.x, gy, f.z, k, big, seed);
    else if (f.kind === 'smoke') {
      /* thinning as it burns out: the ladder's last rung runs five loops */
      var left = ((f.loops || 1) - 1 + (1 - k)) / (def.loops || 1);
      _r3dFxColumn(V, f.x, _r3dFxHost(f, gy).y, f.z, 2.2 * big, seed, V.t + seed * 10, 0.5 * Math.min(1, left * 1.5), R3D_FX_SOOT);
    } else if (def.size) {
      var host = _r3dFxHost(f, gy);
      _r3dFxFire(V, f.x, host.y, f.z, big, host.w, seed, f.kind === 'firebig' ? 5 : (f.kind === 'firemed' ? 4 : 3), 1);
      /* THE HAND-OFF: this small fire's first loop is the fireball it grew out of, still rolling */
      if (f.kind === 'firesmall' && !f.base && f.loops === def.loops)
        _r3dFxBall(V, f.x, gy, f.y || 0, f.z, A.boom.dur + f.t, big / 0.6, seed, 1, water);
    }
  }
}
