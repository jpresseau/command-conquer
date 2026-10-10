/* title.js - the standalone shell around the game: the title screen, the difficulty picker,
   the army picker, RESUME BATTLE, the install prompt, and the START button.

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
  /* a daily battle borrowed the army and difficulty: put the player's own back (daily.js) */
  if (typeof rtsDailyEnd === 'function') rtsDailyEnd();
  if (typeof rtsCampEnd === 'function') rtsCampEnd();      /* and so did a mission (campaign.js) */
  var db = document.getElementById('rtsDaily');
  if (db) { db.disabled = false; db.innerHTML = 'DAILY BATTLE<small id="rtsDailyNote"></small>'; }
  if (typeof rtsDailyNote === 'function') rtsDailyNote();
  rtsBuildDiff();
  if (typeof rtsSkySync === 'function') rtsSkySync();     /* the conditions: render3d/sky3d.js */
  rtsShowResume();
}
/* Get_Savefile_Info's job: print what is in the save without loading it. The button only
   appears when there is a save this build can actually read - the version stamp does that
   check, so a save from older code shows nothing rather than a button that fails. */
/* WHICH ARMY YOU COMMAND. This began as a voices-only toggle, because the roster was one
   merged list with both sides' buildings in it and there was genuinely nothing else to choose
   between. There is now: the Allies get the Pillbox, the Gun Turret, the Medic, the Light Tank,
   the Artillery and the Helipad; the Soviets get the Flame Tower, the Tesla Coil, the Kennel
   and its dogs, the Flame Squad and the Mammoth. */
function rtsBuildArmyPick(){
  var wrap = document.getElementById('rtsArmySide'), note = document.getElementById('rtsVoxNote');
  if (!wrap || typeof rtsArmySide !== 'function') return;
  wrap.hidden = note.hidden = false;
  if (!wrap.firstChild) {
    wrap.innerHTML = '<button type="button" data-v="allied">COMPACT</button>' +
                     '<button type="button" data-v="soviet">DOMINION</button>';
    [].forEach.call(wrap.getElementsByTagName('button'), function (b) {
      b.onclick = function () { rtsSetArmySide(b.getAttribute('data-v')); rtsBuildArmyPick(); };
    });
  }
  var cur = rtsArmySide();
  [].forEach.call(wrap.getElementsByTagName('button'), function (b) {
    b.className = (b.getAttribute('data-v') === cur) ? 'on' : '';
  });
  note.textContent = (cur === 'soviet'
    ? 'The Basalt Dominion: Flame Towers, Arc Towers, war dogs, Bulwark tanks.'
    : 'The Meridian Compact: Pillboxes, gun turrets, medics, light tanks, artillery, gunships.')
    + ' The enemy takes the other army.';
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
if (typeof rtsSkySync === 'function') rtsSkySync();
rtsShowResume();
rtsBuildArmyPick();
if (typeof rtsDailyNote === 'function') rtsDailyNote();

/* THE OLD ARCHIVE STORE, gone. Earlier versions could keep a player's own game archives in
   IndexedDB, 13 MB and up; that feature is removed, so a returning player gets the space back. */
try { if (window.indexedDB) window.indexedDB.deleteDatabase('rccommand'); } catch (e) {}

/* The controls tile collapses, and stays collapsed. A player who has learnt the shortcuts should
   not have to scroll past thirty of them on every visit - but a first-time player should still
   meet them, so the markup ships `open` and only an explicit close is remembered.

   localStorage, and wrapped because private-browsing modes throw
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
