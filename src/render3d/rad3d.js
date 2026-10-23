/* render3d/rad3d.js - radiation on the page (core/rad.js).

   Poisoned ground glows: a green light lying on the terrain over each pool and round each deployed
   Blight Trooper, breathing slowly, as bright as the pool is strong and dimming as it fades.
   Drawn into the light batch with the glare of fires (fxemit3d.js), wherever the player can see.
   R3.radOff draws none, for a spec's A/B. The ray itself is the Lens Tower's beam in green
   (fxemit3d.js _r3dFxBeam, `rad` on the effect). */
var R3D_RAD = { col: [0.55, 1.45, 0.30], ray: [0.70, 1.60, 0.35], op: 0.55, breathe: 0.25, hz: 0.6 };

function _r3dFxRad(G, V) {
  var R3 = window._R3D;
  if (R3 && R3.radOff) return;
  var src = _rtsRadSources();
  if (!src.length) return;
  var vis = typeof _rtsVisible === 'function';
  for (var i = 0; i < src.length; i++) {
    var p = src[i];
    if (vis && !_rtsVisible(_rtsTX(p.x), _rtsTX(p.z))) continue;
    var k = Math.min(1, p.dps / RTS_RAD.aura.dps) * (1 - R3D_RAD.breathe + R3D_RAD.breathe * Math.sin(((V.t || 0) * R3D_RAD.hz + i * 0.37) * Math.PI * 2));
    _r3dFxDecal(V.L, V, p.x, p.z, p.r, 4, 0.6, R3D_FXT_LIGHT, 0, i + 1, R3D_RAD.op * k * V.gnd, R3D_RAD.col);
  }
}
