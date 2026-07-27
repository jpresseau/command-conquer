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


/* ------------------------------------------------------------ ZIP + map --
   .oramap is a zip holding map.bin and map.yaml, and both readers are built here from
   synthetic files so a failure names the bug rather than blaming someone's map. The real
   corpus - 140 published maps - is exercised by the survey harness, not by this file, which
   has to keep running with no assets present. */
var zip = require('./zip.js');
var ramap = require('./ramap.js');

/* Build a minimal, valid, STORED-entry zip. Stored rather than deflated so this test does not
   depend on a compressor being available. */
function mkzip(entries) {
  var enc = function (s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; };
  var locals = [], cen = [], off = 0;
  entries.forEach(function (e) {
    var nm = enc(e.name), d = Array.from(e.data);
    var loc = [0x50, 0x4b, 3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0,                                  /* crc (unchecked) */
               d.length & 255, (d.length >> 8) & 255, 0, 0,  /* csize */
               d.length & 255, (d.length >> 8) & 255, 0, 0,  /* usize */
               nm.length & 255, (nm.length >> 8) & 255, 0, 0].concat(nm, d);
    var c = [0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
             0, 0, 0, 0,
             d.length & 255, (d.length >> 8) & 255, 0, 0,
             d.length & 255, (d.length >> 8) & 255, 0, 0,
             nm.length & 255, (nm.length >> 8) & 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
             off & 255, (off >> 8) & 255, 0, 0].concat(nm);
    off += loc.length;
    locals = locals.concat(loc); cen.push(c);
  });
  var cflat = [].concat.apply([], cen), cdOff = locals.length;
  var eocd = [0x50, 0x4b, 5, 6, 0, 0, 0, 0,
              entries.length & 255, (entries.length >> 8) & 255,
              entries.length & 255, (entries.length >> 8) & 255,
              cflat.length & 255, (cflat.length >> 8) & 255, 0, 0,
              cdOff & 255, (cdOff >> 8) & 255, 0, 0, 0, 0];
  return new Uint8Array(locals.concat(cflat, eocd));
}

(function () {
  var z = zip.zipOpen(mkzip([{ name: 'map.bin', data: new Uint8Array([1, 2, 3]) },
                             { name: 'map.yaml', data: new Uint8Array([65, 66]) }]));
  ok('zipOpen reads the central directory', !z.error && z.count === 2, z.error || z.names.join(','));
  ok('...and finds entries case-insensitively', z.has('MAP.BIN') && z.has('map.yaml'));
  ok('...and reports a missing entry rather than throwing', !z.has('nope.txt'));
  z.read('map.bin').then(function (d) {
    ok('...and returns a stored entry byte-for-byte', !!d && eq(d, new Uint8Array([1, 2, 3])));
  });
})();

(function () {
  ok('a zip with no EOCD is rejected', !!zip.zipOpen(new Uint8Array(64)).error);
  ok('...and so is a runt', !!zip.zipOpen(new Uint8Array(4)).error);
})();

/* map.bin, format 2, 3x2, built by hand so the expected grid is known. */
function mkbin(w, h, fill) {
  var n = w * h, head = 17, body = new Uint8Array(head + n * 3 + n * 2);
  var dv = new DataView(body.buffer);
  body[0] = 2; dv.setUint16(1, w, true); dv.setUint16(3, h, true);
  dv.setUint32(5, head, true);                 /* tiles */
  dv.setUint32(9, 0, true);                    /* NO height layer - offset 0 means absent */
  dv.setUint32(13, head + n * 3, true);        /* resources */
  var p = head, x, y;
  for (x = 0; x < w; x++) for (y = 0; y < h; y++) {
    dv.setUint16(p, fill(x, y), true); body[p + 2] = (x + y) & 7; p += 3;
  }
  p = head + n * 3;
  for (x = 0; x < w; x++) for (y = 0; y < h; y++) { body[p] = (x === 1 ? 1 : 0); body[p + 1] = 9; p += 2; }
  return body;
}

