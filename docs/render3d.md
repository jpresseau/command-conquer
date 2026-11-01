# The 3D picture — the land past the edge, the light on a model, and the black lids

Three changes to how the battlefield is drawn, made together and measured together. Each has a
spec that holds it and a kill switch that is its before-picture.

## The land runs on past the map's edge (`render3d/apron3d.js`)

The ground was the visible patch clamped to the map (`ground3d.js` `_r3dGroundMesh`), and past the
edge the frame was the clear colour, near black: a band across the top of every view, two-fifths of
the screen at the widest zoom, with the map ending on a ruled line under it.

- **The apron is the map mirrored across each edge.** Its mesh is cut on the tile grid like the
  ground's, over what is in view out to `R3D_APRON` half-widths past the map, less the map itself.
  Each vertex stands at the height of the point it mirrors (`_r3dMir`), its slope flipped across the
  edge, and its texture coordinate is the mirrored one. A reflection is continuous at the line it
  reflects in, so there is no seam, and no second terrain is needed.
- **It draws through the ground's own material program** (`R3.matP`), straight after the ground.
  `uMir` in the ground vertex shader (`R3D_TEX_VS`) reads the materials at the mirrored point and
  hands on `vO`, the distance outside the map; the materials fragment shader fades by it into the
  horizon (`uHz`, `uHzF`, `R3D_APRON_FADE`).
- **Only the land is reflected.** `uApr` (terrain3d.js) turns paving, concrete and track into
  grass, skips the road paint, the scorch and the craters, the ore soil and the lamplight. Without
  it the apron showed a ghost of the base - its plaza and its roads - and a field of ore nobody
  could reach.
- **The sea is painted**, not drawn: the water is a mesh of its own over the water cells
  (`wave3d.js`), so the apron reads the sea mask at the mirrored point (`uSeaA`, on texture unit 6
  - unit 7 is the roads', and the mask there made the road paint pave the whole apron grey).
- **The shroud is mirrored with it**: the apron is drawn again in the shroud's pass with its
  mirrored texture coordinates, so it is dark where what it reflects is unexplored.
- **The clear colour is the horizon** (`_r3dHorizon`: the day's horizon lit as the sky lights the
  land, drawn toward the sky's haze), so past the apron the distance is haze, not a line. The fade
  ends (0.85 half-widths) before the apron does (1.0), so its outer edge is never seen.
- **Not on the LOW tier** (`quality3d.js` `apron`): it is the ground's whole material shader over
  up to two-fifths of the screen. There the distance is the horizon's colour.
- `RTS_APRON_OFF` is the before-picture. `e2e/apron`.

## Every face has a normal (`render3d/mesh3d.js` `_r3dFaceNormal`)

The mesh builder took a face's normal from its first three corners. The 3D view builds its models
richer than the sprites (`_r3DetailHigh`): every box's chamfer becomes a rounded edge
(`r3d/curves.js` `_r3RoundBox`), and that box's cap is a polygon that starts with three points in a
line - two ends of a corner arc and the straight run between. So the cap got a zero normal, the
shader normalised it into NaN, and every rounded box at the high and medium tiers had a black lid:
barrel tops, fenders, hull plates, roof parts, on every unit and building - 8,628 faces across the
roster. A tank read as a khaki box ringed in black. The normal is now Newell's sum over all the
polygon's edges, exact for a planar polygon and never zero while it has area. Every mesh in the
3D view goes through this builder (the world batch, ore, farms, bridges, the base dressing too).
`unit/lids` holds it from both ends: the old way finds the 8,628, the new one none.

## The light on a model (`render3d/light3d.js` `_shade`, `meshfs3d.js`)

The ramp lit a model with one sun and one floor. Three terms on top of it, each with a knob:

- **The fill** (`R3.fillAmt`): the sky's cool light from above and the earth's warm bounce from
  below, by the hour - a hull's flank and a wall's underside are coloured by where they face
  instead of all going the ramp's one grey. Kept nearly neutral: a cool cast of a dozen levels on
  every upward face read as a blue world and pushed grey stone out of `e2e/rock`'s grey family.
- **Steel** (`R3.metalAmt`): the dark, unsaturated parts of a placed model - tracks, road wheels,
  barrels, trims, the palette's `dark` - reflect the sky or the ground in the direction they face
  the eye (`uView`, worked out in `_r3dCamU` every time) and take a broader sun highlight than
  paint. Without it the steel read as holes in a model.
- **Seated** (`R3.gaoAmt`): the lowest hand-span of a placed unit or building is darkened, in its
  own and the earth's shade. Only for what is placed: `uGAO` is set in `flushBatch` and cleared
  after, so the world batch is untouched.
- **A rim light was tried and taken out.** Fresnel on these faceted models is not an outline: a
  wall turned side-on to the view takes it across its whole face, so it flattened the form it was
  meant to lift (a power plant brightened 24.7 inside against 7.1 at its outline).
- `e2e/modellight`: the fill brightens the building and adds less at night; steel lifts its dark
  third and not its paint; the contact shade darkens its foot and next to nothing above.
