/* Invariants over the roster tables.

   These are the checks that catch a whole class of bug the game cannot report on itself: a
   unit nothing can build, a prerequisite naming a structure that does not exist, a weapon
   nobody defined, a production building whose category no tab shows. Every one of those is
   invisible from inside a match - the thing simply never appears - and every one is a pure
   data question, answerable with no browser and no game running. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('rules');
/* src/ui is loaded for RTS_TABS alone - the roster's index lives with the sidebar that draws
   it. Nothing here touches the DOM at load time; the sandbox's document throws if it tries.
   These are directories: naming the subsystem gets every part of it in load order, so a spec
   cannot fall behind a file that was added or split. */
var g = load(['src/rules', 'src/ui', 'src/core']);

var UNITS = g.RTS_UNITS, STRUCTS = g.RTS_STRUCTS, WEAPONS = g.RTS_WEAPONS;
var structKeys = {}, unitKeys = {};
STRUCTS.forEach(function (s) { structKeys[s.key] = s; });
UNITS.forEach(function (u) { unitKeys[u.key] = u; });
S.note(UNITS.length + ' units, ' + STRUCTS.length + ' structures, ' +
       Object.keys(WEAPONS).length + ' weapons');

/* ------------------------------------------------------------------ identity ---- */
(function () {
  var dupU = [], dupS = [], seen = {};
  UNITS.forEach(function (u) { if (seen[u.key]) dupU.push(u.key); seen[u.key] = 1; });
  seen = {};
  STRUCTS.forEach(function (s) { if (seen[s.key]) dupS.push(s.key); seen[s.key] = 1; });
  S.ok('no duplicate unit keys', !dupU.length, dupU.join(', ') || 'all unique');
  S.ok('no duplicate structure keys', !dupS.length, dupS.join(', ') || 'all unique');
  var clash = Object.keys(unitKeys).filter(function (k) { return structKeys[k]; });
  S.ok('no key is both a unit and a structure', !clash.length, clash.join(', ') || 'none');
})();

/* ------------------------------------------------------- reachable from a tab ----
   RTS_TABS is the roster's index. A unit whose kind has no tab exists, builds, fights and can
   never be selected for production - which is exactly how the Attack Heli shipped unbuildable
   for a while. */
(function () {
  var tabKinds = {};
  g.RTS_TABS.forEach(function (t) { tabKinds[t[0]] = t[1]; });
  var orphans = UNITS.filter(function (u) { return !tabKinds[u.kind]; })
                     .map(function (u) { return u.key + ' (kind ' + u.kind + ')'; });
  S.ok('every unit kind has a sidebar tab', !orphans.length, orphans.join(', ') || Object.keys(tabKinds).join(', '));

  /* And the reverse: a tab with nothing in it is a dead button. 'struct' is the exception by
     construction - it lists STRUCTURES, which is why it is the one tab whose contents come from
     RTS_STRUCTS rather than RTS_UNITS. */
  var empty = Object.keys(tabKinds).filter(function (k) {
    return k !== 'struct' && !UNITS.some(function (u) { return u.kind === k; });
  });
  S.ok('no unit tab is empty for both factions', !empty.length, empty.join(', ') || 'all populated');
  S.ok('the Build tab has structures in it', STRUCTS.length > 0, STRUCTS.length + ' structures');

  /* Per faction, since each side sees a different roster - a tab that is empty for one side
     only is still a dead button for that player. Reported rather than asserted: the Soviets
     genuinely have no aircraft yet, and that is a known gap, not a regression to fail on. */
  ['allied', 'soviet'].forEach(function (side) {
    var blank = Object.keys(tabKinds).filter(function (k) {
      return k !== 'struct' && !UNITS.some(function (u) { return u.kind === k && (!u.side || u.side === side); });
    });
    S.note(side + ' sees ' + (Object.keys(tabKinds).length - blank.length) + '/' +
           Object.keys(tabKinds).length + ' tabs populated' +
           (blank.length ? ' — EMPTY: ' + blank.join(', ') : ''));
  });
})();

/* -------------------------------------------------------------- prerequisites ---- */
(function () {
  var bad = [];
  UNITS.concat(STRUCTS).forEach(function (d) {
    (d.needs || []).forEach(function (n) {
      if (!structKeys[n]) bad.push(d.key + ' needs "' + n + '", which is not a structure');
    });
  });
  S.ok('every prerequisite names a real structure', !bad.length, bad.join('; ') || 'all resolve');

  /* A prerequisite your own faction cannot build is a unit you can never have. */
  var unbuildable = [];
  UNITS.concat(STRUCTS).forEach(function (d) {
    ['allied', 'soviet'].forEach(function (side) {
      if (d.side && d.side !== side) return;
      (d.needs || []).forEach(function (n) {
        var pre = structKeys[n];
        if (pre && pre.side && pre.side !== side)
          unbuildable.push(d.key + ' is ' + (d.side || 'both') + ' but needs ' + n +
                           ' which is ' + pre.side + '-only');
      });
    });
  });
  S.ok('no faction needs a prerequisite it cannot build', !unbuildable.length,
       unbuildable.join('; ') || 'none');
})();

