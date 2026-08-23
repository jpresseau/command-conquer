/* ui/touchcmd.js - the combat commands a phone had no way to give.

   THREE CONTROLS EXISTED ONLY AS KEYS. Attack-move was `U.attackMove`, set while A is held and
   cleared on keyup; hold position was the S handler; team groups were the digit row, with ctrl
   to assign and alt to jump - and the desktop help line advertises all of it. On touch there
   was no path to any of them. Not conveniences either: attack-move is how a group advances and
   fights on the way, and hold is how you stop units chasing something across the map. A player
   on a phone could move and attack, and nothing else.

   That is the third instance of the same fault in this UI - the sidebar told a phone to
   right-click, the Mobile Yard named a Deploy button that had never been built - so the shape
   is worth stating: a control that exists only as a key is a control a touch player does not
   have, and the help text saying so out loud does not make it one.

   WHY A MODE RATHER THAN A HELD BUTTON. On a keyboard attack-move is momentary: hold A, give
   the order, let go. A finger cannot hold one button and tap the map with the same hand, so the
   button here LATCHES and stays lit until it is tapped off - which is the idiom this sidebar
   already uses for repair and sell (U.mode), and the lit button is the feedback that stops it
   being a mode you forget you are in.

   BUILT FROM THE FRAME WALK, for the reason ui/gfxstat.js records: the shell's resize handler
   does not run when a match opens, so anything built there appears only if the window happens
   to be resized - and on a phone it never appears at all. */

/* Touch only. A desktop has the keys, and three more buttons over the battlefield would be
   three fewer cells of map for no gain. */
function _rtsTouchCmdWanted() {
  return typeof _rtsTouchUI === 'function' && _rtsTouchUI();
}

var _RTS_TCMD = { built: false, teams: false };

function _rtsTouchCmdFrame() {
  var T = _RTS_TCMD;
  if (!T.built) {
    if (!_rtsTouchCmdWanted()) return;
    _rtsTouchCmdInit();
    T.built = !!document.getElementById('rtsTCmd');
    if (!T.built) return;
  }
  _rtsTouchCmdSync();
}

/* The lit states, repainted each frame off the game rather than remembered here - a button
   that tracks its own idea of the mode is a button that can disagree with the game. */
function _rtsTouchCmdSync() {
  var U = window._rtsUI, G = window._rtsG;
  var am = document.getElementById('rtsTAmove');
  if (am) am.className = (U && U.attackMove) ? 'on' : '';
  var tb = document.getElementById('rtsTTeams');
  if (tb) tb.className = _RTS_TCMD.teams ? 'on' : '';
  var row = document.getElementById('rtsTNums');
  if (row) row.style.display = _RTS_TCMD.teams ? 'flex' : 'none';
  /* HOLD and the team digits are pointless with nothing selected, so they grey rather than
     accept a tap that can only do nothing. */
  var any = 0;
  if (G && G.sel) for (var i = 0; i < G.sel.length; i++) {
    var e = G.sel[i];
    if (e && !e.dead && e.side === 'player' && e.type === 'unit') { any = 1; break; }
  }
  var hb = document.getElementById('rtsTHold');
  if (hb && hb.disabled !== !any) hb.disabled = !any;
}

function _rtsTouchCmdInit() {
  var stage = document.querySelector('#rcgRts .rts-stage');
  if (!stage || document.getElementById('rtsTCmd')) return;
  var bar = document.createElement('div');
  bar.id = 'rtsTCmd';

  function mk(id, label, title, onTap, onHold) {
    var b = document.createElement('button');
    b.id = id; b.type = 'button'; b.textContent = label; b.title = title;
    /* touchend rather than click: click on a canvas-heavy page arrives late enough after the
       touch that the map underneath has already taken the gesture. preventDefault stops the
       tap falling through to the battlefield and issuing a move order at the same spot. */
    var held = null, fired = false;
    b.addEventListener('touchstart', function () {
      fired = false;
      if (onHold) held = setTimeout(function () { fired = true; held = null; onHold(); }, 500);
    }, { passive: true });
    b.addEventListener('touchmove', function () {
      if (held) { clearTimeout(held); held = null; }
    }, { passive: true });
    b.addEventListener('touchend', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (held) { clearTimeout(held); held = null; }
      if (!fired) onTap();
    });
    /* and a plain click, so the same bar works under a mouse when one is present - a tablet
       with a trackpad reports coarse pointers and still clicks. */
    b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); onTap(); });
    return b;
  }

  var row1 = document.createElement('div');
  row1.className = 'tcmd-row';
  row1.appendChild(mk('rtsTAmove', 'A-MOVE', 'Advance and engage on the way', function () {
    var U = window._rtsUI;
    U.attackMove = !U.attackMove;
    _rtsSay(U.attackMove ? 'Attack-move: give an order.' : 'Attack-move off.');
    if (typeof _rtsSfx === 'function') _rtsSfx('click');
    _rtsTouchCmdSync();
  }));
  row1.appendChild(mk('rtsTHold', 'HOLD', 'Stop and hold this ground', function () {
    var held = typeof _rtsHoldSelected === 'function' ? _rtsHoldSelected() : 0;
    if (held) {
      _rtsSay(held + ' holding position.');
      if (typeof _rtsSfx === 'function') _rtsSfx('order');
    } else {
      _rtsSay('Nothing selected to hold.');
      if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    }
  }));
  row1.appendChild(mk('rtsTTeams', 'TEAMS', 'Show the team groups', function () {
    _RTS_TCMD.teams = !_RTS_TCMD.teams;
    if (typeof _rtsSfx === 'function') _rtsSfx('click');
    _rtsTouchCmdSync();
  }));
  bar.appendChild(row1);

  /* The digits, hidden until asked for. Nine buttons is most of a 360px phone's width, and a
     player who never uses teams should not lose that strip of map to them for the whole match.
     TAP SELECTS, HOLD ASSIGNS - the same long-press the sidebar already uses for hold/cancel,
     rather than a modifier key a phone does not have. */
  var nums = document.createElement('div');
  nums.className = 'tcmd-row'; nums.id = 'rtsTNums'; nums.style.display = 'none';
  for (var n = 0; n < 9; n++) {
    (function (team) {
      nums.appendChild(mk('rtsTTeam' + team, String(team + 1),
        'Tap: select team ' + (team + 1) + '   Hold: assign the selection to it',
        function () {
          _rtsHandleTeam(team, 0);
          if (typeof _rtsSfx === 'function') _rtsSfx('click');
        },
        function () {
          _rtsHandleTeam(team, 2);
          if (typeof _rtsSfx === 'function') _rtsSfx('order');
        }));
    })(n);
  }
  bar.appendChild(nums);
  stage.appendChild(bar);
  _rtsTouchCmdSync();
}
