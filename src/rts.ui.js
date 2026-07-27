/* RC COMMAND - UI + input + the main loop.

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
    +   '<canvas id="rtsCv"></canvas>'
    +   '<canvas id="rtsHud"></canvas>'
    +   '<div class="rts-top"><span class="rts-title">RC COMMAND</span>'
    +     '<span class="rts-vs"><b class="p">Vanguard</b> vs <b class="e">Redline</b>'
    +       '<i class="dif" id="rtsDifLbl"></i></span>'
    +     '<span class="rts-help">drag select · right-click order · S hold · 1-9 teams (ctrl set, alt jump) · repair/sell · wheel zoom · Esc</span>'
    +     '<button type="button" class="rts-mute" id="rtsSaveBtn" title="Save this battle (Ctrl+S)" onclick="rtsSaveGame()">💾</button>'
    +     '<button type="button" class="rts-mute" id="rtsLoadBtn" title="Resume the saved battle" onclick="rtsLoadGame()">📂</button>'
    +     '<button type="button" class="rts-mute" id="rtsMute" title="Sound on" onclick="rtsMuteToggle()">🔊</button>'
    +     '<button type="button" class="rts-x" onclick="rtsClose()">✕</button></div>'
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
    +   '<div class="rts-mid">'
    +     '<div class="rts-pwr" title="Power"><span class="ptxt">P<br>W<br>R</span>'
    +       '<div class="ptrack"><i id="rtsPwrFill"></i><b id="rtsPwrMark"></b></div></div>'
    +     '<div class="rts-grid" id="rtsList"></div>'
    +   '</div>'
    +   '<div class="rts-sel" id="rtsSel">Nothing selected</div>'
    + '</div>';
  document.body.appendChild(d);

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
  /* rtsOpen runs off a real click, so this is a valid gesture to unlock WebAudio */
  if (typeof _rtsAudioInit === 'function') { _rtsAudioInit(); _rtsAudioResume(); _rtsMusicStart(); }
  if (_load) _rtsSay('Battle resumed.');
  else _rtsSay('Vanguard command online. Build a Refinery to start earning.');
  _rtsUI.last = (new Date()).getTime();
  _rtsLoop();
}

function rtsClose() {
  var d = document.getElementById('rcgRts');
  if (!d) return;
  var U = window._rtsUI;
  if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (_a) {} }
  document.removeEventListener('keydown', _rtsKeyDown, true);
  document.removeEventListener('keyup', _rtsKeyUp, true);
  window.removeEventListener('resize', _rtsOnResize);
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
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  hud.style.width = W + 'px'; hud.style.height = H + 'px';
  hud.width = Math.round(W * dpr); hud.height = Math.round(H * dpr);
  hud.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W:W, H:H };
}
function _rtsOnResize() {
  var s = _rtsResizeCanvases();
  if (s) _rtsRResize(s.W, s.H);
}

/* ------------------------------------------------------------- sidebar */
/* THE TABS ARE THE ROSTER'S INDEX, and there must be one for every kind of thing that can be
   produced. There were three - Build, Infantry, Vehicles - and the Attack Heli is kind:'air',
   so it appeared on no tab at all and could never be bought. Everything else about it worked:
   the Helipad built, the rearm logic ran, the flight code flew. There was simply no button.

   Derived from one list now, and _rtsTabsCheck asserts nothing in the roster falls outside it,
   because "a unit exists that you cannot reach" is invisible from inside the game. */
