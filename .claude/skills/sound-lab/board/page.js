/* the page: two chains, as the game had them before and has them now */
var DESC = {
  rifle: 'Infantry fire: a supersonic crack, the report, a slap back off the land.',
  mg: 'One round of a machine gun: lighter, higher, the bolt clacking.',
  cannon: 'A tank gun: blast, a deep push, a rolling tail, the breech opening.',
  turretgun: 'A gun on a wall: as heavy as a tank, tighter, a harder crack.',
  rocket: 'A rocket: the motor lighting, a rasp, the whoosh rising and falling away.',
  hit: 'A shell landing on ground: a thud, a spray of dirt, grit pattering down.',
  splash: 'A round landing in water: a whump, spray, bubbles. No crack.',
  pop: 'A vehicle going up: a crack, a deep blast, metal raining down, fire catching.',
  boom: 'A building coming down: two blasts, a long rumble, masonry falling.',
  select: 'Selecting a unit: a soft bright blip.',
  order: 'Giving an order: a radio acknowledging, squelch either side.',
  click: 'A button: a crisp plastic tick.',
  deny: 'Refused: two soft falling tones.',
  build: 'Production started: a latch and a servo winding up.',
  place: 'A building set down: a heavy thud, a steel frame ringing, dust.',
  ready: 'Construction complete: a rising chord on a bell.',
  unitready: 'Unit ready: two notes of the same bell.',
  alert: 'Base under attack: a klaxon, three falling pulses.',
  lowpower: 'Power failing: everything winding down.',
  thunder: 'A storm: the crack overhead, then the roll.'
};
var _rtsA = null, A = null, OLD = null, NEWOUT = null;
function _rtsPanAt(x) { return typeof x === 'number' ? x : 0; }
function boot() {
  if (A) { if (A.ctx.state === 'suspended') A.ctx.resume(); return A; }
  var ctx = new (window.AudioContext || window.webkitAudioContext)();
  var nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
  for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  /* NEW: effects bus -> master -> compressor -> soft clip, exactly as rts.audio.js builds it */
  var master = ctx.createGain(); master.gain.value = 0.9;
  var lid = ctx.createDynamicsCompressor();
  lid.threshold.value = -12; lid.knee.value = 8; lid.ratio.value = 4; lid.attack.value = 0.003; lid.release.value = 0.25;
  var out = ctx.createWaveShaper(), cn = 2048, cv = new Float32Array(cn);
  for (var ci = 0; ci < cn; ci++) { var cx = (ci / (cn - 1) * 2 - 1) * 4; cv[ci] = Math.abs(cx) < 0.5 ? cx : (cx < 0 ? -1 : 1) * (0.5 + 0.45 * Math.tanh((Math.abs(cx) - 0.5) / 0.45)); }
  out.curve = cv; out.oversample = '4x';
  var quarter = ctx.createGain(); quarter.gain.value = 0.25;
  master.connect(lid); lid.connect(quarter); quarter.connect(out); out.connect(ctx.destination);
  var sfx = ctx.createGain(); sfx.gain.value = 0.6; sfx.connect(master);
  A = { ctx: ctx, master: master, lid: lid, out: out, sfx: sfx, noise: nb, last: {} };
  _rtsMixInit(A); _rtsBankIdle(A);
  /* OLD: its effects bus at 0.85 -> master 0.9 -> speakers, no room, no lid */
  var om = ctx.createGain(); om.gain.value = 0.9; om.connect(ctx.destination);
  OLD = ctx.createGain(); OLD.gain.value = 0.85; OLD.connect(om);
  _rtsA = { ctx: ctx, noise: nb };
  status('Audio on. ' + (window.requestIdleCallback ? 'Rendering the rest of the takes in the background.' : ''));
  return A;
}
function status(t) { document.getElementById('status').textContent = t; }
function playNew(name, pan) {
  boot();
  var buf = _rtsBankPick(A, name);
  if (buf) _rtsVoice(A, name, buf, _rtsSfxRecipe(name).cat === 'ui' ? null : (pan || 0), 0);
}
function playOld(name) { boot(); try { _rtsSfxPlay(name, A.ctx.currentTime, OLD); } catch (e) {} }
function flash(name) {
  var el = document.getElementById('s-' + name);
  if (!el) return;
  el.classList.add('on'); setTimeout(function () { el.classList.remove('on'); }, 220);
}