(function () {
  var b = ramap.ramapBin(mkbin(3, 2, function (x, y) { return 100 + x * 10 + y; }));
  ok('ramapBin reads a format-2 header', !b.error && b.w === 3 && b.h === 2, b.error || '');
  /* the transpose is the whole point: on disk it is column-major, in memory row-major */
  ok('...and un-transposes the column-major cell order',
     b.tmpl[0 * 3 + 0] === 100 && b.tmpl[1 * 3 + 0] === 101 && b.tmpl[0 * 3 + 2] === 120,
     Array.from(b.tmpl).join(','));
  ok('...and reads the per-cell tile index', b.tidx[0] === 0 && b.tidx[1 * 3 + 2] === 3);
  ok('...and treats a zero height offset as "no height layer", not offset zero', b.height === null);
  ok('...and reads the resource layer', b.resType[0 * 3 + 1] === 1 && b.resDensity[0 * 3 + 1] === 9);
  ok('...and leaves non-resource cells empty', b.resType[0] === 0);
})();

(function () {
  ok('a truncated map.bin is rejected, not read past the end',
     !!ramap.ramapBin(mkbin(3, 2, function () { return 1; }).subarray(0, 20)).error);
  var bad = mkbin(2, 2, function () { return 1; }); bad[0] = 9;
  ok('...and so is an unknown format byte', !!ramap.ramapBin(bad).error);
})();

(function () {
  var y = ramap.ramapYaml([
    'MapFormat: 12', 'Title: Test Map', 'Author: Nobody', 'Tileset: TEMPERAT',
    'MapSize: 64,64', 'Bounds: 4,5,50,40', 'Actors:',
    '\tActor0: mpspawn', '\t\tOwner: Neutral', '\t\tLocation: 10,12',
    '\tActor1: mpspawn', '\t\tLocation: 40,38',
    '\tActor2: t01', '\t\tLocation: 20,20'
  ].join('\n'));
  ok('ramapYaml reads the header scalars', y.title === 'Test Map' && y.tileset === 'TEMPERAT' && y.w === 64);
  ok('...and the playable bounds', y.bounds.x === 4 && y.bounds.w === 50 && y.bounds.h === 40);
  ok('...and picks out only the spawn actors', y.spawns.length === 2, JSON.stringify(y.spawns));
  ok('...and reads their locations', y.spawns[0].x === 10 && y.spawns[1].y === 38);
  ok('...and still sees the non-spawn actors', y.actors.length === 3);
})();

(function () {
  /* space-indented rather than tab-indented: same map, written by a different editor */
  var y = ramap.ramapYaml('MapSize: 8,8\nActors:\n    Actor0: mpspawn\n        Location: 1,2\n');
  ok('ramapYaml handles space indentation as well as tabs', y.spawns.length === 1 && y.spawns[0].x === 1);
  var z = ramap.ramapYaml('MapSize: 8,8\n');
  ok('...and a map with no Bounds is playable edge to edge', z.bounds.w === 8 && z.bounds.h === 8);
})();

(function () {
  var tab = require('./tiletab.js').RA_TILETAB;
  ok('the tile table has the whole temperate tileset', Object.keys(tab).length > 300, Object.keys(tab).length);
  ok('...and clear ground is clear', tab[255] && tab[255].t === 'c');
  ok('...and open water is water', tab[1] && tab[1].t === 'w');
  var bad = Object.keys(tab).filter(function (k) { return tab[k].t.length !== tab[k].w * tab[k].h; });
  ok('...and every row has exactly w*h classes', bad.length === 0, bad.slice(0, 5).join(','));
  var chars = {};
  Object.keys(tab).forEach(function (k) { tab[k].t.split('').forEach(function (c) { chars[c] = 1; }); });
  ok('...and uses no class the terrain mapper does not know',
     Object.keys(chars).every(function (c) { return 'cwrkdbig-'.indexOf(c) >= 0; }), Object.keys(chars).join(''));
})();


/* ------------------------------------------------- RA's own scenario files --
   There is no real .MPR to hand, so one is BUILT here: a full 128x128 scenario, packed the
   way RA packs it, and read back. That means writing an LCW encoder, which the game does not
   need and so does not have - a literal-run-only encoder is enough, because the decoder does
   not care how well the stream was compressed, only that it is legal.

   Building the file rather than fixturing one is also the only way to test the part most
   likely to be wrong: the chunk header is a u32 whose low THREE bytes are the length, and the
   fourth byte is a format marker. Here that fourth byte is set to a non-zero value on purpose,
   because a reader that masks with 0xFFFFFFFF still passes every test where it happens to be
   zero - which, in real files, is most of them. */
