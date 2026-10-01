/* The 3D soldier - render3d/soldier3d.js.

   A second model of the infantry for the 3D mode alone: rounded, proportioned, walking. The
   sprite model beside it is left exactly as it was. What must not change between the two is
   what the player reads a squad by - its size, its pair of men, its identity colours - and
   what must change is that it walks. Each is checked here against the model builders
   themselves; e2e/soldier checks the picture. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('soldier');
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites', 'src/render3d/forest3d.js',
              'src/render3d/soldier3d.js', 'src/render3d/crawl3d.js']);
var INF = g.RTS_UNITS.filter(function (u) { return u.kind === 'infantry' && u.key !== 'dog'; }).map(function (u) { return u.key; });

function box(faces) {
  var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
  faces.forEach(function (f) {
    f.v.forEach(function (p) {
      b.x0 = Math.min(b.x0, p[0]); b.x1 = Math.max(b.x1, p[0]);
      b.y0 = Math.min(b.y0, p[1]); b.y1 = Math.max(b.y1, p[1]);
      b.z0 = Math.min(b.z0, p[2]); b.z1 = Math.max(b.z1, p[2]);
    });
  });
  return b;
}
function hex(c) { return typeof c === 'string' ? c.toLowerCase() : c; }
/* the colour of the highest face: what the camera looks straight down on */
function crown(faces) {
  var best = null, top = -1e9;
  faces.forEach(function (f) {
    var y = Math.min.apply(null, f.v.map(function (p) { return p[1]; }));
    if (y > top) { top = y; best = f; }
  });
  var c = best.c;
  return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
}

S.ok('there are infantry to model', INF.length >= 6, INF.join(', '));

INF.forEach(function (key) {
  var sold = g._r3dSoldierModel(key, 'player', false, 0), spr = g._sprUnitModel(key, 'player', false, null);
  var a = box(sold), b = box(spr), kit = g.RTS_INF_KIT[key] || g.RTS_INF_KIT.rifle;
  var ha = a.y1 - a.y0, hb = b.y1 - b.y0;
  S.ok(key + ': as tall as the sprite model it stands in for', Math.abs(ha - hb) < hb * 0.2,
       ha.toFixed(2) + ' against ' + hb.toFixed(2));
  var want = hex(kit.top || g.RTS_PAL.team.player[3]);
  S.eq(key + ': the crown the camera sees is the unit\'s marker', crown(sold), want);
  S.ok(key + ': built round, not boxed: more faces than the sprite model', sold.length > spr.length * 1.5,
       sold.length + ' faces against ' + spr.length);
});

var rifle1 = box(g._r3dSoldierModel('rifle', 'player', false, 0)), tanya = box(g._r3dSoldierModel('tanya', 'player', false, 0));
S.ok('a squad is two men and a hero one', (rifle1.x1 - rifle1.x0) > (tanya.x1 - tanya.x0) * 1.5,
     'rifle squad ' + (rifle1.x1 - rifle1.x0).toFixed(1) + ' long, Tanya ' + (tanya.x1 - tanya.x0).toFixed(1));
var sideA = g._r3dSoldierModel('rifle', 'player', false, 0), sideB = g._r3dSoldierModel('rifle', 'enemy', false, 0);
S.ok('the rifleman wears his house\'s colour', crown(sideA) !== crown(sideB), crown(sideA) + ' against ' + crown(sideB));

/* ---- walking ---- */
/* each foot: the lowest point of each leg - one leg either side of the body's centre line -
   as [x, z]. Taken as the SOLE rather than as the boot, because a lifted foot rises clear of
   any fixed height and a height cut would count one foot of a stride and both of a stance */
function soles(key, pose) {
  var f = g._r3dSoldierModel(key, 'player', false, pose), best = { '-1': null, '1': null };
  f.forEach(function (fc) {
    fc.v.forEach(function (p) {
      var k = p[2] < 0 ? '-1' : '1';
      if (!best[k] || p[1] < best[k][1]) best[k] = p;
    });
  });
  return [best['-1'], best['1']];
}
function feet(key, pose) { var f = soles(key, pose); return +Math.abs(f[0][0] - f[1][0]).toFixed(2); }
var spread = [0, 1, 2, 3, 4].map(function (p) { return feet('tanya', p); });
S.ok('striding puts the feet further apart than standing', Math.max(spread[1], spread[3]) > spread[0] * 1.4,
     'boot spread standing ' + spread[0] + ', through the stride ' + spread.slice(1).join(', '));
var s1 = soles('tanya', 1), s3 = soles('tanya', 3);
S.ok('...and in the two halves of the stride the other foot leads', (s1[0][0] - s1[1][0]) * (s3[0][0] - s3[1][0]) < 0,
     'left sole minus right, along the facing: ' + (s1[0][0] - s1[1][0]).toFixed(2) + ' then ' + (s3[0][0] - s3[1][0]).toFixed(2));
S.ok('prone has a model of its own too (crawl3d.js; unit/motion)', !!g._r3dSoldierModel('rifle', 'player', true, 0));
S.eq('...and so is the dog', g._r3dSoldierModel('dog', 'player', false, 0), null);

var walker = { path: [{ x: 1, z: 1 }], gait: 0 }, other = { path: [{ x: 1, z: 1 }], gait: 3 }, seen = {}, apart = 0;
for (var t = 0; t < 2; t += 0.05) {
  var pw = g._r3dSoldierPose(walker, t);
  seen[pw] = 1;
  if (pw !== g._r3dSoldierPose(other, t)) apart++;
}
S.ok('a walking soldier goes through all four stride poses', Object.keys(seen).sort().join('') === '1234',
     'poses seen: ' + Object.keys(seen).sort().join(', '));
S.ok('...and two with different gaits are out of step', apart > 20, apart + ' of 40 moments apart');
S.eq('standing still is pose 0', g._r3dSoldierPose({ path: null, gait: 2 }, 1.3), 0);
S.eq('...and so is lying down', g._r3dSoldierPose({ path: [{ x: 0, z: 0 }], prone: true }, 1.3), 0);

require('../lib/report.js')(S);
