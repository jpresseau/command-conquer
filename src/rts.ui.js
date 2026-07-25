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
    +     '<span class="rts-vs"><b class="p">Vanguard</b> vs <b class="e">Redline</b></span>'
    +     '<span class="rts-help">drag select · right-click order · WASD/edge pan · wheel zoom · Esc quit</span>'
    +     '<button type="button" class="rts-mute" id="rtsMute" title="Sound on" onclick="rtsMuteToggle()">🔊</button>'
    +     '<button type="button" class="rts-x" onclick="rtsClose()">✕</button></div>'
    +   '<div class="rts-msg" id="rtsMsg"></div>'
    +   '<div class="rts-over" id="rtsOver"></div>'
    + '</div>'
    + '<div class="rts-bar">'
    +   '<div class="rts-credits"><span class="lbl">CREDITS</span><span class="val" id="rtsCred">0</span></div>'
    +   '<div class="rts-radar"><canvas id="rtsMini" width="188" height="188"></canvas>'
    +     '<span class="rlbl">RADAR</span></div>'
    +   '<div class="rts-tabs">'
    +     '<button type="button" class="on" data-cat="struct" onclick="rtsTab(\'struct\')">Build</button>'
    +     '<button type="button" data-cat="infantry" onclick="rtsTab(\'infantry\')">Infantry</button>'
    +     '<button type="button" data-cat="vehicle" onclick="rtsTab(\'vehicle\')">Vehicles</button>'
    +   '</div>'
    +   '<div class="rts-mid">'
    +     '<div class="rts-pwr" title="Power"><span class="ptxt">P<br>W<br>R</span>'
    +       '<div class="ptrack"><i id="rtsPwrFill"></i><b id="rtsPwrMark"></b></div></div>'
    +     '<div class="rts-grid" id="rtsList"></div>'
    +   '</div>'
    +   '<div class="rts-sel" id="rtsSel">Nothing selected</div>'
    + '</div>';
  document.body.appendChild(d);

  _rtsNewGame(seed || (((new Date()).getTime()) & 0xffff));
  var cv = document.getElementById('rtsCv');
  _rtsResizeCanvases();
  _rtsRInit(cv);

  window._rtsUI = { cat:'struct', place:null, drag:null, keys:{}, last:0, raf:0, dead:false,
    btns:{}, mouse:{ x:0, y:0, over:false }, miniDrag:false, credShown:0,
    icons:_rtsMakeIcons('player') };
  _rtsBuildList();
  _rtsBindInput();
  document.addEventListener('keydown', _rtsKeyDown, true);
  document.addEventListener('keyup', _rtsKeyUp, true);
  window.addEventListener('resize', _rtsOnResize);
  /* rtsOpen runs off a real click, so this is a valid gesture to unlock WebAudio */
  if (typeof _rtsAudioInit === 'function') { _rtsAudioInit(); _rtsAudioResume(); _rtsMusicStart(); }
  _rtsSay('Vanguard command online. Build a Refinery to start earning.');
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
function rtsTab(cat) {
  var U = window._rtsUI;
  if (!U) return;
  U.cat = cat;
  var ts = document.querySelectorAll('#rcgRts .rts-tabs button');
  for (var i = 0; i < ts.length; i++) ts[i].className = (ts[i].getAttribute('data-cat') === cat) ? 'on' : '';
  _rtsBuildList();
}
function _rtsCatItems(cat) {
  var out = [], i;
  if (cat === 'struct') {
    for (i = 0; i < RTS_STRUCTS.length; i++) if (RTS_STRUCTS[i].key !== 'yard') out.push(RTS_STRUCTS[i]);
  } else {
    for (i = 0; i < RTS_UNITS.length; i++) if (RTS_UNITS[i].kind === cat) out.push(RTS_UNITS[i]);
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
      b.title = def.name + ' — ' + def.cost + ' credits\n' + def.desc;
      b.onclick = function () { _rtsItemClick(def.key); };
      list.appendChild(b);
      U.btns[def.key] = b;
    })(items[i]);
  }
}
function _rtsItemClick(key) {
  var G = window._rtsG, U = window._rtsUI, S = G.sides.player;
  var cat = _rtsQueueCat(key);
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
  if (cat === 'struct' && S.ready === key) { U.place = key; _rtsGhostShow(key); return; }
  if (S.q[cat] && S.q[cat].key === key) { _rtsCancel('player', cat); if (U.place === key) { U.place = null; _rtsGhostHide(); } return; }
  if (_rtsQueue('player', key)) { if (typeof _rtsSfx === 'function') _rtsSfx('build'); }
  else {
    var def = rtsStructDef(key) || rtsUnitDef(key);
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    if (!_rtsAvailable('player', def)) _rtsSay('Needs ' + def.needs.map(function (n) { return rtsStructDef(n).name; }).join(' + ') + ' first.');
    else if (cat === 'infantry' && !_rtsHas('player', 'barracks')) _rtsSay('Build a Barracks first.');
    else if (cat === 'vehicle' && !_rtsHas('player', 'factory')) _rtsSay('Build a War Factory first.');
    else if (S.credits < def.cost) _rtsSay('Not enough credits.');
    else if (S.q[cat]) _rtsSay('That production line is busy.');
    else if (S.ready) _rtsSay('Place the finished building first.');
  }
}
function _rtsSyncSidebar(dt) {
  var G = window._rtsG, U = window._rtsUI, S = G.sides.player;

  /* Credits roll toward the true value instead of snapping - the classic counter tick. */
  var target = Math.floor(S.credits);
  var step = Math.max(1, Math.ceil(Math.abs(target - U.credShown) * 0.28));
  if (U.credShown < target) U.credShown = Math.min(target, U.credShown + step);
  else if (U.credShown > target) U.credShown = Math.max(target, U.credShown - step);
  document.getElementById('rtsCred').textContent = U.credShown;

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
    else if (S.credits < def.cost && !(q && q.key === key)) cls += ' poor';
    if (cat === 'struct' && S.ready === key) {
      cls += ' ready'; pct.textContent = 'READY'; wipe.style.background = 'none';
    } else if (q && q.key === key) {
      cls += ' busy';
      pct.textContent = Math.floor(q.prog * 100) + '%';
      /* clock wipe: the built portion is revealed clockwise from the top */
      var deg = Math.max(0, Math.min(360, q.prog * 360));
      wipe.style.background = 'conic-gradient(from 0deg, rgba(0,0,0,0) 0deg, rgba(0,0,0,0) '
        + deg + 'deg, rgba(4,7,11,0.74) ' + deg + 'deg, rgba(4,7,11,0.74) 360deg)';
    } else {
      pct.textContent = '';
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
    if (e.type === 'unit' && rtsUnitDef(e.def).harvest) txt += ' · ' + Math.floor(e.carry) + ' ore';
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
    if (e.button === 2) { _rtsRightClick(mx, my); return; }
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
  function miniGo(e) {
    var r = mini.getBoundingClientRect();
    var fx = (e.clientX - r.left) / r.width, fz = (e.clientY - r.top) / r.height;
    var span = RTS_N * RTS_TILE;
    _rtsR.focus.x = (fx - 0.5) * span; _rtsR.focus.z = (fz - 0.5) * span;
    _rtsClampFocus();
  }
  mini.onmousedown = function (e) { U.miniDrag = true; miniGo(e); };
  mini.onmousemove = function (e) { if (U.miniDrag) miniGo(e); };
  window.addEventListener('mouseup', function () { if (window._rtsUI) window._rtsUI.miniDrag = false; });
}
function _rtsKeyDown(e) {
  if (!document.getElementById('rcgRts')) return;
  var U = window._rtsUI, G = window._rtsG;
  if (!U) return;
  var k = e.key;
  if (k === 'Escape') {
    if (U.place) { U.place = null; _rtsGhostHide(); }
    else rtsClose();
    e.preventDefault(); return;
  }
  U.keys[k.toLowerCase()] = true;
  if (k === 'Delete' || k === 'Backspace') { /* scuttle selected own units */
    for (var i = G.sel.length - 1; i >= 0; i--) if (G.sel[i].side === 'player' && G.sel[i].type === 'unit') _rtsKill(G.sel[i]);
    e.preventDefault();
  }
  if (k === 'a' || k === 'A') U.attackMove = true;
}
function _rtsKeyUp(e) {
  var U = window._rtsUI;
  if (!U) return;
  U.keys[(e.key || '').toLowerCase()] = false;
  if (e.key === 'a' || e.key === 'A') U.attackMove = false;
}
function _rtsClickSelect(mx, my, add) {
  var G = window._rtsG, hit = _rtsPickAt(mx, my);
  if (!add) G.sel.length = 0;
  if (hit && hit.ent) {
    if (G.sel.indexOf(hit.ent) < 0) G.sel.push(hit.ent);
    if (hit.ent.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('select');
  }
}
function _rtsBoxSelect(dg) {
  var G = window._rtsG;
  if (!dg.add) G.sel.length = 0;
  var x0 = Math.min(dg.x0, dg.x1), x1 = Math.max(dg.x0, dg.x1);
  var y0 = Math.min(dg.y0, dg.y1), y1 = Math.max(dg.y0, dg.y1);
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'player' || e.type !== 'unit') continue;  /* box only grabs your own units */
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
    for (i = 0; i < mine.length; i++) _rtsOrderAttack(mine[i], tgt);
    _rtsFlash(tgt.x, tgt.z, 'attack');
    if (typeof _rtsSfx === 'function') _rtsSfx('order');
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
  _rtsPlaceStruct('player', U.place, tx, tz, false);
  if (typeof _rtsSfx === 'function') _rtsSfx('place');
  G.sides.player.ready = null;
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
    if (e.dead) continue;
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
}
function _rtsDrawMini() {
  var G = window._rtsG, mini = document.getElementById('rtsMini');
  if (!mini) return;
  var g = mini.getContext('2d'), S = mini.width, sc = S / RTS_N, i;
  /* The radar mirrors the terrain layer, so forest, ridges, the lake and the roads are all
     legible at a glance - the whole point of having a radar rather than a blank green square. */
  var TCOL = ['#3b4b26', '#243d1d', '#6a665c', '#2b4c6b', '#6f6046', '#8a7c58'];
  g.fillStyle = TCOL[0]; g.fillRect(0, 0, S, S);
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    var idx = _rtsIdx(tx, tz);
    if (G.scrap[idx] > 0) g.fillStyle = '#c9a03a';
    else {
      var tk = G.terrain ? G.terrain[idx] : 0;
      if (tk === 0) continue;
      g.fillStyle = TCOL[tk] || TCOL[0];
    }
    g.fillRect(tx * sc, tz * sc, sc, sc);
  }
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead) continue;
    g.fillStyle = e.side === 'player' ? '#5ea8ff' : '#ff6a52';
    if (e.type === 'struct') {
      var d = rtsStructDef(e.def);
      g.fillRect(e.tx * sc, e.tz * sc, d.w * sc, d.h * sc);
    } else {
      var mx = (e.x / RTS_TILE + RTS_N / 2) * sc, mz = (e.z / RTS_TILE + RTS_N / 2) * sc;
      g.fillRect(mx - 1.5, mz - 1.5, 3, 3);
    }
  }
  /* camera viewport box */
  var f = _rtsR.focus, span = RTS_N * RTS_TILE;
  var vs = _rtsViewSpan(), vw = vs.w, vh = vs.h;
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5;
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
