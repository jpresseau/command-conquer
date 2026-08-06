/* Invariants over the roster tables.

   These are the checks that catch a whole class of bug the game cannot report on itself: a
   unit nothing can build, a prerequisite naming a structure that does not exist, a weapon
   nobody defined, a production building whose category no tab shows. Every one of those is
   invisible from inside a match - the thing simply never appears - and every one is a pure
   data question, answerable with no browser and no game running. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('rules');
/* rts.ui.js is loaded for RTS_TABS alone - the roster's index lives with the sidebar that draws
   it. Neither file touches the DOM at load time; the sandbox's document throws if either tries. */
var g = load(['src/rts.rules.js', 'src/rts.ui.js', 'src/rts.core.js']);

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

require('../lib/report.js')(S);