/* the strips */
function draw(canvas, x) {
  var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 260, h = 44;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  var c = canvas.getContext('2d'), col = getComputedStyle(document.documentElement).getPropertyValue('--wave').trim() || '#e8b04a';
  c.scale(dpr, dpr); c.fillStyle = col;
  var per = Math.max(1, Math.floor(x.length / w));
  for (var i = 0; i < w; i++) {
    var lo = 0, hi = 0;
    for (var k = i * per; k < (i + 1) * per && k < x.length; k++) { if (x[k] < lo) lo = x[k]; if (x[k] > hi) hi = x[k]; }
    c.fillRect(i, h / 2 - hi * h / 2, 1, Math.max(1, (hi - lo) * h / 2));
  }
}
rtsSfxNames().forEach(function (n) {
  var R = _rtsSfxRecipe(n), host = document.getElementById('g-' + R.cat);
  var el = document.createElement('div'); el.className = 'strip'; el.id = 's-' + n;
  el.innerHTML = '<div class="top"><b>' + n + '</b><span class="meta">' + R.len.toFixed(1) + ' s · ' + R.takes + ' takes · ' + R.heard + ' dB(A)</span></div>' +
    '<p>' + (DESC[n] || '') + '</p><canvas aria-hidden="true"></canvas>' +
    '<div class="btns"><button class="new" id="n-' + n + '">New</button><button class="old" id="o-' + n + '">Old</button></div>';
  host.appendChild(el);
  el.querySelector('#n-' + n).onclick = function () { playNew(n, 0); flash(n); };
  el.querySelector('#o-' + n).onclick = function () { playOld(n); flash(n); };
  draw(el.querySelector('canvas'), _rtsSfxRender(n, 0, 16000));
});

/* a skirmish: rifles on the left trading with a machine gun on the right, tanks, a rocket,
   a vehicle and then a building going up - the same script for both sets of sounds */
var SKIRMISH = [
  [0.0, 'alert'], [1.4, 'select'], [1.7, 'order'],
  [2.2, 'rifle', -0.6], [2.35, 'rifle', -0.5], [2.5, 'mg', 0.55], [2.58, 'mg', 0.55], [2.66, 'mg', 0.55], [2.8, 'rifle', -0.65],
  [3.0, 'hit', -0.3], [3.2, 'cannon', 0.7], [3.55, 'hit', -0.45], [3.7, 'rifle', -0.6], [3.85, 'mg', 0.5], [3.93, 'mg', 0.5],
  [4.2, 'rocket', -0.2], [4.6, 'turretgun', 0.4], [4.9, 'hit', 0.25], [5.0, 'pop', 0.65], [5.4, 'splash', -0.75],
  [5.7, 'cannon', -0.4], [5.9, 'rifle', -0.6], [6.0, 'mg', 0.3], [6.08, 'mg', 0.3], [6.4, 'hit', 0.35],
  [6.8, 'boom', 0.5], [7.6, 'rifle', -0.55], [8.6, 'build'], [9.4, 'place', 0.1], [10.6, 'ready']
];
function skirmish(old) {
  boot();
  status(old ? 'Playing the skirmish with the old sounds.' : 'Playing the skirmish with the new sounds.');
  SKIRMISH.forEach(function (e) {
    setTimeout(function () { if (old) playOld(e[1]); else playNew(e[1], e[2]); flash(e[1]); }, e[0] * 1000);
  });
}
document.getElementById('skirmish').onclick = function () { skirmish(false); };
document.getElementById('skirmishOld').onclick = function () { skirmish(true); };

