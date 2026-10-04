/* THE TIDE (core/tide.js; passability in core/grid.js _rtsBlocked). On a real generated map:

     THE CLOCK      high water at the start, low at half the period, high again at the full - from
                    game time alone, so a seed plays the same tide every time
     THE FLATS      the open sea within reach of a shore, by distance; never a bridge's deck or a
                    shipyard's berth
     IN ORDER       as the sea falls the ring nearest the shore dries first and the outermost last,
                    and they flood again in the other order
     GROUND         a dry flat is ground to a tank and no water to a ship; under water again, the
                    other way round; a hovercraft goes either way at any tide
     A CROSSING     somewhere on the map a strait a tank cannot cross at high water, or must drive
                    far round, is a short drive at low water
     SWAMPED        a tank caught on the flats as the sea comes back is turned for dry ground, gets
                    there, and is hurt by the water on the way; a squad left standing in it is lost
     WARNED         the player is told the tide is going out, and told again as it turns
     A DECK         a bridge laid over a flat in play is ground at every tide */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('tide');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);
var T, B, P = 0;

function fresh() {
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  T = G.terrain; B = G.blocked; P = g.RTS_TIDE.period;
  return G;
}
function at(G, t) { G.t = t; g._rtsTideTick(0); }
function pathLen(sx, sz, gx, gz, dom) {
  var p = g._rtsPath(sx, sz, gx, gz, dom);
  if (!p || !p.length) return Infinity;
  var L = 0, x = sx, z = sz;
  p.forEach(function (q) { L += Math.hypot(q.x - x, q.z - z); x = q.x; z = q.z; });
  return L;
}
var said = [];
g.window._rtsSay = g._rtsSay = function (m) { said.push(m); };

/* ---------------- the clock ---------------- */
var G = fresh();
S.ok('high water at the start, low at half the period, high again at the full',
     Math.abs(g._rtsTideLevel({ t: 0 }) - 1) < 1e-9 && Math.abs(g._rtsTideLevel({ t: P / 2 }) + 1) < 1e-9 &&
     Math.abs(g._rtsTideLevel({ t: P }) - 1) < 1e-9, 'period ' + P + ' s');

/* ---------------- the flats ---------------- */
at(G, 0);
var N = g.RTS_N, rings = [0, 0, 0, 0, 0, 0], bad = 0;
for (var i = 0; i < N * N; i++) {
  var d = G.tideD[i];
  if (!d) continue;
  rings[d]++;
  if (T[i] !== g.RTS_T_WATER || B[i] !== 2) bad++;
}
S.ok('the flats ring the coasts, one to ' + g.RTS_TIDE.reach + ' cells out', rings.slice(1, g.RTS_TIDE.reach + 1).every(function (n) { return n > 50; }), rings.slice(1, g.RTS_TIDE.reach + 1).join(' / ') + ' cells');
S.eq('...and every one is open sea - no deck, no berth, no land', bad, 0);
S.ok('...dry at high water, none of them', !G.tideDry.some(Boolean), '');

/* ---------------- in order ---------------- */
/* Sampled every 2% of the period: at each moment every ring is wholly dry or wholly wet, the dry
   ones are always the INNER rings, and how many grows to all of them as the sea falls and
   shrinks to none as it rises. */
var R = g.RTS_TIDE.reach;
function dryCount(G) {
  var r = [];
  for (var q = 1; q <= R; q++) r[q] = 0;
  for (var j = 0; j < N * N; j++) if (G.tideD[j] && G.tideDry[j]) r[G.tideD[j]]++;
  var k = 0, whole = true, inner = true;
  for (q = 1; q <= R; q++) {
    if (r[q] && r[q] !== rings[q]) whole = false;
    if (r[q]) { if (q !== k + 1) inner = false; k = q; }
  }
  return { k: k, whole: whole, inner: inner };
}
var seqF = [], seqR = [], allWhole = true, allInner = true;
for (var f = 0; f <= 1.0001; f += 0.02) {
  at(G, P * f);
  var dc = dryCount(G);
  allWhole = allWhole && dc.whole; allInner = allInner && dc.inner;
  (f <= 0.5 ? seqF : seqR).push(dc.k);
}
function mono(a, up) { for (var m = 1; m < a.length; m++) if (up ? a[m] < a[m - 1] : a[m] > a[m - 1]) return false; return true; }
S.ok('every ring dries and floods all at once, and the dry ones are always the inner rings', allWhole && allInner, '');
S.ok('as the sea falls the rings dry one after another, nearest the shore first, to all of them',
     mono(seqF, true) && seqF[0] === 0 && seqF[seqF.length - 1] === R && seqF.indexOf(1) >= 0 && seqF.indexOf(R - 1) >= 0, seqF.join(''));
S.ok('...and as it rises they flood the other way, to none', mono(seqR, false) && seqR[seqR.length - 1] === 0, seqR.join(''));

/* ---------------- ground ---------------- */
var flat = -1;
for (i = 0; i < N * N && flat < 0; i++) if (G.tideD[i] === g.RTS_TIDE.reach) flat = i;
var fx = flat % N, fz = (flat / N) | 0;
at(G, P / 2);
var lo = { land: !g._rtsBlocked(fx, fz, null), sea: !g._rtsBlocked(fx, fz, 'sea'), hover: !g._rtsBlocked(fx, fz, 'hover') };
at(G, 0);
var hi = { land: !g._rtsBlocked(fx, fz, null), sea: !g._rtsBlocked(fx, fz, 'sea'), hover: !g._rtsBlocked(fx, fz, 'hover') };
S.ok('a dry flat is ground to a tank and no water to a ship', lo.land && !lo.sea, JSON.stringify(lo));
S.ok('...under water again, the other way round', !hi.land && hi.sea, JSON.stringify(hi));
S.ok('...and a hovercraft goes either way at any tide', lo.hover && hi.hover, '');

