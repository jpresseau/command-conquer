/* replay.js - THE LAST BATTLE, WATCHED AGAIN: what starts a recording, where it is kept, the title's
   WATCH REPLAY, the end card's, and the replay's own bar. The recording and the playback are
   core/replay.js.

   Every battle started fresh is recorded from its first tick (rtsReplayOpened, called by rtsOpen);
   one resumed from a save is not, since its start is the save. The recording stops when the
   battle is decided, or left, and the last one is kept (bw.replay, a few tens of KB for ten
   minutes: a character a tick and the orders). WATCH REPLAY lays the battle again from the header
   - the seed, difficulty, army, map setup, mission and level, survival, and the sky, which is
   fixed before the first tick - and plays it at 1x, 2x, 4x or 8x. The camera is the watcher's;
   the orders are the recording's, and one given by hand is refused (core/replay.js). A replay
   writes nothing back: no save, no autosave, no record, no medal. At the end the battle's hash is
   checked against the one recorded, so a replay that went its own way - a recording from an older
   build - says so rather than showing a different battle as the one that was fought. */
var RTS_REPLAY_LS = 'bw.replay';
var RTS_REPLAY_SPEEDS = [1, 2, 4, 8];

function rtsReplayGet() {
  try { var r = JSON.parse(window.localStorage.getItem(RTS_REPLAY_LS) || 'null'); return r && r.v === 1 && r.head && typeof r.dts === 'string' ? r : null; }
  catch (e) { return null; }
}
function _rtsReplayBuild() { var b = document.getElementById('rtsBuild'); return b ? b.textContent.trim() : ''; }
/* what the battle was, in a line: the title's note and the bar's */
function rtsReplayLine(r) {
  if (!r) return '';
  var h = r.head, what = h.mission && typeof _rtsMissionOf === 'function' && _rtsMissionOf(h.mission.id) ? _rtsMissionOf(h.mission.id).name
    : h.survival ? 'Survival' : h.daily ? 'Daily battle' : 'Battle';
  var lvl = RTS_DIFF[(h.mission && h.mission.lvl) || h.diff];
  var end = r.end && r.end.over === 'win' ? 'won' : r.end && r.end.over === 'lose' ? 'lost' : 'left';
  return what + ' · ' + (lvl ? lvl.name : h.diff) + ' · ' + end + ' at ' + rtsDailyClock(r.end ? r.end.t : 0);
}

/* rtsOpen, on the battle it has just laid: play the replay that asked for it, or record this one */
function rtsReplayOpened(G, loaded, skirmish) {
  var P = window._RTS_REPLAY_PLAY;
  if (P) {
    window._RTS_REPLAY_PLAY = null;
    G.sky = P.head.sky || G.sky;
    _rtsReplayBegin(P);
    window._rtsUI.replay = { speed: 1, rec: P, said: 0, shown: false };
    _rtsReplayBar();
    return;
  }
  _rtsRec = null;
  if (loaded) return;
  if (!G.sky && typeof _rtsSkyName === 'function') G.sky = _rtsSkyName(G);   /* fixed now, so the header has it */
  _rtsRecStart({ seed: G.seed, diff: G.diff, army: rtsArmySide(), skirmish: skirmish || null,
    mission: G.mission ? { id: G.mission.id, lvl: G.mission.lvl } : null, survival: !!G.survival,
    daily: window._RTS_DAILY ? (window._RTS_DAILY.date || true) : null, sky: G.sky || null, build: _rtsReplayBuild() });
}
/* the recording, kept: when the battle is decided, or left */
function rtsReplayKeep() {
  var r = _rtsRecStop();
  if (!r || !r.dts.length) return null;
  try { window.localStorage.setItem(RTS_REPLAY_LS, JSON.stringify(r)); } catch (e) { return null; }
  return r;
}
/* rtsClose: a recording still running is kept; a replay playing just stops */
function rtsReplayClosing() {
  if (_rtsRec && _rtsRec.mode === 'rec') rtsReplayKeep();
  _rtsRec = null;
}
/* rtsHome: the army and difficulty the replay borrowed go back */
function rtsReplayEnd() {
  var p = window._RTS_REPLAY_PREV;
  window._RTS_REPLAY_PREV = null;
  if (p) { window._RTS_ARMY = p.army; window._RTS_DIFF = p.diff; }
  rtsReplayNote();
}

/* WATCH REPLAY: the battle laid again from the header, played from the recording */
function rtsReplayWatch(btn) {
  var r = rtsReplayGet(), err = document.getElementById('rtsErr');
  if (!r) return false;
  if (document.getElementById('rcgRts')) rtsClose();
  if (typeof rtsCampEnd === 'function') rtsCampEnd();
  if (typeof rtsDailyEnd === 'function') rtsDailyEnd();
  if (typeof rtsSurvivalEnd === 'function') rtsSurvivalEnd();
  var h = r.head;
  window._RTS_REPLAY_PREV = { army: window._RTS_ARMY, diff: window._RTS_DIFF };
  window._RTS_ARMY = h.army; window._RTS_DIFF = h.diff;
  if (btn) btn.disabled = true;
  setTimeout(function () {
    window._RTS_MISSION = h.mission ? { id: h.mission.id, seed: h.seed, lvl: h.mission.lvl } : null;
    window._RTS_SURVIVAL = !!h.survival;
    window._RTS_REPLAY_PLAY = r;
    try { rtsOpen(h.seed); }
    catch (e) {
      window._RTS_REPLAY_PLAY = null; rtsReplayEnd(); rtsHome();
      if (err) { err.style.display = 'block'; err.textContent = 'Could not play the replay:\n' + ((e && e.message) || e); }
    }
    /* laid: what laid it is not this battle's to keep (rtsRestart, the title) */
    window._RTS_MISSION = null; window._RTS_SURVIVAL = false;
    if (btn) btn.disabled = false;
  }, 30);
  return true;
}

