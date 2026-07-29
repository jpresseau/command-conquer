/* ISO 9660 - the filesystem on a Red Alert CD.

   The game's archives are not loose on the disc, they are inside a CD image, and a player who
   has kept their discs has .iso files rather than a folder of .mix files. This reads the image's
   directory so the loader can pull the archives straight out of it.

   AN ISO HAS REAL FILENAMES. That is the whole reason this file is short and ra/mix.js is not: a
   MIX index stores 32-bit hashes, so an archive can only ever be asked "is this exact name in
   you?" - which is why the scenario list is built by generating six thousand candidate names and
   probing each one. An ISO 9660 image has an honest directory tree with the names written down,
   so the archives can simply be LISTED. Nothing here guesses.

   The layout, which is all this needs:

     - The disc is a run of 2048-byte logical sectors. Sector 16 onward holds the volume
       descriptors, each one sector, each starting with a type byte and then the five characters
       "CD001". Type 1 is the Primary Volume Descriptor; type 255 terminates the set.
     - At byte 156 of the PVD sits a 34-byte directory record describing the ROOT directory.
     - A directory's contents are a run of directory records packed into its extent. Each record:

         0   uint8    length of this record - ZERO MEANS "no more records in this sector",
                      not "end of directory": records never straddle a sector boundary, so the
                      tail of each sector is padded and the reader must skip to the next one.
         2   uint32   extent, in sectors (little-endian half of a both-endian pair)
        10   uint32   data length, in bytes (ditto)
        25   uint8    flags; bit 1 set means this record is a directory
        32   uint8    length of the name
        33   ...      the name

     - Names are upper-case 8.3 with a version suffix: MAIN.MIX is stored as "MAIN.MIX;1". The
       two special records naming a directory itself and its parent have one-byte names 0x00 and
       0x01, and following them is how a reader ends up in an infinite loop.

   Both-endian fields are stored twice, little first then big. Reading the little half is correct
   and is what every reader does; the big half exists for 1988 hardware that is not this browser.

   ONLY 2048-BYTE SECTORS. A disc image ripped raw keeps the 2352-byte physical sector - 16 bytes
   of sync and header, 2048 of data, 288 of error correction - so its file data is not contiguous
   and cannot be handed onward as a byte range. That form is detected and reported rather than
   half-read, because a raw image parsed as a cooked one yields plausible-looking garbage. */

var ISO_SECTOR = 2048;
var ISO_RAW = 2352;          /* a raw rip: 16 bytes of header, then the same 2048 of data */

/* `slice(from, len)` must return a Promise of that byte range, so a 600 MB image is never held
   in memory - the same contract _mixSlice already satisfies for MIX archives. */
function isoOpen(slice, size) {
  return slice(16 * ISO_SECTOR, 6).then(function (probe) {
    if (probe && _isoMagic(probe, 1)) return _isoRead(slice, size, ISO_SECTOR, 0);
    /* raw: sector 16 begins at 16*2352, and its user data 16 bytes into that */
    return slice(16 * ISO_RAW, 24).then(function (raw) {
      if (raw && _isoMagic(raw, 17)) {
        return { error: 'this is a raw 2352-byte-per-sector disc image; convert it to a plain ' +
                        '.iso (2048-byte sectors) first' };
      }
      return { error: 'not an ISO 9660 image' };
    });
  });
}

function _isoMagic(b, at) {
  return b[at] === 0x43 && b[at + 1] === 0x44 && b[at + 2] === 0x30 &&
         b[at + 3] === 0x30 && b[at + 4] === 0x31;          /* "CD001" */
}

