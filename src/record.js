/* record.js - THE DEBRIEF, and THE RECORD: what a plain battle's end card says beyond who won, and
   what the title keeps of it.

   The end card said VICTORY and two numbers. Now it says how long the battle took, what the ore
   paid, what was built and lost, and what was destroyed (core/capture.js, production.js and
   harvest.js count them into G.stats), and the title's START BATTLE carries the player's record at
   the difficulty it is set to - wins, losses, the fastest win - kept in localStorage by difficulty
   (RTS_RECORD_LS). A daily and a mission have records of their own (daily.js, campaign.js) and are
   not counted here; they get the debrief all the same. */

var RTS_RECORD_LS = 'bw.record';          /* {<diff>: {w, l, best}} */

function rtsRecordGet() {
  try { return JSON.parse(window.localStorage.getItem(RTS_RECORD_LS) || '{}') || {}; } catch (e) { return {}; }
}
/* A plain battle's end, counted once (the end card is built once): its difficulty's wins or
   losses, and the fastest win. Null for a daily or a mission, or a battle not over. */
function rtsRecordAdd(G) {
  if (!G || !G.over || G.mission || window._RTS_DAILY) return null;
  var all = rtsRecordGet(), r = all[G.diff] || (all[G.diff] = { w: 0, l: 0, best: 0 });
  if (G.over === 'win') { r.w++; if (!r.best || G.t < r.best) r.best = Math.round(G.t); } else r.l++;
  try { window.localStorage.setItem(RTS_RECORD_LS, JSON.stringify(all)); } catch (e) {}
  return r;
}
function rtsRecordLine(r, diff) {
  if (!r || (!r.w && !r.l)) return '';
  var name = RTS_DIFF[diff] ? RTS_DIFF[diff].name : diff;
  return name + ': ' + r.w + (r.w === 1 ? ' win' : ' wins') + ', ' + r.l + (r.l === 1 ? ' loss' : ' losses') + (r.best ? ' · fastest ' + rtsDailyClock(r.best) : '');
}
/* the title's START BATTLE: the record at the difficulty it is set to */
function rtsRecordNote() {
  var n = document.getElementById('rtsRecordNote');
  if (!n) return;
  n.textContent = rtsRecordLine(rtsRecordGet()[window._RTS_DIFF], window._RTS_DIFF);
}
/* the end card's rows, for any battle; `rec` the record line when this one counted */
function rtsDebriefHTML(G, rec) {
  var s = G.stats || {}, rows = [
    ['Time', rtsDailyClock(G.t)], ['Credits mined', String(Math.round(s.mined || 0))],
    ['Units built · lost', (s.built || 0) + ' · ' + (s.lostU || 0)],
    ['Enemy units destroyed', String(s.killed || 0)],
    ['Buildings destroyed · lost', (s.killedB || 0) + ' · ' + (s.lostB || 0)]];
  return '<table class="debrief">' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</table>'
    + (rec ? '<p class="s rec">' + rtsRecordLine(rec, G.diff) + '</p>' : '');
}
