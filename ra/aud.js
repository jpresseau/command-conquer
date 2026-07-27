/* AUD - the format every sound and every music track in Red Alert is stored as.

   A 12-byte header, then a chain of chunks. The header says how the samples were compressed,
   and RA uses two codecs that have nothing to do with each other:

     1   Westwood's own 8-bit ADPCM, for short effects
     99  IMA ADPCM, 16-bit, for everything else including the whole soundtrack

   Header:
     u16  sample rate
     u32  size of the compressed data
     u32  size once decompressed
     u8   flags   bit 0 = stereo, bit 1 = 16-bit
     u8   compression

   Chunk:
     u16  compressed size
     u16  decompressed size
     u32  0x0000DEAF, which is the only integrity check the format has
     ...  data

   THE STATE CARRIES ACROSS CHUNKS. Both codecs are differential - every sample is an offset
   from the one before - and the running sample and step index are NOT reset at a chunk
   boundary. Resetting them per chunk is the classic mistake: it decodes cleanly, produces
   audio of exactly the right length, and clicks every 512 samples, which sounds like a bad
   file rather than a bad decoder.

   What comes out is Float32 in -1..1, ready for an AudioBuffer, because every caller wants
   that and nobody wants the intermediate. */

var _AUD_MAGIC = 0x0000deaf;

/* ---------------------------------------------------------- IMA ADPCM (99) --
   The standard tables. `index` walks a step size up and down as the signal gets louder or
   quieter, which is the whole trick: four bits buy a lot more range than four bits should. */
var _IMA_STEP = [
  7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,
  130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,
  1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,
  5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,
  27086,29794,32767];
var _IMA_INDEX = [-1,-1,-1,-1,2,4,6,8,-1,-1,-1,-1,2,4,6,8];

function _audIma(src, at, len, st, out, o) {
  for (var i = 0; i < len; i++) {
    var b = src[at + i];
    for (var half = 0; half < 2; half++) {
      var nib = half ? (b >> 4) & 15 : b & 15;
      var step = _IMA_STEP[st.index];
      var diff = step >> 3;
      if (nib & 1) diff += step >> 2;
      if (nib & 2) diff += step >> 1;
      if (nib & 4) diff += step;
      if (nib & 8) diff = -diff;
      st.sample += diff;
      if (st.sample > 32767) st.sample = 32767;
      else if (st.sample < -32768) st.sample = -32768;
      st.index += _IMA_INDEX[nib];
      if (st.index < 0) st.index = 0; else if (st.index > 88) st.index = 88;
      out[o++] = st.sample / 32768;
    }
  }
  return o;
}

/* ------------------------------------------------- Westwood ADPCM (1) --
   Byte-oriented and quite unlike IMA: a command byte picks one of four modes, and two of them
   are escapes for "the signal is not changing smoothly here" - a literal run and a repeat.
   Output is 8-bit unsigned centred on 128. */
var _WS_2BIT = [-2, -1, 0, 1];
var _WS_4BIT = [-9, -8, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8];

function _audWs(src, at, len, outLen, st, out, o) {
  var end = at + len, i, cnt;
  while (at < end && outLen > 0) {
    var code = src[at++], count = code & 0x3f;
    switch (code >> 6) {
      case 0:                                   /* four 2-bit deltas per byte */
        for (i = count + 1; i > 0 && at < end; i--) {
          var b0 = src[at++];
          for (var k = 0; k < 4 && outLen > 0; k++) {
            st.sample += _WS_2BIT[(b0 >> (k * 2)) & 3];
            st.sample = st.sample < 0 ? 0 : st.sample > 255 ? 255 : st.sample;
            out[o++] = (st.sample - 128) / 128; outLen--;
          }
        }
        break;
      case 1:                                   /* two 4-bit deltas per byte */
        for (i = count + 1; i > 0 && at < end; i--) {
          var b1 = src[at++];
          for (var k2 = 0; k2 < 2 && outLen > 0; k2++) {
            st.sample += _WS_4BIT[(b1 >> (k2 * 4)) & 15];
            st.sample = st.sample < 0 ? 0 : st.sample > 255 ? 255 : st.sample;
            out[o++] = (st.sample - 128) / 128; outLen--;
          }
        }
        break;
      case 2:
        if (count & 0x20) {                     /* one 5-bit signed delta, in the count itself */
          var d = (count & 0x1f);
          if (d & 0x10) d -= 32;                /* sign-extend from five bits */
          st.sample += d;
          st.sample = st.sample < 0 ? 0 : st.sample > 255 ? 255 : st.sample;
          out[o++] = (st.sample - 128) / 128; outLen--;
        } else {                                /* a literal run - no delta at all */
          for (i = count + 1; i > 0 && at < end && outLen > 0; i--) {
            st.sample = src[at++];
            out[o++] = (st.sample - 128) / 128; outLen--;
          }
        }
        break;
      default:                                  /* hold the current sample */
        for (i = count + 1; i > 0 && outLen > 0; i--) { out[o++] = (st.sample - 128) / 128; outLen--; }
        break;
    }
  }
  return o;
}

/* ------------------------------------------------------------------ open --
   Returns {rate, channels, samples} with samples as Float32 in -1..1, interleaved if stereo,
   or {error} - never a half-decoded buffer, because a caller that gets one plays it. */
function audOpen(buf) {
  if (!buf || buf.length < 12) return { error: 'too small to be an AUD' };
  var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  var rate = dv.getUint16(0, true);
  var size = dv.getUint32(2, true);
  var outSize = dv.getUint32(6, true);
  var flags = buf[10], comp = buf[11];
  if (!rate || rate > 96000) return { error: 'implausible sample rate ' + rate };
  if (comp !== 1 && comp !== 99) return { error: 'unknown AUD compression ' + comp };
  var stereo = !!(flags & 1), wide = !!(flags & 2);
  /* outSize counts BYTES. IMA output is 16-bit whatever the flag claims, and the flag is
     unreliable on some files, so the sample count comes from the codec rather than the flag. */
  var perSample = (comp === 99 || wide) ? 2 : 1;
  var total = Math.floor(outSize / perSample);
  if (!total || total > 40000000) return { error: 'implausible decoded size ' + outSize };

  var out = new Float32Array(total), o = 0;
  var st = { sample: comp === 99 ? 0 : 128, index: 0 };
  var p = 12, guard = 0;

  while (p + 8 <= buf.length && o < total) {
    if (++guard > 500000) break;
    var cSize = dv.getUint16(p, true);
    var uSize = dv.getUint16(p + 2, true);
    var id = dv.getUint32(p + 4, true);
    if (id !== _AUD_MAGIC) break;               /* not a chunk header - stop rather than guess */
    p += 8;
    if (p + cSize > buf.length) break;
    if (comp === 99) o = _audIma(buf, p, cSize, st, out, o);
    else o = _audWs(buf, p, cSize, uSize, st, out, o);
    p += cSize;
  }
  if (!o) return { error: 'no decodable chunks' };

  return { rate: rate, channels: stereo ? 2 : 1, compression: comp,
           samples: o < total ? out.subarray(0, o) : out,
           declared: total };
}

var _exp = { audOpen: audOpen };
if (typeof module !== 'undefined' && module.exports) module.exports = _exp;
else if (typeof window !== 'undefined') window.RA_AUD = _exp;
