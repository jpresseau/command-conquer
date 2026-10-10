/* rules/campaign.js - the campaign: four missions on generated maps (core/campaign.js runs them).

   Each is a seed and the two armies, a briefing, its goals, a setup that lays the mission onto the
   battle the seed made, and a check, every tick, that keeps the goals and calls the result. A
   mission's memory is plain data in M (G.mission); nothing here is kept on G but through it. */

/* across the water: the lagoon's long axis, and a shore cell either side of it */
function _rtsCampAcross(G) {
  var W = _rtsMWater(G), sxx = 0, szz = 0, sxz = 0;
  W.cells.forEach(function (i) { var dx = (i % RTS_N) - W.tx, dz = ((i / RTS_N) | 0) - W.tz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; });
  var ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), nx = -Math.sin(ang), nz = Math.cos(ang);   /* normal to the long axis */
  function shore(sgn) {
    for (var d = 2; d < 40; d++) {
      var x = Math.round(W.tx + nx * d * sgn), z = Math.round(W.tz + nz * d * sgn);
      if (_rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] !== RTS_T_WATER && !_rtsBlocked(x, z, null)) {
        var c = _rtsNearestOpen(Math.round(x + nx * 4 * sgn), Math.round(z + nz * 4 * sgn), 6, null);
        return c ? { tx: c[0], tz: c[1] } : { tx: x, tz: z };
      }
    }
    return null;
  }
  var a = shore(1), b = shore(-1), P = G.starts.player;
  /* the convoy starts on the shore nearer the player's corner */
  if (a && b && Math.hypot(b.tx - P.tx, b.tz - P.tz) < Math.hypot(a.tx - P.tx, a.tz - P.tz)) { var t = a; a = b; b = t; }
  return { from: a, to: b, water: W };
}
function _rtsCampReveal(G, tx, tz, r) {
  for (var z = tz - r; z <= tz + r; z++) for (var x = tx - r; x <= tx + r; x++) if (_rtsInB(x, z) && Math.hypot(x - tx, z - tz) <= r) G.mapped[_rtsIdx(x, z)] = 1;
}
function _rtsCampLeft(G, side, keys) {
  return G.ents.filter(function (e) { return !e.dead && e.side === side && e.type === 'unit' && (!keys || keys.indexOf(e.def) >= 0); }).length;
}

