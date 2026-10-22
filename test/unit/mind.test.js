/* MIND CONTROL, THE DRONE TANK AND THE ECHO SENSOR (rules `mentalist` / `dronetank` / `relayhub` /
   `echo`, weapon `mindlink`, core/mind.js and its hooks in core/combat.js, core/tick.js and
   core/jammer.js), on the real simulation:

     WHOSE        the Dominion's Mentalist after a Research Lab and its Echo Sensor after a Radar
                  Post; the Compact's Relay Hub after a Vehicle Works and its Drone Tank after a hub
     TAKEN        a Mentalist's link takes an enemy tank: it is the Mentalist's side's, out of its
                  old team and out of the player's selection; an APC's passengers come with it
     NEVER        a building, an aircraft, another Mentalist or a Drone Tank: not taken, and not
                  even reachable, so never aimed at
     ONE AT A TIME  a second unit taken frees the first
     LET GO       the Mentalist dies, and what it held goes home
     SAVED        a save and a load keep the hold
     THE HUB      a Drone Tank with no Relay Hub is offline - it does not move or fire; a powered
                  hub brings it back; a browned-out one takes it down again
     THE SENSOR   a jammed unit hidden from the player is found inside an Echo Sensor's reach
     THE OPPONENT its plan has the hub and the sensor, its mixes the Mentalist and the Drone Tank */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('mind');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
var G, M, T = g.RTS_TILE;

