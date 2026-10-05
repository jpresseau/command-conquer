/* core/tide.js - the tide: the sea goes out and comes back, and the map changes with it.

   Breachwater's coasts are not fixed. On a clock of RTS_TIDE.period seconds of game time the sea
   falls from high water to low and rises again, and the water within RTS_TIDE.reach cells of a
   shore - the FLATS - dries in order as it falls, nearest the shore first. Dry flats are ground:
   a tank can cross a strait at low water that it could not cross at high, and a ship that could
   sail there an hour ago cannot. The hovercraft does not care.

   When the sea comes back the flats flood again, and a land unit caught out on them is SWAMPED:
   it is turned for the nearest dry ground and takes damage for every second it is in the water.
   The player is warned as the tide turns. So low water is an opening with a deadline, which is
   the whole point.

   Derived from game time (G.t) alone and laid out from the cells alone - no random stream - so
   a seed plays the same tide every time, a save resumes it where it was, and a map with no
   water has no tide. Passability is the one thing it changes, and it changes it in ONE place:
   _rtsBlocked reads G.tideDry (core/grid.js). The cells stay water, so a bridge, a shipyard, a
   building's placement and everything else that asks "is this water" is untouched. */

var RTS_TIDE = {
  period: 360,       /* seconds of game time, high water to high water */
  reach: 4,          /* cells out from the shore that can dry: a strait of eight is a causeway at low water */
  swamp: 0.12,       /* of its full hit points, a second, while a land unit is in the flood */
  warn: -0.8         /* the level at which a rising tide is announced: the outermost flats flood
                        at -0.6, so there is a little time to get off them */
};

/* The sea's level: 1 at high water, -1 at low. A game starts at high water. */
function _rtsTideLevel(G) { return Math.cos(2 * Math.PI * ((G.t || 0) % RTS_TIDE.period) / RTS_TIDE.period); }
/* The level below which a flat d cells from the shore is dry: the first ring dries soonest. */
function _rtsTideDriesAt(d) { return 1 - 2 * d / (RTS_TIDE.reach + 1); }
/* LOW WATER, for anything that lives on the flats: the first ring is dry, so there is ground a
   ship cannot sail and water a Monitor can (core/monitor.js). THE EBB: the tide falling, with the
   outermost flats still wet - the window in which a fleet can still sail out down a channel
   that will be a causeway at low water, so an escort sent with the Monitor gets there with it. */
function _rtsTideLow(G) { return _rtsTideLevel(G) <= _rtsTideDriesAt(1); }
function _rtsTideEbbing(G) {
  return ((G.t || 0) % RTS_TIDE.period) < RTS_TIDE.period / 2 && _rtsTideLevel(G) > _rtsTideDriesAt(RTS_TIDE.reach);
}

/* The flats: every open-sea cell within reach of a shore, by its distance from it. */
function _rtsTideInit(G) {
  var N = RTS_N, T = G.terrain, B = G.blocked, D = new Uint8Array(N * N), q = [], i, h;
  for (i = 0; i < N * N; i++) if (T[i] !== RTS_T_WATER) { q.push(i); D[i] = 0; } else D[i] = 255;
  for (h = 0; h < q.length; h++) {
    var c = q[h], x = c % N, z = (c / N) | 0, nd = D[c] + 1;
    if (nd > RTS_TIDE.reach) continue;
    for (var k = 0; k < 4; k++) {
      var ax = x + [1, -1, 0, 0][k], az = z + [0, 0, 1, -1][k];
      if (ax < 0 || az < 0 || ax >= N || az >= N) continue;
      var a = az * N + ax;
      if (D[a] <= nd) continue;
      D[a] = nd; q.push(a);
    }
  }
  /* only open sea: a bridge's deck is always ground and a shipyard's water always a berth */
  for (i = 0; i < N * N; i++) if (T[i] !== RTS_T_WATER || B[i] !== 2 || D[i] > RTS_TIDE.reach) D[i] = 0;
  G.tideD = D; G.tideDry = new Uint8Array(N * N); G.tideRev = 0;
  G.tideLast = _rtsTideLevel(G); G.tideSaid = null;
}

