/* RC COMMAND - render layer. Owns the THREE.js scene; reads the sim, never writes it.

   Structures come from rts.buildings.js - this game's own models. Each type is built once
   per (type, side), merged by material, then .clone()d for every copy on the map, since
   clone() shares geometry and materials. Units are separate low-poly models built here,
   because dozens of them move at once and they need to stay cheap. */

var _rtsR = null;              /* renderer state */
var _RTS_PROTO = {};           /* building key -> prototype Group (batched, scaled, cached) */

function _rtsTeamMat(side, kind) {
  var S = RTS_SIDES[side], T = window.THREE;
  _rtsR.mats = _rtsR.mats || {};
  var k = side + ':' + kind;
  if (_rtsR.mats[k]) return _rtsR.mats[k];
  var m;
  /* metalness stays at 0 for the coloured parts: with no environment map a metallic
     surface loses its diffuse colour and every unit turns grey instead of team-coloured. */
  if (kind === 'body')      m = new T.MeshStandardMaterial({ color:S.color, roughness:0.55, metalness:0 });
  else if (kind === 'dark') m = new T.MeshStandardMaterial({ color:0x2b3038, roughness:0.8, metalness:0.15 });
  else if (kind === 'trim') m = new T.MeshStandardMaterial({ color:S.glow, roughness:0.45, metalness:0 });
  else if (kind === 'glow') m = new T.MeshStandardMaterial({ color:S.glow, emissive:S.glow, emissiveIntensity:0.8, roughness:0.4 });
  else                      m = new T.MeshStandardMaterial({ color:S.color, roughness:0.7 });
  _rtsR.mats[k] = m;
  return m;
}

/* ------------------------------------------------------------ scene setup */
function _rtsRInit(cv) {
  var T = window.THREE;
  var W = cv.clientWidth || 960, H = cv.clientHeight || 620;
  var ren = new T.WebGLRenderer({ canvas:cv, antialias:true });
  ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  ren.setSize(W, H, false);
  ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap;
  try { ren.outputEncoding = T.sRGBEncoding; } catch (_e) {}
  try { ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 0.78; } catch (_e2) {}

  var sc = new T.Scene();
  sc.background = new T.Color(0x9fb8c8);
  /* no fog: depth-based fog is meaningless under an overhead ortho camera, and the classic
     look is a flat, evenly-lit, fully readable map right out to the border */

  /* Orthographic, not perspective. The mid-90s RTS look is a flat overhead view with no
     perspective divergence - buildings at the top of the screen are the same size as ones at
     the bottom, and the whole battlefield reads as a map rather than a diorama. A perspective
     camera is the single biggest reason the first pass felt modern rather than classic.
     R.dist is the world height visible on screen; the frustum is derived from it. */
  var cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 1200);

  sc.add(new T.HemisphereLight(0xcfe4f4, 0x5c5a48, 0.55));
  var sun = new T.DirectionalLight(0xfff1d8, 1.15);
  sun.position.set(60, 110, 50); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 320;
  sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  sc.add(sun); sc.add(sun.target);

  _rtsR = { ren:ren, sc:sc, cam:cam, sun:sun, W:W, H:H,
    focus:{ x:_rtsWX(21), z:_rtsWX(87) }, dist:104, mats:{},
    meshes:{}, projM:[], fxM:[], ray:new T.Raycaster(), ground:null, scrapIM:null, ghost:null };

  _rtsBuildGround();
  _rtsBuildScrap();
  _rtsApplyCam();
  return _rtsR;
}

/* Ground: one big plane with a generated dirt/grid texture, plus rock meshes wherever
   the sim marked terrain as impassable, so what you see matches what blocks a unit. */
