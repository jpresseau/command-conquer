/* PCX - the format Red Alert keeps its full-screen artwork in.

   The title screen, the prologue and the mission briefing screens are not SHPs and not
   templates; they are plain 8-bit PCX files, which is why nothing else in this project could
   read them. `title.pcx` sits in hires.mix at 116 KB and is the screen the game opens on.

   PCX is about as simple as an image format gets, with two details worth stating because both
   are easy to get subtly wrong:

   THE PALETTE IS AT THE END, NOT THE START. A 256-colour PCX carries its palette in the LAST
   769 bytes of the file: one marker byte 0x0C, then 256 RGB triples. The 48-byte palette in the
   header is the 16-colour EGA one and is left over from 1985 - reading that instead gives an
   image in sixteen wrong colours, which looks like a decoder bug in the RLE rather than a
   palette that was never used.

   ROWS ARE PADDED TO BytesPerLine, AND THE RLE RUNS ACROSS THE PADDING. Width comes from
   (xmax - xmin + 1), but each scanline is stored as BytesPerLine bytes, which is always even
   and may exceed the width. The decoder has to consume the padding and throw it away. It also
   must NOT reset the RLE state per row - a run can be emitted that spans into the next line's
   bytes, so decoding row-at-a-time with a fresh reader drifts partway down the image.

   The RLE itself:

     11xxxxxx vv    a run: repeat byte vv (op & 0x3f) times
     0xxxxxxx       a literal byte

   Note the run marker is the TOP TWO BITS SET, not one - a byte of 0x80..0xBF is a literal. */

function pcxOpen(d) {
  if (!d || d.length < 128) return { error: 'too small to be a PCX' };
  if (d[0] !== 0x0a) return { error: 'not a PCX (bad manufacturer byte)' };
  var dv = new DataView(d.buffer, d.byteOffset, d.byteLength);

  var enc    = d[2];
  var bpp    = d[3];
  var xmin   = dv.getUint16(4, true),  ymin = dv.getUint16(6, true);
  var xmax   = dv.getUint16(8, true),  ymax = dv.getUint16(10, true);
  var planes = d[65];
  var bpl    = dv.getUint16(66, true);

  var w = xmax - xmin + 1, h = ymax - ymin + 1;
  if (w <= 0 || h <= 0 || w > 4096 || h > 4096) return { error: 'implausible PCX size ' + w + 'x' + h };
  if (bpp !== 8 || planes !== 1) return { error: 'only 8-bit single-plane PCX is supported' };

  /* The palette, from the tail. Its absence is not fatal on its own - a PCX can legally rely on
     a palette supplied elsewhere - but for these files it always exists, so its absence means
     the file is truncated and is worth saying so. */
  var pal = null, pi = d.length - 769;
  if (pi > 128 && d[pi] === 0x0c) {
    pal = new Uint8Array(768);
    pal.set(d.subarray(pi + 1, pi + 769));
  }

  var out = new Uint8Array(w * h);
  var p = 128, row, x, i;

  if (enc === 0) {
    /* uncompressed: still padded to bpl */
    for (row = 0; row < h; row++) {
      for (x = 0; x < w && p < d.length; x++) out[row * w + x] = d[p + x];
      p += bpl;
    }
  } else {
    /* RLE. One continuous pass over the whole image rather than per row: a run may carry over
       a line boundary, and restarting the reader each row loses those bytes. */
    var lineEnd = pi > 128 ? pi : d.length;
    for (row = 0; row < h; row++) {
      x = 0;
      while (x < bpl && p < lineEnd) {
        var op = d[p++], run = 1, val = op;
        if ((op & 0xc0) === 0xc0) {            /* both top bits - a run, not a literal */
          run = op & 0x3f;
          if (p >= lineEnd) break;
          val = d[p++];
        }
        for (i = 0; i < run && x < bpl; i++, x++) {
          if (x < w) out[row * w + x] = val;   /* anything past w is padding: consumed, dropped */
        }
      }
    }
  }

  return {
    w: w, h: h, pal: pal, pix: out,
    /* RGBA, ready for putImageData. Index 0 is opaque here rather than transparent: this is a
       full-screen background, not a sprite, and a "transparent" black in the middle of a night
       sky would punch a hole through it. */
    rgba: function () {
      var n = w * h, o = new Uint8ClampedArray(n * 4), k, c;
      for (k = 0; k < n; k++) {
        c = out[k] * 3;
        if (pal) { o[k * 4] = pal[c]; o[k * 4 + 1] = pal[c + 1]; o[k * 4 + 2] = pal[c + 2]; }
        else     { o[k * 4] = o[k * 4 + 1] = o[k * 4 + 2] = out[k]; }
        o[k * 4 + 3] = 255;
      }
      return o;
    }
  };
}

/* Dual-mode: a CommonJS module for the test suite, a plain global for the browser bundle,
   which has no loader at all and never will. */
(function (exp) {
  if (typeof module !== 'undefined' && module.exports) module.exports = exp;
  else if (typeof window !== 'undefined') window.RA_PCX = exp;
})({ pcxOpen: pcxOpen });
