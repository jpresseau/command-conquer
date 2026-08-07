/* ui/select.js - selection (band, double-click, hotkeys, cycling), right-click orders and
   placement. Part of rts.ui, which owns the DOM. */

/* DISPLAY.CPP's Is_Players_Army: player-controlled, selectable, and NOT a building. Every
   bulk selection in the originals is filtered through it, which is why a rubber band dragged
   across your base grabs the tanks parked in it and leaves the barracks alone. One predicate,
   used by the band, the double-click, select-all and the object cycle, so they cannot drift. */
function _rtsIsArmy(e) { return !!e && !e.dead && !e.inside && e.side === 'player' && e.type === 'unit'; }

/* On screen right now. DISPLAY.CPP scopes double-click selection to the tactical view - it is
   "all the ones I can see", not "all the ones I own"; select-all is the command for that. */
function _rtsOnScreen(e) {
  var s = _rtsWorldToScreen(e.x, 1, e.z);
  return !s.behind && s.x >= 0 && s.x <= _rtsR.W && s.y >= 0 && s.y <= _rtsR.H;
}

function _rtsClickSelect(mx, my, add) {
  var G = window._rtsG, U = window._rtsUI, hit = _rtsPickAt(mx, my);
  var ent = (hit && hit.ent) ? hit.ent : null;
  /* Double-click a unit to select every one of its type in view. The window is the same
     quarter-second the originals use, and it re-arms on each click so a triple-click is two
     double-clicks rather than one double and one dead click. */
  var now = (new Date()).getTime(), lc = U.lastClick;
  U.lastClick = { ent:ent, t:now };
  if (ent && lc && lc.ent === ent && now - lc.t < 350 && _rtsIsArmy(ent)) {
    _rtsSelectSameType(ent, add); return;
  }
  if (!add) G.sel.length = 0;
  if (ent) {
    if (G.sel.indexOf(ent) < 0) G.sel.push(ent);
    if (ent.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('select');
    /* and the unit itself answers, in its own side's voice - see rtsVox */
    if (ent.side === 'player' && ent.type === 'unit' && typeof rtsVox === 'function') rtsVox(ent, 'select');
  }
}
/* The unit that answers an order must be one of YOURS. G.sel can hold an enemy unit - clicking
   one selects it, which is how you inspect it - and slot 0 is whatever was clicked first. So an
   enemy tank could end up acknowledging your orders, in the other army's voice, if you happened
   to click it before shift-adding your own. */
function _rtsVoxOrder() {
  var G = window._rtsG;
  if (!G || !G.sel) return;
  for (var i = 0; i < G.sel.length; i++) {
    var e = G.sel[i];
    if (e && !e.dead && e.side === 'player' && e.type === 'unit') { rtsVox(e, 'order'); return; }
  }
}

function _rtsSelectSameType(ent, add) {
  var G = window._rtsG, n = 0;
  if (!add) G.sel.length = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!_rtsIsArmy(e) || e.def !== ent.def || !_rtsOnScreen(e)) continue;
    if (G.sel.indexOf(e) < 0) G.sel.push(e);
    n++;
  }
  if (G.sel.indexOf(ent) < 0) { G.sel.push(ent); n++; }
  _rtsSay(n + '× ' + rtsUnitDef(ent.def).name + ' selected.');
  if (typeof _rtsSfx === 'function') _rtsSfx('select');
}
/* Ctrl+A. Mine, not ported - the originals have no select-all - but it runs through the same
   Is_Players_Army filter, so it picks up the army and never the base. */