var RTS_TABS = [['struct', 'Build'], ['infantry', 'Infantry'],
                ['vehicle', 'Vehicles'], ['air', 'Aircraft']];

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
  var bs = document.querySelectorAll('#rcgRts .rts-ops button');
  for (var i = 0; i < bs.length; i++) bs[i].className = (bs[i].getAttribute('data-mode') === U.mode) ? 'on' : '';
  var cv = document.getElementById('rtsCv');
  if (cv) cv.style.cursor = U.mode ? 'crosshair' : '';
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
  if (U.mode === 'repair') _rtsSay('Repair: click a damaged building. Click it again to stop.');
  else if (U.mode === 'sell') _rtsSay('Sell: click a building to sell it back.');
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
    if (_rtsSell(e)) _rtsSay('Sold — ' + Math.round(rtsStructDef(e.def).cost * RTS_REFUND_PCT) + ' credits back.');
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
      b.title = def.name + ' — ' + def.cost + ' credits\n' + def.desc
        + '\nRight-click while building: hold, then right-click again to cancel.';
      b.onclick = function () { _rtsItemClick(def.key); };
      /* SelectClass::Action reads RIGHTPRESS as "cancel": hold first, abandon second. */
      b.oncontextmenu = function (ev) { ev.preventDefault(); _rtsItemCancel(def.key); return false; };
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
  if (cat === 'struct' && S.ready === key) { U.place = key; _rtsGhostShow(key); return; }
  /* Left click on the item already on the line: resume it if it is suspended, otherwise
     leave it alone. It used to abandon outright, which meant one stray click threw away a
     nearly-finished war factory and the credits with it. Cancelling is a right-click now,
     and it takes two. */
  if (S.q[cat] && S.q[cat].key === key) {
    if (_rtsResume('player', cat)) {
      _rtsSay(cat === 'infantry' ? 'Training.' : 'Building.');
      if (typeof _rtsSfx === 'function') _rtsSfx('build');
    } else {
      _rtsSay('Already building. Right-click to hold or cancel.');
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
    var _broke = rtsMoney(S) < def.cost && _rtsAvailable('player', def);
    if (typeof rtsEva === 'function') rtsEva(_broke ? 'nofunds' : 'cantbuild');
    if (!_rtsAvailable('player', def)) _rtsSay('Needs ' + def.needs.map(function (n) { return rtsStructDef(n).name; }).join(' + ') + ' first.');
    else if (cat === 'infantry' && !_rtsHas('player', 'barracks')) _rtsSay('Build a Barracks first.');
    else if (cat === 'vehicle' && !_rtsHas('player', 'factory')) _rtsSay('Build a War Factory first.');
    else if (rtsMoney(S) < def.cost) _rtsSay('Not enough credits.');
    else if (S.q[cat]) _rtsSay('That production line is busy.');
    else if (S.ready) _rtsSay('Place the finished building first.');
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
    var avail = _rtsAvailable('player', def)
      && (cat !== 'infantry' || !!_rtsHas('player', 'barracks'))
      && (cat !== 'vehicle' || !!_rtsHas('player', 'factory'));
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
      + '<p>' + (G.over === 'win' ? 'Redline has been wiped off the map.' : 'Vanguard command has fallen.') + '</p>'
      + '<p class="s">Enemy units destroyed: ' + G.stats.killed + ' · Units lost: ' + G.stats.lostU + '</p>'
      + '<button type="button" onclick="rtsRestart()">Play again</button> '
      + '<button type="button" onclick="rtsClose()">Quit</button></div>';
  }
}
function rtsRestart() { rtsClose(); setTimeout(function () { rtsOpen(); }, 60); }