function _rtsBuildGround() {
  var T = window.THREE, R = _rtsR, span = RTS_N * RTS_TILE;
  var c = document.createElement('canvas'); c.width = c.height = 512;
  var g = c.getContext('2d');
  g.fillStyle = '#6f7a52'; g.fillRect(0, 0, 512, 512);
  var i, x, y;
  for (i = 0; i < 5200; i++) {
    x = Math.random() * 512; y = Math.random() * 512;
    var sh = Math.random();
    g.fillStyle = sh > 0.66 ? 'rgba(126,136,92,0.5)' : (sh > 0.33 ? 'rgba(92,100,68,0.5)' : 'rgba(112,104,74,0.4)');
    g.fillRect(x, y, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  g.strokeStyle = 'rgba(40,46,32,0.16)'; g.lineWidth = 1;
  for (i = 0; i <= 8; i++) { var p = i * 64;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); }
  var tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(RTS_N / 8, RTS_N / 8);
  try { tex.encoding = T.sRGBEncoding; } catch (_e) {}
  tex.anisotropy = 4;
  var gm = new T.Mesh(new T.PlaneGeometry(span, span), new T.MeshStandardMaterial({ map:tex, roughness:0.97 }));
  gm.rotation.x = -Math.PI / 2; gm.receiveShadow = true;
  R.sc.add(gm); R.ground = gm;

  /* map border so the battlefield reads as a contained arena */
  var wallM = new T.MeshStandardMaterial({ color:0x4a4d43, roughness:0.95 });
  var wt = 3, wh = 5;
  [[0, -span / 2 - wt / 2, span + wt * 2, wt], [0, span / 2 + wt / 2, span + wt * 2, wt],
   [-span / 2 - wt / 2, 0, wt, span + wt * 2], [span / 2 + wt / 2, 0, wt, span + wt * 2]].forEach(function (w) {
    var m = new T.Mesh(new T.BoxGeometry(w[2], wh, w[3]), wallM);
    m.position.set(w[0], wh / 2, w[1]); m.castShadow = true; m.receiveShadow = true; R.sc.add(m);
  });

  /* rocks on every terrain-blocked tile */
  var G = window._rtsG, rockG = new T.DodecahedronGeometry(RTS_TILE * 0.46, 0);
  var rockM = new T.MeshStandardMaterial({ color:0x76705f, roughness:0.95, flatShading:true });
  var rocks = [];
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    if (G.blocked[_rtsIdx(tx, tz)] === 2) rocks.push([tx, tz]);
  }
  if (rocks.length) {
    var im = new T.InstancedMesh(rockG, rockM, rocks.length), d = new T.Object3D();
    for (i = 0; i < rocks.length; i++) {
      d.position.set(_rtsWX(rocks[i][0]), RTS_TILE * 0.22, _rtsWX(rocks[i][1]));
      d.rotation.set(Math.random(), Math.random() * 6.28, Math.random());
      d.scale.setScalar(0.8 + Math.random() * 0.5);
      d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    im.castShadow = true; im.receiveShadow = true;
    R.sc.add(im);
  }
}

/* Ore fields, classic style: flat gold patches lying ON the terrain rather than crystals
   standing up off it, so the field reads as ground you drive a harvester across. Two
   instanced layers - a wide flat patch, plus scattered chunks that only show at high
   density - and both shrink as the tile is mined, so a worked-out field visibly thins. */
function _rtsBuildScrap() {
  var T = window.THREE, R = _rtsR, G = window._rtsG, i;
  ['oreIM', 'oreChunkIM'].forEach(function (k) {
    if (R[k]) { R.sc.remove(R[k]); R[k].geometry.dispose(); R[k] = null; }
  });
  var tiles = [];
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    if (G.scrap[_rtsIdx(tx, tz)] > 0) tiles.push([tx, tz]);
  }
  R.oreTiles = tiles;
  if (!tiles.length) return;
  /* Gold picked dark, for the usual reason: the scene multiplies ~1.5x before ACES, so a
     bright yellow renders as washed cream. */
  var patchMat = new T.MeshStandardMaterial({ color:0x8a6412, emissive:0xc9911f, emissiveIntensity:0.22,
    roughness:0.55, metalness:0.15, flatShading:true });
  var chunkMat = new T.MeshStandardMaterial({ color:0xa07a1c, emissive:0xd8a42c, emissiveIntensity:0.3,
    roughness:0.45, metalness:0.2, flatShading:true });
  R.oreIM = new T.InstancedMesh(new T.CylinderGeometry(RTS_TILE * 0.74, RTS_TILE * 0.68, 0.22, 7), patchMat, tiles.length);
  R.oreChunkIM = new T.InstancedMesh(new T.DodecahedronGeometry(RTS_TILE * 0.15, 0), chunkMat, tiles.length);
  R.oreIM.receiveShadow = true;
  R.oreChunkIM.castShadow = true;
  R.sc.add(R.oreIM); R.sc.add(R.oreChunkIM);
  _rtsSyncOre(true);
}
/* Push current amounts into the instance matrices. Cheap enough to run a few times a second
   over the whole field, which is what makes depletion actually visible while mining. */
