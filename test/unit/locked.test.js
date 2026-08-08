/* Why a cameo is locked - and the fact that there is exactly one answer.

   The same rules used to be written out three times: _rtsCanQueue refused, _rtsCanProduce
   decided whether the sidebar drew the cameo enabled, and the sidebar's per-frame pass had a
   third copy as `avail`. They had drifted. Measured in the running game, full tech tree, one
   Commando already alive: the queue said no, _rtsCanProduce said YES, the cameo was drawn
   enabled, and clicking it played the deny beep and printed an EMPTY message line. The `only`
   cap lived in the queue alone, and the "no Construction Yard" rule in _rtsCanProduce alone -
   so a player who lost their yard could go on spending credits on buildings.

   `_rtsWhyLocked` is now the single answer, and the point of this spec is less each individual
   rule than the agreement: what the tile is greyed from, what the click says, and what the
   queue enforces are one function, so a rule that is missing here is missing everywhere rather
   than in two places out of three.

   Pure table lookups over a fake G, so no browser. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('locked');
var g = load(['src/rules', 'src/ui', 'src/core']);

/* A world holding the named structures, and optionally some units. Keys may be suffixed with
   '!' for "still under construction"; unit entries are prefixed 'u:'. */
function world(keys, q) {
  g.window._rtsG = {
    ents: (keys || []).map(function (k) {
      if (k.slice(0, 2) === 'u:') return { type: 'unit', def: k.slice(2), side: 'player', dead: false };
      var building = k.slice(-1) === '!';
      return { type: 'struct', def: building ? k.slice(0, -1) : k, side: 'player',
               dead: false, building: building };
    }),
    sides: { player: { q: q || {}, ready: null, credits: 100000, ore: 0 } }
  };
  return g.window._rtsG;
}
function why(key) { return g._rtsWhyLocked('player', key); }

/* The player is Allied unless a case says otherwise - rtsHouseSide reads it from here. */
g.window._RTS_VOXSIDE = 'allied';

/* Every ground rule below is about buildings and infantry, and a full base makes them one-liners
   rather than six lines of setup each. */
var BASE = ['yard', 'power', 'refinery', 'barracks', 'factory', 'radar', 'lab'];

/* ------------------------------------------------------- it answers, or it does not ----*/
(function () {
  world(BASE);
  S.eq('a thing you can build is not locked', why('barracks'), null);
  S.eq('...nor is a unit you can build', why('rifle'), null);
  world([]);
  var w = why('refinery');
  S.ok('with nothing standing, a refinery says what it wants', !!w, w);
  S.ok('...and names it', /Power Plant/.test(w || ''), w);
})();

/* -------------------------------------------------------------- the yard ----
   The rule that was in _rtsCanProduce and NOT in the queue. */
(function () {
  world(['power', 'refinery', 'barracks', 'factory']);
  var w = why('apower');
  S.ok('a building with no Construction Yard is refused', !!w, w);
  S.ok('...and told which building is missing', /Construction Yard/.test(w || ''), w);
  S.eq('...and the queue agrees, which it did not before',
       g._rtsCanQueue('player', 'apower'), false);

  /* But a UNIT does not need the yard - the barracks makes it. */
  world(['power', 'barracks']);
  S.eq('infantry do not need a Construction Yard', why('rifle'), null);
})();

/* -------------------------------------------------------- the production line ----*/
(function () {
  world(['yard', 'power', 'factory']);
  var w = why('rifle');
  S.ok('infantry with no Barracks are refused', !!w, w);
  S.ok('...by name', /Barracks/.test(w || ''), w);

  world(['yard', 'power', 'barracks']);
  w = why('buggy');
  S.ok('a vehicle with no War Factory is refused', !!w, w);
  S.ok('...by name', /War Factory/.test(w || ''), w);

  /* Under construction is not standing. */
  world(['yard', 'power', 'barracks!']);
  S.ok('a Barracks still going up does not train anybody yet', !!why('rifle'), why('rifle'));
})();

/* ------------------------------------------------------------- the one-at-a-time cap ----
   The rule that was in the queue alone, and so was enforced by a silent beep. */
