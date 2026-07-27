/* The map editor - a palette editor, which is the kind Red Alert shipped.

   You pick a template out of the palette and stamp it. There is no auto-tiling, and that is
   not a missing feature: RA's terrain templates carry no orientation to auto-tile FROM. The
   enum is SHORE01..SHORE37, numbered rather than oriented; a piece's passability mask says
   what you can drive on, not which way it faces. MAPEDPLC.CPP in the RA source does exactly
   this - it stamps whatever the human chose - and every published map I read was built that
   way. So the palette is the honest tool, and the thing that makes it usable is that the
   palette is SORTED: 308 templates in one flat list is a haystack, and the tileset's own
   EditorTemplateOrder grouping is baked into ra/tiletab.js for this.

   The board is always 128x128, because that is what RA's format stores - MAP_CELL_W. The
   playable rectangle inside it is a separate thing the author sets, and it is what decides how
   big the battlefield ends up.

   Saving writes a real RA scenario through ra/inimap.js, which means a map made here is opened
   by exactly the same reader that opens one lifted out of MAIN.MIX. Playing it goes through
   the file too rather than around it - press Play and what loads is what would have been
   saved, so the save path cannot rot without the play button noticing. */

var RTS_ED_DIM = 128;                        /* RA_INI_DIM; the format's board size */
var RTS_ED_CATS = [
  ['T', 'Terrain'], ['D', 'Debris'], ['R', 'Road'], ['C', 'Cliffs'],
  ['W', 'Water Cliffs'], ['B', 'Beach'], ['V', 'River'], ['G', 'Bridge']
];
var RTS_ED_TOOLS = [
  ['stamp', 'Stamp'], ['erase', 'Erase'], ['ore', 'Ore'], ['gems', 'Gems'],
  ['tree', 'Trees'], ['spawn', 'Starts']
];

window._rtsEd = window._rtsEd || null;

/* ------------------------------------------------------------------ open -- */
function rtsEdOpen() {
  if (document.getElementById('rtsEd')) return;
  if (!_rtsArtReady()) {
    alert('Load the original artwork first — the editor draws with the real terrain templates, ' +
          'and without them there is nothing to put in the palette.');
    return;
  }
  var D = RTS_ED_DIM, n = D * D;
  var E = window._rtsEd = {
    tmpl: new Uint16Array(n), tidx: new Uint8Array(n), res: new Uint8Array(n),
    trees: [], spawns: [],
    sel: 255, tool: 'stamp', cat: 'T',
    bounds: { x: 2, y: 2, w: D - 4, h: D - 4 },
    title: 'Untitled', author: '',
    zoom: 8, panX: 0, panY: 0, grid: true, painting: false, dirty: true
  };
  for (var i = 0; i < n; i++) E.tmpl[i] = 255;         /* clear ground everywhere */
  _rtsEdBuildDom();
  _rtsEdZoomToFit();
  _rtsEdPalette();
  _rtsEdRepaint();
}

/* Open at whatever zoom shows the whole board. Starting at a fixed zoom left a 512px map
   marooned in the middle of a 1200px stage, which reads as a broken layout rather than as a
   small map - and the first thing anyone would have done is hunt for the zoom control. */
function _rtsEdZoomToFit() {
  var E = window._rtsEd, stage = document.getElementById('edStage');
  if (!E || !stage) return;
  var pad = 28;
  var fit = Math.min(stage.clientWidth - pad, stage.clientHeight - pad) / RTS_ED_DIM;
  E.zoom = Math.max(2, Math.min(16, Math.floor(fit)));
}

function rtsEdClose() {
  var el = document.getElementById('rtsEd');
  if (el && el.parentNode) el.parentNode.removeChild(el);
  window._rtsEd = null;
}