function _rtsSyncOre() {
  var R = _rtsR, G = window._rtsG;
  if (!R.oreIM || !R.oreTiles) return;
  var d = new window.THREE.Object3D(), i;
  for (i = 0; i < R.oreTiles.length; i++) {
    var tx = R.oreTiles[i][0], tz = R.oreTiles[i][1];
    var f = Math.max(0, Math.min(1, G.scrap[_rtsIdx(tx, tz)] / RTS_SCRAP_TILE));
    var x = _rtsWX(tx), z = _rtsWX(tz);
    /* patch: fades out by shrinking flat, never by popping */
    /* neighbouring patches overlap at full density so a rich field reads as continuous
       ground rather than a polka-dot grid; jitter keeps the tiling from showing through */
    var jx = (((tx * 13 + tz * 7) % 7) / 7 - 0.5) * RTS_TILE * 0.3;
    var jz = (((tx * 5 + tz * 11) % 7) / 7 - 0.5) * RTS_TILE * 0.3;
    var s = f <= 0 ? 0 : (0.5 + f * 0.55) * (0.88 + ((tx * 3 + tz * 5) % 5) * 0.055);
    d.position.set(x + jx, 0.1, z + jz);
    d.rotation.set(0, (tx * 7 + tz * 13) * 0.31, 0);
    d.scale.set(s, f <= 0 ? 0.001 : 0.6 + f * 0.9, s);
    d.updateMatrix(); R.oreIM.setMatrixAt(i, d.matrix);
    /* chunks only once the tile is reasonably rich */
    var cf = Math.max(0, (f - 0.35) / 0.65);
    d.position.set(x + ((i % 3) - 1) * RTS_TILE * 0.22, 0.28, z + ((i % 5) - 2) * RTS_TILE * 0.16);
    d.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    d.scale.setScalar(cf <= 0 ? 0.001 : 0.55 + cf * 0.85);
    d.updateMatrix(); R.oreChunkIM.setMatrixAt(i, d.matrix);
  }
  R.oreIM.instanceMatrix.needsUpdate = true;
  R.oreChunkIM.instanceMatrix.needsUpdate = true;
}

/* ---------------------------------------------------- building prototypes --
   Built once per (type, side) from the game's own models in rts.buildings.js, merged by
   material, then cloned per copy. clone() shares geometry and materials, so a dozen
   structures cost about as much as one. Faction colour is baked into the model, so the
   prototype cache is keyed by side as well as type. */
function _rtsProto(key, side) {
  var T = window.THREE, ck = key + ':' + side;
  if (_RTS_PROTO[ck]) return _RTS_PROTO[ck];
  var g = _rtsMergeGroup(_rtsBuild(key, side));
  /* Fit the finished model to the footprint the rules give it, rather than trusting each
     builder to have been authored at the right size. Footprints follow the original game's
     (Construction Yard 3x3, Power Plant 2x2, turret 1x1), and scaling the whole group keeps
     every proportion intact - heights included - however the builder was written. */
  var def = rtsStructDef(key);
  var bb = new T.Box3().setFromObject(g), size = bb.getSize(new T.Vector3());
  var want = Math.max(def.w, def.h) * RTS_TILE * 0.94;
  var s = want / Math.max(0.001, Math.max(size.x, size.z));
  var holder = new T.Group();
  g.scale.setScalar(s);
  g.position.set(-((bb.min.x + bb.max.x) / 2) * s, -bb.min.y * s, -((bb.min.z + bb.max.z) / 2) * s);
  holder.add(g);
  _RTS_PROTO[ck] = holder;
  return holder;
}

