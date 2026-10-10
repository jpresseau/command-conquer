/* test/lib/mission.js - a campaign mission played headless, for unit/campaign*.test.js. */
var { loadFast } = require('./sandbox.js');

/* A fresh world with mission `id` laid on it, exactly as rtsOpen + rtsCampLay make it. */
function mission(id) {
  var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
  var m = g._rtsMissionOf(id);
  g.window._RTS_ARMY = m.army;
  g._rtsNewGame(m.seed, m.diff);
  var G = g._rtsG, M = g._rtsMissionSetup(G, id);
  return { g: g, G: G, M: M, m: m };
}
/* Run until the mission is called or `secs` pass; `each(tick)` runs before every tick. */
function play(o, secs, each) {
  for (var i = 0; i < 60 * secs && !o.G.over; i++) { if (each) each(i); o.g._rtsTick(1 / 60); }
  return { over: o.G.over, t: Math.round(o.G.t), why: o.G.mission.why };
}
module.exports = { mission: mission, play: play };
