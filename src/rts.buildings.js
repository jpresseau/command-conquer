/* RC COMMAND - the game's own building models.

   These are purpose-built military structures, authored for this game alone. Nothing here is
   borrowed from another app: a car garage does not read as a Command Yard and a water tower
   does not read as a Power Plant, and a standalone game should not depend on someone else's
   art. The only outside dependency in the whole app is three.js.

   Two things drive the design:
   - The camera looks down at ~45 degrees, so ROOFS are most of what you see. Vents, catwalks,
     skylights, painted markings and team stripes go up top where they actually read.
   - Each structure is built once per (type, side) and cloned, so faction colour is baked into
     the model itself rather than implied by a marker.

   Every builder returns a Group sized to its footprint in tiles (def.w * RTS_TILE), origin at
   the centre of the pad, sitting on y=0. */

var _RTS_GC = {};           /* geometry cache - many parts repeat across buildings */
var _RTS_MATS = {};         /* material palette, per side */
var _RTS_HAZ = null;

function _rtsGBox(w, h, d) {
  var k = 'b' + w + '_' + h + '_' + d;
  return _RTS_GC[k] || (_RTS_GC[k] = new window.THREE.BoxGeometry(w, h, d));
}
function _rtsGCyl(rt, rb, h, s) {
  var k = 'c' + rt + '_' + rb + '_' + h + '_' + s;
  return _RTS_GC[k] || (_RTS_GC[k] = new window.THREE.CylinderGeometry(rt, rb, h, s || 16));
}
function _rtsGCone(r, h, s) {
  var k = 'n' + r + '_' + h + '_' + s;
  return _RTS_GC[k] || (_RTS_GC[k] = new window.THREE.ConeGeometry(r, h, s || 16));
}
function _rtsGSph(r) {
  var k = 's' + r;
  return _RTS_GC[k] || (_RTS_GC[k] = new window.THREE.SphereGeometry(r, 20, 14));
}

/* Diagonal hazard stripes - the single most "industrial" cue there is, used on loading
   ramps, factory doors and blast barriers. */
function _rtsHazardTex() {
  if (_RTS_HAZ) return _RTS_HAZ;
  var T = window.THREE, c = document.createElement('canvas');
  c.width = c.height = 64;
  var g = c.getContext('2d');
  g.fillStyle = '#d9bb3c'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#23272c';
  for (var i = -64; i < 64; i += 22) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 11 + 64, 64); g.lineTo(i + 64, 64);
    g.closePath(); g.fill();
  }
  _RTS_HAZ = new T.CanvasTexture(c);
  _RTS_HAZ.wrapS = _RTS_HAZ.wrapT = T.RepeatWrapping;
  try { _RTS_HAZ.encoding = T.sRGBEncoding; } catch (_e) {}
  return _RTS_HAZ;
}

function _rtsPal(side) {
  if (_RTS_MATS[side]) return _RTS_MATS[side];
  var T = window.THREE, C = RTS_SIDES[side];
  function S(col, o) {
    o = o || {};
    return new T.MeshStandardMaterial({
      color: col, roughness: o.r != null ? o.r : 0.88, metalness: o.m || 0,
      emissive: new T.Color(o.e || 0x000000), emissiveIntensity: o.ei != null ? o.ei : 1,
      flatShading: !!o.flat, transparent: !!o.t, opacity: o.op != null ? o.op : 1,
      map: o.map || null, side: o.ds ? T.DoubleSide : T.FrontSide
    });
  }
  /* Colours are picked DARK on purpose. The scene's sun plus hemi light multiply roughly
     1.5x before ACES tone-mapping, so a "correct-looking" mid grey renders as near-white and
     a saturated team colour washes out to pastel - the same trap the scrap crystals hit.
     Everything here is chosen to land right AFTER the tone-map, not in isolation. */
  var team = new T.Color(C.color);
  function mul(f) { return team.clone().multiplyScalar(f).getHex(); }
  var P = {
    pad:      S(0x585e62, { r: 0.97 }),
    concrete: S(0x767d81, { r: 0.95 }),
    concD:    S(0x565c60, { r: 0.95 }),
    roof:     S(0x474d51, { r: 0.92 }),
    steel:    S(0x4e565c, { r: 0.5, m: 0.5 }),
    steelD:   S(0x363c42, { r: 0.6, m: 0.45 }),
    dark:     S(0x24282c, { r: 0.75, m: 0.3 }),
    black:    S(0x141618, { r: 0.85 }),
    team:     S(mul(0.62), { r: 0.55 }),
    teamD:    S(mul(0.36), { r: 0.65 }),
    teamL:    S(mul(0.95), { r: 0.5 }),
    teamFlat: S(mul(0.62), { r: 0.6, flat: true }),   /* faceted roofs need flat shading or a
                                                         3-sided prism shades like a barrel */
    glass:    S(0x4a7182, { r: 0.12, m: 0.25, t: true, op: 0.55 }),
    lamp:     S(0xffe6b0, { e: 0xffc873, ei: 1.1, r: 0.4 }),
    fire:     S(0xff8a2a, { e: 0xff6a10, ei: 1.9, r: 0.5 }),
    rust:     S(0x593826, { r: 0.96 }),
    sand:     S(0x6d6248, { r: 0.98, flat: true }),
    hazard:   S(0xb4b4b4, { r: 0.8, map: _rtsHazardTex() }),
    scrap:    S(0x0e6b4b, { e: 0x0d8a5c, ei: 0.2, r: 0.35, flat: true })
  };
  _RTS_MATS[side] = P;
  return P;
}

