/* The crate table.

   A crate is the one thing in the game that hands a unit a permanent modifier, and the
   modifiers are the part that can go wrong quietly. A bonus is stored on the unit as `u.cr[k]`
   and then has to be READ back somewhere - by the damage calculation, the reload timer, the
   armour divisor, the speed. Add a modifier nobody reads and the crate still announces itself,
   still plays its sound, still consumes the pickup, and does nothing whatsoever. That is the
   same silent-success failure as a sound with no synth branch, and it is checked the same way:
   against the call sites, not against a list written out here.

   The caps are the other half. `rof` is the odd one out - lower is faster, so its cap is a
   FLOOR and the code clamps it with Math.max while everything else uses Math.min. A cap
   written on the wrong side of 1 does not fail, it just stops capping: set rof's to 2.2 and
   Math.max(2.2, v) pins every unit's reload at 2.2x SLOWER than stock, which is a nerf
   delivered by a bonus crate. */

var fs = require('fs');
var path = require('path');
var { Suite } = require('../lib/assert.js');
var { load, read: srcText } = require('../lib/sandbox.js');

var S = new Suite('crates');
var ROOT = path.resolve(__dirname, '..', '..');
var g = load(['src/rules', 'src/ui', 'src/core']);

var CR = g.RTS_CRATES, CAP = g.RTS_CRATE_CAP;
var unitKeys = {};
g.RTS_UNITS.forEach(function (u) { unitKeys[u.key] = u; });

S.note(CR.length + ' crate kinds, total weight ' +
       CR.reduce(function (n, c) { return n + c.w; }, 0) + '; ' +
       g.RTS_CRATE_MAX + ' on the map at once, living ' +
       (g.RTS_CRATE_TIME * 0.5) + '-' + (g.RTS_CRATE_TIME * 2) + ' minutes');

/* ------------------------------------------------------------------ the table ---- */
(function () {
  var dup = [], seen = {}, bad = [];
  CR.forEach(function (c) {
    if (seen[c.key]) dup.push(c.key);
    seen[c.key] = 1;
    if (!(c.w > 0)) bad.push(c.key + ' has weight ' + c.w);
    if (!c.name) bad.push(c.key + ' has no name to announce');
  });
  S.ok('no two crates share a key', !dup.length, dup.join(', ') || CR.length + ' distinct');
  S.ok('every crate has a positive weight and a name', !bad.length,
       bad.join('; ') || CR.map(function (c) { return c.key + ':' + c.w; }).join(' '));

  /* The weighted pick walks the list subtracting until it goes non-positive, so a zero total
     would return the first entry every time and a single dominant weight makes the rest
     unreachable in practice. Neither is a crash. */
  var total = CR.reduce(function (n, c) { return n + c.w; }, 0);
  S.ok('the weights add up to something to pick from', total > 0, 'total ' + total);
  var biggest = CR.reduce(function (m, c) { return Math.max(m, c.w); }, 0);
  S.ok('...and no single kind crowds out the rest', biggest < total * 0.5,
       'the heaviest is ' + Math.round(biggest / total * 100) + '% of the pool');

  /* A booby trap among the bonuses is what makes a crate a decision rather than free value.
     Without it there is no reason not to detour for every one on the map. */
  var trap = CR.filter(function (c) { return c.key === 'mine'; });
  S.ok('there is a booby trap in the pool', trap.length === 1,
       trap.length ? Math.round(trap[0].w / total * 100) + '% of pickups' : 'NONE');
  S.ok('...and it is a real risk without being the common case',
       trap.length && trap[0].w / total > 0.03 && trap[0].w / total < 0.25,
       trap.length ? (Math.round(trap[0].w / total * 100) + '%') : '');
})();

/* ---------------------------------------------------------------- the caps ----
   Direction matters more than magnitude here, and it is not symmetric. */
