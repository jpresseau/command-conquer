/* INVARIANTS BETWEEN WHAT THE OPPONENT BUYS AND WHAT IT DOES WITH IT.

   RTS_AI.mix is the shopping list and RTS_TEAM_TYPES is the plan, and nothing in the game ties
   the two together: _rtsAIUnits rolls the mix without asking any team whether it wants the
   hull, and _rtsTeamRecruit fills a team by exact unit key. So the two tables can disagree
   silently, and the failure is invisible from inside a match - the unit is bought, it appears,
   it is never seen doing anything, and the credits are simply gone.

   Both directions are real faults and this spec asserts both. A pure data question: no browser,
   no build, no game running. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('aiplan');
var g = load(['src/rules', 'src/ui', 'src/core']);

var MIX = g.RTS_AI.mix, TEAMS = g.RTS_TEAM_TYPES;
var unitKeys = {};
g.RTS_UNITS.forEach(function (u) { unitKeys[u.key] = u; });

/* Which team types field each unit key, and every key either table mentions. */
var fielded = {};
TEAMS.forEach(function (t) {
  for (var k in t.members) (fielded[k] = fielded[k] || []).push(t.name);
});
var mixKeys = {};
for (var cat in MIX) MIX[cat].forEach(function (e) { mixKeys[e.key] = cat; });

S.note(Object.keys(mixKeys).length + ' units in the shopping list, ' +
       TEAMS.length + ' team types: ' + TEAMS.map(function (t) { return t.name; }).join(', '));

/* ------------------------------------------------------------------ both tables are real ----
   A typo in either is a silent no-op: an unknown key is never rolled and never recruited. */
(function () {
  var badMix = Object.keys(mixKeys).filter(function (k) { return !unitKeys[k]; });
  S.ok('every unit the opponent shops for exists', !badMix.length,
       badMix.join(', ') || Object.keys(mixKeys).length + ' keys resolve');

  var badTeam = Object.keys(fielded).filter(function (k) { return !unitKeys[k]; });
  S.ok('every unit a team asks for exists', !badTeam.length,
       badTeam.join(', ') || Object.keys(fielded).length + ' keys resolve');
})();

/* --------------------------------------------------------- a team must be crewable at all ----
   A team only marches at FULL STRENGTH, so a type listing a unit the opponent never buys can
   recruit part of itself and then wait forever - holding a team slot the whole time. */
(function () {
  var starved = [];
  TEAMS.forEach(function (t) {
    for (var k in t.members) if (!mixKeys[k]) starved.push(t.name + ' wants ' + k);
  });
  S.ok('every team is made of units the opponent actually buys', !starved.length,
       starved.join(', ') || 'all ' + TEAMS.length + ' types crewable');
})();

/* -------------------------------------------------- ...and the opponent can get there ----
   A shopping list is only worth what the base plan can unlock. RTS_AI.buildOrder is the only
   route the opponent has to a structure, so a unit whose prerequisites include something not
   on that list is a line in the mix that can never be rolled - and, if a team is built around
   it, a team that can never be a candidate. Neither says anything when it happens; the unit
   simply never appears, which is how the Attack Heli once shipped unbuildable.

   The Cruiser is the live case: it needs a Tech Center on top of a Naval Yard, and it is only
   worth adding to the mix at all because both are on the list.

   `provides` has to be resolved rather than matching structure keys, or this reads as a fault
   where the design is deliberate: the Transport asks for `shipyard`, which no structure is
   keyed, because the Allied Naval Yard and the Soviet Sub Pen both PROVIDE it - that is how one
   faction-neutral hull is buildable by two armies from two different buildings. The Cruiser
   asks for `navalyard` by key instead, and should: it is Allied, and a Sub Pen must not
   produce one. */
