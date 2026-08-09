/* Prerequisites: what a building needs before it can be built at all.

   `needs` names a CAPABILITY, not a particular building. The Refinery needs power and does not
   care which plant supplies it — and the code did care, which locked a base out of its own tech
   tree. Measured on the opponent, seed 9001, ten minutes with the player kept alive: it finished
   with two Advanced Power Plants and zero Power Plants, having built the advanced ones and then
   sold the basic ones as redundant — which is exactly what its own `lowerPower` strategy is for —
   and from that moment `_rtsCanProduce('refinery')` was false. It wanted a fourth refinery for
   368 of those seconds, had 405 legal places to put one and the money to pay for it, and was
   refused thirty times.

   THE PLAYER HAD THE SAME TRAP, which is why this is a unit spec and not a note in the AI one:
   build an Advanced Power Plant, sell the Power Plants it makes redundant, and the Refinery and
   the Barracks vanish from the sidebar with nothing to say why.

   These are pure table lookups over a fake G, so the whole thing runs without a browser. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('prereq');
var g = load(['src/rules', 'src/ui', 'src/core']);

/* A world containing exactly the structures named. `side` defaults to player; a key may be
   suffixed with '!' to mean "still under construction". */
function world(keys) {
  g.window._rtsG = {
    ents: keys.map(function (k) {
      var building = k.slice(-1) === '!';
      var parts = (building ? k.slice(0, -1) : k).split(':');
      return { type: 'struct', def: parts[0], side: parts[1] || 'player',
               dead: false, building: building };
    })
  };
  return g.window._rtsG;
}
function can(key, side) {
  return !!g._rtsAvailable(side || 'player', g.rtsStructDef(key));
}

/* ------------------------------------------------------------ the capability ----*/
(function () {
  world([]);
  S.eq('a refinery needs something first', can('refinery'), false);

  world(['power']);
  S.eq('...a Power Plant is that something', can('refinery'), true);

  /* The bug, stated as its own assertion. */
  world(['apower']);
  S.eq('...and so is an Advanced Power Plant on its own', can('refinery'), true);
  S.eq('...which is the whole point: it is power too', can('barracks'), true);

  /* The realistic shape of it - the base that upgraded and sold the old plants. */
  world(['yard', 'apower', 'apower', 'refinery', 'barracks', 'factory']);
  S.eq('a base that upgraded its power and sold the old plants can still build a refinery',
       can('refinery'), true);
  S.eq('...and can still build another advanced plant', can('apower'), true);
})();

/* ------------------------------------------------- a capability with no namesake ----
   Power was the capability this model was written for, and it hides the interesting half:
   there IS a structure keyed `power`, so every lookup happened to work even where it was
   looking up a key rather than a capability. `shipyard` is the first with no namesake at all -
   the Naval Yard and the Sub Pen both provide it, nothing is called it - and it is what lets
   ONE Transport entry be built by both armies rather than two units differing only in whose
   flag they fly. Every assertion below fails if `shipyard` is ever resolved as a key. */
(function () {
  function unitCan(key, side) {
    return !!g._rtsAvailable(side || 'player', g.rtsUnitDef(key));
  }
  S.ok('nothing in the roster is called a shipyard', !g.rtsStructDef('shipyard'),
       'which is the whole point of the case');

  world([]);
  S.eq('with no yard at all, no Transport', unitCan('lst'), false);

  world(['navalyard']);
  S.eq('an Allied Naval Yard is a shipyard', unitCan('lst'), true);
  world(['subpen']);
  S.eq('...and so is a Soviet Sub Pen, for the same unit', unitCan('lst'), true);

  /* The edges, which a key lookup gets wrong in both directions. */
  world(['navalyard!']);
  S.eq('a yard still under construction is not one yet', unitCan('lst'), false);
  world(['subpen:enemy']);
  S.eq('...nor is the other side\'s', unitCan('lst'), false);
  S.eq('...though it is theirs', unitCan('lst', 'enemy'), true);

  /* The sentence the sidebar puts in front of the player, which is where a capability with no
     namesake shows up as "Needs undefined first" if _rtsNeedName's fallback is ever dropped. */
  var say = g._rtsNeedName('shipyard');
  S.ok('a missing shipyard is explained by naming the buildings that ARE one',
       /Naval Yard/.test(say) && /Sub Pen/.test(say) && !/undefined/.test(say), say);
  S.eq('...while a capability that is also a building keeps its own name',
       g._rtsNeedName('power'), g.rtsStructDef('power').name);
})();