/* ------------------------------------------------------------------ helpers */
function _rtsAdd(g, geo, mat, x, y, z, ry) {
  var m = new window.THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
function _rtsBox(g, mat, w, h, d, x, y, z, ry) { return _rtsAdd(g, _rtsGBox(w, h, d), mat, x, y, z, ry); }
function _rtsCyl(g, mat, rt, rb, h, seg, x, y, z) { return _rtsAdd(g, _rtsGCyl(rt, rb, h, seg), mat, x, y, z); }

/* Concrete pad every structure sits on, with a chamfered skirt and a team stripe border. */
function _rtsPad(g, P, size, side) {
  _rtsBox(g, P.pad, size, 0.5, size, 0, 0.25, 0);
  _rtsBox(g, P.concD, size * 1.02, 0.22, size * 1.02, 0, 0.11, 0);
  var t = size * 0.5 - 0.35;
  [[0, t], [0, -t]].forEach(function (p) { _rtsBox(g, P.team, size * 0.9, 0.12, 0.5, p[0], 0.53, p[1]); });
  [[t, 0], [-t, 0]].forEach(function (p) { _rtsBox(g, P.team, 0.5, 0.12, size * 0.9, p[0], 0.53, p[1]); });
}
/* Rooftop clutter: vents, ducts and an AC block. This is what sells a roof from above. */
function _rtsRoofKit(g, P, w, d, y, n) {
  var i;
  for (i = 0; i < (n || 3); i++) {
    var x = (-0.3 + (i / Math.max(1, n - 1)) * 0.6) * w;
    _rtsBox(g, P.steelD, w * 0.11, 0.5, d * 0.16, x, y + 0.25, -d * 0.22);
    _rtsCyl(g, P.steel, w * 0.045, w * 0.045, 0.7, 12, x, y + 0.35, d * 0.2);
    _rtsCyl(g, P.dark, w * 0.055, w * 0.055, 0.12, 12, x, y + 0.72, d * 0.2);
  }
  _rtsBox(g, P.steelD, w * 0.2, 0.55, d * 0.2, w * 0.28, y + 0.28, d * 0.28);
  _rtsBox(g, P.dark, w * 0.17, 0.08, d * 0.17, w * 0.28, y + 0.57, d * 0.28);
}
function _rtsRailing(g, P, w, d, y) {
  var h = 0.55, i;
  [[0, -d / 2], [0, d / 2]].forEach(function (p) { _rtsBox(g, P.steel, w, 0.06, 0.06, p[0], y + h, p[1]); });
  [[-w / 2, 0], [w / 2, 0]].forEach(function (p) { _rtsBox(g, P.steel, 0.06, 0.06, d, p[0], y + h, p[1]); });
  for (i = 0; i <= 5; i++) {
    var x = -w / 2 + (i / 5) * w;
    _rtsBox(g, P.steel, 0.06, h, 0.06, x, y + h / 2, -d / 2);
    _rtsBox(g, P.steel, 0.06, h, 0.06, x, y + h / 2, d / 2);
  }
}
function _rtsSandbags(g, P, x, z, len, ry) {
  var rows = 2, n = Math.max(3, Math.round(len / 0.9)), i, r;
  for (r = 0; r < rows; r++) {
    for (i = 0; i < n - r; i++) {
      var off = (i - (n - r - 1) / 2) * 0.9 + (r ? 0.45 : 0);
      var b = _rtsAdd(g, _rtsGSph(0.34), P.sand,
        x + Math.cos(ry) * off, 0.75 + r * 0.4, z - Math.sin(ry) * off);
      b.scale.set(1.25, 0.62, 0.85);
      b.rotation.y = ry;
    }
  }
}
function _rtsWindows(g, P, w, y, z, n, lit) {
  for (var i = 0; i < n; i++) {
    var x = (-0.5 + (i + 0.5) / n) * w;
    _rtsBox(g, P.glass, w / n * 0.55, 0.75, 0.1, x, y, z);
    if (lit) _rtsBox(g, P.lamp, w / n * 0.45, 0.6, 0.04, x, y, z - 0.06);
  }
}

/* ------------------------------------------------------------ merge ------
   Everything static gets merged per material so a 150-mesh building costs a handful of
   draw calls. Parts marked userData.dyn (the radar dish, the turret head) stay separate so
   they can still be animated. three r128's core has no BufferGeometryUtils, so this does the
   concatenation directly - all geometries are converted to non-indexed first so their
   attribute layouts line up. */
function _rtsMergeGroup(root) {
  var T = window.THREE;
  root.updateMatrixWorld(true);
  var buckets = [], dyn = [], i;
  /* Manual walk rather than traverse(): a dynamic part can be a whole Group (the radar mast
     pivot), and its children must be left alone too - traverse() gives no way to skip a
     subtree, so it would happily merge the dish and throw the pivot away. */
  (function walk(parent) {
    for (var c = 0; c < parent.children.length; c++) {
      var o = parent.children[c];
      if (o.userData.dyn) { dyn.push(o); continue; }
      if (o.isMesh) {
        var b = null;
        for (var k = 0; k < buckets.length; k++) if (buckets[k].mat === o.material) { b = buckets[k]; break; }
        if (!b) { b = { mat: o.material, geos: [] }; buckets.push(b); }
        var geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        b.geos.push(geo);
      }
      walk(o);
    }
  })(root);
  var out = new T.Group();
  for (i = 0; i < buckets.length; i++) {
    var geos = buckets[i].geos, total = 0, j;
    for (j = 0; j < geos.length; j++) total += geos[j].attributes.position.count;
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    var off = 0;
    for (j = 0; j < geos.length; j++) {
      var gg = geos[j], p = gg.attributes.position, n = gg.attributes.normal, u = gg.attributes.uv, c = p.count;
      pos.set(p.array.subarray(0, c * 3), off * 3);
      if (n) nor.set(n.array.subarray(0, c * 3), off * 3);
      if (u) uv.set(u.array.subarray(0, c * 2), off * 2);
      off += c;
      gg.dispose();
    }
    var merged = new T.BufferGeometry();
    merged.setAttribute('position', new T.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new T.BufferAttribute(nor, 3));
    merged.setAttribute('uv', new T.BufferAttribute(uv, 2));
    var m = new T.Mesh(merged, buckets[i].mat);
    m.castShadow = true; m.receiveShadow = true;
    out.add(m);
  }
  /* re-parent the animated parts, keeping their transform */
  for (i = 0; i < dyn.length; i++) {
    var d = dyn[i];
    d.matrix.copy(d.matrixWorld);
    d.matrix.decompose(d.position, d.quaternion, d.scale);
    out.add(d);
  }
  out.userData.dyn = dyn;
  return out;
}

/* ================================================================ COMMAND YARD
   The HQ: a concrete blockhouse with a stepped command deck, a rotating radar dish, comms
   masts and a sandbagged perimeter. Reads as "this is the brain of the base". */
function _rtsBldYard(side) {
  var T = window.THREE, P = _rtsPal(side), g = new T.Group(), S = 5 * RTS_TILE * 0.92, i;
  _rtsPad(g, P, S, side);

  /* main block */
  var bw = S * 0.62, bd = S * 0.5, bh = 4.2;
  _rtsBox(g, P.concrete, bw, bh, bd, 0, 0.5 + bh / 2, -S * 0.06);
  _rtsBox(g, P.teamD, bw * 1.02, 0.55, bd * 1.02, 0, 0.5 + bh - 0.2, -S * 0.06);   /* team band */
  _rtsBox(g, P.roof, bw * 0.98, 0.14, bd * 0.98, 0, 0.5 + bh + 0.2, -S * 0.06);   /* roof deck */
  _rtsBox(g, P.concD, bw * 1.04, 0.35, bd * 1.04, 0, 0.5 + bh + 0.15, -S * 0.06);  /* parapet */
  _rtsBox(g, P.team, bw * 0.44, 0.16, bd * 0.44, bw * 0.18, 0.5 + bh + 0.24, -S * 0.06 + bd * 0.2); /* helipad square */
  _rtsBox(g, P.concrete, bw * 0.3, 0.18, 0.5, bw * 0.18, 0.5 + bh + 0.27, -S * 0.06 + bd * 0.2);
  _rtsWindows(g, P, bw * 0.9, 0.5 + bh * 0.55, -S * 0.06 + bd / 2 + 0.06, 5, true);

  /* upper command deck, set back */
  var uw = bw * 0.52, ud = bd * 0.6, uh = 2.2, uy = 0.5 + bh + 0.3;
  _rtsBox(g, P.concrete, uw, uh, ud, -bw * 0.12, uy + uh / 2, -S * 0.06);
  _rtsBox(g, P.glass, uw * 0.94, uh * 0.5, ud * 0.94, -bw * 0.12, uy + uh * 0.62, -S * 0.06);
  _rtsBox(g, P.teamD, uw * 1.06, 0.3, ud * 1.06, -bw * 0.12, uy + uh + 0.1, -S * 0.06);
  _rtsRailing(g, P, bw * 0.96, bd * 0.96, 0.5 + bh + 0.3);

  /* rotating radar dish on a lattice mast */
  var mx = bw * 0.3, mz = -S * 0.06, my = uy;
  for (i = 0; i < 4; i++) {
    _rtsBox(g, P.steel, 0.14, 3.0, 0.14, mx + (i % 2 ? 0.45 : -0.45), my + 1.5, mz + (i < 2 ? 0.45 : -0.45));
  }
  _rtsBox(g, P.steel, 1.2, 0.12, 1.2, mx, my + 1.5, mz);
  _rtsBox(g, P.steel, 1.2, 0.12, 1.2, mx, my + 2.9, mz);
  var pivot = new T.Group();
  pivot.position.set(mx, my + 3.2, mz);
  pivot.userData.dyn = true;
  pivot.name = 'radar';                 /* looked up by name on each clone, so it can spin */
  var dish = new T.Mesh(new T.SphereGeometry(1.25, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new T.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.6, side: T.DoubleSide }));
  dish.rotation.x = -Math.PI * 0.42;
  dish.castShadow = true;
  pivot.add(dish);
  var horn = new T.Mesh(_rtsGCyl(0.09, 0.14, 0.9, 10), P.steelD);
  horn.rotation.x = Math.PI * 0.5; horn.position.set(0, 0.35, 0.55);
  pivot.add(horn);
  g.add(pivot);

  /* comms masts + beacon */
  [-1, 1].forEach(function (s) {
    _rtsCyl(g, P.steelD, 0.09, 0.13, 4.4, 10, s * bw * 0.42, 0.5 + bh + 2.2, -S * 0.06 - bd * 0.3);
    _rtsAdd(g, _rtsGSph(0.17), P.lamp, s * bw * 0.42, 0.5 + bh + 4.4, -S * 0.06 - bd * 0.3);
  });

  /* vehicle apron with hazard chevrons + sandbag perimeter */
  var ay = 0.53, az = S * 0.3;
  _rtsBox(g, P.hazard, S * 0.5, 0.09, S * 0.22, 0, ay, az);
  _rtsBox(g, P.dark, S * 0.5, 0.05, 0.16, 0, ay + 0.05, az - S * 0.11);
  _rtsSandbags(g, P, -S * 0.34, S * 0.3, 3.4, 0);
  _rtsSandbags(g, P, S * 0.34, S * 0.3, 3.4, 0);
  _rtsSandbags(g, P, -S * 0.4, -S * 0.28, 2.6, Math.PI / 2);

  /* supply crates + barrels in the yard */
  for (i = 0; i < 4; i++) {
    _rtsBox(g, P.rust, 1.0, 0.9, 1.0, -S * 0.36 + i * 0.35, 0.95 + (i % 2) * 0.9, -S * 0.05 + i * 0.9);
  }
  [[-S * 0.42, S * 0.08], [-S * 0.42, S * 0.2]].forEach(function (p) {
    _rtsCyl(g, P.team, 0.32, 0.32, 0.9, 12, p[0], 0.95, p[1]);
  });
  return g;
}

