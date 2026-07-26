/* Tests for the MIX/LCW readers, run with plain node - no browser, no assets.

   The point of this file is that the decoders can be proven correct BEFORE any game data
   exists, by building the compressed streams and archives here and reading them back. When
   real MIX files do arrive, a failure will be about the data rather than about the code. */
var lcw = require('./lcw.js');
var mix = require('./mix.js');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); }
}
function eq(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ---------------------------------------------------------------- LCW ----
   Hand-built streams, one per op-code, so a broken branch is named rather than showing up
   as "the image looks wrong". */

/* 10nnnnnn - medium copy straight from the source */
(function () {
  var src = new Uint8Array([0x83, 11, 22, 33, 0x80]);
  var out = new Uint8Array(3);
  var n = lcw.lcwDecompress(src, 0, out);
  ok('LCW literal run', n === 3 && eq(out, new Uint8Array([11, 22, 33])), Array.from(out).join(','));
})();

/* 11111110 - long run of a single byte */
(function () {
  var src = new Uint8Array([0xfe, 5, 0, 0x77, 0x80]);
  var out = new Uint8Array(5);
  lcw.lcwDecompress(src, 0, out);
  ok('LCW long run', eq(out, new Uint8Array([0x77, 0x77, 0x77, 0x77, 0x77])));
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
  ok('LCW overlapping back-reference expands a run',
     eq(out, new Uint8Array([0xAB, 0xAB, 0xAB, 0xAB, 0xAB])), Array.from(out).join(','));
})();

/* 11nnnnnn - medium copy from destination, ABSOLUTE offset */
(function () {
  var src = new Uint8Array([0x84, 1, 2, 3, 4, 0xC0, 0x00, 0x00, 0x80]);
  var out = new Uint8Array(7);
  lcw.lcwDecompress(src, 0, out);
  ok('LCW absolute mid copy', eq(out, new Uint8Array([1, 2, 3, 4, 1, 2, 3])), Array.from(out).join(','));
})();

/* 11111111 - long copy from destination, ABSOLUTE offset */
(function () {
  var src = new Uint8Array([0x84, 9, 8, 7, 6, 0xff, 4, 0, 1, 0, 0x80]);
  var out = new Uint8Array(8);
  lcw.lcwDecompress(src, 0, out);
  ok('LCW absolute long copy', eq(out, new Uint8Array([9, 8, 7, 6, 8, 7, 6, 8])), Array.from(out).join(','));
})();

/* 10000000 - end of stream, and a truncated stream must stop rather than run away */
(function () {
  var out = new Uint8Array(4);
  var n = lcw.lcwDecompress(new Uint8Array([0x80]), 0, out);
  ok('LCW end marker stops at zero bytes', n === 0);
  var out2 = new Uint8Array(4);
  var n2 = lcw.lcwDecompress(new Uint8Array([0x82, 5]), 0, out2);   /* claims 2, supplies 1 */
  ok('a truncated stream returns instead of overrunning', n2 <= 4, n2 + ' bytes');
})();

/* the destination is never written past its end */
(function () {
  var src = new Uint8Array([0xfe, 0xff, 0xff, 0x5a, 0x80]);          /* 65535-byte run */
  var out = new Uint8Array(16);
  var n = lcw.lcwDecompress(src, 0, out);
  ok('a run longer than the buffer is clamped', n === 16 && out[15] === 0x5a, n + ' bytes');
})();

/* ------------------------------------------------------------ XOR delta ----*/
(function () {
  var base = new Uint8Array([1, 1, 1, 1, 1, 1]);
  /* skip 2, XOR two literal bytes, then end */
  var d = new Uint8Array([0x82, 0x02, 0x03, 0x03, 0x80, 0x00, 0x00]);
  lcw.xorDelta(d, 0, base);
  ok('XOR delta skips and applies', eq(base, new Uint8Array([1, 1, 2, 2, 1, 1])),
     Array.from(base).join(','));
})();

/* ---------------------------------------------------------------- hash ----
   Calc_CRC: rol32(crc,1) + dword, remainder zero-padded. Verified against the arithmetic
   rather than against a table, and checked for the properties the archive relies on. */
(function () {
  ok('the hash is case-insensitive', mix.mixHash('conquer.mix') === mix.mixHash('CONQUER.MIX'));
  ok('...and distinguishes different names',
     mix.mixHash('TEMPERAT.PAL') !== mix.mixHash('SNOW.PAL'));
  /* worked by hand: "ABCD" is one dword 0x44434241, crc = rol32(0,1) + that */
  ok('a four-byte name folds to its own dword',
     (mix.mixHash('ABCD') >>> 0) === 0x44434241, '0x' + (mix.mixHash('ABCD') >>> 0).toString(16));
  /* "ABCDE" = dword("ABCD") then remainder "E\0\0\0" */
  var want = ((((0x44434241 << 1) | (0x44434241 >>> 31)) >>> 0) + 0x45) >>> 0;
  ok('a five-byte name folds the remainder zero-padded',
     (mix.mixHash('ABCDE') >>> 0) === want, '0x' + (mix.mixHash('ABCDE') >>> 0).toString(16));
  ok('the empty name is zero', mix.mixHash('') === 0);
})();

/* ---------------------------------------------------------------- MIX ----
   Build an archive by hand and read it back, in both the TD and RA header forms. */
function buildMix(entries, withFlags) {
  var bodies = entries.map(function (e) { return e.data; });
  var bodySize = bodies.reduce(function (a, b) { return a + b.length; }, 0);
  var head = (withFlags ? 4 : 0) + 2 + 4 + entries.length * 12;
  var buf = new Uint8Array(head + bodySize);
  var dv = new DataView(buf.buffer);
  var p = 0;
  if (withFlags) { dv.setUint32(0, 0x00010000, true); p = 4; }      /* checksum flag, not encrypted */
  dv.setUint16(p, entries.length, true); p += 2;
  dv.setUint32(p, bodySize, true); p += 4;
  var off = 0;
  entries.forEach(function (e) {
    dv.setInt32(p, mix.mixHash(e.name), true);
    dv.setUint32(p + 4, off, true);
    dv.setUint32(p + 8, e.data.length, true);
    p += 12; off += e.data.length;
  });
  var w = head;
  bodies.forEach(function (b) { buf.set(b, w); w += b.length; });
  return buf;
}

[false, true].forEach(function (withFlags) {
  var tag = withFlags ? 'RA header' : 'TD header';
  var a = new Uint8Array([1, 2, 3, 4, 5]);
  var b = new Uint8Array([9, 9, 9]);
  var m = mix.mixOpen(buildMix([{ name: 'FIRST.SHP', data: a }, { name: 'SECOND.PAL', data: b }], withFlags));
  ok(tag + ': file count', m.count === 2, String(m.count));
  ok(tag + ': reads the first file by name', eq(m.read('FIRST.SHP'), a));
  ok(tag + ': reads the second, at its own offset', eq(m.read('SECOND.PAL'), b));
  ok(tag + ': is case-insensitive about names', eq(m.read('first.shp'), a));
  ok(tag + ': a name that is not present returns null', m.read('NOPE.SHP') === null);
  ok(tag + ': has() agrees', m.has('FIRST.SHP') && !m.has('NOPE.SHP'));
});

/* an encrypted index must be reported, not silently misread as noise */
(function () {
  /* This assertion predates the decryption support by a long way - back then it checked that an
     encrypted archive was REFUSED rather than misread as noise. It still earns its place: the
     day decryption landed, this 64-byte stub walked off the end of its own key block and took
     the reader down with a BigInt error. A malformed archive has to fail, not throw. */
  var buf = new Uint8Array(64);
  new DataView(buf.buffer).setUint32(0, 0x00020000, true);
  var m = mix.mixOpen(buf);
  ok('a truncated encrypted archive fails loudly instead of throwing',
     !!m.error, m.error || 'no error reported');
})();

/* a view into a MIX must not copy - decoding 30 MB of art would otherwise double memory */
(function () {
  var a = new Uint8Array([7, 7, 7]);
  var raw = buildMix([{ name: 'X.SHP', data: a }], true);
  var m = mix.mixOpen(raw);
  var v = m.read('X.SHP');
  ok('a read is a view into the archive, not a copy', v.buffer === raw.buffer);
})();


/* ------------------------------------------------------------------ SHP ----
   Built the same way as the LCW tests: hand-assemble a shape, read it back. This proves the
   frame-chain logic without any game data, which matters because two of the three frame formats
   are DELTAS - decoding frame N can require decoding every frame before it, and a reader that
   quietly returns zeroes for those looks fine on frame 0 and produces garbage for the other 31. */
var shp = require('./shp.js');

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
     what the XOR-delta test further up already demonstrates with `82 02 03 03`: skip 2, then
     XOR 2. Getting that backwards made this assertion fail against a decoder that was right. */
  var f1 = new Uint8Array([0x01, 0x22, 0x80, 0x00, 0x00]);   /* xor 1 byte with 0x22, then end */
  var raw = buildShp(2, 2, [{ fmt: 0x80, data: f0 }, { fmt: 0x20, data: f1 }]);
  var s = shp.shpOpen(raw);
  ok('SHP header parses', !s.error && s.count === 2 && s.width === 2 && s.height === 2,
     s.error || (s.count + ' frames ' + s.width + 'x' + s.height));
  var a = s.frame(0);
  ok('an LCW frame decodes', a && eq(a, new Uint8Array([0x11, 0x11, 0x11, 0x11])),
     a ? Array.from(a).join(',') : 'null');
  var b2 = s.frame(1);
  ok('an XOR-chained frame decodes AGAINST its predecessor',
     b2 && b2[0] === (0x11 ^ 0x22) && b2[1] === 0x11,
     b2 ? Array.from(b2).join(',') : 'null');
  /* asking for frame 1 first must give the same answer - the chain has to be walked, not assumed */
  var s2 = shp.shpOpen(raw);
  var late = s2.frame(1);
  ok('...and gives the same answer when asked for out of order',
     late && eq(late, b2), late ? Array.from(late).join(',') : 'null');
})();

