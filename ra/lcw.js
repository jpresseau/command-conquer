/* LCW ("Format80") decompression - a line-for-line port of LCW_Uncompress from
   CODE/LCWUNCMP.CPP in the Red Alert source release.

   Every piece of art in Red Alert arrives through this: SHP frames, terrain templates,
   the palettes, the sidebar. Nothing can be read out of a MIX archive without it.

   The op-code table, exactly as the original branches on it:

     0nnnddddd dddddddd  short copy from DESTINATION, count = (op>>4)+3, back-ref 12 bits
     10000000            end of stream
     10nnnnnn            medium copy from SOURCE, count = op & 0x3f
     11nnnnnn ll ll      medium copy from DESTINATION, count = (op & 0x3f)+3, ABSOLUTE offset
     11111110 cc cc dd   long run of one byte, 16-bit count
     11111111 cc cc ll ll long copy from DESTINATION, 16-bit count, ABSOLUTE offset

   Two details that are easy to get wrong and are the usual cause of a decoder that
   "mostly works" and then produces garbage on one frame in fifty:

   - The 0x40 and 0xff destination offsets are ABSOLUTE (from the start of the output),
     while the 0x00 form is RELATIVE (backwards from the current write position).
   - The copies are byte-at-a-time and MUST overlap correctly: a run is very often encoded
     as a 1-byte back-reference with a long count, so copying via a slice or a typed-array
     `set` reads bytes that have not been written yet and silently produces the wrong image.

   The original's 0xfe branch does a word-aligned fill for speed. That is an optimisation of
   a byte fill, not a different result, so it is written here as the byte fill it is. */
function lcwDecompress(src, srcOffset, dest) {
  var s = srcOffset | 0, d = 0, n = dest.length;
  for (;;) {
    if (s >= src.length) return d;                 /* truncated stream: stop, do not throw */
    var op = src[s++];

    if (!(op & 0x80)) {
      /* short copy from destination, relative back-reference */
      var count = (op >> 4) + 3;
      var copy = d - (src[s++] + ((op & 0x0f) << 8));
      if (copy < 0) return d;
      while (count-- && d < n) dest[d++] = dest[copy++];

    } else if (!(op & 0x40)) {
      if (op === 0x80) return d;                   /* end of stream */
      /* medium copy straight from the source */
      var c2 = op & 0x3f;
      while (c2-- && d < n) dest[d++] = src[s++];

    } else if (op === 0xfe) {
      /* long run of a single byte */
      var run = src[s] | (src[s + 1] << 8);
      var val = src[s + 2];
      s += 3;
      while (run-- && d < n) dest[d++] = val;

    } else if (op === 0xff) {
      /* long copy from destination, ABSOLUTE offset */
      var lc = src[s] | (src[s + 1] << 8);
      var lp = src[s + 2] | (src[s + 3] << 8);
      s += 4;
      while (lc-- && d < n) dest[d++] = dest[lp++];

    } else {
      /* medium copy from destination, ABSOLUTE offset */
      var mc = (op & 0x3f) + 3;
      var mp = src[s] | (src[s + 1] << 8);
      s += 2;
      while (mc-- && d < n) dest[d++] = dest[mp++];
    }
  }
}

/* XOR delta ("Format40"). SHP frames come in two flavours: a whole frame compressed with
   LCW, or a DELTA against the frame N back, which is what makes an eight-facing unit cheap.
   From the shape drawing code in WWFLAT32/SHAPE - the same op-code shape as LCW but the
   bytes are XORed into an existing buffer rather than written over it. */
function xorDelta(src, srcOffset, dest) {
  var s = srcOffset | 0, d = 0, n = dest.length;
  for (;;) {
    if (s >= src.length) return d;
    var op = src[s++];

    if (!(op & 0x80)) {
      if (op) {                                    /* XOR the next `op` source bytes */
        var c = op;
        while (c-- && d < n) dest[d++] ^= src[s++];
      } else {                                     /* run: count, then one value */
        var run = src[s++], v = src[s++];
        while (run-- && d < n) dest[d++] ^= v;
      }
    } else {
      var cnt = op & 0x7f;
      if (cnt) { d += cnt; continue; }             /* skip forward, leaving bytes alone */
      cnt = src[s] | (src[s + 1] << 8); s += 2;
      if (!cnt) return d;                          /* end of stream */
      if (!(cnt & 0x8000)) { d += cnt; continue; } /* long skip */
      if (cnt & 0x4000) {                          /* long XOR run */
        var lr = cnt & 0x3fff, lv = src[s++];
        while (lr-- && d < n) dest[d++] ^= lv;
      } else {                                     /* long XOR from source */
        var lx = cnt & 0x3fff;
        while (lx-- && d < n) dest[d++] ^= src[s++];
      }
    }
  }
}

/* dual-mode: a CommonJS module for the test suite, a plain global for the browser
   bundle, which has no loader at all and never will. */
var _exp = { lcwDecompress: lcwDecompress, xorDelta: xorDelta };
if (typeof module !== 'undefined' && module.exports) module.exports = _exp;
else if (typeof window !== 'undefined') window.RA_LCW = _exp;