/* ================================================================ POWER PLANT
   Two hyperbolic cooling towers over a turbine hall, with transformers and a switchyard. */
function _rtsBldPower(side) {
  var T = window.THREE, P = _rtsPal(side), g = new T.Group(), S = 3 * RTS_TILE * 0.92, i;
  _rtsPad(g, P, S, side);

  /* Cooling towers: a lathe gives the hyperboloid waist a cylinder cannot. Tall, with a
     pronounced waist and an open dark mouth - from a top-down camera a squat tower just
     reads as a grey ring, which is exactly what the first pass looked like. */
  function tower(x, z, h, r) {
    var pts = [], n = 14;
    for (i = 0; i <= n; i++) {
      var t = i / n;
      /* narrowest at ~65% height, flaring again at the rim */
      var rad = r * (1 - 0.46 * Math.sin(Math.PI * Math.pow(t, 0.8)) + 0.30 * t * t);
      pts.push(new T.Vector2(Math.max(0.25, rad), t * h));
    }
    var shell = new T.Mesh(new T.LatheGeometry(pts, 28),
      new T.MeshStandardMaterial({ color: 0x767d81, roughness: 0.95, side: T.DoubleSide }));
    shell.position.set(x, 0.5, z);
    shell.castShadow = true; shell.receiveShadow = true;
    g.add(shell);
    var top = pts[n].x;
    _rtsCyl(g, P.team, top * 1.06, top * 1.06, 0.42, 28, x, 0.5 + h - 0.2, z);   /* rim band */
    _rtsCyl(g, P.black, top * 0.9, top * 0.78, 0.5, 26, x, 0.5 + h - 0.55, z);   /* dark mouth */
    /* steam sitting in the throat */
    var pf = new T.Mesh(_rtsGSph(top * 0.62),
      new T.MeshStandardMaterial({ color: 0xc4ced4, roughness: 1, transparent: true, opacity: 0.22 }));
    pf.scale.set(1, 0.5, 1); pf.position.set(x, 0.5 + h + top * 0.62, z);
    pf.castShadow = false;
    g.add(pf);
    /* base plinth + support buttresses, so it meets the pad properly */
    _rtsCyl(g, P.concD, r * 1.02, r * 1.08, 0.7, 28, x, 0.85, z);
    for (var b = 0; b < 8; b++) {
      var a = b / 8 * Math.PI * 2;
      _rtsBox(g, P.concD, 0.34, 1.5, 0.7, x + Math.cos(a) * r * 0.94, 1.25, z + Math.sin(a) * r * 0.94, -a);
    }
  }
  tower(-S * 0.24, -S * 0.18, 8.6, S * 0.21);
  tower(S * 0.25, -S * 0.24, 7.2, S * 0.18);

  /* turbine hall */
  var hw = S * 0.82, hh = 2.6, hd = S * 0.3, hz = S * 0.26;
  _rtsBox(g, P.concrete, hw, hh, hd, 0, 0.5 + hh / 2, hz);
  _rtsBox(g, P.roof, hw * 0.99, 0.16, hd * 0.99, 0, 0.5 + hh + 0.08, hz);
  _rtsBox(g, P.team, hw * 1.02, 0.4, hd * 1.02, 0, 0.5 + hh - 0.1, hz);
  _rtsWindows(g, P, hw * 0.9, 0.5 + hh * 0.5, hz + hd / 2 + 0.06, 5, true);
  _rtsRoofKit(g, P, hw, hd, 0.5 + hh, 3);

  /* transformers + insulators + bus bars */
  for (i = 0; i < 3; i++) {
    var tx = (i - 1) * S * 0.26;
    _rtsBox(g, P.steelD, S * 0.15, 1.1, S * 0.13, tx, 1.05, S * 0.46);
    _rtsBox(g, P.dark, S * 0.16, 0.16, S * 0.14, tx, 1.68, S * 0.46);
    [-1, 1].forEach(function (s2) {
      _rtsCyl(g, P.concrete, 0.09, 0.11, 0.75, 10, tx + s2 * S * 0.045, 2.1, S * 0.46);
    });
    _rtsBox(g, P.steel, S * 0.3, 0.06, 0.06, tx, 2.5, S * 0.46);
  }
  /* warning sign */
  _rtsBox(g, P.hazard, 1.0, 0.7, 0.08, -S * 0.36, 1.3, S * 0.46 - S * 0.09);
  return g;
}

