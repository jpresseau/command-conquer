/* TOWNS AND GARRISONS (rules `cottage` / `flats` / `hall`, the skirmish setup's TOWNS, core/garrison.js,
   and its hooks in core/transport.js, core/seats.js, core/tick.js, core/damage.js, core/capture.js):

     NO TOWN      the default battle has none, and no town seat - so every recorded battle,
                  daily and mission is the battle it was
     THE TOWN     TOWNS lays them: the town's buildings, the town's seat at team -1, none within
                  RTS_GARRISON.clear of a start, and the map round them unchanged
     NOBODY'S     an empty house is hostile to no one: an enemy tank beside it leaves it alone
     IN           a rifle squad ordered into a cottage walks in, and the cottage is the player's;
                  a fourth squad is refused (it holds three), and so are a dog, an engineer and
                  the other side's squad
     OUT OF IT    the squads inside fire from it at an enemy beyond a rifle's own range
     A TARGET     held, it is the player's, and an enemy tank shoots it
     FIRE CLEARS  a flame squad's hit burns the men inside; a rifle squad's does not
     LET GO       UNLOAD walks them out and the house is the town's again; a house that falls
                  spills them alive
     NOT A BASE   a held house is never sold or repaired, and keeps no side alive
     SAVED        a save and a load keep the garrison in its house */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('garrison');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);

