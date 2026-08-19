/* ui/shell.js - opening and closing a battle, and keeping the canvases the right size.
   Part of rts.ui, which owns the DOM. */

/* RED ALERT - UI + input + the main loop.

   Layout is the classic one: battlefield on the left, a fixed command sidebar on the
   right holding credits, power, radar and the build tiles. Selection brackets, health bars
   and the drag box are drawn on a 2D overlay canvas above the battlefield canvas. */

window._rtsUI = null;

function rtsOpen(seed) {
  if (document.getElementById('rcgRts')) return;
  /* hide the title screen while a battle is running */
  var _home = document.getElementById('rtsHome');
  if (_home) _home.classList.add('gone');

  var d = document.createElement('div');
  d.id = 'rcgRts';
  d.innerHTML = ''
    + '<div class="rts-stage">'
    /* The 3D mode's canvas, UNDER the 2D one: when the mode is on, rtsCv becomes a
       transparent overlay (effects, decals, ghost) and this carries the world. Hidden rather
       than absent when the mode is off, so toggling is a style flip, not a DOM rebuild. */
    +   '<canvas id="rtsCv3d" style="display:none"></canvas>'
    +   '<canvas id="rtsCv"></canvas>'
    /* The bloom's glow, as an ELEMENT the compositor screen-blends - in 3D the world is on
       the presented GL layer and additive light cannot be pushed through source-over from a
       transparent overlay; see the composite-back in _rtsPost. Holds the eighth-scale bloom
       buffer, stretched by CSS. Transparent (= invisible) except while something burns. */
    +   '<canvas id="rtsGlow"></canvas>'
    /* The vignette, as an ELEMENT rather than a per-frame canvas composite - see _rtsPost for
       why it moved. It sits between the battlefield and the HUD, which is exactly where the
       old multiply sat in the draw order. */
    +   '<div id="rtsVig"></div>'
    +   '<canvas id="rtsHud"></canvas>'
    +   '<div class="rts-top"><span class="rts-title">RED ALERT</span>'
    +     '<span class="rts-vs"><b class="p">' + rtsArmyName('player') + '</b> vs <b class="e">' +
          rtsArmyName('enemy') + '</b>'
    +       '<i class="dif" id="rtsDifLbl"></i></span>'
    /* Two hint lines, because the verbs genuinely differ - a phone has no right button and no
       wheel, and a desktop has no long-press. CSS shows exactly one; see .rts-help. */
    +     '<span class="rts-help desk">drag select · right-click order · S hold · 1-9 teams (ctrl set, alt jump) · repair/sell · wheel zoom · Esc</span>'
    /* ONE GROUP, IN THE FLOW. These were four absolutely positioned buttons at right:6/34/62/90,
       so the bar's flex layout did not know they existed and the army/difficulty text ran
       underneath them - measured on every phone from 360 to 412px wide, with `.rts-vs` sitting
       24px under Save, 24px under Load and 4px under Mute at 360. Reserving the space by
       padding would work until somebody added a fifth button; a flex group reserves exactly
       what it needs. */
    +     '<span class="rts-btns">'
    /* THE ODD ONE OUT, AND LEFTMOST FOR THAT REASON. Save, Load, Mute and ✕ are all about the
       BATTLE; this one is about the PAGE - it throws the running build away and fetches
       whatever is deployed. Putting it at the far end of the group keeps that difference
       visible, and keeps it as far as the group allows from the ✕, which is the control it
       would be worst to confuse it with: both end the match, and only one of them is meant to. */
    +       '<button type="button" class="rts-mute" id="rts3dBtn" title="Switch to 3D" onclick="rts3dToggle()">3D</button>'
    +       '<button type="button" class="rts-mute" id="rtsReloadBtn" title="Reload for the latest build" onclick="rtsReloadClick()">⟳</button>'
    +       '<button type="button" class="rts-mute" id="rtsSaveBtn" title="Save this battle (Ctrl+S)" onclick="rtsSaveGame()">💾</button>'
    +       '<button type="button" class="rts-mute" id="rtsLoadBtn" title="Resume the saved battle" onclick="rtsLoadGame()">📂</button>'
    +       '<button type="button" class="rts-mute" id="rtsMute" title="Sound on" onclick="rtsMuteToggle()">🔊</button>'
    +       '<button type="button" class="rts-x" id="rtsQuitBtn" title="Leave the battle" onclick="rtsQuitClick()">✕</button>'
    +     '</span></div>'
    /* The touch hint is a SIBLING of the top bar, not a child of it. In that bar it had to share
       one 34px line with the title, the army names, the difficulty pill and four buttons; on a
       390px phone there is no room, so it wrapped to three lines, overflowed the bar and ran
       underneath the close button. Along the bottom of the battlefield it has the full width to
       itself, and it is nearer the thumb that has to perform what it describes. */
    +   '<span class="rts-help touch">drag to move · tap to select · hold for orders · pinch to zoom</span>'
    +   '<div class="rts-msg" id="rtsMsg"></div>'
    +   '<div class="rts-over" id="rtsOver"></div>'
    + '</div>'
    + '<div class="rts-bar">'
    +   '<div class="rts-credits"><span class="lbl">CREDITS</span><span class="val" id="rtsCred">0</span></div>'
    /* Storage: how full the silos are. Without a readout the only sign that scrap is being
       thrown away is a line of text that has already scrolled off. */
    +   '<div class="rts-store" id="rtsStore" title="Storage"><i id="rtsStoreFill"></i></div>'
    +   '<div class="rts-radar"><canvas id="rtsMini" width="188" height="188"></canvas>'
    +     '<span class="rlbl">RADAR</span></div>'
    +   '<div class="rts-tabs">' + _rtsTabButtons() + '</div>'
    +   '<div class="rts-ops">'
    +     '<button type="button" data-mode="repair" onclick="rtsMode(\'repair\')" '
    +       'title="Repair: click one of your buildings to patch it up for credits">🔧 REPAIR</button>'
    +     '<button type="button" data-mode="sell" onclick="rtsMode(\'sell\')" '
    +       'title="Sell: click one of your buildings to sell it back">💲 SELL</button>'
    +   '</div>'
    /* Empty until something can charge one. A row of permanently greyed-out superweapons is a
       list of things you cannot have; a row that appears when you build the silo is news. */
    +   '<div class="rts-supers" id="rtsSupers"></div>'
    +   '<div class="rts-mid">'
    +     '<div class="rts-pwr" title="Power"><span class="ptxt">P<br>W<br>R</span>'
    +       '<div class="ptrack"><i id="rtsPwrFill"></i><b id="rtsPwrMark"></b></div></div>'
    +     '<div class="rts-grid" id="rtsList"></div>'
    +   '</div>'
    +   '<div class="rts-sel" id="rtsSel">Nothing selected</div>'
    + '</div>';
  document.body.appendChild(d);

  /* The vignette gradient, from the constant that has always named its colour - so RTS_VIGNETTE
     keeps working as the one knob, and the CSS only says where the element sits and how it
     blends. Same stops as the old canvas gradient: white (identity under multiply) to 42% of
     the way out, then shading to the corner colour at the farthest corner. */
  document.getElementById('rtsVig').style.background =
    'radial-gradient(circle farthest-corner at 50% 50%,#ffffff 0%,#ffffff 42%,' +
    RTS_VIGNETTE + ' 100%)';

  /* A pending load lands BETWEEN the new game and the renderer: _rtsNewGame supplies every
     invariant, the save overwrites the state on top of it, and _rtsRInit then bakes the
     terrain the save actually carries rather than the one the seed would have produced. */
  var _load = window._RTS_PENDING_LOAD; window._RTS_PENDING_LOAD = null;
  _rtsNewGame(_load ? _load.seed : (seed || (((new Date()).getTime()) & 0xffff)),
              _load ? _load.diff : undefined);
  if (_load) _rtsApplyState(window._rtsG, _load);
  var cv = document.getElementById('rtsCv');
  _rtsResizeCanvases();
  _rtsRInit(cv);
  /* The view opens on the player's OWN command yard. It used to open on a fixed corner,
     which was fine while the start was also fixed; with SCENARIO.CPP's rolled start the
     match can begin anywhere on the ring and a hardcoded focus looks at empty ground. */
  var _home = _rtsHas('player', 'yard');
  if (_home) { _rtsR.focus.x = _home.x; _rtsR.focus.z = _home.z; }

  window._rtsUI = { cat:'struct', place:null, drag:null, keys:{}, last:0, raf:0, dead:false,
    btns:{}, mouse:{ x:0, y:0, over:false }, miniDrag:false, credShown:0, avail:null,
    icons:_rtsMakeIcons('player') };
  var dl = document.getElementById('rtsDifLbl'), dd = _rtsBias('enemy');
  if (dl) { dl.textContent = dd.name; dl.title = 'Difficulty: ' + dd.name + ' (IQ ' + dd.iq + '/' + RTS_IQ.max + ') — ' + dd.desc; }
  _rtsSyncTabs();
  _rtsBuildList();
  _rtsBindInput();
  document.addEventListener('keydown', _rtsKeyDown, true);
  document.addEventListener('keyup', _rtsKeyUp, true);
  window.addEventListener('resize', _rtsOnResize);
  _rtsWatchSize();
  /* rtsOpen runs off a real click, so this is a valid gesture to unlock WebAudio */
  if (typeof _rtsAudioInit === 'function') { _rtsAudioInit(); _rtsAudioResume(); _rtsMusicStart(); }
  /* A player who chose 3D chose it for the game, not for one match: without this the mode came
     back off after every reload and every new battle, which reads as the toggle having been
     ignored rather than as a default. Restored here because it needs the canvases and the
     button to exist, and before the first frame so nothing paints in the wrong mode. */
  if (typeof rts3dRestore === 'function') rts3dRestore();
  if (_load) _rtsSay('Battle resumed.');
  else _rtsSay(rtsArmyName('player') + ' command online. Build a Refinery to start earning.');
  _rtsUI.last = (new Date()).getTime();
  _rtsLoop(true);        /* paint the first frame; see the note on _rtsLoop */
}

