/* Play on a real Red Alert map.

   Everything else on this battlefield is generated, and for cliffs and coastlines that was
   always going to hit a wall: RA's terrain templates carry no orientation. The enum is
   SHORE01..SHORE37 - numbered, not oriented - their passability masks are nearly all "solid"
   because terrain type encodes what you can drive on rather than what shape the art is, and
   the map editor RA shipped just stamps whichever piece the human picked. There is nothing
   for a generator to reason from. A MAP, though, already contains the answer: a person placed
   every piece, and the placement is the data.

   So the map is not generated here, it is READ. The player supplies a map file the same way
   they supply the artwork, for the same reason - nothing of anyone else's ships in this repo.

   What a loaded map replaces:

     terrain + passability   from the template under each cell (ra/tiletab.js classifies it)
     ore and gems            from the map's own resource layer, not scattered by us
     start positions         the spawn points its author placed, when they are usable

   What it does NOT replace: the rules, the units, the AI. It is a battlefield, not a mission.

   The grid is square (RTS_N x RTS_N) and real maps are not - they run from 56x56 to 192x192
   in the published set - so a square WINDOW is taken out of the map's playable bounds. The
   alternative, splitting the grid into separate width and height, means touching every one of
   the ~55 places that do coordinate arithmetic, with no test suite underneath. The window
   costs a border; the refactor could cost correctness everywhere. */

var RTS_MAP_DEFAULT_N = RTS_N;   /* the generated map's size, to restore when a map is dropped */
var RTS_MAP_MAXN = 160;   /* bigger than this and the sim is doing work nobody can see */
var RTS_MAP_MINN = 48;    /* smaller and there is no room for two bases and a fight */
var RTS_MAP_EDGE = 10;    /* a start this close to the window edge has nowhere to build */

/* The loaded map, or null for "generate one". Lives on window so a battle started from any
   path sees the same answer. */
window._RTS_MAP = window._RTS_MAP || null;

/* ============================================================== MAIN.MIX ==
   The maps that came with the player's own copy of the game.

   Everything above reads what the community publishes. This reads what is inside MAIN.MIX -
   the archive RA installs, which is a container of containers: general.mix, redalert.mix and
   the rest are nested inside it, and the scenarios are nested inside those.

   Two problems make this more than "open the file".

   FIRST, a MIX index stores HASHES, not names. There is no directory to list; the only
   question that can be asked is "is this exact name present". So the names have to be
   generated, and RA's scheme is rigid enough to enumerate exhaustively:

       sc <side> <nn> <dir> <var> . ini|mpr        SCENARIO.CPP Set_Scenario_Name
          g|u|m   01-99  e|w   a-e

   That is ~6000 candidates, which is nothing to hash. (An earlier pass through this had the
   last two fields the wrong way round - variant before direction - which finds nothing at all
   and looks exactly like "there are no maps in here".)

   SECOND, MAIN.MIX is hundreds of megabytes and the browser must not hold it. It does not
   have to: the index sits at the front, and every entry record carries an absolute offset and
   length. So only the head is read, and individual entries are pulled out with File.slice -
   which the browser satisfies straight off disk. Reading the whole archive to get at a 40 KB
   scenario would be the obvious approach and would also be the one that runs the tab out of
   memory. */

var RTS_MAP_MIX_HEAD = 6 << 20;   /* enough for any real index; ~500k entries */

/* The nested archives worth descending into. Listing them is not a shortcut - a MIX cannot be
   enumerated, so a nested archive can only be found by guessing its name too. */
var RTS_MAP_NEST = ['general.mix', 'redalert.mix', 'expand.mix', 'expand2.mix', 'aftrmath.mix',
                    'mplayer.mix', 'missions.mix', 'local.mix', 'main.mix', 'hires.mix',
                    'lores.mix', 'conquer.mix', 'transit.mix', 'editor.mix'];

var _RTS_SCEN_NAMES = null;
function _rtsMapScenNames() {
  if (_RTS_SCEN_NAMES) return _RTS_SCEN_NAMES;
  var out = [], sides = ['g', 'u', 'm'], dirs = ['e', 'w'], vars = ['a', 'b', 'c', 'd', 'e'];
  for (var s = 0; s < sides.length; s++) {
    for (var n = 1; n <= 99; n++) {
      var nn = (n < 10 ? '0' : '') + n;
      for (var d = 0; d < dirs.length; d++) {
        for (var v = 0; v < vars.length; v++) {
          var stem = 'sc' + sides[s] + nn + dirs[d] + vars[v];
          out.push(stem + '.ini'); out.push(stem + '.mpr');
        }
      }
    }
  }
  return (_RTS_SCEN_NAMES = out);
}

