/* Red Alert's OWN map format - the scenarios that shipped with the game.

   The .oramap reader in ramap.js reads what the community publishes today. This reads what is
   inside the player's own copy: RA keeps every scenario as a single .INI (campaign) or .MPR
   (multiplayer) file, and unlike the C&C that came before it, the terrain is not a separate
   .BIN - it lives in the INI, base64'd and LCW-compressed, in a section called [MapPack].

   The layout, once unpacked, is one flat 128x128 grid regardless of how big the playable part
   is - RA always allocates the whole board and uses [Map]'s X/Y/Width/Height to say which
   rectangle of it is in play:

     [MapPack]      128*128 u16 template ids, THEN 128*128 u8 tile indices   (49152 bytes)
     [OverlayPack]  128*128 u8 overlay codes, 0xFF for none                  (16384 bytes)
     [Waypoints]    N=cell ; 0-7 are the multiplayer starts
     [TERRAIN]      cell=T07 ; the trees
     [Map]          Theater, X, Y, Width, Height

   Both packs are the same encoding: concatenate the numbered lines in order, base64-decode,
   then read a series of chunks. Each chunk header is a u32 whose LOW THREE BYTES are the
   compressed length - the fourth byte is a format marker and is not part of the number. Every
   chunk expands to exactly 8192 bytes. Masking that u32 wrong is the classic way to get a
   reader that works on some maps and produces garbage on others, because the fourth byte is
   frequently zero and the bug then hides.

   What comes out is deliberately the SAME SHAPE that ramapBin and ramapYaml produce, so
   everything downstream - the window fitting, the terrain classification, the painter - does
   not know or care which kind of map file it came from. */

var _inilcw = (typeof require !== 'undefined') ? require('./lcw.js') : window.RA_LCW;

var RA_INI_DIM = 128;               /* DEFINES.H MAP_CELL_W - always, whatever [Map] says */
var _RA_CHUNK = 8192;

/* ------------------------------------------------------------------ base64 --
   Browser and node disagree about who provides this, and neither is present in both. */
function _iniB64(s) {
  s = String(s).replace(/[^A-Za-z0-9+/=]/g, '');
  if (typeof atob === 'function') {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  return new Uint8Array(0);
}

/* ------------------------------------------------------------------- INI --
   RA's INI is not quite an INI: keys repeat, values contain '=', and section names vary in
   case between scenarios. Sections are kept as ordered key/value LISTS rather than objects
   because [MapPack]'s numbered lines must be concatenated in file order, and an object would
   silently reorder them. */
function iniParse(text) {
  var lines = String(text).replace(/\r/g, '').split('\n');
  var sections = {}, cur = null;
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t || t.charAt(0) === ';') continue;
    var m = t.match(/^\[([^\]]+)\]/);
    if (m) { cur = m[1].toLowerCase(); if (!sections[cur]) sections[cur] = []; continue; }
    if (!cur) continue;
    var eq = t.indexOf('=');
    if (eq < 0) continue;
    sections[cur].push([t.slice(0, eq).trim(), t.slice(eq + 1).trim()]);
  }
  return {
    has: function (s) { return !!sections[String(s).toLowerCase()]; },
    list: function (s) { return sections[String(s).toLowerCase()] || []; },
    get: function (s, k) {
      var rows = sections[String(s).toLowerCase()] || [];
      for (var j = 0; j < rows.length; j++) if (rows[j][0].toLowerCase() === String(k).toLowerCase()) return rows[j][1];
      return null;
    }
  };
}

/* Concatenate a pack's numbered lines, decode, and expand its LCW chunks. */
function _iniUnpack(rows, wantBytes) {
  var i, s = '';
  /* keyed by ascending number, and the file order is already that - but a scenario edited by
     hand can have them out of order, and one line in the wrong place corrupts everything
     after it, so sort rather than trust */
  var sorted = rows.slice().sort(function (a, b) { return (a[0] | 0) - (b[0] | 0); });
  for (i = 0; i < sorted.length; i++) s += sorted[i][1];
  var packed = _iniB64(s);
  if (!packed.length) return null;

  var out = new Uint8Array(wantBytes), at = 0, p = 0;
  var dv = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  while (p + 4 <= packed.length && at < wantBytes) {
    /* LOW THREE BYTES only - the fourth is a format marker, not part of the length */
    var clen = dv.getUint32(p, true) & 0xffffff;
    p += 4;
    if (!clen || p + clen > packed.length) break;
    var chunk = new Uint8Array(_RA_CHUNK);
    try { _inilcw.lcwDecompress(packed, p, chunk); } catch (e) { break; }
    var take = Math.min(_RA_CHUNK, wantBytes - at);
    out.set(chunk.subarray(0, take), at);
    at += take; p += clen;
  }
  return at ? { data: out, filled: at } : null;
}

/* --------------------------------------------------------------- overlay --
   OverlayType, in order. Only three groups matter to this game: the four gold stages, the
   four gem stages, and the walls. Everything past them is scenery this game has no concept
   of, and is skipped rather than guessed at. */
