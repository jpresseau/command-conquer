/* autosave.js - the battle written down by itself, so closing the app does not lose it.

   A phone gives a web page no warning before it is gone: switched away from, the page may be
   ended at any moment after, and one that drew too much in the foreground is reloaded with no
   event at all. So the battle is written down by itself - every RTS_AUTO_EVERY seconds of
   battle, the moment the page is hidden, and on a confirmed quit or reload (ui/shell.js) - into
   a SECOND slot beside the player's own (rts.save.js RTS_SLOTS.auto): the same format through
   the same writer, under keys of its own. It never touches the player's save, and a full storage
   costs the autosave, never the save (rtsSaveGame frees it to make room).

   CONTINUE on the title loads it, shown when it is newer than the player's own save. A battle
   that ends clears it - there is nothing left to continue - and so does starting another one,
   so CONTINUE always means the battle you were last in.

   Measured, one write is 12-20 ms and 450-730 KB on a desktop, a 1v1 and a four-sided large map
   six minutes in: a phone's few-times-longer hitch, once a minute. */

var RTS_AUTO_EVERY = 60;      /* seconds of battle between autosaves */

/* Write the battle in progress to the autosave slot; true when it is on disk. Silent but for a
   single line the first time storage refuses it, so a player who thinks they are covered learns
   once that they are not. */
function _rtsAutoSave() {
  var G = window._rtsG, U = window._rtsUI;
  if (!G || G.over) return false;
  if (U && U.autoT === G.t && rtsSaveInfo('auto')) return true;      /* nothing has moved since */
  var text, info;
  try { text = JSON.stringify(_rtsSaveState(G)); info = _rtsSaveHeader(G, text); }
  catch (e) { return false; }
  var w = _rtsWriteSlot('auto', text, info);
  if (U) U.autoT = G.t;
  if (!w.ok && U && !U.autoWarned) {
    U.autoWarned = true;
    _rtsSay('Autosave could not be written: ' + (w.err === 'QuotaExceededError' ? 'storage is full' : 'storage is unavailable') + '. Save by hand.');
  }
  return w.ok;
}
/* Drop the autosave; true when there was one. */
function _rtsAutoClear() {
  var K = _rtsSlot('auto'), had = false;
  try {
    had = window.localStorage.getItem(K.info) !== null || window.localStorage.getItem(K.body) !== null;
    window.localStorage.removeItem(K.body); window.localStorage.removeItem(K.info);
  } catch (e) { return false; }
  return had;
}
/* Every HUD tick (ui/sidebar.js): a battle that has run RTS_AUTO_EVERY seconds since the last
   write is written again; one that is over is cleared, once. The count starts where the battle
   opened, so a continued battle is not written again the moment it is back. */
function _rtsAutoTick(G, U) {
  if (!G || !U) return;
  if (G.over) { if (!U.autoGone) { U.autoGone = true; _rtsAutoClear(); } return; }
  if (U.autoT === undefined) U.autoT = G.t;
  if (G.t - U.autoT >= RTS_AUTO_EVERY) _rtsAutoSave();
}
/* Should the title offer CONTINUE: an autosave this build can read, newer than the player's own
   save (an older one is a step back from RESUME BATTLE, not a way forward) */
function _rtsAutoNewer(auto, save) {
  return !!auto && (!save || (auto.when || 0) > (save.when || 0));
}
/* The title's CONTINUE (title.js rtsShowResume). An autosave from an earlier build is gone for
   good: it is dropped, and the note says so once, or the battle would vanish without a word -
   the failure rtsSaveStale exists for. */
function rtsShowContinue() {
  var b = document.getElementById('rtsContinue'), n = document.getElementById('rtsAutoNote');
  if (!b) return;
  if (n) { n.hidden = true; n.textContent = ''; }
  if (rtsSaveStale('auto')) {
    _rtsAutoClear();
    if (n) { n.hidden = false; n.textContent = 'Your last battle was autosaved by an earlier version of the game and cannot be continued.'; }
  }
  var a = rtsSaveInfo('auto'), newest = typeof rtsSlotNewest === 'function' ? rtsSlotNewest() : 'save';
  b.hidden = !_rtsAutoNewer(a, rtsSaveInfo(newest || 'save'));
  if (!b.hidden) b.innerHTML = 'CONTINUE<small>' + String(a.desc).replace(/[<&]/g, '') + ' · autosaved</small>';
}
function rtsContinue() { return rtsLoadGame('auto'); }
/* The two moments a phone gives: the page hidden (switched away from, locked, the app closed),
   and the page put away - a reload included. Chromium fires both on a reload, so e2e/autosave
   holds them together; pagehide is the one Safari can be relied on for. Bound once, by the
   title (title.js), never by a test sandbox. */
function _rtsAutoBind() {
  if (window._RTS_AUTO_BOUND) return;
  window._RTS_AUTO_BOUND = true;
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') _rtsAutoSave(); });
  window.addEventListener('pagehide', function () { _rtsAutoSave(); });
}