/* WHAT THE TIDE DOES NEXT, AND WHEN - the radar's tide line (ui/sidebar.js). Nothing on screen
   said when the flats would dry or flood: two ten-second lines on a message line anything else
   overwrites, and the last ring - mid-strait, where the crossings open - drying with no line at
   all. The rings dry at fixed levels (_rtsTideDriesAt) and the level is a cosine of the clock, so
   each turn falls at a known second of the period: the first ring dries at tIn, the last at
   tOut, and they flood again in the mirror order. { what, secs } */
function _rtsTideNext(G) {
  var P = RTS_TIDE.period, t = (G.t || 0) % P, k = P / (2 * Math.PI);
  var tIn = k * Math.acos(_rtsTideDriesAt(1)), tOut = k * Math.acos(_rtsTideDriesAt(RTS_TIDE.reach));
  if (t < tIn) return { what: 'flats dry in', secs: tIn - t };
  if (t < tOut) return { what: 'ebbing - low in', secs: tOut - t };
  if (t < P - tOut) return { what: 'low - flood in', secs: P - tOut - t };
  if (t < P - tIn) return { what: 'flooding - high in', secs: P - tIn - t };
  return { what: 'flats dry in', secs: P + tIn - t };
}
function _rtsTideLine(G) {
  var n = _rtsTideNext(G), s = Math.max(0, Math.ceil(n.secs));
  return 'TIDE: ' + n.what + ' ' + Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
}
/* Has this map any flats for the tide to dry? (none: no tide line) */
function _rtsTideAny(G) {
  if (G.tideAny == null && G.tideD) { G.tideAny = 0; for (var i = 0; i < G.tideD.length; i++) if (G.tideD[i]) { G.tideAny = 1; break; } }
  return !!G.tideAny;
}

/* how long the turn of the tide stays on the message line: the one warning before the flood,
   where the default four seconds was gone before a player on the sidebar looked up */
var RTS_TIDE_SAY = 10;
function _rtsTideTick(dt) {
  var G = window._rtsG;
  if (!G.tideD) _rtsTideInit(G);
  var D = G.tideD, Y = G.tideDry, N = RTS_N, L = _rtsTideLevel(G), i, changed = false;
  for (i = 0; i < N * N; i++) {
    if (!D[i]) continue;
    /* open sea NOW: a Bridge Layer may have laid a deck over a flat since the flats were found
       (core/bridgelayer.js), and a deck is ground at every tide */
    var dry = G.blocked[i] !== 2 ? 0 : L <= _rtsTideDriesAt(D[i]) ? 1 : 0;
    if (Y[i] !== dry) { Y[i] = dry; changed = true; }
  }
  if (changed) G.tideRev = (G.tideRev || 0) + 1;
  /* the turn of the tide, said once each way */
  var rising = L > G.tideLast;
  if (rising && G.tideLast < RTS_TIDE.warn && L >= RTS_TIDE.warn && G.tideSaid !== 'in') {
    G.tideSaid = 'in'; _rtsSay('The tide is turning - get off the flats.', RTS_TIDE_SAY);
  } else if (!rising && G.tideLast > _rtsTideDriesAt(1) && L <= _rtsTideDriesAt(1) && G.tideSaid !== 'out') {
    G.tideSaid = 'out'; _rtsSay('The tide is going out.', RTS_TIDE_SAY);
  }
  G.tideLast = L;
  /* SWAMPED: a land unit standing in the flood, on a flat that is under water again */
  for (i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.type !== 'unit' || u.air || u.inside) continue;
    if (_rtsDomainOf(u)) continue;                         /* ships and hovercraft are at home */
    var c = _rtsIdx(_rtsTX(u.x), _rtsTX(u.z));
    if (!D[c] || Y[c] || G.blocked[c] !== 2) { u.ashore = 0; continue; }
    _rtsDamage(u, u.maxHp * RTS_TIDE.swamp * dt, null, false);
    if (u.dead) { if (u.side === 'player') _rtsSay('Swept away by the tide.'); continue; }
    if (!u.ashore || !u.path) {
      var dryCell = _rtsNearestOpen(_rtsTX(u.x), _rtsTX(u.z), RTS_TIDE.reach + 3, null);
      if (dryCell) { u.ashore = 1; _rtsOrderMove(u, _rtsWX(dryCell[0]), _rtsWX(dryCell[1]), false); }
    }
  }
}
