/* The scenario layer's tables: team types and triggers.

   These are the two tables in the game that are read as SCRIPTS rather than as values. A
   mission list is walked by an index, a trigger is a pair of event slots wired to a pair of
   action slots, and every entry in both is a name looked up in another table at runtime. That
   makes them the one place where a typo is not a crash but a silence: a mission naming a
   waypoint that does not exist, a `loop` pointing past the end of its own list, an event whose
   argument is the wrong kind of thing. The game has no author to catch it - RA's triggers come
   from hand-written campaign INIs, and rts.rules.js says so - so nothing between writing the
   entry and watching the opponent behave oddly reports the mistake.

   Three classes of check, and the third is the interesting one:

     1. every name resolves - missions, events, actions, teams, triggers, units, waypoints
     2. every argument is the KIND its table says it must be. `need` is declared right there
        in RTS_TMISSIONS, RTS_TEVENTS and RTS_TACTIONS, and nothing was checking entries
        against it
     3. the invariants the source states in prose, which are the ones that go quietly wrong:
        the autocreate split being a hard split rather than a preference, and the trigger list
        being deliberately balance-neutral

   All pure. Tables in, verdict out, no browser. The MACHINERY that walks them - the latch, the
   persistence rules, the owner/argument house distinction - is e2e/scenario. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('scenario');
var g = load(['src/rts.rules.js', 'src/rts.ui.js', 'src/rts.core.js']);

var TEAMS = g.RTS_TEAM_TYPES, TRIGS = g.RTS_TRIGGERS;
var TMISSIONS = g.RTS_TMISSIONS, TEVENTS = g.RTS_TEVENTS, TACTIONS = g.RTS_TACTIONS;

/* The two vocabularies the scripts draw on, taken from the code that resolves them rather
   than written out again here: _rtsBuildWaypoints is the only thing that creates waypoints,
   and _rtsQuarryMatch is the only thing that interprets a quarry. A list copied by hand would
   drift the moment either changed, and drift SILENTLY - it would go on approving the old
   names and start rejecting the new ones. */
var WAYPOINTS = (function () {
  var src = g._rtsBuildWaypoints.toString(), out = {}, m;
  var re = /\bW\.([a-z]+)\s*=/g;
  while ((m = re.exec(src))) out[m[1]] = 1;
  return out;
})();
var QUARRIES = (function () {
  var src = g._rtsQuarryMatch.toString(), out = { anything: 1 }, m;
  var re = /quarry\s*===\s*'([a-z]+)'/g;
  while ((m = re.exec(src))) out[m[1]] = 1;
  return out;
})();

var unitKeys = {}, structKeys = {};
g.RTS_UNITS.forEach(function (u) { unitKeys[u.key] = u; });
g.RTS_STRUCTS.forEach(function (s) { structKeys[s.key] = s; });
var teamNames = {}, trigNames = {};
TEAMS.forEach(function (t) { teamNames[t.name] = t; });
TRIGS.forEach(function (t) { trigNames[t.name] = t; });

S.note(TEAMS.length + ' team types, ' + TRIGS.length + ' triggers; waypoints: ' +
       Object.keys(WAYPOINTS).sort().join(', ') + '; quarries: ' +
       Object.keys(QUARRIES).sort().join(', '));
S.ok('the waypoint and quarry vocabularies were recovered from the code',
     Object.keys(WAYPOINTS).length >= 4 && Object.keys(QUARRIES).length >= 5,
     Object.keys(WAYPOINTS).length + ' waypoints, ' + Object.keys(QUARRIES).length + ' quarries');

/* Shared argument checker. `need` is declared by the tables themselves, so this is the tables
   being held to their own word rather than to a second list written here. */