/* ================================================================ REFINERY
   Where harvesters dock: an intake hopper feeding a conveyor up into the cracking tower,
   with storage silos, pipework and a flare stack. */
function _rtsBldRefinery(side) {
  var T = window.THREE, P = _rtsPal(side), g = new T.Group(), S = 5 * RTS_TILE * 0.92, i;
  _rtsPad(g, P, S, side);

  /* docking bay - hazard-striped and open on the +z side, where harvesters pull in */
  _rtsBox(g, P.hazard, S * 0.44, 0.1, S * 0.36, -S * 0.16, 0.55, S * 0.28);
  [-1, 1].forEach(function (s) {
    _rtsBox(g, P.steelD, 0.3, 1.5, 0.3, -S * 0.16 + s * S * 0.22, 1.25, S * 0.44);
    _rtsAdd(g, _rtsGSph(0.16), P.lamp, -S * 0.16 + s * S * 0.22, 2.1, S * 0.44);
  });

  /* intake hopper */
  var hop = new T.Mesh(new T.CylinderGeometry(1.9, 0.7, 2.0, 4), P.steelD);
  hop.rotation.y = Math.PI / 4; hop.position.set(-S * 0.16, 1.6, S * 0.06);
  hop.castShadow = true; g.add(hop);
  _rtsBox(g, P.scrap, 2.2, 0.3, 2.2, -S * 0.16, 2.5, S * 0.06);

  /* conveyor rising to the tower */
  var belt = _rtsBox(g, P.steelD, 5.6, 0.42, 1.5, -S * 0.02, 3.1, -S * 0.03);
  belt.rotation.z = -0.42;
  var band = _rtsBox(g, P.dark, 5.4, 0.12, 1.2, -S * 0.02, 3.32, -S * 0.03);
  band.rotation.z = -0.42;
  for (i = 0; i < 5; i++) {
    _rtsBox(g, P.steel, 0.14, 1.4 + i * 0.32, 0.14, -S * 0.14 + i * 1.15, 0.5 + (1.4 + i * 0.32) / 2, -S * 0.03);
  }

  /* cracking tower */
  var tx = S * 0.24, tz = -S * 0.16;
  _rtsCyl(g, P.concrete, 1.55, 1.75, 6.2, 20, tx, 3.6, tz);
  _rtsCyl(g, P.team, 1.8, 1.8, 0.5, 20, tx, 5.4, tz);
  _rtsCyl(g, P.steelD, 1.2, 1.5, 0.9, 20, tx, 6.9, tz);
  _rtsAdd(g, _rtsGSph(1.15), P.steel, tx, 7.4, tz).scale.set(1, 0.6, 1);
  for (i = 0; i < 3; i++) {
    _rtsAdd(g, new T.TorusGeometry(1.68, 0.08, 6, 22), P.steelD, tx, 1.6 + i * 1.6, tz).rotation.x = Math.PI / 2;
  }
  /* ladder + catwalk */
  for (i = 0; i < 9; i++) _rtsBox(g, P.steel, 0.5, 0.05, 0.05, tx, 1.0 + i * 0.62, tz + 1.85);
  _rtsBox(g, P.steel, 0.05, 5.6, 0.05, tx - 0.24, 3.6, tz + 1.85);
  _rtsBox(g, P.steel, 0.05, 5.6, 0.05, tx + 0.24, 3.6, tz + 1.85);

  /* storage silos */
  [[-S * 0.34, -S * 0.3, 1.05], [-S * 0.34, -S * 0.06, 1.05], [-S * 0.1, -S * 0.34, 0.85]].forEach(function (s) {
    _rtsCyl(g, P.concrete, s[2], s[2], 3.4, 18, s[0], 2.2, s[1]);
    _rtsAdd(g, _rtsGCone(s[2] * 1.06, 0.7, 18), P.team, s[0], 4.2, s[1]);
    _rtsCyl(g, P.steelD, s[2] * 1.04, s[2] * 1.04, 0.22, 18, s[0], 2.6, s[1]);
  });

  /* pipework tying it together */
  [1.2, 1.9].forEach(function (y) {
    var pipe = _rtsCyl(g, P.steel, 0.16, 0.16, S * 0.55, 10, 0, y, -S * 0.34);
    pipe.rotation.z = Math.PI / 2;
  });
  /* flare stack with a live flame */
  _rtsCyl(g, P.steelD, 0.22, 0.3, 5.0, 12, S * 0.4, 3.0, S * 0.3);
  var flame = _rtsAdd(g, _rtsGCone(0.42, 1.3, 12), P.fire, S * 0.4, 6.1, S * 0.3);
  flame.userData.dyn = true;
  flame.name = 'flare';
  flame.castShadow = false;
  return g;
}

