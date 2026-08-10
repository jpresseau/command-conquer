/* ui/superbar.js - the superweapon buttons: one per superweapon the player can charge, each
   with its own charge bar. Part of rts.ui, which owns the DOM.

   Split out of ui/sidebar.js. ARMED LIKE REPAIR AND SELL - the button takes the next click on
   the map - because that is the interaction the sidebar already teaches, and that shared rule
   is the whole coupling to the rest of the sidebar: arming here calls the sidebar's mode off,
   and rtsMode() and a finished-building placement both call _rtsSuperDisarm. All three want the
   next click and exactly one of them may have it. */

/* ----------------------------------------------------- superweapon buttons --
   One button per superweapon the player can charge, appearing when the building does and
   carrying its own charge bar. Armed like REPAIR and SELL - the button takes the next click on
   the map - because that is the interaction the sidebar already teaches.

   Rebuilt only when the SET changes, not every tick: the bar is a style update on a button
   that stays put, and replacing the innerHTML ten times a second would drop a click that
   landed between two frames of it. */
function _rtsSuperRow() {
  var G = window._rtsG, U = window._rtsUI;
  var el = document.getElementById('rtsSupers');
  if (!el || !G) return;
  var have = _rtsSuperSources('player'), keys = [], k;
  for (k in have) keys.push(k);
  keys.sort();

  var sig = keys.join(',');
  if (sig !== U.superSig) {
    U.superSig = sig;
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var sup = have[keys[i]].def.super;
      if (sup.auto) continue;                  /* fires itself; there is no button to press */
      html += '<button type="button" data-super="' + keys[i] + '" ' +
              'onclick="rtsSuperArm(\'' + keys[i] + '\')" title="' + sup.name + '">' +
              '<i class="sfill"></i><span>' + sup.icon + ' ' + sup.name + '</span></button>';
    }
    el.innerHTML = html;
  }

  var bs = el.querySelectorAll('button');
  for (var b = 0; b < bs.length; b++) {
    var key = bs[b].getAttribute('data-super');
    var p = _rtsSuperProgress('player', key), rdy = _rtsSuperReady('player', key);
    var fill = bs[b].querySelector('.sfill');
    if (fill) fill.style.width = Math.round(p * 100) + '%';
    bs[b].className = (U.superArm === key) ? 'armed' : (rdy ? 'ready' : '');
  }
}

/* Arm a superweapon: the next click on the map fires it. Clicking the armed button again
   disarms, the same toggle REPAIR and SELL use. */
function rtsSuperArm(key) {
  var U = window._rtsUI;
  if (!U) return;
  if (!_rtsSuperReady('player', key)) {
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    var d = _rtsSuperDefOf(key);
    var left = d ? Math.ceil(d.super.charge * (1 - _rtsSuperProgress('player', key))) : 0;
    _rtsSay((d ? d.super.name : 'That') + ' is still charging — ' + left + 's.');
    return;
  }
  U.superArm = (U.superArm === key) ? null : key;
  /* arming one cancels a placement and any armed repair/sell - all of them want the next click */
  if (U.superArm) {
    if (U.place) { U.place = null; _rtsGhostHide(); }
    if (U.mode) { U.mode = null;
      var ms = document.querySelectorAll('#rcgRts .rts-ops button');
      for (var i = 0; i < ms.length; i++) ms[i].className = '';
    }
  }
  var cv = document.getElementById('rtsCv');
  if (cv) cv.style.cursor = U.superArm ? 'crosshair' : '';
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
  if (U.superArm) {
    var sd = _rtsSuperDefOf(U.superArm);
    if (sd) _rtsSay(sd.super.hint);
  }
  U.superSig = null;                    /* force the row to restyle now rather than in 100ms */
  _rtsSuperRow();
}
function _rtsSuperDisarm() {
  var U = window._rtsUI;
  if (!U || !U.superArm) return;
  U.superArm = null;
  U.superSig = null;
  /* No cursor reset here on purpose: _rtsDrawHud sets the canvas cursor every frame, so it owns
     it and anything written from outside the loop is gone by the next one. The armed state
     shows in the superweapon row, which _rtsSuperRow restyles below. */
  _rtsSuperRow();
}

/* Returns true when the click was consumed by an armed superweapon. */
function _rtsSuperClick(mx, my) {
  var U = window._rtsUI;
  if (!U || !U.superArm) return false;
  var key = U.superArm;
  var w = _rtsGroundAt(mx, my);
  if (!w) { _rtsSuperDisarm(); return true; }
  var tx = _rtsTX(w.x), tz = _rtsTX(w.z);
  /* The chronosphere carries the selection with it; everything else only wants the spot. */
  var sel = (key === 'chrono' && window._rtsG.sel) ? window._rtsG.sel.slice() : null;
  if (key === 'chrono' && (!sel || !sel.length)) {
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    _rtsSay('Select the units you want to send first, then click the destination.');
    return true;                        /* stays armed - the player has not spent it */
  }
  if (!_rtsSuperFire('player', key, tx, tz, sel)) {
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    _rtsSay(key === 'ironcurtain' ? 'Nothing of yours is there.' : 'Cannot fire there.');
    return true;
  }
  _rtsSuperDisarm();
  var cv = document.getElementById('rtsCv');
  if (cv) cv.style.cursor = '';
  return true;
}