/* ------------------------------------------------------------ unit models --
   Small, shared-geometry RC models. Each returns a Group with userData.turret set to
   the sub-group that should track a target (if any). */
var _RTS_UG = null;
function _rtsUnitGeo() {
  if (_RTS_UG) return _RTS_UG;
  var T = window.THREE;
  _RTS_UG = {
    wheel: new T.CylinderGeometry(0.62, 0.62, 0.5, 14),
    body:  new T.BoxGeometry(3.4, 1.0, 2.1),
    cab:   new T.BoxGeometry(1.5, 0.9, 1.7),
    tbody: new T.BoxGeometry(4.2, 1.2, 2.6),
    tturr: new T.BoxGeometry(2.1, 0.9, 1.9),
    barrel:new T.CylinderGeometry(0.22, 0.26, 3.4, 12),
    /* three r128 predates CapsuleGeometry - a slightly tapered cylinder reads the same at this zoom */
    torso: new T.CylinderGeometry(0.26, 0.34, 1.25, 12),
    head:  new T.SphereGeometry(0.28, 12, 10),
    hbody: new T.BoxGeometry(4.6, 1.9, 2.9),
    hbin:  new T.BoxGeometry(2.4, 1.5, 2.5)
  };
  return _RTS_UG;
}
function _rtsUnitMesh(e) {
  var T = window.THREE, U = _rtsUnitGeo(), d = rtsUnitDef(e.def);
  var g = new T.Group(), body = _rtsTeamMat(e.side, 'body'), dark = _rtsTeamMat(e.side, 'dark'), trim = _rtsTeamMat(e.side, 'trim');
  var i, w;
  function wheels(n, ax, az, y) {
    for (i = 0; i < n; i++) {
      w = new T.Mesh(U.wheel, dark);
      w.rotation.x = Math.PI / 2;
      w.position.set((i < n / 2 ? ax : -ax), y, (i % 2 ? az : -az));
      w.castShadow = true; g.add(w);
    }
  }
  if (d.kind === 'infantry') {
    /* a squad reads better than a lone figure at RTS zoom */
    for (i = 0; i < 3; i++) {
      var p = new T.Group();
      p.position.set((i - 1) * 0.75, 0, (i % 2 ? 0.5 : -0.5));
      var t = new T.Mesh(U.torso, body); t.position.y = 0.95; t.castShadow = true; p.add(t);
      var h = new T.Mesh(U.head, trim); h.position.y = 1.62; h.castShadow = true; p.add(h);
      g.add(p);
    }
    if (e.def === 'rocket') {
      var tube = new T.Mesh(U.barrel, dark);
      tube.scale.set(0.5, 0.5, 0.5); tube.rotation.z = Math.PI / 2;
      tube.position.set(0.3, 1.4, 0); g.add(tube);
    }
  } else if (e.def === 'tank') {
    var hull = new T.Mesh(U.tbody, body); hull.position.y = 1.0; hull.castShadow = true; g.add(hull);
    wheels(6, 1.4, 1.35, 0.62);
    var turr = new T.Group(); turr.position.y = 1.9; g.add(turr);
    var tb = new T.Mesh(U.tturr, trim); tb.castShadow = true; turr.add(tb);
    var br = new T.Mesh(U.barrel, dark); br.rotation.z = -Math.PI / 2; br.position.set(2.4, 0.05, 0); br.castShadow = true; turr.add(br);
    g.userData.turret = turr;
  } else if (e.def === 'harvester') {
    var hb = new T.Mesh(U.hbody, body); hb.position.y = 1.35; hb.castShadow = true; g.add(hb);
    var bin = new T.Mesh(U.hbin, dark); bin.position.set(-1.2, 2.6, 0); bin.castShadow = true; g.add(bin);
    var cab2 = new T.Mesh(U.cab, trim); cab2.position.set(1.7, 2.5, 0); cab2.castShadow = true; g.add(cab2);
    wheels(6, 1.6, 1.5, 0.72);
    /* the load glows green as it fills, so you can read a full harvester at a glance */
    var load = new T.Mesh(new T.BoxGeometry(2.2, 0.5, 2.3), new T.MeshStandardMaterial({
      color:0x6fe3b8, emissive:0x1d8f68, emissiveIntensity:0.6, roughness:0.35 }));
    load.position.set(-1.2, 3.4, 0); load.visible = false; g.add(load);
    g.userData.load = load;
  } else { /* buggy */
    var bd = new T.Mesh(U.body, body); bd.position.y = 0.95; bd.castShadow = true; g.add(bd);
    var cb = new T.Mesh(U.cab, trim); cb.position.set(-0.4, 1.85, 0); cb.castShadow = true; g.add(cb);
    wheels(4, 1.25, 1.2, 0.62);
    var mg = new T.Group(); mg.position.set(0.4, 1.9, 0); g.add(mg);
    var gun = new T.Mesh(U.barrel, dark); gun.scale.set(0.55, 0.5, 0.55); gun.rotation.z = -Math.PI / 2;
    gun.position.set(0.9, 0, 0); mg.add(gun);
    g.userData.turret = mg;
  }
  /* muzzle flash, reused every shot */
  var fl = new T.Mesh(new T.SphereGeometry(0.5, 8, 6), new T.MeshBasicMaterial({ color:0xffd98a }));
  fl.visible = false; g.add(fl); g.userData.flash = fl;
  return g;
}

