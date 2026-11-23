/* ui/cameofill.js - a build tile's picture, made after the tile is drawn. Part of rts.ui. */

/* THE CAMEOS, AFTER THE BATTLE IS UP. A cameo is a software bake (render/icons.js) - a tenth of a
   second each here, several times that on a phone - and a tab's dozen of them were made inside
   the open, which the player waited through on a frozen screen. A tile is drawn without its
   picture, and the pictures are made one a task, in the order the tiles stand, each put into its
   tile if the tile is still on the list. _rtsIconsNow makes them all at once (the specs). */
function _rtsIconMade(icons, key) { var d = Object.getOwnPropertyDescriptor(icons, key); return !!d && !d.get; }
function _rtsIconPut(key) {
  var U = window._rtsUI, b = U && U.btns[key], sp = b && b.querySelector('.ico.noimg');
  if (!sp) return;
  var im = document.createElement('img'); im.className = 'ico'; im.alt = ''; im.src = U.icons[key];
  sp.parentNode.replaceChild(im, sp);
}
function _rtsIconFill() {
  var U = window._rtsUI;
  if (!U || U.iconBusy || !U.iconWant || !U.iconWant.length) return;
  U.iconBusy = true;
  setTimeout(function () {
    var V = window._rtsUI;
    if (V !== U) return;
    U.iconBusy = false;
    var k = U.iconWant.shift();
    if (k) { try { _rtsIconPut(k); } catch (e) {} }
    _rtsIconFill();
  }, 0);
}
function _rtsIconsNow() {
  var U = window._rtsUI;
  while (U && U.iconWant && U.iconWant.length) _rtsIconPut(U.iconWant.shift());
}