/* --------------------------------------------------------------- the edges ----*/
(function () {
  world(['power!']);
  S.eq('a plant still under construction does not count yet', can('refinery'), false);

  world(['power:enemy']);
  S.eq('...nor does the other side\'s', can('refinery'), false);
  S.eq('...though it counts for them', can('refinery', 'enemy'), true);

  world(['power']);
  S.eq('a chain is walked one link at a time: a factory needs a refinery', can('factory'), false);
  world(['power', 'refinery']);
  S.eq('...and has it now', can('factory'), true);

  world([]);
  S.eq('something with no prerequisite at all is always available', can('power'), true);
})();

/* ------------------------------------------------------- the table's own shape ----
   A prerequisite naming something nothing provides can never be satisfied, and the symptom is
   a building that silently never appears rather than an error. Checked against the table rather
   than against a list here, so a new structure with a typo'd `needs` fails this. */
(function () {
  var defs = g.RTS_STRUCTS, provided = {}, needed = {};
  defs.forEach(function (d) {
    provided[d.key] = 1;
    (d.provides || []).forEach(function (p) { provided[p] = 1; });
    (d.needs || []).forEach(function (n) { needed[n] = (needed[n] || 0) + 1; });
  });
  var orphan = Object.keys(needed).filter(function (n) { return !provided[n]; });
  S.ok('every prerequisite names something a building actually provides', !orphan.length,
       orphan.join(', ') || Object.keys(needed).length + ' distinct prerequisites, all provided');

  /* And `provides` must not claim a key another building already owns, unless it is its own -
     two buildings answering to one name is how a prerequisite stops meaning anything. */
  var claimed = {};
  defs.forEach(function (d) {
    (d.provides || []).forEach(function (p) {
      if (p !== d.key) (claimed[p] = claimed[p] || []).push(d.key);
    });
  });
  S.note('capabilities provided by a building other than their namesake: ' +
         (Object.keys(claimed).map(function (p) {
           return p + ' <- ' + claimed[p].join(', '); }).join('; ') || 'none'));

  /* Power is the one that matters today, and it is worth naming so a future edit that drops
     `provides` from the advanced plant fails here rather than in a screenshot ten minutes in. */
  var pow = defs.filter(function (d) {
    return d.key === 'power' || (d.provides || []).indexOf('power') >= 0;
  }).map(function (d) { return d.key; });
  S.ok('both power plants provide power', pow.indexOf('power') >= 0 && pow.indexOf('apower') >= 0,
       pow.join(', '));
})();

/* ------------------------------------------------- the AI does not spend the money ----
   The other half of the same failure. The unit line used to spend down to a flat
   `infantryReserve` of 2,000, while a non-urgent build needs the building's cost plus
   `creditReserve` on top - 3,000 for a 2,000-credit refinery. Money could not climb past the
   lower number without being turned into infantry, so whatever the opponent had not built by the
   time its early rich window closed, it never built. The floor is the higher of the two now. */
(function () {
  g.window._rtsG = { ents: [], ai: {} };
  S.eq('with nothing wanted the floor is the infantry reserve',
       g._rtsAISpare(null), g.RTS_AI.infantryReserve);

  g.window._rtsG.ai.want = { key: 'refinery' };
  var cost = g._rtsCostOf('enemy', g.rtsStructDef('refinery'));
  S.eq('wanting a refinery raises the floor to its cost plus the credit reserve',
       g._rtsAISpare(null), cost + g.RTS_AI.creditReserve);
  S.ok('...which is above the infantry reserve, or the ratchet is back',
       cost + g.RTS_AI.creditReserve > g.RTS_AI.infantryReserve,
       cost + ' + ' + g.RTS_AI.creditReserve + ' vs ' + g.RTS_AI.infantryReserve);

  g.window._rtsG.ai.want = { key: 'kennel' };
  var cheap = g._rtsCostOf('enemy', g.rtsStructDef('kennel'));
  S.eq('a cheap building does not lower the floor below the infantry reserve',
       g._rtsAISpare(null), Math.max(g.RTS_AI.infantryReserve, cheap + g.RTS_AI.creditReserve));

  g.window._rtsG.ai.want = { key: 'notabuilding' };
  S.eq('a want naming nothing falls back rather than throwing',
       g._rtsAISpare(null), g.RTS_AI.infantryReserve);
})();

require('../lib/report.js')(S);
