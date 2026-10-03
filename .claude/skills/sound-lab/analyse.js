/* Render effects and loops offline and measure them, the way unit/sfx and unit/worldsound do, so a
   recipe can be retuned by number before any spec runs.

     node .claude/skills/sound-lab/analyse.js                 every effect
     node .claude/skills/sound-lab/analyse.js rifle cannon    just these (substrings)
     node .claude/skills/sound-lab/analyse.js --loops         the ambience loops instead
     node .claude/skills/sound-lab/analyse.js boom --wav=/tmp/wav   also write each take as a WAV

   For an effect: its length, takes, peak, how loud it is HEARD once its `vol` is applied (dB(A) of
   its loudest 400 ms, the measure unit/sfx holds to within 2 dB of `heard`), the vol that would
   land it exactly, the spread between takes, the spectral centroid as heard, flatness (noise ~1,
   tone ~0), and the ms one take takes to render. */

var path = require('path'), fs = require('fs');
var ROOT = path.resolve(__dirname, '../../..');
var { load } = require(path.join(ROOT, 'test/lib/sandbox.js'));
var A = require(path.join(ROOT, 'test/lib/sound.js'));

var args = process.argv.slice(2), want = [], loops = false, wav = null, SR = 44100;
args.forEach(function (a) {
  if (a === '--loops') loops = true;
  else if (a.indexOf('--wav=') === 0) wav = a.slice(6);
  else if (a.indexOf('--sr=') === 0) SR = +a.slice(5);
  else if (a[0] === '-') { console.error('unknown option ' + a); process.exit(2); }
  else want.push(a);
});
if (wav) fs.mkdirSync(wav, { recursive: true });

var g = load(['src/audio']);
function pick(list) { return want.length ? list.filter(function (n) { return want.some(function (w) { return n.indexOf(w) >= 0; }); }) : list; }

/* the same measure as unit/sfx: dB of the loudest 400 ms, A-weighted */
function heard(x) {
  var W = Math.round(0.4 * SR), best = -1, at = 0;
  for (var s = 0; s + W <= Math.max(W, x.length); s += Math.round(SR * 0.05)) { var r = A.rms(x, s, s + W); if (r > best) { best = r; at = s; } }
  var seg = x.slice(at, at + W), sp = A.spectrum(seg, SR), pw = 0, pa = 0;
  for (var k = 1; k < sp.pw.length; k++) { pw += sp.pw[k]; pa += sp.pw[k] * A.aWeight(k * sp.hz); }
  return 20 * Math.log10(A.rms(seg) * Math.sqrt(pa / pw) + 1e-9);
}

function writeWav(file, chans) {
  if (!Array.isArray(chans)) chans = [chans];
  var n = chans[0].length, c = chans.length, b = Buffer.alloc(44 + n * c * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * c * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * c * 2, 28); b.writeUInt16LE(c * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * c * 2, 40);
  for (var i = 0, o = 44; i < n; i++) for (var j = 0; j < c; j++, o += 2) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[j][i] * 32767))), o);
  fs.writeFileSync(file, b);
}

function row(cells, w) { return cells.map(function (v, i) { v = String(v); return i ? v.padStart(w[i]) : v.padEnd(w[i]); }).join(' '); }

if (loops) {
  var names = pick(Object.keys(g.RTS_LOOPS)), W = [12, 7, 7, 8, 8, 8, 9, 8];
  console.log(row(['loop', 'sec', 'chans', 'peak', 'rms dB', 'cen Hz', 'flatness', 'ms'], W));
  names.forEach(function (n) {
    var t0 = Date.now(), x = g._rtsLoopRender(n, SR), ms = Date.now() - t0, L = Array.isArray(x) ? x[0] : x;
    console.log(row([n, (L.length / SR).toFixed(2), Array.isArray(x) ? 2 : 1, A.peak(L).toFixed(3), (20 * Math.log10(A.rms(L) + 1e-9)).toFixed(1),
                     Math.round(A.centroid(L, SR, true)), A.flatness(L, SR).toFixed(2), ms], W));
    if (wav) writeWav(path.join(wav, n + '.wav'), x);
  });
} else {
  var names2 = pick(g.rtsSfxNames()), W2 = [11, 5, 5, 6, 8, 7, 7, 7, 9, 7, 8, 6], bad = 0;
  console.log(row(['effect', 'len', 'takes', 'peak', 'heard', 'meant', 'off', 'vol', 'vol fit', 'spread', 'cen Hz', 'ms'], W2));
  names2.forEach(function (n) {
    var R = g._rtsSfxRecipe(n), lv = [], ms = 0, first;
    for (var t = 0; t < R.takes; t++) {
      var t0 = Date.now(), x = g._rtsSfxRender(n, t, SR);
      ms += Date.now() - t0;
      if (!t) first = x;
      lv.push(heard(x));
      if (wav) writeWav(path.join(wav, n + '_' + t + '.wav'), x);
    }
    var at = lv[0] + 20 * Math.log10(R.vol || 1), off = at - R.heard, fit = Math.pow(10, (R.heard - lv[0]) / 20);
    if (Math.abs(off) > 2) bad++;
    console.log(row([n, R.len, R.takes, R.peak, at.toFixed(1), R.heard, (off > 0 ? '+' : '') + off.toFixed(1) + (Math.abs(off) > 2 ? '!' : ''),
                     (R.vol || 1).toFixed(2), fit.toFixed(2), (Math.max.apply(null, lv) - Math.min.apply(null, lv)).toFixed(1),
                     Math.round(A.centroid(first, SR, true)), Math.round(ms / R.takes)], W2));
  });
  if (bad) console.log('\n' + bad + ' effect(s) more than 2 dB off what they mean (marked !): unit/sfx fails on them. Set vol to "vol fit".');
}
if (wav) console.log('\nWAVs in ' + wav);
