/* map/load.js - reading a map (.oramap zip, or loose map.bin + map.yaml), fitting it to
   the grid and classifying its cells. Part of rts.map. */

/* ------------------------------------------------------------------ load --
   A map arrives either as an .oramap (a zip) or as the loose map.bin + map.yaml pair that a
   zip would have contained. Both are accepted because both are what people actually have. */
function rtsMapLoadFiles(files) {
  var list = [], i;
  for (i = 0; i < files.length; i++) list.push(files[i]);
  if (!list.length) return Promise.resolve({ error: 'no files chosen' });

  function readAs(f, asText) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(asText ? r.result : new Uint8Array(r.result)); };
      r.onerror = function () { res(null); };
      if (asText) r.readAsText(f); else r.readAsArrayBuffer(f);
    });
  }

  var packed = list.filter(function (f) { return /\.oramap$/i.test(f.name); })[0];
  var binF   = list.filter(function (f) { return /(^|\/)map\.bin$/i.test(f.name); })[0];
  var ymlF   = list.filter(function (f) { return /(^|\/)map\.yaml$/i.test(f.name); })[0];
  var scen   = list.filter(function (f) { return /\.(mpr|ini)$/i.test(f.name); })[0];

  /* A loose .MPR or .INI is one of RA's own scenarios, and it carries its terrain inside
     itself - see ra/inimap.js. Handled first because it needs neither of the two files below. */
  if (scen && !packed && !binF) {
    return readAs(scen, true).then(function (txt) {
      return rtsMapFromScenario(txt, scen.name);
    });
  }

  var get;
  if (packed) {
    get = readAs(packed, false).then(function (buf) {
      var z = window.RA_ZIP.zipOpen(buf);
      if (z.error) return { error: 'not a readable .oramap: ' + z.error };
      return Promise.all([z.read('map.bin'), z.read('map.yaml')]).then(function (r) {
        if (!r[0] || !r[1]) return { error: 'the .oramap has no map.bin/map.yaml inside it' };
        var txt = '';
        for (var k = 0; k < r[1].length; k++) txt += String.fromCharCode(r[1][k]);
        return { bin: r[0], yaml: txt, name: packed.name };
      });
    });
  } else if (binF && ymlF) {
    get = Promise.all([readAs(binF, false), readAs(ymlF, true)]).then(function (r) {
      return { bin: r[0], yaml: r[1], name: ymlF.name };
    });
  } else {
    return Promise.resolve({ error: 'choose an .oramap file, or both map.bin and map.yaml' });
  }

  return get.then(function (g) {
    if (g.error) return g;
    var b = window.RA_MAP.ramapBin(g.bin);
    if (b.error) return { error: 'map.bin: ' + b.error };
    var y = window.RA_MAP.ramapYaml(g.yaml);
    if (y.error) return { error: 'map.yaml: ' + y.error };
    if (b.w !== y.w || b.h !== y.h) {
      return { error: 'map.bin says ' + b.w + 'x' + b.h + ' but map.yaml says ' + y.w + 'x' + y.h };
    }
    return _rtsMapAssemble(b, y, { bin: g.bin, yaml: g.yaml }, g.name);
  });
}

/* One of RA's own scenarios, from a loose .MPR/.INI or lifted out of MAIN.MIX. It comes out of
   ra/inimap.js in exactly the shape the .oramap path produces, so from here the two are the
   same map to everything downstream. */
function rtsMapFromScenario(text, name) {
  if (!window.RA_INIMAP) return { error: 'the scenario reader is not loaded' };
  var b = window.RA_INIMAP.inimapRead(text);
  if (b.error) return { error: name + ': ' + b.error };
  var y = window.RA_INIMAP.inimapMeta(text, name);
  return _rtsMapAssemble(b, y, { ini: text }, name);
}

/* The tail every map path shares: check the tileset, choose the window, size the battlefield,
   and build. Kept in one place so a map cannot be accepted by one route on terms another route
   would have refused. */
