/* update.js - the title says when a newer build is up than the one running.

   sw.js gives the network's copy when it answers, so a player who opens the game gets the deploy
   that is up - but one who keeps it open, or comes back to it from the background, keeps the build
   they loaded, and nothing said a newer one existed: the only ways to find out were the ⟳ button
   and reading the build stamp. build.py writes the stamp to build.txt beside the page; the title
   fetches it (past the HTTP cache) when it opens, when the app comes back to the front, and every
   RTS_UPDATE_EVERY while it is shown, and if it names another build puts up a line with an UPDATE
   NOW button. Only on the title: the line lives inside #rtsHome, so a battle is never interrupted,
   and nothing reloads by itself. */
var RTS_UPDATE_EVERY = 10 * 60 * 1000;
function _rtsBuildHere() { var b = document.getElementById('rtsBuild'); return b ? b.textContent.trim() : ''; }
function rtsUpdateCheck() {
  if (!window.fetch || navigator.onLine === false) return Promise.resolve(null);
  return fetch('build.txt', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : null; }).then(function (t) {
    t = (t || '').trim();
    var here = _rtsBuildHere(), newer = !!(t && here && t !== here && t.length < 80 && !/</.test(t));
    var n = document.getElementById('rtsUpdate');
    if (n) n.hidden = !newer;
    return newer;
  }).catch(function () { return null; });
}
function rtsUpdateNow() {
  if (typeof _rtsReloadNow === 'function') _rtsReloadNow(); else location.reload();
}
function _rtsUpdateBind() {
  if (window._RTS_UPDATE_BOUND) return;
  window._RTS_UPDATE_BOUND = true;
  function onTitle() { var h = document.getElementById('rtsHome'); return h && !h.classList.contains('gone') && document.visibilityState !== 'hidden'; }
  setTimeout(function () { if (onTitle()) rtsUpdateCheck(); }, 3000);
  setInterval(function () { if (onTitle()) rtsUpdateCheck(); }, RTS_UPDATE_EVERY);
  document.addEventListener('visibilitychange', function () { if (onTitle()) rtsUpdateCheck(); });
}