function make(sk, seed) {
  g._rtsNewGame(seed || 7, 'normal', sk === undefined ? undefined : { skirmish: sk });
  var G = g._rtsG; G.over = null;
  return G;
}
function civ(G) { return G.ents.filter(function (e) { return !e.dead && e.type === 'struct' && (g.rtsStructDef(e.def) || {}).civ; }); }
function step(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
var T = g.RTS_TILE;

/* ---------------------------------------------------------------- no town ---- */
var G0 = make();
S.ok('the default battle has no town and no town seat', civ(G0).length === 0 && !G0.sides.civ, civ(G0).length + ' houses');
var rnd0 = JSON.stringify(G0.rnd ? G0.rnd.get() : null);
var terr0 = Array.from(G0.terrain).join(''), ore0 = Array.from(G0.scrap).join(','), base0 = G0.ents.map(function (e) { return e.def + '@' + e.tx + ',' + e.tz; }).join(' ');

/* --------------------------------------------------------------- the town ---- */
var G = make({ town: 'towns' });
var houses = civ(G);
S.ok('TOWNS lays the town: a hall, flats and cottages', houses.length >= 6 && houses.some(function (h) { return h.def === 'hall'; }),
     houses.map(function (h) { return h.def; }).join(', '));
S.ok('...owned by the town\'s seat, at team -1', houses.every(function (h) { return h.side === 'civ'; }) && G.sides.civ && G.sides.civ.team === -1, '');
var near = houses.filter(function (h) { return Object.keys(G.starts).some(function (k) { return G.starts[k] && Math.hypot(h.tx - G.starts[k].tx, h.tz - G.starts[k].tz) < g.RTS_GARRISON.clear; }); });
S.eq('...none of it within RTS_GARRISON.clear cells of a start', near.length, 0);
S.ok('...and the map round it is the map without it: terrain, ore and both bases', Array.from(G.terrain).join('') === terr0 && Array.from(G.scrap).join(',') === ore0 &&
     G.ents.filter(function (e) { return !(g.rtsStructDef(e.def) || {}).civ; }).map(function (e) { return e.def + '@' + e.tx + ',' + e.tz; }).join(' ') === base0, '');

S.eq('...and the game\'s own random stream is where it would have been: the town draws from its own',
     JSON.stringify(G.rnd ? G.rnd.get() : null), rnd0);
var clear0 = g.RTS_GARRISON.clear;
g.RTS_GARRISON.clear = 400;
S.eq('with every cell too near a start, no town stands (the rule is what keeps it off the bases)', civ(make({ town: 'towns' })).length, 0);
g.RTS_GARRISON.clear = clear0;
G = make({ town: 'towns' }); houses = civ(G);

/* staging: clear the units, pick a cottage, stand things round it */
G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
g._rtsTick(1 / 30);
var C = houses.filter(function (h) { return h.def === 'cottage'; })[0];
function at(side, key, dx, dz) { return g._rtsSpawnUnit(side, key, C.x + dx * T, C.z + dz * T); }

/* --------------------------------------------------------------- nobody's ---- */
S.ok('an empty house is hostile to no one', !g._rtsHostile('civ', 'player') && !g._rtsHostile('enemy', 'civ'), '');
var tk = at('enemy', 'tank', 3, 0);
step(4);
S.eq('...and an enemy tank beside it leaves it alone', C.hp, C.maxHp);
tk.dead = true;

/* --------------------------------------------------------------------- in ---- */
var sq = [at('player', 'rifle', -3, 0), at('player', 'rifle', -3, 1), at('player', 'rifle', -3, -1), at('player', 'rifle', -4, 0)];
sq.slice(0, 3).forEach(function (u) { g._rtsOrderBoard(u, C); });
step(8);
S.eq('THREE RIFLE SQUADS WALK IN', g._rtsCargoCount(C), 3);
S.eq('...and the cottage is the player\'s', C.side, 'player');
S.ok('a fourth is refused: a cottage holds three', !g._rtsCanBoard(sq[3], C), '');
/* asked of houses with room, so the cap is not what refuses them */
var E2 = houses.filter(function (h) { return h !== C && h.side === 'civ'; })[0];
var dog = at('player', 'dog', -3, 2), eng = at('player', 'engineer', -3, -2), foe = at('enemy', 'rifle', 3, 2), mine = at('player', 'rifle', -4, 2);
S.ok('...and so are a dog and an engineer, at an empty house', g._rtsCanBoard(mine, E2) && !g._rtsCanBoard(dog, E2) && !g._rtsCanBoard(eng, E2), '');
g._rtsBoard(mine, E2);
S.ok('...and the other side\'s squad, at a house the player holds with room', E2.side === 'player' && g._rtsCargoCount(E2) < g._rtsGarrisonCap(E2) && !g._rtsCanBoard(foe, E2), E2.side);
g._rtsUnload(E2); mine.dead = true;
[dog, eng, foe, sq[3]].forEach(function (u) { u.dead = true; });

/* ------------------------------------------------------------- out of it ---- */
var rw = g.RTS_WEAPONS.rifle, cd = g.rtsStructDef(C.def);
var dist = rw.range + (cd.w / 2 + 1) * T;       /* past a rifle's own reach, inside the garrison's */
var target = g._rtsSpawnUnit('enemy', 'light', C.x + dist, C.z);
target.order = 'hold'; target.speed = 0;
var hp0 = target.hp;
step(6, function () { target.x = C.x + dist; target.z = C.z; target.target = null; target.cool = 99; });
S.ok('the squads inside fire out of it, past a rifle\'s own range', target.hp < hp0 && dist > rw.range,
     (hp0 - target.hp).toFixed(1) + ' damage at ' + (dist / T).toFixed(1) + ' cells, a rifle reaches ' + (rw.range / T).toFixed(1));
target.dead = true;

/* -------------------------------------------------------------- a target ---- */
var tk2 = at('enemy', 'tank', 4, 0), h1 = C.hp;
step(5, function () { sq.forEach(function (u) { u.cool = 99; }); });
S.ok('HELD, IT IS A TARGET: an enemy tank shoots it', C.hp < h1, (h1 - C.hp).toFixed(1) + ' damage');
tk2.dead = true;
C.hp = C.maxHp;

/* ------------------------------------------------------------ fire clears ---- */
var men0 = C.cargo.map(function (u) { return u.hp; });
var rf = at('enemy', 'rifle', 2.5, 0);
g._rtsFire(rf, C, g.RTS_WEAPONS.rifle);
S.ok('a rifle squad\'s hit does not touch the men inside', C.cargo.every(function (u, i) { return u.hp === men0[i]; }), '');
var fl = at('enemy', 'flame', 2.5, 0);
g._rtsFire(fl, C, g.RTS_WEAPONS.flame);
S.ok('FIRE CLEARS IT: a flame squad\'s hit burns every man inside', C.cargo.every(function (u, i) { return u.hp < men0[i]; }),
     C.cargo.map(function (u, i) { return (men0[i] - u.hp).toFixed(1); }).join(', '));
rf.dead = true; fl.dead = true;
C.cargo.forEach(function (u) { u.hp = u.maxHp; });

/* --------------------------------------------------------------- not a base ---- */
S.ok('a held house is never sold or repaired', g._rtsSell(C) === false && !C.selling && (C.hp = C.maxHp - 50, !g._rtsToggleRepair(C)), '');
C.hp = C.maxHp;

/* ------------------------------------------------------------------ saved ---- */
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
var G2 = make({ town: 'towns' });
g._rtsApplyState(G2, body);
var C2 = G2.byId[C.id];
S.ok('a save and a load keep the garrison in its house', C2 && C2.side === 'player' && C2.cargo.length === 3 && C2.cargo.every(function (u) { return u.inside === C2; }),
     C2 && (C2.side + ' ' + C2.cargo.length));
G = G2; C = C2;

/* ----------------------------------------------------------------- let go ---- */
var out = g._rtsUnload(C);
S.ok('UNLOAD walks them out, and the house is the town\'s again', out === 3 && C.side === 'civ' && !g._rtsCargoCount(C), out + ' out, ' + C.side);
var back = C.cargo.slice();
G.ents.filter(function (u) { return u.type === 'unit' && u.side === 'player' && !u.dead && !u.inside; }).forEach(function (u) { g._rtsBoard(u, C); });
S.eq('(boarded again)', g._rtsCargoCount(C), 3);
var men = C.cargo.slice();
g._rtsKill(C);
S.ok('a house that falls spills them alive', men.every(function (u) { return !u.dead && !u.inside; }), men.map(function (u) { return u.dead ? 'dead' : 'out'; }).join(', '));

/* the opponent: its idle squads hold the nearest house, and a squad in a team is left alone */
var GA = make({ town: 'towns' });
GA.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
g._rtsTick(1 / 30);
var EH = GA.starts.enemy, home0 = g.RTS_GARRISON.home;
g.RTS_GARRISON.home = 400;                     /* whichever house is nearest, however far */
var idle = [0, 1, 2].map(function (k) { return g._rtsSpawnUnit('enemy', 'rifle', g._rtsWX(EH.tx + 4 + k), g._rtsWX(EH.tz + 4)); });
var teamed = g._rtsSpawnUnit('enemy', 'rifle', g._rtsWX(EH.tx + 4), g._rtsWX(EH.tz + 6)); teamed.team = 5;
var sent = g._rtsAIGarrison('enemy');
S.eq('THE OPPONENT SENDS ITS IDLE SQUADS into the nearest house', sent, 3);
S.ok('...and leaves a squad that belongs to a team where it is', teamed.order !== 'board', teamed.order);
for (var st = 0; st < 30 * 120 && !idle.every(function (u) { return u.inside; }); st++) g._rtsTick(1 / 30);
var EHouse = idle[0].inside;
S.ok('...which they hold: the house is the opponent\'s', !!EHouse && EHouse.side === 'enemy' && idle.every(function (u) { return u.inside === EHouse; }),
     EHouse ? EHouse.def + ' ' + EHouse.side + ' ' + g._rtsCargoCount(EHouse) : 'not inside after 120 s');
g.RTS_GARRISON.home = home0;
G = make({ town: 'towns' });
men = [g._rtsSpawnUnit('player', 'rifle', g._rtsWX(G.starts.player.tx), g._rtsWX(G.starts.player.tz + 4))];

/* the last one: a side whose only building is a held house has lost */
var H = civ(G)[0];
g._rtsBoard(men[0], H);
G.ents.forEach(function (e) { if (e.type === 'struct' && e.side === 'player' && !(g.rtsStructDef(e.def) || {}).civ) e.dead = true; });
g._rtsTick(1 / 30);
S.ok('A HELD HOUSE KEEPS NO ONE ALIVE: with nothing else standing, the player has lost', H.side === 'player' && G.over === 'lose', H.side + ' ' + G.over);

require('../lib/report.js')(S);
