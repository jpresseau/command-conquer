/* ui/pause.js - PAUSE, and the GAME SPEED. Part of rts.ui, which owns the DOM.

   PAUSE stops the simulation and nothing else: the loop keeps drawing, so the camera still pans,
   zooms and turns, the radar and the readouts stay live, and a player can look round a frozen
   battle. P or the ⏸ in the top bar; the paused screen's RESUME, or P again, goes on. The flag is
   on the UI state (U.paused), never on G, so a save never carries it and a load never opens
   paused. A battle that is over cannot be paused: its end card is already up. Pausing writes the
   autosave, because on a phone a paused battle is usually one about to be left.

   SPEED runs the simulation more than once a frame - 1x one tick, 2x two, 1.5x three every two
   frames - with each tick given the frame's own dt (ui/camera.js, _rtsSpeedTicks). A bigger dt
   would have been simpler and wrong: the tick is tuned at one step size, and a few things in it
   (unit separation, the pathfinder's re-plan timers) are not linear in it. Kept in localStorage,
   so it is the player's and not the battle's; the opponent plays at the same speed, so it
   changes how long a battle takes and nothing about who wins it. */

var RTS_SPEED_LS = 'bw.speed';
var RTS_SPEEDS = [1, 1.5, 2];

function rtsSpeedGet() {
  if (window._RTS_SPEED) return window._RTS_SPEED;
  var v = 1;
  try { v = +window.localStorage.getItem(RTS_SPEED_LS) || 1; } catch (e) { v = 1; }
  return (window._RTS_SPEED = RTS_SPEEDS.indexOf(v) >= 0 ? v : 1);
}
/* one of RTS_SPEEDS, or false and nothing changes */
function rtsSpeedSet(v) {
  v = +v;
  if (RTS_SPEEDS.indexOf(v) < 0) return false;
  window._RTS_SPEED = v;
  try { window.localStorage.setItem(RTS_SPEED_LS, String(v)); } catch (e) {}
  return true;
}
/* How many simulation ticks this frame runs: the speed's whole part, and its fraction carried
   over on the UI state until it makes another. Paused, none - and nothing accumulates, so the
   first frame after a pause is an ordinary one, not a catch-up. */
function _rtsSpeedTicks(U, speed) {
  if (!U || U.paused) return 0;
  U.speedAcc = (U.speedAcc || 0) + (speed || 1);
  var n = Math.floor(U.speedAcc + 1e-9);
  U.speedAcc -= n;
  return n;
}
function rtsPauseToggle(on) {
  var U = window._rtsUI, G = window._rtsG;
  if (!U || !G || G.over) return false;
  U.paused = on === undefined ? !U.paused : !!on;
  if (U.paused && typeof _rtsAutoSave === 'function') _rtsAutoSave();
  _rtsPauseSync();
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
  return U.paused;
}
function rtsSpeedPick(v) { if (rtsSpeedSet(v)) _rtsPauseSync(); }
/* the screen, the button and the speed choice, from the state */
function _rtsPauseSync() {
  var U = window._rtsUI, o = document.getElementById('rtsPause'), b = document.getElementById('rtsPauseBtn');
  if (!o) return;
  var on = !!(U && U.paused), sp = rtsSpeedGet();
  if (o.hidden === on) o.hidden = !on;
  if (b) {
    var txt = on ? '▶' : (sp === 1 ? '⏸' : sp + '×');
    if (b.textContent !== txt) b.textContent = txt;
    b.title = on ? 'Resume (P)' : 'Pause (P)' + (sp === 1 ? '' : ' — playing at ' + sp + '×');
  }
  [].forEach.call(o.querySelectorAll('button[data-speed]'), function (x) { x.className = +x.getAttribute('data-speed') === sp ? 'on' : ''; });
}
function _rtsPauseHTML() {
  return '<div class="rts-pause" id="rtsPause" hidden><div class="card"><h2>PAUSED</h2>'
    + '<p class="s">the battle waits; the camera does not</p>'
    + '<p class="speed">Speed ' + RTS_SPEEDS.map(function (v) { return '<button type="button" data-speed="' + v + '" onclick="rtsSpeedPick(' + v + ')">' + v + '×</button>'; }).join('') + '</p>'
    + '<button type="button" class="go" onclick="rtsPauseToggle(false)">RESUME</button></div></div>';
}
