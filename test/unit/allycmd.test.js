/* ORDERS TO A COMPUTER ALLY (core/allycmd.js), headless, in a FOE + ALLY battle five minutes in:

     ATTACK     ordered at the opponent's base, most of the ally's fighting army is there seventy
                seconds later - against none when it is left to its own plans
     DEFEND     the whole army comes to the player's base
     WHILE      the ally raises no team and sends no escort, so nothing pulls its units back
     FREE       drops the order at once; an attack order lapses by itself after attackFor
     A SAVE     carries the order (plain data on the brain)
     HELD STILL a mission's ally at ctl 'none' thinks nothing of its own but still carries an order
                out; a seat a human holds refuses one
     NO ALLY    a battle without one refuses the order */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('allycmd');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
function battle() { g._rtsNewGame(7, 'normal', { skirmish: { foes: 'ally' } }); var G = g._rtsG; play(300); return G; }
function play(s) { var G = g._rtsG; for (var i = 0; i < 60 * s && !G.over; i++) g._rtsTick(1 / 60); }
function share(c, r) {
  var G = g._rtsG, f = G.ents.filter(g._rtsAllyFighter);
  return { near: f.filter(function (u) { return Math.hypot(u.x - c.x, u.z - c.z) < r * g.RTS_TILE; }).length, of: f.length };
}

/* ---------------- attack, against the ally left alone ---------------- */
var G = battle(), ec = g._rtsBaseCentre('enemy');
play(70);
var alone = share(ec, 18);
G = battle(); ec = g._rtsBaseCentre('enemy');
var ok = g._rtsAllyCommand('attack', ec.x, ec.z);
play(70);
var sent = share(ec, 18);
S.ok('ATTACK: ordered at the opponent\'s base, most of the ally\'s army is there seventy seconds on; left alone, none is', ok && sent.of >= 20 &&
     sent.near >= sent.of * 0.5 && alone.near === 0, JSON.stringify({ sent: sent, alone: alone }));

/* ---------------- while the order stands ---------------- */
var raised = 0, esc = 0, ts = g._rtsTeamsTick, et = g._rtsEscortsTick;
g._rtsTeamsTick = function () { if (g._rtsAIOn === 'ally') raised++; return ts.apply(this, arguments); };
g._rtsEscortsTick = function () { if (g._rtsAIOn === 'ally') esc++; return et.apply(this, arguments); };
play(10);
var heldTeams = raised, heldEsc = esc;
g._rtsAllyCommand('free');
play(10);
g._rtsTeamsTick = ts; g._rtsEscortsTick = et;
S.ok('...while it stands the ally raises no team and sends no escort; FREE drops it and they come back', heldTeams === 0 && heldEsc === 0 &&
     !G.sides.ally.ai.cmd && raised > 0 && esc > 0, JSON.stringify({ heldTeams: heldTeams, heldEsc: heldEsc, after: raised, cmd: G.sides.ally.ai.cmd }));

/* ---------------- defend ---------------- */
G = battle();
var pc = g._rtsBaseCentre('player'), dok = g._rtsAllyCommand('defend');
play(70);
var home = share(pc, 12);
S.ok('DEFEND: the whole army comes to the player\'s base', dok && home.of >= 20 && home.near >= home.of * 0.9, JSON.stringify(home));
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
S.ok('...and a save carries the order', !!(body.sides.ally.ai && body.sides.ally.ai.cmd && body.sides.ally.ai.cmd.kind === 'defend'),
     JSON.stringify(body.sides.ally.ai && body.sides.ally.ai.cmd));

/* ---------------- an attack lapses ---------------- */
g._rtsAllyCommand('attack', ec.x, ec.z);
play(g.RTS_ALLY_CMD.attackFor + 5);
S.ok('an attack order lapses by itself after ' + g.RTS_ALLY_CMD.attackFor + ' s', !G.sides.ally.ai.cmd, JSON.stringify(G.sides.ally.ai.cmd));

/* ---------------- held still ---------------- */
G = battle(); ec = g._rtsBaseCentre('enemy');
G.sides.ally.ctl = 'none';
var stillOk = g._rtsAllyCommand('attack', ec.x, ec.z);
play(70);
var still = share(ec, 18);
S.ok('HELD STILL: an ally at ctl \'none\' takes an attack order and carries it out', stillOk && still.of >= 10 && still.near >= still.of * 0.5, JSON.stringify(still));
G.sides.ally.ctl = 'human';
S.ok('...and a seat a human holds refuses one', g._rtsAllyCommand('defend') === false, G.sides.ally.ctl);

/* ---------------- no ally ---------------- */
g._rtsNewGame(7, 'normal');
S.ok('a battle with no ally refuses the order', g._rtsAllyCommand('defend') === false && g._rtsAllyCommand('attack', 0, 0) === false, '');

require('../lib/report.js')(S);
