/* WHAT THE PLAYER IS TOLD WHEN THEIR OWN ARE HIT AND LOST (core/response.js), headless.

   Only a building raised "under attack". A harvester shot across the map, an army ambushed off
   the screen, a refinery destroyed: nothing was said.

     THE HARVESTER   an enemy shoots it: the line says so, carries the place and the harvester,
                     marks the alert; a second hit inside SpeakDelay says nothing more
     AMBUSHED        a unit that was not sent to fight is hit: the line says so, on a clock of its
                     own - and a unit the player ordered to attack says nothing
     NOT THEIRS      the opponent's units hit say nothing; nor does damage from no one
     LOST            a building destroyed is named, a harvester lost is said, a sold building and
                     a wall are not, and a tank is not
     THE POWER       the low-power line says what a blackout costs */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('alerts');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
var G, Y;
function fresh() {
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  Y = g._rtsHas('player', 'yard');
  g._rtsTick(1 / 30);
  G.msg = null; G.msgT = 0; G.msgAt = null; G.msgSel = null; G.alert = null;
}
function unit(side, key, dx, dz) { return g._rtsSpawnUnit(side, key, Y.x + dx * g.RTS_TILE, Y.z + dz * g.RTS_TILE); }
function quiet() { G.msg = null; G.msgAt = null; G.msgSel = null; G.alert = null; }
function at(p, e) { return !!p && Math.abs(p.x - e.x) < 0.01 && Math.abs(p.z - e.z) < 0.01; }

/* ---------------- the harvester ---------------- */
fresh();
var h = unit('player', 'harvester', 6, 6), raider = unit('enemy', 'tank', 9, 6);
g._rtsDamage(h, 10, raider);
S.ok('THE HARVESTER: shot, the line says so', /Harvester under attack/.test(G.msg || ''), JSON.stringify(G.msg));
S.ok('...with the place and the harvester, for the line\'s tap', at(G.msgAt, h) && G.msgSel === h, JSON.stringify(G.msgAt));
S.ok('...and the alert marked there, for the radar\'s ring and Space', at(G.alert, h) && G.alert.t === G.t, JSON.stringify(G.alert));
quiet(); G.t += g.RTS_ALERT_DELAY - 1;
g._rtsDamage(h, 10, raider);
S.eq('a second hit inside SpeakDelay says nothing more', G.msg, null);
G.t += 2;
g._rtsDamage(h, 10, raider);
S.ok('...and past it, it is said again', /Harvester under attack/.test(G.msg || ''), JSON.stringify(G.msg));

/* ---------------- ambushed ---------------- */
quiet();
var idle = unit('player', 'tank', -6, 6);
g._rtsDamage(idle, 10, raider);
S.ok('AMBUSHED: a unit not sent to fight is hit, and the line says so - on its own clock, the harvester\'s just said',
     /forces are under attack/.test(G.msg || '') && at(G.msgAt, idle) && at(G.alert, idle), JSON.stringify(G.msg));
quiet();
g._rtsDamage(idle, 10, raider);
S.eq('...once per SpeakDelay', G.msg, null);
G.t += g.RTS_ALERT_DELAY + 1;
var sent = unit('player', 'tank', -8, 6); sent.order = 'attack'; sent.target = raider;
g._rtsDamage(sent, 10, raider);
S.eq('a unit the player ordered to attack is expected to be shot at: nothing is said', G.msg, null);
sent.order = 'amove';
g._rtsDamage(sent, 10, raider);
S.eq('...nor one on an attack-move', G.msg, null);
sent.order = 'move';
g._rtsDamage(sent, 10, raider);
S.ok('...but one only moving is', /forces are under attack/.test(G.msg || ''), JSON.stringify(G.msg));

