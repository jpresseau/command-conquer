/* title.js - the standalone shell around the game: the title screen, the difficulty picker,
   the file pickers, RESUME BATTLE, the install prompt, and the START button.

   This lived inline in index.skeleton.html, which meant build.py's syntax gate and its
   duplicate-name check - both of which walk the files the skeleton INCLUDES - never saw a
   line of it. A parse error in here ships as a blank white page, which is the exact failure
   that gate exists to prevent. It loads last, after every subsystem it calls. */

/* ---- standalone shell wiring ---- */
window._RTS_STANDALONE = true;

/* Difficulty picker. RULES.CPP applies a difficulty to a whole house as a set of biases plus
   an IQ level, and the IQ is the interesting half: it decides which of the opponent's
   behaviours exist at all. Kept on window so a battle started any other way still sees it. */
window._RTS_DIFF = window._RTS_DIFF || RTS_DIFF_DEFAULT;
function rtsSetDiff(k){
  if (!RTS_DIFF[k]) return;
  window._RTS_DIFF = k;
  var wrap = document.getElementById('rtsDiff');
  if (!wrap) return;
  var bs = wrap.getElementsByTagName('button');
  for (var i = 0; i < bs.length; i++) bs[i].className = (bs[i].getAttribute('data-d') === k) ? 'on' : '';
  document.getElementById('rtsDiffNote').textContent = RTS_DIFF[k].desc;
}
function rtsBuildDiff(){
  var wrap = document.getElementById('rtsDiff');
  if (!wrap || wrap.firstChild) return;
  var html = '';
  for (var k in RTS_DIFF) html += '<button type="button" data-d="' + k + '" onclick="rtsSetDiff(\'' + k + '\')">'
    + RTS_DIFF[k].name.toUpperCase() + '</button>';
  wrap.innerHTML = html;
  rtsSetDiff(window._RTS_DIFF);
}
function rtsHome(){
  var h = document.getElementById('rtsHome');
  if (h) h.classList.remove('gone');
  var b = document.getElementById('rtsGo');
  if (b) { b.disabled = false; b.textContent = 'START BATTLE'; }
  rtsBuildDiff();
  rtsShowResume();
}
/* Get_Savefile_Info's job: print what is in the save without loading it. The button only
   appears when there is a save this build can actually read - the version stamp does that
   check, so a save from older code shows nothing rather than a button that fails. */
/* The editor draws with the player's own terrain templates, so it is only worth offering once
   the artwork is loaded - an empty palette is not a tool. */
/* WHICH ARMY YOU COMMAND. This began as a voices-only toggle, because the roster was one
   merged list with both sides' buildings in it and there was genuinely nothing else to choose
   between. There is now: the Allies get the Pillbox, the Gun Turret, the Medic, the Light Tank,
   the Artillery and the Helipad; the Soviets get the Flame Tower, the Tesla Coil, the Kennel
   and its dogs, the Flame Squad and the Mammoth. Always offered - it changes what you can
   build whether or not the speech archives are loaded. */
function rtsBuildVoxSide(){
  var wrap = document.getElementById('rtsVoxSide'), note = document.getElementById('rtsVoxNote');
  if (!wrap || typeof rtsVoxSide !== 'function') return;
  wrap.hidden = note.hidden = false;
  if (!wrap.firstChild) {
    wrap.innerHTML = '<button type="button" data-v="allied">ALLIED</button>' +
                     '<button type="button" data-v="soviet">SOVIET</button>';
    [].forEach.call(wrap.getElementsByTagName('button'), function (b) {
      b.onclick = function () { rtsSetVoxSide(b.getAttribute('data-v')); rtsBuildVoxSide(); };
    });
  }
  var cur = rtsVoxSide();
  [].forEach.call(wrap.getElementsByTagName('button'), function (b) {
    b.className = (b.getAttribute('data-v') === cur) ? 'on' : '';
  });
  var have = typeof rtsSndNamed === 'function' && !!rtsSndNamed('yes_sir_soviet_vehicle_1');
  note.textContent = (cur === 'soviet'
    ? 'Soviet: Flame Towers, Tesla Coils, attack dogs, Mammoth tanks.'
    : 'Allied: Pillboxes, gun turrets, medics, light tanks, artillery, helicopters.')
    + ' The enemy takes the other army.'
    + (have ? ' Your units answer in its voices.' : '');
}