function _rtsSliceBytes(file, from, len) {
  return new Promise(function (res) {
    var fr = new FileReader();
    fr.onload = function () { res(new Uint8Array(fr.result)); };
    fr.onerror = function () { res(null); };
    fr.readAsArrayBuffer(file.slice(from, from + len));
  });
}

/* Open an archive's index from its first few megabytes. The reader only ever touches the
   header and the index to build the file list, so a truncated buffer is enough - the entry
   offsets it hands back are absolute and are used against the File, not against this. */
function _rtsMapMixIndex(file) {
  return _rtsSliceBytes(file, 0, Math.min(RTS_MAP_MIX_HEAD, file.size)).then(function (head) {
    if (!head) return null;
    var a;
    try { a = window.RA_MIX.mixOpen(head); } catch (e) { return null; }
    return (a && !a.error) ? a : null;
  });
}

function _rtsMapMixEntry(file, archive, name) {
  var rec = archive.byId(window.RA_MIX.mixHash(name));
  if (!rec || rec.offset + rec.size > file.size) return Promise.resolve(null);
  return _rtsSliceBytes(file, rec.offset, rec.size);
}

/* Find every scenario in a .mix, descending one level into the nested archives. Returns the
   list; loading one is a separate step, because a player choosing a map wants to see what is
   there before committing to one. */
function rtsMapScanMix(file, onProgress) {
  var found = [], names = _rtsMapScenNames();

  function scan(archive, bytesOf, label, depth) {
    var hits = [], i;
    for (i = 0; i < names.length; i++) {
      if (archive.has(names[i])) hits.push({ name: names[i], from: label });
    }
    hits.forEach(function (h) { h.get = bytesOf; found.push(h); });
    if (onProgress) onProgress(label + ': ' + archive.count + ' entries, ' + hits.length + ' maps');
    if (depth <= 0) return Promise.resolve();

    /* descend: pull each nested archive out whole and scan it the same way */
    var nest = RTS_MAP_NEST.filter(function (nm) { return archive.has(nm) && nm !== label; });
    return nest.reduce(function (chain, nm) {
      return chain.then(function () {
        return bytesOf(nm).then(function (sub) {
          if (!sub) return;
          var a;
          try { a = window.RA_MIX.mixOpen(sub); } catch (e) { return; }
          if (!a || a.error) return;
          return scan(a, function (inner) {
            return Promise.resolve(a.read(inner));
          }, nm, depth - 1);
        });
      });
    }, Promise.resolve());
  }

  return _rtsMapMixIndex(file).then(function (top) {
    if (!top) return { error: 'that file is not a readable MIX archive' };
    return scan(top, function (nm) { return _rtsMapMixEntry(file, top, nm); },
                String(file.name || 'archive').toLowerCase(), 1)
      .then(function () {
        if (!found.length) {
          return { error: 'no scenarios in there. MAIN.MIX from a full install is the one that ' +
                          'has them - the art archives on their own do not.' };
        }
        return { maps: found };
      });
  }).catch(function (e) { return { error: 'could not scan that archive: ' + ((e && e.message) || e) }; });
}

/* The list of scenarios found in an archive. A plain <select>, because the interesting part
   is which map you get, not the chrome around choosing it. Each entry knows how to fetch its
   own bytes - the archive itself is never held. */
