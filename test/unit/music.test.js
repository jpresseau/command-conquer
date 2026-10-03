/* THE SCORE, played without a sound card (audio/score.js, audio/instruments.js). Every bar of
   both songs, at every intensity, is asked what it would play, and the band's notes are rendered
   and measured:

     THE HARMONY   every chord parses and is voiced as its own notes; every note any bar plays is
                   in its song's key; the tune sits on its chords - on the downbeat and the
                   half-bar it is a note of the chord under it
     THE BARS      every note starts and ends inside its bar
     INTENSITY     calm has no kit and no tune; the alert brings in kick, snare and bass but no
                   brass; a battle has the crash on every phrase, the fills, the brass and the
                   tune - doubled an octave up the second time round
     THE LEVEL     climbs at once, and comes down one step at a time, only after RTS_MUS_HOLD
     THE SAMPLER   is told of every sample any bar asks for, and the whole of a song fits in 8 MB
     THE BAND      every pitched instrument in tune to 10 cents, a chord on the pad sounding its
                   own three notes and not their neighbours, a kick low and a hat high */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');
var A = require('../lib/sound.js');

var S = new Suite('music');
var g = load(['src/audio']);
var SONGS = g.RTS_SONGS, ROUND = function (song) { return song.form.length * 4; };

/* ---- THE HARMONY ---- */
var chords = {}, badChord = [];
SONGS.forEach(function (song) { Object.keys(song.phrases).forEach(function (p) { song.phrases[p].forEach(function (c) { chords[c] = 1; }); }); });
Object.keys(chords).forEach(function (c) {
  var C = g._rtsChordOf(c), v = C && g._rtsVoicing(c, 55);
  if (!C || v.length !== 3 || !v.every(function (m) { return C.tones.indexOf(m % 12) >= 0; }) || v[2] - v[0] > 12) badChord.push(c);
});
S.ok('every chord in the songs parses and is voiced as its own three notes, within an octave', !badChord.length,
     badChord.join(', ') || Object.keys(chords).join(' '));
var outKey = [], onChord = 0, strong = 0, offBar = [];
SONGS.forEach(function (song) {
  for (var n = 0; n < ROUND(song) * 2; n++) for (var lv = 0; lv <= 2; lv++) {
    var at = g._rtsScoreAt(song, n), tones = g._rtsChordOf(at.chord).tones;
    g._rtsScoreBar(song, n, lv).forEach(function (e) {
      if (typeof e.key === 'number' && song.scale.indexOf(e.key % 12) < 0) outKey.push(song.name + ' bar ' + n + ' ' + e.inst + ' ' + e.key);
      if (e.step < 0 || e.step >= 16 || e.step + e.len > 16) offBar.push(song.name + ' bar ' + n + ' ' + e.inst + ' at ' + e.step + '+' + e.len);
      if (e.inst === 'lead' && lv === 2 && (e.step === 0 || e.step === 8)) { strong++; if (tones.indexOf(e.key % 12) >= 0) onChord++; }
    });
  }
});
S.ok('every note any bar plays, at any intensity, is in its song\'s key', !outKey.length, outKey.slice(0, 6).join('; ') || 'all in key');
S.ok('the tune sits on its chords: on the downbeat and the half-bar it is the chord\'s own note', strong > 40 && onChord === strong,
     onChord + ' of ' + strong + ' strong-beat notes');

/* ---- THE BARS ---- */
S.ok('every note starts and ends inside its bar', !offBar.length, offBar.slice(0, 6).join('; ') || 'all inside');

/* ---- INTENSITY ---- */
var song = SONGS[0];
function insts(n, lv) { var o = {}; g._rtsScoreBar(song, n, lv).forEach(function (e) { o[e.inst] = (o[e.inst] || 0) + 1; }); return o; }
var calm = insts(1, 0), alert = insts(1, 1), battle = insts(1, 2), phraseStart = insts(4, 2), phraseEnd = insts(3, 2), alertEnd = insts(3, 1);
S.ok('calm is the pad, the arpeggio and a shaker: no kit, no tune', calm.pad && calm.pluck && calm.shaker && !calm.kick && !calm.snare && !calm.lead && !calm.brass,
     JSON.stringify(calm));
S.ok('the alert brings in the kick, the snare and a moving bass, but no brass', alert.kick && alert.snare && alert.bass >= 8 && !alert.brass,
     JSON.stringify(alert));
S.ok('a battle has the tune, the brass and the driven bass', battle.lead && phraseStart.brass >= 3 && battle.bassD && !battle.bass,
     JSON.stringify(battle) + ', brass ' + phraseStart.brass + ' on the phrase\'s first bar');
S.ok('...a crash on every phrase\'s first bar, and a fill on its last', phraseStart.crash === 1 && !battle.crash && phraseEnd.tomH && phraseEnd.tomL && alertEnd.snare > alert.snare,
     'crash ' + phraseStart.crash + ', toms ' + phraseEnd.tomH + '+' + phraseEnd.tomL + ', alert snares ' + alert.snare + ' -> ' + alertEnd.snare);
/* the doubled tune: phrase A comes round at bars 0 and 4 */
var first = g._rtsScoreBar(song, 0, 2).filter(function (e) { return e.inst === 'lead'; }), again = g._rtsScoreBar(song, 4, 2).filter(function (e) { return e.inst === 'lead'; });
S.ok('...and the tune doubled an octave up the second time round', again.length === first.length * 2 &&
     again.some(function (e) { return e.key === first[0].key + 12; }), first.length + ' notes, then ' + again.length);
