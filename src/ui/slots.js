/* ui/slots.js - SAVE SLOTS: three of the player's own beside the autosave (rts.save.js RTS_SLOTS).

   One slot was one battle: saving a second threw the first away. Now there are three, and the
   one in use is the ACTIVE slot (window._RTS_SLOT): 💾 and Ctrl+S save to it, as they always did
   to the one; loading from a slot makes that slot active, so the next save goes back where the
   battle came from. 📂 loads the active slot's battle when no other slot holds one, and opens
   this panel to choose when one does. The panel lists the three with what each holds - SAVE HERE
   on each, LOAD on the filled ones - and the title's RESUME BATTLE is the newest of them, with
   the others listed under it. The autosave keeps to its own slot (autosave.js). */

var RTS_MANUAL_SLOTS = ['save', 'save2', 'save3'];

function rtsSlotActive() { return RTS_MANUAL_SLOTS.indexOf(window._RTS_SLOT) >= 0 ? window._RTS_SLOT : 'save'; }
/* the newest of the player's own slots that this build can read, or null */
function rtsSlotNewest() {
  var best = null, when = -1;
  RTS_MANUAL_SLOTS.forEach(function (k) { var i = rtsSaveInfo(k); if (i && (i.when || 0) > when) { when = i.when || 0; best = k; } });
  return best;
}
function rtsSlotsFilled() { return RTS_MANUAL_SLOTS.filter(function (k) { return !!rtsSaveInfo(k); }); }
/* 📂: straight to the one battle, or the choice when there is one to make */
function rtsLoadClick() {
  var filled = rtsSlotsFilled();
  if (filled.length <= 1) return rtsLoadGame(filled[0] || rtsSlotActive());
  rtsSlotsPanel(true);
  return null;
}
function _rtsSlotsBuild() {
  var root = document.getElementById('rcgRts') || document.body, P = document.createElement('div');
  P.id = 'rtsSlots'; P.className = 'rts-slots'; P.hidden = true;
  P.setAttribute('role', 'dialog'); P.setAttribute('aria-label', 'Saved battles');
  root.appendChild(P);
  return P;
}
function _rtsSlotsSync() {
  var P = document.getElementById('rtsSlots');
  if (!P) return;
  var act = rtsSlotActive(), h = '<div class="hd"><b>SAVED BATTLES</b><button type="button" class="x" onclick="rtsSlotsPanel(false)" title="Close">✕</button></div>';
  RTS_MANUAL_SLOTS.forEach(function (k, n) {
    var i = rtsSaveInfo(k), stale = !i && rtsSaveStale(k);
    h += '<div class="slot' + (k === act ? ' act' : '') + '" data-slot="' + k + '"><span class="n">' + (n + 1) + '</span>'
      + '<span class="d">' + (i ? String(i.desc).replace(/[<&]/g, '') : stale ? 'a battle from an earlier build' : 'empty') + (k === act ? ' <i>· in use</i>' : '') + '</span>'
      + '<button type="button" class="save" onclick="rtsSlotSave(\'' + k + '\')">SAVE HERE</button>'
      + (i ? '<button type="button" class="load" onclick="rtsSlotLoad(\'' + k + '\')">LOAD</button>' : '') + '</div>';
  });
  P.innerHTML = h;
}
function rtsSlotsPanel(open) {
  var P = document.getElementById('rtsSlots') || _rtsSlotsBuild();
  P.hidden = open == null ? !P.hidden : !open;
  if (!P.hidden) _rtsSlotsSync();
}
function rtsSlotSave(k) { window._RTS_SLOT = k; var ok = rtsSaveGame(k); _rtsSlotsSync(); return ok; }
function rtsSlotLoad(k) { rtsSlotsPanel(false); return rtsLoadGame(k); }
/* the title: the other filled slots under RESUME BATTLE (title.js rtsShowResume) */
function rtsShowSlots(newest) {
  var box = document.getElementById('rtsSaves');
  if (!box) return;
  var others = rtsSlotsFilled().filter(function (k) { return k !== newest; });
  box.hidden = !others.length;
  box.innerHTML = others.map(function (k) {
    var i = rtsSaveInfo(k);
    return '<button type="button" class="go resume" onclick="rtsLoadGame(\'' + k + '\')">RESUME<small>' + String(i.desc).replace(/[<&]/g, '') + ' · slot ' + (RTS_MANUAL_SLOTS.indexOf(k) + 1) + '</small></button>';
  }).join('');
}