function _rtsMapListHide() {
  var el = document.getElementById('rtsMapList');
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
function _rtsMapListShow(maps, note) {
  _rtsMapListHide();
  var wrap = document.createElement('div');
  wrap.id = 'rtsMapList';
  var sel = document.createElement('select');
  maps.forEach(function (m, i) {
    var o = document.createElement('option');
    o.value = String(i);
    o.textContent = m.name + '  (' + m.from + ')';
    sel.appendChild(o);
  });
  var btn = document.createElement('button');
  /* deliberately after `btn` exists - the labelling pass disables it while it runs */
  setTimeout(function () { _rtsMapLabel(maps, sel, btn, note); }, 0);
  btn.type = 'button'; btn.textContent = 'LOAD';
  btn.onclick = function () {
    var m = maps[sel.value | 0];
    note.textContent = 'Reading ' + m.name + '…'; note.className = '';
    btn.disabled = true;
    m.get(m.name).then(function (bytes) {
      btn.disabled = false;
      if (!bytes) { note.textContent = 'could not read ' + m.name; note.className = 'bad'; return; }
      var txt = '';
      for (var i = 0; i < bytes.length; i++) txt += String.fromCharCode(bytes[i]);
      var M = rtsMapFromScenario(txt, m.name);
      if (!M || M.error) {
        rtsMapClear();
        note.textContent = (M && M.error) || 'could not read that scenario';
        note.className = 'bad';
        return;
      }
      window._RTS_MAP = M;
      if (typeof rtsStoreSaveMap === 'function') rtsStoreSaveMap(M);
      note.textContent = rtsMapDescribe(M);
      note.className = 'ok';
    });
  };
  wrap.appendChild(sel); wrap.appendChild(btn);
  note.parentNode.appendChild(wrap);
}

/* Put the real names on the list.

   A full install answers "which scenarios are in here?" with sixty-odd entries called
   scg01ea.ini, which is the archive's filename and not a name anybody chose. The scenario itself
   carries the one the game shows - scg01ea is "A Path Beyond" - and it also carries the terrain,
   so the same read that gets the title gets whether the map has a coast and whether it loads at
   all. Doing it once up front beats making the player load sixty maps to find the one they want.

   This reads every scenario through `rtsMapFromScenario`, the exact call LOAD makes, so a label
   cannot promise something the loader then refuses; a scenario that throws here is one that would
   have failed on selection, and is marked unplayable instead of left as a trap. Reading one costs
   single-digit to ~30ms, so a full install is a second or so - done a slice at a time so the
   title screen keeps painting rather than locking up.

   It is careful to touch no global state: `rtsMapFromScenario` saves and restores RTS_N itself,
   and `window._RTS_MAP` is only ever set by LOAD. Scanning the list must not change which map
   you are about to play. */
function _rtsMapLabel(maps, sel, btn, note) {
  var good = 0, coastal = 0, bad = 0;
  btn.disabled = true;

  /* Sequential rather than all-at-once. The bytes come from slicing the File, so sixty parallel
     reads would have sixty scenario buffers alive at the same moment - the same mistake that
     put 641 MB on the heap when the loader read whole archives. One at a time costs nothing
     here because the work is dominated by parsing, not by I/O. */
  return maps.reduce(function (chain, m, i) {
    return chain.then(function () {
      note.textContent = 'Reading scenario ' + (i + 1) + ' of ' + maps.length + '…';
      note.className = '';
      return m.get(m.name).then(function (bytes) {
        label(m, sel.options[i], bytes);
      }, function () { mark(sel.options[i], m, 'unreadable'); });
    });
  }, Promise.resolve()).then(function () {
    btn.disabled = false;
    note.textContent = maps.length + ' scenario' + (maps.length === 1 ? '' : 's') + ' — ' +
      good + ' playable, ' + coastal + ' with a coast for naval yards' +
      (bad ? ', ' + bad + ' unreadable' : '') + '. Choose one:';
    note.className = 'ok';
    return { good: good, coastal: coastal, bad: bad };
  });

  function mark(opt, m, why) {
    bad++;
    if (!opt) return;
    opt.textContent = m.name + ' — ' + why;
    opt.disabled = true;
  }

  function label(m, opt, bytes) {
    if (!bytes) { mark(opt, m, 'unreadable'); return; }
    var txt = '', k;
    for (k = 0; k < bytes.length; k++) txt += String.fromCharCode(bytes[k]);
    var M;
    try { M = rtsMapFromScenario(txt, m.name); } catch (e) { M = null; }
    if (!M || M.error) { mark(opt, m, (M && M.error) || 'unreadable'); return; }
    good++;
    var s = M.stats || {};
    if (s.shore > 0) coastal++;
    if (!opt) return;
    /* The anchor is the point of the whole pass: it is the one property you cannot guess from a
       name, and it is scannable down a list in a way a sentence is not. */
    opt.textContent = (s.shore > 0 ? '⚓ ' : '') + M.title +
      '  (' + m.name + (s.shore > 0 ? ', coastal' : '') + ')';
  }
}

/* One line describing a loaded map, shared by the picker and by the restore-on-boot path so
   they cannot drift into saying different things about the same map. */
function rtsMapDescribe(M) {
  var s = M.stats || {};
  /* Whether you can have a navy is the one thing about a map you cannot see from its name, and
     the ships are useless without it - so it is said outright rather than left to be discovered
     by building a yard and finding nowhere to put it. Water with no legal yard site is its own
     answer: the sea is scenery on that map. */
  var navy = !s.water ? 'landlocked'
           : s.shore  ? 'coastal — ' + s.water + ' water cells, naval yards buildable'
                      : 'has water but no shore flat enough for a naval yard';
  return '“' + M.title + '”' + (M.author ? ' by ' + M.author : '') +
         ' — ' + M.n + '×' + M.n + ' of ' + M.yaml.w + '×' + M.yaml.h +
         ', ' + ((s.ore || 0) + (s.gems || 0)) + ' ore cells, ' + (s.trees || 0) +
         ' trees, ' + navy + '. Start a battle to play it.';
}

/* The file picker on the title screen. Mirrors rtsMixPicked: read, report in place, and never
   half-apply - a map that fails validation leaves the previous state alone rather than
   dropping the player onto a broken battlefield. */
function rtsMapPicked(input) {
  var note = document.getElementById('rtsMapNote');
  function say(msg, cls) { if (note) { note.textContent = msg; note.className = cls || ''; } }
  if (!input.files || !input.files.length) return;
  _rtsMapListHide();

  /* A .mix is not a map, it is an archive that may CONTAIN maps - so it gets scanned and the
     player picks from what turned up, rather than the game choosing one for them. */
  var mixF = [].slice.call(input.files).filter(function (f) { return /\.mix$/i.test(f.name); })[0];
  if (mixF) {
    say('Searching ' + mixF.name + ' for scenarios…');
    rtsMapScanMix(mixF, function (p) { say('Searching… ' + p); }).then(function (r) {
      if (r.error) { say(r.error, 'bad'); return; }
      say('Found ' + r.maps.length + ' scenario' + (r.maps.length === 1 ? '' : 's') + ' in ' +
          mixF.name + '. Choose one:', 'ok');
      _rtsMapListShow(r.maps, note);
    });
    return;
  }

  say('Reading...');
  rtsMapLoadFiles(input.files).then(function (M) {
    if (!M || M.error) { rtsMapClear(); say(M ? M.error : 'could not read that map', 'bad'); return; }
    window._RTS_MAP = M;
    if (typeof rtsStoreSaveMap === 'function') rtsStoreSaveMap(M);   /* chosen once, not every visit */
    say(rtsMapDescribe(M), 'ok');
  }, function (e) {
    rtsMapClear();
    say('could not read that map: ' + ((e && e.message) || e), 'bad');
  });
}

/* Land class letter -> the game's terrain enum, and whether it stops a unit.
   Straight out of world.yaml's ground locomotors: they list Clear, Rough, Road, Bridge, Ore,
   Gems and Beach, and omit Rock, Water and River - so that omission IS the obstacle list.

   Rough maps onto plain ground rather than onto RTS_T_ROCK, which blocks. When a real map is
   loaded the picture comes from the real template art, so this enum only has to drive
   gameplay - passability, where ore may sit, what counts as water for a splash - and not
   appearance. That is why collapsing rough onto grass costs nothing visually. */
var RTS_MAP_LAND = {
  c: { t: 0, block: 0 },   /* clear   -> grass          */
  r: { t: 0, block: 0 },   /* rough   -> grass, drivable */
  d: { t: 4, block: 0 },   /* road                       */
  g: { t: 4, block: 0 },   /* bridge  -> road            */
  b: { t: 5, block: 0 },   /* beach   -> sand            */
  k: { t: 2, block: 2 },   /* rock    -> cliff, blocks   */
  w: { t: 3, block: 2 },   /* water                      */
  i: { t: 3, block: 2 },   /* river   -> water           */
  '-': { t: 0, block: 0 }  /* a hole in the template     */
};

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

/* ------------------------------------------------------------------ build --
   Turn the loaded map into the four grids a battle runs on. This happens at LOAD time, not at
   battle start, for one reason: it is where the map can be found unplayable, and a player who
   picked a bad map should be told so while they are still looking at the menu rather than
   dropped into a battle that cannot be fought.

   Ore is marked here, not sized here. The generated path sets a cell to 1 as a shape marker
   and lets _rtsTiberiumAdjust derive the real density from how many of the eight neighbours
   also carry ore - CELL.CPP's rule, and the reason a field reads thick in the middle and thin
   at the edge. A real map's own density byte is deliberately ignored so that both kinds of
   map feed the same pass and a field is worth the same wherever it came from. */
function _rtsMapBuild(M) {
  var b = M.bin, f = M.fit, N = RTS_N, tx, tz;
  var G = {
    terrain: new Uint8Array(N * N),
    blocked: new Uint8Array(N * N),
    scrap:   new Float32Array(N * N),
    gems:    new Uint8Array(N * N)
  };
  var ore = 0, gems = 0, blocked = 0;

  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      var mx = f.ox + tx, my = f.oy + tz, i = _rtsIdx(tx, tz);
      if (mx < 0 || my < 0 || mx >= b.w || my >= b.h) {   /* window ran off the map */
        G.terrain[i] = RTS_T_ROCK; G.blocked[i] = 2; blocked++;
        continue;
      }
      var L = RTS_MAP_LAND[_rtsMapClass(b, mx, my, M.theatre)] || RTS_MAP_LAND.c;
      G.terrain[i] = L.t;
      G.blocked[i] = L.block;
      if (L.block) { blocked++; continue; }

      /* ResourceIndex 1 is ore and 2 is gems (world.yaml). 3 is a wall, which only RA's own
         scenarios carry - OverlayPack stores sandbag/fence/concrete walls in the same layer
         as the ore, and they are obstacles, not scenery. */
      var rt = b.resType[my * b.w + mx];
      if (rt === 1) { G.scrap[i] = 1; ore++; }
      else if (rt === 2) { G.scrap[i] = 1; G.gems[i] = 1; gems++; }
      else if (rt === 3) { G.terrain[i] = RTS_T_WALL; G.blocked[i] = 2; blocked++; }
    }
  }

  /* Trees are not terrain. RA stores them as ACTORS - t01, t05, tc02 and so on - so a map
     read from the tile layer alone comes out treeless, which is why the forests were missing
     from the first render. They are placed here, over the terrain, because a tree sitting on
     water or on a cliff is the map's business and not ours to second-guess. */
  var trees = 0, acts = M.yaml.actors || [];
  for (var a = 0; a < acts.length; a++) {
    if (!/^tc?\d\d$/.test(acts[a].type)) continue;
    var ax = acts[a].x - f.ox, az = acts[a].y - f.oy;
    if (!_rtsInB(ax, az)) continue;
    var ai = _rtsIdx(ax, az);
    if (G.blocked[ai]) continue;                    /* already a cliff or the sea */
    G.terrain[ai] = RTS_T_TREE; G.blocked[ai] = 2;
    G.scrap[ai] = 0; G.gems[ai] = 0;
    trees++; blocked++;
  }

  var starts = _rtsMapStarts(G, M) || _rtsMapFallbackStarts(G);
  if (!starts) return { error: 'could not find two places on this map to put a base' };
  var bad = _rtsMapCheck(G, starts);
  if (bad) return { error: bad };

  var sea = _rtsMapSea(G, N);
  return { grid: G, starts: starts,
           stats: { ore: ore, gems: gems, trees: trees, blocked: blocked,
                    water: sea.water, shore: sea.shore } };
}