function _rtsSelectAllArmy() {
  var G = window._rtsG;
  G.sel.length = 0;
  for (var i = 0; i < G.ents.length; i++) if (_rtsIsArmy(G.ents[i])) G.sel.push(G.ents[i]);
  if (!G.sel.length) { if (typeof _rtsSfx === 'function') _rtsSfx('deny'); return; }
  _rtsSay(G.sel.length + ' unit' + (G.sel.length === 1 ? '' : 's') + ' selected.');
  if (typeof _rtsSfx === 'function') _rtsSfx('select');
}
/* DISPLAY.CPP's Next_Object/Prev_Object: walk the ground layer for the next thing that passes
   Is_Players_Army, wrapping back to the first when you run off the end, and starting from the
   front when nothing is currently selected. G.ents is this game's ground layer and its order is
   stable for an entity's lifetime, so pressing N repeatedly walks the army in a fixed order
   instead of jumping about. */
function _rtsNextObject(from, dir) {
  var G = window._rtsG, list = [], i;
  for (i = 0; i < G.ents.length; i++) if (_rtsIsArmy(G.ents[i])) list.push(G.ents[i]);
  if (!list.length) return null;
  var at = from ? list.indexOf(from) : -1;
  if (at < 0) return dir > 0 ? list[0] : list[list.length - 1];
  return list[(at + dir + list.length) % list.length];
}
/* The originals select the object AND centre on it - the point of the key is to go look at
   the unit, not just to tick a box somewhere off screen. */
function _rtsCycleObject(dir) {
  var G = window._rtsG;
  var cur = (G.sel.length === 1 && _rtsIsArmy(G.sel[0])) ? G.sel[0] : null;
  var obj = _rtsNextObject(cur, dir);
  if (!obj) { if (typeof _rtsSfx === 'function') _rtsSfx('deny'); return; }
  G.sel.length = 0; G.sel.push(obj);
  _rtsCenterOnSel();
  _rtsSay(rtsUnitDef(obj.def).name + (obj.order ? ' — ' + obj.order : ' — idle'));
  if (typeof _rtsSfx === 'function') _rtsSfx('select');
}
/* DISPLAY.CPP's Center_Map with no argument: average the selection's coordinates and put the
   tactical view on the result. */
function _rtsCenterOnSel() {
  var G = window._rtsG, sx = 0, sz = 0, n = 0;
  for (var i = 0; i < G.sel.length; i++) {
    var e = G.sel[i];
    if (!e || e.dead) continue;
    sx += e.x; sz += e.z; n++;
  }
  if (!n) return false;
  _rtsR.focus.x = sx / n; _rtsR.focus.z = sz / n;
  _rtsClampFocus();
  return true;
}
function _rtsBoxSelect(dg) {
  var G = window._rtsG;
  if (!dg.add) G.sel.length = 0;
  var x0 = Math.min(dg.x0, dg.x1), x1 = Math.max(dg.x0, dg.x1);
  var y0 = Math.min(dg.y0, dg.y1), y1 = Math.max(dg.y0, dg.y1);
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!_rtsIsArmy(e)) continue;                    /* box only grabs your own units */
    var s = _rtsWorldToScreen(e.x, 1, e.z);
    if (s.behind) continue;
    if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 && G.sel.indexOf(e) < 0) G.sel.push(e);
  }
}
/* Right-click is the single context-sensitive order button, exactly as in the originals:
   enemy -> attack, scrap -> harvest, own refinery -> unload, ground -> move. */
