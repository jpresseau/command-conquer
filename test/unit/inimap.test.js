/* RA's own scenario files - .MPR/.INI - read and written.

   There is no real .MPR to hand, so one is BUILT here: a full 128x128 scenario, packed the way
   RA packs it, and read back. That means writing an LCW encoder, which the game does not need
   and so does not have - a literal-run-only encoder is enough, because the decoder does not
   care how well the stream was compressed, only that it is legal.

   Building the file rather than fixturing one is also the only way to test the part most likely
   to be wrong: the chunk header is a u32 whose low THREE bytes are the length, and the fourth
   byte is a format marker. Here that fourth byte is set to a non-zero value on purpose, because
   a reader that masks with 0xFFFFFFFF still passes every test where it happens to be zero -
   which, in real files, is most of them.

   The second half is the editor's save path, and it is a round trip rather than a check of the
   bytes. A map this game writes has to be read back by the SAME reader that opens a scenario
   lifted out of MAIN.MIX; there is no second path for maps we made ourselves. So: build a grid,
   write it, read it, and require the grid that comes back to be identical. */

var { Suite } = require('../lib/assert.js');
var inimap = require('../../ra/inimap.js');

var S = new Suite('inimap');

/* 10nnnnnn literal runs, then the 0x80 terminator. Legal LCW, terrible compression. */
function lcwLiteral(bytes) {
  var out = [], i = 0;
  while (i < bytes.length) {
    var n = Math.min(63, bytes.length - i);
    out.push(0x80 | n);
    for (var j = 0; j < n; j++) out.push(bytes[i + j]);
    i += n;
  }
  out.push(0x80);
  return new Uint8Array(out);
}

/* Pack a byte array into RA's chunked+base64 form, 8192 bytes per chunk. */
function raPack(bytes) {
  var chunks = [], at = 0;
  while (at < bytes.length) {
    var raw = bytes.subarray(at, at + 8192);
    var padded = new Uint8Array(8192); padded.set(raw);
    var enc = lcwLiteral(padded);
    var hdr = new Uint8Array(4);
    hdr[0] = enc.length & 0xff; hdr[1] = (enc.length >> 8) & 0xff; hdr[2] = (enc.length >> 16) & 0xff;
    hdr[3] = 0x20;                       /* the format marker the length must NOT include */
    chunks.push(hdr, enc);
    at += 8192;
  }
  var total = chunks.reduce(function (a, c) { return a + c.length; }, 0);
  var flat = new Uint8Array(total), o = 0;
  chunks.forEach(function (c) { flat.set(c, o); o += c.length; });
  var b64 = Buffer.from(flat).toString('base64');
  /* RA splits the base64 across numbered lines; the reader has to put them back in order. */
  var rows = [], line = 1;
  for (var i = 0; i < b64.length; i += 70) rows.push((line++) + '=' + b64.slice(i, i + 70));
  return rows;
}

/* ------------------------------------------------------------------- read ----*/
(function () {
  var D = 128, n = D * D;
  /* terrain: template 255 (clear) everywhere, with a block of template 1 (water) */
  var pack = new Uint8Array(n * 3), pv = new DataView(pack.buffer);
  for (var i = 0; i < n; i++) { pv.setUint16(i * 2, 255, true); pack[n * 2 + i] = 0; }
  for (var y = 20; y < 30; y++) for (var x = 20; x < 30; x++) pv.setUint16((y * D + x) * 2, 1, true);
  /* overlay: gold at one cell, gems at another, a wall at a third, 0xFF elsewhere */
  var ovr = new Uint8Array(n); ovr.fill(0xff);
  ovr[40 * D + 40] = 5;      /* GOLD01 */
  ovr[41 * D + 41] = 10;     /* GEM02  */
  ovr[42 * D + 42] = 2;      /* BRIK wall */

  var text = [
    '[Basic]', 'Name=Test Scenario', 'Author=Nobody',
    '[Map]', 'Theater=TEMPERATE', 'X=8', 'Y=8', 'Width=100', 'Height=100',
    '[Waypoints]', '0=' + (60 * D + 20), '1=' + (60 * D + 100), '25=' + (5 * D + 5),
    '[TERRAIN]', (70 * D + 70) + '=T07', (71 * D + 71) + '=TC01',
    '[MapPack]'
  ].concat(raPack(pack), ['[OverlayPack]'], raPack(ovr)).join('\n');

  var m = inimap.inimapRead(text);
  S.ok('inimapRead unpacks [MapPack]', !m.error && m.w === 128 && m.h === 128, m.error || '');
  S.ok('...and reads the template grid', m.tmpl[0] === 255 && m.tmpl[25 * D + 25] === 1,
       m.tmpl ? (m.tmpl[0] + '/' + m.tmpl[25 * D + 25]) : 'none');
  S.ok('...and the tile indices follow the templates, not interleaved with them',
       m.tidx[0] === 0 && m.tidx[n - 1] === 0);
  S.ok('...and reads gold out of [OverlayPack]', m.resType[40 * D + 40] === 1);
  S.ok('...and gems', m.resType[41 * D + 41] === 2);
  S.ok('...and walls', m.resType[42 * D + 42] === 3);
  S.ok('...and leaves 0xFF cells empty', m.resType[0] === 0 && m.resType[99 * D + 99] === 0);
  S.ok('...and counts what it found', m.counts.ore === 1 && m.counts.gems === 1 && m.counts.walls === 1,
       JSON.stringify(m.counts));

  var meta = inimap.inimapMeta(text, 'scm01ea.mpr');
  S.ok('inimapMeta reads the playable rectangle', meta.bounds.x === 8 && meta.bounds.w === 100);
  S.ok('...and translates RA TEMPERATE to the tileset name used everywhere else',
       meta.tileset === 'TEMPERAT', meta.tileset);
  S.ok('...and takes waypoints 0-7 as the starts, ignoring the script ones',
       meta.spawns.length === 2, JSON.stringify(meta.spawns));
  S.ok('...and converts a cell number to x,y',
       meta.spawns[0].x === 20 && meta.spawns[0].y === 60, JSON.stringify(meta.spawns[0]));
  S.ok('...and picks the trees out of [TERRAIN]', meta.actors.length === 2 &&
       meta.actors[0].type === 't07' && meta.actors[0].x === 70);
  S.ok('...and reads the name', meta.title === 'Test Scenario' && meta.author === 'Nobody');
})();

