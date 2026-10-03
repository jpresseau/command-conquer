/* THE WORLD'S SOUND as loops (audio/loops.js) and what the bed turns up (rts.ambience.js), asked
   without a sound card. unit/ambience holds the weather, the thunder and the distance; this is
   what the rendered loops replaced the old nodes with:

     THE LOOPS     every one renders, finite, at its level; a stereo one has two different sides;
                   the end runs into the start in a step like any other inside it; every loop
                   is turned by something and nothing turns a loop that is not there
     WHAT THEY ARE rain is a hiss and drops above 1 kHz, wind a roar below one, crickets sing in
                   one narrow band, the power plant hums at 60 Hz
     WHAT MOVES    a tank on the move is tracks, a buggy wheels; a helicopter in the air is its
                   rotor, moving or not, and on the pad nothing; a MiG in the air a jet; a gunboat
                   under way a boat; the faster crowd runs its loop faster
     THE BASE      a power plant in earshot hums; a building going up is heard going up
     BY DAY        the odd bird in clear weather, none at night or in the rain, and the sand's own
                   hiss only in a sandstorm */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');
var A = require('../lib/sound.js');

var S = new Suite('worldsound');
var g = load(['src/rules', 'src/core', 'src/map', 'src/r3d', 'src/sprites/bake.js', 'src/render3d/sky3d.js', 'src/audio', 'src/rts.audio.js', 'src/rts.ambience.js']);
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG, SR = 48000;

/* ---- THE LOOPS ---- */
var bad = [], wide = [], seams = [], lz = {};
Object.keys(g.RTS_LOOPS).forEach(function (k) {
  var L = g.RTS_LOOPS[k], sr = SR / (L.div || 1), x = g._rtsLoopRender(k, sr), ch = L.stereo ? x : [x];
  lz[k] = { x: ch[0], sr: sr };
  ch.forEach(function (y) {
    /* the seam against the loop's own typical step from one sample to the next (its RMS): a
       low, smooth loop cut anywhere jumps many of those */
    var nan = 0, i, ss = 0;
    for (i = 0; i < y.length; i++) if (!isFinite(y[i])) nan++;
    for (i = 1; i < y.length; i++) ss += (y[i] - y[i - 1]) * (y[i] - y[i - 1]);
    var step = Math.sqrt(ss / (y.length - 1)), jump = Math.abs(y[0] - y[y.length - 1]);
    if (nan || Math.abs(A.peak(y) - 0.8) > 1e-3 || Math.abs(y.length / sr - L.sec) > 1e-3) bad.push(k);
    if (jump > 4 * step) seams.push(k + ' ' + (jump / step).toFixed(1) + ' steps');
  });
  if (L.stereo && Math.abs(A.corr(x[0], x[1])) > 0.5) wide.push(k + ' ' + A.corr(x[0], x[1]).toFixed(2));
});
S.ok('every loop renders, finite, at its level and its length', !bad.length, bad.join(', ') || Object.keys(g.RTS_LOOPS).length + ' loops');
S.ok('...a stereo one with two different sides', !wide.length, wide.join(', ') || 'all wide');
S.ok('...and its end runs into its start in a step like any other inside it', !seams.length, seams.join('; ') || 'no seams');
var turned = {};
Object.keys(g.RTS_AMB_OF).forEach(function (k) { turned[g.RTS_AMB_OF[k]] = 1; });
var unturned = Object.keys(g.RTS_LOOPS).filter(function (k) { return !turned[k]; }), ghost = Object.keys(turned).filter(function (k) { return !g.RTS_LOOPS[k]; });
S.ok('every loop is turned by something, and nothing turns a loop that is not there', !unturned.length && !ghost.length, unturned.concat(ghost).join(', ') || 'matched');
var mb = Object.keys(g.RTS_LOOPS).reduce(function (s, k) { var L = g.RTS_LOOPS[k]; return s + L.sec * SR / (L.div || 1) * 4 * (L.stereo ? 2 : 1); }, 0) / 1e6;
S.ok('...all of them in under 7 MB', mb < 7, mb.toFixed(2) + ' MB');