function checkArg(where, need, arg, bad) {
  switch (need) {
    case 'none': return;
    case 'number':
      if (typeof arg !== 'number' || !isFinite(arg)) bad.push(where + ' wants a number, got ' + JSON.stringify(arg));
      return;
    case 'text':
      if (typeof arg !== 'string' || !arg.length) bad.push(where + ' wants text, got ' + JSON.stringify(arg));
      return;
    case 'bool':
      if (typeof arg !== 'boolean') bad.push(where + ' wants a boolean, got ' + JSON.stringify(arg));
      return;
    case 'waypoint':
      if (!WAYPOINTS[arg]) bad.push(where + ' names a waypoint that does not exist: ' + JSON.stringify(arg));
      return;
    case 'quarry':
      if (!QUARRIES[arg]) bad.push(where + ' names a quarry that does not exist: ' + JSON.stringify(arg));
      return;
    case 'house':
      if (arg !== 'player' && arg !== 'enemy') bad.push(where + ' wants a house, got ' + JSON.stringify(arg));
      return;
    case 'struct':
      if (!structKeys[arg]) bad.push(where + ' names a structure that does not exist: ' + JSON.stringify(arg));
      return;
    case 'unit':
      if (!unitKeys[arg]) bad.push(where + ' names a unit that does not exist: ' + JSON.stringify(arg));
      return;
    case 'team':
      if (!teamNames[arg]) bad.push(where + ' names a team type that does not exist: ' + JSON.stringify(arg));
      return;
    case 'trigger':
      if (!trigNames[arg]) bad.push(where + ' names a trigger that does not exist: ' + JSON.stringify(arg));
      return;
    case 'sound':
      /* A sound the mixer does not handle plays nothing and reports nothing - the same silent
         failure e2e/audio exists for, reached from the scenario side. */
      if (typeof arg !== 'string' || !arg.length) bad.push(where + ' wants a sound name, got ' + JSON.stringify(arg));
      return;
    default:
      bad.push(where + ' declares an unknown need: ' + need);
  }
}

