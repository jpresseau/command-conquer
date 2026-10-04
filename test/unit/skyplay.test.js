/* THE WEATHER TAKES PART (core/skyplay.js), on the real simulation:

     FIXED    a battle takes its sky at its first tick and keeps it, whatever the player picks
              after; a daily battle is under its seed's sky, not the player's
     FOG      under fog nothing the player owns sees past five cells, where on a clear day the
              same unit sees further; a long gun finds an enemy seven cells off on a clear day
              and not in fog, still finds one four cells off, and still shells the far one when
              it is given it as a target
     STORM    the rain sky storms exactly while the shower is at half strength or more, and no
              other sky does; in the storm a gunship sent away flies home to its pad and sits
              there while the Skylift flies its errand; once the storm passes the gunship goes
              where it is sent; with no pad left it rides the storm out in the air, alive; and
              the player is told when it comes and when it goes; a rain battle that opens in a
              storm says so once its opening line has been read, and not before */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('skyplay');
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites/bake.js', 'src/sprites/props.js', 'src/render3d/sky3d.js']);

function fresh(sky) {
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  if (sky) G.sky = sky;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function middle() {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, null);
  return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
function open(tx, tz) { var c = g._rtsNearestOpen(tx, tz, 3, null); return { x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) }; }
function run(secs) { for (var t = 0; t < secs * 30; t++) g._rtsTick(1 / 30); }
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
/* every line the player is told, in order - the tide and the rest talk over the one message slot */
var told = [], say0 = g._rtsSay;
g._rtsSay = function (m, secs) { told.push(m); return say0(m, secs); };
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };

/* ---------------- fixed ---------------- */
g.window._RTS_DAILY = null;
g._rtsSkySetWant('fog');
var G = g._rtsNewGame(4242, 'easy');
g._rtsTick(1 / 30);
var took = G.sky;
g._rtsSkySetWant('day');
g._rtsTick(1 / 30);
S.ok('a battle takes the chosen sky at its first tick', took === 'fog', took);
S.ok('...and keeps it, whatever the player picks after', G.sky === 'fog' && g._rtsSkyName(G) === 'fog', G.sky + ' / ' + g._rtsSkyName(G));
g.window._RTS_DAILY = { seed: 4242 };
G = g._rtsNewGame(4242, 'normal');
var seedSky = g._rtsSkyOfSeed(4242, g._rtsSandShare(G) >= g.RTS_SKY_SANDY), want = seedSky === 'snow' ? 'night' : 'snow';
g._rtsSkySetWant(want);
g._rtsTick(1 / 30);
S.ok('a daily battle is under its seed\'s sky, not the player\'s', G.sky === seedSky, G.sky + ' (seed ' + seedSky + ', chosen ' + want + ')');
g.window._RTS_DAILY = null;
g._rtsSkySetWant('auto');

/* ---------------- fog: sight ---------------- */
function farthestSeen(sky) {
  var G = fresh(sky), m = middle();
  /* nothing of the player's but one Artillery (sight six cells) in the middle of the map */
  G.ents.forEach(function (e) { if (e.side === 'player') e.dead = true; });
  g._rtsSpawnUnit('player', 'arty', m.x, m.z);
  G.visT = 1; g._rtsVisTick(0);
  var far = 0;
  for (var dz = -11; dz <= 11; dz++) for (var dx = -11; dx <= 11; dx++) {
    if (g._rtsInB(m.tx + dx, m.tz + dz) && G.vis[g._rtsIdx(m.tx + dx, m.tz + dz)]) far = Math.max(far, Math.hypot(dx, dz));
  }
  return far;
}
var clearSee = farthestSeen('day'), fogSee = farthestSeen('fog'), sandSee = farthestSeen('sand');
S.ok('on a clear day the unit sees past five cells', clearSee > g.RTS_FOG_CELLS + 0.5, clearSee.toFixed(1) + ' cells');
S.ok('...and in fog or a sandstorm nothing past five', fogSee > 0 && fogSee <= g.RTS_FOG_CELLS && sandSee > 0 && sandSee <= g.RTS_FOG_CELLS,
     'fog ' + fogSee.toFixed(1) + ', sand ' + sandSee.toFixed(1));

