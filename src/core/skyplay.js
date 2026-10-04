/* core/skyplay.js - the weather takes part.

   The sky was scenery: fog, a sandstorm, a downpour were all a picture and nothing else. Two of
   them now change the battle, for both sides alike:

     FOG     under fog or a sandstorm nothing sees past RTS_FOG_CELLS cells. The player's sight
             discs shrink to it (_rtsVisTick), and nothing on either side FINDS a target further
             off (_rtsFindTarget). A gun given its target keeps its full reach, and one that is
             shot at still answers (core/response.js) - only the looking is shortened. So the long
             guns - artillery, the cruisers, the towers - wait for the enemy to come close, and a
             fog is the day to walk up on a fortified line.
     STORM   in a downpour on the rain sky (the shower at RTS_STORM_RAIN or more, _rtsShower in
             render3d/sky3d.js) every armed aircraft is grounded: it flies home to its pad as if
             its rack were empty and sits there until the storm passes (core/move.js). The Chinook
             still flies - it carries, it does not fight - and an aircraft with no pad left to go
             to rides the storm out in the air rather than crashing for want of one.

   THE BATTLE'S WEATHER IS FIXED AT ITS FIRST TICK (G.sky), so the simulation never reads the
   player's preference again: a sky changed on the title cannot change a battle already going, a
   save carries its weather with it, and the daily battle is under its seed's own sky for everyone
   (_rtsSkyName). The shower clock is the game's, so a storm comes at the same second every time
   a battle is played. A page without the renderer - the unit sandbox - fights under a clear day. */

var RTS_FOG_CELLS = 5;
var RTS_FOG_SKIES = { fog: 'Fog', sand: 'Sandstorm' };
var RTS_STORM_RAIN = 0.5;
var RTS_SKY_SAY = 6;            /* seconds into a battle before the weather is named */

function _rtsFogged() { var G = window._rtsG; return !!(G && RTS_FOG_SKIES[G.sky]); }

/* A sight disc, in cells, under this battle's sky. */
function _rtsFogSight(cells) { return _rtsFogged() ? Math.min(cells, RTS_FOG_CELLS) : cells; }
/* How far a unit looks for something to shoot, in world units, under this battle's sky. */
function _rtsFogReach(range) { return _rtsFogged() ? Math.min(range, RTS_FOG_CELLS * RTS_TILE) : range; }

/* Is the rain sky storming at game time t? */
function _rtsStormAt(sky, t) {
  return sky === 'rain' && typeof _rtsShower === 'function' && _rtsShower(t).rain >= RTS_STORM_RAIN;
}
/* Does the storm hold this aircraft on the ground? Asked by _rtsAirTick. */
function _rtsStormGrounds(e, d) { var G = window._rtsG; return !!(G && G.storm && d.weapon); }

function _rtsSkyPlayTick() {
  var G = window._rtsG;
  if (!G.sky) G.sky = typeof _rtsSkyName === 'function' ? _rtsSkyName(G) : 'day';
  var was = !!G.storm;
  G.storm = _rtsStormAt(G.sky, G.t);
  /* the battle's opening line has the floor for its first seconds; then the weather is named once */
  if (G.t < RTS_SKY_SAY) return;
  if (!G.skySaid) {
    G.skySaid = 1;
    if (RTS_FOG_SKIES[G.sky]) _rtsSay(RTS_FOG_SKIES[G.sky] + ': nothing sees past ' + RTS_FOG_CELLS + ' cells.', 6);
    else if (G.storm) _rtsSay('Storm: aircraft grounded.', 5);
    return;
  }
  if (G.storm && !was) _rtsSay('Storm: aircraft grounded.', 5);
  else if (was && !G.storm) _rtsSay('The storm has passed - aircraft can fly.', 5);
}
