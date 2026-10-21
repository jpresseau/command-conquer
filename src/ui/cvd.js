/* ui/cvd.js - COLOURS FOR A COLOUR-BLIND EYE. The seats are told apart by colour alone: the
   player blue, an ally green, the foes red, amber and violet - and green, red and amber are the
   three a red-green colour-blind player (about one man in twelve) sees as one olive. The title's
   COLOUR-BLIND button swaps the seats to Okabe and Ito's colour-blind-safe set: friends cool,
   foes warm, and every seat a different lightness, so even an eye with no hue at all can sort
   them - the player blue, an ally sky blue, the foes vermilion, yellow and reddish purple.

   IN PLACE, NOT A SECOND LOOK-UP. Every reader already takes its colour from these tables when
   it draws or builds - the models (sprites/models.js, unitmodels.js, render3d/soldier3d.js) from
   RTS_PAL, the radar from RTS_MINI_COL, the hidden-unit silhouettes from RTS_SIDES, the rings
   from R3D_RING_COL - so the option rewrites their entries and drops the mesh cache, as a quality
   change does (ui/gfxstat.js), and the models rebuild on sight. The standard entries are copied
   the first time, so turning it off puts back exactly what was there. */

var RTS_CVD_LS = 'bw.cvd';
var RTS_CVD = {
  /* the four tones a team surface is shaded in (sprites/bake.js RTS_PAL.team) */
  team: {
    player: ['#2f5fa8', '#3f7fd0', '#1e3f74', '#69a9ee'],             /* the player's blue stays */
    ally:   ['#3a92c8', '#56b4e9', '#235f85', '#9ad6f6'],
    enemy:  ['#a84800', '#d55e00', '#6c2e00', '#f08c48'],
    enemy2: ['#b8aa24', '#e6d83c', '#7a6e10', '#f6ee8a'],
    enemy3: ['#a0547e', '#cc79a7', '#683250', '#e4b0cf']
  },
  /* a building's roof and its shadow (RTS_PAL.bld) - the roof is most of what the camera sees */
  roof: { player: ['#3f6ea8', '#2b3d52'], ally: ['#6cbce6', '#1c3f57'], enemy: ['#c85a10', '#4a2408'],
          enemy2: ['#d4c430', '#4a4210'], enemy3: ['#c27aa8', '#46203a'] },
  mini: { player: '#5ea8ff', ally: '#a8deff', enemy: '#ff8a2a', enemy2: '#ffec4a', enemy3: '#ea96c8' },
  side: { player: [0x4a8ff0, 0xa8d4ff], ally: [0x56b4e9, 0xc8eafc], enemy: [0xe06a10, 0xffc090],
          enemy2: [0xf0e040, 0xfff4a8], enemy3: [0xd080b0, 0xf4cce4] },
  /* the player's own selection was green against the foes' red: blue-white against orange */
  ring: { player: [0.55, 0.82, 1.0], ally: [0.75, 0.92, 1.0], enemy: [1.0, 0.55, 0.12],
          enemy2: [1.0, 0.92, 0.3], enemy3: [0.9, 0.55, 0.78] }
};
var _rtsCvdStd = null;

function _rtsCvdOn() { try { return window.localStorage.getItem(RTS_CVD_LS) === '1'; } catch (e) { return false; } }

/* every table to one palette or the other; true if anything changed */
function _rtsCvdApply(on) {
  if (!_rtsCvdStd) {
    _rtsCvdStd = { team: {}, roof: {}, mini: {}, side: {}, ring: {} };
    for (var s in RTS_CVD.team) {
      _rtsCvdStd.team[s] = RTS_PAL.team[s].slice();
      _rtsCvdStd.roof[s] = [RTS_PAL.bld[s].roof, RTS_PAL.bld[s].dark];
      _rtsCvdStd.mini[s] = RTS_MINI_COL[s];
      _rtsCvdStd.side[s] = [RTS_SIDES[s].color, RTS_SIDES[s].glow];
      _rtsCvdStd.ring[s] = R3D_RING_COL[s].slice();
    }
  }
  var P = on ? RTS_CVD : _rtsCvdStd, was = RTS_MINI_COL.ally;
  for (var k in P.team) {
    for (var i = 0; i < 4; i++) RTS_PAL.team[k][i] = P.team[k][i];
    RTS_PAL.bld[k].roof = P.roof[k][0]; RTS_PAL.bld[k].dark = P.roof[k][1];
    RTS_MINI_COL[k] = P.mini[k];
    RTS_SIDES[k].color = P.side[k][0]; RTS_SIDES[k].glow = P.side[k][1];
    for (i = 0; i < 3; i++) R3D_RING_COL[k][i] = P.ring[k][i];
  }
  if (was === RTS_MINI_COL.ally) return false;
  if (window._R3D) window._R3D.mesh = {};
  /* Nothing else holds a colour past a battle: the 2D sheet the radar's building icons come from
     is baked as a battle opens and dropped as it closes (render/camera.js, icons.js), so out of
     one - on the title, where the option is offered - there is none to go stale. Baked again
     under a battle, every seat's sheet cost 11 s on the test machine. */
  return true;
}

/* the title's button, beside the sky's: COLOUR-BLIND: OFF / ON */
function rtsCvdToggle() {
  var on = !_rtsCvdOn();
  try { if (on) window.localStorage.setItem(RTS_CVD_LS, '1'); else window.localStorage.removeItem(RTS_CVD_LS); } catch (e) {}
  _rtsCvdApply(on);
  rtsCvdSync();
}
function rtsCvdSync() {
  var wrap = document.getElementById('rtsCvd');
  if (!wrap) return;
  if (!wrap.firstChild) wrap.innerHTML = '<button type="button" onclick="rtsCvdToggle()"></button>';
  var on = _rtsCvdOn();
  wrap.firstChild.textContent = 'COLOUR-BLIND: ' + (on ? 'ON' : 'OFF');
  wrap.firstChild.title = on ? 'Friends blue, foes orange, yellow and pink - tap for the standard colours'
                             : 'Blue, green, red, amber and violet - tap for colours a colour-blind eye can tell apart';
  wrap.firstChild.setAttribute('aria-pressed', on ? 'true' : 'false');
}
/* at boot, before anything is drawn - where the tables are: a headless spec that loads src/ui
   without the sprites (test/lib/sandbox.js) has none to colour */
if (typeof RTS_PAL !== 'undefined' && typeof R3D_RING_COL !== 'undefined' && typeof RTS_MINI_COL !== 'undefined') _rtsCvdApply(_rtsCvdOn());
