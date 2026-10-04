/* BREACHWATER - the world's own sound, under the guns. Synthesized like everything in rts.audio.js:
   every voice of it a rendered loop (audio/loops.js).

   The effects were the only sound there was: a shot, an explosion, a click - and between them
   silence, whatever the sky (render3d/sky3d.js) was doing. So a bed of sound now runs under the
   effects, every voice of it a loop started once and only ever turned up or down:

     RAIN      hiss and drops, as heavy as the rain is
     WIND      a low gusting roar in snow and fog, a howl in a sandstorm and the sand's own hiss
     NIGHT     crickets, at night and dusk, hushed by rain; BY DAY the odd bird, in clear weather
     ENGINES   what is moving in view, by what it moves on: tracks clattering, a truck's engine and
               road, a helicopter's blades, a jet's roar, a boat's diesel - each louder the more
               there are, and running faster the faster they go
     THE BASE  the hum of the power plants in view, and the clanks and welding of a building
               going up
     BRIDGES   the deep rumble of a deck with traffic on it
     THUNDER   in rain, now and then: a crack and a long roll - with the lightning that comes
               first, which the renderers draw (_rtsLightning, read by sky3d.js and sky2d.js)
     DISTANCE  a fight just off the screen is heard, muffled, rather than not at all - the
               effects that used to stop at the edge of the view carry twice as far, through a
               low-pass (rts.audio.js routes them) - and at night it all echoes

   Turned up and down a few times a second (_rtsAmbTick), always by setTargetAtTime, so nothing
   clicks. The thunder and the lightning follow the GAME's clock and a fixed schedule rather
   than a random draw, so the flash in a picture is the same on every run. */

var RTS_AMB_EVERY = 0.2;         /* seconds between turns of the knobs */
var RTS_FAR = 2.2;               /* how many views away a fight is still heard, muffled */
var RTS_THUNDER_GAP = 26;        /* seconds between strikes, at the least... */
var RTS_THUNDER_SPREAD = 28;     /* ...and up to this much more */
var RTS_THUNDER_FIRST = 20;      /* the first never comes before this */

/* THE LIGHTNING's schedule, for the renderers and the thunder alike: how bright the flash is at
   game time t, and which strike it is. Two quick flickers and a fade, a strike every half minute
   or so. */
function _rtsLightning(t) {
  var T = RTS_THUNDER_FIRST, n = 0;
  while (T + RTS_THUNDER_GAP < t) { T += RTS_THUNDER_GAP + RTS_THUNDER_SPREAD * _sprHash(n, 7, 911); n++; }
  var d = t - T;
  if (d < 0 || d > 0.6) return { k: 0, n: n };
  var k = Math.exp(-d * 9) * (d < 0.06 || (d > 0.11 && d < 0.18) ? 1 : 0.35);
  return { k: k, n: n };
}

/* The bed: a bus, a gain for every loop (silent until it is rendered and started), the far bus
   and the echo. Built the first time there is an audio context to build it in. */
function _rtsAmbNodes() {
  var A = _rtsA;
  if (!A) return null;
  if (A.amb) return A.amb;
  var ctx = A.ctx, B = { v: {}, q: Object.keys(RTS_LOOPS) };
  B.bus = ctx.createGain(); B.bus.gain.value = RTS_BUS_BASE.amb * _rtsVol('amb'); B.bus.connect(A.master);
  Object.keys(RTS_LOOPS).forEach(function (k) {
    var g = ctx.createGain(); g.gain.value = 0; g.connect(B.bus);
    B.v[k] = { g: g, src: null };
  });
  /* DISTANCE: what the effects send here is heard through a wall of air */
  B.far = ctx.createGain(); B.far.gain.value = 0.32;
  var ff = ctx.createBiquadFilter(); ff.type = 'lowpass'; ff.frequency.value = 650;
  B.far.connect(ff); ff.connect(A.master);
  /* THE ECHO: the effects' bus into a delay that feeds itself, dark, and up only at night - the
     slap of a shot coming back off the far hills, a third of a second late and long enough to
     stand clear of the room every effect already plays into (audio/mix.js) */
  var dl = ctx.createDelay(1.0), fb = ctx.createGain(), df = ctx.createBiquadFilter(), wet = ctx.createGain();
  dl.delayTime.value = 0.34; fb.gain.value = 0.45; df.type = 'lowpass'; df.frequency.value = 1400; wet.gain.value = 0;
  A.sfx.connect(dl); dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(wet); wet.connect(A.master);
  B.echo = { g: wet };
  B.t = 0; B.strike = -1;
  A.amb = B;
  /* the loops, rendered a slice at a time while the page is idle */
  var later = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 600 }); } : function (f) { setTimeout(f, 50); };
  (function slice() { if (_rtsAmbLoad(A, B, 4) > 0) later(slice); })();
  return B;
}

