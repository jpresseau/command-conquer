/* audio/score.js - the music, written down: two songs, and what each bar of them plays.

   THE OLD SCORE WAS ONE BAR. Sixteen steps of bass and a lead stab every other bar, looping for
   the length of a match, the same at a quiet start as in the middle of a battle. This is two
   songs, each a chord progression set out in phrases of four bars, played in a form (A A B A C B)
   that then repeats; and three INTENSITIES, which the game moves between (audio/music.js):

     CALM    0   the pad and a soft arpeggio, a shaker, a low tom now and then
     ALERT   1   half-time drums, a driving eighth-note bass, the arpeggio in sixteenths; the
                 lead in the B phrases only
     BATTLE  2   the full kit with fills and crashes, a distorted bass riff, brass stabs, and the
                 lead carrying the tune - doubled an octave up every second time through

   Everything a bar plays comes out of _rtsScoreBar, a pure function of the song, the bar number
   and the intensity, so unit/music can play a whole song without a sound card and check what it
   would have played: every note in key, the tune on its chords, every bar the right length.

   Pattern strings are sixteen steps a bar, one a sixteenth note. Drums: 'x' a hit, 'X' an accent,
   '.' rest. Bass: 'R' root, '5' fifth, 'O' octave, '.' rest. Arpeggio: '1'-'4' the chord's notes
   from the bottom, '.' rest. A tune is bars of [step, MIDI note, length in steps]. */