var inimap = require('./inimap.js');

/* 10nnnnnn literal runs, then the 0x80 terminator. Legal LCW, terrible compression. */
function lcwLiteral(bytes) {
  var out = [], i = 0;
  while (i < bytes.length) {
    var n = Math.min(63, bytes.length - i);
    out.push(0x80 | n);
    for (var j = 0; j < n; j++) out.push(bytes[i + j]);
    i += n;
  }
  out.push(0x80);
  return new Uint8Array(out);
}

/* Pack a byte array into RA's chunked+base64 form, 8192 bytes per chunk. */
function raPack(bytes) {
  var chunks = [], at = 0;
  while (at < bytes.length) {
    var raw = bytes.subarray(at, at + 8192);
    var padded = new Uint8Array(8192); padded.set(raw);
    var enc = lcwLiteral(padded);
    var hdr = new Uint8Array(4);
    hdr[0] = enc.length & 0xff; hdr[1] = (enc.length >> 8) & 0xff; hdr[2] = (enc.length >> 16) & 0xff;
    hdr[3] = 0x20;                       /* the format marker the length must NOT include */
    chunks.push(hdr, enc);
    at += 8192;
  }
  var total = chunks.reduce(function (a, c) { return a + c.length; }, 0);
  var flat = new Uint8Array(total), o = 0;
  chunks.forEach(function (c) { flat.set(c, o); o += c.length; });
  var b64 = Buffer.from(flat).toString('base64');
  /* RA splits the base64 across numbered lines; the reader has to put them back in order. */
  var rows = [], line = 1;
  for (var i = 0; i < b64.length; i += 70) rows.push((line++) + '=' + b64.slice(i, i + 70));
  return rows;
}

(function () {
  var D = 128, n = D * D;
  /* terrain: template 255 (clear) everywhere, with a block of template 1 (water) */
  var pack = new Uint8Array(n * 3), pv = new DataView(pack.buffer);
  for (var i = 0; i < n; i++) { pv.setUint16(i * 2, 255, true); pack[n * 2 + i] = 0; }
  for (var y = 20; y < 30; y++) for (var x = 20; x < 30; x++) pv.setUint16((y * D + x) * 2, 1, true);
  /* overlay: gold at one cell, gems at another, a wall at a third, 0xFF elsewhere */
  var ovr = new Uint8Array(n); ovr.fill(0xff);
  ovr[40 * D + 40] = 5;      /* GOLD01 */
  ovr[41 * D + 41] = 10;     /* GEM02  */
  ovr[42 * D + 42] = 2;      /* BRIK wall */

  var text = [
    '[Basic]', 'Name=Test Scenario', 'Author=Nobody',
    '[Map]', 'Theater=TEMPERATE', 'X=8', 'Y=8', 'Width=100', 'Height=100',
    '[Waypoints]', '0=' + (60 * D + 20), '1=' + (60 * D + 100), '25=' + (5 * D + 5),
    '[TERRAIN]', (70 * D + 70) + '=T07', (71 * D + 71) + '=TC01',
    '[MapPack]'
  ].concat(raPack(pack), ['[OverlayPack]'], raPack(ovr)).join('\n');

  var m = inimap.inimapRead(text);
  ok('inimapRead unpacks [MapPack]', !m.error && m.w === 128 && m.h === 128, m.error || '');
  ok('...and reads the template grid', m.tmpl[0] === 255 && m.tmpl[25 * D + 25] === 1,
     m.tmpl ? (m.tmpl[0] + '/' + m.tmpl[25 * D + 25]) : 'none');
  ok('...and the tile indices follow the templates, not interleaved with them',
     m.tidx[0] === 0 && m.tidx[n - 1] === 0);
  ok('...and reads gold out of [OverlayPack]', m.resType[40 * D + 40] === 1);
  ok('...and gems', m.resType[41 * D + 41] === 2);
  ok('...and walls', m.resType[42 * D + 42] === 3);
  ok('...and leaves 0xFF cells empty', m.resType[0] === 0 && m.resType[99 * D + 99] === 0);
  ok('...and counts what it found', m.counts.ore === 1 && m.counts.gems === 1 && m.counts.walls === 1,
     JSON.stringify(m.counts));

  var meta = inimap.inimapMeta(text, 'scm01ea.mpr');
  ok('inimapMeta reads the playable rectangle', meta.bounds.x === 8 && meta.bounds.w === 100);
  ok('...and translates RA TEMPERATE to the tileset name used everywhere else',
     meta.tileset === 'TEMPERAT', meta.tileset);
  ok('...and takes waypoints 0-7 as the starts, ignoring the script ones',
     meta.spawns.length === 2, JSON.stringify(meta.spawns));
  ok('...and converts a cell number to x,y',
     meta.spawns[0].x === 20 && meta.spawns[0].y === 60, JSON.stringify(meta.spawns[0]));
  ok('...and picks the trees out of [TERRAIN]', meta.actors.length === 2 &&
     meta.actors[0].type === 't07' && meta.actors[0].x === 70);
  ok('...and reads the name', meta.title === 'Test Scenario' && meta.author === 'Nobody');
})();

