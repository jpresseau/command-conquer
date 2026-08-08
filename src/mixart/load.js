/* mixart/load.js - reading the player's files: MIX archives, the palette, the shapes.
   Part of rts.mixart, the player's own artwork. */

/* ------------------------------------------------------------------ load --
   Handed a list of File objects from a picker. Each is read, parsed, and kept; the palette is
   pulled out of local.mix. Everything is reported rather than assumed, because a player who
   picks the wrong folder should be told which archive is missing. */
/* Above this, an archive is opened by INDEX and its useful parts sliced out; below it, the
   whole file is read, which is simpler and costs nothing on a 2 MB conquer.mix.

   The threshold exists because a retail MAIN.MIX is a few hundred megabytes and reading one
   whole peaked the heap at 641 MB - twice the file, because FileReader hands back an
   ArrayBuffer and the copy into a Uint8Array is another. That survived on a desktop and would
   not survive on a phone, and this ships as an installable PWA. Measured, not assumed. */
var RTS_MIX_BIG = 32 << 20;

function _mixSlice(file, from, len) {
  return new Promise(function (res) {
    var fr = new FileReader();
    fr.onload = function () { res(new Uint8Array(fr.result)); };
    fr.onerror = function () { res(null); };
    fr.readAsArrayBuffer(file.slice(from, from + len));
  });
}

/* A big archive is a container: what is wanted from it is the dozen nested archives, which come
   to a few tens of megabytes between them, not the hundreds of megabytes of video around them.
   So the index is read from the head and only the wanted entries are sliced out - and because
   those slices are ordinary archives, everything downstream keeps working synchronously,
   which it must: _mixShp and the sound lookup are called from inside the render loop. */
function _mixLoadBig(file, got) {
  var name = String(file.name || '').toLowerCase();
  return _mixSlice(file, 0, Math.min(RTS_MIX_HEAD, file.size)).then(function (head) {
    if (!head) { got.push(name + ': could not be read'); return; }
    var top;
    try { top = window.RA_MIX.mixOpen(head); } catch (e) { top = { error: 'unreadable' }; }
    if (!top || top.error) { got.push(name + ': ' + ((top && top.error) || 'unreadable')); return; }
    got.push(name + ': ' + top.count + ' entries, read by index (' +
             Math.round(file.size / 1048576) + ' MB not loaded)');

    var wanted = RTS_MIX.want.concat(RTS_MIX_NEST).filter(function (v, i, a) { return a.indexOf(v) === i; });
    return wanted.reduce(function (chain, nm) {
      return chain.then(function () {
        if (RTS_MIX.open[nm]) return;                       /* a direct pick already won */
        var rec = top.byId(window.RA_MIX.mixHash(nm));
        if (!rec || rec.offset + rec.size > file.size) return;
        return _mixSlice(file, rec.offset, rec.size).then(function (bytes) {
          if (!bytes) return;
          var sub;
          try { sub = window.RA_MIX.mixOpen(bytes); } catch (e) { return; }
          if (!sub || sub.error) return;
          RTS_MIX.open[nm] = sub;
          if (RTS_MIX.want.indexOf(nm) >= 0) RTS_MIX.bytes[nm] = bytes;
          got.push('  ' + nm + ': ' + sub.count + ' files (sliced out of ' + name + ')');
        });
      });
    }, Promise.resolve());
  });
}
var RTS_MIX_HEAD = 6 << 20;      /* enough index for any real archive */

/* A DISC IMAGE IS A BAG OF ARCHIVES. Anyone who still has their Red Alert CDs has .iso files,
   not a folder of .mix files, and the archives are inside the image. ra/iso.js reads the disc's
   directory - a real one, with names in it, unlike a MIX index - so every archive on the disc can
   be listed rather than guessed at.

   Each one is handed onward as `file.slice(offset, offset + size)` with a name pinned to it. A
   file in a 2048-byte-sector image is a CONTIGUOUS byte range, so that slice IS the archive, and
   everything downstream - the small/big split, _mixLoadBig's index-only read of MAIN.MIX,
   _mixDescend, the IndexedDB persistence - carries on unchanged and unaware. Nothing is read
   into memory here: slicing a Blob does not copy it.

   Returns the replacement list. An image that will not parse contributes its reason to `got` and
   nothing else, which is how a DVD of family photos ends up saying so rather than saying
   nothing. */
