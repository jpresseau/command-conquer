/* render3d/sky3d.js - the time of day and the weather. Part of rts.render3d.

   Every battle was fought at the same bright noon. Now a battle has CONDITIONS: day, dusk,
   night, rain or fog - the player's choice on the title screen, kept per device, or AUTO, which
   picks from the map's seed so the same battle always comes back under the same sky (and a
   loaded save with it). Cosmetic, all of it: nothing here reads or writes the simulation.

   THE LIGHT. The sun's direction is baked into the shaders and the shadow map, so the hour is
   told by its COLOUR: the lit side of everything by uDarkL, the shaded side by uDarkS, both
   given as how much DARKER than day - so a program that never had them set draws day, and day
   itself is the exact picture it always was. A haze (uHaze: colour, amount) settles over the
   distance at dusk, in rain and in fog. Every program gets them where it gets the camera
   (_r3dCamU, cam3d.js).

   THE LIGHTS. At dusk, at night and in rain the lamps come on: the bases' lamp posts, the
   bridges' lamps, a light over every building's door and two headlights on every vehicle that
   is moving - glows in the effects pass (so they bloom), and the nearest of them as point
   lights that reach the ground and the models round them (fxlight3d.js), beside whatever is
   burning.

   THE WEATHER. Rain falls as streaks round the view, ringing where it lands, and the ground
   goes wet: darker, with puddles that hold the sky. Fog drifts across the ground in banks. */

var R3D_SKIES = {
  /* L, S: the lit and shaded sides' colour against day; haze: rgb, amount; night: how far the
     lamps are on; wet; rain; banks: fog banks */
  day:   { L: [1, 1, 1],          S: [1, 1, 1],          haze: [0, 0, 0, 0],             night: 0,    wet: 0, rain: 0, banks: 0 },
  dusk:  { L: [1.04, 0.74, 0.52], S: [0.56, 0.50, 0.66], haze: [0.92, 0.58, 0.40, 0.10], night: 0.5,  wet: 0, rain: 0, banks: 0 },
  night: { L: [0.24, 0.29, 0.46], S: [0.15, 0.18, 0.31], haze: [0.04, 0.06, 0.12, 0.10], night: 1,    wet: 0, rain: 0, banks: 0 },
  rain:  { L: [0.64, 0.68, 0.74], S: [0.57, 0.61, 0.69], haze: [0.52, 0.57, 0.63, 0.20], night: 0.35, wet: 1, rain: 1, banks: 0 },
  fog:   { L: [0.86, 0.88, 0.91], S: [0.75, 0.78, 0.83], haze: [0.76, 0.79, 0.82, 0.32], night: 0.15, wet: 0, rain: 0, banks: 1 },
  /* bright, and cold in the shade: the ground white, snow on every roof, the shore frozen */
  snow:  { L: [0.93, 0.95, 1.0],  S: [0.66, 0.72, 0.86], haze: [0.86, 0.89, 0.94, 0.14], night: 0.15, wet: 0, rain: 0, banks: 0, snow: 1 }
};
/* THE CYCLE: a day passes over the battle. The hour runs from RTS_DAY_START through a whole day
   in RTS_DAY_LEN seconds of game time; the sky is the presets blended at their hours, and the
   sun itself moves - round the map and up and down the sky - so the shadows swing. */
var RTS_DAY_LEN = 960;           /* game seconds for a whole day */
var RTS_DAY_START = 8;           /* the hour a battle starts at */
var RTS_DAY_NOON = 11;           /* the hour the sun stands where the sprite baker put it */
var RTS_DAY_KEYS = [[0, 'night'], [5, 'night'], [6.5, 'dusk'], [8, 'day'], [17, 'day'], [18.5, 'dusk'], [20, 'night'], [24, 'night']];
var RTS_SKY_LS = 'rtsSky';
var RTS_SKY_KEYS = ['auto', 'day', 'dusk', 'night', 'rain', 'fog', 'snow', 'cycle'];