(function () {
  ok('a file with no [MapPack] is refused', !!inimap.inimapRead('[Basic]\nName=x\n').error);
  ok('...and so is an empty one', !!inimap.inimapRead('').error);
  var ini = inimap.iniParse('[A]\nk=1\n[B]\nk=2\nk=3\n');
  ok('iniParse keeps repeated keys rather than collapsing them', ini.list('b').length === 2);
  ok('...and is case-insensitive about section and key names', ini.get('A', 'K') === '1');
  ok('...and keeps = inside a value', inimap.iniParse('[A]\nk=a=b\n').get('a', 'k') === 'a=b');
})();

(function () {
  /* A scenario whose [Map] rectangle is nonsense is far more likely to be a file that is not
     a scenario than a real map with bad numbers. */
  var t = '[Map]\nX=200\nY=0\nWidth=900\nHeight=4\n[MapPack]\n1=\n';
  var meta = inimap.inimapMeta(t, 'x');
  ok('a nonsense playable rectangle falls back to the whole board',
     meta.bounds.x === 0 && meta.bounds.w === 128, JSON.stringify(meta.bounds));
})();


/* ------------------------------------------------- the editor's save path --
   A map the editor writes must be read back by the SAME reader that opens a scenario lifted
   out of MAIN.MIX - there is no second path for maps this game made itself. So the test is a
   round trip, not a check of the bytes: build a grid, write it, read it, and require the grid
   that comes back to be identical. */
(function () {
  var enc = lcw.lcwCompress;
  /* the compressor must survive the shapes a map actually contains */
  [[], [7], [7, 7, 7], [1, 2, 3, 4, 5],
   new Array(300).fill(9),
   new Array(200).fill(0).map(function (_, i) { return i & 0xff; })
  ].forEach(function (arr, k) {
    var src = Uint8Array.from(arr), out = new Uint8Array(src.length);
    enc(src);
    lcw.lcwDecompress(enc(src), 0, out);
    ok('lcwCompress round-trips case ' + k + ' (' + src.length + ' bytes)', eq(out, src));
  });
  var big = new Uint8Array(8192);
  for (var i = 0; i < 8192; i++) big[i] = (i < 6000) ? 255 : (i * 7) & 0xff;
  var back = new Uint8Array(8192);
  var packed = enc(big);
  lcw.lcwDecompress(packed, 0, back);
  ok('...and a full 8192-byte chunk', eq(back, big),
     packed.length + ' bytes out of 8192');
  ok('...compressing a long run actually shrinks it', packed.length < 8192, packed.length);
})();