(function () {
  var bad = shp.shpOpen(new Uint8Array([1, 2, 3]));
  ok('a truncated SHP is reported, not guessed at', !!bad.error, bad.error);
  var s = shp.shpOpen(new Uint8Array(64));
  ok('an all-zero buffer is not mistaken for a shape', !!s.error, s.error);
})();

(function () {
  /* palettes are 6-bit VGA and have to be expanded to 8, with 63 landing on 255 */
  var raw = new Uint8Array(768);
  raw[0] = 63; raw[1] = 0; raw[2] = 31;
  var p = shp.palOpen(raw);
  /* 63 -> 255 exactly, and 31 -> round(31*255/63) = 125. Writing 126 here by eyeballing "about
     half" is what failed first; the expansion is exact arithmetic, not an approximation. */
  ok('a palette expands 6-bit VGA to 8-bit', p && p[0] === 255 && p[1] === 0 && p[2] === 125,
     p ? p[0] + ',' + p[1] + ',' + p[2] : 'null');
  ok('a short palette is rejected', shp.palOpen(new Uint8Array(100)) === null);
})();



/* ----------------------------------------------------------- Blowfish ----
   Checked against Eric Young's published ECB vectors, in BOTH directions. Both directions is
   the point: an encryptor with its Feistel halves mirrored wrongly still reproduces every
   published ciphertext - the vectors only ever test one way - and then fails to invert its own
   output. That is exactly how the bug in the first draft here surfaced. */