/* --------------------------------------------------------------- input */
function _rtsBindInput() {
  var cv = document.getElementById('rtsCv'), U = window._rtsUI;
  cv.oncontextmenu = function (e) { e.preventDefault(); return false; };
  cv.onmousedown = function (e) {
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (e.button === 2) {
      if (U.mode) { rtsMode(U.mode); return; }        /* right-click drops the repair/sell cursor */
      _rtsRightClick(mx, my); return;
    }
    if (U.mode) { _rtsModeClick(mx, my); return; }
    if (U.place) { _rtsTryPlace(mx, my); return; }
    U.drag = { x0:mx, y0:my, x1:mx, y1:my, add:e.shiftKey || e.ctrlKey, moved:false };
  };
  cv.onmousemove = function (e) {
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    U.mouse.x = mx; U.mouse.y = my; U.mouse.over = true;
    if (U.drag) { U.drag.x1 = mx; U.drag.y1 = my;
      if (Math.abs(mx - U.drag.x0) > 4 || Math.abs(my - U.drag.y0) > 4) U.drag.moved = true; }
    if (U.place) {
      var p = _rtsGroundAt(mx, my);
      if (p) { var def = rtsStructDef(U.place);
        var tx = _rtsTX(p.x) - ((def.w / 2) | 0), tz = _rtsTX(p.z) - ((def.h / 2) | 0);
        _rtsGhostMove(tx, tz, _rtsCanPlace('player', U.place, tx, tz)); }
    }
  };
  cv.onmouseleave = function () { U.mouse.over = false; };
  cv.onmouseup = function (e) {
    if (e.button === 2 || !U.drag) { U.drag = null; return; }
    var dg = U.drag; U.drag = null;
    if (dg.moved) _rtsBoxSelect(dg);
    else _rtsClickSelect(dg.x0, dg.y0, dg.add);
  };
  cv.onwheel = function (e) {
    e.preventDefault();
    /* Zoom steps between fixed levels. See _rtsApplyCam: anything off RTS_ZOOMS resamples
       24px-per-cell art by a fraction and softens every sprite on screen. */
    _rtsZoomStep(e.deltaY > 0 ? -1 : 1);
    _rtsClampFocus();
  };
  var mini = document.getElementById('rtsMini');
  function miniWorld(e) {
    var r = mini.getBoundingClientRect();
    var fx = (e.clientX - r.left) / r.width, fz = (e.clientY - r.top) / r.height;
    var span = RTS_N * RTS_TILE;
    return { x:(fx - 0.5) * span, z:(fz - 0.5) * span };
  }
  function miniGo(e) {
    if (!_rtsRadarLit()) return;          /* a dark panel commands nothing and jumps nowhere */
    var w = miniWorld(e);
    _rtsR.focus.x = w.x; _rtsR.focus.z = w.z;
    _rtsClampFocus();
  }
  /* RADAR.CPP's RTacticalClass::Action: a click on the radar with units selected ISSUES AN
     ORDER, it does not move the view. That is how you commit an army across the map without
     scrolling to it. Only a restricted set of actions is allowed from the radar - MOVE,
     NOMOVE, ATTACK, ENTER, CAPTURE, SABOTAGE - and anything else falls through to nothing.

     Two deliberate differences. RA puts the order on the LEFT button because its right button
     toggles radar zoom; this game has no radar zoom and already uses right-click as the one
     context-sensitive order button everywhere else, so the order stays on the right and the
     left button keeps moving the view. Consistency with the rest of this game's input beats
     matching a binding whose other half does not exist here.

     The shroud rule is kept exactly: `shadow = !IsMapped` means an unexplored cell cannot be
     targeted, only moved to. */
  function miniOrder(e) {
    var G = window._rtsG;
    if (!G || G.over) return false;
    if (!_rtsRadarLit()) { _rtsSay('No radar — build a Radar Dome to command from the map.'); return false; }
    var mine = [], i;
    for (i = 0; i < G.sel.length; i++) {
      var sv = G.sel[i];
      if (sv && !sv.dead && !sv.inside && sv.side === 'player' && sv.type === 'unit') mine.push(sv);
    }
    if (!mine.length) return false;
    var w = miniWorld(e), tx = _rtsTX(w.x), tz = _rtsTX(w.z);
    if (!_rtsInB(tx, tz)) return false;
    var mapped = !!G.mapped[_rtsIdx(tx, tz)];
    /* Pick out anything standing there, but only if the cell has been explored. */
    var tgt = null;
    if (mapped) {
      for (i = 0; i < G.ents.length; i++) {
        var o = G.ents[i];
        if (o.dead || o.inside || o.side === 'player') continue;
        if (o.type === 'struct') {
          var sd = rtsStructDef(o.def);
          if (tx >= o.tx && tx < o.tx + sd.w && tz >= o.tz && tz < o.tz + sd.h) { tgt = o; break; }
        } else if (_rtsTX(o.x) === tx && _rtsTX(o.z) === tz) { tgt = o; break; }
      }
    }
    if (tgt) {
      for (i = 0; i < mine.length; i++) _rtsOrderAttack(mine[i], tgt);
      _rtsFlash(tgt.x, tgt.z, 'attack');
    } else {
      var onScrap = mapped && G.scrap[_rtsIdx(tx, tz)] > 0;
      var spread = _rtsFormation(mine.length);
      for (i = 0; i < mine.length; i++) {
        var u = mine[i], ud = rtsUnitDef(u.def);
        if (ud.harvest && onScrap) { _rtsOrderHarvest(u, tx, tz); continue; }
        _rtsOrderMove(u, w.x + spread[i].x, w.z + spread[i].z, !!U.attackMove);
      }
      _rtsFlash(w.x, w.z, onScrap ? 'harvest' : 'move');
    }
    if (typeof _rtsSfx === 'function') _rtsSfx('order');
    if (typeof rtsVox === 'function') _rtsVoxOrder();
    return true;
  }
  /* LEFT button only. mousedown fires for every button, so without this guard the
     right-click order ALSO recentred the view - the army got its order and the camera
     jumped away from whatever the player was watching. */
  mini.onmousedown = function (e) { if (e.button !== 0) return; U.miniDrag = true; miniGo(e); };
  mini.onmousemove = function (e) { if (U.miniDrag) miniGo(e); };
  mini.oncontextmenu = function (e) { e.preventDefault(); miniOrder(e); return false; };
  window.addEventListener('mouseup', function () { if (window._rtsUI) window._rtsUI.miniDrag = false; });
}
function _rtsKeyDown(e) {
  if (!document.getElementById('rcgRts')) return;
  var U = window._rtsUI, G = window._rtsG;
  if (!U) return;
  var k = e.key;
  if (k === 'Escape') {
    if (U.mode) rtsMode(U.mode);
    else if (U.place) { U.place = null; _rtsGhostHide(); }
    else rtsClose();
    e.preventDefault(); return;
  }
  U.keys[k.toLowerCase()] = true;
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
  /* U unloads every selected transport that is carrying anything. */
  if (k === 'u' || k === 'U') {
    var Gu = window._rtsG, out = 0;
    if (Gu && Gu.sel) Gu.sel.forEach(function (t) {
      if (t.side === 'player' && t.type === 'unit') out += _rtsUnload(t);
    });
    if (out) e.preventDefault();
  }
  /* D deploys every selected vehicle that can - an MCV into a Command Yard. */
  if (k === 'd' || k === 'D') {
    var G = window._rtsG, did = 0;
    if (G && G.sel) G.sel.slice().forEach(function (u) {
      if (u.side === 'player' && u.type === 'unit' && (rtsUnitDef(u.def) || {}).deploy
          && _rtsDeploy(u)) did++;
    });
    if (did) e.preventDefault();
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
  if (k === 's' || k === 'S') {
    var held = 0;
    for (var hi = 0; hi < G.sel.length; hi++) {
      var hu = G.sel[hi];
      if (!hu || hu.dead || hu.side !== 'player' || hu.type !== 'unit') continue;
      if (rtsUnitDef(hu.def).harvest) continue;      /* a harvester on hold is just idle */
      hu.order = 'hold'; hu.path = null; hu.goal = null; hu.susp = null; held++;
    }
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
  if (!n) return;
  if (action === 3) _rtsCenterOnSel();                      /* alt: centre on the team */
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
}
function _rtsKeyUp(e) {
  var U = window._rtsUI;
  if (!U) return;
  U.keys[(e.key || '').toLowerCase()] = false;
  if (e.key === 'a' || e.key === 'A') U.attackMove = false;
}
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

/* ------------------------------------------------------------ HUD draw */
function _rtsDrawHud(dt) {
  var G = window._rtsG, U = window._rtsUI;
  var hud = document.getElementById('rtsHud'), g = hud.getContext('2d');
  var W = _rtsR.W, H = _rtsR.H;
  g.clearRect(0, 0, W, H);
  var i;
  /* health bars: always for selected, and for anything damaged */
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.inside) continue;      /* no health bar for a passenger */
    var selected = G.sel.indexOf(e) >= 0;
    var hurt = e.hp < e.maxHp - 0.5;
    if (!selected && !hurt) continue;
    var top = (e.type === 'struct') ? rtsStructDef(e.def).h * 0.9 + 5 : 3.4;
    var s = _rtsWorldToScreen(e.x, top, e.z);
    if (s.behind || s.x < -60 || s.x > W + 60 || s.y < -40 || s.y > H + 40) continue;
    var bw = e.type === 'struct' ? 46 : 26, bh = 4;
    var frac = Math.max(0, e.hp / e.maxHp);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(s.x - bw / 2 - 1, s.y - bh - 1, bw + 2, bh + 2);
    g.fillStyle = frac > 0.6 ? '#5fdc7a' : (frac > 0.3 ? '#e8c35a' : '#e3574a');
    g.fillRect(s.x - bw / 2, s.y - bh, bw * frac, bh);
    /* BUILDING.CPP toggles IsWrenchVisible on the repair timer - the wrench blinks on a
       building under repair so you can see at a glance where your credits are going. */
    if (e.repair && (typeof _rtsPulse !== 'function' || _rtsPulse() > 0.45)) _rtsDrawWrench(g, s.x, s.y - bh - 9);
    if (selected) {
      /* corner brackets, the classic selection look */
      var r = (e.type === 'struct' ? rtsStructDef(e.def).w * _rtsR.cell * 0.5 : _rtsR.cell * 0.42);
      r = Math.max(10, Math.min(70, r));
      var cy = s.y + r * 0.55, L = Math.max(5, r * 0.42);
      g.strokeStyle = e.side === 'player' ? '#8ef07a' : '#ff8a7a';
      g.lineWidth = 2;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        var cx = s.x + c[0] * r, cz2 = cy + c[1] * r * 0.62;
        g.beginPath();
        g.moveTo(cx - c[0] * L, cz2); g.lineTo(cx, cz2); g.lineTo(cx, cz2 - c[1] * L);
        g.stroke();
      });
    }
  }
  /* drag box */
  if (U.drag && U.drag.moved) {
    var x0 = Math.min(U.drag.x0, U.drag.x1), y0 = Math.min(U.drag.y0, U.drag.y1);
    var w = Math.abs(U.drag.x1 - U.drag.x0), h = Math.abs(U.drag.y1 - U.drag.y0);
    g.strokeStyle = '#8ef07a'; g.lineWidth = 1.5;
    g.fillStyle = 'rgba(142,240,122,0.10)';
    g.fillRect(x0, y0, w, h); g.strokeRect(x0, y0, w, h);
  }
  /* order confirmation ping */
  if (U.flash) {
    U.flash.t += dt;
    if (U.flash.t > 0.55) U.flash = null;
    else {
      var f = U.flash, sp = _rtsWorldToScreen(f.x, 0.5, f.z), k = f.t / 0.55;
      if (!sp.behind) {
        g.strokeStyle = f.kind === 'attack' ? '#ff6a52' : (f.kind === 'harvest' ? '#6fe3b8' : '#8ef07a');
        g.lineWidth = 2.5 * (1 - k);
        g.beginPath(); g.ellipse(sp.x, sp.y, 26 * k + 5, 14 * k + 3, 0, 0, 6.2832); g.stroke();
      }
    }
  }
  /* placement hint */
  if (U.place) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - 150, 14, 300, 26);
    g.fillStyle = '#cfe9ff'; g.font = '13px system-ui,sans-serif'; g.textAlign = 'center';
    g.fillText('Click to place ' + rtsStructDef(U.place).name + '  ·  Esc to cancel', W / 2, 31);
    g.textAlign = 'left';
  }
  /* The action cursor goes last so nothing draws over it. While one is showing the OS
     pointer is hidden, or you get two cursors fighting for the same few pixels. */
  var act = (U.mouse.over && !U.drag) ? _rtsActionAt(U.mouse.x, U.mouse.y) : null;
  var cv2 = document.getElementById('rtsCv');
  if (cv2) {
    var want = act ? 'none' : (U.mode ? 'crosshair' : 'crosshair');
    if (cv2.style.cursor !== want) cv2.style.cursor = want;
  }
  if (act) _rtsDrawCursor(g, U.mouse.x, U.mouse.y, act);
}
/* Drawn as strokes rather than a 🔧 glyph: an emoji here depends on a font the machine may
   not have, and a missing one silently draws nothing at all. */
