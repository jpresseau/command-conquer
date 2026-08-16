/* THE FLOOR OF THE WORLD IS IN THE DEPTH BUFFER, AND THINGS SIT ON IT.

   Two claims, and the first is the reason the second was possible.

   THE GROUND HAD NO USABLE DEPTH. It was drawn as one quad over the whole 512-unit map, and
   that was measured once and defended: with a perspective camera a good part of such a plane
   falls behind the eye, the hardware clips it there, and the COLOUR that comes out is right to
   within sub-texel rounding. True, and it answered only half the question. A triangle carries
   depth as well as colour, and this renderer writes LINEAR depth on purpose - gl_Position.z is
   -d/RANGE premultiplied by w, so the buffer holds -d/RANGE rather than the usual function of
   1/d. The usual function is chosen precisely because it is linear in SCREEN space, which is
   where the rasteriser interpolates; -d/RANGE is not, so depth is exact at a vertex and drifts
   across a triangle, by more the larger the triangle. One map-sized quad is the largest
   triangle in the scene by three orders of magnitude.

   Nothing read the ground's depth, so nothing noticed. Graded here by reconstructing the world
   from the depth buffer on a bare map and asking what HEIGHT it thinks the ground is at: the
   answer has to be zero, and the map-sized quad said 88 world units, which is off the map's
   whole depth range. That is the entire floor of the world missing from the buffer - most of
   the frame - for any effect that samples it.

   THE OCCLUSION IS THE FIRST EFFECT THAT SAMPLES IT. The sun's shadow map answers "does the
   sun reach this pixel". It cannot answer "how much of the sky can this pixel see", which is
   the question that puts a tree on the ground rather than in front of it. Both are graded
   below, and the second is graded in a way that would have caught the first being broken: not
   just "does anything darken" but "is the thing doing the darkening actually NEARBY". With the
   ground missing from the buffer, occluders averaged 28 world units away - silhouette halo, the
   classic screen-space artifact - and the honest coverage was 3% of pixels. With the floor back
   it is 0.3 units and 19%.

   AND THE EDGES HAD TO SURVIVE THE TRIP. Rendering through a buffer costs the canvas's
   multisampling, which is not free to give up. Graded against the multisampled frame itself. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('ao');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    o.gl2 = !!R3.gl2;
    o.postReady = !!R3.postReady;

    var gl = R3.gl;
    var yard = _rtsHas('player', 'yard');
    R.focus.x = yard.x; R.focus.z = yard.z;
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    _rtsRFrame(1 / 60);
    var CW = R3.cv.width, CH = R3.cv.height;
    o.sub = R3D_GROUND_SUB;

    var z = _rtsZoom();
    var cam = [R.focus.x, R.focus.z, 2 * z * R.dpr / CW, 2 * z * R.dpr / CH];
    var invD = 1 / _r3dEyeDist();

    function shot() {
      _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* a probe program over the depth texture, drawn full-screen and read back */
    function probe(body) {
      var src = 'precision highp float; varying vec2 vT; uniform vec2 uTexel;' +
        R3D_AO_RECON + 'uniform vec3 uK[' + R3D_AO_SAMPLES + '];' +
        'void main(){' + body + '}';
      var P = _r3dProgram(gl, R3D_QUAD_VS, src);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, CW, CH);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(P);
      gl.uniform4f(gl.getUniformLocation(P, 'uProj'), cam[2], cam[3], invD, R3D_DEPTH_RANGE);
      gl.uniform2f(gl.getUniformLocation(P, 'uTexel'), 1 / CW, 1 / CH);
      gl.uniform3fv(gl.getUniformLocation(P, 'uK'), R3D_AO_KERNEL);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, R3.sceneDepth);
      gl.uniform1i(gl.getUniformLocation(P, 'uDepth'), 0);
      _r3dQuad(R3, P);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }

    /* ---------- 1. the ground's depth, against the plane it is known to be ----------
       Everything standing up is removed, so every pixel with depth in it IS the ground, and
       the ground is at y = 0 by construction. y comes back out of the reconstructed frame as
       -sv*sin(tilt) + d*cos(tilt), which is the vertex shader's own rotation inverted. */
    var kw = R3.world, ko = R3.oreMesh, kwa = R3.waterMesh, ke = G.ents;
    R3.world = []; R3.oreMesh = null; R3.waterMesh = null; G.ents = [];
    _rtsRFrame(1 / 60);
    var by = probe(
      '  float raw = texture2D(uDepth, vT).r;' +
      '  if (raw > 0.99999) { gl_FragColor = vec4(0.0); return; }' +
      '  float d = (0.5 - raw) * 2.0 * uProj.w;' +
      '  vec3 P = _aoP(vT, d);' +
      '  float y = -P.y * ' + R3.sp.toFixed(6) + ' + P.z * ' + R3.cp.toFixed(6) + ';' +
      /* |y| in world units, full scale = 8 (two cells), so a big error still reads */
      '  gl_FragColor = vec4(vec3(clamp(abs(y) / 8.0, 0.0, 1.0)), 1.0);');
    var ys = 0, yn = 0;
    for (i = 0; i < by.length; i += 4) {
      if (by[i + 3] === 0) continue;
      ys += by[i]; yn++;
    }
    o.groundYerr = yn ? +(ys / yn / 255 * 8).toFixed(3) : -1;
    o.groundPx = yn;

    /* ---------- 2. and bare ground occludes nothing ----------
       Still the empty map. A flat plane sees the whole sky, so any occlusion here is the
       surface shadowing itself - the AO equivalent of shadow acne. */
    R3.aoAmt = 1; var eOn = shot();
    R3.aoAmt = 0; var eOff = shot();
    R3.aoAmt = 1;
    var flat = 0;
    for (i = 0; i < eOn.length; i += 4) {
      if ((eOff[i] - eOn[i]) + (eOff[i + 1] - eOn[i + 1]) + (eOff[i + 2] - eOn[i + 2]) > 8) flat++;
    }
    o.flatGroundAO = +(flat / (eOn.length / 4) * 100).toFixed(2);

    R3.world = kw; R3.oreMesh = ko; R3.waterMesh = kwa; G.ents = ke;
    _rtsRFrame(1 / 60);

    /* ---------- 3. the occlusion, on the real map ---------- */
    R3.aoAmt = 1; var aoOn = shot();
    R3.aoAmt = 0; var aoOff = shot();
    R3.aoAmt = 1;
    var touched = 0, sum = 0, tot = 0, mx = 0, brighter = 0;
    for (i = 0; i < aoOn.length; i += 4) {
      tot++;
      var d3 = ((aoOff[i] - aoOn[i]) + (aoOff[i + 1] - aoOn[i + 1]) +
                (aoOff[i + 2] - aoOn[i + 2])) / 3;
      sum += d3;
      if (d3 > 2) touched++;
      if (d3 > mx) mx = d3;
      if (d3 < -2) brighter++;
    }
    o.aoTouched = +(touched / tot * 100).toFixed(1);
    o.aoMean = +(sum / tot).toFixed(2);
    o.aoMax = +mx.toFixed(1);
    o.aoBrighter = +(brighter / tot * 100).toFixed(2);

    /* ---------- 3b. THE SHAPE OF IT, not just the amount ----------
       The occlusion has to be deep where things MEET and absent where they do not, and those
       two are separate claims that a single average cannot tell apart: turning the gain up
       raises both and the average looks better while the frame looks worse.

       So the pixels are split by how much the pass darkens them and each half is graded on its
       own. The deep end is the contacts - a trunk's foot, a wall meeting the ground. The floor
       of the split is open ground, which the pass should barely touch, and it is the half that
       goes wrong first: raising the gain alone from 1.6 to 2.6 took the contacts from 21.5 to
       29.9 levels and the open ground from 0.51 to 0.86 - the deep end up 39%, the part that
       should be clean up 69%. That is the smear everyone recognises as the AO turned up.

       Graded as the RATIO, because that is the thing the shaping buys and the gain cannot. */
    var deepSum = 0, deepN = 0, openSum = 0, openN = 0;
    for (i = 0; i < aoOn.length; i += 4) {
      var d4 = ((aoOff[i] - aoOn[i]) + (aoOff[i + 1] - aoOn[i + 1]) +
                (aoOff[i + 2] - aoOn[i + 2])) / 3;
      if (d4 >= 18) { deepSum += d4; deepN++; } else if (d4 <= 3) { openSum += Math.max(0, d4); openN++; }
    }
    o.aoDeep = deepN ? +(deepSum / deepN).toFixed(1) : 0;
    o.aoDeepN = deepN;
    o.aoDeepPct = +(deepN / tot * 100).toFixed(2);
    o.aoOpen = openN ? +(openSum / openN).toFixed(2) : 0;
    o.aoRatio = o.aoOpen > 0 ? +(o.aoDeep / o.aoOpen).toFixed(0) : 0;
    o.aoCurve = R3D_AO_CURVE;
    o.aoGain = R3D_AO_STRENGTH;
    o.aoFloor = R3D_AO_FLOOR[0];
    /* the curve has to actually be in the compiled source, and before the gain - see the note
       in post3d.js for why that order is not interchangeable */
    o.curveInFS = R3D_AO_FS.indexOf('pow(occ / float(' + R3D_AO_SAMPLES + '), ' +
                                    R3D_AO_CURVE.toFixed(3) + ') * ' +
                                    R3D_AO_STRENGTH.toFixed(3)) >= 0;

    /* ---------- 4. WHAT is doing the occluding, and how far away it is ----------
       The measurement that separates ambient occlusion from silhouette halo. For every sample
       the pass counts as hidden, reconstruct the occluder's own position and take the real 3D
       distance to the shaded point. Local means the pixel is being darkened by its own
       surroundings; far means it is being darkened by a background it merely overlaps. */
    var gp = probe(
      '  float raw = texture2D(uDepth, vT).r;' +
      '  if (raw > 0.99999) { gl_FragColor = vec4(0.0); return; }' +
      '  float d = (0.5 - raw) * 2.0 * uProj.w;' +
      '  vec3 P = _aoP(vT, d);' +
      '  float dxp=_aoD(vT+vec2(uTexel.x,0.0)), dxm=_aoD(vT-vec2(uTexel.x,0.0));' +
      '  float dyp=_aoD(vT+vec2(0.0,uTexel.y)), dym=_aoD(vT-vec2(0.0,uTexel.y));' +
      '  vec3 ex = abs(dxp-P.z)<abs(dxm-P.z) ? _aoP(vT+vec2(uTexel.x,0.0),dxp)-P' +
      '                                      : P-_aoP(vT-vec2(uTexel.x,0.0),dxm);' +
      '  vec3 ey = abs(dyp-P.z)<abs(dym-P.z) ? _aoP(vT+vec2(0.0,uTexel.y),dyp)-P' +
      '                                      : P-_aoP(vT-vec2(0.0,uTexel.y),dym);' +
      '  vec3 n = cross(ex,ey); n = length(n)>1e-8 ? normalize(n) : vec3(0.0,0.0,1.0);' +
      '  n = dot(n, vec3(0.0,0.0,1.0/uProj.z)-P) < 0.0 ? -n : n;' +
      '  vec3 T = abs(n.y)<0.9 ? normalize(cross(vec3(0.0,1.0,0.0),n))' +
      '                        : normalize(cross(vec3(1.0,0.0,0.0),n));' +
      '  vec3 B = cross(n,T); float hid=0.0, far=0.0;' +
      '  for (int i=0;i<' + R3D_AO_SAMPLES + ';i++){' +
      '    vec3 k=uK[i];' +
      '    vec3 Sp = P + (T*k.x + n*k.y + B*k.z) * ' + R3D_AO_RADIUS.toFixed(3) + ';' +
      '    vec2 su=_aoUV(Sp); if(su.x<0.0||su.x>1.0||su.y<0.0||su.y>1.0) continue;' +
      '    float sd=_aoD(su); if (sd < -800.0) continue;' +
      '    float h = step(Sp.z + ' + R3D_AO_BIAS.toFixed(3) + ', sd);' +
      '    hid += h; far += h * length(_aoP(su,sd) - P);' +
      '  }' +
      /* mean distance to the occluder, full scale = 40 world units (ten cells) */
      '  gl_FragColor = vec4(vec3(hid > 0.0 ? clamp(far/hid/40.0, 0.0, 1.0) : 0.0),' +
      '                      hid > 0.0 ? 1.0 : 0.0);');
    var gs = 0, gn = 0;
    for (i = 0; i < gp.length; i += 4) {
      if (gp[i + 3] === 0) continue;
      gs += gp[i]; gn++;
    }
    o.occluderDist = gn ? +(gs / gn / 255 * 40).toFixed(2) : -1;

    /* ---------- 5. the edges, against the multisampled frame itself ----------
       postReady false draws straight to the canvas, which was created with antialias:true, so
       that frame IS the reference. Harshness is the mean absolute neighbour difference over
       the frame: aliasing raises it, and blurring lowers it past the reference. */
    R3.aoAmt = 0;
    R3.aaAmt = 0; var raw = shot();
    R3.aaAmt = 1; var aa = shot();
    R3.postReady = false; var msaa = shot();
    R3.postReady = true; R3.aoAmt = 1; R3.aaAmt = 1;
    function harsh(X) {
      var s = 0, n = 0;
      for (var y = 1; y < CH - 1; y += 2) {
        for (var x = 1; x < CW - 1; x += 2) {
          var q = (y * CW + x) * 4;
          s += Math.abs(X[q] - X[q + 4]) + Math.abs(X[q] - X[q + CW * 4]);
          n++;
        }
      }
      return +(s / n).toFixed(2);
    }
    o.harshRaw = harsh(raw); o.harshAA = harsh(aa); o.harshMsaa = harsh(msaa);
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }

  S.ok('the frame is drawn through a buffer with a readable depth attachment',
       out.postReady,
       out.postReady ? (out.gl2 ? 'WebGL2 depth texture' : 'WEBGL_depth_texture')
                     : 'no depth texture - the mode still runs, without the occlusion');

  if (out.postReady) {
    S.ok('the ground patch is cut up rather than drawn as one quad', out.sub >= 4,
         out.sub + 'x' + out.sub + ' - depth here is linear in view depth, which is NOT linear ' +
         'in the space the rasteriser interpolates in, so it is exact at a vertex and drifts ' +
         'across a triangle');

    /* THE CLAIM. A bare map is a plane at y = 0, so this is graded against a number that is
       known independently of anything the renderer says. */
    S.ok('the ground is in the depth buffer, at the height it actually is',
         out.groundYerr >= 0 && out.groundYerr < 0.35,
         'reconstructing the world from the depth buffer on a bare map puts the ground at y = ' +
         out.groundYerr + ' world units, over ' + out.groundPx + ' pixels - it is 0 by ' +
         'construction. One quad over the whole map scores 88, an untessellated visible patch ' +
         '4.7, and a cell is 4 units wide');

    S.ok('...and a flat plane does not occlude itself', out.flatGroundAO < 1,
         out.flatGroundAO + '% of a bare map is darkened - a plane sees the whole sky, so ' +
         'anything here is the surface shadowing itself');

    S.ok('things standing on the ground are darkened where they meet it',
         out.aoTouched > 8,
         out.aoTouched + '% of the frame darkens when the occlusion is mixed out, by ' +
         out.aoMean + ' levels on average and up to ' + out.aoMax + ' - tree bases, crystal ' +
         'bases, and the ground around every building');

    /* THE SHAPE, WHICH IS WHAT THE TUNING IS ABOUT - see the note at the measurement. Deep in
       the contacts, near-nothing on open ground, and it is the RATIO between them that the
       curve buys, because the gain moves both together. */
    /* BOUNDED ON BOTH SIDES, and the upper bound is the one that took a mutation to find.
       Graded only as "enough of the frame goes deep", every knob that darkens harder scores
       better and the assertion becomes an argument for the smear it is supposed to forbid:
       dropping the curve alone takes this from 2.2% of the frame to 8.1%, and passes. Contact
       shading is a THIN band where surfaces meet - a twentieth of the frame is not contact,
       it is the whole picture going dark. */
    S.ok('...deeply where they meet, and hardly at all on open ground',
         out.aoDeepPct > 0.7 && out.aoDeepPct < 4 && out.aoOpen < 0.68 && out.aoRatio > 36,
         out.aoDeepPct + '% of this frame reaches contact depth (' + out.aoDeepN + ' pixels, ' +
         'averaging ' + out.aoDeep + ' levels down) while open ground moves ' + out.aoOpen +
         ' - a ratio of ' + out.aoRatio + '. Three tunings bracket that, all on this frame: ' +
         'the linear one this shipped with reaches contact depth on 0.28% at 21.0 levels, ' +
         'open 0.66 - a sixth as many pixels reading as contact, and DIRTIER open ground than ' +
         'now. The same gain and floor with the curve taken out reaches 8.09%, open 0.70 - ' +
         'four times too much of the frame gone dark, which is the smear. Only the three ' +
         'together land in between: the curve (' + out.aoCurve + ') suppresses shallow ' +
         'occlusion so the gain (' + out.aoGain + ') can be spent where things actually ' +
         'touch, and the floor (' + out.aoFloor + ') lets the deep end past the 57 levels it ' +
         'clamped at however hard the gain was pushed');

    S.ok('...with the curve applied before the gain, in the compiled shader',
         out.curveInFS,
         out.curveInFS ? 'pow() runs on the normalised occlusion, then the gain scales it'
           : 'the shaping is not in R3D_AO_FS - clipping first and curving the clipped value ' +
             'throws the deep end away, which is the whole point of it');

    /* Occlusion only darkens. Anything brighter is the pass writing something it should not. */
    S.ok('...and the occlusion never brightens anything', out.aoBrighter < 0.1,
         out.aoBrighter + '% of pixels are brighter with it on');

    /* THE MEASUREMENT THAT TELLS AMBIENT OCCLUSION FROM SILHOUETTE HALO, and the one that
       would have caught the ground being absent from the buffer. */
    S.ok('...by something that is actually next to them',
         out.occluderDist >= 0 && out.occluderDist < 4,
         'the average occluder sits ' + out.occluderDist + ' world units from the pixel it ' +
         'darkens, against a kernel radius of ' + '3' + ' - with the ground missing from the ' +
         'depth buffer this measured 28 units, which is a background being counted as a ' +
         'neighbour, and is what screen-space occlusion looks like when it is wrong');

    /* Drawing through a buffer costs the canvas's multisampling; the reference is the
       multisampled frame, and the filter must move toward it without overshooting into blur. */
    S.ok('the edges survive being drawn through a buffer',
         out.harshAA < out.harshRaw && out.harshAA >= out.harshMsaa - 0.15,
         'mean neighbour difference: ' + out.harshRaw + ' unfiltered, ' + out.harshAA +
         ' filtered, against ' + out.harshMsaa + ' for the multisampled frame - the filter has ' +
         'to close that gap without crossing it, because the ground is pixel art drawn NEAREST ' +
         'on purpose and blurring it is the thing this game must not do');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