function _mixExpandIso(list, got) {
  if (!window.RA_ISO) return Promise.resolve(list);
  var isos = list.filter(_mixIsIsoName), rest = list.filter(function (f) { return !_mixIsIsoName(f); });
  if (!isos.length) return Promise.resolve(list);

  return isos.reduce(function (chain, file) {
    return chain.then(function () {
      var nm = String(file.name || 'disc');
      return window.RA_ISO.isoOpen(function (from, len) {
        return _mixSlice(file, from, len);
      }, file.size).then(function (iso) {
        if (!iso || iso.error) { got.push(nm + ': ' + ((iso && iso.error) || 'unreadable')); return; }
        var mixes = iso.files.filter(function (e) { return /\.mix$/i.test(e.name); });
        if (!mixes.length) {
          got.push(nm + ': an ISO with ' + iso.files.length + ' files but no .mix archives in it');
          return;
        }
        mixes.forEach(function (e) {
          var b = file.slice(e.offset, e.offset + e.size);
          b.name = e.name.toLowerCase();          /* the rest of the loader matches lower-case */
          rest.push(b);
        });
        got.push(nm + (iso.label ? ' (' + iso.label + ')' : '') + ': ' + mixes.length +
                 ' archives on the disc — ' + mixes.map(function (e) { return e.name; }).join(', '));
      }, function () { got.push(nm + ': could not be read'); });
    });
  }, Promise.resolve()).then(function () { return rest; });
}
function _mixIsIsoName(f) { return /\.iso$/i.test(String(f && f.name || '')); }

function rtsMixLoadFiles(files, done) {
  var list = [], i;
  for (i = 0; i < files.length; i++) list.push(files[i]);
  if (!list.length) { done && done('No files chosen.'); return; }
  var got = [];
  _mixExpandIso(list, got).then(function (expanded) { _mixLoadList(expanded, got, done); });
}

function _mixLoadList(list, got, done) {
  if (!list.length) { _mixFinish(got, done); return; }

  /* Small archives first and in parallel; big ones one at a time, so two 300 MB files cannot
     both be part-way through a slice at once. */
  var small = list.filter(function (f) { return f.size <= RTS_MIX_BIG; });
  var big   = list.filter(function (f) { return f.size > RTS_MIX_BIG; });

  Promise.all(small.map(function (file) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () {
        var name = String(file.name || '').toLowerCase();
        try {
          var raw = new Uint8Array(fr.result);
          var a = window.RA_MIX.mixOpen(raw);
          if (a.error) got.push(name + ': ' + a.error);
          /* SAY IT AT THE PICKER. A truncated archive parses - the index is at the front - so it
             used to be accepted, reported as "230 files", written to IndexedDB, and only then
             kill the next START with "Invalid typed array length" from inside sprite baking,
             every reload, with nothing naming the cause. mixOpen knows where the last entry ends;
             asking it here costs nothing and turns an unstartable game into one sentence. */
          else if (typeof a.complete === 'function' && !a.complete()) {
            got.push(name + ': incomplete — the file is shorter than its own index says. ' +
                     'Copy it again from your disc or install folder.');
          } else {
            RTS_MIX.open[name] = a;
            if (RTS_MIX.want.indexOf(name) >= 0) RTS_MIX.bytes[name] = raw;
            got.push(name + ': ' + a.count + ' files');
          }
        } catch (e) { got.push(name + ': ' + (e && e.message ? e.message : 'unreadable')); }
        res();
      };
      fr.onerror = function () { got.push(file.name + ': could not be read'); res(); };
      fr.readAsArrayBuffer(file);
    });
  })).then(function () {
    return big.reduce(function (chain, f) {
      return chain.then(function () { return _mixLoadBig(f, got); });
    }, Promise.resolve());
  }).then(function () {
    _mixFinish(got, done);
  }, function (e) {
    got.push('load failed: ' + ((e && e.message) || e));
    _mixFinish(got, done);
  });
}

/* MAIN.MIX is a container of containers: conquer, local, temperat and hires are all nested
   inside it. Descending one level means a player can point at that one file instead of hunting
   down four - and since a MIX index stores hashes rather than names, the only way to find a
   nested archive is to ask for it by name, which is what this list is for.

   Only archives NOT already loaded are taken, so a directly chosen file always wins over a
   copy found inside something else. */
var RTS_MIX_NEST = ['conquer.mix', 'local.mix', 'temperat.mix', 'hires.mix', 'lores.mix',
                    'snow.mix', 'interior.mix', 'allies.mix', 'russian.mix', 'general.mix',
                    'redalert.mix', 'expand.mix', 'expand2.mix', 'aftrmath.mix',
                    /* the expansions' own art archives, one level further in: Aftermath keeps
                       its sprites in expand2.mix but its sidebar cameos in hires1.mix. */
                    'hires1.mix', 'lores1.mix', 'nchires.mix',
                    /* the audio: sounds and speech ship loose, the SCORE does not - scores.mix
                       is inside MAIN.MIX, which is why most players have the effects and not
                       the music until they point at that one file. */
                    'sounds.mix', 'speech.mix', 'scores.mix',
                    /* allies.mix and russian.mix look like faction data and are almost entirely
                       AUD - 34 sounds each, the side-specific speech. Measured, not assumed:
                       reading every entry and checking for an AUD header found them. */
                    'allies.mix', 'russian.mix'];

