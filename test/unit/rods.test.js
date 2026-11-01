/* A ROD IS ROUND - r3d/primitives.js _r3Rod, from _r3Box.

   Every gun barrel, pipe, aerial, rail and mast in the models was a long box with a square end:
   a barrel drawn as a plank. In the 3D view's richer build (_R3_DETAIL > 1) a box whose two short
   sides are alike and whose long side is at least R3_ROD_LEN times them is a cylinder along that
   side, the same size. The sprites and the plain far-off models build at detail 1 and keep the
   box.

     ROUND       a rod-shaped box at the 3D view's detail is a tube: curved sides with normals of
                 their own, round in section, the box's length - along x, z and upright
     NOT ROUND   a cube, a slab and a plank (two short sides unalike) stay boxes; at the sprite's
                 detail nothing is a tube; nor is anything thinner than R3_ROD_MIN, a wheel's nut
     THE TRACKS  a tank's running gear stays plates and teeth (_R3_ROD_OFF in tracks()): the Heavy
                 tank's rods are its barrels and aerials
     USED        the roster really has rods: barrels, masts and pipes across units and buildings */

var vm = require('vm');
var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('rods');
var g = loadFast(['src/rules', 'src/r3d', 'src/sprites']);

function build(detail, fn) {
  vm.runInContext('_R3_DETAIL = ' + detail, g);
  var o = []; try { fn(o); } finally { vm.runInContext('_R3_DETAIL = 1', g); }
  return o;
}
function curved(faces) { return faces.filter(function (f) { return !!f.n; }); }
function extent(faces, k) {
  var lo = 1e9, hi = -1e9;
  faces.forEach(function (f) { f.v.forEach(function (p) { lo = Math.min(lo, p[k]); hi = Math.max(hi, p[k]); }); });
  return hi - lo;
}

/* along x: a barrel, 12 long and 2 across */
var bx = build(2, function (o) { g._r3Box(o, 0, 0, 0, 12, 2, 2, '#555555', '#666666'); });
var cx = curved(bx);
/* every corner of a tube is at its radius from the axis - which no box, rounded or not, has */
var off = 0;
bx.forEach(function (f) { f.v.forEach(function (p) { off = Math.max(off, Math.abs(Math.hypot(p[1] - 1, p[2]) - 1)); }); });
S.ok('ROUND: a barrel-shaped box is a tube at the 3D view\'s detail - every corner on the radius, sixteen sides or more',
     cx.length >= 16 && off < 1e-6, cx.length + ' curved faces of ' + bx.length + ', furthest corner ' + off.toFixed(4) + ' off the radius');
S.ok('...the box\'s length along x, and round in section: as tall as it is deep',
     Math.abs(extent(bx, 0) - 12) < 1e-6 && Math.abs(extent(bx, 1) - extent(bx, 2)) < 0.05 && extent(bx, 1) > 1.8 && extent(bx, 1) <= 2.0001,
     'length ' + extent(bx, 0).toFixed(2) + ', section ' + extent(bx, 1).toFixed(2) + ' x ' + extent(bx, 2).toFixed(2));
var bz = build(2, function (o) { g._r3Box(o, 0, 0, 0, 1, 1, 6, '#555555'); });
var by = build(2, function (o) { g._r3Box(o, 0, 0, 0, 0.6, 4.5, 0.6, '#555555'); });
S.ok('...and along z, and upright (an aerial)', curved(bz).length >= 16 && Math.abs(extent(bz, 2) - 6) < 1e-6 &&
     curved(by).length >= 16 && Math.abs(extent(by, 1) - 4.5) < 1e-6,
     'z ' + curved(bz).length + ' curved, upright ' + curved(by).length);
var cube = build(2, function (o) { g._r3Box(o, 0, 0, 0, 3, 3, 3, '#555555'); });
/* how far its corners stray from the circle a rod along x would put them on: none for a tube, the
   corner of the square for a box - which its extents cannot say, a cylinder as wide as it is long
   spanning the same 3 on every axis */