var RTS_STEPS = 16;
var RTS_PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/* 'Em', 'C', 'B', 'Bm', 'Bb': its root's pitch class and its notes' */
function _rtsChordOf(sym) {
  var m = /^([A-G][b#]?)(m?)$/.exec(sym);
  if (!m) return null;
  var r = RTS_PC[m[1]];
  return { sym: sym, root: r, minor: !!m[2], tones: [r, (r + (m[2] ? 3 : 4)) % 12, (r + 7) % 12] };
}
/* the chord's notes as MIDI, the lowest at or above `lo`, close together */
function _rtsVoicing(sym, lo) {
  var c = _rtsChordOf(sym), out = [];
  c.tones.forEach(function (pc) { var n = lo + ((pc - lo % 12) + 12) % 12; out.push(n); });
  return out.sort(function (a, b) { return a - b; });
}

var RTS_DRUMS = {
  0: { shaker: '..x...x...x...x.' },
  1: { kick: 'x.......x.......', snare: '........x.......', hatC: 'X.x.X.x.X.x.X.x.' },
  2: { kick: 'x...x...x...x.x.', snare: '....x.......x...', hatC: 'XxxxXxxxXxxxXxxx', hatO: '..............x.' },
  half: { kick: 'x.......x..x....', snare: '........x.......', hatC: 'X.x.X.x.X.x.X.x.' }
};
var RTS_FILL = { 1: { snare: '............xxxx' }, 2: { tomH: '............xx..', tomL: '..............xx', snare: '........x.x.....' } };
var RTS_BASSLINE = { 0: 'R...............', 1: 'R.R.R.R.R.R.R.R.', 2: 'R.RR.RR.R.ROR.5.', half: 'R.......R..R....' };
var RTS_ARP = { 0: '1.2.3.2.1.2.3.2.', 1: '1234321412343214', 2: '1.3.2.4.1.3.2.4.' };
var RTS_STAB = 'x.....x...x.....';

var RTS_SONGS = [
  { name: 'Iron Tide', bpm: 112, tonic: 4, scale: [4, 6, 7, 9, 11, 0, 2, 3],       /* E minor, and the D# of its B major */
    phrases: {
      A: ['Em', 'C', 'D', 'Em'], B: ['Em', 'Am', 'C', 'B'], C: ['C', 'D', 'Bm', 'Em'] },
    form: ['A', 'A', 'B', 'A', 'C', 'B'],
    tune: {
      A: [[[0, 71, 4], [4, 76, 4], [8, 71, 2], [10, 74, 2], [12, 67, 4]],
          [[0, 72, 6], [6, 71, 2], [8, 67, 4], [12, 64, 4]],
          [[0, 66, 4], [4, 69, 4], [8, 74, 6], [14, 72, 2]],
          [[0, 71, 12], [12, 67, 2], [14, 69, 2]]],
      B: [[[0, 76, 4], [4, 79, 4], [8, 76, 2], [10, 78, 2], [12, 71, 4]],
          [[0, 72, 4], [4, 76, 4], [8, 69, 8]],
          [[0, 67, 4], [4, 72, 4], [8, 76, 4], [12, 74, 4]],
          [[0, 75, 8], [8, 71, 4], [12, 78, 4]]],
      C: [[[0, 64, 8], [8, 67, 8]], [[0, 66, 8], [8, 69, 8]], [[0, 71, 8], [8, 74, 8]], [[0, 76, 16]]] } },
  { name: 'Red Dawn', bpm: 96, tonic: 2, scale: [2, 4, 5, 7, 9, 10, 0, 1],         /* D minor, and the C# of its A major */
    phrases: {
      A: ['Dm', 'Bb', 'Gm', 'A'], B: ['Dm', 'F', 'C', 'A'], C: ['Bb', 'C', 'Dm', 'Dm'] },
    form: ['A', 'A', 'B', 'A', 'C', 'B'],
    half: true,                                                                   /* a half-time battle */
    tune: {
      A: [[[0, 69, 6], [6, 72, 2], [8, 74, 4], [12, 69, 4]],
          [[0, 70, 8], [8, 74, 4], [12, 77, 4]],
          [[0, 79, 4], [4, 77, 4], [8, 74, 4], [12, 70, 4]],
          [[0, 73, 8], [8, 76, 4], [12, 69, 4]]],
      B: [[[0, 74, 4], [4, 77, 4], [8, 81, 8]],
          [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 72, 8]],
          [[0, 76, 4], [4, 79, 4], [8, 76, 4], [12, 72, 4]],
          [[0, 73, 6], [6, 76, 2], [8, 81, 8]]],
      C: [[[0, 74, 16]], [[0, 76, 16]], [[0, 77, 8], [8, 74, 8]], [[0, 69, 16]]] } }
];

/* Where bar `n` of a song falls: its phrase, the bar within it, the chord, and how many times the
   phrase has come round before (for the variations). */
function _rtsScoreAt(song, n) {
  var per = song.form.length * 4, k = n % per, pi = Math.floor(k / 4), letter = song.form[pi], seen = 0;
  for (var i = 0; i < pi; i++) if (song.form[i] === letter) seen++;
  seen += Math.floor(n / per) * song.form.filter(function (f) { return f === letter; }).length;
  return { phrase: letter, bar: k % 4, chord: song.phrases[letter][k % 4], seen: seen, first: k % 4 === 0, last: k % 4 === 3 };
}

/* EVERYTHING BAR `n` PLAYS at intensity `lv`: a list of { step, inst, key, len, vel } - `key` a
   MIDI note, a chord's notes (pad, brass) or nothing (drums), `len` in steps. */
function _rtsScoreBar(song, n, lv) {
  var at = _rtsScoreAt(song, n), ev = [], s, i;
  function hits(pat, inst, vel) {
    for (s = 0; s < RTS_STEPS; s++) if (pat[s] === 'x' || pat[s] === 'X') ev.push({ step: s, inst: inst, len: 1, vel: vel * (pat[s] === 'X' ? 1 : 0.62) });
  }
  var half = at.phrase === 'C' || song.half, drums = lv === 2 && half ? RTS_DRUMS.half : RTS_DRUMS[lv];
  var fill = lv > 0 && at.last ? RTS_FILL[lv] : null;
  /* the last bar of a phrase ends in a fill: the kit's last beat gives way to it */
  Object.keys(drums).forEach(function (k) { hits(fill ? drums[k].slice(0, 12) + '....' : drums[k], k, k === 'shaker' ? 0.45 : 0.9); });
  if (fill) Object.keys(fill).forEach(function (k) { hits(fill[k], k, 0.85); });
  if (lv === 0 && at.first && at.seen % 2 === 0) ev.push({ step: 0, inst: 'tomL', len: 1, vel: 0.5 });
  if (lv === 2 && at.first) ev.push({ step: 0, inst: 'crash', len: 1, vel: 0.8 });

  /* the bass: under the chord, an octave of E1 to D#2 */
  var c = _rtsChordOf(at.chord), root = 28 + ((c.root - 4) + 12) % 12;
  var bl = lv === 2 && half ? RTS_BASSLINE.half : RTS_BASSLINE[lv], blen = lv === 0 ? 16 : (lv === 2 && half ? 4 : 2);
  for (s = 0; s < RTS_STEPS; s++) {
    var b = bl[s];
    if (b === '.') continue;
    var len = Math.min(blen, RTS_STEPS - s);
    for (i = s + 1; i < s + len; i++) if (bl[i] && bl[i] !== '.') { len = i - s; break; }
    ev.push({ step: s, inst: lv === 2 ? 'bassD' : 'bass', key: root + (b === '5' ? 7 : b === 'O' ? 12 : 0), len: len, vel: lv === 0 ? 0.55 : 0.85 });
  }
  /* the chord: the pad every bar, the arpeggio over it, the brass stabbing it in a battle */
  ev.push({ step: 0, inst: 'pad', key: at.chord, len: RTS_STEPS, vel: lv === 2 ? 0.55 : 0.75 });
  var notes = _rtsVoicing(at.chord, 55).concat([_rtsVoicing(at.chord, 55)[0] + 12]), ap = RTS_ARP[lv];
  for (s = 0; s < RTS_STEPS; s++) if (ap[s] !== '.') ev.push({ step: s, inst: 'pluck', key: notes[+ap[s] - 1], len: 1, vel: lv === 2 ? 0.35 : 0.5 });
  if (lv === 2 && (at.bar % 2 === 0 || at.phrase === 'B'))
    for (s = 0; s < RTS_STEPS; s++) if (RTS_STAB[s] === 'x') ev.push({ step: s, inst: 'brass', key: at.chord, len: 1, vel: 0.7 });
  /* the tune */
  if (lv === 2 || (lv === 1 && at.phrase === 'B')) {
    song.tune[at.phrase][at.bar].forEach(function (t) {
      ev.push({ step: t[0], inst: 'lead', key: t[1], len: t[2], vel: lv === 2 ? 0.8 : 0.55 });
      if (lv === 2 && at.seen % 2 === 1) ev.push({ step: t[0], inst: 'lead', key: t[1] + 12, len: t[2], vel: 0.3 });
    });
  }
  return ev;
}

/* Every sample a song can ask for, at any intensity, and the longest it is ever held (`len`, in
   steps): the sampler renders these and only these, each as long as it needs to be. */
function _rtsScoreNeeds(song) {
  var need = {}, per = song.form.length * 4 * 2;      /* twice round, for the doubled tunes */
  for (var n = 0; n < per; n++) for (var lv = 0; lv <= 2; lv++) {
    _rtsScoreBar(song, n, lv).forEach(function (e) {
      var k = e.inst + (e.key == null ? '' : ':' + e.key);
      if (!need[k]) need[k] = { inst: e.inst, key: e.key, len: 0 };
      need[k].len = Math.max(need[k].len, e.len);
    });
  }
  return Object.keys(need).sort().map(function (k) { return need[k]; });
}

/* THE INTENSITY. `heat` is how much fighting has been heard lately (audio/music.js keeps it); the
   level climbs as soon as it is called for and comes down one step at a time, only after the
   heat has stayed under the level for RTS_MUS_HOLD seconds - so a lull between two volleys does
   not drop the drums out. */
var RTS_MUS_HOT = 5;            /* heat for a battle */
var RTS_MUS_WARM = 1.2;         /* ...for the alert */
var RTS_MUS_HOLD = 10;          /* seconds under a level before it steps down */
function _rtsMusicLevel(prev, heat, below) {
  var want = heat >= RTS_MUS_HOT ? 2 : heat >= RTS_MUS_WARM ? 1 : 0;
  if (want >= prev) return want;
  return below >= RTS_MUS_HOLD ? prev - 1 : prev;
}
