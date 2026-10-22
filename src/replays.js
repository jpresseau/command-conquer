/* replays.js - THE REPLAYS ON THE TITLE: the last battle's, the ones kept, and files. Recording and
   playing are replay.js and core/replay.js.

   REPLAYS opens a list: the last battle, with WATCH, KEEP and SAVE FILE, and up to RTS_REPLAYS_MAX
   kept ones (bw.replays), each with WATCH, SAVE FILE and a ✕. A kept replay is a copy, so the next
   battle's recording does not replace it. SAVE FILE downloads the recording as JSON, and OPEN A FILE
   plays one - someone else's battle, say. A file is untrusted: it is read only up to
   RTS_REPLAY_FILE_MAX, checked whole by core/replay.js _rtsReplayValid before anything of it is
   used, a replay never calls anything but a recorded command, and what it says reaches the page
   escaped (replay.js _rtsReplayEsc). A file's battle is played, not kept, until ★ KEEP on its
   card says so. */
var RTS_REPLAYS_LS = 'bw.replays';
var RTS_REPLAYS_MAX = 6;
var RTS_REPLAY_FILE_MAX = 4 * 1024 * 1024;

function rtsReplaysGet() {
  var all = [];
  try { all = JSON.parse(window.localStorage.getItem(RTS_REPLAYS_LS) || '[]'); } catch (e) {}
  /* the id goes into an onclick, where an escaped quote is a quote again: a short word, or it is not ours */
  return Array.isArray(all) ? all.filter(function (k) { return k && typeof k.id === 'string' && /^[a-z0-9]{1,20}$/.test(k.id) && k.rec && !_rtsReplayValid(k.rec); }) : [];
}
/* the same battle: one recording kept twice is one */
function _rtsReplaySame(a, b) { return !!(a && b && a.dts === b.dts && a.head.seed === b.head.seed && a.end && b.end && a.end.hash === b.end.hash); }
function rtsReplayKept(rec) { return rtsReplaysGet().some(function (k) { return _rtsReplaySame(k.rec, rec); }); }
/* ★ KEEP: a copy in the list, or why not */
function rtsReplayStore(rec, btn) {
  var all = rtsReplaysGet(), why = '';
  if (!rec || _rtsReplayValid(rec)) why = 'Nothing to keep.';
  else if (all.some(function (k) { return _rtsReplaySame(k.rec, rec); })) why = 'Already kept.';
  else if (all.length >= RTS_REPLAYS_MAX) why = RTS_REPLAYS_MAX + ' are kept - delete one first.';
  else {
    all.push({ id: (Date.now()).toString(36) + Math.floor(Math.random() * 1296).toString(36), at: Date.now(), rec: rec });
    try { window.localStorage.setItem(RTS_REPLAYS_LS, JSON.stringify(all)); }
    catch (e) { why = 'Storage is full - delete a kept replay first.'; }
  }
  if (btn) { btn.disabled = !why || why === 'Already kept.'; btn.textContent = why ? why : '★ Kept'; }
  if (document.getElementById('rtsReplays') && !document.getElementById('rtsReplays').hidden) rtsReplaysList();
  rtsReplayNote();
  return !why;
}
function rtsReplayForget(id) {
  var all = rtsReplaysGet().filter(function (k) { return k.id !== id; });
  try { window.localStorage.setItem(RTS_REPLAYS_LS, JSON.stringify(all)); } catch (e) {}
  rtsReplaysList(); rtsReplayNote();
}
function _rtsReplayById(id) {
  if (id === 'last') return rtsReplayGet();
  var k = rtsReplaysGet().filter(function (x) { return x.id === id; })[0];
  return k ? k.rec : null;
}
/* SAVE FILE: the recording as a .json download */
function rtsReplayDownload(id) {
  var r = _rtsReplayById(id);
  if (!r) return false;
  var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
  var name = 'breachwater-replay-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(r)], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  return name;
}
/* OPEN A FILE: read, checked, played - or why not, on the list */
function rtsReplayOpenFile(input) {
  var f = input && input.files && input.files[0], note = document.getElementById('rtsReplaysNote');
  function say(t) { if (note) { note.hidden = false; note.textContent = t; } }
  if (!f) return;
  if (f.size > RTS_REPLAY_FILE_MAX) { say('That file is too big to be a replay.'); input.value = ''; return; }
  var rd = new FileReader();
  rd.onload = function () {
    var r = null, why;
    try { r = JSON.parse(String(rd.result)); } catch (e) {}
    why = r ? _rtsReplayValid(r) : 'not a Breachwater replay';
    input.value = '';
    if (why) { say('Cannot play that file: ' + why + '.'); return; }
    rtsReplayWatch(null, r);
  };
  rd.onerror = function () { say('That file could not be read.'); input.value = ''; };
  rd.readAsText(f);
}

/* the title's REPLAYS button and its line */
function rtsReplayNote() {
  var b = document.getElementById('rtsReplay'), n = document.getElementById('rtsReplayNote'), r = rtsReplayGet(), k = rtsReplaysGet().length;
  if (!b) return;
  b.disabled = false;
  if (n) n.textContent = r ? 'last: ' + rtsReplayLine(r) + (k ? ' · ' + k + ' kept' : '') : k ? k + ' kept' : 'watch, keep and share your battles';
  var box = document.getElementById('rtsReplays');
  if (box && !box.hidden) rtsReplaysList();          /* left open: back on the title it shows what is there now */
}
function rtsReplaysToggle() {
  var box = document.getElementById('rtsReplays');
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  rtsReplaysList();
  box.hidden = false;
}
/* the list: the last battle's, then each kept one, then the file */
function rtsReplaysList() {
  var box = document.getElementById('rtsReplays');
  if (!box) return;
  var last = rtsReplayGet(), kept = rtsReplaysGet(), h = '';
  function row(id, title, r, extra) {
    return '<div class="rp-row" data-id="' + _rtsReplayEsc(id) + '"><p><b>' + title + '</b><span>' + _rtsReplayEsc(rtsReplayLine(r)) + '</span></p>'
      + '<button type="button" class="go" onclick="rtsReplayWatch(this, _rtsReplayById(\'' + _rtsReplayEsc(id) + '\'))">▶ WATCH</button>'
      + '<button type="button" class="save" onclick="rtsReplayDownload(\'' + _rtsReplayEsc(id) + '\')">⬇ FILE</button>' + extra + '</div>';
  }
  if (last) h += row('last', 'Last battle', last, rtsReplayKept(last) ? '' : '<button type="button" class="keep" onclick="rtsReplayStore(rtsReplayGet(), this)">★ KEEP</button>');
  kept.forEach(function (k, i) {
    h += row(k.id, 'Kept ' + (i + 1), k.rec, '<button type="button" class="del" title="Delete this replay" onclick="rtsReplayForget(\'' + _rtsReplayEsc(k.id) + '\')">✕</button>');
  });
  if (!last && !kept.length) h += '<p class="none">No replay yet: every battle you start is recorded.</p>';
  h += '<label class="rp-file"><input type="file" id="rtsReplayFile" accept=".json,application/json" onchange="rtsReplayOpenFile(this)">📂 OPEN A REPLAY FILE</label>'
    + '<p class="diffnote" id="rtsReplaysNote" hidden></p>';
  box.innerHTML = h;
}
