/* Remembering the player's files - 221 lines that had no spec.

   Its stated contract is the reason it needs one: "everything here fails soft ... every entry
   point resolves rather than rejects, and a failure to remember is silent." Silent is the right
   behaviour and it is also the worst thing to leave unguarded, because the symptom of breaking
   it is not an error - it is a player hunting through a file picker for 13 MB of archives on
   every single visit, with nothing anywhere going red.

   IndexedDB does not exist in this sandbox, which turns out to be the point: the no-database
   case IS the private-browsing case, and it is the one the contract is written about. A small
   fake database covers the other half - that something stored comes back. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('store');
var g = load(['src/rules', 'src/core', 'src/mixart', 'src/map', 'src/rts.store.js']);

/* The module reaches for these; none of them is what is under test here. */
g.window.Blob = function (parts) { this.parts = parts; this.size = 1; };
g.RTS_MIX = g.RTS_MIX || {};
g.window.rtsMixLoadFiles = function (files, done) { done(null, []); };
g.window._rtsArtReady = function () { return false; };
g.window.rtsMapClear = function () { g.window.__cleared = true; };

var ENTRIES = ['rtsStoreSaveMix', 'rtsStoreLoadMix', 'rtsStoreSaveMap', 'rtsStoreLoadMap',
               'rtsStoreSaveScen', 'rtsStoreLoadScen', 'rtsStoreForget', 'rtsStoreRestore'];

function settle(p) {
  return Promise.resolve(p).then(function (v) { return { ok: true, v: v }; },
                                 function (e) { return { ok: false, e: String(e && e.message || e) }; });
}

/* A WATCHDOG, because this spec is async and the failure it guards against is a promise that
   never settles. Without it a stall exits 0 with no output at all - which is the vacuous pass
   test/unit/layout exists to forbid, arriving by a different route. */
var watchdog = setTimeout(function () {
  console.log('store: TIMED OUT - a promise never settled');
  process.exit(1);
}, 15000);

