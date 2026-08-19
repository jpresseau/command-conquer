/* render/post.js - the light pass, water and shroud tiles, picking, and the colour cycle.
   Part of rts.render, which owns every pixel. */

/* ------------------------------------------------------------ the light pass --
   Everything above draws flat: each sprite is composited at full opacity over the one behind
   it, which is exactly what the original did and exactly why a 1996 frame looks like one. This
   is the only part of the renderer that is NOT trying to be faithful - it is a pass over the
   finished frame, and it is what makes the picture read as lit rather than as printed.

   Two effects, both cheap, both deliberately restrained:

   BLOOM. The frame is scaled to a quarter, MULTIPLIED BY ITSELF twice - which cubes every
   channel and so crushes everything dark to nothing while leaving whites alone - then blurred
   and added back. The multiply is doing the job a threshold would do in a shader; canvas 2D has
   no threshold, but it does have multiply, and x^3 is a perfectly good soft one. The result is
   that fire, explosions, muzzle flashes and the Tesla Coil throw light and nothing else does.

   VIGNETTE. A cached radial gradient multiplied over the frame. It costs one drawImage and does
   more for the sense of depth than anything else here.

   Applied to the BATTLEFIELD canvas only. The HUD is a separate canvas on top, so the sidebar,
   the text and the health bars stay perfectly sharp - blooming a UI is how you make it look
   cheap. */
function _rtsPostInit(R) {
  /* An EIGHTH, not a quarter. The downscale reads the whole frame either way, but everything
     downstream - the multiplies, the blur, the composites - is priced on the buffer, and at 1/8
     that is four times less. The bilinear stretch back up also does more of the softening, so
     the blur radius drops with it. */
  var q = 8;
  R.bloomW = Math.max(1, R.W / q | 0);
  R.bloomH = Math.max(1, R.H / q | 0);
  if (!R.bloomCv) R.bloomCv = document.createElement('canvas');
  R.bloomCv.width = R.bloomW; R.bloomCv.height = R.bloomH;
  R.bloomG = R.bloomCv.getContext('2d');
  /* A second small buffer to blur INTO. Blurring at full frame size cost 36 fps of 59 - a
     canvas-2D filter is priced per pixel, and a quarter-size buffer is a sixteenth of them. */
  if (!R.blurCv) R.blurCv = document.createElement('canvas');
  R.blurCv.width = R.bloomW; R.blurCv.height = R.bloomH;
  R.blurG = R.blurCv.getContext('2d', { willReadFrequently: true });   /* the gain reads it back */

  /* The vignette used to be built here as a frame-sized canvas and multiplied over the frame
     every frame. It is now the #rtsVig element, blended once per frame by the COMPOSITOR - see
     style.css - so nothing per-frame remains of it in the canvas pipeline. That multiply was
     the only unconditional full-frame cost in the post pass, and it lived in the frame-time
     tail: p99 25.9ms with the post on, 20.1ms with it off, at zero fx - i.e. the vignette was
     the difference. RTS_VIGNETTE still names the corner colour; the CSS carries its value. */
  R.vigW = R.W; R.vigH = R.H;
}

/* Is there anything on screen worth blooming? Almost always no. The threshold is built to pass
   only fire and explosions, so on a quiet frame the entire bloom - a full-frame downscale, two
   full-frame additive composites - produces nothing and costs a third of the frame rate doing
   it. Gating on "is anything burning or exploding" turns that into a cost paid during fights,
   which is exactly when it is visible. Muzzle flashes are deliberately not counted: they last
   a couple of frames and are not worth waking the pass for. */
function _rtsWantBloom(G) {
  for (var i = 0; i < G.fx.length; i++) {
    var k = G.fx[i].kind;
    if (k === 'tracer' || k === 'debris' || k === 'die') continue;
    if (G.fx[i].t < 0) continue;
    return true;
  }
  return false;
}