/* -------------------------------------------------------------------- weapons ---- */
(function () {
  var missing = [];
  UNITS.concat(STRUCTS).forEach(function (d) {
    if (d.weapon && !WEAPONS[d.weapon]) missing.push(d.key + ' carries "' + d.weapon + '"');
  });
  S.ok('every weapon named by a unit or building exists', !missing.length,
       missing.join('; ') || 'all resolve');

  /* Damage is looked up per armour class; a class with no entry silently deals nothing. */
  var classes = {};
  UNITS.concat(STRUCTS).forEach(function (d) { if (d.armour) classes[d.armour] = 1; });
  var gaps = [];
  Object.keys(WEAPONS).forEach(function (w) {
    var vs = WEAPONS[w].vs;
    if (!vs) return;
    Object.keys(classes).forEach(function (c) {
      if (vs[c] === undefined) gaps.push(w + ' has no entry for armour "' + c + '"');
    });
  });
  S.ok('every weapon rates every armour class in use', !gaps.length,
       gaps.slice(0, 6).join('; ') || Object.keys(classes).sort().join(', '));
})();

/* ------------------------------------------------------------------ production ----
   A building that produces a category is the thing _rtsBuildRate counts for the multi-factory
   speedup. The Helipad carried produces:'air' and got no speedup at all because the rate
   function hardcoded two categories instead of reading this field. */
(function () {
  var producers = STRUCTS.filter(function (s) { return s.produces; });
  var cats = {};
  producers.forEach(function (s) { cats[s.produces] = (cats[s.produces] || 0) + 1; });
  S.note('producers: ' + producers.map(function (s) { return s.key + '→' + s.produces; }).join(', '));

  var kinds = {};
  UNITS.forEach(function (u) { kinds[u.kind] = 1; });
  var unproduced = Object.keys(kinds).filter(function (k) { return !cats[k]; });
  S.ok('every unit kind has a building that produces it', !unproduced.length,
       unproduced.join(', ') || Object.keys(cats).sort().join(', '));

  var noKind = Object.keys(cats).filter(function (c) { return !kinds[c]; });
  S.ok('no building produces a category with no units in it', !noKind.length,
       noKind.join(', ') || 'none');
})();

/* ------------------------------------------------------------------- numbers ---- */
(function () {
  /* The Command Yard is free and instant on purpose - you never buy one, you start with it or
     you deploy an MCV into it - so it is the one thing exempt from the cost and time floors. */
  var FREE = { yard: 1 };
  var bad = [];
  UNITS.concat(STRUCTS).forEach(function (d) {
    if (!FREE[d.key] && !(d.cost > 0)) bad.push(d.key + ' costs ' + d.cost);
    if (!(d.hp > 0)) bad.push(d.key + ' has ' + d.hp + ' hp');
    if (!FREE[d.key] && d.build !== undefined && !(d.build > 0)) bad.push(d.key + ' builds in ' + d.build);
    if (!d.name) bad.push(d.key + ' has no display name');
  });
  S.eq('the Command Yard is still the only free, instant building',
       STRUCTS.filter(function (s) { return !(s.cost > 0); }).map(function (s) { return s.key; }).join(','),
       'yard');
  S.ok('every buildable thing has a name, a positive cost, hp and build time', !bad.length,
       bad.join('; ') || 'all sane');

  var sides = {};
  UNITS.concat(STRUCTS).forEach(function (d) { if (d.side) sides[d.side] = (sides[d.side] || 0) + 1; });
  var odd = Object.keys(sides).filter(function (s) { return s !== 'allied' && s !== 'soviet'; });
  S.ok('faction tags are only allied or soviet', !odd.length, odd.join(', ') ||
       (sides.allied + ' allied, ' + sides.soviet + ' soviet, ' +
        (UNITS.length + STRUCTS.length - sides.allied - sides.soviet) + ' shared'));

  /* Both sides need a comparable set of basics, or one of them cannot play. */
  ['allied', 'soviet'].forEach(function (side) {
    var can = function (d) { return !d.side || d.side === side; };
    var s = STRUCTS.filter(can), u = UNITS.filter(can);
    S.ok(side + ' can build a yard, power, refinery and barracks',
         ['yard', 'power', 'refinery', 'barracks'].every(function (k) {
           return s.some(function (x) { return x.key === k; }); }));
    S.ok(side + ' has at least one defensive structure',
         s.some(function (x) { return x.weapon; }),
         s.filter(function (x) { return x.weapon; }).map(function (x) { return x.key; }).join(', '));
    S.ok(side + ' has infantry and vehicles',
         u.some(function (x) { return x.kind === 'infantry'; }) &&
         u.some(function (x) { return x.kind === 'vehicle'; }));
  });
})();