/* ------------------------------------------------------- action cursor --
   What would happen if you clicked right now? The original changes the mouse shape as it
   passes over the map - move, attack, enter, no-entry - so the answer is always on screen
   instead of being something you find out by trying it. This mirrors the decisions
   _rtsRightClick actually makes, so the cursor cannot promise an order the click will not
   give. (Built from this game's own action set - DISPLAY.CPP was not among the files mined.) */
function _rtsActionAt(mx, my) {
  var G = window._rtsG, U = window._rtsUI;
  if (!G || G.over) return null;
  if (U.place) return null;                      /* the ghost is already the feedback */
  if (U.mode === 'repair' || U.mode === 'sell') {
    var h0 = _rtsPickAt(mx, my), t0 = h0 && h0.ent;
    if (t0 && t0.side === 'player' && t0.type === 'struct') return U.mode;
    return 'no';
  }
  var hit = _rtsPickAt(mx, my);
  if (!hit) return null;
  var tgt = hit.ent;
  var mine = [], i;
  /* Runs inside the render loop, so one bad entry must not take the whole frame down. */
  for (i = 0; i < G.sel.length; i++) {
    var sv = G.sel[i];
    if (sv && !sv.dead && !sv.inside && sv.side === 'player' && sv.type === 'unit') mine.push(sv);
  }
  if (!mine.length) return (tgt && !tgt.dead) ? 'select' : null;
  if (tgt && tgt.side === 'enemy') return 'attack';
  var tx = _rtsTX(hit.x), tz = _rtsTX(hit.z);
  var onScrap = _rtsInB(tx, tz) && G.scrap[_rtsIdx(tx, tz)] > 0;
  var harv = false;
  for (i = 0; i < mine.length; i++) if (rtsUnitDef(mine[i].def).harvest) harv = true;
  if (harv && onScrap) return 'harvest';
  if (harv && tgt && tgt.side === 'player' && tgt.def === 'refinery') return 'deliver';
  /* Somewhere no ground unit can stand is a no-entry, not a move order that quietly fails. */
  if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz)) return 'no';
  return U.attackMove ? 'amove' : 'move';
}
function _rtsDrawCursor(g, x, y, kind) {
  if (!kind) return;
  g.save(); g.translate(x, y); g.lineCap = 'round'; g.lineJoin = 'round';
  var col = { move:'#8ef07a', amove:'#ffd473', attack:'#ff6a5a', harvest:'#ffd473',
    deliver:'#8ef07a', select:'#9fd0ff', repair:'#ffd473', sell:'#ff9a4a', no:'#ff6a5a' }[kind] || '#8ef07a';
  /* every shape is stroked twice: a fat dark pass first so it stays legible on pale ore */
  for (var pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? col : 'rgba(0,0,0,0.75)';
    g.lineWidth = pass ? 2 : 4.5;
    if (kind === 'attack') {                       /* reticle with a gap at the cardinals */
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke();
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        g.beginPath(); g.moveTo(d[0] * 5, d[1] * 5); g.lineTo(d[0] * 12, d[1] * 12); g.stroke();
      });
    } else if (kind === 'no') {                    /* circle with a bar through it */
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-5.7, -5.7); g.lineTo(5.7, 5.7); g.stroke();
    } else if (kind === 'select') {                /* four corner ticks */
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        g.beginPath();
        g.moveTo(c[0] * 9, c[1] * 4); g.lineTo(c[0] * 9, c[1] * 9); g.lineTo(c[0] * 4, c[1] * 9);
        g.stroke();
      });
    } else if (kind === 'harvest' || kind === 'deliver') {   /* a scoop */
      g.beginPath(); g.arc(0, 1, 7, 0.15, Math.PI - 0.15); g.stroke();
      g.beginPath(); g.moveTo(0, -9); g.lineTo(0, -2); g.stroke();
      if (kind === 'deliver') { g.beginPath(); g.moveTo(-4, -6); g.lineTo(0, -10); g.lineTo(4, -6); g.stroke(); }
    } else if (kind === 'sell') {                  /* banknote */
      g.beginPath(); g.rect(-9, -6, 18, 12); g.stroke();
      g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.stroke();
    } else if (kind === 'repair') {
      g.restore(); _rtsDrawWrench(g, x, y); g.save(); g.translate(x, y);
      break;
    } else {                                       /* move / attack-move: a chevron */
      g.beginPath(); g.moveTo(-7, -3); g.lineTo(0, 5); g.lineTo(7, -3); g.stroke();
      g.beginPath(); g.moveTo(0, 5); g.lineTo(0, -8); g.stroke();
      if (kind === 'amove') { g.beginPath(); g.arc(0, -1, 10, 0, Math.PI * 2); g.stroke(); }
    }
  }
  g.restore();
}
function _rtsDrawWrench(g, x, y) {
  g.save(); g.translate(x, y); g.rotate(-0.6); g.lineCap = 'round';
  for (var pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? '#ffd473' : 'rgba(0,0,0,0.8)';
    g.lineWidth = pass ? 2 : 4.5;
    g.beginPath(); g.moveTo(0, -3); g.lineTo(0, 5); g.stroke();              /* handle */
    g.beginPath(); g.arc(0, -5, 2.8, 0.75, Math.PI * 2 - 0.75); g.stroke();  /* open jaw */
  }
  g.restore();
}
/* Is the radar working? A Radar Dome, standing and finished, with the base not in power
   deficit. Everything the radar panel does - drawing, clicking to move the view, right-clicking
   to order - is gated on this one answer, so they can never disagree. */