(function () {
  var D = inimap.RA_INI_DIM, n = D * D, i;
  var tmpl = new Uint16Array(n), tidx = new Uint8Array(n), res = new Uint8Array(n);
  for (i = 0; i < n; i++) { tmpl[i] = 255; tidx[i] = 0; }
  /* a 2x2 water-cliff block, some ore, some gems, a wall */
  var put = function (x, y, id, ti) { tmpl[y * D + x] = id; tidx[y * D + x] = ti; };
  put(10, 10, 59, 0); put(11, 10, 59, 1); put(10, 11, 59, 2); put(11, 11, 59, 3);
  put(40, 40, 1, 0);                                   /* open water */
  res[50 * D + 50] = 1; res[51 * D + 51] = 2; res[52 * D + 52] = 3;

  var text = inimap.inimapWrite(
    { tmpl: tmpl, tidx: tidx, resType: res },
    { title: 'Editor Test', author: 'RC Command',
      bounds: { x: 4, y: 6, w: 100, h: 90 },
      spawns: [{ x: 20, y: 30 }, { x: 90, y: 80 }],
      trees: [{ x: 70, y: 70, type: 't05' }] });

  var b = inimap.inimapRead(text);
  ok('a written scenario reads back', !b.error, b.error || '');
  var same = true, firstBad = -1;
  for (i = 0; i < n; i++) {
    if (b.tmpl[i] !== tmpl[i] || b.tidx[i] !== tidx[i]) { same = false; firstBad = i; break; }
  }
  ok('...with an identical terrain grid', same,
     same ? '' : 'first mismatch at cell ' + firstBad);
  ok('...and the multi-tile block intact',
     b.tmpl[10 * D + 10] === 59 && b.tidx[11 * D + 11] === 3);
  ok('...and the ore, gems and wall in the right cells',
     b.resType[50 * D + 50] === 1 && b.resType[51 * D + 51] === 2 && b.resType[52 * D + 52] === 3);
  ok('...and nothing else marked', b.counts.ore === 1 && b.counts.gems === 1 && b.counts.walls === 1,
     JSON.stringify(b.counts));

  var m = inimap.inimapMeta(text, 'test.ini');
  ok('...and the metadata survives', m.title === 'Editor Test' && m.author === 'RC Command');
  ok('...and the bounds', m.bounds.x === 4 && m.bounds.y === 6 && m.bounds.w === 100);
  ok('...and both spawns, as x,y', m.spawns.length === 2 &&
     m.spawns[0].x === 20 && m.spawns[0].y === 30 && m.spawns[1].x === 90);
  ok('...and the tree', m.actors.length === 1 && m.actors[0].type === 't05' && m.actors[0].y === 70);
  ok('...and it says it is temperate', m.tileset === 'TEMPERAT');
})();

(function () {
  /* An empty board is the state the editor starts in, and saving it must not produce a file
     that the reader then rejects - "new map, save, reload" is the first thing anyone does. */
  var D = inimap.RA_INI_DIM, n = D * D;
  var tmpl = new Uint16Array(n).fill(255), tidx = new Uint8Array(n);
  var text = inimap.inimapWrite({ tmpl: tmpl, tidx: tidx, resType: new Uint8Array(n) },
                                { title: 'Blank' });
  var b = inimap.inimapRead(text);
  ok('a blank board saves and reloads', !b.error && b.tmpl[0] === 255 && b.tmpl[n - 1] === 255,
     b.error || '');
  ok('...with no ore anywhere', b.counts.ore === 0 && b.counts.gems === 0);
})();


/* ----------------------------------------------------------------- AUD --
   RA stores every sound and every music track as AUD. The player's own archives are all IMA
   (compression 99) at 22050 Hz, so the Westwood codec (compression 1) has no real file to be
   checked against - it is exercised here with hand-built streams instead, one per op-code,
   the same way LCW was.

   The property both codecs share and both can get wrong: the running sample carries ACROSS
   chunk boundaries. A decoder that resets it per chunk still produces audio of the right
   length, and clicks every 512 samples. */
var aud = require('./aud.js');

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

(function () {
  /* IMA: nibble 0 with index 0 is a step of 7>>3 = 0, so a run of zero nibbles must stay put.
     Nibble 8 is the same magnitude negative. */
  var a = aud.audOpen(mkAud(99, 22050, [{ data: [0x00, 0x00], out: 8 }]));
  ok('audOpen reads an IMA header', !a.error && a.rate === 22050 && a.channels === 1, a.error || '');
  ok('...and produces two samples per byte', a.samples.length === 4, a.samples && a.samples.length);
  ok('...and a zero nibble barely moves the signal', Math.abs(a.samples[0]) < 0.001);

  /* A rising staircase: nibble 7 is the largest positive step at any index. */
  var b = aud.audOpen(mkAud(99, 22050, [{ data: [0x77, 0x77, 0x77, 0x77], out: 16 }]));
  var s = b.samples, rising = true;
  for (var i = 1; i < s.length; i++) if (s[i] <= s[i - 1]) rising = false;
  ok('...and a run of maximum nibbles climbs monotonically', rising, Array.from(s).map(function (v) { return v.toFixed(3); }).join(' '));
  ok('...and stays inside -1..1', s.every(function (v) { return v >= -1 && v <= 1; }));
})();

