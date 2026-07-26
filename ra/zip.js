/* The smallest ZIP reader that can open an .oramap.

   An .oramap is a plain zip holding map.bin (the terrain), map.yaml (everything else) and a
   preview png. Reading it needs the central directory and one decompressor, and nothing else -
   no encryption, no spanning, no zip64, because map files are a few kilobytes.

   The decompressor is the interesting part. Deflate is a lot of code to write and every
   browser already ships one, so this does not write it: `DecompressionStream('deflate-raw')`
   is the whole implementation, and node's zlib stands in for it under test. That is also why
   `zipRead` is async - the browser's inflate is a stream, and there is no synchronous way to
   drain it.

   A zip is read from the BACK. The central directory is authoritative and lives at the end,
   after the file data, because the format was designed to be written to tape in one pass
   without knowing the sizes up front. Reading the local headers front-to-back instead is the
   classic mistake: their sizes may be zeroed with the real values in a trailing descriptor. */

var _EOCD = 0x06054b50, _CEN = 0x02014b50, _LOC = 0x04034b50;

/* Find the end-of-central-directory record. It is 22 bytes plus a comment of up to 65535, so
   the only way to locate it is to scan backwards for the signature. Scanning back rather than
   forward matters: a stored file can contain the signature bytes as data. */
function _zipEOCD(dv, len) {
  var max = Math.min(len, 22 + 0xffff);
  for (var i = 22; i <= max; i++) {
    var p = len - i;
    if (dv.getUint32(p, true) === _EOCD) return p;
  }
  return -1;
}

function zipOpen(buf) {
  if (!buf || buf.length < 22) return { error: 'too small to be a zip' };
  var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  var eo = _zipEOCD(dv, buf.length);
  if (eo < 0) return { error: 'no end-of-central-directory record - not a zip' };

  var n = dv.getUint16(eo + 10, true), cdOff = dv.getUint32(eo + 16, true);
  if (cdOff >= buf.length) return { error: 'central directory offset past end of file' };

  var files = {}, names = [], p = cdOff;
  for (var i = 0; i < n; i++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== _CEN) break;
    var method = dv.getUint16(p + 10, true);
    var csize  = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    var nlen   = dv.getUint16(p + 28, true), elen  = dv.getUint16(p + 30, true);
    var clen   = dv.getUint16(p + 32, true), lho   = dv.getUint32(p + 42, true);
    var name = '';
    for (var c = 0; c < nlen; c++) name += String.fromCharCode(buf[p + 46 + c]);
    files[name.toLowerCase()] = { name: name, method: method, csize: csize, usize: usize, lho: lho };
    names.push(name);
    p += 46 + nlen + elen + clen;
  }

  /* The local header repeats the name and extra fields, and its extra field length routinely
     DIFFERS from the central one, so the data offset has to be computed from the local header
     rather than assumed. Getting this wrong shifts every byte and looks like corruption. */
  function raw(e) {
    if (e.lho + 30 > buf.length || dv.getUint32(e.lho, true) !== _LOC) return null;
    var ln = dv.getUint16(e.lho + 26, true), le = dv.getUint16(e.lho + 28, true);
    var at = e.lho + 30 + ln + le;
    if (at + e.csize > buf.length) return null;
    return buf.subarray(at, at + e.csize);
  }

  return {
    count: names.length,
    names: names,
    has: function (nm) { return !!files[String(nm).toLowerCase()]; },
    /* Returns a Promise of the decompressed bytes, or null if absent/unsupported. */
    read: function (nm) {
      var e = files[String(nm).toLowerCase()];
      if (!e) return Promise.resolve(null);
      var d = raw(e);
      if (!d) return Promise.resolve(null);
      if (e.method === 0) return Promise.resolve(d);             /* stored */
      if (e.method !== 8) return Promise.resolve(null);          /* only deflate is worth it */
      return zipInflateRaw(d, e.usize);
    }
  };
}

/* Raw deflate, delegated. Browser first, node under test, and nothing hand-written. */
function zipInflateRaw(d, usize) {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      var ds = new DecompressionStream('deflate-raw');
      var w = ds.writable.getWriter();
      w.write(d); w.close();
      return new Response(ds.readable).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    } catch (e) { /* fall through */ }
  }
  if (typeof require !== 'undefined') {
    try {
      var zlib = require('zlib');
      return Promise.resolve(new Uint8Array(zlib.inflateRawSync(Buffer.from(d))));
    } catch (e2) { return Promise.resolve(null); }
  }
  return Promise.resolve(null);
}

var _exp = { zipOpen: zipOpen, zipInflateRaw: zipInflateRaw };
if (typeof module !== 'undefined' && module.exports) module.exports = _exp;
else if (typeof window !== 'undefined') window.RA_ZIP = _exp;
