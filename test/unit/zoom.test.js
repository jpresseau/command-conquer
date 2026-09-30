/* The zoom ladder — src/render/camera.js.

   Zoom is not a free number. The art is 24 pixels per cell, so a screen cell of anything but
   24, its double or its half resamples every sprite by a fraction and the whole picture goes
   soft. That is why there is a ladder at all, and why it is chosen per device pixel ratio.

   IN 3D THAT CONSTRAINT DOES NOT BIND, which is what RTS_ZOOM_3D_EXTRA is for. The things you
   would zoom in to look at are not sprites there - a unit is geometry, with rounded edges and
   wheels that turn on their axles - and none of that survives being drawn at 48 pixels a cell.
   The models were made denser and there was no way to see it.

   What the ground does is the honest cost, and it is not new: the terrain is a texture in both
   modes, so it magnifies. render/detail.js is the pass that restores what magnification loses,
   and these rungs are inside what it was built for. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('zoom');
var g = load(['src/rules', 'src/r3d', 'src/sprites', 'src/render', 'src/ui/navigate.js']);

/* ------------------------------------------------------------- the 2D ladder ----*/
(function () {
  var dprs = Object.keys(g.RTS_ZOOM_LADDERS);
  S.ok('there is a ladder for every device pixel ratio the game will pick', dprs.length >= 4,
       'dpr ' + dprs.join(', '));

  /* RTS_ZOOM_2D_STEPS is a claim about these tables and several specs now pin themselves to
     it, so it is checked against them rather than trusted. */
  var wrong = dprs.filter(function (d) {
    return g.RTS_ZOOM_LADDERS[d].length !== g.RTS_ZOOM_2D_STEPS;
  });
  S.eq('every one of them has RTS_ZOOM_2D_STEPS rungs', wrong.join(',') || 'none', 'none');

  dprs.forEach(function (d) {
    var lad = g._rtsZoomLadder(+d, false);
    S.eq('dpr ' + d + ' in 2D is the shipped ladder, untouched',
         lad.join(','), g.RTS_ZOOM_LADDERS[d].join(','));
  });
})();

/* ------------------------------------------------------------- the 3D ladder ----*/
(function () {
  Object.keys(g.RTS_ZOOM_LADDERS).forEach(function (d) {
    var flat = g._rtsZoomLadder(+d, false), deep = g._rtsZoomLadder(+d, true);
    S.eq('dpr ' + d + ' in 3D keeps every 2D rung and adds to them',
         deep.slice(0, flat.length).join(','), flat.join(','));

    /* WHOLE MULTIPLES OF THE TOP 2D RUNG. The ladder exists so that a screen cell is a clean
       ratio of the art; the extra rungs are further in than the sprites can follow, but the
       TERRAIN is still a texture and still wants a clean factor to magnify by. */
    var top = flat[flat.length - 1], extra = deep.slice(flat.length);
    S.eq('...' + extra.length + ' of them, each a whole multiple of the closest 2D rung',
         extra.map(function (v) { return v / top; }).join(','),
         g.RTS_ZOOM_3D_EXTRA.join(','));
    var ints = extra.every(function (v) { return v % top === 0; });
    S.ok('...so the terrain magnifies by a whole number at every rung', ints,
         flat.join('/') + ' then ' + extra.join('/'));
  });

  var d2 = g._rtsZoomLadder(2, true);
  S.ok('the closest 3D rung is several times closer than 2D can reach',
       d2[d2.length - 1] >= g._rtsZoomLadder(2, false).slice(-1)[0] * 3,   /* not pop(): 2D hands back the table itself */
       d2.join(', ') + ' css px per cell - a unit is about a cell and a half across');

  /* strictly increasing, or the pinch and the wheel would step sideways */
  var bad = 0;
  for (var i = 1; i < d2.length; i++) if (d2[i] <= d2[i - 1]) bad++;
  S.eq('the rungs only ever go one way', bad, 0);
})();