/* Swap our own title card for Westwood's, when the player's files supply it.

   title.pcx is 640x400 of 1996 pixel art carrying the real logo, so once it is on screen the
   text title underneath it is redundant - two wordmarks stacked is worse than either. It is a
   REPLACEMENT rather than a background: as a background the menu would have to stay legible
   over whatever happens to be behind it at every viewport, and this screen is far taller than
   400px once the briefing and both loaders are on it.

   Silent when there is no hires.mix. That is the normal case for anyone who has not pointed the
   loader at their install, and the drawn title card is not a fallback, it is the default. */
function rtsShowTitleArt(){
  var img = document.getElementById('rtsTitleArt');
  if (!img || img.src) return;                       /* already swapped */
  if (typeof _mixTitleArt !== 'function') return;
  var c;
  try { c = _mixTitleArt(); } catch (e) { return; }
  if (!c) return;
  img.src = c.toDataURL('image/png');
  img.hidden = false;
  ['.eyebrow', 'h1', '.sub'].forEach(function (sel) {
    var el = document.querySelector('#rtsHome ' + sel);
    if (el) el.hidden = true;
  });
  /* Move the menu into the plate's empty panel, and the loaders and the controls tile in after
     it - the panel is the whole screen's content area now, not just somewhere to put buttons.
     Done here rather than in the markup so that a player with no artwork keeps the exact layout
     they had: the overlay only exists when there is a bezel to sit inside.

     ORDER MATTERS. The menu goes first because it is what the screen is for; the loaders and
     the reference list follow it, in the order they already appear on the page. Appending each
     in turn preserves that, and appendChild MOVES a node rather than copying it, so nothing is
     left behind. */
  var wrap = document.getElementById('rtsTitleWrap');
  var menu = document.getElementById('rtsTitleMenu');
  if (wrap && menu && menu.parentNode !== wrap) {
    wrap.appendChild(menu);
    var home = document.getElementById('rtsHome');
    [].forEach.call(home.querySelectorAll('.artload, #rtsKeys'), function (el) {
      menu.appendChild(el);
    });
    home.classList.add('hasart');
  }
}

function rtsShowEditor(){
  var b = document.getElementById('rtsEdit');
  if (b) b.hidden = !(typeof _rtsArtReady === 'function' && _rtsArtReady());
}
function rtsShowResume(){
  var r = document.getElementById('rtsResume');
  var n = document.getElementById('rtsResumeNote');
  if (!r) return;
  if (n) { n.hidden = true; n.textContent = ''; }
  var info = (typeof rtsSaveInfo === 'function') ? rtsSaveInfo() : null;
  if (!info) {
    r.hidden = true;
    /* A save this build cannot read is still NEWS. Without this the button just quietly stops
       appearing after an update, which reads as the game having lost the battle rather than as
       the save format having moved on - and the player cannot tell the difference. */
    if (n && typeof rtsSaveStale === 'function' && rtsSaveStale()) {
      n.hidden = false;
      n.textContent = 'Your saved battle was made by an earlier version of the game and cannot '
                    + 'be resumed. Starting a new battle will replace it.';
    }
    return;
  }
  r.hidden = false;
  r.innerHTML = 'RESUME BATTLE<small>' + String(info.desc).replace(/[<&]/g, '') + '</small>';
}
rtsBuildDiff();
rtsShowResume();
rtsShowEditor();
rtsBuildVoxSide();

/* Anything the player chose last time loads itself now. This is the whole point of
   src/rts.store.js: picking 13 MB of archives out of a file dialog is a decision, and a
   decision should be made once rather than charged as a toll on every visit. Nothing here
   blocks the START button - the game is fully playable with neither. */