(function () {
  S.ok('a file with no [MapPack] is refused', !!inimap.inimapRead('[Basic]\nName=x\n').error);
  S.ok('...and so is an empty one', !!inimap.inimapRead('').error);
  var ini = inimap.iniParse('[A]\nk=1\n[B]\nk=2\nk=3\n');
  S.ok('iniParse keeps repeated keys rather than collapsing them', ini.list('b').length === 2);
  S.ok('...and is case-insensitive about section and key names', ini.get('A', 'K') === '1');
  S.ok('...and keeps = inside a value', inimap.iniParse('[A]\nk=a=b\n').get('a', 'k') === 'a=b');
})();

(function () {
  /* A scenario whose [Map] rectangle is nonsense is far more likely to be a file that is not
     a scenario than a real map with bad numbers. */
  var t = '[Map]\nX=200\nY=0\nWidth=900\nHeight=4\n[MapPack]\n1=\n';
  var meta = inimap.inimapMeta(t, 'x');
  S.ok('a nonsense playable rectangle falls back to the whole board',
       meta.bounds.x === 0 && meta.bounds.w === 128, JSON.stringify(meta.bounds));
})();

/* -------------------------------------------------- the editor's save path ----*/
(function () {
  var D = inimap.RA_INI_DIM, n = D * D, i;
  var tmpl = new Uint16Array(n), tidx = new Uint8Array(n), res = new Uint8Array(n);
  for (i = 0; i < n; i++) { tmpl[i] = 255; tidx[i] = 0; }
  /* a 2x2 water-cliff block, some ore, some gems, a wall */
  var put = function (x, y, id, ti) { tmpl[y * D + x] = id; tidx[y * D + x] = ti; };
  put(10, 10, 59, 0); put(11, 10, 59, 1); put(10, 11, 59, 2); put(11, 11, 59, 3);
  put(40, 40, 1, 0);                                   /* open water */
  res[50 * D + 50] = 1; res[51 * D + 51] = 2; res[52 * D + 52] = 3;

  var text = inimap.inimapWrite(
    { tmpl: tmpl, tidx: tidx, resType: res },
    { title: 'Editor Test', author: 'Red Alert',
      bounds: { x: 4, y: 6, w: 100, h: 90 },
      spawns: [{ x: 20, y: 30 }, { x: 90, y: 80 }],
      trees: [{ x: 70, y: 70, type: 't05' }] });

  var b = inimap.inimapRead(text);
  S.ok('a written scenario reads back', !b.error, b.error || '');
  var same = true, firstBad = -1;
  for (i = 0; i < n; i++) {
    if (b.tmpl[i] !== tmpl[i] || b.tidx[i] !== tidx[i]) { same = false; firstBad = i; break; }
  }
  S.ok('...with an identical terrain grid', same, same ? '' : 'first mismatch at cell ' + firstBad);
  S.ok('...and the multi-tile block intact',
       b.tmpl[10 * D + 10] === 59 && b.tidx[11 * D + 11] === 3);
  S.ok('...and the ore, gems and wall in the right cells',
       b.resType[50 * D + 50] === 1 && b.resType[51 * D + 51] === 2 && b.resType[52 * D + 52] === 3);
  S.ok('...and nothing else marked', b.counts.ore === 1 && b.counts.gems === 1 && b.counts.walls === 1,
       JSON.stringify(b.counts));

  var m = inimap.inimapMeta(text, 'test.ini');
  S.ok('...and the metadata survives', m.title === 'Editor Test' && m.author === 'Red Alert');
  S.ok('...and the bounds', m.bounds.x === 4 && m.bounds.y === 6 && m.bounds.w === 100);
  S.ok('...and both spawns, as x,y', m.spawns.length === 2 &&
       m.spawns[0].x === 20 && m.spawns[0].y === 30 && m.spawns[1].x === 90);
  S.ok('...and the tree', m.actors.length === 1 && m.actors[0].type === 't05' && m.actors[0].y === 70);
  S.ok('...and it says it is temperate', m.tileset === 'TEMPERAT');
})();

(function () {
  /* An empty board is the state the editor starts in, and saving it must not produce a file
     that the reader then rejects - "new map, save, reload" is the first thing anyone does. */
  var D = inimap.RA_INI_DIM, n = D * D;
  var tmpl = new Uint16Array(n).fill(255), tidx = new Uint8Array(n);
  var text = inimap.inimapWrite({ tmpl: tmpl, tidx: tidx, resType: new Uint8Array(n) },
                                { title: 'Blank' });
  var b = inimap.inimapRead(text);
  S.ok('a blank board saves and reloads', !b.error && b.tmpl[0] === 255 && b.tmpl[n - 1] === 255,
       b.error || '');
  S.ok('...with no ore anywhere', b.counts.ore === 0 && b.counts.gems === 0);
})();

require('../lib/report.js')(S);