function _rtsMapAssemble(b, y, raw, name) {
  /* Temperate and snow are wired up; interior is not. Snow costs almost nothing because it is
     the same tile geometry repainted - every one of its 264 templates exists in the temperate
     classification table under the same name - so only the artwork and palette differ. Interior
     shares 2 templates with temperate rather than 264, so it needs a table of its own and is
     still refused, because saying so is more use than rendering it as a mess. */
  var th = (y.tileset || 'TEMPERAT').toUpperCase();
  if (!RTS_THEATRES[th]) {
    return { error: 'this is a ' + th + ' map - only temperate and snow maps work so far' };
  }
  var fit = _rtsMapFit(y);
  if (fit.error) return { error: fit.error };

  /* The grid is BUILT at the map's size, so RTS_N has to be that while the build runs - every
     helper below reads it. But it is put back afterwards unconditionally, success or not:
     assembling a map is not the same as adopting one, and the editor assembles maps purely to
     validate them. _rtsNewGame is the only place that adopts a size, from _RTS_MAP.n. */
  var prevN = RTS_N;
  RTS_N = fit.n;
  var M = { bin: b, yaml: y, fit: fit, name: name, title: y.title, author: y.author, n: fit.n,
            /* the theatre this map is drawn in - adopting the map adopts its artwork */
            theatre: th,
            /* the bytes as they arrived, so rts.store.js can remember the map and re-read it
               through whatever these rules look like on the next visit */
            raw: raw };
  /* Build now so an unplayable map is refused at the menu rather than at the battle. */
  var built = _rtsMapBuild(M);
  RTS_N = prevN;                       /* always - see above */
  if (built.error) return { error: built.error };
  M.built = built;
  M.stats = built.stats;
  return M;
}

/* Drop the loaded map and go back to generating. Putting the grid size back is the part that
   matters - leaving RTS_N at a loaded map's size would silently resize the generated map too. */
function rtsMapClear() {
  window._RTS_MAP = null;
  RTS_N = RTS_MAP_DEFAULT_N;
  /* Generated battles are temperate, so dropping a snow map has to put the artwork back or the
     next generated one is drawn with a snow palette. */
  if (typeof rtsSetTheatre === 'function') rtsSetTheatre('TEMPERAT');
}

/* ------------------------------------------------------------------- fit --
   Choose the square window. Centring it on the CENTROID of the spawns is the obvious move and
   the wrong one: on a wide map with starts at both ends the centroid is the middle, and a
   window centred there contains neither end. A match needs two starts, not eight - so take
   the furthest-apart PAIR that fits, and centre on them. That optimises for distance between
   the two bases, which is the thing that makes a match worth playing. */
function _rtsMapFit(y) {
  var b = y.bounds;
  var n = Math.min(RTS_MAP_MAXN, b.w, b.h);
  if (n < RTS_MAP_MINN) {
    return { error: 'playable area is only ' + b.w + 'x' + b.h + ' - too small for a battle' };
  }
  var sp = y.spawns || [], best = null, i, j;
  for (i = 0; i < sp.length; i++) {
    for (j = i + 1; j < sp.length; j++) {
      var a = sp[i], c = sp[j];
      if (Math.abs(a.x - c.x) > n - 2 * RTS_MAP_EDGE) continue;
      if (Math.abs(a.y - c.y) > n - 2 * RTS_MAP_EDGE) continue;
      var d = Math.hypot(a.x - c.x, a.y - c.y);
      if (!best || d > best.d) best = { a: a, c: c, d: d };
    }
  }
  var cx = best ? (best.a.x + best.c.x) / 2 : b.x + b.w / 2;
  var cy = best ? (best.a.y + best.c.y) / 2 : b.y + b.h / 2;
  var ox = Math.max(b.x, Math.min(b.x + b.w - n, Math.round(cx - n / 2)));
  var oy = Math.max(b.y, Math.min(b.y + b.h - n, Math.round(cy - n / 2)));
  return { n: n, ox: ox, oy: oy, pair: best ? [best.a, best.c] : null };
}

/* --------------------------------------------------------------- classify --
   The land class under one map cell. A template id the table does not know, or a tile index
   past the end of its row, is treated as clear rather than as an error - an unknown piece of
   scenery should not become an invisible wall in the middle of the battlefield. */
function _rtsMapClass(b, mx, my, theatre) {
  var k = my * b.w + mx;
  var tab = window.raTileTab ? window.raTileTab(theatre) : window.RA_TILETAB;
  var id = b.tmpl[k], rec = tab[id];
  if (!rec) return 'c';
  var ch = rec.t.charAt(b.tidx[k]);
  return ch || 'c';
}