(function () {
  var structs = {};
  g.RTS_STRUCTS.forEach(function (s) { structs[s.key] = s; });
  var plan = {};
  g.RTS_AI.buildOrder.forEach(function (k) {
    plan[k] = 1;
    ((structs[k] || {}).provides || []).forEach(function (p) { plan[p] = 1; });
  });
  var unreachable = [];
  Object.keys(mixKeys).forEach(function (k) {
    (unitKeys[k].needs || []).forEach(function (n) {
      if (!plan[n]) unreachable.push(k + ' needs ' + n);
    });
  });
  S.ok('every unit the opponent shops for is one its base plan can unlock', !unreachable.length,
       unreachable.join(', ') || g.RTS_AI.buildOrder.length + ' structures in the build order');
})();

/* ------------------------------------------------------------ and every hull has a job ----
   THE ASYMMETRY IS THE POINT, and it is why this is asserted of ships and reported of
   everything else. A tank in no team is not wasted: it swells the spare pool that raises teams
   at all, and it defends the base when the base is hit. Neither is open to a boat. A hull that
   no team fields cannot drive to a building under attack and cannot crew a type that does not
   list it, so it sits at the yard for the rest of the match - and hulls are the dearest things
   the opponent buys.

   This is not hypothetical: the Cruiser shipped into the mix at 2,000 credits before any team
   listed it, and would have done exactly that. */
/* AIRCRAFT ARE THE SAME ARGUMENT AS HULLS, and were the same fault. A plane in no team cannot
   drive to a building under attack any more than a boat can, so it sits on its pad - and it is
   capped at one per pad, so the waste is a fixed fraction of the whole air force rather than one
   unit among many.
   Measured before the Sortie, Intercept and Strafe types existed, over six matches long enough
   for a pad to be built: NINE aircraft bought, TWO of which ever had an attack order, and both of
   those in the single run where the player came to them. Seven of nine spent the match parked at
   900 to 1,400 credits each. After: twenty-four bought and twenty-two flew. */
(function () {
  var planes = (MIX.air || []).map(function (e) { return e.key; });
  var grounded = planes.filter(function (k) { return !fielded[k]; });
  S.ok('every aircraft the opponent buys is fielded by some team', !grounded.length,
       grounded.length ? grounded.join(', ') + ' — bought, and never sent anywhere'
                       : planes.map(function (k) { return k + '→' + fielded[k].join('+'); }).join('  '));
})();

(function () {
  var hulls = (MIX.ship || []).map(function (e) { return e.key; });
  var idle = hulls.filter(function (k) { return !fielded[k]; });
  S.ok('every hull the opponent buys is fielded by some team', !idle.length,
       idle.length ? idle.join(', ') + ' would sit at the yard'
                   : hulls.map(function (k) { return k + '→' + fielded[k].join('+'); }).join('  '));

  /* And the Cruiser specifically is escorted. It carries no sonar - see RTS_UNITS - so an
     unescorted one is a submarine's lunch, which e2e/navy measures. A team that sent it out
     alone would be spending the dearest hull in the game on a gift. */
  var alone = TEAMS.filter(function (t) {
    if (!t.members.cruiser) return false;
    var others = Object.keys(t.members).filter(function (k) { return k !== 'cruiser'; });
    return !others.length;
  }).map(function (t) { return t.name; });
  S.ok('no team sails a Cruiser unescorted', !alone.length,
       alone.join(', ') || TEAMS.filter(function (t) { return t.members.cruiser; })
                                .map(function (t) { return t.name + ': ' + Object.keys(t.members).join('+'); })
                                .join(', ') || 'no cruiser team');
})();

/* Reported, not asserted: the land and air units no team lists. Every one of them still has
   employment - the spare pool and base defence - so this is a design fact rather than a fault,
   but it is the number that would tell us if teams stopped covering the army altogether. */
(function () {
  var loose = Object.keys(mixKeys).filter(function (k) {
    return mixKeys[k] !== 'ship' && !fielded[k];
  });
  S.note('bought but in no team composition (land and air, employed by the spare pool and by ' +
         'base defence rather than by a team): ' + (loose.join(', ') || 'none'));
})();

require('../lib/report.js')(S);