/* ---------------------------------------------- between the rungs, in 3D (ui/navigate.js) ----*/
(function () {
  var was = g.RTS_ZOOMS;
  g.RTS_ZOOMS = g._rtsZoomLadder(2, true);
  var L = g.RTS_ZOOMS, off = [], i;
  for (i = 0; i < L.length; i++) if (Math.abs(g._rtsCellAt(i) - L[i]) > 1e-9) off.push(i);
  S.eq('on a whole index the smooth zoom is exactly the rung', off.join(',') || 'none', 'none');
  var mid = g._rtsCellAt(1.5);
  S.ok('half way between two rungs is their geometric mean, the same ratio either side',
       Math.abs(mid - Math.sqrt(L[1] * L[2])) < 1e-9, mid.toFixed(3) + ' between ' + L[1] + ' and ' + L[2]);
  var down = 0, prev = 0;
  for (var f = 0; f <= L.length - 1; f += 0.05) { var c = g._rtsCellAt(f); if (c <= prev) down++; prev = c; }
  S.eq('...and it only ever goes one way', down, 0);
  S.ok('past either end it holds the end rung', g._rtsCellAt(-1) === L[0] && g._rtsCellAt(L.length + 2) === L[L.length - 1],
       g._rtsCellAt(-1) + ', ' + g._rtsCellAt(L.length + 2));
  g.RTS_ZOOMS = was;

  /* the wheel, in rungs: a mouse notch whichever unit the browser reports it in */
  g.window._R3D = { on: true };
  var px = g._rtsWheelRungs({ deltaY: 100, deltaMode: 0 }), ln = g._rtsWheelRungs({ deltaY: 3, deltaMode: 1 });
  S.ok('in 3D a notch out is RTS_ZOOM_NOTCH of a rung', Math.abs(px + g.RTS_ZOOM_NOTCH) < 1e-9, String(px));
  S.ok('...the same whether it comes as 100 pixels or 3 lines', Math.abs(px - ln) < 0.02, px.toFixed(3) + ' against ' + ln.toFixed(3));
  S.ok('...and a notch in is the same the other way', Math.abs(g._rtsWheelRungs({ deltaY: -100, deltaMode: 0 }) + px) < 1e-9, 'symmetric');
  S.ok('...and a flung wheel cannot jump the ladder in one event', Math.abs(g._rtsWheelRungs({ deltaY: 5000, deltaMode: 0 })) <= 0.75, 'capped');
  var pinch = g._rtsWheelRungs({ deltaY: -8, deltaMode: 0, ctrlKey: true }), scroll = g._rtsWheelRungs({ deltaY: -8, deltaMode: 0 });
  S.ok('a trackpad pinch (ctrlKey) follows the fingers more closely than a scroll of the same size', pinch > scroll * 2 && pinch > 0,
       pinch.toFixed(3) + ' against ' + scroll.toFixed(3));
  var mac = g._rtsWheelRungs({ deltaY: g.RTS_WHEEL_MAC, deltaMode: 0 });
  S.ok('a Mac mouse click (4.000244 px) is a whole notch in 3D, not a seventy-fifth of one',
       Math.abs(mac + g.RTS_ZOOM_NOTCH) < 1e-9, String(mac));
  S.ok('...and so is a Linux wheel\'s 53 px after a pause', Math.abs(g._rtsWheelRungs({ deltaY: -53, deltaMode: 0 }, true) - g.RTS_ZOOM_NOTCH) < 1e-9, 'quiet');
  S.ok('...but inside a stream it is in proportion', Math.abs(g._rtsWheelRungs({ deltaY: -53, deltaMode: 0 }, false) - 0.53 * g.RTS_ZOOM_NOTCH) < 1e-9, 'streaming');
  S.ok('a trackpad\'s first small delta after a pause is not bumped to a notch',
       Math.abs(g._rtsWheelRungs({ deltaY: -8, deltaMode: 0 }, true) - 0.08 * g.RTS_ZOOM_NOTCH) < 1e-9, 'proportional');
  /* Firefox answers deltaY in pixels if it is asked before deltaMode: the order is the contract */
  var asked = [], ff = { ctrlKey: false };
  Object.defineProperty(ff, 'deltaMode', { get: function () { asked.push('mode'); return 1; } });
  Object.defineProperty(ff, 'deltaY', { get: function () { asked.push('y'); return 3; } });
  g._rtsWheelRungs(ff, false);
  S.eq('deltaMode is read before deltaY (Firefox turns lines into pixels otherwise)', asked[0], 'mode');
  S.ok('the same wheel turning on - 53 px again, inside a stream - is a notch each click',
       Math.abs(g._rtsWheelRungs({ deltaY: -53, deltaMode: 0 }, false, 53) - g.RTS_ZOOM_NOTCH) < 1e-9 &&
       Math.abs(g._rtsWheelRungs({ deltaY: -106, deltaMode: 0 }, false, 53) - 2 * g.RTS_ZOOM_NOTCH) < 1e-9, 'x1 and x2');
  S.ok('...while a trackpad delta that is not a multiple of it stays in proportion',
       Math.abs(g._rtsWheelRungs({ deltaY: -61, deltaMode: 0 }, false, 53) - 0.61 * g.RTS_ZOOM_NOTCH) < 1e-9, 'proportional');
  S.ok('Windows at one line a notch (33.3 px) is a notch after a pause', Math.abs(g._rtsWheelRungs({ deltaY: -100 / 3, deltaMode: 0 }, true) - g.RTS_ZOOM_NOTCH) < 1e-9, 'quiet');
  S.ok('with no click size for this gesture, 53 px in a stream is in proportion',
       Math.abs(g._rtsWheelRungs({ deltaY: -53, deltaMode: 0 }, false, 0) - 0.53 * g.RTS_ZOOM_NOTCH) < 1e-9, 'unit 0');
  S.ok('Ctrl held with a Mac mouse click is still a click, not a pinch',
       Math.abs(g._rtsWheelRungs({ deltaY: -g.RTS_WHEEL_MAC, deltaMode: 0, ctrlKey: true }, false) - g.RTS_ZOOM_NOTCH) < 1e-9, 'mac + ctrl');
  S.ok('...and so is a 53 px click after a pause', Math.abs(g._rtsWheelRungs({ deltaY: -53, deltaMode: 0, ctrlKey: true }, true) - g.RTS_ZOOM_NOTCH) < 1e-9, 'quiet + ctrl');
  S.ok('...while a pinch\'s small stream follows the fingers', Math.abs(g._rtsWheelRungs({ deltaY: -8, deltaMode: 0, ctrlKey: true }, false) - 0.096) < 1e-9, 'pinch');
  g.window._R3D = { on: false };
  S.eq('in 2D a notch is a whole rung', g._rtsWheelRungs({ deltaY: 100, deltaMode: 0 }), -1);
  S.eq('...and so is a Mac mouse click', g._rtsWheelRungs({ deltaY: -g.RTS_WHEEL_MAC * 2, deltaMode: 0 }), 1);
  S.eq('...and a slower wheel\'s smaller notch after a pause', g._rtsWheelRungs({ deltaY: -53, deltaMode: 0 }, true), 1);
  S.eq('...while a trackpad\'s small delta is a fraction, to add up', g._rtsWheelRungs({ deltaY: -25, deltaMode: 0 }), 0.25);
  S.eq('...and a brisk trackpad swipe is in proportion, not a rung an event', g._rtsWheelRungs({ deltaY: -60, deltaMode: 0 }, false), 0.6);
  S.eq('no movement is no zoom', g._rtsWheelRungs({ deltaY: 0, deltaMode: 0 }), 0);
})();