function rtsRestoreSaved() {
  if (typeof rtsStoreRestore !== 'function') return;
  var mixNote = document.getElementById('rtsMixNote');
  var mapNote = document.getElementById('rtsMapNote');
  var before = mixNote && mixNote.textContent, mapBefore = mapNote && mapNote.textContent;
  if (mixNote) mixNote.textContent = 'Checking for artwork you loaded before…';
  rtsStoreRestore(function (mix) {
    if (!mixNote) return;
    if (mix) {
      mixNote.textContent = 'Original artwork loaded from last time — ' + mix.count +
        ' archives, ' + (mix.bytes / 1048576).toFixed(1) + ' MB. ';
      mixNote.className = 'ok';
      rtsAddForget(mixNote);
      rtsPickDoneArt();
    } else { mixNote.textContent = before; mixNote.className = ''; }
    rtsShowEditor(); rtsBuildVoxSide();
  }, function (map) {
    if (!mapNote) return;
    if (map) { mapNote.textContent = rtsMapDescribe(map); mapNote.className = 'ok'; rtsPickDoneMap(); }
    else { mapNote.textContent = mapBefore; mapNote.className = ''; }
    /* ASK AGAIN NOW THE MAP IS BACK. rtsShowResume ran once at parse time, before this async
       restore landed, and the save's version stamp is computed from the map that will be used -
       so with a real map stored, the first call read the stamp for the wrong map size and hid
       the button. Cheap to repeat and it is the only thing that makes the button reappear. */
    rtsShowResume();
  }, function (scen) {
    /* The whole scenario list back without the file dialog. Nothing to do when there is none -
       that is the first visit, and the picker's own instructions are already on screen. */
    if (scen && typeof rtsMapShowStored === 'function' && rtsMapShowStored(scen)) rtsPickDoneMap();
  });
}
/* The buttons are imperatives - USE ORIGINAL ARTWORK, PLAY A REAL MAP - and an imperative sat
   next to a note reading "loaded from last time" says two different things at once: the note
   says it is done, the button says do it. Once something IS loaded the same control has stopped
   being an instruction and become a way to change your mind, so it says that instead.

   The text node is edited rather than the label, because the label also contains the <input>
   that makes the whole thing a file picker; replacing its contents would throw that away. */
function rtsPickLabel(inputId, text) {
  var input = document.getElementById(inputId);
  if (!input || !input.parentNode) return;
  var kids = input.parentNode.childNodes, i;
  for (i = 0; i < kids.length; i++) {
    if (kids[i].nodeType === 3 && kids[i].nodeValue.trim()) { kids[i].nodeValue = text; return; }
  }
}
function rtsPickDoneArt() { rtsPickLabel('rtsMixPick', 'REPLACE ARTWORK'); }
function rtsPickDoneMap() { rtsPickLabel('rtsMapPick', 'CHOOSE ANOTHER MAP'); }

/* The controls tile collapses, and stays collapsed. A player who has learnt the shortcuts should
   not have to scroll past thirty of them on every visit - but a first-time player should still
   meet them, so the markup ships `open` and only an explicit close is remembered.

   localStorage rather than the IndexedDB store in src/rts.store.js: that one exists to hold
   megabytes of archives, and this is one boolean. Wrapped because private-browsing modes throw
   on access rather than returning null, and a disabled store must cost the player a preference,
   not the title screen. */
var RTS_KEYS_LS = 'rcc.keysOpen';
function rtsKeysInit() {
  var el = document.getElementById('rtsKeys');
  if (!el) return;
  try {
    var saved = window.localStorage.getItem(RTS_KEYS_LS);
    if (saved === '0') el.open = false;
  } catch (e) { /* no storage: the markup's own `open` stands */ }
  el.addEventListener('toggle', function () {
    try { window.localStorage.setItem(RTS_KEYS_LS, el.open ? '1' : '0'); } catch (e) {}
  });
}
rtsKeysInit();

/* --------------------------------------------------------------- install --
   Make the app a DESKTOP app: its own window, its own icon in the dock or the Start menu, no
   browser chrome, launched without going near a URL bar.

   Everything needed for that has been in the repo for months - manifest.webmanifest, two PNG
   icons, and a service worker whose only stated job is to satisfy the install criteria - and
   none of it was discoverable. The browser hides its install control in a menu most people
   never open, so the app that could already be installed effectively could not.

   THE BUTTON IS ALWAYS THERE, and the first version's was not. It only appeared once the
   browser fired `beforeinstallprompt` - which is invisible, unreliable and frequently never
   happens: Chromium suppresses it after a dismissal, Safari and Firefox never send it at all,
   and it does not fire when the app is already installed. So "your browser is not offering an
   install right now" and "this feature does not exist" looked exactly the same, and the first
   thing asked about it was where it had gone.

   A control whose absence is indistinguishable from a bug is the wrong control. This one is
   always shown and always does something: it opens the real prompt when the browser has given
   us one, and otherwise says how to install by hand in whichever browser is running. The one
   case it hides in is the app ALREADY being the installed app, where its absence explains
   itself. */
