/* rules/skirmish.js - the skirmish setup: how big the map is, how much water it has, and what
   each side starts with. Part of rts.rules, the data.

   The DEFAULT of every option is the battle this game has always made, exactly: a 128-cell map,
   one inlet down a flank, 3000 credits. unit/fingerprint holds that, so a seeded battle, a daily
   or a campaign mission never moves when a player picks something else here - they ask for the
   default by name (_rtsSkirmishOf(null)), and only the title's START BATTLE reads the choice.

   The size is RTS_N for the battle: _rtsNewGame sets it before anything is allocated, and every
   reader takes it live. The water is the inlet's radius and offset in core/terrain.js: INLAND has
   none (the navy is off the table for both sides), LAGOON a wide one, so more of the map is sea
   and more of it is tidal flats. Money is both sides' start, never only the player's: on easy and
   normal the computer was measured to leave a surplus untouched, so a rich start helps whoever
   spends it. */

var RTS_N_DEFAULT = 128;
var RTS_SKIRMISH = {
  size:  { small: { name: 'SMALL', n: 96 }, standard: { name: 'STANDARD', n: 128 }, large: { name: 'LARGE', n: 160 } },
  water: { inland: { name: 'INLAND', r: 0, off: 0 }, coast: { name: 'COAST', r: 6.2, off: 16 }, lagoon: { name: 'LAGOON', r: 10, off: 20 } },
  money: { standard: { name: '3,000', credits: 3000 }, rich: { name: '6,000', credits: 6000 }, flush: { name: '10,000', credits: 10000 } },
  /* who else is on the field: the computer seats beyond the one opponent (RTS_SEATS) */
  foes:  { one: { name: '1 FOE', extra: [] }, two: { name: '2 FOES', extra: ['enemy2'] },
           ally: { name: 'FOE + ALLY', extra: ['ally'] }, team: { name: '2 V 2', extra: ['ally', 'enemy2'] } }
};
var RTS_SKIRMISH_DEFAULT = { size: 'standard', water: 'coast', money: 'standard', foes: 'one' };

/* THE SEATS. A seat's team is fixed by its name, so an ally is always the player's army and on the
   player's team, and a second opponent is the first opponent's: everything that has to know whose
   side a seat is on before a battle exists (the army it builds, the colours it is baked in) reads
   it here. `near` is the seat an extra base is put beside. */
var RTS_SEATS = {
  player: { team: 0 }, enemy: { team: 1 },
  ally:   { team: 0, near: 'player', name: 'Ally' },
  enemy2: { team: 1, near: 'enemy',  name: 'Second foe' }
};

/* A whole, valid choice from any partial or stale one: an unknown key falls back to the default. */
function _rtsSkirmishOf(s) {
  var out = {};
  for (var k in RTS_SKIRMISH_DEFAULT) out[k] = s && RTS_SKIRMISH[k][s[k]] ? s[k] : RTS_SKIRMISH_DEFAULT[k];
  return out;
}