/* ---------------- not theirs ---------------- */
fresh();
var mine = unit('player', 'tank', 6, 6), theirs = unit('enemy', 'tank', 9, 6), hv = unit('enemy', 'harvester', 9, 9);
g._rtsDamage(theirs, 10, mine); g._rtsDamage(hv, 10, mine);
S.eq('NOT THEIRS: the opponent\'s tank and harvester hit say nothing', G.msg, null);
S.eq('...and mark no alert', G.alert, null);
var hm = unit('player', 'harvester', 4, 8);
g._rtsDamage(hm, 10, null); g._rtsDamage(hm, 10, mine);
S.eq('damage from no one, and from the player\'s own, says nothing', G.msg, null);

/* ---------------- lost ---------------- */
fresh();
var tx = g._rtsTX(Y.x), tz = g._rtsTX(Y.z);
var ref = g._rtsMBuild('player', 'refinery', tx + 5, tz, 'r'), foe = unit('enemy', 'tank', 9, 9);
g._rtsDamage(ref, 1e6, foe);
S.ok('LOST: a building destroyed is named', ref.dead && G.msg === g.rtsStructDef('refinery').name + ' lost.' && at(G.msgAt, ref) && at(G.alert, ref), JSON.stringify(G.msg));
quiet();
var hl = unit('player', 'harvester', 6, 6);
g._rtsDamage(hl, 1e6, foe);
S.ok('...a harvester lost is said, with where', hl.dead && G.msg === 'Harvester lost.' && at(G.msgAt, hl), JSON.stringify(G.msg));
quiet();
var tk = unit('player', 'tank', 7, 7); tk.order = 'attack';
g._rtsDamage(tk, 1e6, foe);
S.ok('...a tank lost in a fight is not', tk.dead && G.msg === null, JSON.stringify(G.msg));
var pw = g._rtsMBuild('player', 'power', tx - 5, tz, 'p'); pw.selling = true;
g._rtsKill(pw);
S.ok('...nor a building sold', pw.dead && G.msg === null, JSON.stringify(G.msg));
var wallKey = g.RTS_STRUCTS.filter(function (d) { return d.wall; })[0];
S.ok('there is a wall to lose (population)', !!wallKey, wallKey && wallKey.key);
if (wallKey) {
  var wl = g._rtsPlaceStruct('player', wallKey.key, tx + 8, tz + 8, true);
  G.playerHit = G.t;                       /* the base's own warning has just been said */
  g._rtsDamage(wl, 1e6, foe);
  S.ok('...nor a wall', wl.dead && G.msg === null, JSON.stringify(G.msg));
}
var eb = g._rtsHas('enemy', 'yard');
quiet(); g._rtsKill(eb);                   /* damage is capped a hit, and a yard outlives one */
S.ok('...nor one of theirs', eb.dead && !/lost/.test(G.msg || ''), JSON.stringify(G.msg));

/* ---------------- the power ---------------- */
var lp = g.RTS_TRIGGERS.filter(function (t) { return t.name === 'lowpower'; })[0];
S.ok('THE POWER: the low-power line says the defences and the radar go, not only production',
     !!lp && /defences/.test(lp.action1[1]) && /radar/.test(lp.action1[1]) && /production/.test(lp.action1[1]), lp && lp.action1[1]);

/* ...and a building's line names nothing it does not unlock: the Lab's named Artillery, which the
   Radar Post opens, and a Heavy Tank no roster has */
var named = [];
g.RTS_STRUCTS.forEach(function (sd) {
  if (!/^Unlocks /.test(sd.desc || '')) return;
  g.RTS_UNITS.concat(g.RTS_STRUCTS).forEach(function (d) {
    if (d.name && sd.desc.indexOf(d.name) >= 0 && (d.needs || []).indexOf(sd.key) < 0) named.push(sd.name + ' names ' + d.name);
  });
  if (/Heavy Tank/.test(sd.desc)) named.push(sd.name + ' names a Heavy Tank');
});
S.ok('there are buildings whose line says what they unlock (population)', g.RTS_STRUCTS.filter(function (sd) { return /^Unlocks /.test(sd.desc || ''); }).length >= 1, '');
S.ok('no building\'s line names a unit or building it does not unlock', !named.length, named.join('; ') || 'none');

require('../lib/report.js')(S);