/* Is there a navy to be had on this map? Two questions, and only the second one matters to a
   player: a map can be covered in water and still have nowhere to put a shipyard, because every
   inch of its coast is cliff. So this counts water cells AND the places a yard would actually be
   legal - a clear footprint whose surrounding ring touches the sea, which is `_rtsCanPlace` plus
   `_rtsShoreOk` asked of the grid before the game owns it.

   Counted here rather than read off `window._rtsG` because this runs at map-load time, on the
   title screen, where there is no game yet. The whole point is to answer "can I build ships on
   this?" BEFORE committing to a battle, since the alternative is loading scenarios one at a time
   and squinting at them. */
function _rtsMapSea(G, N) {
  var water = 0, shore = 0, i, x, z;
  for (i = 0; i < N * N; i++) if (G.terrain[i] === RTS_T_WATER) water++;
  if (!water) return { water: 0, shore: 0 };

  var d = (typeof rtsStructDef === 'function') && rtsStructDef('navalyard');
  var w = (d && d.w) || 3, h = (d && d.h) || 3;
  for (z = 0; z + h <= N; z++) {
    for (x = 0; x + w <= N; x++) {
      var free = true, ax, az;
      for (ax = x; ax < x + w && free; ax++)
        for (az = z; az < z + h && free; az++)
          if (G.blocked[_rtsIdx(ax, az)] !== 0 || G.scrap[_rtsIdx(ax, az)] > 0) free = false;
      if (!free) continue;
      var touches = false;
      for (var ox = -1; ox <= w && !touches; ox++) {
        for (var oz = -1; oz <= h; oz++) {
          if (ox >= 0 && ox < w && oz >= 0 && oz < h) continue;   /* inside the footprint */
          var cx = x + ox, cz = z + oz;
          if (_rtsInB(cx, cz) && G.terrain[_rtsIdx(cx, cz)] === RTS_T_WATER) { touches = true; break; }
        }
      }
      if (touches) shore++;
    }
  }
  return { water: water, shore: shore };
}