/* THE ✕ ASKS FIRST. It ends the match with no autosave and no second slot, and it sat four
   pixels from the mute button a player presses casually - so the most destructive control on
   the screen was the one most easily hit by accident, and it acted immediately.

   Two presses rather than a browser confirm(): the game already teaches press-once-to-arm,
   press-again-to-commit for holding and cancelling production, and a modal dialog on a phone
   is a worse interruption than a line of text. rtsClose itself is left alone - it is called
   by the game-over path and by the specs, and neither should be made to answer a question. */
var RTS_QUIT_WINDOW = 5;
function rtsQuitClick() {
  var U = window._rtsUI, G = window._rtsG;
  if (!U) { rtsClose(); return; }
  var now = G ? G.t : 0;
  if (U.quitArm && now - U.quitArm < RTS_QUIT_WINDOW) { U.quitArm = 0; rtsClose(); return; }
  U.quitArm = now;
  var b = document.getElementById('rtsQuitBtn');
  if (b) b.classList.add('arm');
  if (typeof _rtsSfx === 'function') _rtsSfx('deny');
  _rtsSay('Leave the battle? Press ✕ again to confirm — this battle is not saved.',
          RTS_QUIT_WINDOW);
  setTimeout(function () {
    var bb = document.getElementById('rtsQuitBtn');
    if (bb) bb.classList.remove('arm');
    if (window._rtsUI) window._rtsUI.quitArm = 0;
  }, RTS_QUIT_WINDOW * 1000);
}
/* ⟳ RELOAD, AND IT ASKS FIRST FOR THE SAME REASON THE ✕ DOES. Reloading throws the running
   battle away exactly as quitting does - there is no autosave - so it gets the same
   press-once-to-arm, press-again-to-commit the game already teaches for quitting and for
   holding production. Amber rather than red: it is losing the battle, not losing the battle
   AND leaving.

   WHAT IT ACTUALLY DOES, and it is deliberately more than location.reload(). sw.js is
   network-only and never calls respondWith(), so a plain reload is already enough to pull a new
   deploy - but two things can still leave a player looking at an old build, and neither is
   visible from inside the page:

     a previously-deployed service worker that DID cache, whose Cache Storage entries outlive
     the worker that wrote them - so every cache is dropped, not just ours;
     a changed sw.js, which the browser only re-checks on navigation - update() asks now.

   Both are best-effort and neither may block the reload: a hung promise would leave the button
   looking broken, which is the failure this button exists to avoid. Hence the backstop timer
   and the `fired` latch, so whichever finishes first reloads and the other does nothing. */
