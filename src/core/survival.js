/* core/survival.js - SURVIVAL: no enemy base, only waves, each bigger than the last, until yours
   falls. Part of rts.core; unit/survival plays it.

   The opponent's seat thinks nothing (ctl 'none') and owns nothing to begin with. From its corner
   of the map comes a wave every RTS_SURV.every seconds, the first after RTS_SURV.first: a budget
   of credits (RTS_SURV.budget, growing by RTS_SURV.grow a wave, scaled by the difficulty) spent
   at random on the opponent's own fighters that the wave can afford - nothing dearer than
   RTS_SURV.tier0 + RTS_SURV.tier a wave, so the first waves are infantry and buggies and the
   heavy armour comes later. A wave attack-moves on the player's nearest building; whatever is
   left standing about looks for the next one every RTS_SURV.look seconds. The battle is lost
   when the player's last building falls - there is no winning, only how long and how many
   waves - and G.survival keeps the count, which a save carries.

   The roster is a list here on purpose: these are the fighters a wave is made of, not a rule
   about the game, and a support unit (a sweeper, a layer, a transport) in a wave would stand at
   the edge doing nothing. */
var RTS_SURV = { first: 120, every: 70, budget: 700, grow: 450, tier0: 200, tier: 140, cap: 40, look: 2,
  mult: { easy: 0.6, regular: 0.8, normal: 1, hard: 1.35 } };
var RTS_SURV_ROSTER = ['rifle', 'rocket', 'grenadier', 'flame', 'dog', 'buggy', 'light', 'tank', 'arty', 'v2rl', 'heavy'];

function _rtsSurvivalSetup(G) {
  G.sides.enemy.ctl = 'none';
  _rtsMClear(G, 'enemy');
  G.survival = { wave: 0, next: RTS_SURV.first, look: 0, secs: 0, spawned: 0 };
  return G.survival;
}
/* what wave n is made of: keys, in the order they come */
function _rtsSurvivalWave(G, n) {
  var side = rtsHouseSide('enemy'), cap = RTS_SURV.tier0 + RTS_SURV.tier * n;
  var pool = RTS_SURV_ROSTER.map(rtsUnitDef).filter(function (d) { return d && rtsBuildableBy(d, side) && d.cost <= cap; });
  var budget = (RTS_SURV.budget + RTS_SURV.grow * (n - 1)) * (RTS_SURV.mult[G.diff] || 1), out = [];
  if (!pool.length) return out;
  var cheapest = Math.min.apply(null, pool.map(function (d) { return d.cost; }));
  while (budget >= cheapest && out.length < RTS_SURV.cap) {
    var can = pool.filter(function (d) { return d.cost <= budget; }), d = can[Math.floor(_rtsRnd() * can.length)];
    out.push(d.key); budget -= d.cost;
  }
  return out;
}
/* the player's building nearest (x, z) */
function _rtsSurvivalPrey(x, z) {
  var G = window._rtsG, best = null, bd = 1e18;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'player' || e.type !== 'struct') continue;
    var d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function _rtsSurvivalSend(u) {
  var p = _rtsSurvivalPrey(u.x, u.z);
  if (!p) return false;
  var a = _rtsApproach(u, p);
  _rtsOrderMove(u, a.x, a.z, true);
  return true;
}
/* every tick, in place of the end rule (core/tick.js) */
function _rtsSurvivalTick(G, dt) {
  var V = G.survival, i, e;
  if (G.over) return;
  if (!_rtsSurvivalPrey(0, 0)) { V.secs = Math.round(G.t); G.over = 'lose'; G.sides.player.lost = true; return; }
  V.next -= dt;
  if (V.next <= 0) {
    V.wave++; V.next = RTS_SURV.every;
    var keys = _rtsSurvivalWave(G, V.wave), st = G.starts.enemy, made = [];
    for (i = 0; i < keys.length; i++) made = made.concat(_rtsMUnits('enemy', keys[i], st.tx + (i % 5) - 2, st.tz + ((i / 5) | 0) - 2, 1, 'wave'));
    for (i = 0; i < made.length; i++) _rtsSurvivalSend(made[i]);
    V.spawned += made.length;
    _rtsSay('Wave ' + V.wave + ' inbound - ' + made.length + ' units.', 4);
    if (typeof _rtsSfx === 'function') _rtsSfx('alert');
  }
  V.look -= dt;
  if (V.look > 0) return;
  V.look = RTS_SURV.look;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.side !== 'enemy' || e.type !== 'unit' || e.order || e.path || (e.target && !e.target.dead)) continue;
    _rtsSurvivalSend(e);
  }
}