function _rtsPost(g) {
  var R = _rtsR, G = window._rtsG;
  if (!R || !RTS_POST_ON || R.W < 8 || R.H < 8) return;
  /* 2D ONLY, NOW. In 3D the glow is computed on the GPU from the emitters - see
     render3d/bloom3d.js - and this pass was measured as the entire cost of a combat frame
     there: one getImageData of the blur buffer plus eight drawImage calls per burning frame,
     one of them dragging the whole WebGL canvas into a 2D context. Two GPU->CPU syncs, on a
     device that was missing vsync by a millisecond. The canvas path stays for the 2D renderer,
     which has no GL to do it in and no sync to pay: there the frame IS this canvas. */
  if (window._R3D && window._R3D.on) return;
  if (R.vigW !== R.W || R.vigH !== R.H || !R.bloomG) _rtsPostInit(R);

  /* The vignette is the #rtsVig element now (see style.css), so a frame with nothing worth
     blooming - which is most frames - costs the post pass NOTHING at all. The glow element
     does have to be told the fire is out, though - it lives outside the canvas, so nothing
     else ever paints over it, and the last explosion's halo would hang on screen forever. */
  if (!G || !_rtsWantBloom(G)) return;

  /* --- bloom --- */
  var bg = R.bloomG, bw = R.bloomW, bh = R.bloomH;
  bg.globalCompositeOperation = 'source-over';
  bg.globalAlpha = 1;
  bg.clearRect(0, 0, bw, bh);
  bg.drawImage(g.canvas, 0, 0, bw, bh);
  /* A POWER CURVE FOR THE THRESHOLD, then the gain separately. The two are separate jobs and
     conflating them is what went wrong twice:

       one weak add          the midtones vanish and so does the glow - measured as a pass that
                             only darkened the frame (mean 59 -> 55.9)
       square + strong add   the highlights glow, but so does everything else, because squaring
                             leaves plenty of midtone behind - a 19% lift across the whole
                             frame, which is haze rather than light (mean 59 -> 70.4)

     Drawing the buffer into ITSELF with multiply squares it, so each of these lines doubles
     the exponent: x, x^2, x^4, x^8. Three of them, and the third is what makes the glow LOCAL.

     At x^4 a midtone of 0.5 still comes through at 0.0625, which is 16 levels before the gain
     and enough - once blurred over the whole frame and added back - to warm everything. That
     is not a hypothetical: measured on one explosion, the pass lifted 99.8% of the frame by a
     mean of 7.2 levels. A glow that reaches every pixel of the map is haze by another route,
     just a milder one than the version already rejected above.

     x^8 collapses that midtone to 0.004 - one level, below anything the eye or an 8-bit buffer
     can carry - while a fireball at 0.95 only falls from 0.81 to 0.66. So the bright end keeps
     its glow, and the rest of the frame stops receiving one. RTS_BLOOM carries that 0.81->0.66
     back so the fireball's own halo is no weaker than before. */
  bg.globalCompositeOperation = 'multiply';
  bg.drawImage(R.bloomCv, 0, 0);
  bg.drawImage(R.bloomCv, 0, 0);
  bg.drawImage(R.bloomCv, 0, 0);
  bg.globalCompositeOperation = 'source-over';

  /* blur once, small */
  var rg = R.blurG;
  rg.globalCompositeOperation = 'source-over';
  rg.clearRect(0, 0, bw, bh);
  rg.filter = 'blur(' + RTS_BLOOM_BLUR + 'px)';
  rg.drawImage(R.bloomCv, 0, 0);
  rg.filter = 'none';

  /* ...then up, with smoothing ON. The renderer runs with it off everywhere else so pixels stay
     square, but here the bilinear stretch from a quarter-size buffer IS most of the softening -
     which is why the blur radius above can be small. */
  /* THE GAIN STANDS DOWN ON A BRIGHT FIELD, and snow is why. The cube is a threshold built
     for temperate ground, where everything but fire lands near black and dies. Snow ground is
     near WHITE: it sails through the cube, and the moment any fx exists the whole field gets
     added back onto itself at 85% - an intermittent full-screen flash, reported as exactly
     that. Bloom keyed on brightness cannot tell albedo from light, so on a frame that is
     bright everywhere the honest move is to not add.

     The statistic is the FRACTION of bright pixels in the cubed buffer, and both simpler
     ideas were tried and failed by measurement:
       - a 1x1 drawImage "mean": GPU minification point-samples near the centre - where the
         fireball is - so the mean came back as the fireball (240,165,65 against a true mean
         of 4.0) and the gain shut the bloom off on every frame that had something to bloom;
       - the true mean: the shroud broke it - a half-explored snow map is mostly black, the
         black dilutes the mean back under the threshold, and the visible white patch flashed
         exactly as before.
     Fire is small and bright: the worst battle puts low single-digit percent of the frame
     over the cube's threshold. Snowfield is bright by the tens of percent however much shroud
     surrounds it - no amount of black changes how MANY bright pixels there are. Full glow up
     to 4% of the frame, gone by 14%. Sampling every 4th pixel of the 1/8 buffer is ~2000
     reads, only on frames with fx. */
  var md = R.blurG.getImageData(0, 0, R.bloomW, R.bloomH).data;
  var mbright = 0, mn = 0;
  for (var mi = 0; mi < md.length; mi += 16) {
    if (md[mi] + md[mi + 1] + md[mi + 2] > 180) mbright++;
    mn++;
  }
  var gain = RTS_BLOOM * Math.max(0, Math.min(1, 1 - (mbright / mn - 0.04) / 0.10));
  if (gain > 0.01) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = gain;
    g.imageSmoothingEnabled = true;
    for (var bp = 0; bp < RTS_BLOOM_PASSES; bp++) g.drawImage(R.blurCv, 0, 0, R.W, R.H);
    g.restore();
  }
  /* the vignette multiplies over this on the compositor - #rtsVig sits above the canvas */
}

