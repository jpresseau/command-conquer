/* render3d/road3d.js - metalled roads on the 3D ground. Part of rts.render3d.

   The road cells are a two-wide staircase down the line _rtsCarveRoad walked, and drawn as a
   material they were a dirt track - and an asphalt material on those cells was a lake of tar
   with a coastline, because the ground's border warp that suits a shore makes a road ragged.
   So the road is painted down the line itself (G.roads, kept by the generator): a smooth
   carriageway, a kerb each side, a dashed centre line, merging where two roads meet. The
   cells keep their track material underneath, which is the dirt shoulder either side.

   THE FIELD. One texel per two world units over the whole map, baked once a map: the distance
   to the nearest stretch of road in .r, for the carriageway and the kerbs; the same distance
   SIGNED in .g but only two units either side, for the centre line - a signed field
   interpolates exactly across the line where an unsigned one's V does not, but where the
   nearest road changes sides it jumps, and in .r that jump drew a phantom road down the middle
   between two roads; and the dash phase along it as a cosine in .b, which interpolates without
   a seam where a phase would wrap. .a is 1 within reach of a road, a half where a second road
   runs within a few units of the nearest - no centre line there - and 0 beyond. A stretch is
   painted only where the cells under it are still road - not across the sea, where a bridge
   carries it (bridge3d.js), nor through an ore field that cut it.

   R3.roadAmt 0 takes the paint out (e2e/bridge's A/B); a map with no G.roads - a loaded one -
   keeps its tracks. */

var R3D_ROAD_TEXEL = 2;          /* world units a texel */
var R3D_ROAD_RANGE = 8;          /* world units the field reaches either side of a road */
var R3D_ROAD_DASH = 9;           /* world units from one dash to the next */

function _r3dRoadField(G) {
  var N = RTS_N, T = RTS_TILE, S = Math.ceil(N * T / R3D_ROAD_TEXEL), d = new Float32Array(S * S);
  var cs = new Float32Array(S * S), own = new Int16Array(S * S).fill(-1), d2 = new Float32Array(S * S).fill(1e9), half = N * T / 2, i, k;
  d.fill(R3D_ROAD_RANGE);
  function road(c) {
    var a = Math.round(c[0]), b = Math.round(c[1]);
    return _rtsInB(a, b) && G.terrain[_rtsIdx(a, b)] === RTS_T_ROAD;
  }
  (G.roads || []).forEach(function (L, ri) {
    var s = 0;
    for (i = 0; i + 3 < L.length; i += 2) {
      /* the line in world units: a cell coordinate c is at (c - N/2 + 0.5) * T */
      var ax = (L[i] - N / 2 + 0.5) * T, az = (L[i + 1] - N / 2 + 0.5) * T;
      var bx = (L[i + 2] - N / 2 + 0.5) * T, bz = (L[i + 3] - N / 2 + 0.5) * T;
      var vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz, len = Math.sqrt(l2);
      if (len < 1e-6) continue;
      var s0 = s; s += len;
      if (!road([(L[i] + L[i + 2]) / 2, (L[i + 1] + L[i + 3]) / 2])) continue;
      var R = R3D_ROAD_RANGE;
      var i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R + half) / R3D_ROAD_TEXEL)), i1 = Math.min(S - 1, Math.ceil((Math.max(ax, bx) + R + half) / R3D_ROAD_TEXEL));
      var j0 = Math.max(0, Math.floor((Math.min(az, bz) - R + half) / R3D_ROAD_TEXEL)), j1 = Math.min(S - 1, Math.ceil((Math.max(az, bz) + R + half) / R3D_ROAD_TEXEL));
      for (var tj = j0; tj <= j1; tj++) for (var ti = i0; ti <= i1; ti++) {
        var x = (ti + 0.5) * R3D_ROAD_TEXEL - half, z = (tj + 0.5) * R3D_ROAD_TEXEL - half;
        var q = ((x - ax) * vx + (z - az) * vz) / l2, qc = q < 0 ? 0 : q > 1 ? 1 : q;
        var ex = x - ax - vx * qc, ez = z - az - vz * qc, dist = Math.sqrt(ex * ex + ez * ez);
        k = tj * S + ti;
        /* the nearest OTHER road, too: the generator lays several down the same route, and where
           two run within a few units of each other their centre lines fought over the dash */
        if (own[k] !== ri) {
          if (dist < Math.abs(d[k])) { d2[k] = Math.min(d2[k], Math.abs(d[k])); own[k] = ri; }
          else { d2[k] = Math.min(d2[k], dist); continue; }
        }
        if (dist >= Math.abs(d[k])) continue;
        /* the side: which way across the run, so the field is signed */
        d[k] = (vx * (z - az) - vz * (x - ax)) < 0 ? -dist : dist;
        var ph = (s0 + len * qc) / R3D_ROAD_DASH * 2 * Math.PI;
        cs[k] = Math.cos(ph);
      }
    }
  });
  var px = new Uint8Array(S * S * 4);
  for (k = 0; k < S * S; k++) {
    px[k * 4] = Math.min(255, Math.round(Math.abs(d[k]) / R3D_ROAD_RANGE * 255));
    px[k * 4 + 1] = Math.round((0.5 + Math.max(-2, Math.min(2, d[k])) / 4) * 255);
    px[k * 4 + 2] = Math.round((cs[k] * 0.5 + 0.5) * 255);
    px[k * 4 + 3] = Math.abs(d[k]) < R3D_ROAD_RANGE ? (d2[k] < Math.abs(d[k]) + 6 ? 128 : 255) : 0;
  }
  return { S: S, px: px };
}