function _rtsRadarLit() {
  var G = window._rtsG;
  if (!G || !_rtsHas('player', 'radar')) return false;
  var PS = G.sides.player;
  return PS.powerMade >= PS.powerUsed;
}
function _rtsDrawMini() {
  var G = window._rtsG, mini = document.getElementById('rtsMini');
  if (!mini) return;
  var g = mini.getContext('2d'), S = mini.width, sc = S / RTS_N, i;
  /* No Radar Dome, no radar. In the originals the map panel is dead until you build the
     structure that powers it, and it goes dead again the moment that structure is destroyed
     or the base browns out - which is what makes bombing the dome worth doing. Powered means
     the whole side is not in deficit; the same condition that stops a turret firing. */
  var dome = _rtsHas('player', 'radar');
  if (!_rtsRadarLit()) {
    g.fillStyle = '#0a0d12'; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(120,150,190,0.30)';
    g.font = 'bold 11px ui-monospace,monospace'; g.textAlign = 'center';
    g.fillText(dome ? 'NO POWER' : 'NO RADAR', S / 2, S / 2 - 4);
    g.font = '9px ui-monospace,monospace';
    g.fillText(dome ? 'restore power' : 'build a Radar Dome', S / 2, S / 2 + 10);
    g.textAlign = 'left';
    return;
  }
  /* The radar mirrors the terrain layer, so forest, ridges, the lake and the roads are all
     legible at a glance - the whole point of having a radar rather than a blank green square. */
  var TCOL = ['#374626', '#22391b', '#6a665c', '#2b4c6b', '#5a4e39', '#8a7c58', '#a89663'];
  g.fillStyle = TCOL[0]; g.fillRect(0, 0, S, S);
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    var idx = _rtsIdx(tx, tz);
    /* the radar shows what you have explored, and nothing else */
    if (G.mapped && !G.mapped[idx]) { g.fillStyle = '#0a0d12'; g.fillRect(tx * sc, tz * sc, sc, sc); continue; }
    if (G.scrap[idx] > 0) g.fillStyle = G.gems[idx] ? '#9b7ae8' : '#c9a03a';
    else {
      var tk = G.terrain ? G.terrain[idx] : 0;
      if (tk === 0) continue;
      g.fillStyle = TCOL[tk] || TCOL[0];
    }
    g.fillRect(tx * sc, tz * sc, sc, sc);
  }
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || !_rtsEntSeen(e)) continue;
    g.fillStyle = e.side === 'player' ? '#5ea8ff' : '#ff6a52';
    if (e.type === 'struct') {
      var d = rtsStructDef(e.def);
      var ico = (typeof _rtsRadarIcon === 'function') ? _rtsRadarIcon(e.def, e.side) : null;
      if (ico) g.drawImage(ico, e.tx * sc, e.tz * sc, d.w * sc, d.h * sc);
      else g.fillRect(e.tx * sc, e.tz * sc, d.w * sc, d.h * sc);
    } else {
      var mx = (e.x / RTS_TILE + RTS_N / 2) * sc, mz = (e.z / RTS_TILE + RTS_N / 2) * sc;
      g.fillRect(mx - 1.5, mz - 1.5, 3, 3);
    }
  }
  /* camera viewport box */
  var f = _rtsR.focus, span = RTS_N * RTS_TILE;
  var vs = _rtsViewSpan(), vw = vs.w, vh = vs.h;
  /* CONQUER.CPP pulses the radar box on CC_PULSE_COLOR rather than drawing it flat white. */
  var pv = (typeof _rtsPulse === 'function') ? _rtsPulse() : 0.6;
  g.strokeStyle = 'rgba(255,255,255,' + (0.45 + pv * 0.75).toFixed(2) + ')';
  g.lineWidth = 1.5;
  g.strokeRect((f.x - vw / 2) / span * S + S / 2, (f.z - vh / 2) / span * S + S / 2, vw / span * S, vh / span * S);
}

