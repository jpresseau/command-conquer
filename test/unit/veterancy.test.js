/* VETERANS (core/veterancy.js, rules/balance.js RTS_VET), headless:

     THE RANKS     three, seven and twelve kills make the three ranks; a structure never ranks
     THE HIT       each rank is a tenth more dealt, and a tenth less taken, on top of the house
                   bias; the two together on one shot
     ELITE         an elite unit mends while unhurt, and not while it is being hit, and never
                   past full
     SAID          a promotion on the player's side is said, with the unit; the enemy's is not
     BOTH SEATS    an enemy unit that kills is promoted the same way */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('veterancy');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
g._rtsNewGame(7, 'normal');
var G = g._rtsG, V = g.RTS_VET;
function tank(side, x) { return g._rtsSpawnUnit(side, 'tank', x, 0); }
function rankAt(k) { var u = tank('player', 10); u.kills = k; var r = g._rtsVetRank(u); g._rtsKillQuiet(u); return r; }
S.ok('THE RANKS: three, seven and twelve kills make the three ranks', [0, 2, 3, 6, 7, 11, 12, 40].map(rankAt).join('') === '00112233', [0, 2, 3, 6, 7, 11, 12, 40].map(rankAt).join(''));
var tw = g._rtsHas('enemy', 'power'); tw.kills = 40;
S.ok('...and a structure never ranks', g._rtsVetRank(tw) === 0 && !tw.rank, String(tw.rank));

/* ---------------- the hit ---------------- */
function hit(fromRank, tgtRank) {
  var a = tank('player', 20), b = tank('enemy', 24);
  a.rank = fromRank; b.rank = tgtRank; b.hp = b.maxHp = 10000;
  g._rtsDamage(b, 100, a);
  var took = 10000 - b.hp;
  g._rtsKillQuiet(a); g._rtsKillQuiet(b);
  return took;
}
var base = hit(0, 0), dealt = hit(2, 0), taken = hit(0, 2), both = hit(3, 1);
S.ok('THE HIT: each of the attacker\'s ranks is a tenth more dealt', Math.abs(dealt / base - (1 + 2 * V.dmg)) < 0.01, dealt + ' against ' + base);
S.ok('...each of the target\'s a tenth less taken', Math.abs(taken / base - 1 / (1 + 2 * V.armor)) < 0.01, taken + ' against ' + base);
S.ok('...and the two together on one shot', Math.abs(both / base - (1 + 3 * V.dmg) / (1 + V.armor)) < 0.01, both + ' against ' + base);

/* ---------------- elite ---------------- */
var el = tank('player', 30); el.rank = 3; el.hp = el.maxHp * 0.5; el.hitT = 0;
var vet2 = tank('player', 34); vet2.rank = 2; vet2.hp = vet2.maxHp * 0.5; vet2.hitT = 0;
for (var i = 0; i < 60 * 10; i++) { el.hitT = 0; vet2.hitT = 0; g._rtsVetTick(1 / 60); }
var mended = el.hp / el.maxHp;
S.ok('ELITE: an elite unit mends while unhurt - about four tenths of a percent a second - and a lesser rank does not', Math.abs(mended - (0.5 + 10 * V.heal)) < 0.005 && vet2.hp === vet2.maxHp * 0.5,
     JSON.stringify({ elite: mended.toFixed(3), rank2: (vet2.hp / vet2.maxHp).toFixed(3) }));
var before = el.hp;
for (i = 0; i < 60; i++) { el.hitT = 0.18; g._rtsVetTick(1 / 60); }
S.ok('...not while it is being hit', el.hp === before, '');
el.hp = el.maxHp - 1; el.hitT = 0;
for (i = 0; i < 60 * 5; i++) g._rtsVetTick(1 / 60);
S.ok('...and never past full', el.hp === el.maxHp, String(el.hp));

/* ---------------- said, and both seats ---------------- */
G.msg = ''; G.msgT = 0;
var mine = tank('player', 40); mine.kills = 2;
var foe = tank('enemy', 60); foe.hp = 1; foe.hp = 1;
g._rtsDamage(foe, 1000, mine);
S.ok('SAID: the player\'s unit promoted by a kill, and said with it', mine.kills === 3 && mine.rank === 1 && /promoted/.test(G.msg || '') && (G.msgSel === mine || G.msgSel === undefined), JSON.stringify({ msg: G.msg, rank: mine.rank }));
G.msg = ''; G.msgT = 0;
var theirs = tank('enemy', 70); theirs.kills = 6;
var ours = tank('player', 72); ours.hp = 1;
g._rtsDamage(ours, 1000, theirs);
S.ok('BOTH SEATS: an enemy unit that kills is promoted the same way, and nothing is said of it', theirs.kills === 7 && theirs.rank === 2 && !/promoted/.test(G.msg || ''), JSON.stringify({ msg: G.msg, rank: theirs.rank }));

require('../lib/report.js')(S);