(function () {
  var mults = {};
  CR.forEach(function (c) {
    if (!c.mult) return;
    Object.keys(c.mult).forEach(function (k) { mults[k] = c.mult[k]; });
  });
  S.ok('the bonus crates modify something', Object.keys(mults).length >= 3,
       Object.keys(mults).map(function (k) { return k + '×' + mults[k]; }).join(' '));

  var uncapped = Object.keys(mults).filter(function (k) { return CAP[k] == null; });
  S.ok('every modifier a crate hands out has a cap', !uncapped.length,
       uncapped.join(', ') || 'all of ' + Object.keys(mults).join(', ') + ' are capped');

  var wrongWay = [];
  Object.keys(mults).forEach(function (k) {
    var step = mults[k], cap = CAP[k];
    if (cap == null) return;
    if (step > 1) {
      /* a bonus that multiplies UP is clamped with Math.min, so its cap must be above 1 and
         above one step, or the very first crate is already at the ceiling */
      if (!(cap > 1)) wrongWay.push(k + ' steps up by ' + step + ' but its cap is ' + cap);
      else if (cap < step) wrongWay.push(k + ' steps to ' + step + ' past a cap of ' + cap);
    } else if (step < 1) {
      /* rof: lower is faster, clamped with Math.max, so the cap is a FLOOR below 1 */
      if (!(cap < 1)) wrongWay.push(k + ' steps down to ' + step + ' but its cap is ' + cap +
                                    ', which Math.max would apply as a penalty');
      else if (cap > step) wrongWay.push(k + ' steps to ' + step + ' but floors at ' + cap);
    } else wrongWay.push(k + ' multiplies by exactly 1 and does nothing');
  });
  S.ok('every cap is on the right side of 1 for the direction its bonus moves', !wrongWay.length,
       wrongWay.join('; ') || Object.keys(mults).map(function (k) {
         return k + ' ' + mults[k] + '→' + CAP[k];
       }).join(', '));

  /* And the cap has to allow more than one crate, or stacking - which the source describes as
     the thing being limited - never happens at all. */
  var oneAndDone = Object.keys(mults).filter(function (k) {
    var step = mults[k], cap = CAP[k];
    return step > 1 ? (step * step > cap * 1.0001) : (step * step < cap * 0.9999);
  });
  S.ok('...and leaves room for at least two crates to stack', !oneAndDone.length,
       oneAndDone.join(', ') || 'two of each fit under the cap');
})();

/* -------------------------------------------------- every bonus is actually read ----
   The check this file exists for. A modifier stored and never consulted is a crate that
   celebrates and does nothing. rtsCrateMult(e, what) is the only reader, so the `what` strings
   it is called with ARE the set of modifiers the game honours. */