function fresh(army) {
  g.window._RTS_ARMY = army;
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  var a = g._rtsHas('player', 'yard'), b = g._rtsHas('enemy', 'yard');
  M = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
function at(side, key, dx, dz) { return g._rtsSpawnUnit(side, key, M.x + dx * T, M.z + dz * T); }
function step(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
var W = function () { return g.RTS_WEAPONS.mindlink; };
function link(e, tgt) { e.cool = 0; g._rtsFire(e, tgt, W()); }

/* ---------------------------------------------------------------- whose ---- */
fresh('soviet');
var dm = g.rtsUnitDef('mentalist'), dd = g.rtsUnitDef('dronetank'), hub = g.rtsStructDef('relayhub'), echo = g.rtsStructDef('echo');
S.ok('the Mentalist is the Dominion\'s, after a Research Lab; the Echo Sensor after a Radar Post',
     dm.side === 'soviet' && dm.needs.indexOf('lab') >= 0 && echo.side === 'soviet' && echo.needs.indexOf('radar') >= 0 && echo.detects > 0, '');
S.ok('the Relay Hub is the Compact\'s, after a Vehicle Works; the Drone Tank after a hub',
     hub.side === 'allied' && hub.needs.indexOf('factory') >= 0 && dd.side === 'allied' && dd.needs.indexOf('relayhub') >= 0 && dd.hub === 'relayhub', '');

/* ---------------------------------------------------------------- taken ---- */
var me = at('player', 'mentalist', 0, 0), tk = at('enemy', 'tank', 3, 0);
var team = g._rtsTeamMake(g.RTS_TEAM_TYPES[0]);           /* the tank is in the opponent's team */
g._rtsTeamAdd(team, tk);
link(me, tk);
S.eq('A MENTALIST\'S LINK TAKES AN ENEMY TANK: it is the player\'s now', tk.side, 'player');
S.ok('...and it has left its old team', tk.sqd == null && team.members.indexOf(tk) < 0, 'sqd ' + tk.sqd + ', ' + team.members.length + ' left');
S.ok('...and it remembers where it came from, and who holds it', tk.mind && tk.mind.was === 'enemy' && tk.mind.by === me.id && me.thrall === tk.id, JSON.stringify(tk.mind));

/* the other way: an enemy Mentalist takes one of the player's selected tanks, out of the selection */
var em = at('enemy', 'mentalist', -3, 4), mine = at('player', 'tank', -1, 4);
G.sel.length = 0; G.sel.push(mine);
link(em, mine);
S.ok('an enemy Mentalist takes the player\'s tank: out of the selection, the enemy\'s', mine.side === 'enemy' && G.sel.indexOf(mine) < 0, mine.side);
var apc = at('enemy', 'apc', 4, -3), rider = at('enemy', 'rifle', 4, -3);
g._rtsBoard(rider, apc);
var me2 = at('player', 'mentalist', 2, -3);
link(me2, apc);
S.ok('an APC taken brings its passengers with it', apc.side === 'player' && rider.side === 'player', apc.side + '/' + rider.side);

/* ---------------------------------------------------------------- never ---- */
var heli = at('enemy', 'heli', 3, 2), b = g._rtsPlaceStruct('enemy', 'power', 0, 0, true);
b.x = M.x + 3 * T; b.z = M.z - 1 * T;
var em2 = at('enemy', 'mentalist', 2, 1);
var drone = at('enemy', 'dronetank', 3, 1);
var never = [heli, b, em2, drone];
var me3 = at('player', 'mentalist', 0, 1);
never.forEach(function (o) { link(me3, o); });
S.ok('NEVER a building, an aircraft, another Mentalist or a Drone Tank', never.every(function (o) { return o.side === 'enemy' && !o.mind; }),
     never.map(function (o) { return o.def + ':' + o.side; }).join(' '));
S.ok('...and none of them is even reachable, so none is aimed at', never.every(function (o) { return !g._rtsWeaponReaches(W(), o); }) && g._rtsWeaponReaches(W(), at('enemy', 'tank', 5, 5)), '');

/* ----------------------------------------------------------- one at a time ---- */
var tk2 = at('enemy', 'light', 3, -1);
link(me, tk2);
S.ok('ONE AT A TIME: a second unit taken frees the first', tk2.side === 'player' && tk.side === 'enemy' && !tk.mind && me.thrall === tk2.id,
     'first ' + tk.side + ', second ' + tk2.side);

/* ------------------------------------------------------------------ saved ---- */
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
var Gk = G;
g._rtsNewGame(7, 'normal'); g._rtsApplyState(g._rtsG, body);
var tk2b = g._rtsG.byId[tk2.id];
S.ok('a save and a load keep the hold', tk2b && tk2b.side === 'player' && tk2b.mind && tk2b.mind.by === me.id && g._rtsG.byId[me.id].thrall === tk2.id, '');
G = g._rtsG;

/* ----------------------------------------------------------------- let go ---- */
g._rtsKill(G.byId[me.id]);
g._rtsTick(1 / 30);
S.ok('LET GO: the Mentalist dies, and what it held goes home', G.byId[tk2.id].side === 'enemy' && !G.byId[tk2.id].mind, G.byId[tk2.id].side);

/* ------------------------------------------------------------------- the hub ---- */
fresh('allied');
var dt = at('player', 'dronetank', 0, 0), x0 = dt.x;
g._rtsOrderMove(dt, dt.x + 8 * T, dt.z, false);
step(2);
S.ok('A DRONE TANK WITH NO RELAY HUB IS OFFLINE: it does not move', dt.offline === 1 && Math.abs(dt.x - x0) < 0.01, 'moved ' + ((dt.x - x0) / T).toFixed(2));
var foe = at('enemy', 'rifle', 3, 0), fhp = foe.hp;
dt.target = foe; dt.order = 'attack';
step(2, function () { foe.x = M.x + 3 * T; foe.z = M.z; foe.cool = 99; });
S.eq('...and does not fire', foe.hp, fhp);
foe.dead = true;
var yd = g._rtsHas('player', 'yard'), hb = g._rtsPlaceStruct('player', 'relayhub', yd.tx + 5, yd.tz + 5, true);
hb.building = 0;
g._rtsOrderMove(dt, dt.x + 8 * T, dt.z, false);
step(2);
S.ok('a powered hub brings it back: it moves', dt.offline === 0 && dt.x - x0 > T, 'moved ' + ((dt.x - x0) / T).toFixed(1) + ' cells');
var x1 = dt.x;
g._rtsOrderMove(dt, dt.x + 8 * T, dt.z, false);
/* a real brownout: power is counted off the buildings every tick, so the plants go */
G.ents.forEach(function (e) { if (e.type === 'struct' && e.side === 'player' && (g.rtsStructDef(e.def).power || 0) > 0) g._rtsKill(e); });
step(2);
S.ok('...and a browned-out hub takes it down again', dt.offline === 1 && Math.abs(dt.x - x1) < 0.01, 'moved ' + ((dt.x - x1) / T).toFixed(2));

/* ---------------------------------------------------------------- the sensor ---- */
fresh('soviet');
var jam = at('enemy', 'jammer', 10, 0), hid = at('enemy', 'tank', 10.5, 0.5);
step(6, function () { jam.path = null; hid.path = null; });
var hiddenBefore = g._rtsJamHidden(hid, 'player');
var es = g._rtsPlaceStruct('player', 'echo', 0, 0, true); es.building = 0;
es.x = hid.x - 6 * T; es.z = hid.z;
S.ok('the staging: a jammed tank hidden from the player (population)', hiddenBefore, '');
S.ok('THE ECHO SENSOR FINDS IT inside its reach', !g._rtsJamHidden(hid, 'player') && !g._rtsJamHides(hid, 'player', hid.x - 30 * T, hid.z), '');
es.x = hid.x - (g.rtsStructDef('echo').detects / T + 2) * T;
S.ok('...and not beyond it', g._rtsJamHidden(hid, 'player'), '');

/* ------------------------------------------------------------- opponent ---- */
var A = g.RTS_AI;
S.ok('the opponent\'s plan has the Relay Hub and the Echo Sensor, its mixes the Mentalist and the Drone Tank',
     A.buildOrder.indexOf('relayhub') >= 0 && A.buildOrder.indexOf('echo') >= 0 &&
     A.mix.infantry.some(function (m) { return m.key === 'mentalist'; }) && A.mix.vehicle.some(function (m) { return m.key === 'dronetank'; }), '');

require('../lib/report.js')(S);
