/* The map editor's format layer: what it writes has to read back as the same map.

   The editor's own claim is that "a map made here is opened by exactly the same reader that
   opens one lifted out of MAIN.MIX" - so the thing worth testing is the round trip. That is
   pure: no browser, no canvas, no artwork, just bytes in and bytes out. If a template index
   survives the base64 packing but a tree does not, the editor is a tool that quietly loses your
   work, and no amount of testing the palette would find it.

   The board is built here rather than lifted from a real map, so the awkward values are present
   on purpose: the maximum template id, a cell at every corner, ore and gems adjacent, a tree on
   the last legal row, eight spawns, and a playable rectangle that is not the default. */

var { Suite } = require('../lib/assert.js');
var ini = require('../../ra/inimap.js');

var S = new Suite('editor-format');
var D = 128;

/* ------------------------------------------------------------------ a board ---- */
function blank() {
  var n = D * D;
  var g = { tmpl: new Uint16Array(n), tidx: new Uint8Array(n), resType: new Uint8Array(n) };
  for (var i = 0; i < n; i++) g.tmpl[i] = 255;          /* the editor's "clear ground" */
  return g;
}
function at(x, y) { return y * D + x; }

var grid = blank();
/* four corners, so an off-by-one in the row stride shows up as a corner in the wrong place */
[[0, 0, 100, 3], [D - 1, 0, 101, 0], [0, D - 1, 102, 7], [D - 1, D - 1, 103, 1]]
  .forEach(function (c) { grid.tmpl[at(c[0], c[1])] = c[2]; grid.tidx[at(c[0], c[1])] = c[3]; });
/* a template id near the top of the range, and one whose sub-index is the largest a byte holds */
grid.tmpl[at(40, 40)] = 400; grid.tidx[at(40, 40)] = 255;
/* ore and gems in adjacent cells - they share an overlay table and are easy to swap */
grid.resType[at(10, 10)] = 1;
grid.resType[at(11, 10)] = 2;
grid.resType[at(12, 10)] = 1;

var meta = {
  title: 'Round Trip', author: 'the suite',
  bounds: { x: 5, y: 7, w: 90, h: 80 },
  spawns: [{ x: 12, y: 14 }, { x: 100, y: 96 }, { x: 60, y: 20 }, { x: 20, y: 60 },
           { x: 33, y: 33 }, { x: 44, y: 44 }, { x: 55, y: 55 }, { x: 66, y: 66 }],
  trees: [{ x: 30, y: 31, type: 't01' }, { x: 31, y: 31, type: 't05' },
          { x: D - 1, y: D - 1, type: 't07' }]
};

var text = ini.inimapWrite(grid, meta);
S.ok('the editor produces a scenario file', typeof text === 'string' && text.length > 100,
     text.length + ' bytes');
S.ok('...that looks like an RA scenario', /\[Basic\]/.test(text) && /\[Map\]/.test(text) &&
     /\[MapPack\]/.test(text), text.slice(0, 40).replace(/\n/g, ' | '));

var back = ini.inimapRead(text);
S.ok('...and reads back without an error', back && !back.error, (back && back.error) || 'clean');

/* ----------------------------------------------------------------- the grid ---- */
(function () {
  if (!back || back.error) return;
  var bad = [], checked = 0;
  for (var i = 0; i < D * D; i++) {
    checked++;
    if (back.tmpl[i] !== grid.tmpl[i] || back.tidx[i] !== grid.tidx[i]) {
      if (bad.length < 5) bad.push('cell ' + (i % D) + ',' + ((i / D) | 0) +
        ': wrote ' + grid.tmpl[i] + '/' + grid.tidx[i] + ', read ' + back.tmpl[i] + '/' + back.tidx[i]);
    }
  }
  S.ok('every one of the ' + checked + ' cells survives the round trip', !bad.length, bad.join('; ') || 'identical');

  /* and specifically the awkward ones, named, so a failure says WHICH */
  [['top-left', 0, 0, 100, 3], ['top-right', D - 1, 0, 101, 0],
   ['bottom-left', 0, D - 1, 102, 7], ['bottom-right', D - 1, D - 1, 103, 1],
   ['the high template', 40, 40, 400, 255]].forEach(function (c) {
    S.eq(c[0] + ' template', back.tmpl[at(c[1], c[2])], c[3]);
    S.eq(c[0] + ' sub-index', back.tidx[at(c[1], c[2])], c[4]);
  });
})();

