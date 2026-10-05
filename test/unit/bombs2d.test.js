/* THE BOMBS UNDER THE SPRITE FALLBACK - render/fx.js _rtsDrawFx. The shaded pass draws the Heavy
   Bomber's bombs itself (render3d/fxemit3d.js); a device that cannot shade (fx2Fail, or
   RTS_FX_SPRITES) falls back to this painter, which once knew G.proj and not G.bombs, so a run
   there showed bursts appearing from nowhere.

     DRAWN      a bomb is a dark dash on the 2D painter's pass, at the height the bomber is drawn
                (RTS_AIR_ALT_K, core/airspace.js), not the raw altitude
     ONCE       when the 3D pass shades the effects it owns the bombs, and this draws none
     UNSEEN     a bomb over the shroud is not drawn */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('bombs2d');
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites', 'src/render']);
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG;
for (var vi = 0; vi < G.vis.length; vi++) { G.vis[vi] = 1; G.mapped[vi] = 1; }

/* a flat 2D camera: focus at the origin, one world unit a pixel */
g._rtsR = g.window._rtsR = { focus: { x: 0, z: 0 }, W: 800, H: 600, cell: 24 };
g._rtsZoom = function () { return 1; };
var rects = [];
var ctx = { fillStyle: '', globalAlpha: 1, fillRect: function (x, y, w, h) { rects.push({ x: x, y: y, w: w, h: h, fill: this.fillStyle }); },
            save: function () {}, restore: function () {}, drawImage: function () {}, beginPath: function () {}, arc: function () {}, fill: function () {} };
function draw(bombs, R3) {
  rects = [];
  g.window._R3D = R3 || { on: false };
  G.proj = []; G.fx = []; G.bombs = bombs;
  g._rtsDrawFx(ctx, G, {}, 1, 24);
  return rects.filter(function (r) { return r.fill === '#2a2a2c'; });
}
var b = { x: 10, z: 20, y: 20, t: 0 }, el = g._rtsElev(10, 20);
var one = draw([b]);
var wantY = g._rtsWorldToScreen(10, el + 20 * g.RTS_AIR_ALT_K, 20).y, rawY = g._rtsWorldToScreen(10, el + 20, 20).y;
S.ok('the population: the sandbox projects a point, and the raw altitude would land somewhere else', isFinite(wantY) && Math.abs(wantY - rawY) > 3, wantY.toFixed(1) + ' against ' + rawY.toFixed(1));
S.ok('a bomb is drawn as a dark dash at the height the bomber is drawn', one.length === 1 && Math.abs(one[0].y + one[0].h / 2 - wantY) <= 1 && one[0].h > one[0].w,
     one.length ? 'dash centred at y ' + (one[0].y + one[0].h / 2).toFixed(1) + ' against ' + wantY.toFixed(1) : 'no dash');
g._r3dFxOwns = function () { return false; };
g._r3dFxShaded = function () { return true; };
g._r3dWorldToScreen = function (x, y, z) { return { x: x, y: y, scale: 1, behind: false }; };   /* the 3D camera, stood in for */
S.eq('when the 3D pass shades, it owns the bombs and this draws none', draw([b], { on: true }).length, 0);
g._r3dFxShaded = function () { return false; };
var fb = draw([b], { on: true });
S.ok('...and when it cannot shade, the fallback draws them, through the 3D camera', fb.length === 1 && Math.abs(fb[0].y + fb[0].h / 2 - (el + 20 * g.RTS_AIR_ALT_K)) <= 1,
     fb.length ? 'at ' + (fb[0].y + fb[0].h / 2).toFixed(2) + ' against ' + (el + 20 * g.RTS_AIR_ALT_K).toFixed(2) : 'no dash');
G.vis[g._rtsIdx(g._rtsTX(10), g._rtsTX(20))] = 0;
S.eq('a bomb over the shroud is not drawn', draw([b]).length, 0);
G.vis[g._rtsIdx(g._rtsTX(10), g._rtsTX(20))] = 1;

/* the weather called down (core/wxsupers.js): a disc per bank or storm and a line per bolt, on
   the painter that cannot shade - the shaded pass draws the real thing */
var arcs = 0, strokes = 0;
ctx.arc = function () { arcs++; }; ctx.stroke = function () { strokes++; }; ctx.moveTo = function () {}; ctx.lineTo = function () {};
function drawWx(R3) {
  arcs = 0; strokes = 0;
  g.window._R3D = R3 || { on: false };
  G.proj = []; G.fx = []; G.bombs = [];
  G.wx = [{ kind: 'fog', x: 10, z: 20, r: 24, t: 5, side: 'player' }, { kind: 'storm', x: 30, z: 20, r: 24, t: 5, side: 'player' }];
  G.bolts = [{ x: 30, z: 20, t: 0 }];
  g._rtsDrawFx(ctx, G, {}, 1, 24);
  return { arcs: arcs, strokes: strokes };
}
var wx2d = drawWx();
g._r3dFxShaded = function () { return true; };
var wxOwned = drawWx({ on: true });
g._r3dFxShaded = function () { return false; };
G.wx = []; G.bolts = [];
S.ok('a fog bank and a thunderhead are each a disc and a bolt a line on the painter that cannot shade - and nothing when the 3D pass owns them',
     wx2d.arcs === 2 && wx2d.strokes === 1 && wxOwned.arcs === 0 && wxOwned.strokes === 0, JSON.stringify([wx2d, wxOwned]));

require('../lib/report.js')(S);