var RTS_RELOAD_WINDOW = 5;
var RTS_RELOAD_GIVEUP = 1500;      /* ms to wait on the caches before reloading anyway */
function rtsReloadClick() {
  var U = window._rtsUI, G = window._rtsG;
  if (!U) { _rtsReloadNow(); return; }
  var now = G ? G.t : 0;
  if (U.reloadArm && now - U.reloadArm < RTS_RELOAD_WINDOW) { U.reloadArm = 0; _rtsReloadNow(); return; }
  U.reloadArm = now;
  var b = document.getElementById('rtsReloadBtn');
  if (b) b.classList.add('arm');
  if (typeof _rtsSfx === 'function') _rtsSfx('deny');
  _rtsSay('Reload for the latest build? Press ⟳ again to confirm — this battle is not saved.',
          RTS_RELOAD_WINDOW);
  setTimeout(function () {
    var bb = document.getElementById('rtsReloadBtn');
    if (bb) bb.classList.remove('arm');
    if (window._rtsUI) window._rtsUI.reloadArm = 0;
  }, RTS_RELOAD_WINDOW * 1000);
}
function _rtsReloadNow() {
  var fired = false;
  function go() {
    if (fired) return;
    fired = true;
    try { location.reload(); } catch (e) { try { location.href = location.href; } catch (e2) {} }
  }
  var jobs = [];
  try {
    if (window.caches && caches.keys) jobs.push(caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) { return caches.delete(k); }));
    }));
  } catch (e) {}
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.update(); }));
      }));
  } catch (e) {}
  if (!jobs.length) { go(); return; }
  setTimeout(go, RTS_RELOAD_GIVEUP);
  Promise.all(jobs.map(function (p) { return Promise.resolve(p).catch(function () {}); }))
    .then(go, go);
}
function rtsClose() {
  var d = document.getElementById('rcgRts');
  if (!d) return;
  var U = window._rtsUI;
  if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (_a) {} }
  document.removeEventListener('keydown', _rtsKeyDown, true);
  document.removeEventListener('keyup', _rtsKeyUp, true);
  window.removeEventListener('resize', _rtsOnResize);
  if (U && U.ro) { try { U.ro.disconnect(); } catch (_b) {} U.ro = null; }
  /* The window mouseup, which used to be anonymous and therefore unremovable - see where it is
     bound for what that cost. Its closure holds U, and U holds the canvases. */
  if (U && U.onWinUp) { window.removeEventListener('mouseup', U.onWinUp); U.onWinUp = null; }
  /* And the 350ms touch long-press. Left armed, it outlived the match and reached
     _rtsRightClick with _rtsUI already null - an uncaught TypeError on the quit path, and on
     the restart path it landed INSIDE THE NEXT BATTLE about two seconds in, complete with a
     unit acknowledgement for an order nobody gave. */
  if (U && U.clearHold) { try { U.clearHold(); } catch (_c) {} U.clearHold = null; }
  if (typeof _rtsMusicStop === 'function') _rtsMusicStop();
  _rtsRDispose();
  if (typeof _RTS_RICON !== 'undefined') _RTS_RICON = null;
  window._rtsUI = null; window._rtsG = null;
  if (d.parentNode) d.parentNode.removeChild(d);
  /* standalone build: quitting a battle returns to the title screen rather than a blank page */
  if (window._RTS_STANDALONE && typeof rtsHome === 'function') rtsHome();
}