/* ================================================================ BARRACKS
   Bunk block, drill yard, watchtower and a team flag. */
function _rtsBldBarracks(side) {
  var T = window.THREE, P = _rtsPal(side), g = new T.Group(), S = 4 * RTS_TILE * 0.92, i;
  _rtsPad(g, P, S, side);

  /* bunk block with a shallow pitched roof */
  var bw = S * 0.72, bd = S * 0.34, bh = 2.5, bz = -S * 0.16;
  _rtsBox(g, P.concrete, bw, bh, bd, 0, 0.5 + bh / 2, bz);
  var roof = new T.Mesh(new T.CylinderGeometry(bd * 0.62, bd * 0.62, bw, 3, 1), P.teamD);
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 6;
  roof.material = P.teamFlat;
  roof.position.set(0, 0.5 + bh + bd * 0.18, bz);
  roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  _rtsWindows(g, P, bw * 0.88, 0.5 + bh * 0.55, bz + bd / 2 + 0.06, 6, true);
  /* door with team surround */
  _rtsBox(g, P.team, 1.5, 2.0, 0.14, -bw * 0.3, 1.5, bz + bd / 2 + 0.05);
  _rtsBox(g, P.black, 1.1, 1.7, 0.06, -bw * 0.3, 1.35, bz + bd / 2 + 0.13);
  /* chimney + vents */
  _rtsBox(g, P.concD, 0.6, 1.3, 0.6, bw * 0.34, 0.5 + bh + 0.9, bz);
  for (i = 0; i < 3; i++) _rtsCyl(g, P.steel, 0.14, 0.14, 0.5, 10, -bw * 0.3 + i * 1.6, 0.5 + bh + bd * 0.42, bz);

  /* drill yard: hazard strip, tyre rows, dummies */
  _rtsBox(g, P.hazard, S * 0.7, 0.08, 0.5, 0, 0.55, S * 0.34);
  for (i = 0; i < 6; i++) {
    var tx = (-2.5 + i) * 0.95;
    _rtsAdd(g, new T.TorusGeometry(0.36, 0.14, 6, 14), P.black, tx, 0.66, S * 0.16).rotation.x = Math.PI / 2;
  }
  [-1, 1].forEach(function (s) {
    _rtsCyl(g, P.rust, 0.13, 0.13, 1.7, 8, s * S * 0.26, 1.35, S * 0.3);
    _rtsBox(g, P.sand, 0.5, 0.75, 0.4, s * S * 0.26, 2.4, S * 0.3);
  });

  /* watchtower */
  var wx = -S * 0.38, wz = -S * 0.34;
  for (i = 0; i < 4; i++) {
    _rtsBox(g, P.steelD, 0.16, 3.6, 0.16, wx + (i % 2 ? 0.55 : -0.55), 2.3, wz + (i < 2 ? 0.55 : -0.55));
  }
  _rtsBox(g, P.concrete, 1.9, 0.9, 1.9, wx, 4.5, wz);
  _rtsBox(g, P.teamD, 2.1, 0.22, 2.1, wx, 5.05, wz);
  _rtsAdd(g, _rtsGSph(0.15), P.lamp, wx, 5.3, wz);
  _rtsRailing(g, P, 1.9, 1.9, 4.95);

  /* flagpole with a team flag */
  var fx = S * 0.4, fz = S * 0.3;
  _rtsCyl(g, P.steel, 0.07, 0.09, 4.4, 10, fx, 2.7, fz);
  var flag = _rtsBox(g, P.team, 1.5, 0.9, 0.05, fx + 0.78, 4.35, fz);
  flag.castShadow = false;
  _rtsSandbags(g, P, S * 0.3, -S * 0.3, 3.0, Math.PI / 2);
  return g;
}