var bf = require('./blowfish.js');

function hx(s) {
  var a = new Uint8Array(s.length / 2);
  for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16);
  return a;
}
[['0000000000000000', '0000000000000000', '4ef997456198dd78'],
 ['ffffffffffffffff', 'ffffffffffffffff', '51866fd5b85ecb8a'],
 ['3000000000000000', '1000000000000001', '7d856f9a613063f2'],
 ['0123456789abcdef', '1111111111111111', '61f9c3802281b096'],
 ['fedcba9876543210', '0123456789abcdef', '0aceab0fc6a0a28d'],
 ['7ca110454a1a6e57', '01a1d6d039776742', '59c68245eb05282b']].forEach(function (v) {
  var st = bf.bfInit(hx(v[0])), pt = hx(v[1]), d = new DataView(pt.buffer);
  var e = bf._bfEnc(st, d.getUint32(0, false), d.getUint32(4, false));
  var hex = (e[0] >>> 0).toString(16).padStart(8, '0') + (e[1] >>> 0).toString(16).padStart(8, '0');
  ok('Blowfish vector ' + v[0], hex === v[2], hex);
  var b = bf._bfDec(st, e[0], e[1]);
  var back = (b[0] >>> 0).toString(16).padStart(8, '0') + (b[1] >>> 0).toString(16).padStart(8, '0');
  ok('...and it inverts its own output', back === v[1], back);
});

(function () {
  /* ECB over a buffer: whole blocks only, and a trailing partial block is passed through - the
     archives rely on that, because the body after the index is not encrypted. */
  var st = bf.bfInit(hx('0123456789abcdef'));
  var plain = new Uint8Array(20);
  for (var i = 0; i < 20; i++) plain[i] = i * 7;
  /* encrypt the two whole blocks by hand, leave the last four bytes alone */
  var enc = new Uint8Array(plain), ev = new DataView(enc.buffer);
  var pv = new DataView(plain.buffer);
  for (var o = 0; o < 16; o += 8) {
    var c = bf._bfEnc(st, pv.getUint32(o, false), pv.getUint32(o + 4, false));
    ev.setUint32(o, c[0], false); ev.setUint32(o + 4, c[1], false);
  }
  var got = bf.bfDecrypt(st, enc, 0, 20);
  ok('bfDecrypt round-trips whole blocks', eq(got.subarray(0, 16), plain.subarray(0, 16)));
  ok('...and passes a trailing partial block through untouched',
     eq(got.subarray(16), plain.subarray(16)));
})();

(function () {
  /* The key recovery is deterministic and produces 56 bytes from 80. There is no vector to
     check it against without game data, so the assertions are shape and stability - the real
     proof is that four encrypted archives parse into sane file counts. */
  var block = new Uint8Array(80);
  for (var i = 0; i < 80; i++) block[i] = (i * 37 + 11) & 0xff;
  var k1 = bf.mixKeyFromBlock(block), k2 = bf.mixKeyFromBlock(block);
  ok('a Blowfish key comes back 56 bytes long', !!k1 && k1.length === 56, k1 ? k1.length : 'null');
  ok('...and the recovery is deterministic', eq(k1, k2));
  var other = new Uint8Array(block); other[0] ^= 1;
  ok('...and depends on the block it was given', !eq(k1, bf.mixKeyFromBlock(other)));
})();

console.log("--- " + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