/* =============================================================== team types ==== */
(function () {
  var dup = [], seen = {};
  TEAMS.forEach(function (t) { if (seen[t.name]) dup.push(t.name); seen[t.name] = 1; });
  S.ok('no two team types share a name', !dup.length, dup.join(', ') || TEAMS.length + ' distinct');

  /* --- the mission scripts --- */
  var bad = [], loops = [], total = 0;
  TEAMS.forEach(function (t) {
    if (!t.missions || !t.missions.length) return;      /* a type may be declared without one */
    t.missions.forEach(function (m, i) {
      total++;
      var where = t.name + ' mission ' + i + ' (' + m[0] + ')';
      var def = TMISSIONS[m[0]];
      if (!def) { bad.push(where + ': no such mission'); return; }
      if (m[0] === 'loop') {
        /* A loop is a jump into its own list, so the only thing that makes it valid is the
           length of that list. Out of range and the team either runs off the end or spins
           on a line that is not there; a loop onto ITSELF is a team that stops for ever
           without ever disbanding, which reads in a match as an opponent that raised an
           army and then did nothing with it. */
        if (typeof m[1] !== 'number' || m[1] < 0 || m[1] >= t.missions.length)
          loops.push(where + ' jumps to line ' + m[1] + ' of a ' + t.missions.length + '-line script');
        else if (m[1] === i)
          loops.push(where + ' jumps to itself');
        return;
      }
      checkArg(where, def.need, m[1], bad);
    });
  });
  S.ok('every team mission names a real mission and takes the argument its table declares',
       !bad.length, bad.join('; ') || total + ' missions across ' + TEAMS.length + ' types');
  S.ok('every loop jumps somewhere inside its own script', !loops.length,
       loops.join('; ') || 'all loop targets in range');

  /* The scripts must TERMINATE in something, and "something" means a line the team can sit
     on for ever: a loop back, or a mission that never completes. A script that simply runs
     off its last line is the case the Raiders comment describes - a team with nothing left
     to do, which the game has to notice and disband or leave standing about. */
  var openEnded = TEAMS.filter(function (t) {
    if (!t.missions || !t.missions.length) return false;
    var last = t.missions[t.missions.length - 1][0];
    return last !== 'loop' && last !== 'tarcom' && last !== 'guard';
  }).map(function (t) { return t.name + ' ends on ' + t.missions[t.missions.length - 1][0]; });
  S.ok('every mission script ends on a line the team can hold', !openEnded.length,
       openEnded.join('; ') || 'all scripts terminate in loop, tarcom or guard');

  /* --- composition --- */
  var members = [], factional = [];
  TEAMS.forEach(function (t) {
    var n = 0;
    Object.keys(t.members || {}).forEach(function (k) {
      n += t.members[k];
      var d = unitKeys[k];
      if (!d) { members.push(t.name + ' wants ' + k + ', which is not a unit'); return; }
      /* THE OPPONENT'S FACTION IS NOT FIXED - it is the opposite of whatever the player
         picked, so a team calling for a faction-locked unit can be raised in one match and
         impossible to fill in the other. The failure is a team type that silently never
         forms, which looks like an easier opponent rather than a bug. */
      ['allied', 'soviet'].forEach(function (side) {
        if (!g.rtsBuildableBy(d, side))
          factional.push(t.name + ' wants ' + k + ', which ' + side + ' cannot field');
      });
    });
    if (!n) members.push(t.name + ' has no members at all');
  });
  S.ok('every team is made of units that exist', !members.length,
       members.join('; ') || TEAMS.length + ' compositions');
  S.ok('...and that either faction can field, because the opponent\'s side follows the player\'s',
       !factional.length, factional.join('; ') || 'no faction-locked members');

  var quarries = [];
  TEAMS.forEach(function (t) {
    if (!QUARRIES[t.quarry]) quarries.push(t.name + ' hunts "' + t.quarry + '", which is not a quarry');
  });
  S.ok('every team hunts a target category that exists', !quarries.length,
       quarries.join('; ') || TEAMS.map(function (t) { return t.quarry; }).join(', '));

  var caps = TEAMS.filter(function (t) { return !(t.max >= 1) || !(t.priority >= 0); })
    .map(function (t) { return t.name + ' max=' + t.max + ' priority=' + t.priority; });
  S.ok('every team type has a positive cap and a priority', !caps.length, caps.join('; ') || 'all set');

  /* --- THE AUTOCREATE SPLIT ---
     rts.rules.js: "the original's filter is a hard SPLIT, not a preference: an alerted house
     draws only from autocreate types, an unalerted house only from the rest." So an empty side
     is not a lighter opponent, it is a house that can raise NO TEAMS AT ALL for that whole
     phase of the match - and it fails silently, because nothing reports a team that was never
     suggested. Both halves must be populated. */
  var early = TEAMS.filter(function (t) { return !t.autocreate; });
  var late = TEAMS.filter(function (t) { return !!t.autocreate; });
  S.ok('the unalerted opponent has team types to draw on', early.length > 0,
       early.map(function (t) { return t.name; }).join(', ') || 'NONE - an unalerted house can raise nothing');
  S.ok('the alerted opponent has team types to draw on', late.length > 0,
       late.map(function (t) { return t.name; }).join(', ') || 'NONE - an alerted house can raise nothing');
  S.ok('...and enough capacity in each half to field more than one team',
       early.reduce(function (n, t) { return n + t.max; }, 0) >= 2 &&
       late.reduce(function (n, t) { return n + t.max; }, 0) >= 2,
       'before the alert ' + early.reduce(function (n, t) { return n + t.max; }, 0) +
       ' teams, after it ' + late.reduce(function (n, t) { return n + t.max; }, 0));
})();

