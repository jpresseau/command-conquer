/* RED ALERT - the world's own sound, under the guns. Synthesized like everything in rts.audio.js.

   The effects were the only sound there was: a shot, an explosion, a click - and between them
   silence, whatever the sky (render3d/sky3d.js) was doing. So a bed of sound now runs under the
   effects, every voice of it a few nodes built once and only ever turned up or down:

     RAIN      hiss, as heavy as the rain is
     WIND      a low gusting roar in snow and fog
     NIGHT     insects, at night and dusk, hushed by rain
     ENGINES   one engine note for everything on tracks or wheels that is moving in view - louder
               the more there are, higher the faster they go
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

/* The bed's nodes, built the first time there is an audio context to build them in. */
function _rtsAmbNodes() {
  var A = _rtsA;
  if (!A) return null;
  if (A.amb) return A.amb;
  var ctx = A.ctx, B = {};
  function loop(lo, hi) {
    var src = ctx.createBufferSource(); src.buffer = A.noise; src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = lo ? 'lowpass' : 'highpass'; f.frequency.value = lo || hi;
    var g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(B.bus);
    src.start();
    return { src: src, f: f, g: g };
  }
  B.bus = ctx.createGain(); B.bus.gain.value = 0.7; B.bus.connect(A.master);
  B.rain = loop(0, 1400);
  var rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 7000;
  B.rain.f.disconnect(); B.rain.f.connect(rl); rl.connect(B.rain.g);
  B.wind = loop(380);
  /* the gusts: a slow wobble on the wind's filter */
  var gust = ctx.createOscillator(), gd = ctx.createGain();
  gust.frequency.value = 0.13; gd.gain.value = 160; gust.connect(gd); gd.connect(B.wind.f.frequency); gust.start();
  /* the insects: a high tone, chirped by a fast square on its gain */
  var ins = ctx.createOscillator(), chirp = ctx.createOscillator(), cg = ctx.createGain(), ig = ctx.createGain();
  ins.type = 'triangle'; ins.frequency.value = 4300;
  chirp.type = 'square'; chirp.frequency.value = 11; cg.gain.value = 0.5;
  var ib = ctx.createGain(); ib.gain.value = 0.5;
  ins.connect(ib); chirp.connect(cg); cg.connect(ib.gain); ib.connect(ig); ig.gain.value = 0; ig.connect(B.bus);
  ins.start(); chirp.start();
  B.ins = { g: ig };
  /* the engines: a low saw and some rumble, through a low-pass */
  var eo = ctx.createOscillator(), ef = ctx.createBiquadFilter(), eg = ctx.createGain();
  eo.type = 'sawtooth'; eo.frequency.value = 40; ef.type = 'lowpass'; ef.frequency.value = 260; eg.gain.value = 0;
  eo.connect(ef); ef.connect(eg); eg.connect(B.bus); eo.start();
  B.eng = { o: eo, g: eg, f: ef };
  B.bridge = loop(110);
  /* DISTANCE: what the effects send here is heard through a wall of air */
  B.far = ctx.createGain(); B.far.gain.value = 0.32;
  var ff = ctx.createBiquadFilter(); ff.type = 'lowpass'; ff.frequency.value = 650;
  B.far.connect(ff); ff.connect(A.master);
  /* THE ECHO: the effects' bus into a delay that feeds itself, dark, and up only at night */
  var dl = ctx.createDelay(1.0), fb = ctx.createGain(), df = ctx.createBiquadFilter(), wet = ctx.createGain();
  dl.delayTime.value = 0.23; fb.gain.value = 0.32; df.type = 'lowpass'; df.frequency.value = 1500; wet.gain.value = 0;
  A.sfx.connect(dl); dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(wet); wet.connect(A.master);
  B.echo = { g: wet };
  B.t = 0; B.strike = -1;
  A.amb = B;
  return B;
}

/* What the bed should be playing now, from the game - pure, so it can be asked without a sound
   card: the gains and the engine's pitch. */
function _rtsAmbWant(G) {
  var S = typeof _rtsSkyNow === 'function' ? _rtsSkyNow(G) : null, w = {};
  var rain = S ? S.rain || 0 : 0, night = S ? S.night || 0 : 0;
  w.rain = 0.11 * rain;
  w.wind = 0.15 * Math.min(1, (S ? (S.snow || 0) + (S.banks || 0) : 0));
  w.ins = 0.035 * night * (1 - rain);
  w.echo = 0.28 * night + (S && S.banks ? 0.08 : 0);
  var moving = 0, speed = 0, decks = 0, E = (G && G.ents) || [];
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.dead || e.type !== 'unit' || e.air || !e.path) continue;
    var d = rtsUnitDef(e.def);
    if (!d || d.kind !== 'vehicle' || d.sea || !_rtsAudible(e.x, e.z)) continue;
    moving++; speed += d.speed || 8;
    if (typeof _rtsBridgeAt === 'function' && _rtsBridgeAt(e.x, e.z)) decks++;
  }
  w.moving = moving; w.decks = decks;
  w.eng = moving ? Math.min(0.16, 0.045 * Math.sqrt(moving)) : 0;
  w.engHz = moving ? 34 + (speed / moving) * 1.4 : 34;
  w.bridge = decks ? Math.min(0.22, 0.1 * Math.sqrt(decks)) : 0;
  return w;
}

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
    B.rain.g.gain.setTargetAtTime(w.rain, now, 0.4);
    B.wind.g.gain.setTargetAtTime(w.wind, now, 0.6);
    B.ins.g.gain.setTargetAtTime(w.ins, now, 0.8);
    B.echo.g.gain.setTargetAtTime(w.echo, now, 0.5);
    B.eng.g.gain.setTargetAtTime(w.eng, now, 0.25);
    B.eng.o.frequency.setTargetAtTime(w.engHz, now, 0.3);
    B.bridge.g.gain.setTargetAtTime(w.bridge, now, 0.25);
    B.last = w;
  }
  /* THUNDER: once per strike, asked every frame - a flash is over in a fraction of the knobs' beat */
  var S2 = _rtsSkyNow(G), s = S2 && S2.rain > 0 ? _rtsLightning(G.t || 0) : null;
  if (s && s.k > 0 && s.n !== B.strike) {
    B.strike = s.n;
    try { _rtsSfxPlay('thunder', A.ctx.currentTime); } catch (_e) {}   /* the helpers' envelopes start now */
  }
}