function _rtsResizeCanvases() {
  var st = document.querySelector('#rcgRts .rts-stage');
  if (!st) return null;
  var W = st.clientWidth || 900, H = st.clientHeight || 600;
  var cv = document.getElementById('rtsCv'), hud = document.getElementById('rtsHud');
  /* The HUD overlay must sit at the SAME device resolution as the battlefield under it, or
     health bars and selection brackets are drawn at a different sharpness from the units they
     belong to. This carried its own copy of the old `Math.min(2, ...)` cap, so raising it in
     render/camera.js and not here would have left the overlay soft on exactly the phones the
     change is for. One source of truth now. */
  var dpr = _rtsPickDpr();
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  var c3 = document.getElementById('rtsCv3d');
  if (c3) { c3.style.width = W + 'px'; c3.style.height = H + 'px'; }
  /* The glow canvas needs the same explicit box as every other canvas here: `inset:0` does
     NOT stretch an absolutely positioned REPLACED element - auto width on a canvas resolves
     to its intrinsic size, so without this the eighth-scale buffer sat 105px wide in the
     corner, and the fireball's halo rendered as a dim red smear at the top-left of the map. */
  var gcv = document.getElementById('rtsGlow');
  if (gcv) { gcv.style.width = W + 'px'; gcv.style.height = H + 'px'; }
  hud.style.width = W + 'px'; hud.style.height = H + 'px';
  hud.width = Math.round(W * dpr); hud.height = Math.round(H * dpr);
  hud.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W:W, H:H };
}
function _rtsOnResize() {
  /* The readout button is built here rather than in the markup because it belongs to the
     renderer, not to the shell: it is only meaningful once there is a canvas to describe. The
     call is idempotent - see _rtsGfxInit - so running it on every resize costs nothing. */
  if (typeof _rtsGfxInit === 'function') _rtsGfxInit();
  var s = _rtsResizeCanvases();
  if (s) _rtsRResize(s.W, s.H);
}

