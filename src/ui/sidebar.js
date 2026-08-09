/* ui/sidebar.js - the sidebar: tabs, the build list, and the superweapon buttons.
   Part of rts.ui, which owns the DOM. */

/* ------------------------------------------------------------- sidebar */
/* THE TABS ARE THE ROSTER'S INDEX, and there must be one for every kind of thing that can be
   produced. There were three - Build, Infantry, Vehicles - and the Attack Heli is kind:'air',
   so it appeared on no tab at all and could never be bought. Everything else about it worked:
   the Helipad built, the rearm logic ran, the flight code flew. There was simply no button.

   Derived from one list now, and _rtsTabsCheck asserts nothing in the roster falls outside it,
   because "a unit exists that you cannot reach" is invisible from inside the game. */
/* The battlefield's own long-press, so the gesture means the same thing wherever it is used
   (see the touchstart handler in src/ui/input.js). */
var RTS_TOUCH_HOLD = 350;
var RTS_TABS = [['struct', 'Build'], ['infantry', 'Infantry'],
                ['vehicle', 'Vehicles'], ['air', 'Aircraft'], ['ship', 'Ships']];

function _rtsTabButtons() {
  var out = '', i;
  for (i = 0; i < RTS_TABS.length; i++) {
    out += '<button type="button"' + (i === 0 ? ' class="on"' : '') +
           ' data-cat="' + RTS_TABS[i][0] + '" onclick="rtsTab(\'' + RTS_TABS[i][0] + '\')">' +
           RTS_TABS[i][1] + '</button>';
  }
  return out;
}

/* A tab with nothing on it is a dead end - the Soviets field no aircraft, so an Aircraft tab
   would open onto an empty grid and say nothing about why. Hidden rather than disabled. */
function _rtsSyncTabs() {
  var ts = document.querySelectorAll('#rcgRts .rts-tabs button'), i;
  for (i = 0; i < ts.length; i++) {
    var cat = ts[i].getAttribute('data-cat');
    ts[i].hidden = (cat !== 'struct' && _rtsCatItems(cat).length === 0);
  }
}

function rtsTab(cat) {
  var U = window._rtsUI;
  if (!U) return;
  U.cat = cat;
  var ts = document.querySelectorAll('#rcgRts .rts-tabs button');
  for (var i = 0; i < ts.length; i++) ts[i].className = (ts[i].getAttribute('data-cat') === cat) ? 'on' : '';
  _rtsBuildList();
}
/* The repair and sell cursors. Both are modes, exactly as in the original sidebar: arm the
   button, then click a building. Arming one disarms the other and cancels a pending
   placement, since all three want the next click. */
function rtsMode(m) {
  var U = window._rtsUI;
  if (!U) return;
  U.mode = (U.mode === m) ? null : m;
  if (U.mode && U.place) { U.place = null; _rtsGhostHide(); }
  if (U.mode) _rtsSuperDisarm();          /* all of these want the next click */
  var bs = document.querySelectorAll('#rcgRts .rts-ops button');
  for (var i = 0; i < bs.length; i++) bs[i].className = (bs[i].getAttribute('data-mode') === U.mode) ? 'on' : '';
  var cv = document.getElementById('rtsCv');
  if (cv) cv.style.cursor = U.mode ? 'crosshair' : '';
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
  if (U.mode === 'repair') _rtsSay('Repair: click a damaged building. Click it again to stop.');
  else if (U.mode === 'sell') _rtsSay('Sell: click a building to sell it back.');
}

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

