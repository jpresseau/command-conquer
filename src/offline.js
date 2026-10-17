/* offline.js - the title screen says when the game is the copy saved on this device.

   sw.js serves the last build that loaded when there is no network (network first, an offline
   copy behind it). That build may not be the latest, and nothing else on the screen says so, so
   while the device is offline a line under the menu names the build being played and when it will
   update. It follows the browser's own online/offline events, so it comes and goes as the signal
   does. */
function rtsOfflineNote() {
  var n = document.getElementById('rtsOffline');
  if (!n) return;
  var off = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (n.hidden === off) n.hidden = !off;
  if (!off) return;
  var b = document.getElementById('rtsBuild'), build = b ? b.textContent.trim() : '';
  n.textContent = 'Offline: playing the copy saved on this device' + (build ? ' (build ' + build + ')' : '')
    + '. It updates the next time you open it with a connection.';
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('online', rtsOfflineNote);
  window.addEventListener('offline', rtsOfflineNote);
}