/* WATCH THE BOX, NOT THE EVENT. The `resize` listener above is not enough on a phone, and
   rotating one to landscape was reported as a broken view: the canvas kept its portrait size
   inside a now-wider stage, leaving the stage's own background showing down the left and
   along the bottom with the battlefield stranded in the middle.

   iOS fires `resize` while the rotation is still animating, so clientWidth/clientHeight are
   read at their OLD values and the canvas is resized to the size it already had. Chasing that
   with orientationchange, visualViewport and a pile of timeouts is guesswork about when the
   layout settles. A ResizeObserver is not: it reports the element's box AFTER layout, however
   the change was caused - rotation, the URL bar sliding away, a desktop window drag, entering
   fullscreen - and it delivers the new size rather than making us measure it.

   The old listener stays for anything without ResizeObserver, where a stale read beats none. */
function _rtsWatchSize() {
  var st = document.querySelector('#rcgRts .rts-stage');
  var U = window._rtsUI;
  if (!st || !U || typeof ResizeObserver === 'undefined') return;
  U.ro = new ResizeObserver(function () {
    if (!window._rtsUI || !_rtsR) return;
    var s = _rtsResizeCanvases();
    /* Only when it really changed: the observer also fires on the initial observe, and
       rebuilding the backing store re-rasterises everything for nothing. */
    if (s && (s.W !== _rtsR.W || s.H !== _rtsR.H)) _rtsRResize(s.W, s.H);
  });
  U.ro.observe(st);
}