/* ---------------- a crossing ---------------- */
var best = null;
for (var tz = 2; tz < N - 2; tz += 2) for (var tx = 2; tx < N - 2; tx += 2) {
  if (T[g._rtsIdx(tx, tz)] === g.RTS_T_WATER || B[g._rtsIdx(tx, tz)] !== 0) continue;
  for (var dd = 0; dd < 4; dd++) {
    var dx = [1, -1, 0, 0][dd], dz = [0, 0, 1, -1][dd];
    for (var k = 1; k <= 2 * g.RTS_TIDE.reach + 1; k++) {
      var x = tx + dx * k, z = tz + dz * k;
      if (!g._rtsInB(x, z)) break;
      var c = g._rtsIdx(x, z);
      if (T[c] === g.RTS_T_WATER) { if (B[c] !== 2) break; continue; }
      if (k > 2 && B[c] === 0) {
        var a = { x: g._rtsWX(tx), z: g._rtsWX(tz) }, b = { x: g._rtsWX(x), z: g._rtsWX(z) };
        at(G, 0); var high = pathLen(a.x, a.z, b.x, b.z, null);
        at(G, P / 2); var low = pathLen(a.x, a.z, b.x, b.z, null);
        var gain = high === Infinity ? 1e9 : high / Math.max(1, low);
        if (low < Infinity && (!best || gain > best.gain)) best = { a: a, b: b, high: high, low: low, gain: gain };
      }
      break;
    }
  }
}
S.ok('somewhere a strait a tank must drive far round at high water is a short drive at low',
     !!best && best.gain > 3, best ? (best.high === Infinity ? 'no way at high water' : best.high.toFixed(0)) + ' -> ' + best.low.toFixed(0) : 'none');

/* ---------------- swamped ---------------- */
function caught(def) {
  var G2 = fresh();
  at(G2, P / 2);                                            /* low water: out onto the flats */
  var u = g._rtsSpawnUnit('player', def, g._rtsWX(fx), g._rtsWX(fz));
  u.x = g._rtsWX(fx); u.z = g._rtsWX(fz); u.path = null; u.order = def === 'rifle' ? 'hold' : null;
  G2.t = P * 0.66;                                          /* the outermost ring has flooded */
  var hp0 = u.hp, wet = 0, out = false;
  for (var s = 0; s < 30 * 25; s++) {
    if (def === 'rifle') { u.path = null; u.x = g._rtsWX(fx); u.z = g._rtsWX(fz); }   /* stands its ground */
    g._rtsTick(1 / 30);
    var cc = g._rtsIdx(g._rtsTX(u.x), g._rtsTX(u.z));
    if (G2.tideD[cc] && !G2.tideDry[cc] && B[cc] === 2) wet++;
    else if (!u.dead && wet) { out = true; break; }
    if (u.dead) break;
  }
  return { u: u, hp0: hp0, out: out, wet: wet };
}
said.length = 0;
var tk = caught('tank');
S.ok('a tank caught on the flats as the sea comes back makes for dry ground and gets there', tk.out && !tk.u.dead,
     (tk.out ? 'ashore' : 'still in the water') + ' after ' + (tk.wet / 30).toFixed(1) + ' s in it');
S.ok('...hurt by the water on the way', tk.u.hp < tk.hp0, tk.u.hp.toFixed(0) + ' of ' + tk.hp0);
var sq = caught('rifle');
S.ok('a squad left standing in the flood is lost', sq.u.dead, sq.u.dead ? 'swept away after ' + (sq.wet / 30).toFixed(1) + ' s' : 'alive at ' + sq.u.hp);

/* ---------------- warned ---------------- */
G = fresh(); said.length = 0;
for (var t = 0; t <= P; t += 1) at(G, t);
var outN = said.filter(function (m) { return /going out/.test(m); }).length, inN = said.filter(function (m) { return /turning/.test(m); }).length;
S.ok('over one tide the player is told it is going out, once, and that it is turning, once', outN === 1 && inN === 1, JSON.stringify(said));

/* ---------------- a deck ---------------- */
G = fresh();
at(G, 0);
B[flat] = 0;                                                /* a deck laid over a flat (core/bridgelayer.js) */
var deckLand = [0, P * 0.25, P / 2, P * 0.75].every(function (tt) { at(G, tt); return !g._rtsBlocked(fx, fz, null) && !G.tideDry[flat]; });
var bt = g._rtsSpawnUnit('player', 'tank', g._rtsWX(fx), g._rtsWX(fz));
bt.x = g._rtsWX(fx); bt.z = g._rtsWX(fz); bt.order = 'hold';
var bhp = bt.hp;
G.t = P * 0.75; for (var s2 = 0; s2 < 60; s2++) { bt.x = g._rtsWX(fx); bt.z = g._rtsWX(fz); g._rtsTick(1 / 30); }
S.ok('a bridge laid over a flat is ground at every tide, and nothing on it is swamped', deckLand && bt.hp === bhp,
     'deck ' + (deckLand ? 'ground throughout' : 'not'), ', tank ' + bt.hp + ' of ' + bhp);

require('../lib/report.js')(S);
