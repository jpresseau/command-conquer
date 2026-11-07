# The 3D picture — the land past the edge, the light on a model, black lids, round rods, lit windows, panels, a vehicle's fireball, shallow water, stone, a lost GPU

Changes to how the battlefield is drawn, and to keeping it drawn. Each has a spec that holds it
and a kill switch that is its before-picture.

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
roster when it was found. A tank read as a khaki box ringed in black. The normal is now Newell's sum over all the
polygon's edges, exact for a planar polygon and never zero while it has area. Every mesh in the
3D view goes through this builder (the world batch, ore, farms, bridges, the base dressing too).
`unit/lids` holds it from both ends: the old way still finds thousands (7,192 once the rods below
replaced some of those boxes), the new one none.

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
- **A rim light was tried and taken out, twice.** Fresnel on these faceted models is not an
  outline: a wall turned side-on to the view takes it across its whole face, so it flattened the
  form it was meant to lift (a power plant brightened 24.7 inside against 7.1 at its outline).
  Tried again on units only, it lifted a tank by 42 levels and read as haze: the olive went pale
  and the dark treads blue-grey. At this camera's height there is little silhouette to catch.
- `e2e/modellight`: the fill brightens the building and adds less at night; steel lifts its dark
  third and not its paint; the contact shade darkens its foot and next to nothing above.

## A rod is round (`r3d/primitives.js` `_r3Rod`)

Every gun barrel, aerial, pipe, mast, railing and piling in the models was a long box with a square
end - a barrel drawn as a plank - because the box was the one primitive the models were written in.
In the 3D view's richer build (`_R3_DETAIL > 1`) a box whose long side is at least `R3_ROD_LEN` (3)
times its short sides, whose short sides are within `R3_ROD_SQ` (30%) of each other, and which is at
least `R3_ROD_MIN` (half a unit) thick, is a 16-sided cylinder along the long side, as long as the
box and as wide as its short sides' mean. A rod costs about what the rounded box it replaces did.
`unit/rods` counts 925 in 104 models: barrels, aerials, posts, chimney stacks, roof pipes, dock
pilings. The sprites and the plain far-off models build at detail 1 and keep the box.

- **What only looks like a rod stays a box.** A track's links are plates and a sprocket's teeth
  are teeth: `tracks()` (`sprites/unitmodels.js`) lays them with `_R3_ROD_OFF` set. Rounded, the 80
  on a tank looked no different at any zoom. A wheel's nuts and a railing's bars are under
  `R3_ROD_MIN`: a few pixels across, too thin for roundness to show.
- **Every rod is a difference from the plain model** that the middle zoom swaps in. `e2e/gpuwork`
  holds that swap under a quarter of the units' pixels; with every rod round it went over (774 of
  3,094), and with the exclusions it is 763, against 717 before.
- Judged by eye at the closest zoom, A against B (`R3_ROD_LEN = 1e9` with the mesh cache dropped):
  the Heavy tank's twin barrels and aerial are tubes, a power plant's roof fins a bank of pipes.

## Lit windows at night (`render3d/meshfs3d.js`)

At night a base was a field of dark boxes with lamps over the doors: the glass of every building -
the palette's glass, found the way `_tint` finds it - read as dull blue-grey, with nobody home. 26 of
the 44 buildings have glass, 2-16% of their surface, every base building among them.

- **By the hour's night.** `uNightK` is the sky's `night` (sky3d.js): 1 at night, half at dusk, a
  little in rain, fog, snow and sand, and it passes with the day in the cycle. By it a building's
  glass shows a warm room behind it. By day nothing changes.
- **Rooms, not windows.** The brightness drifts across a building with a slow noise rather than
  switching window by window: a window is a face the program cannot tell from its neighbour, and a
  cell of its own cut windows in half.
- **Only lived-in buildings.** `uBld` is set per batch for a building's meshes (`flushBatch`), so a
  vehicle's windscreen stays dark; nothing lights while a building rises, in a husk, or once a fire
  has blown its glass out (`R3D_GLASS_OUT`, hurt3d.js).
- `R3.winAmt` (`uLightK.y`) is the before-picture. `e2e/winlight`, a Research Lab up close.

## A building is built of panels (`render3d/panel3d.js`)

