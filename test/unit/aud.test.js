/* AUD: every sound effect and every music track in Red Alert.

   The player's own archives are all IMA (compression 99) at 22050 Hz, so the Westwood codec
   (compression 1) has no real file to be checked against - it is exercised here with hand-built
   streams instead, one per op-code, the same way LCW is.

   The property both codecs share, and both can get wrong, is that the running sample carries
   ACROSS chunk boundaries. A decoder that resets it per chunk still produces audio of exactly
   the right length and clicks every 512 samples, which is why the seam test below is the one
   that matters most here. */

var { Suite } = require('../lib/assert.js');
var aud = require('../../ra/aud.js');

var S = new Suite('aud');

function mkAud(comp, rate, chunks, flags) {
  var body = [], total = 0;
  chunks.forEach(function (c) {
    body.push(c.data.length & 255, (c.data.length >> 8) & 255,
              c.out & 255, (c.out >> 8) & 255,
              0xaf, 0xde, 0x00, 0x00);            /* 0x0000DEAF, little-endian */
    for (var i = 0; i < c.data.length; i++) body.push(c.data[i]);
    total += c.out;
  });
  var head = [rate & 255, (rate >> 8) & 255,
              body.length & 255, (body.length >> 8) & 255, 0, 0,
              total & 255, (total >> 8) & 255, (total >> 16) & 255, 0,
              flags || 0, comp];
  return Uint8Array.from(head.concat(body));
}

/* -------------------------------------------------------------------- IMA ----*/
(function () {
  /* IMA: nibble 0 with index 0 is a step of 7>>3 = 0, so a run of zero nibbles must stay put.
     Nibble 8 is the same magnitude negative. */
  var a = aud.audOpen(mkAud(99, 22050, [{ data: [0x00, 0x00], out: 8 }]));
  S.ok('audOpen reads an IMA header', !a.error && a.rate === 22050 && a.channels === 1, a.error || '');
  S.ok('...and produces two samples per byte', a.samples.length === 4, a.samples && a.samples.length);
  S.ok('...and a zero nibble barely moves the signal', Math.abs(a.samples[0]) < 0.001);

  /* A rising staircase: nibble 7 is the largest positive step at any index. */
  var b = aud.audOpen(mkAud(99, 22050, [{ data: [0x77, 0x77, 0x77, 0x77], out: 16 }]));
  var s = b.samples, rising = true;
  for (var i = 1; i < s.length; i++) if (s[i] <= s[i - 1]) rising = false;
  S.ok('...and a run of maximum nibbles climbs monotonically', rising,
       Array.from(s).map(function (v) { return v.toFixed(3); }).join(' '));
  S.ok('...and stays inside -1..1', s.every(function (v) { return v >= -1 && v <= 1; }));
})();

(function () {
  /* THE state test. Two chunks of identical rising data: if the decoder resets between them,
     the second chunk restarts from zero and the seam is a cliff. If it carries, the second
     chunk continues climbing from where the first left off. */
  var one = { data: [0x77, 0x77, 0x77, 0x77], out: 16 };
  var two = aud.audOpen(mkAud(99, 22050, [one, { data: one.data.slice(), out: 16 }]));
  var s = two.samples, mid = 8;
  S.ok('IMA state carries across a chunk boundary - no click at the seam',
       s[mid] > s[mid - 1], s[mid - 1].toFixed(3) + ' -> ' + s[mid].toFixed(3));
  S.ok('...and the second chunk continues the climb rather than restarting',
       s[s.length - 1] > s[mid - 1], s[s.length - 1].toFixed(3));
})();

/* -------------------------------------------------------- Westwood ADPCM ----*/
(function () {
  /* One op-code at a time. Output is 8-bit centred on 128, so silence is 0.0 and the starting
     sample is the centre. */
  /* mode 3 (0xC0 | n): hold the current sample n+1 times */
  var hold = aud.audOpen(mkAud(1, 22050, [{ data: [0xc0 | 3], out: 4 }]));
  S.ok('WS hold repeats the current sample', !hold.error && hold.samples.length === 4 &&
       hold.samples.every(function (v) { return v === 0; }),
       hold.error || Array.from(hold.samples).join(','));

  /* mode 2 with bit 5 clear: a literal run of n+1 raw bytes */
  var lit = aud.audOpen(mkAud(1, 22050, [{ data: [0x80 | 2, 0, 128, 255], out: 3 }]));
  S.ok('WS literal run passes bytes straight through',
       !lit.error && Math.abs(lit.samples[0] + 1) < 0.01 && lit.samples[1] === 0 &&
       Math.abs(lit.samples[2] - 0.9922) < 0.01,
       lit.error || Array.from(lit.samples).map(function (v) { return v.toFixed(3); }).join(' '));

  /* mode 2 with bit 5 set: one 5-bit signed delta carried in the count itself */
  var d = aud.audOpen(mkAud(1, 22050, [{ data: [0x80 | 0x20 | 4], out: 1 }]));
  S.ok('WS inline delta moves the sample by the low five bits',
       !d.error && Math.abs(d.samples[0] - 4 / 128) < 0.001, d.error || d.samples[0]);
  var dn = aud.audOpen(mkAud(1, 22050, [{ data: [0x80 | 0x20 | 0x1c], out: 1 }]));
  S.ok('...and sign-extends a negative one', !dn.error && dn.samples[0] < 0, dn.samples && dn.samples[0]);

  /* mode 1: two 4-bit deltas per byte, table value 8 is +1 and 0 is -9 */
  var q = aud.audOpen(mkAud(1, 22050, [{ data: [0x40 | 0, 0x88], out: 2 }]));
  S.ok('WS 4-bit deltas decode two samples per byte',
       !q.error && q.samples.length === 2 && q.samples[0] === 0 && q.samples[1] === 0,
       q.error || Array.from(q.samples).join(','));

  /* mode 0: four 2-bit deltas per byte, table [-2,-1,0,1] */
  var t = aud.audOpen(mkAud(1, 22050, [{ data: [0x00, 0xff], out: 4 }]));
  S.ok('WS 2-bit deltas decode four samples per byte',
       !t.error && t.samples.length === 4 && t.samples[3] > t.samples[0],
       t.error || Array.from(t.samples).map(function (v) { return v.toFixed(3); }).join(' '));
})();

/* ------------------------------------------------------------- malformed ----*/
(function () {
  S.ok('an AUD with an unknown codec is refused', !!aud.audOpen(mkAud(7, 22050, [])).error);
  S.ok('...and a runt', !!aud.audOpen(new Uint8Array(6)).error);
  S.ok('...and one whose chunk magic is wrong stops rather than reading noise', (function () {
    var a = mkAud(99, 22050, [{ data: [0x77, 0x77], out: 8 }]);
    a[16] = 0;                                  /* break the 0x0000DEAF marker */
    return !!aud.audOpen(a).error;
  })());
  var st = aud.audOpen(mkAud(99, 11025, [{ data: [0x11, 0x22], out: 8 }], 1));
  S.ok('...and the stereo flag is reported', !st.error && st.channels === 2 && st.rate === 11025);
})();

require('../lib/report.js')(S);