/* What the player chose: one of RTS_SKY_KEYS. */
/* Read from storage once and then kept: it is asked every frame. */
function _rtsSkyWant() {
  if (window._RTS_SKY_W) return window._RTS_SKY_W;
  var v = null;
  try { v = window.localStorage.getItem(RTS_SKY_LS); } catch (e) { v = null; }
  return (window._RTS_SKY_W = RTS_SKY_KEYS.indexOf(v) > 0 ? v : 'auto');
}
function _rtsSkySetWant(v) {
  v = RTS_SKY_KEYS.indexOf(v) > 0 ? v : 'auto';      /* the presets, and the cycle that blends them */
  window._RTS_SKY_W = v;
  try {
    if (v !== 'auto') window.localStorage.setItem(RTS_SKY_LS, v);
    else window.localStorage.removeItem(RTS_SKY_LS);
  } catch (e) {}
}
/* The title screen's button: AUTO -> DAY -> DUSK -> NIGHT -> RAIN -> FOG -> AUTO. */
function rtsSkyCycle() {
  var w = _rtsSkyWant();
  _rtsSkySetWant(RTS_SKY_KEYS[(RTS_SKY_KEYS.indexOf(w) + 1) % RTS_SKY_KEYS.length]);
  rtsSkySync();
}
function rtsSkySync() {
  var wrap = document.getElementById('rtsSky');
  if (!wrap) return;
  if (!wrap.firstChild) wrap.innerHTML = '<button type="button" onclick="rtsSkyCycle()"></button>';
  var w = _rtsSkyWant();
  wrap.firstChild.textContent = 'SKY: ' + w.toUpperCase();
  wrap.firstChild.title = w === 'auto' ? 'The time of day and the weather, picked by the map' : 'Every battle under this sky - tap to change';
}
/* AUTO: from the seed - mostly day, and every other sky about one battle in six or seven */
function _rtsSkyOfSeed(seed) {
  var h = _sprHash((seed | 0) % 9973, 17, 977);
  return h < 0.36 ? 'day' : h < 0.48 ? 'dusk' : h < 0.6 ? 'night' : h < 0.72 ? 'rain' : h < 0.82 ? 'fog' : h < 0.91 ? 'snow' : 'cycle';
}
/* The hour of a CYCLE battle, 0..24. */
function _rtsSkyHour(G) { return (RTS_DAY_START + ((G && G.t) || 0) / RTS_DAY_LEN * 24) % 24; }
/* Two skies mixed, k of the way from a to b. */
function _rtsSkyMix(a, b, k) {
  var o = {}, f;
  for (f in a) o[f] = a[f];
  for (f in b) if (!(f in o)) o[f] = 0;
  for (f in o) {
    var x = a[f] || 0, y = b[f] || 0;
    if (Array.isArray(x) || Array.isArray(y)) {
      x = x || []; y = y || [];
      o[f] = (x.length ? x : y).map(function (v, i) { return (x[i] || 0) + ((y[i] || 0) - (x[i] || 0)) * k; });
    } else o[f] = x + (y - x) * k;
  }
  return o;
}
/* The sky at an hour of the cycle. */
function _rtsSkyAt(h) {
  for (var i = 1; i < RTS_DAY_KEYS.length; i++) if (h <= RTS_DAY_KEYS[i][0]) {
    var a = RTS_DAY_KEYS[i - 1], b = RTS_DAY_KEYS[i], k = (h - a[0]) / Math.max(1e-6, b[0] - a[0]);
    return _rtsSkyMix(R3D_SKIES[a[1]], R3D_SKIES[b[1]], k * k * (3 - 2 * k));
  }
  return R3D_SKIES.night;
}
/* Where the sun is at an hour: the baker's sun turned round the map with the hours and raised
   and lowered with the day - high at noon, low at dawn and dusk; at night it is the moon, low. */
function _rtsSunAt(h) {
  var L = R3_LIGHT, hl = Math.hypot(L[0], L[2]), el0 = Math.atan2(L[1], hl);
  var az = (h - RTS_DAY_NOON) / 12 * Math.PI * 0.85;
  var up = Math.sin((h - 6) / 12 * Math.PI), up0 = Math.sin((RTS_DAY_NOON - 6) / 12 * Math.PI);
  var el = el0 * Math.max(0.35, Math.min(1.35, up / up0));
  var c = Math.cos(az), s = Math.sin(az), hx = (L[0] * c - L[2] * s) / hl, hz = (L[0] * s + L[2] * c) / hl;
  return [hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)];
}
/* The sky this frame, for both renderers: a named one as it is, the cycle at its hour. */
function _rtsSkyNow(G) {
  var n = window.RTS_SKY_FORCE || _rtsSkyName(G);
  var S = n === 'cycle' ? _rtsSkyAt(_rtsSkyHour(G)) : (R3D_SKIES[n] || R3D_SKIES.day);
  /* LIGHTNING, in the rain: for its instant the whole field is lit near to day - the strike's
     schedule is the thunder's (rts.ambience.js), on the game's clock */
  if (S.rain > 0 && typeof _rtsLightning === 'function' && window.RTS_FLASH_OFF !== true) {
    var k = _rtsLightning((G && G.t) || 0).k * S.rain;
    if (k > 0.01) { S = _rtsSkyMix(S, R3D_SKIES.day, k * 0.75); S.flash = k; }
  }
  return S;
}
/* The sky this battle is under: its name. */
function _rtsSkyName(G) {
  var w = _rtsSkyWant();
  return w !== 'auto' ? w : _rtsSkyOfSeed(G ? G.seed : 0);
}
/* ...and its settings, held on R3 for the frame. */
function _r3dSky(G) {
  var R3 = window._R3D, n = window.RTS_SKY_FORCE || _rtsSkyName(G);   /* RTS_SKY_FORCE: a spec's */
  var S = _rtsSkyNow(G);
  if (R3) {
    R3.sky = S; R3.skyName = n;
    /* the sun: the baker's, unless the day is passing - then where the hour puts it */
    if (n === 'cycle') { R3.sun = _rtsSunAt(_rtsSkyHour(G)); R3.sunB = _r3dSunBasis(R3.sun); }
    else { R3.sun = R3_LIGHT; R3.sunB = null; }
  }
  return S;
}