/* Returns true when the click was consumed by the armed mode. */
function _rtsModeClick(mx, my) {
  var U = window._rtsUI;
  if (!U.mode) return false;
  var hit = _rtsPickAt(mx, my);
  var e = hit && hit.ent;
  if (!e || e.type !== 'struct' || e.side !== 'player') {
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    if (typeof rtsEva === 'function') rtsEva('cantbuild');
    _rtsSay('Pick one of your own buildings.');
    return true;
  }
  if (U.mode === 'sell') {
    /* the figure _rtsSell actually granted, not the sticker price - see _rtsSell for what the
       sticker price was hiding and by how much */
    var back = _rtsSell(e);
    if (back !== false) _rtsSay('Sold — ' + back + ' credits back.');
    else { if (typeof _rtsSfx === 'function') _rtsSfx('deny');
      _rtsSay(e.def === 'yard' ? 'The Command Yard cannot be sold.' : 'Cannot sell that.'); }
  } else {
    if (_rtsToggleRepair(e)) {
      if (typeof _rtsSfx === 'function') _rtsSfx('click');
      _rtsSay(e.repair ? 'Repairing ' + rtsStructDef(e.def).name + '.' : 'Repairs stopped.');
    } else { if (typeof _rtsSfx === 'function') _rtsSfx('deny'); _rtsSay('That building is undamaged.'); }
  }
  return true;
}
/* A TOUCHSCREEN WITH NO MOUSE, which is not the same question as "is this small". The same
   pair the stylesheet uses for the hint line: a laptop with a touchscreen reports a fine
   pointer and keeps the desktop wording, which is right, because it also has a mouse. */
function _rtsTouchUI() {
  try { return window.matchMedia('(hover: none) and (pointer: coarse)').matches; }
  catch (e) { return false; }
}
/* How to hold and cancel a job, in words the device the player is holding can obey. The
   sidebar used to say "Right-click while building: hold, then right-click again to cancel"
   on every device, and a phone has no second button - so the one instruction on screen named
   an input that does not exist there. */
function _rtsCancelHint() {
  return _rtsTouchUI()
    ? 'Press and hold to pause it, hold again to cancel and refund.'
    : 'Right-click while building: hold, then right-click again to cancel.';
}
function _rtsCatItems(cat) {
  var out = [], i, side = rtsHouseSide('player');
  if (cat === 'struct') {
    for (i = 0; i < RTS_STRUCTS.length; i++) {
      if (RTS_STRUCTS[i].key === 'yard') continue;
      if (!rtsBuildableBy(RTS_STRUCTS[i], side)) continue;   /* the other army's, not yours */
      out.push(RTS_STRUCTS[i]);
    }
  } else {
    for (i = 0; i < RTS_UNITS.length; i++) {
      if (RTS_UNITS[i].kind !== cat) continue;
      if (!rtsBuildableBy(RTS_UNITS[i], side)) continue;
      out.push(RTS_UNITS[i]);
    }
  }
  return out;
}
/* Built once per tab switch; the per-frame pass only touches classes, text and the wipe
   angle so a tile never loses a click to an innerHTML rebuild. */
