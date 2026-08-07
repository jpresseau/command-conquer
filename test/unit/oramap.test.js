/* .oramap: a zip holding map.bin and map.yaml, plus the tile table both end up indexing into.

   Everything here is built from synthetic files so a failure names the bug rather than blaming
   someone's map. The real corpus - 140 published maps - is exercised by the survey harness,
   not by this file, which has to keep running with no assets present.

   The whole spec is one async function because of the assertion at the bottom of the zip
   section. It used to sit in a bare `.then()` at the top level of a file that ended with
   `process.exit()`, so the callback was never reached and the assertion never ran once - it
   simply did not appear in the output, which is the quietest way for a test to be absent. */

var { Suite, sameBytes } = require('../lib/assert.js');
var zip = require('../../ra/zip.js');
var ramap = require('../../ra/ramap.js');

var S = new Suite('oramap');

/* Build a minimal, valid, STORED-entry zip. Stored rather than deflated so this test does not
   depend on a compressor being available. */
function mkzip(entries) {
  var enc = function (s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; };
  var locals = [], cen = [], off = 0;
  entries.forEach(function (e) {
    var nm = enc(e.name), d = Array.from(e.data);
    var loc = [0x50, 0x4b, 3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0,                                  /* crc (unchecked) */
               d.length & 255, (d.length >> 8) & 255, 0, 0,  /* csize */
               d.length & 255, (d.length >> 8) & 255, 0, 0,  /* usize */
               nm.length & 255, (nm.length >> 8) & 255, 0, 0].concat(nm, d);
    var c = [0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
             0, 0, 0, 0,
             d.length & 255, (d.length >> 8) & 255, 0, 0,
             d.length & 255, (d.length >> 8) & 255, 0, 0,
             nm.length & 255, (nm.length >> 8) & 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
             off & 255, (off >> 8) & 255, 0, 0].concat(nm);
    off += loc.length;
    locals = locals.concat(loc); cen.push(c);
  });
  var cflat = [].concat.apply([], cen), cdOff = locals.length;
  var eocd = [0x50, 0x4b, 5, 6, 0, 0, 0, 0,
              entries.length & 255, (entries.length >> 8) & 255,
              entries.length & 255, (entries.length >> 8) & 255,
              cflat.length & 255, (cflat.length >> 8) & 255, 0, 0,
              cdOff & 255, (cdOff >> 8) & 255, 0, 0, 0, 0];
  return new Uint8Array(locals.concat(cflat, eocd));
}

/* map.bin, format 2, 3x2, built by hand so the expected grid is known. */
function mkbin(w, h, fill) {
  var n = w * h, head = 17, body = new Uint8Array(head + n * 3 + n * 2);
  var dv = new DataView(body.buffer);
  body[0] = 2; dv.setUint16(1, w, true); dv.setUint16(3, h, true);
  dv.setUint32(5, head, true);                 /* tiles */
  dv.setUint32(9, 0, true);                    /* NO height layer - offset 0 means absent */
  dv.setUint32(13, head + n * 3, true);        /* resources */
  var p = head, x, y;
  for (x = 0; x < w; x++) for (y = 0; y < h; y++) {
    dv.setUint16(p, fill(x, y), true); body[p + 2] = (x + y) & 7; p += 3;
  }
  p = head + n * 3;
  for (x = 0; x < w; x++) for (y = 0; y < h; y++) { body[p] = (x === 1 ? 1 : 0); body[p + 1] = 9; p += 2; }
  return body;
}