/* THE LOOPS, rendered out of spare time (audio/loops.js) - at least one a call, for up to `ms` -
   and started as they come */
function _rtsAmbLoad(A, B, ms) {
  var t0 = Date.now();
  while (B.q.length && Date.now() - t0 < ms) {
    var k = B.q.shift(), L = RTS_LOOPS[k], sr = A.ctx.sampleRate / (L.div || 1), x = null;
    try { x = _rtsLoopRender(k, sr); } catch (_e) { x = null; }
    if (!x) continue;
    var two = !(x instanceof Float32Array), buf = A.ctx.createBuffer(two ? 2 : 1, two ? x[0].length : x.length, sr);
    buf.getChannelData(0).set(two ? x[0] : x);
    if (two) buf.getChannelData(1).set(x[1]);
    var src = A.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(B.v[k].g);
    src.start(A.ctx.currentTime + 0.02, Math.random() * L.sec);      /* each from somewhere in it */
    B.v[k].src = src;
  }
  return B.q.length;
}

/* vehicles on tracks, not wheels: the hulls that crush infantry (rules/vehicles.js), the APC and
   the MCV - UDATA.CPP's tracked set */
function _rtsAmbTracked(def) { return !!(RTS_CRUSHERS[def] || def === 'apc' || def === 'mcv' || (rtsUnitDef(def) || {}).tracked); }
/* a rotor is a helicopter, whichever one: read off the model's own parts (sprites/unit-airsea.js),
   so the Chinook beats the air like the Attack Heli instead of roaring like a MiG */
function _rtsAmbRotor(def) {
  if (typeof RTS_AIR_PARTS !== 'undefined') return !!(RTS_AIR_PARTS[def] && RTS_AIR_PARTS[def].rotor);
  return def === 'heli';
}

/* What the bed should be playing now, from the game - pure, so it can be asked without a sound
   card: the gains, and how fast the engines run. The gains are for the rendered loops, which sit
   about a third of the level the old raw noise did, hence the rain's 0.32 where it was 0.11. */