/* Onto program P - every program, from _r3dCamU. Unset, each of these reads as day. */
function _r3dSkyU(gl, P) {
  var R3 = window._R3D, S = (R3 && R3.sky) || R3D_SKIES.day;
  gl.uniform3f(gl.getUniformLocation(P, 'uDarkL'), 1 - S.L[0], 1 - S.L[1], 1 - S.L[2]);
  gl.uniform3f(gl.getUniformLocation(P, 'uDarkS'), 1 - S.S[0], 1 - S.S[1], 1 - S.S[2]);
  gl.uniform4f(gl.getUniformLocation(P, 'uHaze'), S.haze[0], S.haze[1], S.haze[2], S.haze[3]);
  gl.uniform2f(gl.getUniformLocation(P, 'uWet'), S.wet, (window._rtsG && window._rtsG.t) || 0);
  /* the ground takes the point lights only when the lamps are on: by day it was lit by an
     explosion's glare on the ground alone (fxemit3d.js), and still is */
  gl.uniform1f(gl.getUniformLocation(P, 'uGndL'), S.night > 0 ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(P, 'uSnow'), S.snow || 0);
  var sun = (R3 && R3.sun) || R3_LIGHT;
  gl.uniform3f(gl.getUniformLocation(P, 'uSunD'), sun[0] - R3_LIGHT[0], sun[1] - R3_LIGHT[1], sun[2] - R3_LIGHT[2]);
}

var R3D_LAMP_C = [1.0, 0.82, 0.55];        /* sodium-warm, a lamp post or a door light */
var R3D_HEAD_C = [0.95, 0.95, 0.85];       /* a headlight */

/* Every light the night has: [x, y, z, reach, strength, 0, r, g, b, priority], strongest first is the
   caller's business. Only what is near the view - the light is chosen per frame. */
function _r3dSkyLights(G, R3) {
  var S = R3.sky || R3D_SKIES.day, out = [];
  if (!(S.night > 0) || R3.lampAmt === 0) return out;
  var vb = _r3dBoundsNear(_r3dViewBounds(), 10, 20), n = S.night, i;
  function inV(x, z) { return x > vb.x0 && x < vb.x1 && z > vb.z0 && z < vb.z1; }
  /* [9] how much a light counts for its slot beyond its brightness: a headlight follows the action */
  function lamp(p, reach, s, c, pri) { if (inV(p[0], p[2])) out.push([p[0], p[1], p[2], reach, s * n, 0, c[0], c[1], c[2], pri || 1]); }
  (R3.dressLamps || []).forEach(function (p) { lamp(p, 9, 0.9, R3D_LAMP_C); });
  (R3.bridgeLamps || []).forEach(function (p) { lamp(p, 9, 0.9, R3D_LAMP_C); });
  var E = G.ents || [], A2W = RTS_TILE;
  for (i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.dead) continue;
    if (e.type === 'struct' && !e.building) {
      var d = rtsStructDef(e.def);
      if (!d || d.wall) continue;
      /* over the door: the front is +z, where the units come out */
      lamp([e.x, _rtsElev(e.x, e.z) + 2.4, e.z + d.h * A2W / 2 + 0.6], 6 + d.w * 2, 0.8, R3D_LAMP_C);
    } else if (e.type === 'unit' && !e.air && e.path) {
      var ud = rtsUnitDef(e.def);
      if (!ud || ud.kind !== 'vehicle' || ud.sea) continue;
      /* the pool the headlights throw, a few units ahead: a unit faces (cos rot, sin rot) */
      var hx = e.x + Math.cos(e.rot) * 4.5, hz = e.z + Math.sin(e.rot) * 4.5;
      lamp([hx, _rtsStandY(e.x, e.z) + 1.2, hz], 7.5, 0.7, R3D_HEAD_C, 3);
    }
  }
  return out;
}