/* -------------------------------------------------- entity mesh lifecycle */
function _rtsRSync() {
  var T = window.THREE, R = _rtsR, G = window._rtsG, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead) {
      if (e.mesh) { R.sc.remove(e.mesh); e.mesh = null; }
      e.reaped = true;
      continue;
    }
    if (e.mesh) continue;
    var m;
    if (e.type === 'struct') {
      var def = rtsStructDef(e.def);
      /* clone() shares geometry+materials, but the animated sub-groups are cloned too, so
         re-read them off the clone rather than the prototype. */
      m = _rtsProto(e.def, e.side).clone();
      /* animated parts are found by name on the clone - clone() copies names, so this is
         the one lookup that stays valid across copies */
      m.userData.radar = m.getObjectByName('radar');
      m.userData.head = m.getObjectByName('head');
      m.userData.flare = m.getObjectByName('flare');
      /* Team ring around the footprint. The models are faction-coloured now, but the ring
         still reads instantly at a distance and marks the exact tile footprint. */
      var rad = Math.max(def.w, def.h) * RTS_TILE * 0.55;
      var pad = new T.Mesh(new T.RingGeometry(rad * 0.82, rad, 40),
        new T.MeshBasicMaterial({ color:RTS_SIDES[e.side].color, transparent:true, opacity:0.9, side:T.DoubleSide }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.06;
      var wrap = new T.Group(); wrap.add(pad); wrap.add(m);
      wrap.userData.model = m;
      m = wrap;
    } else {
      m = _rtsUnitMesh(e);
    }
    m.position.set(e.x, 0, e.z);
    R.sc.add(m); e.mesh = m;
  }
  /* a tile merely emptying is handled by the periodic sync, but ore SPREADING creates
     tiles that were not in the instanced field at all - that needs a re-lay. */
  if (G.scrapDirty) { G.scrapDirty = false; _rtsBuildScrap(); }
}

/* ------------------------------------------------------------ per frame */
/* Ground z-offset per unit of camera height. 0.42 puts the eye about 67 degrees above the
   horizon - near-vertical like the original, but with just enough tilt that buildings show a
   face and a silhouette instead of reading as flat roof plans. */
var RTS_CAM_TILT = 0.48;
var RTS_CAM_HEIGHT = 320;      /* orthographic, so this only has to clear the tallest model */

function _rtsApplyCam() {
  var R = _rtsR, c = R.cam, f = R.focus, d = R.dist;
  var asp = R.W / Math.max(1, R.H);
  c.left = -d * asp / 2; c.right = d * asp / 2;
  c.top = d / 2; c.bottom = -d / 2;
  c.updateProjectionMatrix();
  c.position.set(f.x, RTS_CAM_HEIGHT, f.z + RTS_CAM_HEIGHT * RTS_CAM_TILT);
  c.lookAt(f.x, 0, f.z);
  R.sun.position.set(f.x + 60, 110, f.z + 50);
  R.sun.target.position.set(f.x, 0, f.z);
  R.sun.target.updateMatrixWorld();
  /* keep the shadow volume matched to what is actually on screen */
  var sh = R.sun.shadow.camera, ext = Math.max(60, d * 0.8);
  if (sh.right !== ext) {
    sh.left = -ext; sh.right = ext; sh.top = ext; sh.bottom = -ext;
    sh.updateProjectionMatrix();
  }
}
/* Ground area the camera covers, used for the minimap viewport box. The tilt stretches the
   visible ground along z by 1/sin(elevation). */