/* ================================================================= triggers ==== */
(function () {
  var dup = [], seen = {};
  TRIGS.forEach(function (t) { if (seen[t.name]) dup.push(t.name); seen[t.name] = 1; });
  S.ok('no two triggers share a name', !dup.length, dup.join(', ') || TRIGS.length + ' distinct');

  var bad = [], structural = [];
  TRIGS.forEach(function (T) {
    if (T.house !== 'player' && T.house !== 'enemy')
      structural.push(T.name + ' is owned by "' + T.house + '"');
    if (['volatile', 'semi', 'persistent'].indexOf(T.persist) < 0)
      structural.push(T.name + ' has persist="' + T.persist + '"');
    var control = T.control || 'only';
    if (['only', 'and', 'or', 'linked'].indexOf(control) < 0)
      structural.push(T.name + ' has control="' + control + '"');
    /* A trigger combining two events but declaring only one can never be satisfied for `and`,
       and wastes the slot for `or`/`linked`. Either way it is not what was meant. */
    if (control !== 'only' && !T.event2)
      structural.push(T.name + ' combines events with "' + control + '" but has no event2');
    if (control === 'only' && T.event2)
      structural.push(T.name + ' has an event2 that "only" will never look at');
    if (!T.action1) structural.push(T.name + ' has no action at all');
    /* linked fires each event's OWN action, so a second event with no second action is half
       a trigger. */
    if (control === 'linked' && T.event2 && !T.action2)
      structural.push(T.name + ' is linked but its second event has no action');

    [['event1', T.event1], ['event2', T.event2]].forEach(function (p) {
      if (!p[1]) return;
      var def = TEVENTS[p[1][0]];
      if (!def) { bad.push(T.name + ' ' + p[0] + ': no such event "' + p[1][0] + '"'); return; }
      checkArg(T.name + ' ' + p[0] + ' (' + p[1][0] + ')', def.need == null ? 'none' : def.need, p[1][1], bad);
    });
    [['action1', T.action1], ['action2', T.action2]].forEach(function (p) {
      if (!p[1]) return;
      var def = TACTIONS[p[1][0]];
      if (!def) { bad.push(T.name + ' ' + p[0] + ': no such action "' + p[1][0] + '"'); return; }
      checkArg(T.name + ' ' + p[0] + ' (' + p[1][0] + ')', def.need, p[1][1], bad);
    });
  });
  S.ok('every trigger is structurally coherent', !structural.length,
       structural.join('; ') || TRIGS.length + ' triggers');
  S.ok('every event and action names something real and takes the argument its table declares',
       !bad.length, bad.join('; ') || 'all resolve');

  /* --- every sound a trigger can play must actually make a noise ---
     playSound goes straight to the mixer, which returns silently for a name it does not
     handle. A trigger firing a sound nobody hears is indistinguishable from a trigger that
     never fired. */
  var audio = load(['src/rts.audio.js']);
  var synth = {};
  (audio._rtsSfxPlay.toString().match(/name === '([a-z0-9]+)'/g) || []).forEach(function (s) {
    synth[s.replace(/.*'([a-z0-9]+)'.*/, '$1')] = 1;
  });
  var mute = [];
  TRIGS.forEach(function (T) {
    [T.action1, T.action2].forEach(function (a) {
      if (a && a[0] === 'playSound' && !synth[a[1]])
        mute.push(T.name + ' plays "' + a[1] + '", which the mixer does not handle');
    });
  });
  S.ok('every sound a trigger plays is one the mixer can produce', !mute.length,
       mute.join('; ') || 'all trigger sounds resolve');

  /* --- THE BALANCE-NEUTRALITY CLAIM ---
     rts.rules.js: the shipped list is "deliberately kept BALANCE-NEUTRAL: informational beats
     only, nothing that raises a team, flips the alert or touches production, because the
     difficulty ladder was measured without them."

     That is a real constraint with a real cost if broken, and breaking it is a one-line edit.
     The ladder numbers in e2e/ladder - and every survival figure quoted in this repo - were
     measured against a scenario that does none of these things. Add a trigger that raises a
     team and every one of those numbers silently becomes a measurement of something else. */
  var CHANGES_THE_GAME = {
    createTeam: 'raises a team', reinforce: 'raises a team', destroyTeam: 'removes a team',
    autocreate: 'flips the alert', beginProduction: 'touches production',
    baseBuilding: 'touches production', allHunt: 'commits the opponent\'s army',
    fireSale: 'sells the opponent\'s base', win: 'ends the match', lose: 'ends the match',
    destroyObject: 'destroys something', revealAll: 'reveals the map'
  };
  var loaded = [];
  TRIGS.forEach(function (T) {
    [T.action1, T.action2].forEach(function (a) {
      if (a && CHANGES_THE_GAME[a[0]])
        loaded.push(T.name + ' ' + CHANGES_THE_GAME[a[0]] + ' (' + a[0] + ')');
    });
  });
  S.ok('the shipped scenario stays balance-neutral, as the ladder measurements assume',
       !loaded.length,
       loaded.join('; ') || TRIGS.length + ' triggers, all informational');

  /* A persistent trigger whose action is a message is the case RTS_MESSAGE_DELAY exists for -
     without the rate limit it re-fires every frame. The delay must be a real interval. */
  S.ok('the repeated-message guard is a usable interval',
       g.RTS_MESSAGE_DELAY > 1 && g.RTS_MESSAGE_DELAY < 600,
       g.RTS_MESSAGE_DELAY + 's between repeats of the same message');
  var persistentText = TRIGS.filter(function (T) {
    return T.persist === 'persistent' && T.action1 && T.action1[0] === 'text';
  });
  S.ok('...and there is a persistent text trigger for it to guard',
       persistentText.length > 0,
       persistentText.map(function (t) { return t.name; }).join(', ') || 'none');
})();