/* -------------------------------------------------------------- camera */
function _rtsPanTick(dt) {
  var U = window._rtsUI, R = _rtsR, sp = R.dist * 1.15 * dt, moved = false;
  var k = U.keys;
  if (k['w'] || k['arrowup'])    { R.focus.z -= sp; moved = true; }
  if (k['s'] || k['arrowdown'])  { R.focus.z += sp; moved = true; }
  if (k['a'] || k['arrowleft'])  { R.focus.x -= sp; moved = true; }
  if (k['d'] || k['arrowright']) { R.focus.x += sp; moved = true; }
  /* edge scroll, but only while the pointer is genuinely over the battlefield */
  if (U.mouse.over && !U.drag) {
    var m = 26;
    if (U.mouse.x < m) { R.focus.x -= sp; moved = true; }
    if (U.mouse.x > R.W - m) { R.focus.x += sp; moved = true; }
    if (U.mouse.y < m) { R.focus.z -= sp; moved = true; }
    if (U.mouse.y > R.H - m) { R.focus.z += sp; moved = true; }
  }
  if (moved) _rtsClampFocus();
}
/* Keep the view on the battlefield. The old fixed clamp was tuned for a perspective camera
   and let the ortho view slide far enough that the off-map background filled a third of the
   screen. Derive the limit from what is actually visible at the current zoom. */