/* ---------------- fog: finding a target ---------------- */
function duel(sky, out) {
  var G = fresh(sky), m = middle();
  var a = g._rtsSpawnUnit('player', 'arty', m.x, m.z), p = open(m.tx + out, m.tz);
  var f = g._rtsSpawnUnit('enemy', 'tank', p.x, p.z);
  return { G: G, a: a, f: f, d: cells(a, f), found: g._rtsFindTarget(a, Math.max(g.rtsUnitDef('arty').sight, g._rtsReach(a))) === f };
}
var day7 = duel('day', 7), fog7 = duel('fog', 7), fog4 = duel('fog', 4);
S.ok('the staging: one enemy tank seven cells out, and one four', day7.d > 6 && day7.d < 8 && fog4.d > 3 && fog4.d < 5, day7.d.toFixed(1) + ', ' + fog4.d.toFixed(1));
S.ok('a long gun finds the far tank on a clear day', day7.found, '');
S.ok('...and not in fog', !fog7.found, '');
S.ok('...but in fog still finds one four cells off', fog4.found, '');
/* given the far one as a target, in fog: it shells it anyway */
var given = duel('fog', 7);
g._rtsOrderAttack(given.a, given.f);
given.f.speed = 0;
var hp0 = given.f.hp, stood = { x: given.a.x, z: given.a.z };
for (var t = 0; t < 20 * 30 && !given.f.dead && given.f.hp >= hp0; t++) {
  given.f.path = null; given.f.target = null;                    /* it holds where it is */
  g._rtsTick(1 / 30);
}
S.ok('...and shells the far one when it is given it as a target, from where it stands', (given.f.dead || given.f.hp < hp0) && cells(given.a, stood) < 0.5,
     given.f.hp + ' of ' + hp0 + ', moved ' + cells(given.a, stood).toFixed(1) + ' cells');

/* ---------------- storm: the schedule ---------------- */
var T0 = g.RTS_SHOWER_FIRST, agree = true, stormT = null, clearT = null, seenS = 0, seenC = 0;
for (var s = 0; s < 1500; s++) {
  var at = T0 + s, st = g._rtsStormAt('rain', at);
  if (st !== (g._rtsShower(at).rain >= 0.5)) agree = false;            /* half strength: the figure itself */
  if (st) seenS++; else seenC++;
  if (st && stormT == null && seenC > 0) stormT = at;
  if (!st && stormT != null && clearT == null) clearT = at + 5;
}
S.ok('the rain sky storms exactly while the shower is at half strength or more', agree && seenS > 100 && seenC > 100, seenS + ' s storming, ' + seenC + ' s not');
S.ok('...and no other sky ever does', ['day', 'fog', 'night', 'snow', 'sand', 'cycle'].every(function (k) { return !g._rtsStormAt(k, stormT); }), '');

/* ---------------- storm: grounded ---------------- */
G = fresh('rain');
var pad = place('player', 'helipad'), ey = g._rtsHas('enemy', 'yard');
G.t = stormT - 2;
told.length = 0;
g._rtsTick(1 / 30);
var heli = g._rtsSpawnUnit('player', 'heli', pad.x + 30, pad.z + 30);
var lift = g._rtsSpawnUnit('player', 'tran', pad.x + 30, pad.z + 34);
run(3);
var said = told.join(' | ');
var far = { x: (pad.x + ey.x) / 2, z: (pad.z + ey.z) / 2 };
g._rtsOrderMove(heli, far.x, far.z, false);
g._rtsOrderMove(lift, far.x, far.z, false);
var liftFrom = cells(lift, far);
run(25);
S.ok('the staging: a pad, a storm, and somewhere far to go', !!pad && G.storm === true && liftFrom > 15, 'storm ' + G.storm + ', ' + liftFrom.toFixed(0) + ' cells');
S.ok('the player is told the storm has come', /Storm: aircraft grounded/.test(said || ''), JSON.stringify(said));
S.ok('in the storm a gunship sent away flies home to its pad and sits there', !heli.dead && cells(heli, pad) <= 1.4 && heli.rearming > 0,
     cells(heli, pad).toFixed(1) + ' cells from the pad, rearming ' + heli.rearming);
S.ok('...while the Skylift flies its errand', !lift.dead && cells(lift, far) < liftFrom - 10, liftFrom.toFixed(0) + ' -> ' + cells(lift, far).toFixed(0) + ' cells');
G.t = clearT;
told.length = 0;
run(8);
said = told.join(' | ');
g._rtsOrderMove(heli, far.x, far.z, false);
run(10);
S.ok('once it passes the player is told', !G.storm && /storm has passed/.test(said || ''), JSON.stringify(said));
S.ok('...and the gunship goes where it is sent', cells(heli, pad) > 8, cells(heli, pad).toFixed(1) + ' cells from the pad');
/* no pad: ride it out */
var hp = heli.hp;
g._rtsDamage(pad, pad.hp + 1, null, false);
G.t = stormT;
g._rtsOrderMove(heli, far.x, far.z, false);
run(10);
S.ok('with no pad left a gunship rides the storm out in the air, alive', G.storm && !heli.dead && heli.hp === hp && cells(heli, far) < 6,
     (heli.dead ? 'crashed' : cells(heli, far).toFixed(1) + ' cells from where it was sent'));

/* a rain battle opens storming: said after the opening line, not over it */
told.length = 0;
G = fresh('rain');
var early = told.slice();
run(g.RTS_SKY_SAY + 1);
S.ok('a battle that opens in a storm says so once its opening line has been read', G.storm && !early.some(function (m) { return /Storm/.test(m); }) &&
     told.filter(function (m) { return /Storm: aircraft grounded/.test(m); }).length === 1, JSON.stringify(told));

require('../lib/report.js')(S);
