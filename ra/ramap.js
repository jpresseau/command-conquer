/* Reader for a real Red Alert map.

   The point of this file is that cliffs and shorelines cannot be generated. RA's terrain
   templates carry no orientation: the enum is SHORE01..SHORE37, numbered rather than oriented,
   and their passability masks are almost all "solid" because terrain type encodes what you can
   drive on, not what shape the art is. The shipped map editor simply stamps whatever piece the
   human picked. So a generator has nothing to reason from - but a MAP has the answer already
   in it, because a person placed every piece by hand. Reading one is the way to get a coastline
   that looks like a coastline.

   Two files carry it:

     map.bin   the terrain grid - per cell a template id and which tile OF that template
     map.yaml  size, playable bounds, tileset, and the actors, which is where spawns live

   map.bin's header is versioned and the layout is not the obvious one:

     u8   format (1, 2 or 3)
     u16  width, u16 height
     u32  tilesOffset, u32 heightsOffset, u32 resourcesOffset      (format 2+ only)

   In format 1 the three sections simply follow the header in order. From 2 they are addressed,
   because heights became optional - a zero offset means "this map has no height layer", NOT
   "the layer is at byte 0", and treating it as the latter reads the tile data as heights.

   Cells are stored COLUMN-major (x outer, y inner), which is the transpose of how nearly every
   other grid in this codebase is stored. Getting it backwards produces a map that looks
   plausibly like terrain - noise is symmetric - while being reflected about the diagonal, so
   it is worth stating rather than discovering. */

/* ---------------------------------------------------------------- map.bin -- */
function ramapBin(d) {
  if (!d || d.length < 5) return { error: 'too small to be a map.bin' };
  var dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  var fmt = d[0];
  if (fmt < 1 || fmt > 3) return { error: 'unsupported map.bin format ' + fmt };
  var w = dv.getUint16(1, true), h = dv.getUint16(3, true);
  if (!w || !h || w > 512 || h > 512) return { error: 'implausible map size ' + w + 'x' + h };

  var tilesAt, heightsAt = 0, resAt = 0;
  if (fmt === 1) {
    tilesAt = 5;
    resAt = tilesAt + w * h * 3;
  } else {
    if (d.length < 17) return { error: 'truncated map.bin header' };
    tilesAt   = dv.getUint32(5, true);
    heightsAt = dv.getUint32(9, true);
    resAt     = dv.getUint32(13, true);
  }
  if (tilesAt + w * h * 3 > d.length) return { error: 'map.bin tile data runs past end of file' };

  var n = w * h;
  var tmpl = new Uint16Array(n), tidx = new Uint8Array(n);
  var hgt = heightsAt ? new Uint8Array(n) : null;
  var resT = new Uint8Array(n), resD = new Uint8Array(n);

  /* column-major on disk, row-major (z*w+x) in the arrays that come out */
  var p = tilesAt, x, y, k;
  for (x = 0; x < w; x++) {
    for (y = 0; y < h; y++) {
      k = y * w + x;
      tmpl[k] = dv.getUint16(p, true); p += 2;
      tidx[k] = d[p]; p += 1;
    }
  }
  if (heightsAt && heightsAt + n <= d.length) {
    p = heightsAt;
    for (x = 0; x < w; x++) for (y = 0; y < h; y++) hgt[y * w + x] = d[p++];
  }
  if (resAt && resAt + n * 2 <= d.length) {
    p = resAt;
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        k = y * w + x;
        resT[k] = d[p]; resD[k] = d[p + 1]; p += 2;
      }
    }
  }
  return { format: fmt, w: w, h: h, tmpl: tmpl, tidx: tidx, height: hgt, resType: resT, resDensity: resD };
}

/* --------------------------------------------------------------- map.yaml --
   Not a YAML parser and does not pretend to be one. It reads exactly what a map needs: the
   top-level scalars, and the Actors block, where each entry is a type followed by an indented
   Location. Indentation is by tab or by spaces depending on who wrote the file, so depth is
   measured with tabs expanded rather than by counting characters. */
function ramapYaml(text) {
  if (!text) return { error: 'empty map.yaml' };
  var lines = String(text).replace(/\r/g, '').split('\n');
  var top = {}, actors = [], i;

  function depth(s) {
    var t = s.replace(/\t/g, '    '), d = 0;
    while (d < t.length && t.charAt(d) === ' ') d++;
    return d;
  }
  for (i = 0; i < lines.length; i++) {
    var raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    var dep = depth(raw), t = raw.trim();
    var m = t.match(/^([A-Za-z0-9_@.\-]+):\s*(.*)$/);
    if (!m) continue;
    if (dep === 0) { top[m[1]] = m[2]; continue; }
    /* An actor is a first-level child of Actors:. Its type is the value, its Location is a
       child of its own; anything else about it we do not care about. */
    if (dep > 0 && /^Actor/i.test(m[1]) && m[2]) {
      var a = { id: m[1], type: m[2].trim().toLowerCase(), x: -1, y: -1, owner: '' };
      for (var j = i + 1; j < lines.length; j++) {
        if (!lines[j].trim()) continue;
        if (depth(lines[j]) <= dep) break;
        var c = lines[j].trim().match(/^([A-Za-z0-9_@.\-]+):\s*(.*)$/);
        if (!c) continue;
        if (/^Location$/i.test(c[1])) {
          var xy = c[2].split(',');
          a.x = parseInt(xy[0], 10); a.y = parseInt(xy[1], 10);
        } else if (/^Owner$/i.test(c[1])) a.owner = c[2].trim();
      }
      actors.push(a);
    }
  }

  function pair(s, n) {
    var v = String(s || '').split(',').map(function (q) { return parseInt(q, 10); });
    while (v.length < n) v.push(0);
    return v;
  }
  var size = pair(top.MapSize, 2), bnd = pair(top.Bounds, 4);
  /* A map with no Bounds is playable edge to edge. */
  if (!top.Bounds) bnd = [0, 0, size[0], size[1]];

  return {
    title:   top.Title || 'Untitled',
    author:  top.Author || '',
    tileset: (top.Tileset || '').toUpperCase(),
    w: size[0], h: size[1],
    bounds: { x: bnd[0], y: bnd[1], w: bnd[2], h: bnd[3] },
    actors: actors,
    /* Spawn points are actors of type mpspawn. A campaign map has none, which is the signal
       that it is not a skirmish map rather than an error. */
    spawns: actors.filter(function (a) { return a.type === 'mpspawn' && a.x >= 0; })
                  .map(function (a) { return { x: a.x, y: a.y }; })
  };
}

/* Dual-mode: a CommonJS module for the test suite, a plain global for the browser bundle,
   which has no loader at all and never will.

   Wrapped rather than assigned to a `var _exp` first, because every file in ra/ used that same
   name and the browser bundle concatenates them all into ONE global scope - ten declarations of
   _exp, each overwriting the last. It happened to work only because each is consumed on the
   very next line, which is the kind of accident that stops being an accident the moment
   somebody reorders the script tags. */
(function (exp) {
  if (typeof module !== 'undefined' && module.exports) module.exports = exp;
  else if (typeof window !== 'undefined') window.RA_MAP = exp;
})({ ramapBin: ramapBin, ramapYaml: ramapYaml });