function _rtsViewSpan() {
  var R = _rtsR, asp = R.W / Math.max(1, R.H);
  var sinEl = 1 / Math.sqrt(1 + RTS_CAM_TILT * RTS_CAM_TILT);
  return { w: R.dist * asp, h: R.dist / sinEl };
}
function _rtsRFrame(dt) {
  var T = window.THREE, R = _rtsR, G = window._rtsG, i;
  _rtsRSync();
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || !e.mesh) continue;
    e.mesh.position.x = e.x; e.mesh.position.z = e.z;
    if (e.type === 'unit') {
      e.mesh.rotation.y = -e.rot + Math.PI / 2;
      var tu = e.mesh.userData.turret;
      if (tu) tu.rotation.y = -(e.turret - e.rot);
      var ld = e.mesh.userData.load;
      if (ld) { var d = rtsUnitDef(e.def); ld.visible = e.carry > 1; ld.scale.y = Math.max(0.15, e.carry / d.capacity); }
      var fl = e.mesh.userData.flash;
      if (fl) {
        fl.visible = e.fire > 0;
        if (e.fire > 0) { fl.position.set(Math.cos(e.turret - e.rot) * 2.6, 1.5, -Math.sin(e.turret - e.rot) * 2.6);
          fl.scale.setScalar(0.6 + e.fire * 4); }
      }
    } else {
      var sd = rtsStructDef(e.def);
      var model = e.mesh.userData.model || e.mesh;
      if (e.building) {
        /* rises out of the ground as it builds */
        model.scale.y = Math.max(0.04, e.bprog);
        model.visible = true;
      } else if (model.scale.y !== 1) model.scale.y = 1;
      var ud = model.userData;
      if (ud) {
        /* a turret head tracks its target; a radar dish sweeps; a flare stack flickers */
        if (ud.head && sd.weapon) ud.head.rotation.y = -e.rot + Math.PI / 2;
        if (ud.radar && !e.building) ud.radar.rotation.y += dt * 0.55;
        if (ud.flare && !e.building) {
          var f = 0.85 + Math.sin(G.t * 11 + e.id) * 0.13 + Math.sin(G.t * 27 + e.id * 2) * 0.06;
          ud.flare.scale.set(f, 0.85 + f * 0.3, f);
        }
      }
    }
    /* hit flash: lift the whole thing a hair so a hit reads even in a crowd */
    e.mesh.position.y = (e.hitT > 0) ? 0.22 : 0;
  }
  _rtsSyncProj();
  _rtsSyncFx(dt);
  /* refresh the ore field a few times a second so mining visibly eats into it */
  R.oreT = (R.oreT || 0) + dt;
  if (R.oreT > 0.28) { R.oreT = 0; _rtsSyncOre(); }
  R.ren.render(R.sc, R.cam);
}
function _rtsSyncProj() {
  var T = window.THREE, R = _rtsR, G = window._rtsG, i;
  while (R.projM.length < G.proj.length) {
    var m = new T.Mesh(new T.SphereGeometry(0.4, 8, 6), new T.MeshBasicMaterial({ color:0xffe6a8 }));
    R.sc.add(m); R.projM.push(m);
  }
  for (i = 0; i < R.projM.length; i++) {
    var p = G.proj[i];
    if (!p) { R.projM[i].visible = false; continue; }
    R.projM[i].visible = true;
    R.projM[i].position.set(p.x, p.y, p.z);
    R.projM[i].scale.setScalar(p.kind === 'missile' ? 1.2 : 0.85);
  }
}
function _rtsSyncFx(dt) {
  var T = window.THREE, R = _rtsR, G = window._rtsG, i;
  while (R.fxM.length < G.fx.length) {
    var m = new T.Mesh(new T.SphereGeometry(1, 12, 8),
      new T.MeshBasicMaterial({ color:0xffb347, transparent:true, opacity:0.9 }));
    R.sc.add(m); R.fxM.push(m);
  }
  for (i = 0; i < R.fxM.length; i++) {
    var f = G.fx[i], m2 = R.fxM[i];
    if (!f) { m2.visible = false; continue; }
    if (f.kind === 'tracer') {
      /* a tracer is drawn as a short streak at the midpoint - cheap and reads fine */
      m2.visible = f.t < 0.09;
      m2.position.set((f.x + f.x2) / 2, f.y, (f.z + f.z2) / 2);
      m2.scale.set(0.22, 0.22, Math.max(1, Math.hypot(f.x2 - f.x, f.z2 - f.z) * 0.5));
      m2.material.color.setHex(0xfff0b0); m2.material.opacity = 0.85;
    } else {
      var k = f.t / 0.75, big = (f.big || 1);
      m2.visible = k < 1;
      m2.position.set(f.x, f.y + k * big * 1.6, f.z);
      m2.scale.setScalar(Math.max(0.01, big * (0.5 + k * 2.4)));
      m2.material.color.setHex(f.kind === 'boom' ? 0xff8a3c : 0xffc76a);
      m2.material.opacity = Math.max(0, 0.95 - k);
    }
  }
}

