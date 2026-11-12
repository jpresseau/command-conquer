/* ui/idlesel.js - I: the army standing about. Part of rts.ui, which owns the DOM.

   A battle leaves men behind: the squad that won its fight and stands there, the tank that
   arrived. I selects every idle fighter of yours - no order, no path, nothing in its sights, not
   a harvester, not held on purpose - and looks at the first; pressed again while those are still
   the selection, it looks at the next, round and round. Fresh each press, so a unit that has been
   given an order since is no longer in the list. */
function _rtsIdleArmy() {
  var G = window._rtsG, out = [];
  if (!G) return out;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i], d;
    if (!_rtsIsArmy(e) || e.order || e.path || (e.target && !e.target.dead)) continue;
    d = rtsUnitDef(e.def);
    if (!d || d.harvest) continue;
    out.push(e);
  }
  return out;
}
function rtsSelectIdle() {
  var G = window._rtsG, U = window._rtsUI;
  if (!G || !U) return 0;
  var list = _rtsIdleArmy();
  if (!list.length) { _rtsSay('No idle units.'); if (typeof _rtsSfx === 'function') _rtsSfx('deny'); return 0; }
  var same = G.sel.length === list.length && list.every(function (e) { return G.sel.indexOf(e) >= 0; });
  U.idleAt = same ? ((U.idleAt || 0) + 1) % list.length : 0;
  if (!same) { G.sel.length = 0; for (var i = 0; i < list.length; i++) G.sel.push(list[i]); }
  var at = list[U.idleAt];
  _rtsLookAt(at.x, at.z);
  _rtsSay(list.length === 1 ? 'One idle unit: ' + rtsUnitDef(at.def).name + '.'
    : list.length + ' idle units - ' + rtsUnitDef(at.def).name + ' (' + (U.idleAt + 1) + ' of ' + list.length + '). ' + (typeof _rtsTouchUI === 'function' && _rtsTouchUI() ? 'IDLE' : 'I') + ' again for the next.');
  if (typeof _rtsSfx === 'function') _rtsSfx('select');
  return list.length;
}

/* ARMY (ui/touchcmd.js): THE FIGHTERS IN VIEW, AND THE PHONE'S ONLY WAY TO PICK A MIXED GROUP.
   A tap selects one unit and a double-tap its kind; a drag pans; the box a mouse draws does not
   exist on touch. So tanks, rocket squads and a flak track on the same street could not be
   selected together at all - and a team can only be made from a selection. This selects every
   fighter of yours on screen (not a harvester); pressed again while those are the selection, or
   with none in view, the whole army, as Ctrl+A does. */
function _rtsFighters(seen) {
  var G = window._rtsG, out = [];
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i], d = _rtsIsArmy(e) ? rtsUnitDef(e.def) : null;
    if (d && !d.harvest && (!seen || _rtsOnScreen(e))) out.push(e);
  }
  return out;
}
function rtsSelectArmy() {
  var G = window._rtsG;
  if (!G) return 0;
  var seen = _rtsFighters(true);
  var same = seen.length > 0 && G.sel.length === seen.length && seen.every(function (e) { return G.sel.indexOf(e) >= 0; });
  var list = (!seen.length || same) ? _rtsFighters(false) : seen, whole = list !== seen;
  if (!list.length) { _rtsSay('No army to select.'); if (typeof _rtsSfx === 'function') _rtsSfx('deny'); return 0; }
  G.sel.length = 0;
  for (var i = 0; i < list.length; i++) G.sel.push(list[i]);
  _rtsSay(list.length + (list.length === 1 ? ' unit' : ' units') + (whole ? ' - the whole army.' : ' in view. ARMY again for the whole army.'));
  if (typeof _rtsSfx === 'function') _rtsSfx('select');
  return list.length;
}