(async function () {
  /* ------------------------------------------------------------------ zip ----*/
  var z = zip.zipOpen(mkzip([{ name: 'map.bin', data: new Uint8Array([1, 2, 3]) },
                             { name: 'map.yaml', data: new Uint8Array([65, 66]) }]));
  S.ok('zipOpen reads the central directory', !z.error && z.count === 2, z.error || z.names.join(','));
  S.ok('...and finds entries case-insensitively', z.has('MAP.BIN') && z.has('map.yaml'));
  S.ok('...and reports a missing entry rather than throwing', !z.has('nope.txt'));
  var stored = await z.read('map.bin');
  S.bytes('...and returns a stored entry byte-for-byte', stored, new Uint8Array([1, 2, 3]));

  S.ok('a zip with no EOCD is rejected', !!zip.zipOpen(new Uint8Array(64)).error);
  S.ok('...and so is a runt', !!zip.zipOpen(new Uint8Array(4)).error);

  /* -------------------------------------------------------------- map.bin ----*/
  var b = ramap.ramapBin(mkbin(3, 2, function (x, y) { return 100 + x * 10 + y; }));
  S.ok('ramapBin reads a format-2 header', !b.error && b.w === 3 && b.h === 2, b.error || '');
  /* the transpose is the whole point: on disk it is column-major, in memory row-major */
  S.ok('...and un-transposes the column-major cell order',
       b.tmpl[0 * 3 + 0] === 100 && b.tmpl[1 * 3 + 0] === 101 && b.tmpl[0 * 3 + 2] === 120,
       Array.from(b.tmpl).join(','));
  S.ok('...and reads the per-cell tile index', b.tidx[0] === 0 && b.tidx[1 * 3 + 2] === 3);
  S.ok('...and treats a zero height offset as "no height layer", not offset zero', b.height === null);
  S.ok('...and reads the resource layer', b.resType[0 * 3 + 1] === 1 && b.resDensity[0 * 3 + 1] === 9);
  S.ok('...and leaves non-resource cells empty', b.resType[0] === 0);

  S.ok('a truncated map.bin is rejected, not read past the end',
       !!ramap.ramapBin(mkbin(3, 2, function () { return 1; }).subarray(0, 20)).error);
  var bad = mkbin(2, 2, function () { return 1; }); bad[0] = 9;
  S.ok('...and so is an unknown format byte', !!ramap.ramapBin(bad).error);

  /* ------------------------------------------------------------- map.yaml ----*/
  var y = ramap.ramapYaml([
    'MapFormat: 12', 'Title: Test Map', 'Author: Nobody', 'Tileset: TEMPERAT',
    'MapSize: 64,64', 'Bounds: 4,5,50,40', 'Actors:',
    '\tActor0: mpspawn', '\t\tOwner: Neutral', '\t\tLocation: 10,12',
    '\tActor1: mpspawn', '\t\tLocation: 40,38',
    '\tActor2: t01', '\t\tLocation: 20,20'
  ].join('\n'));
  S.ok('ramapYaml reads the header scalars', y.title === 'Test Map' && y.tileset === 'TEMPERAT' && y.w === 64);
  S.ok('...and the playable bounds', y.bounds.x === 4 && y.bounds.w === 50 && y.bounds.h === 40);
  S.ok('...and picks out only the spawn actors', y.spawns.length === 2, JSON.stringify(y.spawns));
  S.ok('...and reads their locations', y.spawns[0].x === 10 && y.spawns[1].y === 38);
  S.ok('...and still sees the non-spawn actors', y.actors.length === 3);

  /* space-indented rather than tab-indented: same map, written by a different editor */
  var y2 = ramap.ramapYaml('MapSize: 8,8\nActors:\n    Actor0: mpspawn\n        Location: 1,2\n');
  S.ok('ramapYaml handles space indentation as well as tabs', y2.spawns.length === 1 && y2.spawns[0].x === 1);
  var y3 = ramap.ramapYaml('MapSize: 8,8\n');
  S.ok('...and a map with no Bounds is playable edge to edge', y3.bounds.w === 8 && y3.bounds.h === 8);

  /* ---------------------------------------------------------- the tile table ----*/
  var tab = require('../../ra/tiletab.js').RA_TILETAB;
  S.ok('the tile table has the whole temperate tileset', Object.keys(tab).length > 300, Object.keys(tab).length);
  S.ok('...and clear ground is clear', tab[255] && tab[255].t === 'c');
  S.ok('...and open water is water', tab[1] && tab[1].t === 'w');
  var wrong = Object.keys(tab).filter(function (k) { return tab[k].t.length !== tab[k].w * tab[k].h; });
  S.ok('...and every row has exactly w*h classes', wrong.length === 0, wrong.slice(0, 5).join(','));
  var chars = {};
  Object.keys(tab).forEach(function (k) { tab[k].t.split('').forEach(function (c) { chars[c] = 1; }); });
  S.ok('...and uses no class the terrain mapper does not know',
       Object.keys(chars).every(function (c) { return 'cwrkdbig-'.indexOf(c) >= 0; }), Object.keys(chars).join(''));

  require('../lib/report.js')(S);
})();
