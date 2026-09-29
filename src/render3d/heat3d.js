/* render3d/heat3d.js - the air shimmering over what burns. Part of rts.render3d.

   A burning refinery threw light (fxlight3d.js) and smoke (fxemit3d.js) and the air over it was
   as still and clear as the air anywhere else. Now a column of heat rises over every fire and
   every fresh fireball, and whatever is seen through it wavers - the heat haze the later 3D RTS
   games hang over their fires. It is done where the finished picture is put together
   (resolve3d.js): inside each column, the scene is read a couple of pixels off where it
   should be, the offset rippling up the column as the clock runs.

   The sources are the effect lights, the strongest R3D_PLIGHTS already picked for the mesh
   program, each carrying how wide a column it sends up; a round striking armour sends none.
   Part of the light pass, so RTS_POST_ON takes it out with the bloom and the grade;
   R3.heatAmt takes it out alone. */

var R3D_HEAT_N = 4;
var R3D_HEAT_PX = 2.2;          /* how far the picture wavers, in device pixels, at full heat */

var R3D_HEAT_GLSL =
  'uniform vec4 uHeat[' + R3D_HEAT_N + '];' +   /* centre (texture space), half-width across, reach */
  'uniform vec2 uHeatK;' +                      /* width over height of the buffer, the clock */
  'vec2 _heat(vec2 uv){' +
  '  vec2 off = vec2(0.0);' +
  '  for (int i = 0; i < ' + R3D_HEAT_N + '; i++) {' +
  '    vec4 h = uHeat[i];' +
  /* in half-widths of the column, both ways; the column stands on its source and is twice as
     tall as it is wide */
  '    vec2 d = vec2(uv.x - h.x, (uv.y - h.y) / uHeatK.x) / h.z;' +
  '    d.y = (d.y - 1.4) * 0.5;' +
  '    float w = max(0.0, 1.0 - dot(d, d)); w *= w;' +
  '    off += w * h.w * vec2(sin(uv.y * 190.0 + uHeatK.y * 8.0 + uv.x * 30.0),' +
  '                          0.6 * sin(uv.y * 150.0 - uHeatK.y * 6.0 + uv.x * 50.0));' +
  '  }' +
  '  return off; }';

/* The columns, onto the composite's program. `on` is the light pass's switch. */
function _r3dHeatSet(gl, R3, P, on) {
  var u = gl.getUniformLocation(P, 'uHeat');
  if (!u) return 0;
  var a = R3.heatU || (R3.heatU = new Float32Array(R3D_HEAT_N * 4)), n = 0, G = window._rtsG;
  var amt = on ? (R3.heatAmt === undefined ? 1 : R3.heatAmt) : 0, L = R3.plList || [], W = R3.postW, H = R3.postH;
  var sc = R3.scale || 1, zm = _rtsZoom();
  for (var i = 0; i < R3D_HEAT_N; i++) {
    var l = L[i], o = i * 4;
    a[o] = 0; a[o + 1] = 0; a[o + 2] = 1; a[o + 3] = 0;
    if (!l || !(l[5] > 0) || !(amt > 0)) continue;
    var p = _rtsWorldToScreen(l[0], l[1], l[2]);
    if (p.behind) continue;
    a[o] = p.x * sc / W; a[o + 1] = 1 - p.y * sc / H;
    a[o + 2] = Math.max(1e-3, l[5] * zm * (p.scale || 1) * sc / W);
    a[o + 3] = Math.min(1, l[4]) * R3D_HEAT_PX * amt / W;
    n++;
  }
  gl.uniform4fv(u, a);
  gl.uniform2f(gl.getUniformLocation(P, 'uHeatK'), W / H, (G && G.t) || 0);
  R3.heats = n;
  return n;
}
