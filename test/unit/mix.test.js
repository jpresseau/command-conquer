/* MIX: the archive format everything else in ra/ is read out of.

   Archives are built here rather than fixtured, in both the TD and RA header forms, so a
   failure is about the reader and not about someone's disc. Three things are worth more than
   the happy path:

   The HASH, because it is the only index a MIX has - there are no names in the file. It is
   Calc_CRC (rol32 then add, remainder zero-padded), checked against the arithmetic rather than
   against a table.

   That a read is a VIEW, because the art in these archives runs to tens of megabytes and a
   reader that copies doubles that for no reason.

   And truncation, which has its own section at the bottom - the trap that made the game
   refuse to start. */

var { Suite, sameBytes } = require('../lib/assert.js');
var mix = require('../../ra/mix.js');

var S = new Suite('mix');

/* ------------------------------------------------------------------ hash ----
   Calc_CRC: rol32(crc,1) + dword, remainder zero-padded. Checked for the properties the
   archive actually relies on. */
(function () {
  S.ok('the hash is case-insensitive', mix.mixHash('conquer.mix') === mix.mixHash('CONQUER.MIX'));
  S.ok('...and distinguishes different names',
       mix.mixHash('TEMPERAT.PAL') !== mix.mixHash('SNOW.PAL'));
  /* worked by hand: "ABCD" is one dword 0x44434241, crc = rol32(0,1) + that */
  S.ok('a four-byte name folds to its own dword',
       (mix.mixHash('ABCD') >>> 0) === 0x44434241, '0x' + (mix.mixHash('ABCD') >>> 0).toString(16));
  /* "ABCDE" = dword("ABCD") then remainder "E\0\0\0" */
  var want = ((((0x44434241 << 1) | (0x44434241 >>> 31)) >>> 0) + 0x45) >>> 0;
  S.ok('a five-byte name folds the remainder zero-padded',
       (mix.mixHash('ABCDE') >>> 0) === want, '0x' + (mix.mixHash('ABCDE') >>> 0).toString(16));
  S.ok('the empty name is zero', mix.mixHash('') === 0);
})();

/* --------------------------------------------------------------- archives ----*/
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
  S.ok(tag + ': file count', m.count === 2, String(m.count));
  S.ok(tag + ': reads the first file by name', sameBytes(m.read('FIRST.SHP'), a));
  S.ok(tag + ': reads the second, at its own offset', sameBytes(m.read('SECOND.PAL'), b));
  S.ok(tag + ': is case-insensitive about names', sameBytes(m.read('first.shp'), a));
  S.ok(tag + ': a name that is not present returns null', m.read('NOPE.SHP') === null);
  S.ok(tag + ': has() agrees', m.has('FIRST.SHP') && !m.has('NOPE.SHP'));
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
  S.ok('a truncated encrypted archive fails loudly instead of throwing',
       !!m.error, m.error || 'no error reported');
})();

/* a view into a MIX must not copy - decoding 30 MB of art would otherwise double memory */
(function () {
  var a = new Uint8Array([7, 7, 7]);
  var raw = buildMix([{ name: 'X.SHP', data: a }], true);
  var m = mix.mixOpen(raw);
  var v = m.read('X.SHP');
  S.ok('a read is a view into the archive, not a copy', v.buffer === raw.buffer);
})();

/* ------------------------------------------------ a TRUNCATED archive ----
   The index sits at the FRONT of a MIX, so a file cut off part-way still parses perfectly: the
   header is intact, every record reads back, and `has()` used to answer yes for all of them.
   Then the first read past the cut threw `Invalid typed array length` out of `new Uint8Array` -
   inside sprite baking, inside rtsOpen - and the game would not start. The picker had already
   written the archive to IndexedDB, so it came back after every reload with nothing naming the
   cause. Losing the last 5% of conquer.mix was enough. */
(function () {
  /* build a real two-entry archive, then cut its tail off */
  function build(entries) {
    var body = [], recs = [], off = 0;
    entries.forEach(function (e) {
      recs.push({ id: mix.mixHash(e[0]), off: off, size: e[1].length });
      for (var i = 0; i < e[1].length; i++) body.push(e[1][i]);
      off += e[1].length;
    });
    var head = 6 + recs.length * 12;
    var b = new Uint8Array(head + body.length);
    var dv = new DataView(b.buffer);
    dv.setUint16(0, recs.length, true);
    dv.setUint32(2, body.length, true);
    recs.forEach(function (r, i) {
      dv.setInt32(6 + i * 12, r.id, true);
      dv.setUint32(6 + i * 12 + 4, r.off, true);
      dv.setUint32(6 + i * 12 + 8, r.size, true);
    });
    b.set(body, head);
    return b;
  }
  var full = build([['FIRST.MIX', new Uint8Array(64).fill(0x11)],
                    ['SECOND.MIX', new Uint8Array(64).fill(0x22)]]);
  var a = mix.mixOpen(full);
  S.ok('an intact archive opens and reads both entries',
       !a.error && a.count === 2 && a.read('FIRST.MIX').length === 64 && a.read('SECOND.MIX').length === 64);
  S.ok('...and reports itself complete', a.complete() === true);

  /* cut off the last 40 bytes: the index still describes a file that is no longer all there */
  var cut = full.subarray(0, full.length - 40);
  var t = mix.mixOpen(cut);
  S.ok('a truncated archive still parses - which is the whole trap',
       !t.error && t.count === 2, t.error || ('count ' + t.count));
  S.ok('...but it knows it is short', t.complete() === false);
  S.ok('...the entry that survived still reads', !!t.read('FIRST.MIX'));
  S.ok('...and the one past the cut reads as ABSENT rather than throwing',
       t.read('SECOND.MIX') === null && t.has('SECOND.MIX') === false);
  S.ok('...readId agrees with read', t.readId(mix.mixHash('SECOND.MIX')) === null);
  var threw = false;
  try { t.read('SECOND.MIX'); } catch (e) { threw = true; }
  S.ok('...and nothing throws on the way', !threw);
})();

require('../lib/report.js')(S);