/* ================================================================ WAR FACTORY
   A big assembly shed: ribbed roof, hazard-striped roll-up door, gantry crane and a
   half-finished tank hull on the line. */
function _rtsBldFactory(side) {
  var T = window.THREE, P = _rtsPal(side), g = new T.Group(), S = 5 * RTS_TILE * 0.92, i;
  _rtsPad(g, P, S, side);

  var bw = S * 0.84, bd = S * 0.62, bh = 4.4, bz = -S * 0.1;
  _rtsBox(g, P.concrete, bw, bh, bd, 0, 0.5 + bh / 2, bz);

  /* ribbed roof - the ribs are what make it read as a factory from above */
  _rtsBox(g, P.roof, bw * 0.99, 0.16, bd * 0.99, 0, 0.5 + bh + 0.34, bz);
  _rtsBox(g, P.team, bw * 0.99, 0.17, bd * 0.3, 0, 0.5 + bh + 0.4, bz);
  _rtsBox(g, P.teamD, bw * 1.03, 0.4, bd * 1.03, 0, 0.5 + bh + 0.2, bz);
  for (i = 0; i < 9; i++) {
    var rz = bz - bd * 0.45 + (i / 8) * bd * 0.9;
    _rtsBox(g, P.steelD, bw * 1.0, 0.22, 0.35, 0, 0.5 + bh + 0.5, rz);
  }
  /* skylights */
  [-1, 1].forEach(function (s) {
    _rtsBox(g, P.glass, bw * 0.5, 0.16, bd * 0.13, 0, 0.5 + bh + 0.62, bz + s * bd * 0.24);
  });
  _rtsRoofKit(g, P, bw, bd, 0.5 + bh + 0.4, 3);

  /* roll-up door, recessed, with hazard apron running out to the pad edge */
  var dz = bz + bd / 2 + 0.02;
  _rtsBox(g, P.dark, bw * 0.42, 3.4, 0.3, 0, 2.2, dz);
  _rtsBox(g, P.hazard, bw * 0.44, 0.5, 0.16, 0, 4.05, dz + 0.08);
  for (i = 0; i < 6; i++) _rtsBox(g, P.steelD, bw * 0.4, 0.16, 0.1, 0, 0.9 + i * 0.5, dz + 0.14);
  _rtsBox(g, P.hazard, bw * 0.44, 0.09, S * 0.3, 0, 0.55, S * 0.32);
  [-1, 1].forEach(function (s) {
    _rtsBox(g, P.team, 0.4, 3.6, 0.4, s * bw * 0.24, 2.3, dz + 0.1);
    _rtsAdd(g, _rtsGSph(0.16), P.lamp, s * bw * 0.24, 4.25, dz + 0.1);
  });

  /* half-built tank hull on the apron, under a gantry crane */
  var vx = 0, vz = S * 0.3;
  _rtsBox(g, P.steelD, 3.6, 1.0, 2.2, vx, 1.25, vz);
  _rtsBox(g, P.teamD, 2.0, 0.7, 1.8, vx - 0.3, 2.0, vz);
  for (i = 0; i < 4; i++) {
    var w = _rtsCyl(g, P.black, 0.42, 0.42, 0.35, 12, vx - 1.2 + (i % 2) * 2.4, 0.85, vz + (i < 2 ? 0.95 : -0.95));
    w.rotation.x = Math.PI / 2;
  }
  [-1, 1].forEach(function (s) {
    _rtsBox(g, P.steel, 0.28, 4.6, 0.28, vx + s * 2.6, 2.8, vz);
  });
  _rtsBox(g, P.steel, 5.8, 0.4, 0.5, vx, 5.0, vz);
  _rtsBox(g, P.team, 0.7, 0.5, 0.7, vx + 0.6, 4.6, vz);
  _rtsCyl(g, P.dark, 0.05, 0.05, 1.5, 8, vx + 0.6, 3.7, vz);

  /* exhaust stacks + spare parts */
  [-1, 1].forEach(function (s) {
    _rtsCyl(g, P.steelD, 0.3, 0.36, 2.6, 12, s * bw * 0.38, 0.5 + bh + 1.3, bz - bd * 0.3);
    _rtsCyl(g, P.dark, 0.38, 0.38, 0.2, 12, s * bw * 0.38, 0.5 + bh + 2.7, bz - bd * 0.3);
  });
  for (i = 0; i < 3; i++) {
    _rtsAdd(g, new T.TorusGeometry(0.45, 0.17, 6, 14), P.black,
      -S * 0.4, 0.68 + i * 0.1, -S * 0.3 + i * 1.1).rotation.x = Math.PI / 2;
  }
  _rtsBox(g, P.rust, 1.4, 1.0, 1.0, S * 0.4, 1.0, -S * 0.3);
  return g;
}

