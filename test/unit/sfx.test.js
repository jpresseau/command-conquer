/* THE EFFECTS, rendered and measured without a sound card (audio/dsp.js, audio/recipes*.js,
   audio/bank.js). Nobody here can listen, so every claim is a number about the samples:

     THE TOOLS     a low-pass passes the lows and stops the highs, a high-pass the reverse; a
                   struck mode rings at the pitch it was given; a glide ends where it was sent;
                   a filtered noise is brought back to a fixed level whatever the filter took;
                   the same seed is the same sound; the room is wide and dies away
     EVERY TAKE    of every effect: finite, at its peak and no higher, centred on zero, at rest
                   by its last 10 ms
     ALIKE, NOT    a battle effect's takes differ from each other, but are as loud as each other
     AS LOUD AS    each effect is as loud as it says (`heard`, A-weighted) once its `vol` is
     MEANT         applied - so a recipe retuned without its gain fails here
     WHAT IT IS    a rifle is a crack (most of what is heard over 1 kHz), a cannon heavier than a
                   rifle, an explosion heavier than an impact; the battle is noise and the
                   interface is tone - the square-wave blips are gone
     THE BANK      queues every effect's first take before any second */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');
var A = require('../lib/sound.js');

var S = new Suite('sfx');
var g = load(['src/audio']);
var SR = 44100;

/* ---- THE TOOLS ---- */
var rng = g._dspRng(5), w = g._dspNoise(SR, rng, 'white');
var lo = g._dspFilter(Float32Array.from(w), SR, 'lp', 500, 500, 0.707), hi = g._dspFilter(Float32Array.from(w), SR, 'hp', 4000, 4000, 0.707);
var loB = A.bands(lo, SR, [0, 1000, 3000, 22050]), hiB = A.bands(hi, SR, [0, 1000, 3000, 22050]);
S.ok('a low-pass at 500 Hz keeps the lows and stops the highs', loB[0] > 0.9 && loB[2] < 0.01, loB.map(function (v) { return v.toFixed(3); }).join(' / '));
S.ok('...a high-pass at 4 kHz the reverse', hiB[2] > 0.85 && hiB[0] < 0.01, hiB.map(function (v) { return v.toFixed(3); }).join(' / '));
var md = g._dspModal(SR, SR, [{ f: 1234, t60: 0.5, a: 1 }]), sp = A.spectrum(md, SR, 8192), pk = 0;
for (var i = 1; i < sp.pw.length; i++) if (sp.pw[i] > sp.pw[pk]) pk = i;
S.ok('a struck mode rings at the pitch it was given', Math.abs(pk * sp.hz - 1234) < 8, (pk * sp.hz).toFixed(0) + ' Hz for 1234');
S.ok('...and dies away', A.rms(md, SR * 0.9) < A.rms(md, 0, SR * 0.1) * 0.02, '');
var gl = g._dspTone(SR, SR, 'sine', 400, 100), zc = 0;
for (i = SR * 0.9; i < SR; i++) if (gl[i - 1] < 0 && gl[i] >= 0) zc++;
S.ok('a glide from 400 Hz ends at the 100 it was sent to', Math.abs(zc / 0.1 - 103) < 8, zc * 10 + ' Hz over its last tenth');
var narrow = g._dspLevel(g._dspFilter(g._dspNoise(SR, g._dspRng(9), 'white'), SR, 'bp', 2000, 2000, 6));
S.ok('a noise through a narrow band is brought back to the layer level', Math.abs(A.rms(narrow) - g.RTS_DSP_LEVEL) < 0.01, A.rms(narrow).toFixed(3) + ' rms');
S.ok('the same seed is the same sound', A.corr(g._rtsSfxRender('rifle', 2, SR), g._rtsSfxRender('rifle', 2, SR)) > 0.999999);
var room = g._dspRoom(SR, 1.6, 11);
S.ok('the room is wide: its two sides are different noise', Math.abs(A.corr(room[0], room[1])) < 0.2, A.corr(room[0], room[1]).toFixed(3));
S.ok('...and dies away over its length', A.rms(room[0], room[0].length - SR * 0.1) < A.rms(room[0], 0, SR * 0.2) * 0.05,
     (A.rms(room[0], room[0].length - SR * 0.1) / A.rms(room[0], 0, SR * 0.2) * 100).toFixed(1) + '% of its start');

/* ---- EVERY TAKE ---- */
var names = g.rtsSfxNames(), takes = {}, bad = [], gaps = [];
S.ok('there is a recipe for every effect the game plays, and more than a handful', names.length >= 20, names.join(', '));
names.forEach(function (n) {
  var R = g._rtsSfxRecipe(n);
  takes[n] = [];
  for (var t = 0; t < R.takes; t++) {
    var x = g._rtsSfxRender(n, t, SR), nan = 0, mean = 0;
    takes[n].push(x);
    for (var k = 0; k < x.length; k++) { if (!isFinite(x[k])) nan++; mean += x[k]; }
    mean /= x.length;
    var p = A.peak(x), tail = A.rms(x, x.length - SR * 0.01);
    if (nan || p > R.peak + 1e-6 || p < R.peak * 0.99 || Math.abs(mean) > 0.002 || tail > 0.003 || Math.abs(x.length / SR - R.len) > 0.01)
      bad.push(n + '#' + t + ' (peak ' + p.toFixed(3) + ', mean ' + mean.toFixed(4) + ', tail ' + tail.toFixed(4) + (nan ? ', ' + nan + ' not finite' : '') + ')');
  }
});
S.ok('every take of every effect is finite, at its peak, centred, its length, and at rest at the end', !bad.length, bad.join('; ') || 'all takes clean');