/* Copy the prepared grids onto a fresh game state, in place of _rtsGenTerrain. Returns the
   start positions, or null when no map is loaded - which is how generating stays the default. */
function _rtsMapApply(G) {
  var M = window._RTS_MAP;
  if (!M || !M.built) return null;
  G.terrain.set(M.built.grid.terrain);
  G.blocked.set(M.built.grid.blocked);
  G.scrap.set(M.built.grid.scrap);
  G.gems.set(M.built.grid.gems);
  return { player: { tx: M.built.starts.player.tx, tz: M.built.starts.player.tz },
           enemy:  { tx: M.built.starts.enemy.tx,  tz: M.built.starts.enemy.tz } };
}

/* ----------------------------------------------------------------- starts --
   Prefer the spawn points the map's author placed; they are chosen with knowledge of the
   terrain that no heuristic here has. But an authored spawn can still be unusable once the
   window has been cropped, so each one is checked for buildable room and quietly nudged if
   it is a tile or two inside a cliff. If fewer than two survive, fall back to picking starts
   the generated way - the terrain is still real, only the placement is ours. */
function _rtsMapStarts(G, M) {
  var f = M.fit, out = [], i;
  var sp = (M.yaml.spawns || []).map(function (s) {
    return { tx: s.x - f.ox, tz: s.y - f.oy };
  }).filter(function (s) {
    return s.tx >= RTS_MAP_EDGE && s.tz >= RTS_MAP_EDGE &&
           s.tx < RTS_N - RTS_MAP_EDGE && s.tz < RTS_N - RTS_MAP_EDGE;
  });

  for (i = 0; i < sp.length; i++) {
    var fixed = _rtsMapClearSpot(G, sp[i].tx, sp[i].tz);
    if (fixed) out.push(fixed);
  }
  if (out.length < 2) return null;                 /* caller falls back to _rtsPickStarts */

  /* Two houses, furthest apart, exactly as the generated picker does it. */
  var bi = 0, bj = 1, bd = -1;
  for (i = 0; i < out.length; i++) {
    for (var j = i + 1; j < out.length; j++) {
      var d = Math.hypot(out[i].tx - out[j].tx, out[i].tz - out[j].tz);
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
  }
  return { player: out[bi], enemy: out[bj] };
}

/* No usable authored spawns - a campaign map, or one whose starts the window cropped away.
   The terrain is still real; only the placement falls back to ours. Same rule the generated
   picker uses (a ring inset from the edge, then the furthest-apart pair), but every candidate
   is dragged to open ground first, because on a real map a ring position lands in the sea
   about as often as not. */
function _rtsMapFallbackStarts(G) {
  var cand = [], n = 16, R = RTS_N * 0.36, mid = RTS_N / 2, i, j;
  for (i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    var spot = _rtsMapClearSpot(G, Math.round(mid + Math.cos(a) * R), Math.round(mid + Math.sin(a) * R));
    if (spot) cand.push(spot);
  }
  if (cand.length < 2) return null;
  var bi = 0, bj = 1, bd = -1;
  for (i = 0; i < cand.length; i++) {
    for (j = i + 1; j < cand.length; j++) {
      var d = Math.hypot(cand[i].tx - cand[j].tx, cand[i].tz - cand[j].tz);
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
  }
  return { player: cand[bi], enemy: cand[bj] };
}

/* A start needs a clear patch, not just a clear tile. Search outward for a spot whose
   surroundings are mostly buildable; give up rather than return somewhere a yard cannot go. */
function _rtsMapClearSpot(G, tx, tz) {
  function open(cx, cz) {
    var free = 0, tot = 0;
    for (var ox = -4; ox <= 4; ox++) {
      for (var oz = -4; oz <= 4; oz++) {
        var x = cx + ox, z = cz + oz;
        if (!_rtsInB(x, z)) return -1;
        tot++;
        if (!G.blocked[_rtsIdx(x, z)]) free++;
      }
    }
    return free / tot;
  }
  if (open(tx, tz) >= 0.8) return { tx: tx, tz: tz };
  for (var r = 1; r <= 8; r++) {
    for (var a = 0; a < 16; a++) {
      var th = (a / 16) * Math.PI * 2;
      var cx = Math.round(tx + Math.cos(th) * r * 2), cz = Math.round(tz + Math.sin(th) * r * 2);
      if (cx < RTS_MAP_EDGE || cz < RTS_MAP_EDGE ||
          cx >= RTS_N - RTS_MAP_EDGE || cz >= RTS_N - RTS_MAP_EDGE) continue;
      if (open(cx, cz) >= 0.8) return { tx: cx, tz: cz };
    }
  }
  return null;
}

/* ----------------------------------------------------------- connectivity --
   A generated map guarantees a route between the bases by carving roads last. A real map
   guarantees nothing: its author may have meant the two halves to be joined by a bridge, or
   by a transport, and cropping a window can sever a route that existed on the full map. So
   this checks, and the caller refuses a map that fails rather than starting a battle that
   cannot be fought. Plain flood fill from one start - the pathfinder's own rules, without
   the pathfinder, because it only has to answer "reachable at all". */
function _rtsMapReach(G, from) {
  var N = RTS_N, seen = new Uint8Array(N * N), q = [_rtsIdx(from.tx, from.tz)];
  seen[q[0]] = 1;
  for (var h = 0; h < q.length; h++) {
    var cur = q[h], cx = cur % N, cz = (cur / N) | 0;
    for (var d = 0; d < 4; d++) {
      var nx = cx + [1, -1, 0, 0][d], nz = cz + [0, 0, 1, -1][d];
      if (!_rtsInB(nx, nz)) continue;
      var ni = _rtsIdx(nx, nz);
      if (seen[ni] || G.blocked[ni]) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  return seen;
}

/* Does this map hold together as a battlefield? Both bases must be able to reach each other,
   and each must be able to reach ore, or its economy never starts. */
function _rtsMapCheck(G, starts) {
  var seen = _rtsMapReach(G, starts.player);
  if (!seen[_rtsIdx(starts.enemy.tx, starts.enemy.tz)]) {
    return 'the two start positions have no route between them';
  }
  var ore = 0;
  for (var i = 0; i < seen.length; i++) if (seen[i] && G.scrap[i] > 0) ore++;
  if (!ore) return 'no ore is reachable from the start positions';
  return null;
}

/* ------------------------------------------------------------------ paint --
   Draw the real template art for one cell, exact - the template and tile the map names, not a
   random pick from a set the way generated ground is painted. Returns false when the artwork
   is not loaded or the tile is a hole, so the caller can fall back to its own ground. */
function _rtsMapPaintCell(d, S, tx, tz) {
  var M = window._RTS_MAP;
  if (!M || !_rtsArtReady()) return false;
  var b = M.bin, f = M.fit;
  var mx = f.ox + tx, my = f.oy + tz;
  if (mx < 0 || my < 0 || mx >= b.w || my >= b.h) return false;
  var tab = window.raTileTab ? window.raTileTab(M.theatre) : window.RA_TILETAB;
  var k = my * b.w + mx, rec = tab[b.tmpl[k]];
  if (!rec) return false;
  var set = _mixTiles(rec.img + _rtsThExt());
  if (!set) return false;
  var t = set.tile[b.tidx[k]];
  if (!t) return false;                              /* a hole in the template */
  var pal = RTS_MIX.pal;
  for (var y = 0; y < RTS_TS; y++) {
    var row = (tz * RTS_TS + y) * S;
    for (var x = 0; x < RTS_TS; x++) {
      var p = t[y * RTS_TS + x] * 3, o = (row + tx * RTS_TS + x) * 4;
      d[o] = pal[p]; d[o + 1] = pal[p + 1]; d[o + 2] = pal[p + 2]; d[o + 3] = 255;
    }
  }
  return true;
}