/* --------------------------------------------------------------- the overlay ---- */
(function () {
  if (!back || back.error) return;
  S.eq('ore reads back as ore', back.resType[at(10, 10)], 1);
  S.eq('gems next to it read back as gems', back.resType[at(11, 10)], 2);
  S.eq('ore on the other side is still ore', back.resType[at(12, 10)], 1);
  var stray = 0;
  for (var i = 0; i < D * D; i++) {
    if (back.resType[i] && i !== at(10, 10) && i !== at(11, 10) && i !== at(12, 10)) stray++;
  }
  S.eq('and nowhere else has resources', stray, 0);
})();

/* ------------------------------------------------------------------- the meta ----
   The grid and everything around it come from two different readers - inimapRead returns the
   terrain and the overlay, inimapMeta the rectangle, the starts and the trees - so both halves
   of a saved map have to be checked, and checking only the one that happens to be in hand is
   how half a map goes missing without anything failing. */
var m = ini.inimapMeta(text, 'roundtrip.ini');
S.ok('the header can be read without parsing the whole map', m && !m.error, (m && m.error) || '');
(function () {
  if (!m || m.error) return;
  S.eq('the title survives', m.title, 'Round Trip');
  S.eq('the author survives', m.author, 'the suite');
  S.eq('the playable rectangle keeps its x', m.bounds.x, 5);
  S.eq('...its y', m.bounds.y, 7);
  S.eq('...its width', m.bounds.w, 90);
  S.eq('...its height', m.bounds.h, 80);

  /* Spawns are stored as a single cell number, so a wrong stride puts every start on the
     wrong row - and a map whose starts are wrong is unplayable in a way that looks like bad
     level design rather than a bug. */
  var sp = m.spawns || [];
  S.eq('all eight starts come back', sp.length, 8);
  var wrong = [];
  meta.spawns.forEach(function (w, i) {
    if (!sp[i] || sp[i].x !== w.x || sp[i].y !== w.y)
      wrong.push('#' + i + ' wrote ' + w.x + ',' + w.y + ' read ' +
                 (sp[i] ? sp[i].x + ',' + sp[i].y : 'nothing'));
  });
  S.ok('...at the right cells', !wrong.length, wrong.join('; ') || 'all eight match');

  var trees = (m.actors || []).filter(function (a) { return /^tc?\d\d$/.test(a.type); });
  S.eq('every tree comes back', trees.length, meta.trees.length);
  var tw = [];
  meta.trees.forEach(function (t) {
    if (!trees.some(function (a) { return a.x === t.x && a.y === t.y && a.type === t.type; }))
      tw.push(t.type + ' at ' + t.x + ',' + t.y);
  });
  S.ok('...at the right cells, with the right type', !tw.length, tw.join('; ') || 'all placed');
})();

/* --------------------------------------------------- writing it twice is stable ----
   A writer that embeds anything incidental - a timestamp, an iteration order - makes every
   save a different file, which turns "did my map change?" into a question nobody can answer. */
(function () {
  var again = ini.inimapWrite(grid, meta);
  S.eq('writing the same map twice gives the same bytes', again === text, true);
  var second = ini.inimapRead(again);
  var drift = 0;
  if (second && !second.error) for (var i = 0; i < D * D; i++) if (second.tmpl[i] !== back.tmpl[i]) drift++;
  S.eq('and a second round trip does not drift', drift, 0);
})();

/* ------------------------------------------------------------- an empty board ----
   The first thing anyone does is open the editor and press Play on a board they have not
   touched. It has to produce a file that reads. */
(function () {
  var e = ini.inimapWrite(blank(), { title: 'Empty' });
  var r = ini.inimapRead(e);
  S.ok('a completely blank board still writes a readable scenario', r && !r.error,
       (r && r.error) || (e.length + ' bytes'));
  if (r && !r.error) {
    var nonClear = 0;
    for (var i = 0; i < D * D; i++) if (r.tmpl[i] !== 255) nonClear++;
    S.eq('...and comes back as clear ground everywhere', nonClear, 0);
  }
})();

require('../lib/report.js')(S);