/* ------------------------------------------------------------------- dom -- */
function _rtsEdBuildDom() {
  var w = document.createElement('div');
  w.id = 'rtsEd';
  w.innerHTML =
    '<div class="ed-top">' +
      '<b>MAP EDITOR</b>' +
      '<span class="ed-tools" id="edTools"></span>' +
      '<label class="ed-chk"><input type="checkbox" id="edGrid" checked> grid</label>' +
      '<span class="ed-sp"></span>' +
      '<button type="button" id="edLoad">OPEN…</button>' +
      '<input type="file" id="edFile" accept=".ini,.mpr,.oramap,.bin,.yaml" multiple hidden>' +
      '<button type="button" id="edCheck">CHECK</button>' +
      '<button type="button" id="edSave">SAVE .INI</button>' +
      '<button type="button" id="edPlay">PLAY IT</button>' +
      '<button type="button" id="edX">✕</button>' +
    '</div>' +
    '<div class="ed-body">' +
      '<div class="ed-stage" id="edStage"><canvas id="edCv"></canvas></div>' +
      '<div class="ed-side">' +
        '<div class="ed-cats" id="edCats"></div>' +
        '<div class="ed-pal" id="edPal"></div>' +
        '<div class="ed-info" id="edInfo"></div>' +
      '</div>' +
    '</div>' +
    '<div class="ed-status" id="edStatus">Pick a piece on the right, then click the map to place it.</div>';
  document.body.appendChild(w);

  var cats = document.getElementById('edCats');
  RTS_ED_CATS.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = c[1]; b.setAttribute('data-c', c[0]);
    if (c[0] === 'T') b.className = 'on';
    b.onclick = function () { window._rtsEd.cat = c[0]; _rtsEdPalette(); };
    cats.appendChild(b);
  });
  var tools = document.getElementById('edTools');
  RTS_ED_TOOLS.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = t[1]; b.setAttribute('data-t', t[0]);
    if (t[0] === 'stamp') b.className = 'on';
    b.onclick = function () {
      window._rtsEd.tool = t[0];
      [].forEach.call(tools.getElementsByTagName('button'), function (x) {
        x.className = (x.getAttribute('data-t') === t[0]) ? 'on' : '';
      });
      _rtsEdSay(_rtsEdToolHelp(t[0]));
    };
    tools.appendChild(b);
  });

  document.getElementById('edX').onclick = rtsEdClose;
  document.getElementById('edGrid').onchange = function () {
    window._rtsEd.grid = this.checked; _rtsEdRepaint();
  };
  document.getElementById('edCheck').onclick = _rtsEdCheck;
  document.getElementById('edSave').onclick = _rtsEdSave;
  document.getElementById('edPlay').onclick = _rtsEdPlay;
  document.getElementById('edLoad').onclick = function () { document.getElementById('edFile').click(); };
  document.getElementById('edFile').onchange = function () { _rtsEdLoadFiles(this.files); };

  _rtsEdWireCanvas();
}

function _rtsEdToolHelp(t) {
  return {
    stamp: 'Click or drag to stamp the selected piece. Right-click clears a cell.',
    erase: 'Click or drag to put cells back to clear ground.',
    ore:   'Paint ore. Harvesters need it, so put some within reach of both starts.',
    gems:  'Paint gems — worth far more per scoop, so a small patch goes a long way.',
    tree:  'Place trees. They block movement and burn.',
    spawn: 'Place up to 8 start positions. A battle uses the two furthest apart.'
  }[t] || '';
}
function _rtsEdSay(msg, cls) {
  var el = document.getElementById('edStatus');
  if (el) { el.textContent = msg; el.className = 'ed-status ' + (cls || ''); }
}

/* --------------------------------------------------------------- palette --
   Thumbnails are rendered from the player's own templates, at one screen pixel per source
   pixel, so what is in the palette is literally what lands on the map. */
function _rtsEdPalette() {
  var pal = document.getElementById('edPal');
  if (!pal) return;
  pal.innerHTML = '';
  var E = window._rtsEd, ids = Object.keys(window.RA_TILETAB), shown = 0;
  ids.sort(function (a, b) { return (a | 0) - (b | 0); });
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i] | 0, rec = window.RA_TILETAB[id];
    if (!rec || rec.cat !== E.cat) continue;
    var cv = _rtsEdThumb(id, rec);
    if (!cv) continue;
    var cell = document.createElement('div');
    cell.className = 'ed-tile' + (id === E.sel ? ' on' : '');
    cell.title = rec.img + '  ' + rec.w + '×' + rec.h;
    cell.appendChild(cv);
    (function (tid) {
      cell.onclick = function () {
        window._rtsEd.sel = tid;
        window._rtsEd.tool = 'stamp';
        [].forEach.call(document.getElementById('edTools').getElementsByTagName('button'),
          function (x) { x.className = (x.getAttribute('data-t') === 'stamp') ? 'on' : ''; });
        _rtsEdPalette();
        _rtsEdSay('Selected ' + window.RA_TILETAB[tid].img + '.');
      };
    })(id);
    pal.appendChild(cell);
    shown++;
  }
  var info = document.getElementById('edInfo');
  if (info) info.textContent = shown + ' pieces in this group';
}