/* ---------------------------------------------- the opponent's base plan ----
   RTS_AI holds the plan as THREE separate tables that have to agree: `buildOrder` says what to
   build and in what order, `ratio` says how much of the base each type should be, and `limit`
   caps it. A key present in the order and absent from either of the others is not a smaller
   plan - it is a NaN.

   `_rtsAIWants` computes `want = ceil(base * ratio[key])` and compares it against what is
   standing. With no ratio entry that is `ceil(base * undefined)` = NaN, every comparison
   against NaN is false, and the building is skipped for ever with nothing logged.

   That is not hypothetical: `tesla` sat in buildOrder with no entry in either table, so the
   Soviet opponent could never build its signature defence. Measured over three seeds at hard,
   420 seconds: zero Tesla Coils, against 10.0 defensive buildings for the Allied house. */
(function () {
  var AI = g.RTS_AI, keys = {};
  g.RTS_STRUCTS.forEach(function (d) { keys[d.key] = d; });

  var noRatio = AI.buildOrder.filter(function (k) { return AI.ratio[k] === undefined; });
  var noLimit = AI.buildOrder.filter(function (k) { return AI.limit[k] === undefined; });
  S.ok('every building in the AI build order has a ratio', !noRatio.length,
       noRatio.join(', ') || AI.buildOrder.length + ' checked');
  S.ok('...and a limit', !noLimit.length,
       noLimit.join(', ') || AI.buildOrder.length + ' checked');

  /* And in the other direction: a ratio for something the order never reaches is a number
     nobody reads, which is the trap the audit found three more of elsewhere in this table. */
  var orphanR = Object.keys(AI.ratio).filter(function (k) { return AI.buildOrder.indexOf(k) < 0; });
  var orphanL = Object.keys(AI.limit).filter(function (k) { return AI.buildOrder.indexOf(k) < 0; });
  S.ok('no ratio names a building the order never asks for', !orphanR.length, orphanR.join(', ') || 'none');
  S.ok('no limit does either', !orphanL.length, orphanL.join(', ') || 'none');

  /* Every name is a real structure, and every number is usable. */
  var unknown = AI.buildOrder.filter(function (k) { return !keys[k]; });
  S.ok('every building in the order exists in the structure table', !unknown.length,
       unknown.join(', ') || 'all real');
  var badN = AI.buildOrder.filter(function (k) {
    var r = AI.ratio[k], l = AI.limit[k];
    return !(r > 0 && r <= 1) || !(l >= 1 && l === Math.floor(l));
  });
  S.ok('every ratio is a fraction and every limit a whole number of buildings', !badN.length,
       badN.map(function (k) { return k + ' ' + AI.ratio[k] + '/' + AI.limit[k]; }).join(', ') || 'all sane');

  /* Both armies' defences are in one order and _rtsCanQueue drops the other side's, so each
     army has to have something left after that filter - the whole arrangement depends on it. */
  ['allied', 'soviet'].forEach(function (side) {
    var mine = AI.buildOrder.filter(function (k) {
      return g.rtsBuildableBy(keys[k], side); });
    var def = mine.filter(function (k) { return !!keys[k].weapon; });
    S.ok('a ' + side + ' opponent has defensive buildings it can actually build', def.length >= 2,
         def.join(', '));
  });
})();

/* --------------------------------------- aiming a defence, not aiming "a turret" ----
   _rtsAIWeakZone counts a zone's defence as "structures with a weapon" - and its ONE call site
   asked for it by name, `key === 'turret'`, which is Allied-only. So the whole Which_Zone port
   ran for one army and never for the other: measured over three seeds at hard, the Allied house
   spread its defences across 4 of 4 compass zones every time and the Soviet house managed 1, 3
   and 2, with all seven of seed 9001's defences on one side of the base.

   The property worth pinning is that the two halves use the same definition. A source scan is
   the honest way to check it - the alternative is standing up a whole fake base to call a
   placement function that wants anchors, terrain and an ore field. */
(function () {
  var src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'core', 'ai.js'), 'utf8');
  var named = src.match(/key === '(\w+)'/g) || [];
  var defenceNames = named.filter(function (m) {
    var k = m.replace(/.*'(\w+)'.*/, '$1');
    var d = g.rtsStructDef(k);
    return d && d.weapon;
  });
  S.ok('no defensive building is singled out by name in the placement code', !defenceNames.length,
       defenceNames.join(', ') || 'none - aiming is keyed off the weapon');
  S.ok('...and the weak-zone aim is still wired up at all', /_rtsAIWeakZone\(\)/.test(src),
       'called');

  var weaponed = g.RTS_STRUCTS.filter(function (d) { return !!d.weapon; }).map(function (d) { return d.key; });
  S.ok('there is more than one defensive building, so keying off the weapon matters',
       weaponed.length > 1, weaponed.join(', '));
})();

require('../lib/report.js')(S);
