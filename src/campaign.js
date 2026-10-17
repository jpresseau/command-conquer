/* campaign.js - the CAMPAIGN on the title screen: the mission list, a mission's battle, its
   objectives in the corner, its end card, and which missions have been won.

   The missions themselves are rules/campaign.js and core/campaign.js; this is only the page
   around them. Like a daily (daily.js), a mission borrows the army and difficulty it was
   written for and puts the player's own back when the battle ends (rtsHome), and nothing of it
   is written over the stored preferences. A mission saves like any battle: everything it
   remembers is plain data on G.mission, and a resume (rts.save.js) is opened as that mission
   rather than laid again. */

var RTS_CAMP_LS = 'bw.campaign';        /* {<id>: {won, secs, lost, killed, lvl}} - the best of each */

function rtsCampProgress() {
  try { return JSON.parse(window.localStorage.getItem(RTS_CAMP_LS) || '{}') || {}; } catch (e) { return {}; }
}
/* The mission list, opened and closed under the CAMPAIGN button. */
function rtsCampToggle() {
  var box = document.getElementById('rtsCampList');
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  var done = rtsCampProgress();
  box.innerHTML = RTS_CAMPAIGN.map(function (m, i) {
    var r = done[m.id], lv = _rtsMissionLevels(m);
    /* one level is a name; more are a choice, opening on the one the mission was written at */
    var pick = lv.length < 2 ? '' : '<select class="lvl" aria-label="Difficulty">' + lv.map(function (k) {
      return '<option value="' + k + '"' + (k === m.diff ? ' selected' : '') + '>' + RTS_DIFF[k].name + (k === m.diff ? ' (as written)' : '') + '</option>';
    }).join('') + '</select> ';
    return '<div class="mission' + (r && r.won ? ' won' : '') + '" data-id="' + m.id + '">'
      + '<h3>' + (i + 1) + '. ' + m.name + (r && r.won ? ' <i>✓ ' + rtsDailyClock(r.secs) + ' ' + RTS_DIFF[r.lvl || m.diff].name + '</i>' : '') + '</h3>'
      + '<p class="s">' + rtsArmyTitle(m.army) + ' · ' + RTS_DIFF[m.diff].name + '</p>'
      + '<p>' + m.brief + '</p>'
      + '<div class="launch">' + pick + '<button type="button" onclick="rtsCampStart(\'' + m.id + '\', this)">PLAY</button></div></div>';
  }).join('');
  box.hidden = false;
}
/* `lvl`: the level to play at - the card's choice when started from the list, the last mission's
   on Next; the mission's own when it does not offer that one */
