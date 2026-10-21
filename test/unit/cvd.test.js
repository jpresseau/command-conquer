/* COLOURS FOR A COLOUR-BLIND EYE (ui/cvd.js), headless:

     EVERY SEAT    the palette covers exactly the seats there are (RTS_SIDES), on every table
     APART         each surface a seat is known by - the team trim, the roof, the radar dot -
                   is held apart from every other seat's by at least RTS_CVD_DE in CIELAB, under
                   normal sight and simulated protanopia, deuteranopia and tritanopia (Machado,
                   Oliveira and Fernandes 2009, full severity); and the standard palette is not -
                   the measure would have caught what the option fixes
     BACK          turned off, every table is the standard one again, value for value, and each
                   turn drops the mesh cache so the models rebuild in the new colours */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('cvd');
var g = loadFast(['src/rules', 'src/sprites/bake.js', 'src/render3d/ring3d.js', 'src/ui/hud.js', 'src/ui/cvd.js']);
var RTS_CVD_DE = 15;
var SIM = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
};
function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
function lab(c, M) {
  var l = c.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  var s = M.map(function (r) { return Math.max(0, Math.min(1, r[0] * l[0] + r[1] * l[1] + r[2] * l[2])); });
  var X = (0.4124 * s[0] + 0.3576 * s[1] + 0.1805 * s[2]) / 0.95047, Y = 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2], Z = (0.0193 * s[0] + 0.1192 * s[1] + 0.9505 * s[2]) / 1.08883;
  function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
var SURF = { trim: function (s) { return g.RTS_PAL.team[s][1]; }, roof: function (s) { return g.RTS_PAL.bld[s].roof; }, radar: function (s) { return g.RTS_MINI_COL[s]; } };
var seats = Object.keys(g.RTS_SIDES);
/* the closest two seats on any surface under any sight, as the tables stand */
function closest() {
  var worst = { d: 1e9 };
  Object.keys(SURF).forEach(function (t) { Object.keys(SIM).forEach(function (k) {
    for (var i = 0; i < seats.length; i++) for (var j = i + 1; j < seats.length; j++) {
      var a = lab(rgb(SURF[t](seats[i])), SIM[k]), b = lab(rgb(SURF[t](seats[j])), SIM[k]), d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d < worst.d) worst = { d: +d.toFixed(1), surface: t, sight: k, pair: seats[i] + '/' + seats[j] };
    }
  }); });
  return worst;
}
function snap() { return JSON.stringify([g.RTS_PAL.team, g.RTS_PAL.bld, g.RTS_MINI_COL, g.RTS_SIDES, g.R3D_RING_COL]); }

S.ok('EVERY SEAT: the colour-blind palette covers exactly the seats there are, on every table',
     seats.length === 5 && ['team', 'roof', 'mini', 'side', 'ring'].every(function (t) { return Object.keys(g.RTS_CVD[t]).sort().join() === seats.slice().sort().join(); }), seats.join());
var std = snap(), off = closest();
g.window._R3D = { mesh: { 'unit:tank:enemy::0:0': 1 } };
var changed = g._rtsCvdApply(true), on = closest();
S.ok('APART: in the colour-blind palette no two seats come closer than ' + RTS_CVD_DE + ' on any surface, under any of the three colour blindnesses or normal sight',
     on.d >= RTS_CVD_DE && g.RTS_PAL.team.enemy[1] === g.RTS_CVD.team.enemy[1], JSON.stringify(on));
S.ok('...and the standard palette is not: two of its seats are nearly one colour to a colour-blind eye', off.d < RTS_CVD_DE / 2 && off.sight !== 'normal', JSON.stringify(off));
S.ok('...the player\'s own blue stays the blue it was', g.RTS_PAL.team.player.join() === JSON.parse(std)[0].player.join() && g.RTS_PAL.bld.player.roof === JSON.parse(std)[1].player.roof);
S.ok('...and the turn dropped the mesh cache, so every model rebuilds in the new colours', changed && Object.keys(g.window._R3D.mesh).length === 0);
g.window._R3D.mesh = { x: 1 };
var again = g._rtsCvdApply(true);
S.ok('...a turn to what is already showing changes nothing and keeps the cache', !again && g.window._R3D.mesh.x === 1);
g._rtsCvdApply(false);
S.ok('BACK: turned off, every table is the standard one again, value for value', snap() === std && Object.keys(g.window._R3D.mesh).length === 0);

require('../lib/report.js')(S);