function _rtsBuildList() {
  var U = window._rtsUI, list = document.getElementById('rtsList');
  if (!list) return;
  list.innerHTML = ''; U.btns = {};
  var items = _rtsCatItems(U.cat);
  for (var i = 0; i < items.length; i++) {
    (function (def) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'rts-tile';
      var ico = U.icons && U.icons[def.key];
      b.innerHTML = (ico ? '<img class="ico" alt="" src="' + ico + '">' : '<span class="ico noimg"></span>')
        + '<i class="wipe"></i>'
        + '<span class="pct"></span>'
        + '<span class="nm">' + def.name + '</span>'
        + '<span class="ct">' + def.cost + '</span>';
      /* Kept on the element so the per-frame pass can append "why it is locked" to it without
         having to rebuild the sentence, and without the reason accumulating on every frame. */
      b.dataset.base = def.name + ' — ' + def.cost + ' credits\n' + def.desc
        + '\n' + _rtsCancelHint();
      b.title = b.dataset.base;
      b.onclick = function () { _rtsItemClick(def.key); };
      /* SelectClass::Action reads RIGHTPRESS as "cancel": hold first, abandon second. */
      b.oncontextmenu = function (ev) { ev.preventDefault(); _rtsItemCancel(def.key); return false; };
      /* THE SAME THING FOR A FINGER. Hold/abandon existed only as a context menu, and no touch
         handler in the app was bound to the sidebar at all - every one of them is on the
         battlefield canvas or the radar. So on a phone a job could be started and never
         paused, never cancelled and never refunded, while _rtsQueue charged for it
         progressively: one mis-tap on a 2,000-credit cameo drained the treasury with no way
         to stop it. Every other armed cursor - repair, sell, placement, superweapon - already
         had a touch path; this was the one that did not.

         350ms is the battlefield's own long-press (see src/ui/input.js), so the gesture means
         the same thing wherever the player uses it. */
      var _hold = 0, _fired = false;
      function _holdOff() { if (_hold) { clearTimeout(_hold); _hold = 0; } }
      b.addEventListener('touchstart', function () {
        _fired = false;
        _holdOff();
        _hold = setTimeout(function () {
          _hold = 0; _fired = true;
          _rtsItemCancel(def.key);
          if (typeof _rtsSfx === 'function') _rtsSfx('click');
        }, RTS_TOUCH_HOLD);
      }, { passive: true });
      /* A finger that slides is scrolling the build list, not holding a cameo. */
      b.addEventListener('touchmove', _holdOff, { passive: true });
      b.addEventListener('touchcancel', function () { _holdOff(); _fired = false; }, { passive: true });
      b.addEventListener('touchend', function (ev) {
        _holdOff();
        /* Swallow the synthesized click, or the hold pauses the job and the click that follows
           it immediately resumes the job - which looks exactly like nothing happening. */
        if (_fired) { ev.preventDefault(); _fired = false; }
      }, { passive: false });
      list.appendChild(b);
      U.btns[def.key] = b;
    })(items[i]);
  }
}
function _rtsItemClick(key) {
  var G = window._rtsG, U = window._rtsUI, S = G.sides.player;
  var cat = _rtsQueueCat(key);
  if (U.mode) rtsMode(null);            /* building something disarms the repair/sell cursor */
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
  if (cat === 'struct' && S.ready === key) {
    /* AND IT DISARMS THE SUPERWEAPON, which is the other cursor that wants the next click.
       Arming a superweapon already cancelled a placement; the reverse was missing, and the
       click handler tests superArm FIRST - so a player who armed the nuke, changed their mind
       and went to place a finished building dropped the nuke on the spot they picked for it.
       Inside their own base, because that is where you place buildings. */
    if (U.superArm) _rtsSuperDisarm();
    U.place = key; _rtsGhostShow(key); return;
  }
  /* Left click on the item already on the line: resume it if it is suspended, otherwise
     leave it alone. It used to abandon outright, which meant one stray click threw away a
     nearly-finished war factory and the credits with it. Cancelling is a right-click now,
     and it takes two. */
  if (S.q[cat] && S.q[cat].key === key) {
    if (_rtsResume('player', cat)) {
      _rtsSay(cat === 'infantry' ? 'Training.' : 'Building.');
      if (typeof _rtsSfx === 'function') _rtsSfx('build');
    } else {
      _rtsSay('Already building. ' + (_rtsTouchUI() ? 'Hold to pause or cancel.'
                                                      : 'Right-click to hold or cancel.'));
    }
    return;
  }
  if (_rtsQueue('player', key)) {
    /* VOX_TRAINING for infantry, VOX_BUILDING for everything else. */
    _rtsSay(cat === 'infantry' ? 'Training.' : 'Building.');
    if (typeof _rtsSfx === 'function') _rtsSfx('build');
  }
  else {
    var def = rtsStructDef(key) || rtsUnitDef(key);
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    /* EVA distinguishes "you cannot build that" from "you cannot AFFORD that", and being told
       the wrong one is worse than being told nothing - the first sends you looking for a
       prerequisite you already have. */
    var why = _rtsWhyLocked('player', key);
    var _broke = !why && rtsMoney(S) < def.cost;
    if (typeof rtsEva === 'function') rtsEva(_broke ? 'nofunds' : 'cantbuild');
    /* EVERY refusal says something. This used to be a ladder of its own guesses at why, and it
       ran out: a Commando at her one-at-a-time cap passed every branch of it and the click
       produced a beep and an empty message line. `_rtsWhyLocked` is the same answer the tile
       is greyed from, so what you are told and what you are shown cannot disagree. */
    if (why) _rtsSay(why);
    else if (rtsMoney(S) < def.cost) _rtsSay('Not enough credits.');
    else if (S.q[cat]) _rtsSay('That production line is busy.');
    else if (S.ready) _rtsSay('Place the finished building first.');
    else _rtsSay('Cannot build that right now.');
  }
}
/* RIGHTPRESS on a cameo. First press suspends, second abandons and refunds. */
function _rtsItemCancel(key) {
  var G = window._rtsG, U = window._rtsUI, S = G.sides.player;
  var cat = _rtsQueueCat(key), q = S.q[cat];
  if (!q || q.key !== key) {
    /* Right-clicking a finished building that is waiting to be placed cancels the placement
       cursor rather than the building itself. */
    if (cat === 'struct' && S.ready === key && U.place === key) {
      U.place = null; _rtsGhostHide();
      if (typeof _rtsSfx === 'function') _rtsSfx('click');
    }
    return;
  }
  if (_rtsSuspend('player', cat)) {
    _rtsSay('On hold.');
    if (typeof _rtsSfx === 'function') _rtsSfx('click');
  } else {
    _rtsCancel('player', cat);
    if (U.place === key) { U.place = null; _rtsGhostHide(); }
    _rtsSay('Canceled.');
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    if (typeof rtsEva === 'function') rtsEva('cancel');
  }
}
/* StripClass::Add speaks VOX_NEW_CONSTRUCT when something joins the buildable list. It is
   the cue that finishing a barracks just opened up infantry - easy to miss otherwise, since
   the new options are on a tab you are not looking at. Watches every category, not just the
   visible one, and stays quiet on the first pass so a new game does not announce itself. */