/* ------------------------------------------------------------- sidebar icons --
   The classic sidebar is a grid of little rendered pictures of the thing you are building,
   not a text list. Rather than ship hand-drawn art, each icon is a real 3/4 render of the
   actual model, generated once into a data URL on its own throwaway renderer (created,
   used for all eleven icons, then disposed - it never lingers as a second GL context). */
function _rtsMakeIcons(side) {
  var T = window.THREE, out = {};
  var cv = document.createElement('canvas');
  cv.width = cv.height = 112;
  var ren;
  try {
    ren = new T.WebGLRenderer({ canvas:cv, antialias:true, alpha:true, preserveDrawingBuffer:true });
  } catch (_e) { return out; }
  ren.setPixelRatio(1); ren.setSize(112, 112, false);
  try { ren.outputEncoding = T.sRGBEncoding; } catch (_e1) {}
  try { ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 1.0; } catch (_e2) {}
  var sc = new T.Scene();
  sc.add(new T.HemisphereLight(0xd6e8f6, 0x60604c, 0.85));
  var dl = new T.DirectionalLight(0xfff2dc, 1.35); dl.position.set(5, 8, 6); sc.add(dl);
  var dl2 = new T.DirectionalLight(0xa9c8f0, 0.35); dl2.position.set(-5, 3, -4); sc.add(dl2);
  var cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 800);
  function shot(obj) {
    if (!obj) return null;
    sc.add(obj);
    var bb = new T.Box3().setFromObject(obj);
    var size = bb.getSize(new T.Vector3()), ctr = bb.getCenter(new T.Vector3());
    var m = Math.max(0.5, Math.max(size.x, size.y, size.z) * 0.62);
    cam.left = -m; cam.right = m; cam.top = m; cam.bottom = -m;
    cam.updateProjectionMatrix();
    cam.position.set(ctr.x + m * 2.2, ctr.y + m * 2.4, ctr.z + m * 2.2);
    cam.lookAt(ctr.x, ctr.y, ctr.z);
    ren.render(sc, cam);
    var url = cv.toDataURL('image/png');
    sc.remove(obj);
    return url;
  }
  var i;
  for (i = 0; i < RTS_STRUCTS.length; i++) {
    try { out[RTS_STRUCTS[i].key] = shot(_rtsMergeGroup(_rtsBuild(RTS_STRUCTS[i].key, side))); } catch (_s) {}
  }
  for (i = 0; i < RTS_UNITS.length; i++) {
    try { out[RTS_UNITS[i].key] = shot(_rtsUnitMesh({ def:RTS_UNITS[i].key, side:side })); } catch (_u) {}
  }
  try { ren.dispose(); if (ren.forceContextLoss) ren.forceContextLoss(); } catch (_d) {}
  return out;
}

