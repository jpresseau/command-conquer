/* ui/keys.js - the keyboard: what a key does when it goes down, the control groups it
   saves and recalls, and what it does when it comes up. Split from ui/input.js, which binds
   the pointer, touch and the minimap and calls these. */
function _rtsKeyDown(e) {
  if (!document.getElementById('rcgRts')) return;
  var U = window._rtsUI, G = window._rtsG;
  if (!U) return;
  var k = e.key;
  if (k === 'Escape') {
    /* Escape cancels the armed thing, whatever it is, and only leaves the battle when there is
       nothing armed to cancel. The superweapon was the one armed cursor missing from this list,
       so a player who had learned Escape-cancels from repair, sell and placement pressed it
       with the nuke live and QUIT THE MATCH - no confirmation, no autosave. The sound panel
       (ui/soundpanel.js) is the newest member of the list and the first in it: closing it with
       Escape quit the battle too, until e2e/soundpanel pressed it. */
    var SP = document.getElementById('rtsSoundPanel');
    if (SP && !SP.hidden) rtsSoundPanel(false);
    else if (U.mode) rtsMode(U.mode);
    else if (U.place) { U.place = null; _rtsGhostHide(); }
    else if (U.superArm) _rtsSuperDisarm();
    else rtsClose();
    e.preventDefault(); return;
  }
  /* a key in a slider or a box is that control's: Home, End, the arrows move a slider, not the camera */
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  U.keys[k.toLowerCase()] = true;
  if (_rtsZoomKeyDown(e, U)) return;   /* + and - : ui/navigate.js */
  if (k === 'Delete' || k === 'Backspace') { /* scuttle selected own units */
    for (var i = G.sel.length - 1; i >= 0; i--) if (G.sel[i].side === 'player' && G.sel[i].type === 'unit') _rtsKill(G.sel[i]);
    e.preventDefault();
  }
  if (k === 'a' || k === 'A') {
    if (e.ctrlKey || e.metaKey) { _rtsSelectAllArmy(); e.preventDefault(); }
    else U.attackMove = true;
  }
  /* Ctrl+S saves. Loading is deliberately NOT on a key - it throws the current battle away
     and that should take a deliberate click, not a mistyped shortcut. */
  if ((k === 's' || k === 'S') && (e.ctrlKey || e.metaKey)) { rtsSaveGame(); e.preventDefault(); return; }
  /* N walks the army, shift+N walks it backwards. */
  if (k === 'n' || k === 'N') { _rtsCycleObject(e.shiftKey ? -1 : 1); e.preventDefault(); }
  /* U unloads every selected transport that is carrying anything - here and now, wherever it is
     standing. The loop is core/transport.js _rtsUnloadSelected, which the sidebar's UNLOAD button
     gives too (a phone has no U), and which says so when a craft in open water has nowhere to
     put anyone. Right-clicking the shore is the aimed version - see _rtsOrderUnloadAt. */
  if (k === 'u' || k === 'U') {
    var ur = _rtsUnloadSelected();
    if (ur.out || ur.held) e.preventDefault();
  }
  /* D deploys every selected vehicle that can - an MCV into a Command Yard. The loop itself
     lives in core/transport.js, because the sidebar's Deploy button gives the same order and a
     keyboard-only path is how a phone ended up unable to deploy at all. */
  if (k === 'd' || k === 'D') {
    if (_rtsDeploySelected()) e.preventDefault();
  }
  /* Home centres on the selection; with nothing selected it falls back to your command yard,
     which is the "where was I" key when you have chased a raid across the map. */
  if (k === 'Home') {
    if (!_rtsCenterOnSel()) {
      var yd = _rtsHas('player', 'yard');
      if (yd) { _rtsR.focus.x = yd.x; _rtsR.focus.z = yd.z; _rtsClampFocus(); }
    }
    e.preventDefault();
  }
  /* MISSION_STICKY. Hold position: fire from where you stand, never chase, and the AI's
     base-defence recall leaves you alone. */
  /* The loop lives in core/production.js, because the touch bar gives the same order and a
     keyboard-only path is how a phone ended up unable to stop its army at all. */
  if (k === 's' || k === 'S') {
    var held = _rtsHoldSelected();
    if (held) { _rtsSay(held + ' holding position.'); if (typeof _rtsSfx === 'function') _rtsSfx('order'); }
  }

  /* Team hotkeys, per CONQUER.CPP's Handle_Team. The four modifier cases are the
     originals': plain selects, shift adds to the selection, ctrl assigns the current
     selection to the team, alt selects and centres the view on it. */
  if (k >= '0' && k <= '9') {
    var team = (k === '0') ? 9 : (k.charCodeAt(0) - 49);
    var action = e.shiftKey ? 1 : (e.ctrlKey || e.metaKey ? 2 : (e.altKey ? 3 : 0));
    _rtsHandleTeam(team, action);
    e.preventDefault();
  }
}

/* action: 0 select · 1 add to selection · 2 assign selection to team · 3 select and centre */
function _rtsHandleTeam(team, action) {
  var G = window._rtsG, i, e, n = 0;
  if (action === 2) {
    for (i = 0; i < G.ents.length; i++) {
      e = G.ents[i];
      if (e.type !== 'unit' || e.side !== 'player' || e.dead) continue;
      if (e.team === team) e.team = -1;                    /* clear the old membership */
      if (G.sel.indexOf(e) >= 0) { e.team = team; n++; }
    }
    if (n) _rtsSay('Team ' + ((team + 1) % 10) + ': ' + n + ' unit' + (n === 1 ? '' : 's') + '.');
    else _rtsSay('Nothing selected to assign.');
    if (typeof _rtsSfx === 'function') _rtsSfx(n ? 'click' : 'deny');
    return;
  }
  if (action !== 1) G.sel.length = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (!_rtsIsArmy(e) || e.team !== team) continue;
    if (G.sel.indexOf(e) < 0) G.sel.push(e);
    n++;
  }
  /* An empty team still clears the selection - Handle_Team calls Unselect_All before it selects
     the members, and that fidelity is kept. What is NOT kept is doing it in silence: the army
     vanished from the sidebar with no message and no sound, which reads as the game dropping
     the selection rather than as an empty team slot. */
  if (!n) {
    _rtsSay('Team ' + ((team + 1) % 10) + ' is empty — Ctrl+' + ((team + 1) % 10) + ' assigns one.');
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    return;
  }
  if (action === 3) _rtsCenterOnSel();                      /* alt: centre on the team */
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
}
function _rtsKeyUp(e) {
  var U = window._rtsUI;
  if (!U) return;
  U.keys[(e.key || '').toLowerCase()] = false;
  _rtsZoomKeyUp(e, U);
  if (e.key === 'a' || e.key === 'A') U.attackMove = false;
}
