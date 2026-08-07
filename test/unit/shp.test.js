/* SHP, and the 6-bit palettes that colour it.

   Shapes are hand-assembled here and read back, which proves the frame-chain logic with no
   game data present. That matters more than it sounds: two of the three frame formats are
   DELTAS, so decoding frame N can require decoding every frame before it. A reader that
   quietly returns zeroes for those looks perfect on frame 0 and produces garbage for the
   other thirty-one - and the asked-for-out-of-order case below is the one that catches it,
   because a chain walked lazily and a chain assumed already-walked agree until you skip. */

var { Suite, sameBytes } = require('../lib/assert.js');
var shp = require('../../ra/shp.js');

var S = new Suite('shp');

function buildShp(w, h, frames) {
  /* frames: [{fmt, data}] where data is already the encoded body */
  var head = 14 + (frames.length + 2) * 8;
  var bodies = frames.map(function (f) { return f.data; });
  var total = head + bodies.reduce(function (a, b) { return a + b.length; }, 0);
  var buf = new Uint8Array(total), dv = new DataView(buf.buffer);
  dv.setUint16(0, frames.length, true);
  dv.setUint16(6, w, true); dv.setUint16(8, h, true);
  dv.setUint32(10, w * h, true);
  var off = head, p = 14, offs = [];
  frames.forEach(function (f, i) {
    offs.push(off);
    dv.setUint32(p, (off & 0xffffff) | (f.fmt << 24), true);
    dv.setUint32(p + 4, (f.refIdx != null ? offs[f.refIdx] : 0) & 0xffffff, true);
    p += 8; off += f.data.length;
  });
  dv.setUint32(p, off & 0xffffff, true);                    /* end marker */
  var w2 = head;
  bodies.forEach(function (b) { buf.set(b, w2); w2 += b.length; });
  return buf;
}

(function () {
  /* frame 0: an LCW run of 0x11 over a 2x2 shape; frame 1: XOR-chain that flips one pixel */
  var f0 = new Uint8Array([0xfe, 4, 0, 0x11, 0x80]);         /* run of four 0x11 */
  /* `0x01` is "XOR the next 1 byte", not `0x81` - the high bit means SKIP that many, which is
     what the XOR-delta test in unit/lcw already demonstrates with `82 02 03 03`: skip 2, then
     XOR 2. Getting that backwards made this assertion fail against a decoder that was right. */
  var f1 = new Uint8Array([0x01, 0x22, 0x80, 0x00, 0x00]);   /* xor 1 byte with 0x22, then end */
  var raw = buildShp(2, 2, [{ fmt: 0x80, data: f0 }, { fmt: 0x20, data: f1 }]);
  var s = shp.shpOpen(raw);
  S.ok('SHP header parses', !s.error && s.count === 2 && s.width === 2 && s.height === 2,
       s.error || (s.count + ' frames ' + s.width + 'x' + s.height));
  var a = s.frame(0);
  S.ok('an LCW frame decodes', a && sameBytes(a, new Uint8Array([0x11, 0x11, 0x11, 0x11])),
       a ? Array.from(a).join(',') : 'null');
  var b2 = s.frame(1);
  S.ok('an XOR-chained frame decodes AGAINST its predecessor',
       b2 && b2[0] === (0x11 ^ 0x22) && b2[1] === 0x11,
       b2 ? Array.from(b2).join(',') : 'null');
  /* asking for frame 1 first must give the same answer - the chain has to be walked, not assumed */
  var s2 = shp.shpOpen(raw);
  var late = s2.frame(1);
  S.ok('...and gives the same answer when asked for out of order',
       late && sameBytes(late, b2), late ? Array.from(late).join(',') : 'null');
})();

(function () {
  var bad = shp.shpOpen(new Uint8Array([1, 2, 3]));
  S.ok('a truncated SHP is reported, not guessed at', !!bad.error, bad.error);
  var s = shp.shpOpen(new Uint8Array(64));
  S.ok('an all-zero buffer is not mistaken for a shape', !!s.error, s.error);
})();

(function () {
  /* palettes are 6-bit VGA and have to be expanded to 8, with 63 landing on 255 */
  var raw = new Uint8Array(768);
  raw[0] = 63; raw[1] = 0; raw[2] = 31;
  var p = shp.palOpen(raw);
  /* 63 -> 255 exactly, and 31 -> round(31*255/63) = 125. Writing 126 here by eyeballing "about
     half" is what failed first; the expansion is exact arithmetic, not an approximation. */
  S.ok('a palette expands 6-bit VGA to 8-bit', p && p[0] === 255 && p[1] === 0 && p[2] === 125,
       p ? p[0] + ',' + p[1] + ',' + p[2] : 'null');
  S.ok('a short palette is rejected', shp.palOpen(new Uint8Array(100)) === null);
})();

require('../lib/report.js')(S);
