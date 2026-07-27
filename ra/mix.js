/* MIX archive reader. Every asset Red Alert ships lives inside one of these.

   Layout, from TOOLS/MIX/MIXFILE.CPP:

     [optional 4-byte flags]   present only if the first uint16 is 0 (the RA extension).
                               0x00010000 = the archive carries a checksum
                               0x00020000 = the index is Blowfish-encrypted
     uint16  count             number of files
     uint32  dataSize          total size of the body
     count x { int32 id; uint32 offset; uint32 size }
     body

   `offset` is relative to the start of the body, not the file.

   The index holds no NAMES - only a hash. To find a file you hash the name you want and
   look for that id, which is why an archive can be read without ever knowing what is in it,
   and why a name that hashes to nothing simply is not there. */

/* Calc_CRC, exactly as MIXFILE.CPP computes it: fold the name four bytes at a time as
   little-endian dwords, `crc = rol32(crc, 1) + dword`, with any remainder zero-padded to
   four bytes.

   The loop bound is `size > 4`, NOT `size >= 4` - so a name whose length is an exact
   multiple of four still processes its final four bytes through the remainder path. It is
   the same arithmetic either way, but the distinction matters if you ever reimplement this
   from the description rather than from the code. */
function mixHash(name) {
  var s = String(name).toUpperCase();
  var bytes = [];
  for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);

  var crc = 0, size = bytes.length, p = 0;
  var rol1 = function (v) { return (((v << 1) | (v >>> 31)) >>> 0); };
  var dword = function (o) {
    return ((bytes[o] | 0) | ((bytes[o + 1] | 0) << 8)
          | ((bytes[o + 2] | 0) << 16) | ((bytes[o + 3] | 0) << 24)) >>> 0;
  };
  while (size > 4) { crc = (rol1(crc) + dword(p)) >>> 0; p += 4; size -= 4; }
  if (size) {
    var last = 0;
    for (var k = 0; k < size; k++) last |= (bytes[p + k] | 0) << (k * 8);
    crc = (rol1(crc) + (last >>> 0)) >>> 0;
  }
  return crc | 0;                                  /* the index stores it signed */
}

function mixOpen(buf) {
  var dv = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
  var p = 0, flags = 0;

  /* The RA extension: a leading uint16 of 0 means a flags dword follows. A TD-era archive
     starts straight in with the file count, which is never 0 in practice. */
  if (dv.getUint16(0, true) === 0) { flags = dv.getUint32(0, true); p = 4; }

  /* An encrypted archive carries an 80-byte key block right after the flags, then its index
     Blowfish-encrypted in 8-byte blocks; the BODY after the index is in the clear. So the
     index is lifted out, decrypted into a scratch buffer and parsed from there, while every
     file read still points straight into the original bytes. */
  var encrypted = !!(flags & 0x00020000);
  var idx = null, idxAt = 0, bodyAt;

  if (encrypted) {
    var bf = (typeof require !== 'undefined') ? require('./blowfish.js') : window.RA_BLOWFISH;
    if (p + 80 > buf.length) {
      return { error: 'encrypted, but too short to hold a key block', flags: flags, files: [] };
    }
    var key = bf.mixKeyFromBlock(buf.subarray(p, p + 80));
    if (!key) return { error: 'could not recover the Blowfish key', flags: flags, files: [] };
    var st = bf.bfInit(key);
    var encAt = p + 80;
    /* Decrypt one block first: it holds the count, and the count decides how much more of the
       index there is to decrypt. Reading the whole rest of the file would work but a 3.8 MB
       archive does not need 480,000 needless block operations. */
    var first = bf.bfDecrypt(st, buf, encAt, 8);
    var fdv = new DataView(first.buffer);
    var n = fdv.getUint16(0, true);
    var idxBytes = 6 + n * 12;
    var blocks = Math.ceil(idxBytes / 8) * 8;
    if (encAt + blocks > buf.length) {
      return { error: 'encrypted index runs past the end of the file', flags: flags, files: [] };
    }
    idx = bf.bfDecrypt(st, buf, encAt, blocks);
    idxAt = 0;
    bodyAt = encAt + blocks;
  }

  var hdv = encrypted ? new DataView(idx.buffer, idx.byteOffset, idx.byteLength) : dv;
  var q = encrypted ? idxAt : p;
  var count = hdv.getUint16(q, true); q += 2;
  var dataSize = hdv.getUint32(q, true); q += 4;
  var index = {}, list = [];
  if (!encrypted) bodyAt = q + count * 12;

  for (var i = 0; i < count; i++) {
    var id = hdv.getInt32(q, true);
    var off = hdv.getUint32(q + 4, true);
    var len = hdv.getUint32(q + 8, true);
    q += 12;
    var rec = { id: id, offset: bodyAt + off, size: len };
    index[id] = rec; list.push(rec);
  }
  return {
    flags: flags, count: count, dataSize: dataSize, files: list,
    /* Look a file up by name. Returns a view into the original buffer - no copy. */
    read: function (name) {
      var rec = index[mixHash(name)];
      if (!rec) return null;
      return new Uint8Array(buf.buffer || buf, (buf.byteOffset || 0) + rec.offset, rec.size);
    },
    has: function (name) { return !!index[mixHash(name)]; },
    byId: function (id) { return index[id | 0] || null; },
    /* Read an entry by its INDEX RECORD rather than by name. A MIX has no directory, so a
       caller that already knows an entry's hash - from a table built by identifying the
       contents - has no name to offer, and hashing one back is not possible. */
    readRec: function (rec) {
      if (!rec || rec.offset + rec.size > (buf.byteLength + (buf.byteOffset || 0))) return null;
      return new Uint8Array(buf.buffer || buf, (buf.byteOffset || 0) + rec.offset, rec.size);
    },
    /* Bytes for a hash, in one step - the common case. */
    readId: function (id) {
      var rec = index[id | 0];
      if (!rec) return null;
      return new Uint8Array(buf.buffer || buf, (buf.byteOffset || 0) + rec.offset, rec.size);
    }
  };
}

/* dual-mode: a CommonJS module for the test suite, a plain global for the browser
   bundle, which has no loader at all and never will. */
var _exp = { mixHash: mixHash, mixOpen: mixOpen };
if (typeof module !== 'undefined' && module.exports) module.exports = _exp;
else if (typeof window !== 'undefined') window.RA_MIX = _exp;