/* -------------------------------------------------------------- picking */
function _rtsGroundAt(mx, my) {
  var T = window.THREE, R = _rtsR;
  var nd = new T.Vector2((mx / R.W) * 2 - 1, -(my / R.H) * 2 + 1);
  R.ray.setFromCamera(nd, R.cam);
  var plane = new T.Plane(new T.Vector3(0, 1, 0), 0), pt = new T.Vector3();
  if (!R.ray.ray.intersectPlane(plane, pt)) return null;
  return { x:pt.x, z:pt.z };
}
/* Entity picking is done in world space against the ground hit rather than by raycasting
   the meshes: a batched building is thousands of triangles, and "did I click near this
   thing's footprint" is both cheaper and more forgiving to aim at. */
function _rtsPickAt(mx, my) {
  var G = window._rtsG, p = _rtsGroundAt(mx, my);
  if (!p) return null;
  var best = null, bd = 1e9, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead) continue;
    var rad, d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.type === 'struct') { var sd = rtsStructDef(e.def); rad = Math.max(sd.w, sd.h) * RTS_TILE * 0.5; }
    else rad = Math.max(2.2, e.r * 1.5);
    if (d <= rad && d < bd) { bd = d; best = e; }
  }
  return best ? { ent:best, x:p.x, z:p.z } : { ent:null, x:p.x, z:p.z };
}
function _rtsWorldToScreen(x, y, z) {
  var T = window.THREE, R = _rtsR;
  var v = new T.Vector3(x, y, z).project(R.cam);
  return { x:(v.x * 0.5 + 0.5) * R.W, y:(-v.y * 0.5 + 0.5) * R.H, behind:v.z > 1 };
}

/* ------------------------------------------------------- placement ghost */
function _rtsGhostShow(key) {
  var T = window.THREE, R = _rtsR, def = rtsStructDef(key);
  _rtsGhostHide();
  var g = new T.Group();
  var w = def.w * RTS_TILE, h = def.h * RTS_TILE;
  var mat = new T.MeshBasicMaterial({ color:0x6fe08a, transparent:true, opacity:0.35, depthWrite:false });
  var pad = new T.Mesh(new T.BoxGeometry(w, 0.4, h), mat);
  pad.position.y = 0.2; g.add(pad);
  var edge = new T.Mesh(new T.BoxGeometry(w, 6, h), new T.MeshBasicMaterial({
    color:0x6fe08a, transparent:true, opacity:0.14, depthWrite:false }));
  edge.position.y = 3; g.add(edge);
  g.userData.mats = [mat, edge.material];
  R.sc.add(g); R.ghost = g; R.ghostKey = key;
}
function _rtsGhostHide() {
  var R = _rtsR;
  if (R && R.ghost) { R.sc.remove(R.ghost); R.ghost = null; R.ghostKey = null; }
}
function _rtsGhostMove(tx, tz, ok) {
  var R = _rtsR;
  if (!R.ghost) return;
  var def = rtsStructDef(R.ghostKey);
  R.ghost.position.set(_rtsWX(tx) + (def.w - 1) * RTS_TILE / 2, 0, _rtsWX(tz) + (def.h - 1) * RTS_TILE / 2);
  var c = ok ? 0x6fe08a : 0xe8604a;
  R.ghost.userData.mats.forEach(function (m) { m.color.setHex(c); });
}
function _rtsRResize(W, H) {
  var R = _rtsR;
  if (!R) return;
  R.W = W; R.H = H;
  R.ren.setSize(W, H, false);
  _rtsApplyCam();                 /* ortho frustum is derived from size + dist */
}
function _rtsRDispose() {
  var R = _rtsR;
  if (!R) return;
  try { R.sc.traverse(function (o) { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); }); } catch (_e) {}
  try { R.ren.dispose(); if (R.ren.forceContextLoss) R.ren.forceContextLoss(); } catch (_e2) {}
  _rtsR = null; _RTS_PROTO = {}; _RTS_UG = null; _RTS_GC = {}; _RTS_MATS = {}; _RTS_HAZ = null;
}