(function () {
  world(BASE);
  S.eq('the Commando is buildable with the tech and none alive', why('tanya'), null);

  world(BASE.concat(['u:tanya']));
  var w = why('tanya');
  S.ok('...and refused with one already alive', !!w, w);
  S.ok('...saying so, rather than nothing at all', /one at a time/.test(w || ''), w);

  /* One on the way counts too, or the queue takes three orders before the first appears. */
  world(BASE, { infantry: { key: 'tanya' } });
  S.ok('one already on the line counts as one alive', !!why('tanya'), why('tanya'));

  /* A dead one does not. */
  var G = world(BASE.concat(['u:tanya']));
  G.ents[G.ents.length - 1].dead = true;
  S.eq('a dead Commando frees the slot', why('tanya'), null);

  /* And the cap is per side. */
  G = world(BASE.concat(['u:tanya']));
  G.ents[G.ents.length - 1].side = 'enemy';
  S.eq('the enemy\'s Commando is not yours', why('tanya'), null);
})();

/* ------------------------------------------------------------------ the other army ----*/
(function () {
  world(BASE);
  var w = why('tesla');                                   /* Soviet, and the player is Allied */
  S.ok('the other army\'s kit is refused outright', !!w, w);
  S.ok('...and says why, rather than listing prerequisites you can never meet',
       /other army/.test(w || ''), w);
})();

/* ------------------------------------------------------- naming a capability ----
   `needs` names a capability, not a key (see test/unit/prereq). The sentence has to survive a
   capability that no building is named after, or the sidebar throws while explaining itself. */
(function () {
  S.eq('a capability that IS a building is called by its name',
       g._rtsNeedName('power'), g.rtsStructDef('power').name);
  S.eq('...and one that is not falls back on whatever provides it',
       g._rtsNeedName('nosuchcapability'), 'nosuchcapability');

  /* The branch that will actually fire the day somebody adds a capability nothing is named
     after. There is no such capability in the shipped tables - which is exactly why it has to
     be constructed here, or the fallback ships untested and throws the first time it is used. */
  var fake = { key: 'zzfake', name: 'Test Depot', provides: ['hangarage'] };
  var fake2 = { key: 'zzfake2', name: 'Second Depot', provides: ['hangarage'] };
  g.RTS_STRUCTS.push(fake);
  S.eq('a capability no building is named after is called after the one that provides it',
       g._rtsNeedName('hangarage'), 'Test Depot');
  g.RTS_STRUCTS.push(fake2);
  S.eq('...and after both, when either will do', g._rtsNeedName('hangarage'),
       'Test Depot or Second Depot');
  g.RTS_STRUCTS.pop(); g.RTS_STRUCTS.pop();
  S.eq('...and the table is left as it was', g.RTS_STRUCTS.indexOf(fake), -1);

  /* And every prerequisite in the table renders to something a player can read - no
     "undefined", no bare key where a name was meant. */
  var bad = [];
  g.RTS_STRUCTS.concat(g.RTS_UNITS).forEach(function (d) {
    (d.needs || []).forEach(function (n) {
      var nm = g._rtsNeedName(n);
      if (!nm || nm === n) bad.push(d.key + ' needs ' + n + ' -> ' + nm);
    });
  });
  S.ok('every prerequisite in the tables renders as a readable name', !bad.length,
       bad.join('; ') || 'all named');
})();

/* --------------------------------------------------------------- the agreement ----
   The whole reason this function exists. _rtsCanProduce is now defined as "no reason", and the
   queue must never accept something the sidebar would grey out. Walked over every buildable
   thing in several base states rather than asserted on one. */
(function () {
  var states = [
    { name: 'empty map', keys: [] },
    { name: 'yard only', keys: ['yard'] },
    { name: 'yard + power', keys: ['yard', 'power'] },
    { name: 'no yard, full base', keys: ['power', 'refinery', 'barracks', 'factory'] },
    { name: 'full base', keys: BASE },
    { name: 'full base, Commando alive', keys: BASE.concat(['u:tanya']) }
  ];
  var keys = g.RTS_STRUCTS.map(function (d) { return d.key; })
    .concat(g.RTS_UNITS.map(function (d) { return d.key; }));
  var mismatch = [], accepted = [];
  states.forEach(function (st) {
    world(st.keys);
    keys.forEach(function (k) {
      var w = g._rtsWhyLocked('player', k);
      if (g._rtsCanProduce('player', k) !== !w) mismatch.push(st.name + '/' + k);
      /* Credits are unlimited in these worlds and every line is idle, so the queue's only
         remaining grounds for refusal are the ones _rtsWhyLocked owns. */
      if (w && g._rtsCanQueue('player', k)) accepted.push(st.name + '/' + k);
    });
  });
  S.ok('_rtsCanProduce says exactly what _rtsWhyLocked says', !mismatch.length,
       mismatch.join(', ') || states.length + ' base states x ' + keys.length + ' items');
  S.ok('the queue never accepts something the sidebar would grey out', !accepted.length,
       accepted.join(', ') || 'none');
})();

require('../lib/report.js')(S);
