/* Blowfish, which is what stands between the player's archives and being unreadable.

   Checked against Eric Young's published ECB vectors, in BOTH directions. Both directions is
   the point: an encryptor with its Feistel halves mirrored wrongly still reproduces every
   published ciphertext - the vectors only ever test one way - and then fails to invert its own
   output. That is exactly how the bug in the first draft here surfaced. */

var { Suite, sameBytes } = require('../lib/assert.js');
var bf = require('../../ra/blowfish.js');

var S = new Suite('blowfish');

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
  S.ok('Blowfish vector ' + v[0], hex === v[2], hex);
  var b = bf._bfDec(st, e[0], e[1]);
  var back = (b[0] >>> 0).toString(16).padStart(8, '0') + (b[1] >>> 0).toString(16).padStart(8, '0');
  S.ok('...and it inverts its own output', back === v[1], back);
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
  S.bytes('bfDecrypt round-trips whole blocks', got.subarray(0, 16), plain.subarray(0, 16));
  S.bytes('...and passes a trailing partial block through untouched',
          got.subarray(16), plain.subarray(16));
})();

(function () {
  /* The key recovery is deterministic and produces 56 bytes from 80. There is no vector to
     check it against without game data, so the assertions are shape and stability - the real
     proof is that four encrypted archives parse into sane file counts. */
  var block = new Uint8Array(80);
  for (var i = 0; i < 80; i++) block[i] = (i * 37 + 11) & 0xff;
  var k1 = bf.mixKeyFromBlock(block), k2 = bf.mixKeyFromBlock(block);
  S.ok('a Blowfish key comes back 56 bytes long', !!k1 && k1.length === 56, k1 ? k1.length : 'null');
  S.ok('...and the recovery is deterministic', sameBytes(k1, k2));
  var other = new Uint8Array(block); other[0] ^= 1;
  S.ok('...and depends on the block it was given', !sameBytes(k1, bf.mixKeyFromBlock(other)));
})();

require('../lib/report.js')(S);
