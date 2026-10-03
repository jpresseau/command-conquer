/* ui/soundpanel.js - the player's levels: the 🔊 button opens a panel with the mute and three
   sliders, music, effects and the world around them (rts.audio.js keeps them, rtsVolSet).

   ONE BUTTON, NOT FOUR. The top bar has no room - on a 360-pixel phone it already carries six
   controls and e2e/topbar holds them to their places - so the button that was mute opens this,
   and the mute is its first line. A slider at zero is that sound off: the music stops rather
   than playing to a silent bus.

   It closes on its ✕, on Escape (ui/input.js), or on a press anywhere outside it. */

var RTS_SOUND_ROWS = [['mus', 'Music'], ['sfx', 'Effects'], ['amb', 'World']];

function _rtsSoundPanelBuild() {
  var root = document.getElementById('rcgRts') || document.body, P = document.createElement('div');
  P.id = 'rtsSoundPanel'; P.className = 'rts-sound'; P.hidden = true;
  P.setAttribute('role', 'dialog'); P.setAttribute('aria-label', 'Sound');
  var h = '<div class="hd"><b>SOUND</b><button type="button" class="x" id="rtsSoundClose" title="Close">✕</button></div>' +
          '<button type="button" class="mute" id="rtsSoundMute"></button>';
  RTS_SOUND_ROWS.forEach(function (r) {
    h += '<label class="row" for="rtsVol_' + r[0] + '"><span>' + r[1] + '</span>' +
         '<input type="range" id="rtsVol_' + r[0] + '" min="0" max="100" step="5">' +
         '<i id="rtsVolV_' + r[0] + '"></i></label>';
  });
  P.innerHTML = h;
  root.appendChild(P);
  RTS_SOUND_ROWS.forEach(function (r) {
    var s = document.getElementById('rtsVol_' + r[0]);
    s.addEventListener('input', function () { rtsVolSet(r[0], s.value / 100); _rtsSoundPanelSync(); });
  });
  document.getElementById('rtsSoundMute').onclick = function () { rtsMuteToggle(); _rtsSoundPanelSync(); };
  document.getElementById('rtsSoundClose').onclick = function () { rtsSoundPanel(false); };
  /* a press outside it closes it - Escape is ui/input.js's, which has to know the panel is open
     before it decides Escape means leaving the battle. Once for the page: the shell rebuilds its
     DOM every match, and with it this panel, so the listener looks the panel up */
  if (!_rtsSoundPanelBuild.once) {
    _rtsSoundPanelBuild.once = true;
    var open = function () { var Q = document.getElementById('rtsSoundPanel'); return Q && !Q.hidden ? Q : null; };
    document.addEventListener('pointerdown', function (e) {
      var Q = open();
      if (Q && !Q.contains(e.target) && !(e.target.closest && e.target.closest('#rtsMute'))) rtsSoundPanel(false);
    }, true);
  }
  return P;
}

/* every control showing what is so */
function _rtsSoundPanelSync() {
  var muted = !!(_rtsA && _rtsA.muted), m = document.getElementById('rtsSoundMute');
  if (!m) return;
  m.textContent = muted ? '🔇 Sound off - tap to turn on' : '🔊 Sound on - tap to mute';
  m.classList.toggle('off', muted);
  RTS_SOUND_ROWS.forEach(function (r) {
    var v = Math.round(_rtsVol(r[0]) * 100);
    document.getElementById('rtsVol_' + r[0]).value = v;
    document.getElementById('rtsVolV_' + r[0]).textContent = v ? v + '%' : 'off';
  });
}

/* open it, close it (false), or turn it over (nothing) */
function rtsSoundPanel(open) {
  if (typeof _rtsAudioInit === 'function') { _rtsAudioInit(); _rtsAudioResume(); }
  var P = document.getElementById('rtsSoundPanel') || _rtsSoundPanelBuild();
  P.hidden = open == null ? !P.hidden : !open;
  if (!P.hidden) _rtsSoundPanelSync();
  var b = document.getElementById('rtsMute');
  if (b) b.setAttribute('aria-expanded', P.hidden ? 'false' : 'true');
}
