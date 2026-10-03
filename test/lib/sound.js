/* Measuring a rendered sound, for the specs that cannot listen to one (unit/sfx).

   The energy of the whole sound by band, from a Welch average - overlapping Hann windows, every
   frame's power summed - so a long rumble counts for as long as it lasts and a 5 ms crack for
   5 ms; its spectral centroid (where the weight of it sits) and flatness (noise is near 1, a pure
   tone near 0); and plain level: peak, RMS over a stretch, and how quiet its last 10 ms are. */

/* an in-place radix-2 FFT */
function fft(re, im) {
  var n = re.length, i, j, k, len, ang, wr, wi, tr, ti, ur, ui, cr, ci;
  for (i = 1, j = 0; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { tr = re[i]; re[i] = re[j]; re[j] = tr; tr = im[i]; im[i] = im[j]; im[j] = tr; }
  }
  for (len = 2; len <= n; len <<= 1) {
    ang = -2 * Math.PI / len; wr = Math.cos(ang); wi = Math.sin(ang);
    for (i = 0; i < n; i += len) {
      cr = 1; ci = 0;
      for (k = 0; k < len / 2; k++) {
        ur = re[i + k]; ui = im[i + k];
        tr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        ti = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + tr; im[i + k] = ui + ti;
        re[i + k + len / 2] = ur - tr; im[i + k + len / 2] = ui - ti;
        var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/* the power spectrum of the whole sound: power[k] at k * sr / N Hz */
function spectrum(x, sr, N) {
  N = N || 2048;
  var pw = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N), w = new Float64Array(N), i, s;
  for (i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (s = 0; s < x.length; s += N / 2) {
    for (i = 0; i < N; i++) { re[i] = (x[s + i] || 0) * w[i]; im[i] = 0; }
    fft(re, im);
    for (i = 1; i < N / 2; i++) pw[i] += re[i] * re[i] + im[i] * im[i];
  }
  return { pw: pw, hz: sr / N };
}

/* THE EAR'S WEIGHTING (IEC 61672 A-curve), as a power factor: a joule at 60 Hz is heard as a
   thirtieth of one at 1 kHz, so a share of raw energy says a rumble dominates a gunshot that in
   fact sounds like a crack */
function aWeight(f) {
  var f2 = f * f;
  var r = 12194 * 12194 * f2 * f2 / ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
  return r * r * 1.585;
}

/* the share of the energy in each band [lo, hi) Hz - as heard (A-weighted) when `heard` */
function bands(x, sr, edges, heard) {
  var S = spectrum(x, sr), tot = 0, out = edges.slice(0, -1).map(function () { return 0; }), i, b;
  for (i = 1; i < S.pw.length; i++) {
    var f = i * S.hz, p = S.pw[i] * (heard ? aWeight(f) : 1); tot += p;
    for (b = 0; b < out.length; b++) if (f >= edges[b] && f < edges[b + 1]) out[b] += p;
  }
  return out.map(function (v) { return tot ? v / tot : 0; });
}

/* where the energy's weight sits, in Hz, and how noise-like it is (0 a tone, 1 white noise) */
function centroid(x, sr, heard) {
  var S = spectrum(x, sr), a = 0, b = 0;
  for (var i = 1; i < S.pw.length; i++) { var p = S.pw[i] * (heard ? aWeight(i * S.hz) : 1); a += i * S.hz * p; b += p; }
  return b ? a / b : 0;
}
function flatness(x, sr) {
  var S = spectrum(x, sr), lg = 0, ar = 0, n = 0;
  for (var i = 1; i < S.pw.length; i++) {
    var f = i * S.hz;
    if (f < 60 || f > 12000) continue;
    lg += Math.log(S.pw[i] + 1e-20); ar += S.pw[i]; n++;
  }
  return n && ar ? Math.exp(lg / n) / (ar / n) : 0;
}

function peak(x) { var m = 0; for (var i = 0; i < x.length; i++) if (Math.abs(x[i]) > m) m = Math.abs(x[i]); return m; }
function rms(x, a, b) {
  a = Math.max(0, a || 0); b = Math.min(x.length, b == null ? x.length : b);
  var s = 0; for (var i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}
/* how alike two takes are: 1 the same sound, 0 unrelated */
function corr(x, y) {
  var c = 0, ex = 0, ey = 0, n = Math.min(x.length, y.length);
  for (var i = 0; i < n; i++) { c += x[i] * y[i]; ex += x[i] * x[i]; ey += y[i] * y[i]; }
  return ex && ey ? c / Math.sqrt(ex * ey) : 0;
}

module.exports = { aWeight: aWeight, spectrum: spectrum, bands: bands, centroid: centroid, flatness: flatness, peak: peak, rms: rms, corr: corr };