/* the replay's bar: what is playing, how far in, and how fast */
function _rtsReplayBar() {
  var st = document.querySelector('#rcgRts .rts-stage');
  if (!st || document.getElementById('rtsReplayBar')) return;
  var b = document.createElement('div');
  b.id = 'rtsReplayBar'; b.className = 'rts-replaybar';
  b.innerHTML = '<b>▶ REPLAY</b><span id="rtsReplayClock"></span>'
    + '<button type="button" id="rtsReplaySpeed" onclick="rtsReplaySpeed()" title="Play faster">1×</button>';
  st.appendChild(b);
  _rtsReplaySync();
}
function rtsReplaySpeed(v) {
  var U = window._rtsUI;
  if (!U || !U.replay) return 0;
  var i = RTS_REPLAY_SPEEDS.indexOf(U.replay.speed);
  U.replay.speed = v || RTS_REPLAY_SPEEDS[(i + 1) % RTS_REPLAY_SPEEDS.length];
  _rtsReplaySync();
  return U.replay.speed;
}
function _rtsReplaySync() {
  var U = window._rtsUI, G = window._rtsG, R = _rtsRec;
  if (!U || !U.replay || !G) return;
  var c = document.getElementById('rtsReplayClock'), s = document.getElementById('rtsReplaySpeed');
  var txt = ' ' + rtsDailyClock(G.t) + ' / ' + rtsDailyClock(U.replay.rec.end ? U.replay.rec.end.t : 0) + ' ';
  if (c && c.textContent !== txt) c.textContent = txt;
  if (s && s.textContent !== U.replay.speed + '×') s.textContent = U.replay.speed + '×';
}
/* the loop's, in place of its ticks (ui/camera.js): the recording's time, at the replay's speed */
function rtsReplayFrame(U, dt) {
  var R = _rtsRec, G = window._rtsG;
  if (!R || R.mode !== 'play' || !G) return;
  if (!R.done) _rtsReplayStep(R, dt * U.replay.speed, Math.ceil(8 * U.replay.speed));
  _rtsReplaySync();
  if (R.done && !U.replay.shown) _rtsReplayCard(G);
}
/* did it play out as fought: its end against the recording's */
function _rtsReplayTrue(G, rec) { return !!(rec.end && rec.end.hash === _rtsReplayHash(G)); }
/* the end card, in place of the battle's own (ui/sidebar.js shows none in a replay), once the
   recording has run out - a battle decided goes on a few ticks to the frame's end, and those are
   in the recording too. Nothing is recorded: no record, no medal, no best. */
function rtsReplayOverHTML(G) {
  var U = window._rtsUI, rec = U.replay.rec, same = _rtsReplayTrue(G, rec);
  U.replay.shown = true;
  return '<div class="card ' + (G.over || 'win') + '"><h2>' + (G.over === 'win' ? 'VICTORY' : G.over === 'lose' ? 'DEFEATED' : 'REPLAY OVER') + '</h2>'
    + '<p>' + rtsReplayLine(rec) + '</p>'
    + '<p class="rec" id="rtsReplayVerdict">' + (same ? 'It played out as it was fought.'
      : 'This replay was recorded on ' + (rec.head.build && rec.head.build !== _rtsReplayBuild() ? 'another version of the game (' + rec.head.build + ')' : 'a game that has changed since') + ', and from somewhere it went its own way.') + '</p>'
    + '<button type="button" onclick="rtsReplayWatch()">Watch again</button> '
    + '<button type="button" onclick="rtsClose()">Quit</button></div>';
}
function _rtsReplayCard(G) {
  var o = document.getElementById('rtsOver');
  if (!o) return;
  o.className = 'rts-over on';
  o.innerHTML = rtsReplayOverHTML(G);
}
/* the battle's end card gets its WATCH REPLAY, the recording kept as it stood at the end */
function rtsReplayOverButton(o) {
  var r = rtsReplayKeep(), card = o && o.querySelector('.card');
  if (!r || !card) return;
  card.insertAdjacentHTML('beforeend', ' <button type="button" id="rtsReplayGo" onclick="rtsReplayWatch()">▶ Watch replay</button>');
}
/* the title's button and its line */
function rtsReplayNote() {
  var b = document.getElementById('rtsReplay'), n = document.getElementById('rtsReplayNote'), r = rtsReplayGet();
  if (!b) return;
  b.hidden = !r;
  b.disabled = false;
  if (n) n.textContent = r ? rtsReplayLine(r) : '';
}