/* ---- WHAT THEY ARE ---- */
function share(k, lo, hi) { return A.bands(lz[k].x, lz[k].sr, [0, lo, hi, lz[k].sr / 2], true)[1]; }
var rainHi = share('rain', 1000, 12000), windLo = share('wind', 20, 1000), cr = share('crickets', 4000, 5600);
S.ok('rain is a hiss and drops, above 1 kHz as heard', rainHi > 0.8, Math.round(rainHi * 100) + '%');
S.ok('wind is a roar, below 1 kHz', windLo > 0.8, Math.round(windLo * 100) + '%');
S.ok('crickets sing in one narrow band', cr > 0.9, Math.round(cr * 100) + '% between 4 and 5.6 kHz');
var hs = A.spectrum(lz.hum.x, lz.hum.sr, 8192), pk = 1;
for (var i = 1; i < hs.pw.length; i++) if (hs.pw[i] > hs.pw[pk]) pk = i;
S.ok('the power plant hums at 60 Hz', Math.abs(pk * hs.hz - 60) < 2, (pk * hs.hz).toFixed(1) + ' Hz');

/* ---- WHAT MOVES ---- */
var heard = true;
g._rtsAudible = function () { return heard; };
G.ents.forEach(function (e) { if (e.type === 'unit') e.path = null; });
function want(sky) { g.window.RTS_SKY_FORCE = sky || 'day'; return g._rtsAmbWant(G); }
function spawn(def, k, setup) {
  var out = [];
  for (var j = 0; j < k; j++) { var u = g._rtsSpawnUnit('player', def, 40 + j * 4, 40); u.path = [{ x: 0, z: 0 }]; if (setup) setup(u); out.push(u); }
  return out;
}
function gone(l) { l.forEach(function (u) { u.dead = true; }); }
var t = spawn('tank', 2), wt = want(); gone(t);
var b = spawn('buggy', 2), wb = want(); gone(b);
S.ok('a tank on the move is its tracks, a buggy its wheels', wt.tracks > 0 && wt.wheels === 0 && wb.wheels > 0 && wb.tracks === 0,
     'tank ' + JSON.stringify(wt.n) + ', buggy ' + JSON.stringify(wb.n));
var hAir = spawn('heli', 1, function (u) { u.path = null; u.alt = 12; }), wh = want(); gone(hAir);
var hPad = spawn('heli', 1, function (u) { u.alt = 0; }), wp = want(); gone(hPad);
var m = spawn('mig', 1, function (u) { u.alt = 16; }), wm = want(); gone(m);
S.ok('a helicopter in the air is its rotor, moving or not; on the pad, nothing', wh.rotor > 0 && wp.rotor === 0, wh.rotor + ' / ' + wp.rotor);
S.ok('a MiG in the air is a jet', wm.jet > 0 && wm.rotor === 0, String(wm.jet));
var gb = spawn('gunboat', 1), wg = want(); gone(gb);
S.ok('a gunboat under way is a boat', wg.boat > 0 && wg.tracks === 0 && wg.wheels === 0, String(wg.boat));
var hv = spawn('heavy', 3), wHeavy = want(); gone(hv);
var lt = spawn('light', 3), wLight = want(); gone(lt);
S.ok('...and the faster crowd runs its loop faster', wLight.tracksRate > wHeavy.tracksRate, wLight.tracksRate.toFixed(2) + ' against ' + wHeavy.tracksRate.toFixed(2));
heard = false;
var far = spawn('tank', 3), wf = want(); gone(far);
heard = true;
S.ok('nothing out of earshot is heard', wf.tracks === 0 && wf.hum === 0, JSON.stringify(wf.n));

/* ---- THE BASE ---- */
var plants = G.ents.filter(function (e) { return !e.dead && e.type === 'struct' && (g.rtsStructDef(e.def) || {}).power > 0; });
var stash = plants.map(function (e) { e.dead = true; return e; }), w0 = want();
stash.forEach(function (e) { e.dead = false; });
var pw = g._rtsSpawnStruct ? null : null, yd = g._rtsHas('player', 'yard');
var p1 = { type: 'struct', def: 'power', side: 'player', x: yd.x + 6, z: yd.z, hp: 100, maxHp: 100 };
G.ents.push(p1);
var w1 = want();
p1.building = true;
var w2 = want();
p1.dead = true;
S.ok('a power plant in earshot hums, and none hums nothing', w0.hum === 0 && w1.hum > 0, w0.hum + ' -> ' + w1.hum);
S.ok('a building going up is heard going up', w2.build > 0 && w1.build === 0, String(w2.build));

/* ---- BY DAY ---- */
var d = want('day'), n = want('night'), r = want('rain'), sd = want('sand');
S.ok('the odd bird in clear weather, none at night or in the rain', d.birds > 0 && n.birds === 0 && r.birds === 0, d.birds + ' / ' + n.birds + ' / ' + r.birds);
S.ok('the sand\'s own hiss only in a sandstorm', sd.sand > 0 && d.sand === 0 && r.sand === 0, String(sd.sand));

require('../lib/report.js')(S);