(async function () {
  /* --------------------------------- no database at all: private browsing ---------------- */
  g.window.indexedDB = undefined;
  g.RTS_MIX.bytes = { 'conquer.mix': new Uint8Array(4) };

  for (var i = 0; i < ENTRIES.length; i++) {
    var name = ENTRIES[i];
    var fn = g[name];
    S.ok(name + ' exists', typeof fn === 'function', typeof fn);
    if (typeof fn !== 'function') continue;
    var r;
    try { r = await settle(fn(name === 'rtsStoreSaveMap' ? { raw: {} } : undefined)); }
    catch (e) { r = { ok: false, e: 'threw synchronously: ' + e.message }; }
    S.ok('...and with no IndexedDB it resolves rather than rejecting or throwing', r.ok,
         r.ok ? 'resolved ' + JSON.stringify(r.v) : r.e);
    if (r.ok && /^rtsStoreLoad/.test(name)) {
      S.ok('...returning nothing, because there is nothing remembered', !r.v,
           JSON.stringify(r.v));
    }
  }

  /* rtsStoreRestore is the one the title screen calls, and it must still call its callbacks -
     the menu updates from them, so a silent failure that skips them leaves the screen saying
     nothing at all rather than saying "no files remembered". */
  var seen = [];
  var res = await settle(g.rtsStoreRestore(
    function (m) { seen.push(['mix', m]); },
    function (m) { seen.push(['map', m]); },
    function (m) { seen.push(['scen', m]); }));
  S.ok('rtsStoreRestore resolves with no database', res.ok, res.ok ? '' : res.e);
  S.ok('...and still answers all three of its callbacks', seen.length === 3,
       seen.map(function (s) { return s[0] + '=' + JSON.stringify(s[1]); }).join(' '));
  S.ok('...each with nothing, rather than being skipped',
       seen.every(function (s) { return !s[1]; }), JSON.stringify(seen));

  /* ------------------------------- a database that refuses to open ----------------------- */
  g.window.indexedDB = { open: function () { throw new Error('SecurityError'); } };
  var thrown = await settle(g.rtsStoreLoadMix());
  S.ok('a database that throws on open is not an error the player sees', thrown.ok,
       thrown.ok ? 'resolved ' + JSON.stringify(thrown.v) : thrown.e);
  S.ok('...and nothing is remembered', !thrown.v, JSON.stringify(thrown.v));

  /* --------------------------------- forgetting clears what is in memory ----------------- */
  g.window.indexedDB = undefined;
  g.RTS_MIX.open = { 'conquer.mix': {} };
  g.RTS_MIX.bytes = { 'conquer.mix': new Uint8Array(4) };
  g.RTS_MIX.ready = true; g.RTS_MIX.pal = new Uint8Array(3);
  g.window.__cleared = false;
  var forgot = await settle(g.rtsStoreForget());
  S.ok('forgetting resolves even with no database', forgot.ok, forgot.ok ? '' : forgot.e);
  /* The point of Forget is that the CURRENT session stops using the files too - clearing only
     the database would leave the artwork loaded until the next reload, so the button would
     appear to do nothing. */
  S.eq('...and the artwork is dropped from memory, not just from the database',
       Object.keys(g.RTS_MIX.bytes).length, 0);
  S.eq('...including the palette', g.RTS_MIX.pal, null);
  S.eq('...and it is no longer ready', g.RTS_MIX.ready, false);
  S.eq('...and the loaded map goes with it', g.window.__cleared, true);

  /* ------------------------------- and a database that works ----------------------------- */
  /* Minimal IndexedDB: enough for put/get/delete against one store. What is being checked is
     that the module's own plumbing round-trips, not that Chromium implements IndexedDB. */
  var DB = {};
  function later(fn) { setTimeout(fn, 0); }
  /* A transaction has to COMPLETE, not merely have its request succeed - _rtsStoreTx resolves
     on `tx.oncomplete`, so a fake that fires only onsuccess leaves every call hanging for ever.
     That is exactly how the first version of this spec exited 0 with no output at all, which is
     why the watchdog above is not decoration. */
  g.window.indexedDB = {
    open: function () {
      var rq = {};
      later(function () {
        rq.result = {
          objectStoreNames: { contains: function () { return true; } },
          createObjectStore: function () {},
          transaction: function () {
            var tx = { oncomplete: null, onerror: null, onabort: null };
            tx.objectStore = function () {
              return {
                put: function (v, k) { DB[k] = v; later(function () { if (tx.oncomplete) tx.oncomplete(); }); return {}; },
                get: function (k) {
                  var r = { result: DB[k] };
                  later(function () { if (r.onsuccess) r.onsuccess({ target: r });
                                      if (tx.oncomplete) tx.oncomplete(); });
                  return r;
                },
                delete: function (k) { delete DB[k]; later(function () { if (tx.oncomplete) tx.oncomplete(); }); return {}; }
              };
            };
            return tx;
          }
        };
        if (rq.onsuccess) rq.onsuccess({ target: rq });
      });
      return rq;
    }
  };
  var put = await settle(g._rtsStorePut('probe.v1', { hello: 'world' }));
  S.ok('a working database accepts a write', put.ok, put.ok ? String(put.v) : put.e);
  var got = await settle(g._rtsStoreGet('probe.v1'));
  S.ok('...and hands it back', got.ok && got.v && got.v.hello === 'world', JSON.stringify(got));
  var del = await settle(g._rtsStoreDel(['probe.v1']));
  S.ok('...and forgets it on request', del.ok, del.ok ? '' : del.e);
  var gone = await settle(g._rtsStoreGet('probe.v1'));
  /* `undefined` is what a missing key gives, and _rtsStoreTx normalises a falsy transaction
     result to the transaction's own return - so "gone" is "not the record", not "not truthy". */
  S.ok('...after which it is gone', gone.ok && !(gone.v && gone.v.hello), JSON.stringify(gone));

  clearTimeout(watchdog);
  require('../lib/report.js')(S);
})().catch(function (e) {
  clearTimeout(watchdog);
  console.log('store: THREW - ' + (e && e.stack || e));
  process.exit(1);
});