/* ================================================================ GUN TURRET
   Armoured drum with a rotating twin-barrel head and a sandbag ring. */
function _rtsBldTurret(side) {
  var T = window.THREE, P = _rtsPal(side), g = new T.Group(), S = 2 * RTS_TILE * 0.92;
  _rtsPad(g, P, S, side);

  _rtsCyl(g, P.concD, S * 0.4, S * 0.46, 1.1, 22, 0, 1.05, 0);
  _rtsCyl(g, P.teamD, S * 0.34, S * 0.38, 1.3, 22, 0, 2.2, 0);
  _rtsCyl(g, P.steelD, S * 0.3, S * 0.3, 0.3, 22, 0, 2.95, 0);

  /* rotating head */
  var head = new T.Group();
  head.position.set(0, 3.25, 0);
  head.userData.dyn = true;
  head.name = 'head';                   /* tracked at the target by the render loop */
  var hull = new T.Mesh(_rtsGBox(2.3, 1.2, 1.9), P.team);
  hull.castShadow = true; head.add(hull);
  var mantlet = new T.Mesh(_rtsGBox(0.6, 1.0, 1.5), P.steelD);
  mantlet.position.set(1.05, 0, 0); mantlet.castShadow = true; head.add(mantlet);
  [-0.42, 0.42].forEach(function (z) {
    var br = new T.Mesh(_rtsGCyl(0.16, 0.19, 3.6, 14), P.dark);
    br.rotation.z = -Math.PI / 2; br.position.set(2.6, 0.05, z);
    br.castShadow = true; head.add(br);
    var mz = new T.Mesh(_rtsGCyl(0.24, 0.24, 0.35, 14), P.steelD);
    mz.rotation.z = -Math.PI / 2; mz.position.set(4.3, 0.05, z);
    head.add(mz);
  });
  var box = new T.Mesh(_rtsGBox(0.8, 0.5, 0.6), P.rust);
  box.position.set(-1.0, 0.2, 0.75); head.add(box);
  g.add(head);

  _rtsSandbags(g, P, 0, S * 0.42, 3.0, 0);
  _rtsSandbags(g, P, 0, -S * 0.42, 3.0, 0);
  return g;
}

/* -------------------------------------------------------------- dispatcher */
function _rtsBuild(key, side) {
  if (key === 'yard')     return _rtsBldYard(side);
  if (key === 'power')    return _rtsBldPower(side);
  if (key === 'refinery') return _rtsBldRefinery(side);
  if (key === 'barracks') return _rtsBldBarracks(side);
  if (key === 'factory')  return _rtsBldFactory(side);
  if (key === 'turret')   return _rtsBldTurret(side);
  return null;
}