/* The field's texture, baked when the game changes. */
function _r3dRoadTex(gl, R3, G) {
  if (R3.roadTex && R3.roadFor === G) return R3.roadTex;
  var F = _r3dRoadField(G), t = R3.roadTex || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, F.S, F.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, F.px);
  R3.roadTex = t; R3.roadFor = G; R3.roadS = F.S;
  R3.roadBuilds = (R3.roadBuilds || 0) + 1;
  return t;
}

/* For the ground program: the field on texture unit 7, and whether to paint it. */
function _r3dRoadSet(gl, R3, P, G) {
  gl.activeTexture(gl.TEXTURE0 + 7);
  gl.bindTexture(gl.TEXTURE_2D, _r3dRoadTex(gl, R3, G));
  gl.uniform1i(gl.getUniformLocation(P, 'uRoadT'), 7);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(gl.getUniformLocation(P, 'uRoad'), R3.roadAmt === 0 || !(G.roads && G.roads.length) ? 0 : 1);
}

/* The paint, in _groundAt: `w` the world position, `col` the ground so far. Returns how much of
   the pixel is carriageway, which flattens the bump under it. */
var R3D_ROAD_GLSL =
  'uniform sampler2D uRoadT; uniform float uRoad;' +
  'float _road(vec2 w, inout vec3 col, vec4 N, vec4 M, float det){' +
  '  if (uRoad < 0.5) return 0.0;' +
  '  vec4 rd = texture2D(uRoadT, (w * uTileInv + uMat.z + 0.5) * uMat.y);' +
  '  if (rd.a < 0.01) return 0.0;' +
  '  float da = rd.r * ' + R3D_ROAD_RANGE.toFixed(1) + ', ds = (rd.g - 0.5) * 4.0;' +
  '  float asph = 1.0 - smoothstep(3.05, 3.2, da);' +
  '  float kerb = smoothstep(3.05, 3.15, da) * (1.0 - smoothstep(3.55, 3.65, da));' +
  /* the carriageway: dark aggregate flecked with its own stone, worn paler down the wheel
     tracks either side of the middle, mended darker in patches */
  '  vec3 ac = mix(vec3(0.25, 0.25, 0.24), vec3(0.33, 0.33, 0.31), N.x) * (0.95 + 0.1 * M.x);' +
  '  ac = mix(ac, vec3(0.5, 0.49, 0.46), M.z * 0.22 * det);' +
  '  ac *= 1.0 + 0.07 * (1.0 - smoothstep(0.4, 0.9, abs(da - 1.6)));' +
  '  ac = mix(ac, vec3(0.2, 0.2, 0.2), smoothstep(0.66, 0.71, N.y) * 0.55);' +
  /* the centre line: dashes, a third of a unit wide */
  '  float dash = (1.0 - smoothstep(0.12, 0.2, abs(ds))) * (1.0 - smoothstep(0.6, 1.0, da)) * smoothstep(0.1, 0.3, rd.b - 0.45) * smoothstep(0.8, 0.97, rd.a);' +
  '  ac = mix(ac, vec3(0.86, 0.83, 0.70), dash * 0.9);' +
  '  col = mix(col, ac, asph);' +
  '  col = mix(col, vec3(0.70, 0.68, 0.62) * (0.92 + 0.12 * M.x), kerb);' +
  /* a sliver of shadow where the kerb steps down to the shoulder */
  '  col *= 1.0 - 0.25 * smoothstep(3.6, 3.7, da) * (1.0 - smoothstep(3.7, 4.1, da));' +
  '  return asph; }';