var _RTS_ED_THUMBS = {};
function _rtsEdThumb(id, rec) {
  if (_RTS_ED_THUMBS[id] !== undefined) {
    return _RTS_ED_THUMBS[id] ? _rtsEdCloneCanvas(_RTS_ED_THUMBS[id]) : null;
  }
  var set = _mixTiles(rec.img + '.tem');
  if (!set) { _RTS_ED_THUMBS[id] = null; return null; }
  var cv = document.createElement('canvas');
  cv.width = rec.w * RTS_TS; cv.height = rec.h * RTS_TS;
  var g = cv.getContext('2d'), img = g.createImageData(cv.width, cv.height), d = img.data;
  var pal = RTS_MIX.pal;
  for (var ty = 0; ty < rec.h; ty++) {
    for (var tx = 0; tx < rec.w; tx++) {
      var t = set.tile[ty * rec.w + tx];
      for (var y = 0; y < RTS_TS; y++) {
        for (var x = 0; x < RTS_TS; x++) {
          var o = ((ty * RTS_TS + y) * cv.width + tx * RTS_TS + x) * 4;
          if (!t) { d[o + 3] = 0; continue; }        /* a hole stays transparent */
          var p = t[y * RTS_TS + x] * 3;
          d[o] = pal[p]; d[o + 1] = pal[p + 1]; d[o + 2] = pal[p + 2]; d[o + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  _RTS_ED_THUMBS[id] = cv;
  return _rtsEdCloneCanvas(cv);
}
function _rtsEdCloneCanvas(src) {
  var c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

/* ---------------------------------------------------------------- canvas -- */
function _rtsEdWireCanvas() {
  var cv = document.getElementById('edCv'), stage = document.getElementById('edStage');
  function cellAt(ev) {
    var r = cv.getBoundingClientRect(), E = window._rtsEd;
    return { x: Math.floor((ev.clientX - r.left) / E.zoom),
             y: Math.floor((ev.clientY - r.top) / E.zoom) };
  }
  cv.oncontextmenu = function (e) { e.preventDefault(); return false; };
  cv.onmousedown = function (e) {
    var E = window._rtsEd; if (!E) return;
    E.painting = true;
    var c = cellAt(e);
    _rtsEdApply(c.x, c.y, e.button === 2);
    e.preventDefault();
  };
  window.addEventListener('mousemove', function (e) {
    var E = window._rtsEd;
    if (!E || !E.painting) return;
    var c = cellAt(e);
    _rtsEdApply(c.x, c.y, (e.buttons & 2) !== 0);
  });
  window.addEventListener('mouseup', function () {
    if (window._rtsEd) window._rtsEd.painting = false;
  });
  stage.addEventListener('wheel', function (e) {
    var E = window._rtsEd; if (!E) return;
    E.zoom = Math.max(2, Math.min(16, E.zoom + (e.deltaY < 0 ? 1 : -1)));
    _rtsEdRepaint();
    e.preventDefault();
  }, { passive: false });
}

/* One edit. Stamping places a template's WHOLE footprint, skipping the holes - a hole is a
   cell the piece genuinely does not cover, and blanking it would punch a square out of
   whatever it was laid over. */
function _rtsEdApply(cx, cy, erase) {
  var E = window._rtsEd, D = RTS_ED_DIM;
  if (!E || cx < 0 || cy < 0 || cx >= D || cy >= D) return;
  var i = cy * D + cx, tool = erase ? 'erase' : E.tool;

  if (tool === 'erase') {
    E.tmpl[i] = 255; E.tidx[i] = 0; E.res[i] = 0;
    E.trees = E.trees.filter(function (t) { return t.x !== cx || t.y !== cy; });
    E.spawns = E.spawns.filter(function (s) { return s.x !== cx || s.y !== cy; });
  } else if (tool === 'ore')  { E.res[i] = 1; }
  else if (tool === 'gems')   { E.res[i] = 2; }
  else if (tool === 'tree') {
    if (!E.trees.some(function (t) { return t.x === cx && t.y === cy; })) {
      var kinds = ['t01', 't02', 't03', 't05', 't06', 't07', 't08', 't10', 't11', 't12'];
      E.trees.push({ x: cx, y: cy, type: kinds[(cx * 7 + cy * 13) % kinds.length] });
    }
  } else if (tool === 'spawn') {
    if (E.spawns.some(function (s) { return s.x === cx && s.y === cy; })) return;
    if (E.spawns.length >= 8) { _rtsEdSay('Eight starts is the most a map can have.', 'warn'); return; }
    E.spawns.push({ x: cx, y: cy });
  } else {
    var rec = window.RA_TILETAB[E.sel];
    if (!rec) return;
    for (var ty = 0; ty < rec.h; ty++) {
      for (var tx = 0; tx < rec.w; tx++) {
        var gx = cx + tx, gy = cy + ty;
        if (gx >= D || gy >= D) continue;
        if (rec.t.charAt(ty * rec.w + tx) === '-') continue;      /* the piece has a hole here */
        var gi = gy * D + gx;
        E.tmpl[gi] = E.sel; E.tidx[gi] = ty * rec.w + tx;
        E.res[gi] = 0;
      }
    }
  }
  E.dirty = true;
  _rtsEdRepaint();
}

/* The board is redrawn whole. At 128x128 that is 16k cells of drawImage, which is fast enough
   to keep a drag responsive and avoids a dirty-rectangle scheme that would be its own source
   of bugs for no visible gain. */
function _rtsEdRepaint() {
  var E = window._rtsEd, cv = document.getElementById('edCv');
  if (!E || !cv) return;
  var D = RTS_ED_DIM, z = E.zoom;
  if (cv.width !== D * z) { cv.width = D * z; cv.height = D * z; }
  var g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#0b0f16';
  g.fillRect(0, 0, cv.width, cv.height);

  for (var y = 0; y < D; y++) {
    for (var x = 0; x < D; x++) {
      var rec = window.RA_TILETAB[E.tmpl[y * D + x]];
      if (!rec) continue;
      var thumb = _RTS_ED_THUMBS[E.tmpl[y * D + x]] || _rtsEdThumb(E.tmpl[y * D + x], rec);
      var src = _RTS_ED_THUMBS[E.tmpl[y * D + x]];
      if (!src) continue;
      var ti = E.tidx[y * D + x];
      var sx = (ti % rec.w) * RTS_TS, sy = ((ti / rec.w) | 0) * RTS_TS;
      g.drawImage(src, sx, sy, RTS_TS, RTS_TS, x * z, y * z, z, z);
    }
  }
  /* overlays, drawn as flat marks rather than art: this is a plan, not a screenshot */
  for (y = 0; y < D; y++) {
    for (x = 0; x < D; x++) {
      var r = E.res[y * D + x];
      if (!r) continue;
      g.fillStyle = r === 1 ? 'rgba(255,207,106,.75)' : 'rgba(150,120,255,.8)';
      g.fillRect(x * z + z * 0.15, y * z + z * 0.15, z * 0.7, z * 0.7);
    }
  }
  g.fillStyle = 'rgba(40,90,40,.95)';
  E.trees.forEach(function (t) { g.fillRect(t.x * z + z * 0.2, t.y * z + z * 0.2, z * 0.6, z * 0.6); });

  /* the playable rectangle - everything outside it is border the battle never enters */
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
  g.strokeRect(E.bounds.x * z + 0.5, E.bounds.y * z + 0.5, E.bounds.w * z, E.bounds.h * z);

  /* Only once a cell is big enough for the line to read AS a line. At six pixels the grid
     stops being a guide and turns the ground into hatching, which is worse than no grid. */
  if (E.grid && z >= 10) {
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath();
    for (var k = 0; k <= D; k += 1) {
      g.moveTo(k * z + 0.5, 0); g.lineTo(k * z + 0.5, D * z);
      g.moveTo(0, k * z + 0.5); g.lineTo(D * z, k * z + 0.5);
    }
    g.stroke();
  }
  E.spawns.forEach(function (s, i) {
    g.fillStyle = '#2e6fd0';
    g.beginPath(); g.arc(s.x * z + z / 2, s.y * z + z / 2, Math.max(4, z * 0.6), 0, 6.284); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold ' + Math.max(8, z) + 'px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), s.x * z + z / 2, s.y * z + z / 2);
  });
}

/* ------------------------------------------------------------ save / play --
   Both go through the file. Play does not hand the editor's arrays to the game directly: it
   writes the scenario and loads it back, so pressing Play exercises the same save path a
   player's file would take, and a broken writer cannot hide behind a working in-memory grid. */
function _rtsEdText() {
  var E = window._rtsEd;
  return window.RA_INIMAP.inimapWrite(
    { tmpl: E.tmpl, tidx: E.tidx, resType: E.res },
    { title: E.title, author: E.author, bounds: E.bounds, spawns: E.spawns, trees: E.trees });
}

function _rtsEdCheck() {
  var M = rtsMapFromScenario(_rtsEdText(), 'editor');
  if (!M || M.error) { _rtsEdSay('Not playable yet: ' + ((M && M.error) || 'unreadable'), 'bad'); return null; }
  var s = M.stats || {};
  _rtsEdSay('Playable — ' + M.n + '×' + M.n + ' battlefield, ' + ((s.ore || 0) + (s.gems || 0)) +
            ' ore cells, ' + (s.trees || 0) + ' trees, both starts connected.', 'ok');
  return M;
}

function _rtsEdSave() {
  var E = window._rtsEd;
  var name = prompt('Name this map:', E.title || 'Untitled');
  if (name === null) return;
  E.title = name || 'Untitled';
  var blob = new Blob([_rtsEdText()], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = E.title.replace(/[^\w\-]+/g, '_').toLowerCase() + '.ini';
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  _rtsEdSay('Saved ' + a.download + '. Load it again with OPEN, or from the title screen.', 'ok');
}

function _rtsEdPlay() {
  var M = _rtsEdCheck();
  if (!M) return;
  window._RTS_MAP = M;
  if (typeof rtsStoreSaveMap === 'function') rtsStoreSaveMap(M);
  rtsEdClose();
  var home = document.getElementById('rtsHome');
  if (home) home.classList.add('gone');
  rtsOpen();
}

/* --------------------------------------------------------------- opening --
   Any map the game can read can be edited, whichever format it came in - the readers all
   produce the same shape, so this only has to copy that shape onto the 128x128 board. A map
   larger than the board is cropped, and says so rather than silently losing its far edge. */
function _rtsEdLoadFiles(files) {
  if (!files || !files.length) return;
  _rtsEdSay('Reading…');
  var scen = [].slice.call(files).filter(function (f) { return /\.(ini|mpr)$/i.test(f.name); })[0];
  var got;
  if (scen) {
    got = new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(rtsMapFromScenario(r.result, scen.name)); };
      r.onerror = function () { res({ error: 'could not read that file' }); };
      r.readAsText(scen);
    });
  } else {
    got = rtsMapLoadFiles(files);
  }
  got.then(function (M) {
    if (!M || M.error) { _rtsEdSay((M && M.error) || 'could not read that map', 'bad'); return; }
    _rtsEdAdopt(M);
  });
}

function _rtsEdAdopt(M) {
  var E = window._rtsEd;
  /* A map that failed to load has no grid on it. Callers do check, but adopting is also
     reachable from the editor's own reload path, and half-adopting a failed map leaves the
     board in a state no undo can get out of. */
  if (!E) return false;
  if (!M || M.error || !M.bin || !M.yaml) {
    _rtsEdSay((M && M.error) || 'that map could not be read', 'bad');
    return false;
  }
  var D = RTS_ED_DIM, b = M.bin, y = M.yaml;
  var cw = Math.min(D, b.w), ch = Math.min(D, b.h), x, z;
  E.tmpl = new Uint16Array(D * D); E.tidx = new Uint8Array(D * D); E.res = new Uint8Array(D * D);
  for (var i = 0; i < D * D; i++) E.tmpl[i] = 255;
  for (z = 0; z < ch; z++) {
    for (x = 0; x < cw; x++) {
      var s = z * b.w + x, d = z * D + x;
      E.tmpl[d] = b.tmpl[s]; E.tidx[d] = b.tidx[s];
      E.res[d] = b.resType[s] === 1 ? 1 : b.resType[s] === 2 ? 2 : 0;
    }
  }
  E.trees = (y.actors || []).filter(function (a) { return /^tc?\d\d$/.test(a.type); })
    .filter(function (a) { return a.x < D && a.y < D; })
    .map(function (a) { return { x: a.x, y: a.y, type: a.type }; });
  E.spawns = (y.spawns || []).filter(function (s) { return s.x < D && s.y < D; }).slice(0, 8)
    .map(function (s) { return { x: s.x, y: s.y }; });
  E.bounds = {
    x: Math.min(y.bounds.x, D - 8), y: Math.min(y.bounds.y, D - 8),
    w: Math.min(y.bounds.w, D - Math.min(y.bounds.x, D - 8)),
    h: Math.min(y.bounds.h, D - Math.min(y.bounds.y, D - 8))
  };
  E.title = M.title || 'Untitled'; E.author = M.author || '';
  _rtsEdRepaint();
  var cropped = (b.w > D || b.h > D);
  _rtsEdSay('Opened “' + E.title + '”' + (E.author ? ' by ' + E.author : '') +
            (cropped ? ' — cropped from ' + b.w + '×' + b.h + ' to fit the ' + D + '×' + D +
                       ' board Red Alert’s format stores.' : '.'), 'ok');
  return true;
}