/* THE SCORE: the game's own sequencer, with the intensity set by hand instead of by the fighting */
var MUS = { song: 0, lv: 0, timer: 0, old: false };
function musBoot() {
  boot();
  if (!A.mus) { A.mus = A.ctx.createGain(); A.mus.gain.value = 0.28; A.mus.connect(A.master); }
  _rtsA = A;
  return A;
}
function musHeat() {
  /* keep the heat where the chosen intensity wants it; RTS_MUS_HOLD short so it comes down at once */
  RTS_MUS_HOLD = 0.1;
  A.heat = { v: [0, 2.5, 9][MUS.lv], t: A.ctx.currentTime };
}
function musStop() {
  if (MUS.timer) { clearInterval(MUS.timer); MUS.timer = 0; }
  if (A && A.music) { if (A.music.out) _rtsMusicEnd(A); else _rtsMusicStop(); }
}
function musNew() {
  musBoot(); musStop();
  A.musSong = MUS.song; musHeat();
  /* here every note of the song is rendered before it starts, since it may start straight into a
     battle; the game starts calm and renders the rest within a second */
  var song = RTS_SONGS[MUS.song], pre = { ctx: A.ctx, buf: (A.musBuf = A.musBuf || {}), built: 0 };
  _rtsScoreNeeds(song).forEach(function (e) { try { _rtsMusicRender(pre, song, e); } catch (_e) {} });
  _rtsMusicBegin(A);
  MUS.timer = setInterval(function () {
    musHeat();
    var M = A.music;
    if (!M || !M.out) return;
    var song = RTS_SONGS[M.song], at = _rtsScoreAt(song, Math.max(0, M.bar - 1));
    document.getElementById('musRead').textContent = song.name + ' · ' + song.bpm + ' bpm · bar ' + M.bars + ' · phrase ' + at.phrase + ' · ' + at.chord + ' · ' + ['calm', 'alert', 'battle'][M.level];
  }, 250);
}
function musOld() {
  musBoot(); musStop();
  _rtsMusicStart();
  document.getElementById('musRead').textContent = 'The old score: one bar of drums, bass and a stab, looping, the same at every intensity.';
}
function seg(id, labels, cur, set) {
  var host = document.getElementById(id);
  labels.forEach(function (l, i) {
    var b = document.createElement('button'); b.textContent = l; b.id = id + i; b.setAttribute('aria-pressed', i === cur ? 'true' : 'false');
    b.onclick = function () {
      host.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true'); set(i);
    };
    host.appendChild(b);
  });
}
seg('songSeg', RTS_SONGS.map(function (s) { return s.name; }), 0, function (i) { MUS.song = i; if (A && A.music && A.music.out) musNew(); });
seg('lvSeg', ['Calm', 'Alert', 'Battle'], 0, function (i) { MUS.lv = i; if (A && A.music && A.music.out) musHeat(); });
document.getElementById('musNew').onclick = musNew;
document.getElementById('musOld').onclick = musOld;
document.getElementById('musStop').onclick = function () { if (A) musStop(); document.getElementById('musRead').textContent = 'Stopped.'; };

/* THE WORLD: each loop on its own, on a looping source, toggled */
var LOOPDESC = { rain: 'Rain: a hiss with drops in it, each side its own.', wind: 'Wind: a gusting roar with a whistle that comes and goes.',
  sand: 'A sandstorm\'s gritty hiss, over the wind.', crickets: 'Night: three crickets across the field, one further off.',
  birds: 'Day: the odd bird call, sparse.', tracks: 'A tank moving: the engine and its treads clattering.',
  wheels: 'A truck moving: its engine and the road.', rotor: 'A helicopter: the blades and the turbine.',
  jet: 'A jet: the roar and the whine in it.', boat: 'A boat under way: the diesel and the wash.',
  bridge: 'Traffic on a bridge: the deck rumbling.', hum: 'A power plant: the mains hum and buzz.',
  build: 'A building going up: a hammer on steel, a weld.' };
var LOOPON = {};
Object.keys(RTS_LOOPS).forEach(function (k) {
  var L = RTS_LOOPS[k], host = document.getElementById('g-loops'), el = document.createElement('div');
  el.className = 'strip'; el.id = 'l-' + k;
  el.innerHTML = '<div class="top"><b>' + k + '</b><span class="meta">' + L.sec + ' s loop' + (L.stereo ? ' · stereo' : '') + '</span></div>' +
    '<p>' + (LOOPDESC[k] || '') + '</p><div class="btns"><button class="new" id="lp-' + k + '">Play</button></div>';
  host.appendChild(el);
  el.querySelector('#lp-' + k).onclick = function () {
    boot();
    var btn = this;
    if (LOOPON[k]) { try { LOOPON[k].src.stop(); } catch (e) {} LOOPON[k] = null; btn.textContent = 'Play'; el.classList.remove('on'); return; }
    var sr = A.ctx.sampleRate / (L.div || 1), x = _rtsLoopRender(k, sr), two = !(x instanceof Float32Array);
    var buf = A.ctx.createBuffer(two ? 2 : 1, two ? x[0].length : x.length, sr);
    buf.getChannelData(0).set(two ? x[0] : x); if (two) buf.getChannelData(1).set(x[1]);
    var src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0.35; src.connect(g); g.connect(A.master); src.start();
    LOOPON[k] = { src: src }; btn.textContent = 'Stop'; el.classList.add('on');
  };
});
