/* PAUSE AND SPEED, the pure half (ui/pause.js):

     TICKS      1x runs one tick a frame, 2x two, 1.5x three every two frames - exactly, over many
                frames, so no fraction is lost or invented
     PAUSED     a paused frame runs none, and nothing piles up: the first frame after a pause is
                one frame's worth, not the pause's
     THE KNOB   the speed is one of the three; anything else is refused and leaves it; it is kept
                in localStorage and read back; a stored value that is not one of them reads as 1x */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('pause');
var g = loadFast(['src/ui/pause.js']);

function frames(U, speed, n) { var t = 0; for (var i = 0; i < n; i++) t += g._rtsSpeedTicks(U, speed); return t; }
S.eq('TICKS: 1x runs one tick a frame', frames({}, 1, 20), 20);
S.eq('...2x two', frames({}, 2, 20), 40);
S.eq('...1.5x three every two frames, exactly, over 21 frames', frames({}, 1.5, 21), 31);
var seq = [], U = {};
for (var i = 0; i < 6; i++) seq.push(g._rtsSpeedTicks(U, 1.5));
S.eq('...as 1,2,1,2,1,2 - never a frame of none, never three', seq.join(''), '121212');

var P = { paused: true };
S.eq('PAUSED: a paused frame runs no tick', frames(P, 2, 30), 0);
P.paused = false;
S.eq('...and nothing piled up: the first frame after is one frame\'s worth', g._rtsSpeedTicks(P, 2), 2);

S.eq('THE KNOB: the default is 1x', g.rtsSpeedGet(), 1);
S.ok('...1.5x is taken and kept', g.rtsSpeedSet(1.5) === true && g.rtsSpeedGet() === 1.5 && g.localStorage.getItem('bw.speed') === '1.5', g.localStorage.getItem('bw.speed'));
S.ok('...3x is refused and changes nothing', g.rtsSpeedSet(3) === false && g.rtsSpeedGet() === 1.5, String(g.rtsSpeedGet()));
g.window._RTS_SPEED = 0; g.localStorage.setItem('bw.speed', '7');
S.eq('...and a stored value that is not one of the three reads as 1x', g.rtsSpeedGet(), 1);

require('../lib/report.js')(S);