var RTS_CAMPAIGN = [
  { id: 'lowwater', name: 'Low Water', army: 'allied', diff: 'easy', seed: 9001,
    brief: 'The strait between you and the Dominion shore is too deep to ford - except at low water, when the sea goes out and leaves the flats dry for a few minutes. Wait for the ebb, take the convoy across while the sand holds, and land it on the far shore before the flood comes back. The far side is lightly held.',
    goals: [ { id: 'cross', text: 'Get two convoy APCs to the far shore (marked) before the flood: the flats are dry from about 2:10 to 3:50' },
             { id: 'keep', text: 'Keep at least two APCs alive' } ],
    setup: function (G, M) {
      var P = G.starts.player, E = G.starts.enemy, L = Math.hypot(E.tx - P.tx, E.tz - P.tz) || 1;
      var nx = (E.tx - P.tx) / L, nz = (E.tz - P.tz) / L, cx = Math.round((P.tx + E.tx) / 2), cz = Math.round((P.tz + E.tz) / 2);
      _rtsMClear(G, 'player'); _rtsMClear(G, 'enemy');
      G.sides.enemy.ctl = 'none';
      _rtsMStrait(G, cx, cz, nx, nz, 3.5);    /* seven cells: every one within the tide's reach of a shore */
      function at(d) { var c = _rtsNearestOpen(Math.round(cx + nx * d), Math.round(cz + nz * d), 8, null); return { tx: c[0], tz: c[1] }; }
      var A = { from: at(-12), to: at(11) };
      M.to = A.to; M.from = A.from;
      _rtsMUnits('player', 'apc', A.from.tx, A.from.tz, 3, 'convoy');
      _rtsMUnits('player', 'light', A.from.tx + 2, A.from.tz, 3, null);
      _rtsMUnits('player', 'rifle', A.from.tx - 2, A.from.tz, 2, null);
      _rtsMBuild('enemy', 'flametower', A.to.tx + 6, A.to.tz + 4);
      _rtsMUnits('enemy', 'rifle', A.to.tx + 5, A.to.tz - 3, 3, null);
      _rtsMUnits('enemy', 'dog', A.to.tx + 7, A.to.tz, 2, null);
      _rtsCampReveal(G, A.from.tx, A.from.tz, 10); _rtsCampReveal(G, A.to.tx, A.to.tz, 5);
      M.focus = A.from;
    },
    check: function (G, M) {
      var c = _rtsMTagged(G, 'convoy'), there = c.filter(function (e) { return _rtsMNear(e, M.to.tx, M.to.tz, 6); }).length;
      M.obj.cross = there >= 2 ? 'done' : '';
      if (there >= 2) return { over: 'win', why: 'The convoy is across, and the sea is closing behind it.' };
      if (c.length < 2) { M.obj.keep = 'failed'; return { over: 'lose', why: 'Too few of the convoy are left to make the landing.' }; }
      if (G.t > 250) { M.obj.cross = 'failed'; return { over: 'lose', why: 'The flood came in before the convoy was across.' }; }
      return null;
    } },

  { id: 'fogbank', name: 'Blind the Fortress', army: 'allied', diff: 'normal', seed: 9002,
    brief: 'The Dominion command yard sits behind a ring of guns no column survives in clear air. Your Mist Tower is charged: lay a Fog Bank over the fortress and its towers see three cells and no more. Go in under it and destroy the command yard.',
    goals: [ { id: 'yard', text: 'Destroy the Dominion Command Yard' },
             { id: 'force', text: 'Do not lose the whole strike group' } ],
    setup: function (G, M) {
      var P = G.starts.player, E = G.starts.enemy;
      _rtsMClear(G, 'player');
      G.sides.enemy.ctl = 'none';
      G.sides.enemy.credits = 99999;
      var y = _rtsHas('enemy', 'yard'); if (y) y.tag = 'target';
      /* power first: a browned-out tower does not fire at all */
      for (var q = 0; q < 7; q++) _rtsMBuild('enemy', 'apower', Math.round(E.tx - 16 * Math.cos(q)), Math.round(E.tz - 16 * Math.sin(q)));
      /* two rings of guns: no column lives through them in clear air */
      for (var a = 0; a < 8; a++) _rtsMBuild('enemy', 'tesla', Math.round(E.tx + Math.cos(a * 0.785) * 7), Math.round(E.tz + Math.sin(a * 0.785) * 7));
      for (a = 0; a < 10; a++) _rtsMBuild('enemy', a % 2 ? 'flametower' : 'rocketpit', Math.round(E.tx + Math.cos(a * 0.628 + 0.3) * 12), Math.round(E.tz + Math.sin(a * 0.628 + 0.3) * 12));
      _rtsMUnits('enemy', 'heavy', E.tx + 2, E.tz + 2, 4, null).forEach(function (u) { u.order = 'hold'; });
      _rtsMBuild('player', 'power', P.tx, P.tz);
      _rtsMBuild('player', 'mist', P.tx + 4, P.tz + 4);
      G.sides.player.supers = { fogbank: { t: 1e4, ready: true, said: true } };
      _rtsMUnits('player', 'tank', P.tx + 6, P.tz - 4, 6, 'force');
      _rtsMUnits('player', 'rocket', P.tx + 8, P.tz - 6, 3, 'force');
      _rtsCampReveal(G, E.tx, E.tz, 12); _rtsCampReveal(G, P.tx, P.tz, 12);
      M.focus = { tx: P.tx, tz: P.tz };
    },
    check: function (G, M) {
      var y = _rtsMTagged(G, 'target');
      if (!y.length) { M.obj.yard = 'done'; return { over: 'win', why: 'The fortress is headless: its command yard is rubble.' }; }
      if (!_rtsMTagged(G, 'force').length && !_rtsCampLeft(G, 'player')) { M.obj.force = 'failed'; return { over: 'lose', why: 'The strike group is gone, and the fortress stands.' }; }
      return null;
    } },

  { id: 'skycrane', name: 'Armour by Air', army: 'soviet', diff: 'normal', seed: 9003,
    brief: 'The Compact has put its radar on an island no bridge reaches and no tide uncovers. Your Sky Cranes can lift one tank at a time: carry the armour over the water and take the radar down inside six minutes.',
    goals: [ { id: 'radar', text: 'Destroy the Compact radar on the island' },
             { id: 'keep', text: 'Keep the Sky Cranes or the tanks alive' } ],
    setup: function (G, M) {
      var P = G.starts.player, E = G.starts.enemy;
      _rtsMClear(G, 'player'); _rtsMClear(G, 'enemy');
      G.sides.enemy.ctl = 'none';
      G.sides.enemy.credits = 99999;
      _rtsMMoat(G, E.tx, E.tz, 9, 21);
      var r = _rtsMBuild('enemy', 'radar', E.tx, E.tz, 'target');
      if (r) r.maxHp = r.hp = r.maxHp * 3;   /* a hardened radar: one drop of two tanks is not enough */
      _rtsMBuild('enemy', 'power', E.tx + 4, E.tz - 3); _rtsMBuild('enemy', 'power', E.tx - 4, E.tz - 4);
      _rtsMBuild('enemy', 'turret', E.tx - 4, E.tz + 3); _rtsMBuild('enemy', 'pillbox', E.tx + 3, E.tz + 4);
      _rtsMBuild('enemy', 'turret', E.tx + 5, E.tz + 1); _rtsMBuild('enemy', 'turret', E.tx - 1, E.tz - 6);
      _rtsMUnits('enemy', 'rifle', E.tx - 3, E.tz - 3, 3, null);
      _rtsMBuild('player', 'yard', P.tx, P.tz);
      _rtsMBuild('player', 'power', P.tx + 4, P.tz - 4);
      _rtsMBuild('player', 'afld', P.tx - 5, P.tz + 3);
      _rtsMUnits('player', 'skycrane', P.tx - 3, P.tz + 6, 2, 'lift');
      _rtsMUnits('player', 'heavy', P.tx + 6, P.tz, 4, 'armour');
      _rtsCampReveal(G, E.tx, E.tz, 22); _rtsCampReveal(G, P.tx, P.tz, 12);
      M.focus = { tx: P.tx, tz: P.tz }; M.isle = { tx: E.tx, tz: E.tz };
      M.ok = !!r;
    },
    check: function (G, M) {
      if (!_rtsMTagged(G, 'target').length) { M.obj.radar = 'done'; return { over: 'win', why: 'The radar is down, and the island is yours.' }; }
      if (!_rtsMTagged(G, 'armour').length || (!_rtsMTagged(G, 'lift').length && !_rtsMTagged(G, 'armour').some(function (e) { return _rtsMNear(e, M.isle.tx, M.isle.tz, 9); }))) {
        M.obj.keep = 'failed'; return { over: 'lose', why: 'Nothing left can reach the island.' };
      }
      if (G.t > 360) { M.obj.radar = 'failed'; return { over: 'lose', why: 'The radar called in the Compact fleet. Too late.' }; }
      return null;
    } },

  { id: 'channel', name: 'Hold the Channel', army: 'soviet', diff: 'normal', seed: 9004,
    brief: 'A Compact flotilla is coming up the lagoon for your Sub Pen. Hold the shore for eight minutes, until the relief column arrives. Their ships come in on the high water; at low tide the flats strand them.',
    goals: [ { id: 'hold', text: function (G, M) { return 'Hold for eight minutes - ' + Math.max(0, Math.ceil((480 - G.t) / 60)) + ' to go'; } },
             { id: 'yard', text: 'Keep the Sub Pen on the shore standing' } ],
    setup: function (G, M) {
      var P = G.starts.player, W = _rtsMWater(G);
      _rtsMClear(G, 'enemy');
      G.sides.enemy.ctl = 'none';
      var y = _rtsHas('player', 'yard'); if (y) y.tag = 'yard';
      /* the guns on the shore nearest the base */
      var best = null, bd = 1e9;
      W.cells.forEach(function (i) { var x = i % RTS_N, z = (i / RTS_N) | 0, d = Math.hypot(x - P.tx, z - P.tz); if (d < bd) { bd = d; best = { tx: x, tz: z }; } });
      M.shore = best;
      var far = null, fd = -1;
      W.cells.forEach(function (i) { var x = i % RTS_N, z = (i / RTS_N) | 0, d = Math.hypot(x - best.tx, z - best.tz); if (d > fd && !_rtsBlocked(x, z, 'sea')) { fd = d; far = { tx: x, tz: z }; } });
      M.mouth = far;
      var mx = Math.round((P.tx + best.tx) / 2), mz = Math.round((P.tz + best.tz) / 2);
      _rtsMBuild('player', 'power', P.tx + 5, P.tz - 5); _rtsMBuild('player', 'power', P.tx + 8, P.tz - 2);
      _rtsMBuild('player', 'tesla', mx, mz); _rtsMBuild('player', 'flametower', mx + 3, mz - 2);
      _rtsMBuild('player', 'refinery', P.tx - 5, P.tz + 2);
      M.pen = !!_rtsMBuild('player', 'subpen', best.tx, best.tz, 'pen');
      _rtsMTagged(G, 'pen').forEach(function (e) { e.maxHp = e.hp = 1800; });   /* a hardened pen */
      _rtsMBuild('player', 'tesla', Math.round((best.tx * 3 + P.tx) / 4), Math.round((best.tz * 3 + P.tz) / 4));
      _rtsMUnits('player', 'sub', best.tx, best.tz, 2, 'subs');
      _rtsMUnits('player', 'v2rl', mx - 2, mz + 3, 3, null);
      _rtsMUnits('player', 'rocket', mx + 1, mz + 4, 4, null);
      _rtsCampReveal(G, best.tx, best.tz, 14);
      M.waves = [40, 130, 230, 340, 420]; M.next = 0;
      M.focus = { tx: mx, tz: mz };
    },
    check: function (G, M) {
      while (M.next < M.waves.length && G.t >= M.waves[M.next]) {
        var n = M.next++, ships = [];
        ships = ships.concat(_rtsMUnits('enemy', 'gunboat', M.mouth.tx, M.mouth.tz, 1 + Math.ceil(n / 2), 'fleet'));
        if (n >= 2) ships = ships.concat(_rtsMUnits('enemy', 'destroyer', M.mouth.tx, M.mouth.tz, 1, 'fleet'));
        if (n >= 4) ships = ships.concat(_rtsMUnits('enemy', 'cruiser', M.mouth.tx, M.mouth.tz, 1, 'fleet'));
        var pen = _rtsMTagged(G, 'pen')[0];
        ships.forEach(function (s) { if (pen) _rtsOrderAttack(s, pen); else _rtsOrderMove(s, _rtsWX(M.shore.tx), _rtsWX(M.shore.tz), true); });
        _rtsSay('Ships on the water - wave ' + (n + 1) + ' of ' + M.waves.length + '.');
      }
      if (!_rtsMTagged(G, 'pen').length) { M.obj.yard = 'failed'; return { over: 'lose', why: 'The Sub Pen is gone, and the channel with it.' }; }
      if (G.t >= 480) { M.obj.hold = 'done'; return { over: 'win', why: 'The relief column is here. The channel held.' }; }
      return null;
    } }
];