/* ------------------------------------------------- the tables the scripts index ---- */
(function () {
  var badNeed = [];
  Object.keys(TMISSIONS).forEach(function (k) {
    if (['waypoint', 'quarry', 'number', 'none'].indexOf(TMISSIONS[k].need) < 0)
      badNeed.push('mission ' + k + ' needs "' + TMISSIONS[k].need + '"');
  });
  S.ok('every team mission declares a need the script layer understands', !badNeed.length,
       badNeed.join('; ') || Object.keys(TMISSIONS).length + ' missions');

  var kinds = {}, badKind = [];
  Object.keys(TEVENTS).forEach(function (k) {
    var e = TEVENTS[k];
    kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    if (['none', 'ambient', 'notify', 'poll'].indexOf(e.kind) < 0)
      badKind.push(k + ' is kind "' + e.kind + '"');
    /* `who` is the distinction TEVENT.CPP makes between the trigger's owner and the event's
       argument house, and getting it wrong points an event at the wrong side. Only polled
       events do a house lookup at all. */
    if (e.kind === 'poll' && ['owner', 'arg'].indexOf(e.who) < 0)
      badKind.push(k + ' is polled but looks up house "' + e.who + '"');
    if (e.kind !== 'poll' && e.who) badKind.push(k + ' is not polled but declares a house');
    if (e.who === 'arg' && e.need !== 'house')
      badKind.push(k + ' reads its argument as a house but declares need "' + e.need + '"');
  });
  S.ok('every event declares a kind the evaluator handles, and polls the right house',
       !badKind.length, badKind.join('; ') ||
       Object.keys(kinds).map(function (k) { return kinds[k] + ' ' + k; }).join(', '));

  var needs = {};
  Object.keys(TACTIONS).forEach(function (k) { needs[TACTIONS[k].need] = 1; });
  S.ok('every action declares a need', Object.keys(TACTIONS).every(function (k) { return !!TACTIONS[k].need; }),
       Object.keys(TACTIONS).length + ' actions needing: ' + Object.keys(needs).sort().join(', '));
})();

require('../lib/report.js')(S);