var cubeOff = 0;
cube.forEach(function (f) { f.v.forEach(function (p) { cubeOff = Math.max(cubeOff, Math.abs(Math.hypot(p[1] - 1.5, p[2]) - 1.5)); }); });
var plank = build(2, function (o) { g._r3Box(o, 0, 0, 0, 12, 0.5, 3, '#555555'); });
var sprite = build(1, function (o) { g._r3Box(o, 0, 0, 0, 12, 2, 2, '#555555'); });
S.ok('NOT ROUND: a cube and a plank stay boxes, and at the sprite\'s detail a barrel is a box',
     extent(cube, 0) === 3 && cubeOff > 0.2 && Math.abs(extent(plank, 1) - 0.5) < 1e-6 && Math.abs(extent(plank, 2) - 3) < 1e-6 &&
     curved(sprite).length === 0 && sprite.length <= 17,
     'cube ' + extent(cube, 0) + ' wide, its corners ' + cubeOff.toFixed(2) + ' off a tube\'s circle; plank ' + extent(plank, 1).toFixed(2) + ' x ' + extent(plank, 2).toFixed(2) +
     '; sprite barrel ' + sprite.length + ' faces, ' + curved(sprite).length + ' curved');

/* USED: how many boxes in the roster are rods - counted by asking _r3Rod, wrapped */
var rods = 0, keys = {};
vm.runInContext('var __rodN = 0; var __rod0 = _r3Rod; _r3Rod = function () { var r = __rod0.apply(this, arguments); if (r) __rodN++; return r; };', g);
['player'].forEach(function (side) {
  g.RTS_UNITS.forEach(function (u) {
    var before = vm.runInContext('__rodN', g);
    try { build(2, function () { g._sprUnitModel(u.key, side, false, null); }); } catch (e) {}
    if (vm.runInContext('__rodN', g) > before) keys[u.key] = 1;
  });
  g.RTS_STRUCTS.forEach(function (b) {
    var before = vm.runInContext('__rodN', g);
    try { build(2, function () { g._sprBuildingModel(b.key, side); }); } catch (e) {}
    if (vm.runInContext('__rodN', g) > before) keys[b.key] = 1;
  });
});
rods = vm.runInContext('__rodN', g);
S.ok('USED: the roster really has rods - barrels, masts and pipes, in dozens of models', rods > 200 && Object.keys(keys).length > 40 && keys.tank,
     rods + ' rods in ' + Object.keys(keys).length + ' models' + (keys.tank ? ', the Battle Tank among them' : ', not the Battle Tank'));

/* NOT ROUND, the thin: a wheel's nut, rod-shaped but 0.4 across */
var nut = build(2, function (o) { g._r3Box(o, 0, 0, 0, 0.4, 0.4, 3.3, '#555555'); });
var nutOff = 0;
nut.forEach(function (f) { f.v.forEach(function (p) { nutOff = Math.max(nutOff, Math.abs(Math.hypot(p[0], p[1] - 0.2) - 0.2)); }); });
S.ok('...nor anything thinner than R3_ROD_MIN: a wheel\'s nut stays a box', nutOff > 0.03,
     'its corners ' + nutOff.toFixed(3) + ' off a tube\'s circle, ' + nut.length + ' faces');

/* THE TRACKS: the Heavy tank's rods, counted, and what they are */
vm.runInContext('__rodN = 0', g);
var heavyRods = [];
vm.runInContext('var __rodD = []; var __rod1 = _r3Rod; _r3Rod = function (o, x, y, z, w, h, d) { var r = __rod1.apply(this, arguments); if (r) __rodD.push(Math.max(w, h, d)); return r; };', g);
build(2, function () { g._sprUnitModel('heavy', 'player', false, null); });
heavyRods = vm.runInContext('__rodD', g);
S.ok('THE TRACKS: a tank\'s running gear stays plates and teeth - the Heavy\'s rods are its barrels and aerials',
     heavyRods.length > 0 && heavyRods.length <= 8 && heavyRods.every(function (L) { return L >= 4.5; }),
     heavyRods.length + ' rods, ' + heavyRods.map(function (L) { return L.toFixed(1); }).join(' ') + ' long');

require('../lib/report.js')(S);
