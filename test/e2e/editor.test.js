/* The map editor, driven the way an author drives it.

   It refuses to open without the original artwork - it draws its palette from the real terrain
   templates - and no artwork ships in this repo. Rather than declare the whole editor
   unverifiable, _rtsArtReady and _mixTiles are stubbed with a synthetic tileset: a palette of
   flat-coloured tiles keyed by template id. That tests OUR code, which is all of it except how
   the tiles look - the palette grouping, the stamp geometry, every tool, the playability check,
   the save path and the crop-on-open. It says nothing about whether a shore tile is drawn
   correctly, and does not claim to.

   The stamp geometry is the part most worth the trouble. A template is a rectangle with holes
   in it - `rec.t` carries a '-' for every cell the piece does not cover - and a stamp that fills
   the holes, or that writes the wrong sub-index, produces a map that looks right in the editor
   and is wrong the moment it is played. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('editor');

/* Installed in the page before the editor opens. Real ids out of RA_TILETAB so the palette
   grouping and the stamp masks under test are the shipped ones; only the PIXELS are invented. */
function stubArt() {
  window._rtsArtReady = function () { return true; };
  if (!RTS_MIX.pal || RTS_MIX.pal.length < 768) {
    RTS_MIX.pal = new Uint8Array(768);
    for (var p = 0; p < 256; p++) { RTS_MIX.pal[p * 3] = p; RTS_MIX.pal[p * 3 + 1] = 255 - p; RTS_MIX.pal[p * 3 + 2] = 128; }
  }
  window._mixTiles = function (name) {
    var rec = null, ids = Object.keys(window.RA_TILETAB);
    for (var i = 0; i < ids.length; i++) {
      if (window.RA_TILETAB[ids[i]].img + '.tem' === name) { rec = window.RA_TILETAB[ids[i]]; break; }
    }
    if (!rec) return null;
    var tiles = [];
    for (var t = 0; t < rec.w * rec.h; t++) {
      /* a hole in the piece stays a hole - the real reader returns null for those */
      if (rec.t && rec.t.charAt(t) === '-') { tiles.push(null); continue; }
      var px = new Uint8Array(RTS_TS * RTS_TS);
      px.fill((t * 17 + 3) & 0xff);
      tiles.push(px);
    }
    return { w: rec.w, h: rec.h, tile: tiles };
  };
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1400, height: 950 });

  var opened = await g.page.evaluate(function (src) {
    eval('(' + src + ')()');
    rtsEdOpen();
    var E = window._rtsEd;
    if (!E) return { error: 'the editor did not open' };
    return {
      dom: !!document.getElementById('rtsEd'),
      dim: Math.round(Math.sqrt(E.tmpl.length)),
      clear: Array.prototype.every.call(E.tmpl, function (v) { return v === 255; }),
      tool: E.tool, cat: E.cat,
      bounds: E.bounds,
      palette: document.querySelectorAll('#edPal .ed-tile').length,
      cats: RTS_ED_CATS.length, tools: RTS_ED_TOOLS.length
    };
  }, stubArt.toString());
  S.ok('the editor opens', !opened.error && opened.dom, opened.error || '');
  S.eq('the board is the 128x128 the format stores', opened.dim, 128);
  S.ok('...and starts as clear ground everywhere', opened.clear);
  S.ok('the palette has pieces in it', opened.palette > 0,
       opened.palette + ' pieces in the ' + opened.cat + ' group, ' +
       opened.cats + ' groups and ' + opened.tools + ' tools');

  /* ---------- every palette group has something in it ----------
     A group that draws empty is a tab that does nothing, and the player cannot tell that from
     a tab whose pieces failed to load. */
  var groups = await g.page.evaluate(function () {
    var out = [];
    RTS_ED_CATS.forEach(function (c) {
      window._rtsEd.cat = c[0];
      _rtsEdPalette();
      out.push({ key: c[0], name: c[1], n: document.querySelectorAll('#edPal .ed-tile').length });
    });
    window._rtsEd.cat = 'T'; _rtsEdPalette();
    return out;
  });
  S.note('palette groups: ' + groups.map(function (x) { return x.name + ' ' + x.n; }).join(', '));
  var empty = groups.filter(function (x) { return !x.n; });
  S.ok('no palette group is empty', !empty.length,
       empty.map(function (x) { return x.name; }).join(', ') || 'all populated');

  /* ---------- the stamp writes the piece, its holes, and its sub-indices ---------- */
  var stamp = await g.page.evaluate(function () {
    var E = window._rtsEd, D = RTS_ED_DIM;
    /* the biggest multi-cell piece with at least one hole, since that is the awkward case */
    var pick = null;
    Object.keys(window.RA_TILETAB).forEach(function (k) {
      var r = window.RA_TILETAB[k];
      if (!r || r.w * r.h < 4) return;
      if (!r.t || r.t.indexOf('-') < 0) return;
      if (!pick || r.w * r.h > pick.rec.w * pick.rec.h) pick = { id: k | 0, rec: r };
    });
    /* ...and a plain solid one as the control */
    var solid = null;
    Object.keys(window.RA_TILETAB).forEach(function (k) {
      var r = window.RA_TILETAB[k];
      if (!r || r.w * r.h < 4) return;
      if (r.t && r.t.indexOf('-') >= 0) return;
      if (!solid) solid = { id: k | 0, rec: r };
    });
    if (!pick || !solid) return { error: 'no suitable template in the table' };

    E.tool = 'stamp'; E.sel = pick.id;
    _rtsEdApply(20, 20, false);
    var wrote = 0, holes = 0, wrongIdx = 0;
    for (var ty = 0; ty < pick.rec.h; ty++) for (var tx = 0; tx < pick.rec.w; tx++) {
      var gi = (20 + ty) * D + (20 + tx), covered = pick.rec.t.charAt(ty * pick.rec.w + tx) !== '-';
      if (covered) {
        if (E.tmpl[gi] === pick.id) wrote++;
        if (E.tidx[gi] !== ty * pick.rec.w + tx) wrongIdx++;
      } else if (E.tmpl[gi] !== 255) holes++;
    }
    var covered = pick.rec.t.split('').filter(function (c) { return c !== '-'; }).length;

    E.sel = solid.id;
    _rtsEdApply(60, 60, false);
    var solidWrote = 0;
    for (var y2 = 0; y2 < solid.rec.h; y2++) for (var x2 = 0; x2 < solid.rec.w; x2++)
      if (E.tmpl[(60 + y2) * D + (60 + x2)] === solid.id) solidWrote++;

    /* a stamp that would run off the edge must clip, not wrap onto the next row */
    E.sel = solid.id;
    _rtsEdApply(D - 1, D - 1, false);
    var wrapped = 0;
    for (var w = 0; w < D; w++) if (E.tmpl[w] === solid.id) wrapped++;   /* row 0 */
    return { id: pick.id, img: pick.rec.img, w: pick.rec.w, h: pick.rec.h,
             covered: covered, wrote: wrote, holes: holes, wrongIdx: wrongIdx,
             solidImg: solid.rec.img, solidCells: solid.rec.w * solid.rec.h, solidWrote: solidWrote,
             wrapped: wrapped };
  });
  S.ok('a multi-cell template with holes is available to test with', !stamp.error, stamp.error || '');
  S.eq('stamping ' + stamp.img + ' (' + stamp.w + '×' + stamp.h + ') writes every covered cell',
       stamp.wrote, stamp.covered);
  S.eq('...leaves its holes alone', stamp.holes, 0);
  S.eq('...and gives each cell its own sub-index', stamp.wrongIdx, 0);
  S.eq('a solid ' + stamp.solidImg + ' fills all of its cells', stamp.solidWrote, stamp.solidCells);
  S.eq('a stamp at the far corner clips instead of wrapping to row 0', stamp.wrapped, 0);

  /* ---------- the other five tools ---------- */
  var tools = await g.page.evaluate(function () {
    var E = window._rtsEd, D = RTS_ED_DIM, out = {};
    function idx(x, y) { return y * D + x; }
    E.tool = 'ore';   _rtsEdApply(30, 30, false); out.ore = E.res[idx(30, 30)];
    E.tool = 'gems';  _rtsEdApply(31, 30, false); out.gems = E.res[idx(31, 30)];
    E.tool = 'tree';  _rtsEdApply(32, 30, false);
    out.trees = E.trees.length;
    out.treeType = (E.trees[E.trees.length - 1] || {}).type;
    _rtsEdApply(32, 30, false);
    out.treesAfterDouble = E.trees.length;          /* stamping the same cell must not stack */

    E.tool = 'spawn';
    for (var i = 0; i < 10; i++) _rtsEdApply(40 + i, 40, false);
    out.spawns = E.spawns.length;                    /* capped at eight */

    /* erase takes back whatever is on the cell, of any kind */
    E.tool = 'erase';
    _rtsEdApply(30, 30, false); _rtsEdApply(32, 30, false); _rtsEdApply(40, 40, false);
    out.oreAfterErase = E.res[idx(30, 30)];
    out.treeAfterErase = E.trees.filter(function (t) { return t.x === 32 && t.y === 30; }).length;
    out.spawnAfterErase = E.spawns.filter(function (s) { return s.x === 40 && s.y === 40; }).length;
    out.spawnsLeft = E.spawns.length;

    /* right-drag erases whatever the current tool is - the `erase` argument */
    E.tool = 'ore'; _rtsEdApply(35, 35, false);
    var placed = E.res[idx(35, 35)];
    _rtsEdApply(35, 35, true);
    out.eraseOverride = placed === 1 && E.res[idx(35, 35)] === 0;

    /* and nothing may be written off the board */
    var before = E.trees.length;
    E.tool = 'tree';
    _rtsEdApply(-1, 5, false); _rtsEdApply(5, -1, false);
    _rtsEdApply(D, 5, false); _rtsEdApply(5, D, false);
    out.offBoard = E.trees.length - before;
    return out;
  });
  S.eq('the ore tool marks ore', tools.ore, 1);
  S.eq('the gems tool marks gems', tools.gems, 2);
  S.eq('the tree tool plants a tree', tools.trees, 1);
  S.ok('...of a real type', /^tc?\d\d$/.test(tools.treeType || ''), tools.treeType);
  S.eq('...and planting on the same cell twice does not stack two', tools.treesAfterDouble, 1);
  S.eq('ten start positions are capped at the eight a map can hold', tools.spawns, 8);
  S.eq('erase clears ore', tools.oreAfterErase, 0);
  S.eq('erase removes a tree', tools.treeAfterErase, 0);
  S.eq('erase removes a start', tools.spawnAfterErase, 0);
  S.ok('erase-as-override works whatever tool is selected', tools.eraseOverride);
  S.eq('nothing can be painted off the board', tools.offBoard, 0);

  /* ---------- what the author is told before they press Play ----------
     The check is the editor's promise that a map is playable. It has to refuse a map that is
     not - a board with no starts cannot be played by anyone - and it must not refuse one that
     is, or the button becomes noise the author learns to ignore. */
  var check = await g.page.evaluate(function () {
    var E = window._rtsEd, D = RTS_ED_DIM, out = {};
    /* A board with no starts at all. It IS playable - _rtsMapStarts hands over to the fallback
       picker on purpose, which is how a campaign map out of MAIN.MIX still works - so what is
       asserted is not a refusal but an honest message: the author has to be told the game chose
       for them, or they ship a map whose armies land wherever the fallback ring happened to be. */
    E.spawns = [];
    out.noStarts = !!_rtsEdCheck();
    out.noStartsSaid = (document.getElementById('edStatus') || {}).textContent || '';
    out.noStartsCls = (document.getElementById('edStatus') || {}).className || '';

    /* one start is the same problem - the game still picks BOTH */
    E.spawns = [{ x: 20, y: 20 }];
    _rtsEdCheck();
    out.oneStartSaid = (document.getElementById('edStatus') || {}).textContent || '';

    /* two starts, far apart, on clear ground - the minimum playable map */
    E.spawns = [{ x: 20, y: 20 }, { x: 100, y: 100 }];
    E.bounds = { x: 2, y: 2, w: D - 4, h: D - 4 };
    var M = _rtsEdCheck();
    out.playable = !!M;
    out.playableSaid = (document.getElementById('edStatus') || {}).textContent || '';
    out.n = M ? M.n : null;
    return out;
  });
  S.ok('a board with no starts is still playable', check.noStarts);
  S.ok('...but the author is told the game chose the starts, not them',
       /no starts placed/i.test(check.noStartsSaid) && !/both starts connected/.test(check.noStartsSaid),
       JSON.stringify(check.noStartsSaid.slice(0, 130)));
  S.ok('...and it reads as a warning rather than an all-clear',
       /warn/.test(check.noStartsCls), check.noStartsCls);
  S.ok('one start alone gets the same warning', /only ONE start/i.test(check.oneStartSaid),
       JSON.stringify(check.oneStartSaid.slice(0, 130)));
  S.ok('a board with two starts on open ground is accepted', check.playable,
       JSON.stringify(check.playableSaid.slice(0, 110)));
  S.ok('...and only THEN does it say both starts are connected',
       /both starts connected/.test(check.playableSaid));
  S.ok('...and reports the battlefield size it will play at', check.n > 0, check.n + '×' + check.n);

  /* ---------- what Play would load is what Save would write ---------- */
  var round = await g.page.evaluate(function () {
    var E = window._rtsEd, D = RTS_ED_DIM;
    E.title = 'Editor Round Trip'; E.author = 'the suite';
    E.bounds = { x: 4, y: 6, w: 100, h: 90 };
    var text = _rtsEdText();
    /* the same reader the title screen uses on a map lifted out of MAIN.MIX */
    var M = rtsMapFromScenario(text, 'editor');
    if (!M || M.error) return { error: (M && M.error) || 'unreadable' };
    /* and back onto the board, which is the OPEN path */
    var before = { tmpl: Array.prototype.slice.call(E.tmpl, 0, 4096),
                   trees: E.trees.length, spawns: E.spawns.length, bounds: E.bounds };
    var adopted = _rtsEdAdopt(M);
    var after = { tmpl: Array.prototype.slice.call(E.tmpl, 0, 4096),
                  trees: E.trees.length, spawns: E.spawns.length, bounds: E.bounds,
                  title: E.title };
    var same = before.tmpl.every(function (v, i) { return v === after.tmpl[i]; });
    return { adopted: adopted, same: same, before: before, after: after, bytes: text.length };
  });
  S.ok('the editor writes a scenario the game can read', !round.error, round.error || (round.bytes + ' bytes'));
  if (!round.error) {
    S.ok('...and opening it again puts the same terrain back', round.same,
         'first 4096 cells identical');
    S.eq('...with the same trees', round.after.trees, round.before.trees);
    S.eq('...the same starts', round.after.spawns, round.before.spawns);
    S.eq('...and the same playable rectangle',
         JSON.stringify(round.after.bounds), JSON.stringify(round.before.bounds));
    S.eq('...and the title it was given', round.after.title, 'Editor Round Trip');
  }

  /* ---------- a map bigger than the board is cropped, and says so ---------- */
  var crop = await g.page.evaluate(function () {
    var D = RTS_ED_DIM, big = 160, n = big * big;
    var M = { bin: { w: big, h: big, tmpl: new Uint16Array(n), tidx: new Uint8Array(n),
                     resType: new Uint8Array(n) },
              yaml: { bounds: { x: 0, y: 0, w: big, h: big }, spawns: [], actors: [] },
              title: 'Too Big', author: '' };
    for (var i = 0; i < n; i++) M.bin.tmpl[i] = 255;
    M.bin.tmpl[10 * big + 10] = 77;                        /* inside the board */
    M.bin.tmpl[150 * big + 150] = 88;                      /* outside it */
    M.yaml.spawns = [{ x: 10, y: 10 }, { x: 150, y: 150 }];
    M.yaml.actors = [{ type: 't01', x: 12, y: 12 }, { type: 't01', x: 150, y: 150 }];
    var ok = _rtsEdAdopt(M);
    var E = window._rtsEd;
    return { ok: ok, kept: E.tmpl[10 * D + 10], spawns: E.spawns.length, trees: E.trees.length,
             said: (document.getElementById('edStatus') || {}).textContent || '',
             bounds: E.bounds };
  });
  S.ok('a 160×160 map opens', crop.ok);
  S.eq('...keeping what is inside the 128×128 board', crop.kept, 77);
  S.eq('...dropping the start that is outside it', crop.spawns, 1);
  S.eq('...and the tree that is outside it', crop.trees, 1);
  S.ok('...and saying it was cropped rather than losing the edge silently',
       /crop/i.test(crop.said), JSON.stringify(crop.said.slice(0, 120)));
  S.ok('...with a playable rectangle that fits the board',
       crop.bounds.x + crop.bounds.w <= 128 && crop.bounds.y + crop.bounds.h <= 128,
       JSON.stringify(crop.bounds));

  /* ---------- and it closes cleanly ---------- */
  var closed = await g.page.evaluate(function () {
    rtsEdClose();
    return { gone: !document.getElementById('rtsEd'), state: window._rtsEd };
  });
  S.ok('the editor closes', closed.gone);
  S.eq('...and lets go of its board', closed.state, null);

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
