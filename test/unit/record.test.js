/* THE DEBRIEF'S COUNTS and THE RECORD (record.js; core/capture.js, production.js, harvest.js):

     COUNTED    a battle starts with the six counts at zero; an enemy building the player destroys
                and a building of the player's destroyed are counted (a sold one is not); a unit the
                player builds is counted and the opponent's are not; what the player's harvesters
                bank is counted and the opponent's is not
     RECORDED   a plain battle's end adds a win or a loss at its difficulty and keeps the fastest
                win; a daily and a mission are not counted; the line reads as a person would say it
     THE CARD   the debrief's rows carry the counts, and the record line when it counted */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('record');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/daily.js', 'src/record.js']);
g._rtsNewGame(7, 'normal');
var G = g._rtsG, st = G.stats;
function run(secs) { for (var i = 0; i < 60 * secs; i++) g._rtsTick(1 / 60); }
S.ok('COUNTED: a battle starts with the six counts at zero', [st.killed, st.lostU, st.killedB, st.lostB, st.built, st.mined].join() === '0,0,0,0,0,0', JSON.stringify(st));

/* a plain game starts the player with a yard, a power plant, two riflemen and a buggy, so the
   buildings the cases need are laid by hand (core/campaign.js _rtsMBuild) */
var y0 = g._rtsHas('player', 'yard'), ep = g._rtsHas('enemy', 'power'), pp = g._rtsHas('player', 'power');
var sold = g._rtsMBuild('player', 'barracks', y0.tx + 4, y0.tz + 2);
ep.hurtBy = 'player'; g._rtsKill(ep);
g._rtsKill(pp);
sold.selling = 1; g._rtsKill(sold);
S.ok('...an enemy building the player destroys, and a building of the player\'s destroyed, are counted - a sold one is not', st.killedB === 1 && st.lostB === 1 && st.killed === 0 && st.lostU === 0,
     JSON.stringify(st));

g._rtsNewGame(7, 'normal'); G = g._rtsG; st = G.stats;
G.sides.player.credits = 5000;
var y = g._rtsHas('player', 'yard');
S.ok('(a Barracks to build from, and a Refinery to mine for)', !!g._rtsMBuild('player', 'barracks', y.tx + 4, y.tz + 2) && !!g._rtsMBuild('player', 'refinery', y.tx - 5, y.tz + 2) &&
     g._rtsQueue('player', 'rifle') === true, '');
run(40);
var ownUnits = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'unit'; }).length;
S.ok('...a unit the player builds is counted, and the opponent\'s are not', st.built === 1 && ownUnits >= 4, JSON.stringify({ built: st.built, units: ownUnits }));
run(110);
var mined = st.mined, enemyGot = G.sides.enemy.credits;
S.ok('...and what the player\'s harvesters bank is counted', mined > 200 && mined <= 5000, Math.round(mined) + ' credits');
G.ents.forEach(function (e) { if (!e.dead && e.side === 'player' && e.type === 'unit' && g.rtsUnitDef(e.def).harvest) g._rtsKillQuiet(e); });
run(30);
S.ok('...the opponent\'s banking does not move it', st.mined === mined && enemyGot >= 0, Math.round(st.mined) + ' after the player\'s harvesters were lost');

/* ---------------- recorded ---------------- */
g.localStorage.removeItem('bw.record');
G.over = 'win'; G.t = 300;
var r1 = g.rtsRecordAdd(G);
G.over = 'lose'; G.t = 500;
var r2 = g.rtsRecordAdd(G);
G.over = 'win'; G.t = 200;
var r3 = g.rtsRecordAdd(G);
var stored = JSON.parse(g.localStorage.getItem('bw.record'));
S.ok('RECORDED: a plain battle\'s end adds a win or a loss at its difficulty and keeps the fastest win', r1.w === 1 && r2.l === 1 && r3.w === 2 && r3.best === 200 && stored.normal.best === 200 && !stored.easy,
     JSON.stringify(stored));
g.window._RTS_DAILY = { seed: 1 };
var rd = g.rtsRecordAdd(G);
g.window._RTS_DAILY = null; G.mission = { id: 'lowwater' };
var rm = g.rtsRecordAdd(G);
G.mission = null;
S.ok('...a daily and a mission are not counted', rd === null && rm === null && JSON.parse(g.localStorage.getItem('bw.record')).normal.w === 2, '');
S.ok('...and the line reads as a person would say it', g.rtsRecordLine({ w: 2, l: 1, best: 200 }, 'normal') === 'Soldier: 2 wins, 1 loss · fastest 3:20' &&
     g.rtsRecordLine({ w: 1, l: 0, best: 61 }, 'hard') === 'Veteran: 1 win, 0 losses · fastest 1:01' && g.rtsRecordLine(null, 'easy') === '' && g.rtsRecordLine({ w: 0, l: 0 }, 'easy') === '',
     g.rtsRecordLine({ w: 2, l: 1, best: 200 }, 'normal'));

/* ---------------- the card ---------------- */
G.t = 200; st.killed = 7; st.lostU = 3; st.killedB = 2; st.lostB = 1; st.built = 12; st.mined = 4321.4;
var html = g.rtsDebriefHTML(G, r3);
S.ok('THE CARD: the rows carry the counts, and the record line', /Time<\/td><td>3:20/.test(html) && /Credits mined<\/td><td>4321</.test(html) && /12 · 3/.test(html) && />7</.test(html) && /2 · 1/.test(html) &&
     /Soldier: 2 wins, 1 loss/.test(html) && !/rec/.test(g.rtsDebriefHTML(G, null)), html);

require('../lib/report.js')(S);
