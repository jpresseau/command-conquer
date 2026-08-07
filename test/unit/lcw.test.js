/* LCW, both directions.

   Format 80 is the compression under almost everything Westwood shipped - shapes, palettes,
   map packs - so a decoder that is subtly wrong shows up as "the image looks odd" a long way
   from the cause. The streams here are hand-assembled, one per op-code, so a broken branch is
   named instead.

   The compressor is ours: the game only ever reads LCW, but the map editor writes scenarios in
   RA's own packed format, and those have to be read back by the SAME reader that opens a
   scenario lifted out of MAIN.MIX. So the test for it is a round trip, not a check of the
   bytes - any legal stream will do, and how well it compressed is not the decoder's business. */

var { Suite, sameBytes } = require('../lib/assert.js');
var lcw = require('../../ra/lcw.js');

var S = new Suite('lcw');

/* ------------------------------------------------------------ decompress ----*/

/* 10nnnnnn - medium copy straight from the source */
(function () {
  var src = new Uint8Array([0x83, 11, 22, 33, 0x80]);
  var out = new Uint8Array(3);
  var n = lcw.lcwDecompress(src, 0, out);
  S.ok('LCW literal run', n === 3 && sameBytes(out, new Uint8Array([11, 22, 33])),
       Array.from(out).join(','));
})();

/* 11111110 - long run of a single byte */
(function () {
  var src = new Uint8Array([0xfe, 5, 0, 0x77, 0x80]);
  var out = new Uint8Array(5);
  lcw.lcwDecompress(src, 0, out);
  S.bytes('LCW long run', out, new Uint8Array([0x77, 0x77, 0x77, 0x77, 0x77]));
})();

/* 0nnn.... - short copy from destination, RELATIVE back-reference.
   Deliberately a 1-byte back-reference with a count of 4: this only produces the right
   answer if the copy is byte-at-a-time and reads bytes it has just written. A slice-based
   or typed-array `set` implementation fails exactly here, and this is the single most
   common way a hand-written LCW decoder is subtly wrong. */
(function () {
  var src = new Uint8Array([0x81, 0xAB, 0x10, 0x01, 0x80]);
  var out = new Uint8Array(5);
  lcw.lcwDecompress(src, 0, out);
  S.ok('LCW overlapping back-reference expands a run',
       sameBytes(out, new Uint8Array([0xAB, 0xAB, 0xAB, 0xAB, 0xAB])), Array.from(out).join(','));
})();

/* 11nnnnnn - medium copy from destination, ABSOLUTE offset */
(function () {
  var src = new Uint8Array([0x84, 1, 2, 3, 4, 0xC0, 0x00, 0x00, 0x80]);
  var out = new Uint8Array(7);
  lcw.lcwDecompress(src, 0, out);
  S.ok('LCW absolute mid copy', sameBytes(out, new Uint8Array([1, 2, 3, 4, 1, 2, 3])),
       Array.from(out).join(','));
})();

/* 11111111 - long copy from destination, ABSOLUTE offset */
(function () {
  var src = new Uint8Array([0x84, 9, 8, 7, 6, 0xff, 4, 0, 1, 0, 0x80]);
  var out = new Uint8Array(8);
  lcw.lcwDecompress(src, 0, out);
  S.ok('LCW absolute long copy', sameBytes(out, new Uint8Array([9, 8, 7, 6, 8, 7, 6, 8])),
       Array.from(out).join(','));
})();

/* 10000000 - end of stream, and a truncated stream must stop rather than run away */
(function () {
  var out = new Uint8Array(4);
  var n = lcw.lcwDecompress(new Uint8Array([0x80]), 0, out);
  S.ok('LCW end marker stops at zero bytes', n === 0);
  var out2 = new Uint8Array(4);
  var n2 = lcw.lcwDecompress(new Uint8Array([0x82, 5]), 0, out2);   /* claims 2, supplies 1 */
  S.ok('a truncated stream returns instead of overrunning', n2 <= 4, n2 + ' bytes');
})();

/* the destination is never written past its end */
(function () {
  var src = new Uint8Array([0xfe, 0xff, 0xff, 0x5a, 0x80]);          /* 65535-byte run */
  var out = new Uint8Array(16);
  var n = lcw.lcwDecompress(src, 0, out);
  S.ok('a run longer than the buffer is clamped', n === 16 && out[15] === 0x5a, n + ' bytes');
})();

/* ------------------------------------------------------------- XOR delta ----*/
(function () {
  var base = new Uint8Array([1, 1, 1, 1, 1, 1]);
  /* skip 2, XOR two literal bytes, then end */
  var d = new Uint8Array([0x82, 0x02, 0x03, 0x03, 0x80, 0x00, 0x00]);
  lcw.xorDelta(d, 0, base);
  S.ok('XOR delta skips and applies', sameBytes(base, new Uint8Array([1, 1, 2, 2, 1, 1])),
       Array.from(base).join(','));
})();

/* -------------------------------------------------------------- compress ----
   The editor's save path. A round trip, because the only thing that matters is that our own
   stream is legal enough for the reader that opens everyone else's. */
(function () {
  var enc = lcw.lcwCompress;
  /* the compressor must survive the shapes a map actually contains */
  [[], [7], [7, 7, 7], [1, 2, 3, 4, 5],
   new Array(300).fill(9),
   new Array(200).fill(0).map(function (_, i) { return i & 0xff; })
  ].forEach(function (arr, k) {
    var src = Uint8Array.from(arr), out = new Uint8Array(src.length);
    lcw.lcwDecompress(enc(src), 0, out);
    S.ok('lcwCompress round-trips case ' + k + ' (' + src.length + ' bytes)', sameBytes(out, src));
  });
  var big = new Uint8Array(8192);
  for (var i = 0; i < 8192; i++) big[i] = (i < 6000) ? 255 : (i * 7) & 0xff;
  var back = new Uint8Array(8192);
  var packed = enc(big);
  lcw.lcwDecompress(packed, 0, back);
  S.ok('...and a full 8192-byte chunk', sameBytes(back, big), packed.length + ' bytes out of 8192');
  S.ok('...compressing a long run actually shrinks it', packed.length < 8192, packed.length);
})();

require('../lib/report.js')(S);