function _rtsClampFocus() {
  var R = _rtsR, span = RTS_N * RTS_TILE, vs = _rtsViewSpan();
  var lx = Math.max(0, span / 2 - vs.w * 0.5), lz = Math.max(0, span / 2 - vs.h * 0.5);
  R.focus.x = Math.max(-lx, Math.min(lx, R.focus.x));
  R.focus.z = Math.max(-lz, Math.min(lz, R.focus.z));
  _rtsApplyCam();
}

/* ----------------------------------------------------------- main loop */
function _rtsLoop() {
  var U = window._rtsUI;
  if (!U || U.dead) return;
  U.raf = requestAnimationFrame(_rtsLoop);
  var now = (new Date()).getTime(), dt = Math.min(0.1, (now - U.last) / 1000);
  U.last = now;
  try {
    _rtsPanTick(dt);
    _rtsTick(dt);
    _rtsRFrame(dt);
    _rtsDrawHud(dt);
    U.miniT = (U.miniT || 0) + dt;
    if (U.miniT > 0.12) { U.miniT = 0; _rtsDrawMini(); }
    U.uiT = (U.uiT || 0) + dt;
    if (U.uiT > 0.1) { U.uiT = 0; _rtsSyncSidebar(); }
  } catch (err) {
    /* Surface a persistent failure instead of silently burning frames on it. */
    U.errs = (U.errs || 0) + 1;
    if (!U.errShown) {
      U.errShown = true;
      try { console.error('RC Command:', err); } catch (_c) {}
      _rtsSay('Error: ' + ((err && err.message) || err));
    }
  }
}
