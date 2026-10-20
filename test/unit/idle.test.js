/* WHAT THE PLAYER IS NOT USING (core/idle.js), and WHERE AN ATTACK WAS (core/response.js), headless:

     THE ORE GONE    every field mined out, a harvester stands: twelve seconds on, the line says so,
                     once, naming the harvester and where it is
     NO REACH        ore on the map the harvester has written off: the line says to send it, and the
                     same harvester is not said again inside ninety seconds
     A QUIET LINE    past the opening, with a Vehicle Works standing, its line empty and 5,000 credits:
                     said after thirty seconds, then the Barracks after the gap between lines; a job
                     on the line clears it, and it is said again only once the line has been used
     NOT THE RICH    nothing is said in the first ninety seconds, nor with the starting credits
     NOT A BRAIN     a computer seat in the player's chair gets no such line
     THE ATTACK      a building hit records where, for the radar's ring and Space, and the line
                     carries it; a second hit inside SpeakDelay moves neither */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('idle');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
function fresh(spec) { g._rtsNewGame(7, 'normal', spec || null); return g._rtsG; }
/* a plain battle opens with a yard, a power plant and no refinery: the harvester the lines are about
   is built beside the yard, with the refinery it works for */
function freshHarv() {
  var G = fresh(), y = g._rtsHas('player', 'yard'), tx = g._rtsTX(y.x), tz = g._rtsTX(y.z);
  g._rtsMBuild('player', 'refinery', tx + 4, tz, 'ref');
  g._rtsMUnits('player', 'harvester', tx + 4, tz + 3, 1, 'harv');
  return G;
}
function run(secs) { for (var i = 0; i < 60 * secs; i++) g._rtsTick(1 / 60); }
function harv(G) { return G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'unit' && g.rtsUnitDef(e.def).harvest; })[0]; }
function near(a, b) { return !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) < 2 * g.RTS_TILE; }

/* ---------------- the ore gone ---------------- */
var G = freshHarv(), h = harv(G);
G.scrap.fill(0);
run(11);
var early = G.msg;
run(3);
S.ok('THE ORE GONE: a harvester stands, and twelve seconds on the line says so, naming it and where', !/ore is gone/.test(early || '') && /ore is gone/.test(G.msg || '') &&
     G.msgSel === h && near(G.msgAt, h), JSON.stringify({ early: early, msg: G.msg, sel: G.msgSel && G.msgSel.def }));
G.msg = ''; G.msgT = 0;
run(60);
S.ok('...once', !/ore is gone/.test(G.msg || ''), JSON.stringify(G.msg));

/* ---------------- no reach ---------------- */
G = freshHarv(); h = harv(G);
h.noGo = {}; for (var i = 0; i < G.scrap.length; i++) if (G.scrap[i] > 0) h.noGo[i] = 1e9;
h.htile = null;
run(14);
var said1 = G.msg, at1 = G.t;
S.ok('NO REACH: ore the harvester has written off: the line says to send it', /can reach no ore/.test(said1 || '') && G.msgSel === h, JSON.stringify(said1));
G.msg = ''; G.msgT = 0;
run(60);
S.ok('...and the same harvester is not said again inside ninety seconds', !/reach no ore/.test(G.msg || ''), JSON.stringify(G.msg));

/* ---------------- a quiet line ---------------- */
/* by every line as it is said - the battle says other things in between (the tide, a wave), and
   the last line standing at a sampled moment is whichever came last */
/* a plain battle opens with no factory and no barracks: the lines the warning is about are built */
G = fresh();
var y0 = g._rtsHas('player', 'yard');
g._rtsMBuild('player', 'factory', g._rtsTX(y0.x) + 5, g._rtsTX(y0.z), 'fac');
g._rtsMBuild('player', 'barracks', g._rtsTX(y0.x) - 5, g._rtsTX(y0.z), 'bar');
g._rtsMBuild('player', 'power', g._rtsTX(y0.x), g._rtsTX(y0.z) + 5, 'pow');
g._rtsRecalcPower('player');
var P = G.sides.player, fac = g._rtsHas('player', 'factory'), bar = g._rtsHas('player', 'barracks'), said = [], say0 = g._rtsSay;
g._rtsSay = function (m, secs, at, sel) { said.push({ t: Math.round(G.t), m: String(m), sel: sel || null }); return say0.apply(null, arguments); };
P.credits = 5000;
run(173);
var idle = said.filter(function (x) { return /is idle/.test(x.m); });
S.ok('A QUIET LINE: past the opening, the empty Vehicle Works with 5,000 credits is said after thirty seconds, naming it, and not before', !!fac && idle.length >= 1 &&
     /Vehicle Works is idle/.test(idle[0].m) && idle[0].sel === fac && idle[0].t >= 120 && idle[0].t <= 126, JSON.stringify(idle));
S.ok('...then the Barracks, after the gap between lines', !!bar && idle.length === 2 && /Barracks is idle/.test(idle[1].m) && idle[1].sel === bar && idle[1].t - idle[0].t >= 45, JSON.stringify(idle));
var queued = g._rtsQueue('player', 'tank');
run(1);
S.ok('...a job on the line clears it, on the next look', queued && G.idle.lineSaid.vehicle === false && G.idle.lineSaid.infantry === true, JSON.stringify({ queued: queued, said: G.idle.lineSaid }));
said = []; P.credits = 5000;
run(120);
var again = said.filter(function (x) { return /Vehicle Works is idle/.test(x.m); });
S.ok('...and it is said again only once the line has run dry again - once, thirty seconds on', again.length === 1 && again[0].t >= G.t - 120 + 30, JSON.stringify(again));
g._rtsSay = say0;

/* ---------------- not the rich ---------------- */
G = fresh();
run(85);
var opening = G.msg;
G = fresh();
run(125);
S.ok('NOT THE RICH: nothing in the first ninety seconds, nor with the starting credits unspent', !/idle/.test(opening || '') && !/idle/.test(G.msg || ''),
     JSON.stringify({ opening: opening, start: G.msg, credits: G.sides.player.credits }));

/* ---------------- not a brain ---------------- */
G = fresh({ player: { ctl: 'ai', diff: 'normal' } });
G.sides.player.credits = 9000; G.scrap.fill(0);
run(130);
S.ok('NOT A BRAIN: a computer seat in the player\'s chair gets no idle line', !G.idle && !/is idle|every field is mined out/.test(G.msg || ''), JSON.stringify({ idle: G.idle, msg: G.msg }));

/* ---------------- the attack ---------------- */
G = fresh();
var y = g._rtsHas('player', 'yard'), pw = g._rtsHas('player', 'power');
run(1);
g._rtsAttacked('player', y);
var A = G.alert, m1 = G.msg, at = G.msgAt;
run(1);
g._rtsAttacked('player', pw);
S.ok('THE ATTACK: a building hit records where, and the line carries it', !!A && A.x === y.x && A.z === y.z && /under attack/.test(m1 || '') && at && at.x === y.x,
     JSON.stringify({ A: A, m1: m1 }));
S.ok('...and a second hit inside SpeakDelay moves neither', G.alert === A && G.msgAt === at, JSON.stringify(G.alert));

require('../lib/report.js')(S);