/* ---- ALIKE, NOT ---- */
/* heard level: dB of the loudest 400 ms, A-weighted */
function heard(x) {
  var W = Math.round(0.4 * SR), best = -1, at = 0;
  for (var s = 0; s + W <= Math.max(W, x.length); s += Math.round(SR * 0.05)) { var r = A.rms(x, s, s + W); if (r > best) { best = r; at = s; } }
  var seg = x.slice(at, at + W), sp2 = A.spectrum(seg, SR), pw = 0, pa = 0;
  for (var k = 1; k < sp2.pw.length; k++) { pw += sp2.pw[k]; pa += sp2.pw[k] * A.aWeight(k * sp2.hz); }
  return 20 * Math.log10(A.rms(seg) * Math.sqrt(pa / pw) + 1e-9);
}
var same = [], spread = [];
names.forEach(function (n) {
  var R = g._rtsSfxRecipe(n), T = takes[n];
  if (R.cat !== 'ui' && R.takes > 1) {
    var c = A.corr(T[0], T[1]);
    if (c > 0.8) same.push(n + ' ' + c.toFixed(2));
  }
  var lv = T.map(heard), d = Math.max.apply(null, lv) - Math.min.apply(null, lv);
  if (d > 4) spread.push(n + ' ' + d.toFixed(1) + ' dB');
});
S.ok('a battle effect\'s takes are different sounds', !same.length, same.join(', ') || 'no two takes alike');
/* to 4 dB: a take is varied in every decay as well as every pitch, and a short sound's level moves
   with its decay - a dB or two either way is a squad, more than that is one shot that stands out */
S.ok('...but every take of an effect is as loud as the others, to 4 dB', !spread.length, spread.join(', ') || 'all within 4 dB');

/* ---- AS LOUD AS MEANT ---- */
var off = [], table = [];
names.forEach(function (n) {
  var R = g._rtsSfxRecipe(n), lv = heard(takes[n][0]) + 20 * Math.log10(R.vol || 1);
  table.push(n + ' ' + lv.toFixed(1));
  if (Math.abs(lv - R.heard) > 2) off.push(n + ' is ' + lv.toFixed(1) + ' dB(A), meant ' + R.heard);
});
S.ok('every effect plays as loud as it is meant to, within 2 dB', !off.length, off.join('; ') || 'all on target');
S.note('heard, dB(A): ' + table.join(', '));
var lvl = function (n) { var R = g._rtsSfxRecipe(n); return R.heard; };
S.ok('...a building\'s collapse the loudest thing in the game, a click the quietest',
     names.every(function (n) { return lvl('boom') >= lvl(n) && lvl('click') <= lvl(n); }));

/* ---- WHAT IT IS ---- */
function share(n, lo2, hi2) { var b = A.bands(takes[n][0], SR, [0, lo2, hi2, 22050], true); return b[1]; }
var crack = ['rifle', 'mg'].map(function (n) { return [n, share(n, 1000, 8000)]; });
S.ok('a rifle and a machine gun are cracks: most of what is heard of them is over 1 kHz', crack.every(function (c) { return c[1] > 0.5; }),
     crack.map(function (c) { return c[0] + ' ' + Math.round(c[1] * 100) + '%'; }).join(', '));
var cen = {};
['rifle', 'mg', 'cannon', 'turretgun', 'hit', 'pop', 'boom'].forEach(function (n) { cen[n] = A.centroid(takes[n][0], SR, true); });
S.ok('a cannon is heavier than a rifle, and a building coming down heavier than a shell landing',
     cen.cannon < cen.rifle && cen.turretgun < cen.mg && cen.boom < cen.hit && cen.boom < cen.pop,
     Object.keys(cen).map(function (n) { return n + ' ' + Math.round(cen[n]); }).join(', ') + ' Hz, as heard');
var flat = function (cat) {
  var v = names.filter(function (n) { return g._rtsSfxRecipe(n).cat === cat; }).map(function (n) { return A.flatness(takes[n][0], SR); });
  return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
};
S.ok('the battle is noise and the interface is tone', flat('gun') > flat('ui') * 4 && flat('boom') > flat('ui') * 4,
     'flatness: guns ' + flat('gun').toFixed(3) + ', explosions ' + flat('boom').toFixed(3) + ', interface ' + flat('ui').toFixed(4));
/* the old blips were square waves: odd harmonics at a third, a fifth... of the fundamental's level */
var sel = A.spectrum(takes.select[0], SR, 8192), f0 = Math.round(1480 / sel.hz), h3 = Math.round(1480 * 3 / sel.hz);
var r3 = Math.max(sel.pw[h3 - 1], sel.pw[h3], sel.pw[h3 + 1]) / Math.max(sel.pw[f0 - 1], sel.pw[f0], sel.pw[f0 + 1]);
S.ok('the selection blip is not a square wave: no third harmonic to speak of', r3 < 0.01, 'third harmonic at ' + (10 * Math.log10(r3 + 1e-12)).toFixed(0) + ' dB');

/* ---- THE BANK ---- */
var q = g._rtsBankQueue(), firsts = q.filter(function (e) { return e[1] === 0; }).length, want = 0;
names.forEach(function (n) { want += g._rtsSfxRecipe(n).takes; });
S.ok('the bank queues every take, every effect\'s first ahead of any second', q.length === want && firsts === names.length &&
     q.slice(0, names.length).every(function (e) { return e[1] === 0; }), q.length + ' takes, first ' + firsts);

require('../lib/report.js')(S);
