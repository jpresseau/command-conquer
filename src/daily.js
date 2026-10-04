/* daily.js - the DAILY BATTLE: one map a day, the same for everyone, and a result worth sharing.

   The simulation is deterministic from its seed (all gameplay randomness runs off the scenario
   seed), so the only thing a daily needs to agree on is the seed and the rules around it. Both
   come from the UTC date alone: the same day gives every player the same map, the same army, the
   same difficulty and the same tide - nothing is fetched, nothing is shared but a line of text.

   A daily does NOT touch the player's own choices: the army and difficulty it fixes are put back
   when the battle ends (rtsHome), and nothing of it is written over the stored preferences. The
   best result of each day is kept, and the end screen offers a line to copy and post. */

var RTS_DAILY_LS = 'bw.daily.';           /* + date: the best result of that day */

function rtsDailyDate(now) { return (now || new Date()).toISOString().slice(0, 10); }
/* Everything that makes the day's battle, from the date and nothing else. */
function rtsDailySpec(date) {
  var h = 2166136261 >>> 0, s = 'breachwater:' + date;
  for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return { date: date, seed: 1 + (h % 60000), army: (h >>> 16) & 1 ? 'soviet' : 'allied', diff: 'normal' };
}

function rtsDailyStart(btn) {
  var d = rtsDailySpec(rtsDailyDate());
  /* the player's own choices, kept to be put back */
  window._RTS_DAILY_PREV = { diff: window._RTS_DIFF, army: window._RTS_ARMY };
  window._RTS_DAILY = d;
  window._RTS_DIFF = d.diff;
  window._RTS_ARMY = d.army;                 /* for this battle only - rtsSetArmySide would store it */
  var err = document.getElementById('rtsErr');
  if (err) err.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'DEPLOYING…'; }
  setTimeout(function () {
    try {
      document.getElementById('rtsHome').classList.add('gone');
      rtsOpen(d.seed);
    } catch (e) {
      rtsDailyEnd(); rtsHome();
      if (err) { err.style.display = 'block'; err.textContent = 'Could not start:\n' + ((e && e.message) || e); }
    }
  }, 30);
}
/* The battle is over and the player is back on the title: their own army and difficulty again. */
function rtsDailyEnd() {
  var p = window._RTS_DAILY_PREV;
  if (!p) return;
  window._RTS_DIFF = p.diff;
  window._RTS_ARMY = p.army;
  window._RTS_DAILY = null; window._RTS_DAILY_PREV = null;
}

function rtsDailyClock(secs) {
  var s = Math.max(0, Math.round(secs)), m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}
/* Better: any victory over any defeat; the faster victory; the longer defeat. */
function rtsDailyBetter(a, b) {
  if (!b) return true;
  if (a.won !== b.won) return a.won;
  return a.won ? a.secs < b.secs : a.secs > b.secs;
}
/* The day's result, recorded once, and the line that says it. */
function rtsDailyResult(G) {
  var d = window._RTS_DAILY;
  if (!d || !G || !G.over) return null;
  var r = { won: G.over === 'win', secs: G.t, lost: G.stats.lostU, killed: G.stats.killed };
  var best = null, key = RTS_DAILY_LS + d.date;
  try { best = JSON.parse(window.localStorage.getItem(key) || 'null'); } catch (e) { best = null; }
  var isBest = rtsDailyBetter(r, best);
  if (isBest) { try { window.localStorage.setItem(key, JSON.stringify(r)); } catch (e) {} best = r; }
  var line = 'Breachwater daily ' + d.date + ' · ' + (r.won ? 'Victory in ' : 'Held out ') + rtsDailyClock(r.secs) +
             ' · ' + r.killed + ' destroyed, ' + r.lost + ' lost';
  return { line: line, best: best, isBest: isBest, spec: d };
}
function rtsDailyCopy(btn) {
  var t = document.getElementById('rtsDailyLine');
  if (!t) return;
  var text = t.textContent, done = function () { if (btn) btn.textContent = 'COPIED'; };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () {}); return; }
  } catch (e) {}
  var r = document.createRange(); r.selectNodeContents(t);
  var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  try { if (document.execCommand('copy')) done(); } catch (e) {}
}
/* The end-screen block for a daily: the line, a copy button, and the day's best. */
function rtsDailyOverHTML(G) {
  var res = rtsDailyResult(G);
  if (!res) return '';
  var b = res.best;
  return '<div class="daily"><p class="dline" id="rtsDailyLine">' + res.line + '</p>'
    + '<button type="button" onclick="rtsDailyCopy(this)">COPY RESULT</button>'
    + '<p class="s">' + (res.isBest ? 'Your best today.' : 'Your best today: ' + (b.won ? 'victory in ' : 'held out ') + rtsDailyClock(b.secs) + '.') + '</p></div>';
}
/* The title screen's note under the button: what today's battle is. */
function rtsDailyNote() {
  var n = document.getElementById('rtsDailyNote');
  if (!n || typeof rtsArmyTitle !== 'function') return;
  var d = rtsDailySpec(rtsDailyDate()), best = null;
  try { best = JSON.parse(window.localStorage.getItem(RTS_DAILY_LS + d.date) || 'null'); } catch (e) {}
  n.textContent = 'Today, the same map for everyone: the ' + rtsArmyTitle(d.army) + ', on ' + RTS_DIFF[d.diff].name + '.'
    + (best ? ' Your best: ' + (best.won ? 'victory in ' : 'held out ') + rtsDailyClock(best.secs) + '.' : '');
}