function _mixDescend(log) {
  var outer = Object.keys(RTS_MIX.open), i, j, grew = 0;
  for (i = 0; i < outer.length; i++) {
    var a = RTS_MIX.open[outer[i]];
    if (!a || a.error) continue;
    for (j = 0; j < RTS_MIX_NEST.length; j++) {
      var nm = RTS_MIX_NEST[j];
      if (RTS_MIX.open[nm] || !a.has(nm)) continue;
      var bytes = a.read(nm);
      if (!bytes) continue;
      try {
        var sub = window.RA_MIX.mixOpen(bytes);
        if (sub && !sub.error) {
          RTS_MIX.open[nm] = sub;
          /* a view into the parent's buffer; persisting it copies only this range */
          if (RTS_MIX.want.indexOf(nm) >= 0) RTS_MIX.bytes[nm] = bytes;
          log.push('  ' + nm + ': ' + sub.count + ' files (inside ' + outer[i] + ')');
          grew++;
        }
      } catch (e) { /* a nested archive that will not open is not the outer one's fault */ }
    }
  }
  return grew;
}

function _mixFinish(log, done) {
  /* one level is enough for MAIN.MIX -> general.mix -> the art archives */
  if (_mixDescend(log)) _mixDescend(log);
  /* Both theatre palettes, up front. They are 768 bytes each and live in the same archive, so
     loading only the current one would mean a map switch could find itself without a palette
     long after the picker has gone. */
  var loc = RTS_MIX.open['local.mix'];
  if (loc && !loc.error) {
    for (var th in RTS_THEATRES) {
      var p = loc.read(RTS_THEATRES[th].pal);
      if (p) RTS_MIX.pals[th] = window.RA_SHP.palOpen(p);
    }
    RTS_MIX.pal = RTS_MIX.pals[RTS_THEATRE] || RTS_MIX.pals.TEMPERAT || RTS_MIX.pal;
  }
  var haveArt = !!(RTS_MIX.open['conquer.mix'] && !RTS_MIX.open['conquer.mix'].error);
  RTS_MIX.ready = !!(haveArt && RTS_MIX.pal);
  RTS_MIX.note = log.join('\n');
  if (!haveArt) RTS_MIX.note += '\nconquer.mix is the one with the artwork in it.';
  if (!RTS_MIX.pal) RTS_MIX.note += '\nlocal.mix is needed for the palette.';
  /* every cached bake has to go, or the game keeps drawing the sprites it made before
     the content arrived */
  if (RTS_MIX.ready) { _RTS_SPR = null; _RTS_UFIT = {}; _RTS_USCALE = {};
                       _RTS_TREES = null; _RTS_MIXTREES = null; _RTS_TILECACHE = null;
                       /* the shroud belongs on this list too - rtsSetTheatre clears it, but
                          that returns early when the theatre has not changed, which is the
                          normal case when artwork arrives mid-session */
                       _RTS_MIXDEBRIS = null; _RTS_SHROUDSPR = null; _RTS_CLIFFLIB = undefined; }
  /* Anything that keys off "is there artwork" is told HERE, at the single point where that
     becomes true, rather than by each path that might have delivered it. The editor button was
     hidden the first time round because it was announced from the file picker only, so artwork
     arriving from IndexedDB - the normal case on every visit after the first - left the button
     hidden with a full palette sitting behind it. */
  if (RTS_MIX.ready && typeof rtsShowEditor === 'function') rtsShowEditor();
  if (RTS_MIX.ready && typeof rtsBuildVoxSide === 'function') rtsBuildVoxSide();
  if (RTS_MIX.ready && typeof rtsShowTitleArt === 'function') rtsShowTitleArt();
  /* new archives can only ADD sounds, so the "not found" cache is the one that must go */
  if (typeof rtsSndReset === 'function') rtsSndReset();
  done && done(RTS_MIX.ready ? null : RTS_MIX.note, RTS_MIX.note);
}

/* The picker's change handler. Kept here rather than in src/ui because everything it talks
   to is in this file, and because the whole feature has to be removable in one piece. */
function rtsMixPicked(input) {
  var note = document.getElementById('rtsMixNote');
  var picked = input.files;
  if (note) note.textContent = 'Reading...';
  rtsMixLoadFiles(picked, function (err, log) {
    if (_rtsArtReady() && typeof rtsStoreSaveMix === 'function') {
      /* Chosen once, not once per visit. 13 MB of archives is far too much for localStorage,
         so this goes to IndexedDB; see src/rts.store.js. */
      rtsStoreSaveMix().then(function (saved) {
        if (note && saved) {
          note.textContent += ' Kept in this browser — it will load itself next time. ';
          /* the way out has to be offered here too, not only after a restore: the visit that
             stores the files is the one where a player might want to undo it */
          if (typeof rtsAddForget === 'function') rtsAddForget(note);
        }
      });
    }
    if (!note) return;
    if (_rtsArtReady()) {
      note.textContent = 'Original artwork loaded. ' +
        Object.keys(RTS_MIX.open).length + ' archives read.';
      note.className = 'ok';
      /* the button stops being an instruction the moment it is obeyed, not on the next visit */
      if (typeof rtsPickDoneArt === 'function') rtsPickDoneArt();
    } else {
      note.textContent = (log || err || 'Nothing usable in those files.');
      note.className = 'bad';
    }
  });
}