/* ------------------------------------------------------------- + and - (ui/navigate.js) ----*/
(function () {
  function K(key, code, o) { return Object.assign({ key: key, code: code, repeat: false, preventDefault: function () {} }, o || {}); }
  S.eq('+ zooms in', g._rtsZoomKey(K('+', 'Equal')), 'zoom+');
  S.eq('...and so does = , the same key unshifted', g._rtsZoomKey(K('=', 'Equal')), 'zoom+');
  S.eq('- zooms out', g._rtsZoomKey(K('-', 'Minus')), 'zoom-');
  S.eq('on a Belgian board, where the key US calls Equal types -, it zooms OUT', g._rtsZoomKey(K('-', 'Equal')), 'zoom-');
  S.eq('the number pad by place', g._rtsZoomKey(K('Unidentified', 'NumpadAdd')), 'zoom+');
  S.eq('an AZERTY 8 (_) is not a zoom key', g._rtsZoomKey(K('_', 'Digit8')), null);

  /* the press and release bookkeeping, with the zoom itself stubbed */
  var calls = [];
  g._rtsR = { W: 100, H: 100 };
  g.window._R3D = { on: true };
  var real = g._rtsZoomToward;
  g._rtsZoomToward = function (d) { calls.push(d); };
  var U = { keys: {} };
  /* JIS: Shift+Minus types '='; Shift let go while held, the repeats type '-' */
  var claimed = g._rtsZoomKeyDown(K('=', 'Minus'), U);
  S.ok('a zoom press is claimed and held', claimed === true && U.keys['zoom+'] === true && calls.length === 1, JSON.stringify(U.keys));
  S.ok('...and a repeat of it is claimed too, whatever it now types', g._rtsZoomKeyDown(K('-', 'Minus', { repeat: true }), U) === true, 'claimed');
  g._rtsZoomKeyDown(K('-', 'Minus', { repeat: true }), U);
  S.ok('a repeat keeps the zoom its press started, and is no second notch',
       calls.length === 1 && U.keys['zoom+'] && !U.keys['zoom-'], JSON.stringify({ calls: calls, keys: U.keys }));
  g._rtsZoomKeyUp(K('-', 'Minus'), U);
  S.ok('...and its release lets that zoom go', !U.keys['zoom+'] && !U.keys['zoom-'], JSON.stringify(U.keys));
  calls.length = 0;
  g._rtsZoomKeyDown(K('+', 'Digit1', { shiftKey: true }), U);
  S.ok('a Swiss Shift+1 holds +', U.keys['zoom+'] === true && calls.length === 1, JSON.stringify(U.keys));
  g._rtsZoomKeyUp(K('1', 'Digit1'), U);
  S.ok('a Swiss Shift+1 let go as 1 lets + go', !U.keys['zoom+'], JSON.stringify(U.keys));
  S.eq('a key that is no zoom key is not claimed', g._rtsZoomKeyDown(K('1', 'Digit1'), U), false);
  g._rtsZoomKeyDown(K('=', 'Equal'), U); g._rtsZoomKeyDown(K('+', 'NumpadAdd'), U);
  g._rtsZoomKeyUp(K('=', 'Equal'), U);
  S.ok('two keys holding + : letting one go leaves it held', U.keys['zoom+'] === true, JSON.stringify(U.keys));
  g._rtsZoomKeyUp(K('+', 'NumpadAdd'), U);
  S.ok('...and the second lets it go', !U.keys['zoom+'], JSON.stringify(U.keys));
  g._rtsZoomToward = real;
})();

require('../lib/report.js')(S);
