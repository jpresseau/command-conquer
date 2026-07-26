/* Remember the files the player chose, so they only choose them once.

   The artwork is about 13 MB of .mix archives and the map is a few more, and until now every
   reload threw both away: open the game, hunt through the file picker, find four archives,
   start playing. That is a toll charged on every single visit for a decision the player
   already made, and it is the whole reason this file exists.

   IndexedDB, not localStorage. localStorage is a synchronous string store with a quota
   measured in single-digit megabytes - hires.mix alone is 5.8 MB, and stringifying binary into
   it would inflate it further. IndexedDB stores the ArrayBuffers as they are, has a quota in
   the hundreds of megabytes, and is the only browser store that will take this.

   Everything here fails soft. Private-browsing modes disable IndexedDB outright, quotas get
   hit, and a browser may evict the database whenever it likes. None of that is an error worth
   showing: the picker still works, and the player is exactly where they were before. So every
   entry point resolves rather than rejects, and a failure to remember is silent. */

var RTS_STORE_DB = 'rccommand', RTS_STORE_VER = 1, RTS_STORE_TBL = 'files';

function _rtsStoreOpen() {
  return new Promise(function (res) {
    var idb = window.indexedDB;
    if (!idb) return res(null);
    var rq;
    try { rq = idb.open(RTS_STORE_DB, RTS_STORE_VER); } catch (e) { return res(null); }
    rq.onupgradeneeded = function () {
      var db = rq.result;
      if (!db.objectStoreNames.contains(RTS_STORE_TBL)) db.createObjectStore(RTS_STORE_TBL);
    };
    rq.onsuccess = function () { res(rq.result); };
    rq.onerror = function () { res(null); };
    rq.onblocked = function () { res(null); };
  });
}

function _rtsStoreTx(mode, fn) {
  return _rtsStoreOpen().then(function (db) {
    if (!db) return null;
    return new Promise(function (res) {
      var tx, st;
      try { tx = db.transaction(RTS_STORE_TBL, mode); st = tx.objectStore(RTS_STORE_TBL); }
      catch (e) { return res(null); }
      var out = fn(st);
      tx.oncomplete = function () { res(out && out.value !== undefined ? out.value : out); };
      tx.onerror = function () { res(null); };
      tx.onabort = function () { res(null); };     /* quota exceeded lands here */
    });
  }).catch(function () { return null; });
}

function _rtsStorePut(key, val) {
  return _rtsStoreTx('readwrite', function (st) { st.put(val, key); return true; });
}
function _rtsStoreGet(key) {
  return _rtsStoreTx('readonly', function (st) {
    var r = st.get(key), box = {};
    r.onsuccess = function () { box.value = r.result; };
    return box;
  });
}
function _rtsStoreDel(keys) {
  return _rtsStoreTx('readwrite', function (st) {
    for (var i = 0; i < keys.length; i++) st.delete(keys[i]);
    return true;
  });
}

/* ---------------------------------------------------------------- artwork --
   The archives are kept as raw bytes under one key, with their names, because what gets
   replayed on the next visit is exactly what the file picker handed over the first time -
   the same bytes through the same reader. Keeping the PARSED archives instead would mean
   persisting the reader's internal shape and re-validating it on every format change here;
   bytes cannot go stale. */
var RTS_STORE_MIX = 'mix.v1';

function rtsStoreSaveMix(files) {
  var list = [], i;
  for (i = 0; i < files.length; i++) list.push(files[i]);
  if (!list.length) return Promise.resolve(false);
  return Promise.all(list.map(function (f) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () { res({ name: String(f.name || '').toLowerCase(), buf: fr.result }); };
      fr.onerror = function () { res(null); };
      fr.readAsArrayBuffer(f);
    });
  })).then(function (all) {
    var keep = all.filter(Boolean);
    if (!keep.length) return false;
    return _rtsStorePut(RTS_STORE_MIX, { at: Date.now(), files: keep }).then(function (r) { return !!r; });
  }).catch(function () { return false; });
}

/* Replay the remembered archives through rtsMixLoadFiles. Blob is enough - the loader only
   ever asks for .name and reads the bytes, and a real File cannot be reconstructed anyway. */
function rtsStoreLoadMix() {
  return _rtsStoreGet(RTS_STORE_MIX).then(function (rec) {
    if (!rec || !rec.files || !rec.files.length) return null;
    var files = rec.files.map(function (f) {
      var b = new Blob([f.buf]);
      b.name = f.name;
      return b;
    });
    return new Promise(function (res) {
      rtsMixLoadFiles(files, function () {
        res(_rtsArtReady() ? { count: files.length, bytes: rec.files.reduce(function (a, f) {
          return a + (f.buf.byteLength || 0); }, 0) } : null);
      });
    });
  }).catch(function () { return null; });
}

/* ------------------------------------------------------------------- map --
   Stored as the two files it arrived as rather than as the built grid, for the same reason:
   the terrain classification and the window-fitting rules are code that will keep changing,
   and a remembered map has to be re-read by the CURRENT rules or it will quietly disagree
   with what the game would do with the same file today. */
var RTS_STORE_MAP = 'map.v1';

function rtsStoreSaveMap(M) {
  if (!M || !M.raw) return Promise.resolve(false);
  return _rtsStorePut(RTS_STORE_MAP, { at: Date.now(), name: M.name, bin: M.raw.bin, yaml: M.raw.yaml })
    .then(function (r) { return !!r; }).catch(function () { return false; });
}

function rtsStoreLoadMap() {
  return _rtsStoreGet(RTS_STORE_MAP).then(function (rec) {
    if (!rec || !rec.bin || !rec.yaml) return null;
    var b = new Blob([rec.bin]); b.name = 'map.bin';
    var y = new Blob([rec.yaml]); y.name = 'map.yaml';
    return rtsMapLoadFiles([b, y]).then(function (M) {
      if (!M || M.error) return null;
      window._RTS_MAP = M;
      return M;
    });
  }).catch(function () { return null; });
}

function rtsStoreForget() {
  rtsMapClear();
  RTS_MIX.open = {}; RTS_MIX.ready = false; RTS_MIX.pal = null;
  return _rtsStoreDel([RTS_STORE_MIX, RTS_STORE_MAP]).then(function () { return true; });
}

/* ------------------------------------------------------------------ boot --
   Called once from the title screen. Artwork first: a remembered map needs the templates to
   draw itself, and restoring the map first would briefly leave a battlefield with nothing to
   paint it with. Neither step blocks the START button - the game is playable without either,
   and a slow disk should not hold the menu hostage. */
function rtsStoreRestore(onMix, onMap) {
  return rtsStoreLoadMix().then(function (mix) {
    if (onMix) onMix(mix);
    return rtsStoreLoadMap().then(function (map) {
      if (onMap) onMap(map);
      return { mix: mix, map: map };
    });
  }).catch(function () { return { mix: null, map: null }; });
}
