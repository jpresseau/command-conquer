/* map/mainmix.js - the template tables: what each terrain template in MAIN.MIX is, and
   how it maps onto this game's land types. Part of rts.map. */

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
function _rtsMapListShow(maps, note, remember) {
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
  setTimeout(function () { _rtsMapLabel(maps, sel, btn, note, remember); }, 0);
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
      if (typeof rtsPickDoneMap === 'function') rtsPickDoneMap();
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
function _rtsMapLabel(maps, sel, btn, note, remember) {
  var good = 0, coastal = 0, bad = 0;
  /* This pass already holds every scenario's bytes, one at a time, to read its title. KEEPING
     them costs a few megabytes and buys the whole list back on the next visit with no file
     dialog and no archive scan - see rtsStoreSaveScen. `remember` is false when the list came
     FROM the store, so a restore does not rewrite what it has just read. */
  var keep = remember === false ? null : [];
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
        if (keep && bytes && bytes.length) keep.push({ name: m.name, from: m.from, bytes: bytes });
      }, function () { mark(sel.options[i], m, 'unreadable'); });
    });
  }, Promise.resolve()).then(function () {
    btn.disabled = false;
    note.textContent = maps.length + ' scenario' + (maps.length === 1 ? '' : 's') + ' — ' +
      good + ' playable, ' + coastal + ' with a coast for naval yards' +
      (bad ? ', ' + bad + ' unreadable' : '') + '. Choose one:';
    note.className = 'ok';
    /* After the summary, never before it: remembering is a convenience and must not be able to
       delay or break the list the player is looking at. */
    if (keep && keep.length && typeof rtsStoreSaveScen === 'function') rtsStoreSaveScen(keep);
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

/* Put the remembered scenario list back on the title screen.

   Same UI, same labelling pass, same LOAD button as a fresh scan - the only difference is that
   the bytes come out of IndexedDB rather than out of a file the player had to find again. It
   is passed remember=false so the pass does not write back the list it just read.

   Returns false when there is nothing stored, which is the ordinary first-visit case and not
   an error: the caller simply leaves the picker's own instructions in place. */
function rtsMapShowStored(rec) {
  if (!rec || !rec.maps || !rec.maps.length) return false;
  var note = document.getElementById('rtsMapNote');
  if (!note || !note.parentNode) return false;
  _rtsMapListHide();
  /* THE LIST GETS ITS OWN LINE. The labelling pass ends by overwriting its note with the
     "N scenarios - X playable. Choose one:" summary, and the map note is already saying which
     map was restored - sharing one element would mean the list silently erased that. */
  var sub = document.getElementById('rtsScenNote');
  if (!sub) {
    sub = document.createElement('div');
    sub.id = 'rtsScenNote';
    note.parentNode.appendChild(sub);
  }
  sub.textContent = rec.maps.length + ' scenario' + (rec.maps.length === 1 ? '' : 's') +
    ' remembered from last time (' + (rec.bytes / 1048576).toFixed(1) + ' MB) — reading…';
  sub.className = '';
  _rtsMapListShow(rec.maps, sub, false);
  return true;
}

/* Sort key for "which archive on this disc is worth opening first". Purely an ordering: nothing
   is EXCLUDED by it, because a name this list has never heard of is exactly the case where
   guessing has burned us before. */
function _rtsMapScanRank(name) {
  var n = String(name).toLowerCase();
  if (/^(main|redalert)\.mix$/.test(n)) return 0;
  if (/^(general|missions|mplayer|expand2?|aftrmath)\.mix$/.test(n)) return 1;
  if (/^movies\d*\.mix$/.test(n)) return 3;      /* hundreds of megabytes, never scenarios */
  return 2;
}

/* Scan several archives and show the union. Sequential rather than parallel for the reason the
   scenario labeller is: the bytes come from slicing a File, so a dozen at once would have a
   dozen archive buffers alive at the same moment. */
function _rtsMapScanMany(files, label, note, say) {
  var all = [], seen = {};
  return files.reduce(function (chain, f, i) {
    return chain.then(function () {
      say('Searching ' + label + ' — ' + f.name + ' (' + (i + 1) + ' of ' + files.length + ')…');
      return rtsMapScanMix(f, function (p) { say('Searching ' + f.name + '… ' + p); })
        .then(function (r) {
          if (!r || r.error || !r.maps) return;
          r.maps.forEach(function (m) {
            if (seen[m.name]) return;            /* the same scenario can sit in two archives */
            seen[m.name] = 1;
            all.push(m);
          });
        }, function () { /* one unreadable archive is not the disc's verdict */ });
    });
  }, Promise.resolve()).then(function () {
    if (!all.length) {
      say('no scenarios found on ' + label + ' (' + files.length + ' archives searched)', 'bad');
      return;
    }
    say('Found ' + all.length + ' scenario' + (all.length === 1 ? '' : 's') + ' on ' + label +
        '. Choose one:', 'ok');
    _rtsMapListShow(all, note);
    if (typeof rtsPickDoneMap === 'function') rtsPickDoneMap();
  });
}

/* Scan one archive for scenarios and put the list on screen. Shared by the two ways of arriving
   at an archive - the player picking a .mix, or one being sliced out of a disc image - so the
   two cannot drift into reporting the same result differently. */
function _rtsMapScanInto(mixF, note, say) {
  say('Searching ' + mixF.name + ' for scenarios…');
  return rtsMapScanMix(mixF, function (p) { say('Searching… ' + p); }).then(function (r) {
    if (r.error) { say(r.error, 'bad'); return; }
    say('Found ' + r.maps.length + ' scenario' + (r.maps.length === 1 ? '' : 's') + ' in ' +
        mixF.name + '. Choose one:', 'ok');
    _rtsMapListShow(r.maps, note);
    if (typeof rtsPickDoneMap === 'function') rtsPickDoneMap();
  });
}

/* The file picker on the title screen. Mirrors rtsMixPicked: read, report in place, and never
   half-apply - a map that fails validation leaves the previous state alone rather than
   dropping the player onto a broken battlefield. */
function rtsMapPicked(input) {
  var note = document.getElementById('rtsMapNote');
  function say(msg, cls) { if (note) { note.textContent = msg; note.className = cls || ''; } }
  if (!input.files || !input.files.length) return;
  _rtsMapListHide();

  /* A disc image goes one level further out than an archive: the scenarios are in a .mix which
     is on the CD. EVERY .mix is scanned, not one chosen by a rule.

     Picking "the biggest archive on the disc" was the first attempt and it is wrong twice over.
     It is wrong on a real CD, where the biggest thing by a wide margin is the movie archive and
     the scenarios are not in it; and it was measured wrong here, on an image holding
     hires.mix at 5.8 MB against MAIN.MIX at 3.4 MB - the artwork loader had pulled main.mix off
     the same disc perfectly well while this found nothing at all.

     Scanning them all costs a header read and a run of hash probes each, which is cheap next to
     being wrong, and it needs no assumption about how any particular pressing was laid out.
     Known containers go first so the usual case answers immediately; the rest follow smallest
     first, so a 500 MB movie archive is the last thing tried rather than the first. */
  var isoF = [].slice.call(input.files).filter(function (f) { return /\.iso$/i.test(f.name); })[0];
  if (isoF && window.RA_ISO) {
    say('Reading ' + isoF.name + '…');
    window.RA_ISO.isoOpen(function (from, len) { return _rtsSliceBytes(isoF, from, len); },
                          isoF.size).then(function (iso) {
      if (!iso || iso.error) { say((iso && iso.error) || 'could not read that disc image', 'bad'); return; }
      var mixes = iso.files.filter(function (e) { return /\.mix$/i.test(e.name); });
      if (!mixes.length) { say('no .mix archives on ' + isoF.name, 'bad'); return; }
      mixes.sort(function (a, b) {
        var pa = _rtsMapScanRank(a.name), pb = _rtsMapScanRank(b.name);
        return pa !== pb ? pa - pb : a.size - b.size;
      });
      var blobs = mixes.map(function (e) {
        var b = isoF.slice(e.offset, e.offset + e.size);
        b.name = e.name;
        return b;
      });
      _rtsMapScanMany(blobs, isoF.name, note, say);
    }, function () { say('could not read that disc image', 'bad'); });
    return;
  }

  /* A .mix is not a map, it is an archive that may CONTAIN maps - so it gets scanned and the
     player picks from what turned up, rather than the game choosing one for them. */
  var mixF = [].slice.call(input.files).filter(function (f) { return /\.mix$/i.test(f.name); })[0];
  if (mixF) { _rtsMapScanInto(mixF, note, say); return; }

  say('Reading...');
  rtsMapLoadFiles(input.files).then(function (M) {
    if (!M || M.error) { rtsMapClear(); say(M ? M.error : 'could not read that map', 'bad'); return; }
    window._RTS_MAP = M;
    if (typeof rtsStoreSaveMap === 'function') rtsStoreSaveMap(M);   /* chosen once, not every visit */
    say(rtsMapDescribe(M), 'ok');
    if (typeof rtsPickDoneMap === 'function') rtsPickDoneMap();
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