(function () {
  /* THE state test. Two chunks of identical rising data: if the decoder resets between them,
     the second chunk restarts from zero and the seam is a cliff. If it carries, the second
     chunk continues climbing from where the first left off. */
  var one = { data: [0x77, 0x77, 0x77, 0x77], out: 16 };
  var two = aud.audOpen(mkAud(99, 22050, [one, { data: one.data.slice(), out: 16 }]));
  var s = two.samples, mid = 8;
  ok('IMA state carries across a chunk boundary - no click at the seam',
     s[mid] > s[mid - 1], s[mid - 1].toFixed(3) + ' -> ' + s[mid].toFixed(3));
  ok('...and the second chunk continues the climb rather than restarting',
     s[s.length - 1] > s[mid - 1], s[s.length - 1].toFixed(3));
})();

(function () {
  /* Westwood ADPCM, one op-code at a time. Output is 8-bit centred on 128, so silence is 0.0
     and the starting sample is the centre. */
  /* mode 3 (0xC0 | n): hold the current sample n+1 times */
  var hold = aud.audOpen(mkAud(1, 22050, [{ data: [0xc0 | 3], out: 4 }]));
  ok('WS hold repeats the current sample', !hold.error && hold.samples.length === 4 &&
     hold.samples.every(function (v) { return v === 0; }), hold.error || Array.from(hold.samples).join(','));

  /* mode 2 with bit 5 clear: a literal run of n+1 raw bytes */
  var lit = aud.audOpen(mkAud(1, 22050, [{ data: [0x80 | 2, 0, 128, 255], out: 3 }]));
  ok('WS literal run passes bytes straight through',
     !lit.error && Math.abs(lit.samples[0] + 1) < 0.01 && lit.samples[1] === 0 &&
     Math.abs(lit.samples[2] - 0.9922) < 0.01,
     lit.error || Array.from(lit.samples).map(function (v) { return v.toFixed(3); }).join(' '));

  /* mode 2 with bit 5 set: one 5-bit signed delta carried in the count itself */
  var d = aud.audOpen(mkAud(1, 22050, [{ data: [0x80 | 0x20 | 4], out: 1 }]));
  ok('WS inline delta moves the sample by the low five bits',
     !d.error && Math.abs(d.samples[0] - 4 / 128) < 0.001, d.error || d.samples[0]);
  var dn = aud.audOpen(mkAud(1, 22050, [{ data: [0x80 | 0x20 | 0x1c], out: 1 }]));
  ok('...and sign-extends a negative one', !dn.error && dn.samples[0] < 0, dn.samples && dn.samples[0]);

  /* mode 1: two 4-bit deltas per byte, table value 8 is +1 and 0 is -9 */
  var q = aud.audOpen(mkAud(1, 22050, [{ data: [0x40 | 0, 0x88], out: 2 }]));
  ok('WS 4-bit deltas decode two samples per byte',
     !q.error && q.samples.length === 2 && q.samples[0] === 0 && q.samples[1] === 0,
     q.error || Array.from(q.samples).join(','));

  /* mode 0: four 2-bit deltas per byte, table [-2,-1,0,1] */
  var t = aud.audOpen(mkAud(1, 22050, [{ data: [0x00, 0xff], out: 4 }]));
  ok('WS 2-bit deltas decode four samples per byte',
     !t.error && t.samples.length === 4 && t.samples[3] > t.samples[0],
     t.error || Array.from(t.samples).map(function (v) { return v.toFixed(3); }).join(' '));
})();

(function () {
  ok('an AUD with an unknown codec is refused', !!aud.audOpen(mkAud(7, 22050, [])).error);
  ok('...and a runt', !!aud.audOpen(new Uint8Array(6)).error);
  ok('...and one whose chunk magic is wrong stops rather than reading noise', (function () {
    var a = mkAud(99, 22050, [{ data: [0x77, 0x77], out: 8 }]);
    a[16] = 0;                                  /* break the 0x0000DEAF marker */
    return !!aud.audOpen(a).error;
  })());
  var st = aud.audOpen(mkAud(99, 11025, [{ data: [0x11, 0x22], out: 8 }], 1));
  ok('...and the stereo flag is reported', !st.error && st.channels === 2 && st.rate === 11025);
})();

console.log("--- " + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