function _isoRead(slice, size, sec, dataOff) {
  var out = { label: '', files: [] };

  /* Walk the volume descriptors for the primary one. Scanning rather than assuming sector 16 is
     the PVD: the standard allows a boot record first, and some pressings have one. */
  function descriptor(lba) {
    if (lba > 32) return Promise.resolve(null);              /* far past any real set */
    return slice(lba * sec + dataOff, ISO_SECTOR).then(function (d) {
      if (!d || d.length < 190 || !_isoMagic(d, 1)) return null;
      if (d[0] === 255) return null;                         /* terminator */
      if (d[0] === 1) return d;                              /* primary */
      return descriptor(lba + 1);
    });
  }

  return descriptor(16).then(function (pvd) {
    if (!pvd) return { error: 'no ISO 9660 primary volume descriptor' };
    out.label = _isoStr(pvd, 40, 32);
    var root = pvd.subarray(156, 190);
    var dv = new DataView(root.buffer, root.byteOffset, root.byteLength);
    return _isoDir(slice, size, sec, dataOff, dv.getUint32(2, true), dv.getUint32(10, true),
                   '', out, 0, {}).then(function () { return out; });
  });
}

/* One directory, then its subdirectories. Depth-capped and extent-tracked: a malformed image
   whose "." record points at its own parent would otherwise recurse until the stack gives out. */
function _isoDir(slice, size, sec, dataOff, lba, len, path, out, depth, seen) {
  if (depth > 8 || !len || len > (64 << 20)) return Promise.resolve();
  if (seen[lba]) return Promise.resolve();
  seen[lba] = 1;
  if (lba * sec + len > size) return Promise.resolve();

  return slice(lba * sec + dataOff, len).then(function (d) {
    if (!d) return;
    var dirs = [], p = 0;
    var dv = new DataView(d.buffer, d.byteOffset, d.byteLength);

    while (p < d.length) {
      var reclen = d[p];
      if (!reclen) {
        /* Padding to the end of the sector, NOT the end of the directory - a record is never
           split across sectors, so the writer zero-fills the tail. Stopping here loses every
           entry past the first 2 KB, which on a game CD is most of them. */
        var next = (Math.floor(p / ISO_SECTOR) + 1) * ISO_SECTOR;
        if (next <= p || next >= d.length) break;
        p = next;
        continue;
      }
      if (p + reclen > d.length || reclen < 34) break;

      var flags = d[p + 25];
      var nlen  = d[p + 32];
      var ext   = dv.getUint32(p + 2, true);
      var elen  = dv.getUint32(p + 10, true);

      /* the 0x00 and 0x01 one-byte names are "this directory" and "the parent"; following
         either is how a directory walker ends up chasing its own tail */
      var special = (nlen === 1 && (d[p + 33] === 0 || d[p + 33] === 1));
      if (!special && nlen) {
        var nm = _isoStr(d, p + 33, nlen).replace(/;\d+$/, '');   /* MAIN.MIX;1 -> MAIN.MIX */
        if (flags & 2) {
          dirs.push({ lba: ext, len: elen, path: path + '/' + nm });
        } else if (elen > 0 && ext * sec + elen <= size) {
          out.files.push({ name: nm, path: path + '/' + nm, size: elen,
                           /* a byte offset into the image, so the caller can slice it directly */
                           offset: ext * sec + dataOff });
        }
      }
      p += reclen;
    }

    return dirs.reduce(function (chain, dd) {
      return chain.then(function () {
        return _isoDir(slice, size, sec, dataOff, dd.lba, dd.len, dd.path, out, depth + 1, seen);
      });
    }, Promise.resolve());
  });
}

function _isoStr(d, at, len) {
  var s = '', i;
  for (i = 0; i < len && at + i < d.length; i++) {
    var c = d[at + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.replace(/\s+$/, '');
}

/* Dual-mode: a CommonJS module for the test harnesses, a plain global for the browser bundle,
   which has no loader at all and never will. */
(function (exp) {
  if (typeof module !== 'undefined' && module.exports) module.exports = exp;
  else if (typeof window !== 'undefined') window.RA_ISO = exp;
})({ isoOpen: isoOpen, ISO_SECTOR: ISO_SECTOR });