function _rtsAmbWant(G) {
  var S = typeof _rtsSkyNow === 'function' ? _rtsSkyNow(G) : null, w = {};
  var rain = S ? S.rain || 0 : 0, night = S ? S.night || 0 : 0, snow = S ? S.snow || 0 : 0, sand = S ? S.sand || 0 : 0;
  w.rain = 0.32 * rain;
  w.wind = Math.min(0.26, 0.15 * Math.min(1, snow + (S ? S.banks || 0 : 0)) + 0.24 * sand);
  w.sand = 0.1 * sand;
  w.ins = 0.16 * night * (1 - rain);
  w.birds = 0.05 * (1 - night) * (1 - rain) * (1 - Math.min(1, snow + sand));
  w.echo = 0.42 * night + (S && S.banks ? 0.08 : 0);
  var n = { tracks: 0, wheels: 0, rotor: 0, jet: 0, boat: 0 }, sp = { tracks: 0, wheels: 0 };
  var moving = 0, speed = 0, decks = 0, power = 0, build = 0, E = (G && G.ents) || [];
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.dead) continue;
    if (e.type === 'struct') {
      if (!_rtsAudible(e.x, e.z)) continue;
      if (e.building) build++;
      else { var sd = rtsStructDef(e.def); if (sd && sd.power > 0) power++; }
      continue;
    }
    if (e.type !== 'unit') continue;
    var d = rtsUnitDef(e.def);
    if (!d || !_rtsAudible(e.x, e.z)) continue;
    if (d.kind === 'air') { if ((e.alt || 0) > 1) n[_rtsAmbRotor(e.def) ? 'rotor' : 'jet']++; continue; }
    if (!e.path) continue;
    if (d.kind === 'ship' || d.sea) { n.boat++; continue; }
    if (d.kind !== 'vehicle') continue;
    var k = _rtsAmbTracked(e.def) ? 'tracks' : 'wheels';
    n[k]++; sp[k] += d.speed || 8;
    moving++; speed += d.speed || 8;
    if (typeof _rtsBridgeAt === 'function' && _rtsBridgeAt(e.x, e.z)) decks++;
  }
  w.moving = moving; w.decks = decks; w.n = n;
  /* a crowd is louder than one, but not by its number: the square root of it */
  function crowd(c, per, cap) { return c ? Math.min(cap, per * Math.sqrt(c)) : 0; }
  w.tracks = crowd(n.tracks, 0.05, 0.16); w.wheels = crowd(n.wheels, 0.045, 0.14);
  w.rotor = crowd(n.rotor, 0.06, 0.16); w.jet = crowd(n.jet, 0.05, 0.14); w.boat = crowd(n.boat, 0.05, 0.14);
  w.eng = crowd(moving, 0.045, 0.16);
  w.engHz = moving ? 34 + (speed / moving) * 1.4 : 34;
  /* the engines run faster with a faster crowd: a tank's own loop at the tank's own speed */
  w.tracksRate = n.tracks ? 0.75 + sp.tracks / n.tracks / 30 : 1;
  w.wheelsRate = n.wheels ? 0.75 + sp.wheels / n.wheels / 30 : 1;
  w.bridge = decks ? Math.min(0.22, 0.1 * Math.sqrt(decks)) : 0;
  w.hum = crowd(power, 0.02, 0.05);
  w.build = build ? 0.07 : 0;
  return w;
}

/* which loop each of the wants turns */
var RTS_AMB_OF = { rain: 'rain', wind: 'wind', sand: 'sand', ins: 'crickets', birds: 'birds', tracks: 'tracks',
  wheels: 'wheels', rotor: 'rotor', jet: 'jet', boat: 'boat', bridge: 'bridge', hum: 'hum', build: 'build' };

/* A few times a second, from the main loop (ui/camera.js). */
function _rtsAmbTick(dt) {
  var A = _rtsA, G = window._rtsG;
  if (!A || A.muted || !G) return;
  var B = _rtsAmbNodes();
  if (!B) return;
  B.t -= dt;
  var w = null;
  if (B.t <= 0) {
    B.t = RTS_AMB_EVERY;
    w = _rtsAmbWant(G);
    var now = A.ctx.currentTime;
    Object.keys(RTS_AMB_OF).forEach(function (k) { B.v[RTS_AMB_OF[k]].g.gain.setTargetAtTime(w[k], now, k === 'rain' || k === 'wind' ? 0.5 : 0.3); });
    if (B.v.tracks.src) B.v.tracks.src.playbackRate.setTargetAtTime(w.tracksRate, now, 0.4);
    if (B.v.wheels.src) B.v.wheels.src.playbackRate.setTargetAtTime(w.wheelsRate, now, 0.4);
    B.echo.g.gain.setTargetAtTime(w.echo, now, 0.5);
    B.last = w;
  }
  /* THUNDER: once per strike, asked every frame - a flash is over in a fraction of the knobs' beat */
  var S2 = _rtsSkyNow(G), s = S2 && S2.rain > 0 ? _rtsLightning(G.t || 0) : null;
  if (s && s.k > 0 && s.n !== B.strike) {
    B.strike = s.n;
    try { _rtsSfxPlay('thunder', A.ctx.currentTime); } catch (_e) {}   /* the helpers' envelopes start now */
  }
}