/* THROUGH THE PROJECTION, LIKE EVERY OTHER WORLD DRAW. This placed each tile at
   `(x - ox) * cell` - a flat top-down projection written out by hand - and it is called
   ungated, in both modes. In 3D the world is tilted: a cell's screen height is cell * cos(tilt)
   and its row position compresses with it, so the sea was laid over the tilted map on a grid
   that was not, drifting further out of register with every row from the camera. It is the one
   world overlay that still has to run in 3D - the GL side has no water surface of its own, so
   without it the sea is a flat painted colour - which is exactly why it has to be in the right
   place rather than merely present.

   Only players who have loaded their own Red Alert archives ever saw it: _mixWater returns
   null without them and this returns immediately, which is also why no spec caught it. */
function _rtsDrawWater(g, G, cell) {
  /* 2D ONLY. In 3D the sea is geometry with a moving normal and a specular on it
     (render3d/world3d.js), and a flat sheet of authored tiles laid over that hides every bit
     of it - the same mistake the ore tile made over the ore crystals. */
  if (window._R3D && window._R3D.on) return;
  var steps = _mixWater();
  if (!steps) return;
  var N = RTS_N;
  var set = steps[Math.floor(G.t * RTS_WATER_HZ) % steps.length];
  /* The window comes from the projection's inverse for the same reason the placement does:
     the flat cell arithmetic this replaces is the top-down answer, and under the tilt it fell
     a row short at the far edge - which is where a missing row of sea reads as the map ending
     rather than as a bug. */
  var cw = _rtsCellWindow(1, 2);
  var seed = (G.seed || 1) | 0;

  for (var y = cw.tz0; y <= cw.tz1; y++) {
    for (var x = cw.tx0; x <= cw.tx1; x++) {
      var i = y * N + x;
      if (G.terrain[i] !== RTS_T_WATER) continue;
      if (!G.mapped[i]) continue;                    /* never seen - the shroud covers it anyway */
      var v = (_sprHash(x, y, seed + 137) * set.length) | 0;
      if (v >= set.length) v = set.length - 1;
      var tile = set[v];
      if (!tile) continue;
      /* Corner to corner, so each tile reaches its neighbour under any projection - a fixed
         size only abuts while every cell projects to the same rectangle, which stopped being
         true the moment the 3D camera gained a perspective divide. */
      var sp = _rtsGroundToScreen(_rtsWX(x) - RTS_TILE / 2, _rtsWX(y) - RTS_TILE / 2);
      var sq = _rtsGroundToScreen(_rtsWX(x) + RTS_TILE / 2, _rtsWX(y) + RTS_TILE / 2);
      var px = Math.round(sp.x), py = Math.round(sp.y);
      g.drawImage(tile, px, py, Math.max(1, Math.round(sq.x) - px + 1),
                  Math.max(1, Math.round(sq.y) - py + 1));
    }
  }
}

function _rtsDrawShroudTiles(g, G, cell) {
  var R = _rtsR, spr = _mixShroud(), map = _mixShroudMap();
  var N = RTS_N;
  /* which cells are on screen, in cell coordinates */
  var ox = R.focus.x / RTS_TILE + N / 2 - (R.W / 2) / cell;
  var oy = R.focus.z / RTS_TILE + N / 2 - (R.H / 2) / cell;
  var x0 = Math.max(0, Math.floor(ox) - 1), y0 = Math.max(0, Math.floor(oy) - 1);
  var x1 = Math.min(N - 1, Math.ceil(ox + R.W / cell) + 1);
  var y1 = Math.min(N - 1, Math.ceil(oy + R.H / cell) + 1);

  /* Off the edge of the MAP counts as unexplored, so the border gets a proper cut edge rather
     than stopping flat at the last cell. */
  function dark(x, y) { return (x < 0 || y < 0 || x >= N || y >= N) ? 1 : (G.mapped[y * N + x] ? 0 : 1); }

  var prevA = g.globalAlpha;
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var i = y * N + x;
      var sx = Math.round((x - ox) * cell), sy = Math.round((y - oy) * cell);
      var w = Math.ceil(cell) + 1;

      if (!G.mapped[i]) {
        /* unexplored: solid, no shape needed - the shape lives on the LIT side of the border */
        g.globalAlpha = 1;
        g.fillStyle = '#040609';
        g.fillRect(sx, sy, w, w);
        continue;
      }

      /* explored: dim it, then cut the edge against anything unexplored around it */
      if (!G.vis[i]) {
        g.globalAlpha = RTS_FOG_DIM;
        g.fillStyle = '#040609';
        g.fillRect(sx, sy, w, w);
      }

      var u = dark(x, y - 1), d = dark(x, y + 1), l = dark(x - 1, y), r = dark(x + 1, y);
      var e = 0;
      if (u) e |= 0x10;
      if (r) e |= 0x20;
      if (d) e |= 0x40;
      if (l) e |= 0x80;
      /* A corner only counts when neither of its sides does - otherwise the side piece already
         covers it, and the combined mask names a frame that does not exist. */
      if (!u && !l && dark(x - 1, y - 1)) e |= 0x01;
      if (!u && !r && dark(x + 1, y - 1)) e |= 0x02;
      if (!d && !r && dark(x + 1, y + 1)) e |= 0x04;
      if (!d && !l && dark(x - 1, y + 1)) e |= 0x08;
      if (!e) continue;

      var f = map[e];
      if (f < 0 || !spr[f]) continue;
      g.globalAlpha = 1;
      g.drawImage(spr[f], sx, sy, w, w);
    }
  }
  g.globalAlpha = prevA;
}