Seen from above at a phone's zoom, a building's roof and walls were each one flat colour: the
weathering is fine noise and fades as the view draws back, so what was left was painted card. Now a
building's flat walls are divided into panels (2 by 1.6 world units) and its roofs into sheets (2.4
square), each a shade lighter or darker than the next (±4% on a wall, ±3% on a roof) with a faint
seam between.

- **In the building's own frame** (`vMd`, the model-space position at world size, from the vertex
  stage), so the panels line up with its corners and centre lines wherever it stands.
- **Only faces square to it**: an upright wall facing along x or z, or a roof. A curve, a dome, a
  bevel and a sloped roof are left as they were. Not glass (that is lit windows'), and not
  anything but a building (`uBld`).
- **Faded by the pixels a panel spans** (`uPxW`, device pixels a world unit, set in `_r3dCamU`):
  whole from 12 px, gone below 7 (`R3D_PANEL_FADE`). A phone opens at 24 px a world unit and goes no
  wider than 12, so its panels are always whole; a 1x laptop's widest zoom (3) has none, where a
  seam would be a pixel and shimmer as the view moves.
- A seam only darkens, so a panelled building averages a little darker (4 levels on a Research Lab
  up close); the tone is even either way.
- `R3.panelAmt = 0` is the before-picture. `e2e/panels`.

## A vehicle goes up in a fireball (`render3d/wreckfx3d.js`)

Every unit died in the same `pop` (`core/capture.js`), a soldier and a Heavy Tank alike: a quick
fireball whose record lives 0.4 s, so its billows were gone in 0.19 - 0.15 s after a tank died
there was a grey haze with sparks in it. Only a building's death, a `boom`, read as an explosion.

- **Not a rule.** A `boom` record would have done it and moved the game: its crater eats the ore
  it lands in, and a scorch's look is drawn from the fx count. So the fireball is the renderer's
  alone. A vehicle that burns where it died leaves the fire record carrying its husk (`husk3d.js`);
  met in its first `R3D_WRECK_NEW` (0.3 s), that record is given a fireball - `_r3dFxBall`, the
  building's, with a life of 1 - aged from the death. The birth is kept in a WeakMap beside the
  record, never on it: the record is game state, and saved.
- **By the vehicle**: `R3D_WRECK_BIG`, from the radius the fire's base was set from - a Buggy
  1.06, a Heavy Tank 1.42, under a two-wide building's 2 and over the pop's 0.7.
- **Not old news**: a fire met already burning (a loaded game, a replay seek) only burns.
- The pop stays, and with it the sound (`_rtsKill` plays `pop` itself) and the music's heat.
- `R3.wreckAmt = 0` is the before-picture. `e2e/wreckfx`.

## The sea is shallow at its shore (`render3d/shelf3d.js`)

The sea was one deep blue from the foam line out. The shore's own look - foam, a turquoise line, the
seabed through thin water - lived inside the first fifth of a cell, because the only measure of the
coast the sea had was its mask: one texel a cell, read bilinear, so it runs from land to open water
in a single cell. A beach went from sand to the deep in a hand's breadth.

- **The mask carries the distance out.** Its green channel is how far each water cell lies from the
  nearest land, in cells (`_r3dShoreDist`: a two-pass chamfer, 1 along and root 2 across, capped at
  `R3D_SHELF_CAP`, 6), written with the mask (`world3d.js`) - so on a new map and whenever the tide
  turns, and the shallows walk out with the water. Off the map is not land: a sea that runs off the
  edge is open there. Within three cells the chamfer is never short and at most 0.18 of a cell long
  (`unit/shoredist`).
- **The water is coloured by it**, read at the same warped point the coast is cut at: the deep's
  colour turned toward turquoise and lifted, by `R3D_SHELF_TINT` (a ratio, so the swell's tone and
  the hour carry on through it), weighed 1 at the waterline and 0 from `R3D_SHELF_W` (2.6) cells
  out, falling as a square.
- **The caustics**: a net of thin bright lines drifting over the sand - two value noises drifting
  against each other, lit where they meet - strongest a little off the beach. Faded by the device
  pixels a world unit (`R3D_SHELF_FADE`, whole from 12): a phone's views always have them, a 1x
  laptop's widest zoom has none.
- **The apron's painted sea** (`terrain3d.js`) reads the same channel, so a shore reflected past the
  edge is shallow too.
- **Under snow the shore freezes by the same distance** (`_shoreD`): ice most of a cell out from the
  waterline, with a ragged edge, where it was the first third of a cell from the mask.
- `e2e/sea` counts the swell's and the chop's tones with the shallows off, as it does the clouds and
  the surf: on a still sheet the shelf's gradient is 1,400 tones of its own.
- `R3.shelfAmt = 0` is the before-picture; `R3.causticAmt = 0` takes the caustics alone out.
  `e2e/shallows`: a cell out the sea is +49 greener and +34 brighter; two out +7.5; four out, the
  land and the deep under the caustics untouched; under snow a cell out is ice (saturation 0.23
  against the open sea's 0.62, and 0.55 with the old third-of-a-cell ice).

## Rock is stone (`render3d/stone3d.js`)

The ridges are turned, tapered slabs and split crystals (`world3d.js`), each face one flat grey. Up
close at a phone's zoom they read as grey prisms - ice, or concrete, blue-violet in the sky's fill -
because nothing on a face said stone. Now a rock face of the world batch takes:

- **Relief** (`_stoneN`): gradient noise on the face's own plane, stretched along the height so it
  runs with the beds, tilts the normal before the face is lit (`R3D_STONE_BUMP`) - so it shows where
  the sun reaches, as relief does.
- **Bedding**: bands along the height, dipping a little and differently from ridge to ridge, and a
  faint seam at some of the bed boundaries - on the walls, not the tops.
- **Grain**: two noises at two scales. **Warm and cold**: iron stains and grey by a slow noise
  across the ridge. **Lichen**: olive patches on what faces up.
- **Only rock**: the world's own batches (`uStone`, `scene3d.js`), not the ore, the dressing or the
  scenery, and found by colour - rock is the palette's greys (saturation under 0.14), where bark
  and leaves are browns and greens at 0.4 and more. Not on the low tier.
- **Faded by the device pixels a world unit** (`R3D_STONE_FADE`, whole from 9): a phone's views
  always have it, a 1x laptop's widest zoom none.
- `R3.stoneAmt = 0` is the before-picture. `e2e/stone`, the rock marked by rebuilding it in
  magenta: at 24 px a unit 227k of 284k rock pixels change; neighbours differ by 2.25 where they
  differed by 1.49; twice as rough in the sun, 1.18 times in the shade; red over blue -11.4 where it
  was -23.1; 928 pixels of lichen; the yard, the widest zoom and the low tier untouched.

## A phone takes the GPU away (`render3d/lost3d.js`)

Reported from an iPhone: turned from landscape to portrait, the game stopped working - the sidebar
went on, the battlefield was the stage's flat grey. Turning a phone reallocates every full-screen
buffer at the new shape, which is when a phone reclaims GPU memory: the WebGL context is lost. A
lost context draws nothing and every call on it is a silent no-op, so nothing threw and the clock
ran on. A browser hands a lost context back only to a page that cancels `webglcontextlost`, and
nothing here did, so it never came back.

- **The loss is cancelled** (`_r3dWatchLoss`, once per canvas, from `_r3dInit`), which is what
  asks for the context back.
- **While it is lost nothing touches it**: `_r3dFrame` returns at once (`_r3dLostTick`), and the
  model warm-up waits (`pace3d.js`). A program built on a lost context fails to link and throws,
  and sixty failing frames in a row stop the loop for good (`RTS_LOOP_GIVEUP`, `ui/camera.js`).
- **It comes back from nothing.** On `webglcontextrestored` the view starts again on the same
  canvas; if the browser has said nothing after `R3D_LOST_WAIT` (1.5 s), on a fresh canvas
  swapped into the old one's slot, retried with a doubling wait while that fails. Starting from
  nothing is safe because every GPU object hangs off `window._R3D` and is built lazily on first
  use. The camera, the tier and AUTO's state, the resolution step and the sun are carried across
  (`R3D_LOST_KEEP`).
- **The GFX readout counts it**: `GPU lost N, back N` at the end of its second line, so a phone's
  report says whether this is what happened.
- `RTS_LOSS_OFF` is the before-picture: the restored context stays lost and the battlefield reads
  back blank. `e2e/ctxlost` turns a phone and drives both recoveries; each draws the picture from
  before the loss, sample for sample.