function _rtsWatchNewOptions() {
  var U = window._rtsUI, now = {}, fresh = 0, i, j;
  for (i = 0; i < RTS_TABS.length; i++) {
    var items = _rtsCatItems(RTS_TABS[i][0]);
    for (j = 0; j < items.length; j++) {
      if (!_rtsCanProduce('player', items[j].key)) continue;
      now[items[j].key] = 1;
      if (U.avail && !U.avail[items[j].key]) fresh++;
    }
  }
  if (fresh) {
    _rtsSay('New construction options.');
    if (typeof _rtsSfx === 'function') _rtsSfx('ready');
    if (typeof rtsEva === 'function') rtsEva('newopt');
  }
  U.avail = now;
}
function _rtsSyncSidebar(dt) {
  var G = window._rtsG, U = window._rtsUI, S = G.sides.player;
  _rtsWatchNewOptions();

  /* Credits roll toward the true value instead of snapping - the classic counter tick. */
  var target = Math.floor(rtsMoney(S));
  var step = Math.max(1, Math.ceil(Math.abs(target - U.credShown) * 0.28));
  if (U.credShown < target) U.credShown = Math.min(target, U.credShown + step);
  else if (U.credShown > target) U.credShown = Math.max(target, U.credShown - step);
  document.getElementById('rtsCred').textContent = U.credShown;

  /* Storage bar. Full means every credit a harvester brings home from here is being lost, so
     it turns red at the point where that starts rather than when the bar merely looks busy. */
  var scap = rtsCapacity('player'), sfrac = scap > 0 ? Math.min(1, S.ore / scap) : 0;
  var sf = document.getElementById('rtsStoreFill');
  sf.style.width = (sfrac * 100) + '%';
  sf.className = sfrac >= 0.999 ? 'full' : (sfrac > 0.85 ? 'warn' : '');
  document.getElementById('rtsStore').title = scap > 0
    ? 'Storage  ' + Math.floor(S.ore) + ' / ' + scap + (sfrac >= 0.999 ? '  — FULL, scrap is being lost' : '')
    : 'Storage  no capacity — build a Refinery';

  /* Vertical power strip: the track is capacity, the fill is draw. */
  var pf = _rtsPowerFactor('player');
  var fill = document.getElementById('rtsPwrFill'), mark = document.getElementById('rtsPwrMark');
  var cap = Math.max(S.powerMade, S.powerUsed, 1);
  fill.style.height = (S.powerUsed / cap * 100) + '%';
  fill.className = pf < 0.999 ? 'low' : '';
  mark.style.bottom = (S.powerMade / cap * 100) + '%';
  mark.style.display = S.powerMade > 0 ? 'block' : 'none';
  document.querySelector('#rcgRts .rts-pwr').title =
    'Power  ' + S.powerUsed + ' drawn / ' + S.powerMade + ' supplied' + (pf < 0.999 ? '  — LOW POWER' : '');

  for (var key in U.btns) {
    var b = U.btns[key], def = rtsStructDef(key) || rtsUnitDef(key);
    var cat = _rtsQueueCat(key), q = S.q[cat];
    var pct = b.querySelector('.pct'), wipe = b.querySelector('.wipe');
    /* One answer, drawn and spoken. The tooltip carries it too: a greyed cameo used to be
       silent until you clicked it, so the only way to find out what a locked Refinery wanted
       was to click a button that visibly does nothing. */
    var why = _rtsWhyLocked('player', key), avail = !why;
    var want = b.dataset.why || '';
    if (want !== (why || '')) {
      b.dataset.why = why || '';
      b.title = b.dataset.base + (why ? '\n\n' + why : '');
    }
    var cls = 'rts-tile';
    if (!avail) cls += ' locked';
    else if (rtsMoney(S) < def.cost && !(q && q.key === key)) cls += ' poor';
    if (cat === 'struct' && S.ready === key) {
      cls += ' ready'; pct.textContent = 'READY'; wipe.style.background = 'none';
    } else if (q && q.key === key) {
      cls += ' busy';
      /* PIP_HOLDING: a suspended job shows that it is held, not how far along it is. */
      if (q.hold) { cls += ' hold'; pct.textContent = 'HOLD'; }
      else pct.textContent = Math.floor(q.prog * 100) + '%';
      /* clock wipe: the built portion is revealed clockwise from the top */
      var deg = Math.max(0, Math.min(360, q.prog * 360));
      wipe.style.background = 'conic-gradient(from 0deg, rgba(0,0,0,0) 0deg, rgba(0,0,0,0) '
        + deg + 'deg, rgba(4,7,11,0.74) ' + deg + 'deg, rgba(4,7,11,0.74) 360deg)';
    } else {
      pct.textContent = '';
      /* "If there is already a factory producing this kind of object, then all objects of
         this type are displayed in a disabled state" - the whole column greys out, so it is
         obvious at a glance that the line is taken rather than that you cannot afford it. */
      if (avail && (q || (cat === 'struct' && S.ready))) cls += ' busyline';
      wipe.style.background = avail ? 'none' : 'rgba(4,7,11,0.55)';
    }
    if (U.place === key) cls += ' placing';
    if (b.className !== cls) b.className = cls;
  }

  var sel = G.sel, txt;
  if (!sel.length) txt = 'Nothing selected';
  else if (sel.length === 1) {
    var e = sel[0], ed = rtsStructDef(e.def) || rtsUnitDef(e.def);
    txt = ed.name + ' — ' + Math.ceil(e.hp) + '/' + e.maxHp + ' hp';
    if (e.type === 'unit' && rtsUnitDef(e.def).harvest)
      txt += ' · ' + Math.floor(e.carry) + ' load (' + Math.floor(e.carryVal || 0) + ' credits)';
  } else {
    var counts = {}, i;
    for (i = 0; i < sel.length; i++) { var n = (rtsUnitDef(sel[i].def) || rtsStructDef(sel[i].def)).name; counts[n] = (counts[n] || 0) + 1; }
    var parts = [];
    for (var n2 in counts) parts.push(counts[n2] + '× ' + n2);
    txt = parts.join(', ');
  }
  document.getElementById('rtsSel').textContent = txt;

  var msg = document.getElementById('rtsMsg');
  msg.textContent = G.msgT > 0 ? (G.msg || '') : '';
  msg.className = 'rts-msg' + (G.msgT > 0 ? ' on' : '');

  if (G.over && !U.overShown) {
    U.overShown = true;
    var o = document.getElementById('rtsOver');
    o.className = 'rts-over on';
    o.innerHTML = '<div class="card ' + G.over + '"><h2>' + (G.over === 'win' ? 'VICTORY' : 'DEFEATED') + '</h2>'
      + '<p>' + (G.over === 'win' ? 'The ' + rtsArmyName('enemy') + ' forces have been wiped off the map.'
                          : rtsArmyName('player') + ' command has fallen.') + '</p>'
      + '<p class="s">Enemy units destroyed: ' + G.stats.killed + ' · Units lost: ' + G.stats.lostU + '</p>'
      + '<button type="button" onclick="rtsRestart()">Play again</button> '
      + '<button type="button" onclick="rtsClose()">Quit</button></div>';
  }
}
function rtsRestart() { rtsClose(); setTimeout(function () { rtsOpen(); }, 60); }