(function () {
  var src = srcText('src/core');
  var read = {};
  (src.match(/rtsCrateMult\(\s*[A-Za-z_$][\w$.]*\s*,\s*'([a-z]+)'/g) || []).forEach(function (m) {
    read[m.replace(/.*'([a-z]+)'.*/, '$1')] = 1;
  });
  var granted = {};
  CR.forEach(function (c) { if (c.mult) Object.keys(c.mult).forEach(function (k) { granted[k] = 1; }); });

  S.ok('the source reads crate modifiers back at all', Object.keys(read).length > 0,
       'read: ' + Object.keys(read).sort().join(', '));
  var dead = Object.keys(granted).filter(function (k) { return !read[k]; });
  S.ok('every modifier a crate grants is read back somewhere', !dead.length,
       dead.length ? ('granted but never consulted: ' + dead.join(', ')) :
                     (Object.keys(granted).sort().join(', ') + ' all consumed'));
  /* the reverse is not a fault - a multiplier the code honours that no crate hands out is a
     hook waiting for one - but it is worth saying out loud */
  var unused = Object.keys(read).filter(function (k) { return !granted[k]; });
  S.note(unused.length ? ('read but no crate grants it: ' + unused.join(', '))
                       : 'no unused modifier hooks');
})();

/* --------------------------------------------------------------- the contents ---- */
(function () {
  var bad = g.RTS_CRATE_UNITS.filter(function (k) { return !unitKeys[k]; });
  S.ok('every unit a crate can contain exists', !bad.length,
       bad.join(', ') || g.RTS_CRATE_UNITS.join(', '));

  /* "things that are useful on their own, in the open, with no support. An engineer or a thief
     handed to you in the middle of nowhere is a unit with nothing to do." */
  var useless = g.RTS_CRATE_UNITS.filter(function (k) {
    var d = unitKeys[k];
    return d && !d.weapon && !d.harvest && !d.deploy;
  });
  S.ok('...and every one of them can do something unaccompanied', !useless.length,
       useless.join(', ') || 'all armed, harvesting or deployable');

  /* The list is SHARED between the armies and holds faction-locked entries - the Light Tank is
     Allied-only - so the thing that has to be true is not that every entry suits everyone, it
     is that whichever army opens the crate has something to be handed. Dropping the other
     army's entries at the point of use is the same pattern the AI's base plan uses; what a
     table check can establish is that the filter never empties the pool. */
  var perArmy = ['allied', 'soviet'].map(function (side) {
    return { side: side, pool: g.RTS_CRATE_UNITS.filter(function (k) {
      var d = unitKeys[k];
      return d && g.rtsBuildableBy(d, side);
    }) };
  });
  var thin = perArmy.filter(function (a) { return a.pool.length < 2; });
  S.ok('...and whichever army opens it has a real choice to be handed', !thin.length,
       thin.map(function (a) { return a.side + ' has only ' + a.pool.length; }).join('; ') ||
       perArmy.map(function (a) { return a.side + ': ' + a.pool.join('/'); }).join('   '));
  /* The MCV in particular, since it is the entry that can bring a player back from nothing. */
  var noMcv = perArmy.filter(function (a) { return a.pool.indexOf('mcv') < 0; });
  S.ok('...including the MCV, whichever army it is', !noMcv.length,
       noMcv.map(function (a) { return a.side; }).join(', ') || 'both armies can be handed one');

  /* UDATA.CPP marks the MCV as crate-able, and the source calls out why it matters: a player
     who has lost their yard is not out of the game while a crate might hand them one. */
  S.ok('the MCV is among them, which is what keeps a yard-less player alive',
       g.RTS_CRATE_UNITS.indexOf('mcv') >= 0, g.RTS_CRATE_UNITS.join(', '));

  var m = g.RTS_CRATE_MONEY;
  S.ok('the money crate pays a real range', m.length === 2 && m[0] > 0 && m[1] > m[0],
       m[0] + '-' + m[1] + ' credits');
  S.ok('...centred near RULES.CPP SoloCrateMoney(2000)',
       (m[0] + m[1]) / 2 >= 1500 && (m[0] + m[1]) / 2 <= 2500,
       'midpoint ' + ((m[0] + m[1]) / 2));
  S.ok('the booby trap hurts enough to matter', g.RTS_CRATE_MINE_DMG > 0 && g.RTS_CRATE_MINE_RADIUS > 0,
       g.RTS_CRATE_MINE_DMG + ' damage over ' + g.RTS_CRATE_MINE_RADIUS.toFixed(1) + ' world units');
  /* It has to be survivable by the things most likely to walk into it, or the trap is a
     delete-a-unit button rather than a risk. */
  var oneShot = g.RTS_UNITS.filter(function (u) { return u.hp <= g.RTS_CRATE_MINE_DMG; })
    .map(function (u) { return u.key + ' (' + u.hp + 'hp)'; });
  S.note(oneShot.length ? ('killed outright by a booby trap: ' + oneShot.join(', '))
                        : 'no unit is killed outright by a booby trap');
})();

/* ----------------------------------------------------------------- placement ---- */
(function () {
  S.ok('there are crates on the map at all', g.RTS_CRATE_MAX > 0, g.RTS_CRATE_MAX + ' at once');
  S.ok('...but not so many that the map is a car boot sale', g.RTS_CRATE_MAX <= 8,
       g.RTS_CRATE_MAX + ' at once');
  S.ok('the spot search gives up rather than spinning for ever', g.RTS_CRATE_TRIES > 0,
       g.RTS_CRATE_TRIES + ' tries');
  S.ok('a crate lives long enough to be worth walking to', g.RTS_CRATE_TIME > 0,
       'CrateTime ' + g.RTS_CRATE_TIME + ' minutes, so ' + (g.RTS_CRATE_TIME * 30) + '-' +
       (g.RTS_CRATE_TIME * 120) + ' seconds');
})();

require('../lib/report.js')(S);