var _RTS_INSTALL_EVT = null;
function rtsInstalled() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.matchMedia('(display-mode: window-controls-overlay)').matches ||
           navigator.standalone === true;
  } catch (e) { return false; }
}
/* How to install by hand, per browser. Read off the user agent, which is the wrong tool for
   feature detection and the right one here - this is a sentence about where a menu item lives
   in a particular product, and there is nothing to feature-detect. */
function _rtsInstallHelp() {
  var ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) {
    return 'Firefox cannot install web apps. Chrome, Edge or Safari can — or just play in the tab.';
  }
  if (/Edg\//.test(ua)) return 'Edge: ⋯ menu → Apps → Install this site as an app.';
  /* Safari must be tested before Chrome: every Chromium UA also says "Safari". */
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua)) {
    return /iPhone|iPad/.test(ua) ? 'Safari: Share → Add to Home Screen.'
                                  : 'Safari: File → Add to Dock.';
  }
  if (/Chrome\/|Chromium\//.test(ua)) {
    return 'Chrome: ⋮ menu → Cast, save and share → Install page as app. ' +
           '(The one-click prompt returns after a few visits.)';
  }
  return 'Look for “Install” or “Add to Dock” in your browser’s menu.';
}
function rtsInstallInit() {
  var btn = document.getElementById('rtsInstall');
  if (!btn) return;
  if (rtsInstalled()) { btn.hidden = true; return; }   /* this IS the installed app */
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();                       /* or nothing is offered at all */
    _RTS_INSTALL_EVT = ev;
    var note = document.getElementById('rtsInstallNote');
    if (note) note.hidden = true;              /* one click will do it now */
  });
  window.addEventListener('appinstalled', function () {
    _RTS_INSTALL_EVT = null;
    btn.hidden = true;
    var note = document.getElementById('rtsInstallNote');
    if (note) note.hidden = true;
  });
}
function rtsInstall() {
  var btn = document.getElementById('rtsInstall');
  var note = document.getElementById('rtsInstallNote');
  if (!_RTS_INSTALL_EVT) {
    /* No prompt to open. Say what to do instead rather than doing nothing, which is what a
       hidden button amounted to. */
    if (note) { note.textContent = _rtsInstallHelp(); note.className = 'diffnote'; note.hidden = false; }
    return;
  }
  var ev = _RTS_INSTALL_EVT;
  _RTS_INSTALL_EVT = null;                     /* a prompt event is single-use */
  ev.prompt();
  /* Declining is not failure: the button stays, and falls back to the instructions. */
  if (ev.userChoice && ev.userChoice.then) ev.userChoice.then(function () {}, function () {});
}
rtsInstallInit();

/* Remembering has to be undoable, or a bad file becomes permanent. */
function rtsAddForget(host) {
  if (!host || document.getElementById('rtsForget')) return;
  var a = document.createElement('a');
  a.id = 'rtsForget'; a.href = '#'; a.textContent = 'forget these';
  a.onclick = function (ev) {
    ev.preventDefault();
    rtsStoreForget().then(function () { location.reload(); });
    return false;
  };
  host.appendChild(a);
}
rtsRestoreSaved();
function rtsStart(btn){
  var err = document.getElementById('rtsErr');
  if (err) err.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'DEPLOYING…'; }
  /* let the button repaint before the (synchronous) first-run building construction */
  setTimeout(function(){
    try {
      document.getElementById('rtsHome').classList.add('gone');
      rtsOpen();
    } catch (e) {
      rtsHome();
      if (err) { err.style.display = 'block'; err.textContent = 'Could not start:\n' + ((e && e.message) || e); }
    }
  }, 30);
}
/* Enter/Space on the title screen starts a battle - unless the player is ON a control, in which
   case Enter and Space are that control's own activation and belong to it.

   Without the guard this fired for every Enter and Space anywhere on the screen, and its
   preventDefault killed the button underneath: tab to SOVIET, press Enter, and an ALLIED battle
   starts with the choice silently discarded. Same for the difficulty buttons. Worst of all, tab
   to RESUME BATTLE and press Enter and you got a NEW match at t=0 instead of your save. */
document.addEventListener('keydown', function(e){
  var h = document.getElementById('rtsHome');
  if (!h || h.classList.contains('gone')) return;
  var a = document.activeElement;
  if (a && a !== document.body && /^(BUTTON|INPUT|A|LABEL|SELECT|TEXTAREA|SUMMARY)$/.test(a.tagName)) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rtsStart(document.getElementById('rtsGo')); }
});
if ('serviceWorker' in navigator) {
  try { navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) {}
}
