/* survival.js - SURVIVAL on the title: the button, the battle it lays, the end card and the best
   run. The waves themselves are core/survival.js.

   SURVIVAL is a plain battle on the player's difficulty and army with the opponent's base taken
   away and waves sent instead (rtsSurvivalLay, called by rtsOpen on the battle it has just made).
   The end card says how many waves were held and for how long, and the best at that difficulty
   is kept (bw.survival) and shown under the button. A save resumes it as a survival, since the
   count is on G; Play again lays another. In the battle the objectives panel carries the run
   (rtsSurvivalPanel). */
var RTS_SURV_LS = 'bw.survival';

function rtsSurvivalGet() {
  try { var r = JSON.parse(window.localStorage.getItem(RTS_SURV_LS) || '{}'); return r && typeof r === 'object' ? r : {}; }
  catch (e) { return {}; }
}
/* a run at this difficulty that held more waves - or as many, for longer - is the best */
function rtsSurvivalAdd(G) {
  if (!G || !G.survival || !G.over) return null;
  var all = rtsSurvivalGet(), b = all[G.diff], run = { waves: G.survival.wave, secs: G.survival.secs || Math.round(G.t) };
  var better = !b || run.waves > b.waves || (run.waves === b.waves && run.secs > b.secs);
  if (better) { all[G.diff] = run; try { window.localStorage.setItem(RTS_SURV_LS, JSON.stringify(all)); } catch (e) {} }
  return { run: run, best: better ? run : b, isBest: better };
}
function rtsSurvivalLine(r) { return r ? r.waves + (r.waves === 1 ? ' wave' : ' waves') + ', ' + rtsDailyClock(r.secs) : ''; }
function rtsSurvivalNote() {
  var n = document.getElementById('rtsSurvivalNote');
  if (!n) return;
  var b = rtsSurvivalGet()[window._RTS_DIFF || RTS_DIFF_DEFAULT];
  n.textContent = b ? 'best: ' + rtsSurvivalLine(b) : 'waves until your base falls';
}
function rtsSurvivalStart(btn) {
  if (typeof rtsCampEnd === 'function') rtsCampEnd();
  if (typeof rtsDailyEnd === 'function') rtsDailyEnd();
  window._RTS_SURVIVAL = true;
  rtsStart(btn);
}
/* rtsOpen: the battle it has just made becomes a survival, when that is what was asked */
function rtsSurvivalLay(G) {
  if (!window._RTS_SURVIVAL || !G) return null;
  return _rtsSurvivalSetup(G);
}
function rtsSurvivalEnd() { window._RTS_SURVIVAL = false; }
/* The run as the objectives panel shows it (campaign.js rtsCampHud): the wave held, what is still
   on the field, when the next comes, and what wiping one out pays - the countdown the alert
   alone never gave, so a player could not tell a breather from the last minute before a wave. */
function rtsSurvivalPanel(G) {
  var V = G && G.survival;
  if (!V) return null;
  var foes = G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'unit'; }).length;
  var next = rtsDailyClock(Math.max(0, Math.ceil(V.next))), open = V.open && V.open.length ? V.open[0] : V.wave + 1;
  return { name: 'Survival', pill: V.wave ? 'Wave ' + V.wave + ' · next ' + next : 'First wave in ' + next, goals: [
    { text: V.wave ? 'Wave ' + V.wave + ' - ' + foes + (foes === 1 ? ' enemy' : ' enemies') + ' on the field' : 'The first wave is on its way', done: false },
    { text: 'Wave ' + (V.wave + 1) + ' in ' + next, done: false },
    { text: 'Wipe out wave ' + open + ': +' + _rtsSurvivalBounty(G, open) + ' credits' + (V.paid ? ' (' + V.paid + ' earned)' : ''), done: false } ] };
}
function rtsSurvivalOverHTML(G) {
  var r = rtsSurvivalAdd(G);
  return '<div class="card lose"><h2>OVERRUN</h2>'
    + '<p>' + rtsArmyName('player') + ' command has fallen.</p>'
    + '<p class="medal">Held ' + rtsSurvivalLine(r && r.run) + '</p>'
    + (G.survival.paid ? '<p class="s">Bounties earned: ' + G.survival.paid + ' credits</p>' : '')
    + '<p class="rec">' + (r && r.isBest ? 'Your best at ' + RTS_DIFF[G.diff].name + '.' : 'Best at ' + RTS_DIFF[G.diff].name + ': ' + rtsSurvivalLine(r && r.best)) + '</p>'
    + rtsDebriefHTML(G, null)
    + '<button type="button" onclick="rtsRestart()">Play again</button> '
    + '<button type="button" onclick="rtsClose()">Quit</button></div>';
}