var seen = [0, 1, 2, 3, 4, 5].map(function (p) { return g._rtsScoreAt(song, p * 4).phrase + g._rtsScoreAt(song, p * 4).seen; }).join(' ');
S.eq('the form plays A A B A C B, counting each phrase\'s visits', seen, 'A0 A1 B0 A2 C0 B1');

/* ---- THE LEVEL ---- */
var L = g._rtsMusicLevel;
S.ok('the level climbs at once - calm to battle in one bar', L(0, 9, 0) === 2 && L(0, 2, 0) === 1 && L(1, 9, 0) === 2);
S.ok('...holds through a lull shorter than RTS_MUS_HOLD', L(2, 0, g.RTS_MUS_HOLD - 0.1) === 2 && L(1, 0, 3) === 1);
S.ok('...and then comes down one step at a time', L(2, 0, g.RTS_MUS_HOLD) === 1 && L(1, 0, g.RTS_MUS_HOLD) === 0 && L(2, 2, g.RTS_MUS_HOLD) === 1);

/* ---- THE SAMPLER ---- */
var missing = [], bytes = {};
SONGS.forEach(function (s2) {
  var needs = g._rtsScoreNeeds(s2), have = {};
  needs.forEach(function (e) { have[e.inst + ':' + e.key] = e.len; });
  for (var n = 0; n < ROUND(s2) * 3; n++) for (var lv = 0; lv <= 2; lv++) g._rtsScoreBar(s2, n, lv).forEach(function (e) {
    var k = e.inst + ':' + e.key;
    if (have[k] == null || have[k] < e.len) missing.push(s2.name + ' ' + k);
  });
  bytes[s2.name] = 0;
  needs.forEach(function (e) {
    var sec = (e.len || 1) * 15 / s2.bpm + (e.inst === 'pad' ? 0.7 : 0.35), fixed = { kick: 0.6, snare: 0.5, hatC: 0.12, hatO: 0.6, crash: 2.4, tomH: 0.6, tomL: 0.8, shaker: 0.12, pluck: 0.7, brass: 0.7 };
    if (fixed[e.inst]) sec = fixed[e.inst];
    bytes[s2.name] += sec * 48000 / (g.RTS_INST_RATE[e.inst] || 1) * 4 * (e.inst === 'pad' ? 2 : 1);
  });
});
S.ok('the sampler is told of every sample any bar asks for, as long as it is ever held', !missing.length, missing.slice(0, 5).join('; ') || 'all covered');
S.ok('...and a whole song fits in 8 MB of samples at 48 kHz', Object.keys(bytes).every(function (k) { return bytes[k] < 8e6; }),
     Object.keys(bytes).map(function (k) { return k + ' ' + (bytes[k] / 1e6).toFixed(1) + ' MB'; }).join(', '));

/* ---- THE BAND ---- */
var SR = 24000, tune = [];
[['bass', 33], ['bassD', 40], ['lead', 69], ['lead', 79], ['pluck', 60], ['pluck', 71]].forEach(function (p) {
  var x = g._rtsInstRender(p[0], p[1], SR, 1.2), f = g._rtsMidiHz(p[1]), sp = A.spectrum(x, SR, 32768), best = -1, bf = 0;
  for (var i = 1; i < sp.pw.length; i++) { var hz = i * sp.hz; if (hz > f * 0.95 && hz < f * 1.05 && sp.pw[i] > best) { best = sp.pw[i]; bf = hz; } }
  var cents = 1200 * Math.log(bf / f) / Math.LN2;
  tune.push(p[0] + ' ' + p[1] + ' ' + (cents >= 0 ? '+' : '') + cents.toFixed(1) + 'c');
  if (Math.abs(cents) > 10) tune.push('OUT');
});
S.ok('every pitched instrument plays in tune, to 10 cents', tune.indexOf('OUT') < 0, tune.join(', '));
var pad = g._rtsInstRender('pad', g._rtsVoicing('Am', 52), SR, 2), spp = A.spectrum(pad[0], SR, 32768);
function around(f) { var s = 0; for (var i = 1; i < spp.pw.length; i++) { var hz = i * spp.hz; if (hz > f * 0.985 && hz < f * 1.015) s += spp.pw[i]; } return s; }
var ratio = g._rtsVoicing('Am', 52).map(function (m) { return around(g._rtsMidiHz(m)) / Math.max(1e-12, around(g._rtsMidiHz(m + 1))); });
S.ok('a chord on the pad sounds its own three notes, not their neighbours', ratio.every(function (r) { return r > 30; }),
     ratio.map(function (r) { return (10 * Math.log10(r)).toFixed(0) + ' dB'; }).join(', ') + ' over the semitone above');
var kick = A.bands(g._rtsInstRender('kick', null, 48000), 48000, [0, 200, 24000]), hat = A.bands(g._rtsInstRender('hatC', null, 48000), 48000, [0, 5000, 24000]);
S.ok('a kick is low and a hat is high', kick[0] > 0.85 && hat[1] > 0.8, 'kick ' + Math.round(kick[0] * 100) + '% under 200 Hz, hat ' + Math.round(hat[1] * 100) + '% over 5 kHz');

require('../lib/report.js')(S);