var RA_OVR_GOLD = [5, 6, 7, 8], RA_OVR_GEM = [9, 10, 11, 12], RA_OVR_WALL_MAX = 4;

/* ------------------------------------------------------------------ read --
   Produces the same {w,h,tmpl,tidx,resType,resDensity} that ramapBin does, so the rest of the
   pipeline cannot tell the two formats apart. */
function inimapRead(text) {
  if (!text) return { error: 'empty scenario file' };
  var ini = iniParse(text);
  if (!ini.has('mappack')) return { error: 'no [MapPack] - not a Red Alert scenario' };

  var D = RA_INI_DIM, n = D * D;
  var mp = _iniUnpack(ini.list('mappack'), n * 3);
  if (!mp) return { error: '[MapPack] would not decompress' };

  var tmpl = new Uint16Array(n), tidx = new Uint8Array(n), i;
  var dv = new DataView(mp.data.buffer, mp.data.byteOffset, mp.data.byteLength);
  for (i = 0; i < n; i++) {
    var id = dv.getUint16(i * 2, true);
    /* RA writes 0xFFFF for "nothing here", which is clear ground, and the tile table carries
       65535 for exactly that reason. Leave it - the classifier knows it. */
    tmpl[i] = id;
    tidx[i] = mp.data[n * 2 + i];
  }

  var resT = new Uint8Array(n), resD = new Uint8Array(n), walls = 0, ore = 0, gems = 0;
  var op = ini.has('overlaypack') ? _iniUnpack(ini.list('overlaypack'), n) : null;
  if (op) {
    for (i = 0; i < n; i++) {
      var o = op.data[i];
      if (o === 0xff) continue;
      if (RA_OVR_GOLD.indexOf(o) >= 0) { resT[i] = 1; resD[i] = 12; ore++; }
      else if (RA_OVR_GEM.indexOf(o) >= 0) { resT[i] = 2; resD[i] = 3; gems++; }
      else if (o <= RA_OVR_WALL_MAX) { resT[i] = 3; walls++; }     /* 3 = wall, see rts.map.js */
    }
  }

  return { format: 'ini', w: D, h: D, tmpl: tmpl, tidx: tidx, height: null,
           resType: resT, resDensity: resD,
           counts: { ore: ore, gems: gems, walls: walls } };
}

/* Everything that is not the terrain grid: the playable rectangle, the start waypoints and
   the trees. Shaped like ramapYaml's result for the same reason. */
function inimapMeta(text, name) {
  var ini = iniParse(text), D = RA_INI_DIM;
  function num(k, dflt) { var v = parseInt(ini.get('map', k), 10); return isFinite(v) ? v : dflt; }
  var x = num('X', 0), y = num('Y', 0), w = num('Width', D), h = num('Height', D);
  /* A scenario with a nonsense rectangle is more likely to be a file that is not a scenario
     at all than a real map with bad numbers, so clamp rather than trust. */
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > D || y + h > D) { x = 0; y = 0; w = D; h = D; }

  /* Waypoints 0-7 are the multiplayer starts; the rest are script targets. A cell number is
     y*128+x, the same flat index the packs use. */
  var spawns = [], wps = ini.list('waypoints'), i;
  for (i = 0; i < wps.length; i++) {
    var idx = wps[i][0] | 0, cell = parseInt(wps[i][1], 10);
    if (idx < 0 || idx > 7 || !isFinite(cell) || cell < 0 || cell >= D * D) continue;
    spawns.push({ x: cell % D, y: (cell / D) | 0 });
  }

  /* [TERRAIN] is cell=TYPE, and every type in it is a tree or a tree clump. */
  var actors = [], tr = ini.list('terrain');
  for (i = 0; i < tr.length; i++) {
    var c = parseInt(tr[i][0], 10);
    if (!isFinite(c) || c < 0 || c >= D * D) continue;
    actors.push({ id: 'terrain' + i, type: String(tr[i][1]).toLowerCase(), x: c % D, y: (c / D) | 0, owner: '' });
  }

  var theatre = String(ini.get('map', 'Theater') || '').toUpperCase();
  return {
    title:  ini.get('basic', 'Name') || name || 'Untitled',
    author: ini.get('basic', 'Author') || '',
    /* RA spells it TEMPERATE, OpenRA spells it TEMPERAT; downstream only knows the latter. */
    tileset: theatre === 'TEMPERATE' ? 'TEMPERAT' : theatre,
    w: D, h: D,
    bounds: { x: x, y: y, w: w, h: h },
    actors: actors,
    spawns: spawns
  };
}

var _exp = { iniParse: iniParse, inimapRead: inimapRead, inimapMeta: inimapMeta,
             RA_INI_DIM: RA_INI_DIM };
if (typeof module !== 'undefined' && module.exports) module.exports = _exp;
else if (typeof window !== 'undefined') window.RA_INIMAP = _exp;
