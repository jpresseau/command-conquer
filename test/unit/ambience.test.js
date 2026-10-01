/* THE WORLD'S OWN SOUND - rts.ambience.js: what the bed under the guns should be playing, asked
   without a sound card (_rtsAmbWant), and the lightning's schedule (_rtsLightning).

     QUIET     a clear day with nothing moving is silent under the effects
     WEATHER   rain hisses; snow and fog blow; the night has its insects and its echo - and rain
               hushes the insects
     ENGINES   one tank moving is heard, nine are louder but not nine times, a parked tank and a
               soldier are not; a fast buggy runs higher than a tank; nothing out of earshot counts
     BRIDGES   a vehicle on a deck rumbles it, one beside it does not
     LIGHTNING not before RTS_THUNDER_FIRST; strikes spaced by RTS_THUNDER_GAP plus up to the
               spread; each a bright flicker gone inside a second; the same schedule every time
     EARSHOT   a fight is heard muffled out to RTS_FAR views, and not beyond */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('ambience');
var g = load(['src/rules', 'src/core', 'src/map', 'src/r3d', 'src/sprites/bake.js', 'src/render3d/sky3d.js', 'src/rts.audio.js', 'src/rts.ambience.js']);
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG, heard = true;
g._rtsAudible = function () { return heard; };
function want(sky) { g.window.RTS_SKY_FORCE = sky; return g._rtsAmbWant(G); }

/* QUIET */
G.ents.forEach(function (e) { e.path = null; });
var d = want('day');
S.ok('a clear day with nothing moving is silent under the effects', d.rain === 0 && d.wind === 0 && d.ins === 0 && d.echo === 0 && d.eng === 0 && d.bridge === 0, JSON.stringify(d));

/* WEATHER */
var r = want('rain'), n = want('night'), sn = want('snow'), fg = want('fog'), dk = want('dusk');
S.ok('rain hisses', r.rain > 0.1 && n.rain === 0, r.rain + ' / ' + n.rain);
S.ok('snow and fog blow', sn.wind > 0.1 && fg.wind > 0.1 && d.wind === 0, sn.wind + ', ' + fg.wind);
S.ok('the night has its insects and its echo, dusk a little of both', n.ins > 0.02 && n.echo > 0.2 && dk.ins > 0 && dk.ins < n.ins && dk.echo < n.echo,
     'night ' + n.ins + '/' + n.echo + ', dusk ' + dk.ins + '/' + dk.echo);
S.ok('...and rain hushes the insects', r.ins < n.ins * r.rain, r.ins + ' in the rain');

/* ENGINES */
function movers(def, k) {
  var out = [];
  for (var i = 0; i < k; i++) { var u = g._rtsSpawnUnit('player', def, 40 + i * 4, 40); u.path = [{ x: 0, z: 0 }]; out.push(u); }
  return out;
}
function clear(list) { list.forEach(function (u) { u.dead = true; }); }
var one = movers('tank', 1), w1 = want('day');
clear(one);
var nine = movers('tank', 9), w9 = want('day');
clear(nine);
S.ok('one tank on the move is heard', w1.moving === 1 && w1.eng > 0.02, w1.eng);
S.ok('...nine are louder, but not nine times', w9.eng > w1.eng * 1.5 && w9.eng < w1.eng * 4, w9.eng + ' against ' + w1.eng);
var parked = movers('tank', 3); parked.forEach(function (u) { u.path = null; });
var foot = movers('rifle', 4), wp = want('day');
clear(parked); clear(foot);
S.ok('a parked tank and a marching soldier make no engine note', wp.eng === 0 && wp.moving === 0, wp.moving + ' moving');
var bug = movers('buggy', 1), wb = want('day'); clear(bug);
S.ok('a fast buggy runs higher than a tank', wb.engHz > w1.engHz, wb.engHz.toFixed(1) + ' Hz against ' + w1.engHz.toFixed(1));
heard = false;
var far = movers('tank', 3), wf = want('day'); clear(far);
heard = true;
S.ok('nothing out of earshot counts', wf.eng === 0);

/* BRIDGES */
var br = G.bridges[0];
if (br) {
  var mid = g._rtsBridgeEnd(br, 0.5), on = g._rtsSpawnUnit('player', 'tank', mid[0], mid[1]);
  on.path = [{ x: 0, z: 0 }];
  var wd = want('day');
  on.x = mid[0] + 40; on.z = mid[1] + 40;
  var wo = want('day'); on.dead = true;
  S.ok('a vehicle on a deck rumbles it, the same vehicle off it does not', wd.decks === 1 && wd.bridge > 0.05 && wo.bridge === 0, wd.bridge + ' / ' + wo.bridge);
} else S.ok('this map has a bridge to drive over', false, 'none');

/* LIGHTNING */
var strikes = [], firstAt = null, bright = 0, longest = 0, tPrev = -1;
for (var t = 0; t < 600; t += 0.02) {
  var L = g._rtsLightning(t);
  if (L.k > 0 && firstAt === null) firstAt = t;
  if (L.k > 0.3 && strikes.indexOf(L.n) < 0) { strikes.push(L.n); bright++; }
}
var starts = [], cur = g.RTS_THUNDER_FIRST;
for (var s2 = 0; s2 < 8; s2++) { starts.push(cur); cur += g.RTS_THUNDER_GAP + g.RTS_THUNDER_SPREAD * g._sprHash(s2, 7, 911); }
var gaps = starts.slice(1).map(function (v, i) { return v - starts[i]; });
var lit = 0; for (var u2 = starts[2]; u2 < starts[2] + 2; u2 += 0.01) if (g._rtsLightning(u2).k > 0.02) lit += 0.01;
S.ok('no lightning before RTS_THUNDER_FIRST', firstAt >= g.RTS_THUNDER_FIRST - 1e-9, 'first at ' + (firstAt && firstAt.toFixed(2)));
S.ok('strikes are spaced by the gap, plus up to the spread', gaps.every(function (v) { return v >= g.RTS_THUNDER_GAP && v <= g.RTS_THUNDER_GAP + g.RTS_THUNDER_SPREAD; }) && bright >= 8,
     bright + ' bright strikes in ten minutes, gaps ' + gaps.map(function (v) { return v.toFixed(0); }).join(' '));
S.ok('...each a flicker gone inside a second', lit > 0.05 && lit < 0.7, lit.toFixed(2) + 's lit');
S.ok('...on the same schedule every time', JSON.stringify(g._rtsLightning(starts[3] + 0.03)) === JSON.stringify(g._rtsLightning(starts[3] + 0.03)) && g._rtsLightning(starts[3] + 0.03).k > 0.5);

/* EARSHOT */
g._rtsR = g.window._rtsR = { focus: { x: 0, z: 0 } };
g._rtsViewSpan = function () { return { w: 100, h: 80 }; };
var reach = 100 * 0.75 * g.RTS_FAR;
S.ok('a fight is heard, muffled, out to RTS_FAR views - and not beyond', g._rtsAudibleFar(reach * 0.9, 0) === true && g._rtsAudibleFar(reach * 1.1, 0) === false,
     'reach ' + reach.toFixed(0) + ' world units across');
g.window.RTS_SKY_FORCE = undefined;

require('../lib/report.js')(S);