function rtsCampStart(id, btn, lvl) {
  var m = _rtsMissionOf(id);
  if (!m) return;
  var sel = btn && btn.parentNode && btn.parentNode.querySelector('select.lvl');
  if (sel) lvl = sel.value;
  if (_rtsMissionLevels(m).indexOf(lvl) < 0) lvl = m.diff;
  if (!window._RTS_MISSION) window._RTS_CAMP_PREV = { diff: window._RTS_DIFF, army: window._RTS_ARMY };
  window._RTS_MISSION = { id: id, seed: m.seed, lvl: lvl };
  window._RTS_DIFF = m.diff; window._RTS_ARMY = m.army;
  var err = document.getElementById('rtsErr');
  if (err) err.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'DEPLOYING…'; }
  setTimeout(function () {
    try { rtsOpen(m.seed); }
    catch (e) {
      rtsCampEnd(); rtsHome();
      if (err) { err.style.display = 'block'; err.textContent = 'Could not start:\n' + ((e && e.message) || e); }
    }
  }, 30);
}
/* Called by rtsOpen on the battle it has just made: lay the mission and look at it. */
function rtsCampLay(G) {
  var mi = window._RTS_MISSION;
  if (!mi || !G) return null;
  var M = _rtsMissionSetup(G, mi.id, mi.lvl);
  if (M && M.focus && window._rtsR) { _rtsR.focus.x = _rtsWX(M.focus.tx); _rtsR.focus.z = _rtsWX(M.focus.tz); }
  return M;
}
/* Back on the title: the player's own army and difficulty again. */
function rtsCampEnd() {
  var p = window._RTS_CAMP_PREV;
  window._RTS_MISSION = null; window._RTS_CAMP_PREV = null;
  if (!p) return;
  window._RTS_DIFF = p.diff; window._RTS_ARMY = p.army;
}
/* The objectives, top left of the battlefield, kept in step by the HUD tick. */
function rtsCampHud(G) {
  var el = document.getElementById('rtsGoals');
  if (!el) return;
  var on = !!(G && G.mission);
  if (el.hidden === on) el.hidden = !on;
  if (!on) return;
  var goals = _rtsMissionGoals(G), name = _rtsMissionOf(G.mission.id).name;
  /* the pill is what a narrow screen shows until it is tapped open (style.css) */
  var html = '<i class="pill">' + name + ' · ' + goals.filter(function (g) { return g.done; }).length + '/' + goals.length + ' ▾</i>'
    + '<b>' + name + '</b>' + goals.map(function (g) {
    return '<span class="' + (g.done ? 'done' : g.failed ? 'failed' : '') + '">' + (g.done ? '✓ ' : g.failed ? '✕ ' : '• ') + g.text + '</span>';
  }).join('');
  if (el.innerHTML !== html) el.innerHTML = html;
  if (!el.onclick) el.onclick = function () { el.classList.toggle('open'); };
  /* just under the top bar, which wraps taller on a phone than its 44px on a desktop */
  var top = document.querySelector('#rcgRts .rts-top'), st = document.querySelector('#rcgRts .rts-stage');
  if (top && st) { var y = Math.round(top.getBoundingClientRect().bottom - st.getBoundingClientRect().top + 4) + 'px'; if (el.style.top !== y) el.style.top = y; }
}
/* The end card for a mission, recording the best result once. */
function rtsCampOverHTML(G) {
  var M = G && G.mission;
  if (!M || !G.over) return '';
  var m = _rtsMissionOf(M.id), won = G.over === 'win', all = rtsCampProgress(), b = all[M.id];
  var r = { won: won, secs: G.t, lost: G.stats.lostU, killed: G.stats.killed, lvl: M.lvl || m.diff };
  if (won && rtsCampBetter(r, b, m)) { all[M.id] = r; try { window.localStorage.setItem(RTS_CAMP_LS, JSON.stringify(all)); } catch (e) {} }
  var next = won && RTS_CAMPAIGN[RTS_CAMPAIGN.indexOf(m) + 1];
  return '<div class="card ' + G.over + '"><h2>' + (won ? 'MISSION COMPLETE' : 'MISSION FAILED') + '</h2>'
    + '<p>' + m.name + ' (' + RTS_DIFF[M.lvl || m.diff].name + '): ' + (M.why || '') + '</p>'
    + '<p class="s">Time ' + rtsDailyClock(G.t) + ' · Enemy destroyed: ' + G.stats.killed + ' · Units lost: ' + G.stats.lostU + '</p>'
    + (next ? '<button type="button" onclick="rtsCampNext(\'' + next.id + '\', \'' + (M.lvl || m.diff) + '\')">Next: ' + next.name + '</button> ' : '')
    + '<button type="button" onclick="rtsRestart()">Retry</button> '
    + '<button type="button" onclick="rtsCampMissions()">Missions</button> '
    + '<button type="button" onclick="rtsClose()">Quit</button></div>';
}
/* the best win: the harder level, then the faster time (a record from before levels is the
   mission's own) */
function rtsCampBetter(r, b, m) {
  if (!b || !b.won) return true;
  var k = Object.keys(RTS_DIFF), a = k.indexOf(r.lvl), o = k.indexOf(b.lvl || m.diff);
  return a > o || (a === o && r.secs < b.secs);
}
function rtsCampNext(id, lvl) { rtsClose(); setTimeout(function () { rtsCampStart(id, null, lvl); }, 60); }
function rtsCampMissions() {
  rtsClose();
  var box = document.getElementById('rtsCampList');
  if (box) { box.hidden = true; rtsCampToggle(); }
}