function _rtsRightClick(mx, my) {
  var G = window._rtsG, U = window._rtsUI;
  if (U.place) { U.place = null; _rtsGhostHide(); return; }
  var hit = _rtsPickAt(mx, my);
  if (!hit) return;
  var mine = [], i;
  for (i = 0; i < G.sel.length; i++) if (G.sel[i].side === 'player' && G.sel[i].type === 'unit') mine.push(G.sel[i]);
  if (!mine.length) return;
  var tgt = hit.ent;
  if (tgt && tgt.side === 'enemy') {
    /* An engineer sent at an enemy BUILDING captures it rather than attacking it - it has no
       weapon, so an attack order would be a walk to the target followed by standing there. It
       still cannot capture a unit, so those fall through to the attack path and are ignored. */
    /* Specialists sent at an enemy BUILDING do their own job instead of attacking it. The
       engineer and the thief have no weapon at all, so an attack order would be a walk followed
       by standing there; the Commando has pistols but her C4 is the reason to send her. */
    var capped = 0, special = 0;
    for (i = 0; i < mine.length; i++) {
      var mu = mine[i], md = rtsUnitDef(mu.def), job = null;
      if (tgt.type === 'struct') {
        if (md.capture && rtsCapturable(tgt.def)) job = 'capture';
        else if (md.steal && tgt.def === md.stealFrom) job = 'capture';
        else if (md.demo) job = 'demo';
      }
      /* Infantry sent at one of your own transports get in it. This has to come before the
         attack order or right-clicking your own APC is an order to shoot it. */
      if (tgt.side === mu.side && _rtsCanBoard(mu, tgt) && _rtsOrderBoard(mu, tgt)) {
        special++;
      } else if (job) {
        mu.order = job; mu.target = tgt; mu.path = null; mu.goal = null; mu.susp = null;
        special++; if (job === 'capture') capped++;
      } else _rtsOrderAttack(mu, tgt);
    }
    _rtsFlash(tgt.x, tgt.z, special === mine.length ? 'harvest' : 'attack');
    if (special) _rtsSay(special === 1 ? 'Moving in.' : special + ' specialists moving in.');
    if (typeof _rtsSfx === 'function') _rtsSfx('order');
    if (typeof rtsVox === 'function') _rtsVoxOrder();
    return;
  }
  var tx = _rtsTX(hit.x), tz = _rtsTX(hit.z);
  var onScrap = _rtsInB(tx, tz) && G.scrap[_rtsIdx(tx, tz)] > 0;
  var spread = _rtsFormation(mine.length);
  for (i = 0; i < mine.length; i++) {
    var u = mine[i], ud = rtsUnitDef(u.def);
    if (ud.harvest && onScrap) { _rtsOrderHarvest(u, tx, tz); continue; }
    if (ud.harvest && tgt && tgt.side === 'player' && tgt.def === 'refinery') { u.order = 'harvest'; u.hstate = 'toRef'; u.path = null; continue; }
    _rtsOrderMove(u, hit.x + spread[i].x, hit.z + spread[i].z, !!U.attackMove);
  }
  _rtsFlash(hit.x, hit.z, onScrap ? 'harvest' : 'move');
  if (typeof _rtsSfx === 'function') _rtsSfx('order');
  if (typeof rtsVox === 'function') _rtsVoxOrder();
}
/* Spread a group over a loose grid so twelve units do not all path to one tile. */
function _rtsFormation(n) {
  var out = [], cols = Math.ceil(Math.sqrt(n)), gap = RTS_TILE * 0.95;
  for (var i = 0; i < n; i++) {
    var cx = i % cols, cz = (i / cols) | 0;
    out.push({ x:(cx - (cols - 1) / 2) * gap, z:(cz - (Math.ceil(n / cols) - 1) / 2) * gap });
  }
  return out;
}
function _rtsFlash(x, z, kind) {
  var U = window._rtsUI;
  U.flash = { x:x, z:z, t:0, kind:kind };
}
function _rtsTryPlace(mx, my) {
  var G = window._rtsG, U = window._rtsUI, p = _rtsGroundAt(mx, my);
  if (!p) return;
  var def = rtsStructDef(U.place);
  var tx = _rtsTX(p.x) - ((def.w / 2) | 0), tz = _rtsTX(p.z) - ((def.h / 2) | 0);
  if (!_rtsCanPlace('player', U.place, tx, tz)) { _rtsSay('Cannot build there — needs clear ground near your base.'); return; }
  _rtsPlaceStruct('player', U.place, tx, tz, false, G.sides.player.readyPaid);
  if (typeof _rtsSfx === 'function') _rtsSfx('place');
  G.sides.player.ready = null; G.sides.player.readyPaid = null;
  U.place = null; _rtsGhostHide();
}