/* NULL WHEN THE POINTER IS NOT ON THE GROUND. Under both orthographic cameras every screen
   pixel maps to a ground point, so this dereferenced _rtsGroundAt's result without asking - and
   it runs inside the DRAW half of the loop, through _rtsActionAt, on every frame the pointer
   moves. A perspective camera has a horizon: above it the view ray never meets the ground plane
   and the inverse has no answer to give. Reaching that line with this unguarded throws inside
   the render loop, which ui/camera.js turns into 'The display has stopped' after 60 frames.

   Every caller already copes with a null - `if (!hit) return`, or `hit && hit.ent` - so the
   guard belongs here and costs them nothing. */
function _rtsPickAt(mx, my) {
  var G = window._rtsG, p = _rtsGroundAt(mx, my);
  if (!p) return null;
  var best = null, bd = 1e9, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || !_rtsEntSeen(e)) continue;     /* you cannot click what you cannot see */
    var rad, d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.type === 'struct') { var sd = rtsStructDef(e.def); rad = Math.max(sd.w, sd.h) * RTS_TILE * 0.55; }
    else rad = Math.max(2.2, e.r * 1.6);
    if (d <= rad && d < bd) { bd = d; best = e; }
  }
  return best ? { ent: best, x: p.x, z: p.z } : { ent: null, x: p.x, z: p.z };
}

/* CONQUER.CPP: Color_Cycle(). Two clocks drive everything that shimmers.

   The pulse steps by 20 every TIMER_SECOND/6, bouncing between 0x20 and 150, and is applied
   to CC_PULSE_COLOR (radar box, glowing interface) and CC_EMBER_COLOR - RGBClass(255,80,80),
   the glow on burning things. The water clock rotates a band of palette entries one step
   every TIMER_SECOND/4.

   With no indexed palette to rotate, the same numbers drive an overlay cycle instead. The
   cadences are the originals' because they are what the eye recognises. */
var _RTS_PULSE = { val: 0x20, up: true, t: 0, wt: 0, wf: 0, at: 0, frame: 0 };
function _rtsCycleTick(dt) {
  var P = _RTS_PULSE;
  P.t += dt;
  while (P.t >= 1 / 6) {
    P.t -= 1 / 6;
    P.val += P.up ? 20 : -20;
    if (P.val > 150) { P.val = 150; P.up = false; }
    if (P.val < 0x20) { P.val = 0x20; P.up = true; }
  }
  P.wt += dt;
  while (P.wt >= 1 / 4) { P.wt -= 1 / 4; P.wf = (P.wf + 1) & 3; }
  /* Sync_Delay() pins the original to 15 FPS, and that cadence is a big part of how its
     animation reads - chunky rather than smooth. Movement here stays continuous (it would
     look broken at 15 Hz on a modern display), but everything that picks an animation FRAME
     advances off this counter instead of off wall-clock time. */
  P.at += dt;
  while (P.at >= 1 / 15) { P.at -= 1 / 15; P.frame++; }
}
function _rtsAnimFrame() { return _RTS_PULSE.frame; }
/* Time quantised to the 15 Hz grid, for anything choosing a frame from an elapsed timer. */
function _rtsAnimQ(t) { return Math.floor(t * 15) / 15; }
function _rtsPulse() { return _RTS_PULSE.val / 255; }        /* 0.125 .. 0.588 */
function _rtsEmber() {
  var k = _rtsPulse();
  return 'rgb(' + Math.round(255 * k) + ',' + Math.round(80 * k) + ',' + Math.round(80 * k) + ')';
}

