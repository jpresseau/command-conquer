/* SHP reader - the shape format every Red Alert unit, structure and animation is stored in.

   Ported against XCC's and OpenRA's readers and checked with the real conquer.mix. A SHP is a
   header, then one offset record per frame, then the frame data. The only interesting part is
   that a frame is stored in one of THREE ways and two of them are deltas against another frame:

     0x80  LCW (Format80) compressed, standalone
     0x40  XOR delta against the frame named in the record's second half
     0x20  XOR delta against the PREVIOUS frame

   which is why decoding frame N can require decoding a chain of earlier frames, and why the
   decoder below keeps every frame it has produced rather than working one at a time. RA leans on
   0x20 heavily for rotation sets - 32 facings of the same tank differ only slightly from their
   neighbour - so a naive "decode just the frame I want" reader gets garbage for 30 of them.

   The header's `delta` field is the size of the largest delta buffer, which is the hint that the
   deltas exist at all; it is not needed to decode and is read only for the record. */
var lcw = require('./lcw.js');

/* Every frame is Width x Height bytes of PALETTE INDICES - not colour. Index 0 is transparent
   in every RA shape; the rest need a palette to mean anything. */
function shpOpen(buf) {
  if (!buf || buf.length < 14) return { error: 'too small to be a SHP' };
  var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  var count = dv.getUint16(0, true);
  var w = dv.getUint16(6, true), h = dv.getUint16(8, true);
  if (count === 0 || w === 0 || h === 0 || w > 512 || h > 512) {
    return { error: 'not a SHP (count ' + count + ', ' + w + 'x' + h + ')' };
  }
  /* count + 2 records: the two extras are the end-of-data marker and a zero terminator, and
     reading them is how the last real frame's length is known. */
  var recs = [], p = 14;
  for (var i = 0; i < count + 2; i++) {
    if (p + 8 > buf.length) break;
    var a = dv.getUint32(p, true), b = dv.getUint32(p + 4, true);
    recs.push({ off: a & 0xffffff, fmt: (a >>> 24) & 0xff,
                ref: b & 0xffffff, refFmt: (b >>> 24) & 0xff });
    p += 8;
  }
  var frames = new Array(count), byOffset = {};

  function decode(i) {
    if (i < 0 || i >= count) return null;
    if (frames[i]) return frames[i];
    var r = recs[i];
    if (!r) return null;
    var out = new Uint8Array(w * h);
    if (r.fmt === 0x80) {
      lcw.lcwDecompress(buf, r.off, out);
    } else if (r.fmt === 0x40 || r.fmt === 0x20) {
      /* Both are XOR deltas. 0x20 chains to the previous frame; 0x40 names its base by that
         frame's OFFSET, so the offsets have to be indexable - hence byOffset below. */
      var base = (r.fmt === 0x20) ? decode(i - 1) : decode(byOffset[r.ref]);
      if (base) out.set(base);
      lcw.xorDelta(buf, r.off, out);
    } else {
      return null;                       /* an unknown format is a decode failure, not zeroes */
    }
    frames[i] = out;
    return out;
  }

  for (var k = 0; k < count; k++) if (recs[k]) byOffset[recs[k].off] = k;

  return {
    count: count, width: w, height: h,
    delta: dv.getUint32(10, true),
    frame: decode,
    /* Decoding every frame in order is the cheap path: the 0x20 chain is already warm. */
    all: function () { var a = []; for (var i = 0; i < count; i++) a.push(decode(i)); return a; }
  };
}

/* A palette is 256 RGB triples at SIX bits per channel - the VGA DAC range - so every value has
   to be scaled to 8 bits. Multiplying by 4 leaves the top of the ramp at 252 and makes white
   slightly grey; (v * 255 / 63) is the correct expansion and is what the Remaster uses. */
function palOpen(buf) {
  if (!buf || buf.length < 768) return null;
  var out = new Uint8Array(256 * 3);
  for (var i = 0; i < 768; i++) out[i] = Math.round((buf[i] & 63) * 255 / 63);
  return out;
}

module.exports = { shpOpen: shpOpen, palOpen: palOpen };
