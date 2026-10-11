/* skirmish.js - the SKIRMISH SETUP on the title screen: map size, water and starting credits
   (rules/skirmish.js), kept between visits.

   Only a plain battle reads it. A daily is the same map for everyone and a campaign mission was
   tuned on the default map, so both ask for the default (rtsSkirmishWant answers null for them),
   and a saved battle carries its own setup in G.skirmish. */

var RTS_SKIRMISH_LS = 'bw.skirmish';

function rtsSkirmishGet() {
  var s = null;
  try { s = JSON.parse(window.localStorage.getItem(RTS_SKIRMISH_LS) || 'null'); } catch (e) {}
  return _rtsSkirmishOf(s);
}
function rtsSkirmishSet(k, v) {
  var s = rtsSkirmishGet();
  if (!RTS_SKIRMISH[k] || !RTS_SKIRMISH[k][v]) return;
  s[k] = v;
  try { window.localStorage.setItem(RTS_SKIRMISH_LS, JSON.stringify(s)); } catch (e) {}
  rtsSkirmishSync();
}
/* What rtsOpen builds the battle with: the setup, unless this battle is a daily or a mission. */
function rtsSkirmishWant() {
  if (window._RTS_DAILY || window._RTS_MISSION) return null;
  return rtsSkirmishGet();
}
/* One line for the button: what START BATTLE will make. */
function rtsSkirmishLine(s) {
  return RTS_SKIRMISH.foes[s.foes].name.toLowerCase() + ' · ' + RTS_SKIRMISH.size[s.size].name.toLowerCase() + ' map · ' + RTS_SKIRMISH.water[s.water].name.toLowerCase()
    + ' · ' + RTS_SKIRMISH.money[s.money].name + ' credits';
}
var RTS_SKIRMISH_ROWS = [['foes', 'SIDES'], ['size', 'MAP'], ['water', 'WATER'], ['money', 'CREDITS']];
function rtsSkirmishToggle() {
  var box = document.getElementById('rtsSkirmish');
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  box.innerHTML = RTS_SKIRMISH_ROWS.map(function (r) {
    var opts = RTS_SKIRMISH[r[0]], html = '<p class="lbl">' + r[1] + '</p><div class="diff" data-k="' + r[0] + '">';
    for (var v in opts) html += '<button type="button" data-v="' + v + '" onclick="rtsSkirmishSet(\'' + r[0] + '\',\'' + v + '\')">' + opts[v].name + '</button>';
    return html + '</div>';
  }).join('');
  box.hidden = false;
  rtsSkirmishSync();
}
/* The pills and the button's line, from the stored setup. */
function rtsSkirmishSync() {
  var s = rtsSkirmishGet(), n = document.getElementById('rtsSkirmishNote');
  if (n) n.textContent = rtsSkirmishLine(s);
  var rows = document.querySelectorAll('#rtsSkirmish .diff');
  for (var i = 0; i < rows.length; i++) {
    var k = rows[i].getAttribute('data-k'), bs = rows[i].getElementsByTagName('button');
    for (var j = 0; j < bs.length; j++) bs[j].className = bs[j].getAttribute('data-v') === s[k] ? 'on' : '';
  }
}
