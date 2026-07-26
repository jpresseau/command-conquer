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

  var encrypted = !!(flags & 0x00020000);
  if (encrypted) {
    /* Blowfish-encrypted index. Not implemented: the archives that matter for artwork
       (CONQUER, TEMPERAT, and the theatre files) are not encrypted, and pretending to read
       one would produce a plausible-looking index of pure noise. Fail loudly instead. */
    return { error: 'encrypted index (Blowfish) - not supported', flags: flags, files: [] };
  }

  var count = dv.getUint16(p, true); p += 2;
  var dataSize = dv.getUint32(p, true); p += 4;
  var index = {}, list = [];
  var bodyAt = p + count * 12;

  for (var i = 0; i < count; i++) {
    var id = dv.getInt32(p, true);
    var off = dv.getUint32(p + 4, true);
    var len = dv.getUint32(p + 8, true);
    p += 12;
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
    byId: function (id) { return index[id | 0] || null; }
  };
}

if (typeof module !== 'undefined') module.exports = { mixHash: mixHash, mixOpen: mixOpen };
