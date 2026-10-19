/* rules/campaign2.js - the campaign's second half, missions five to eight. Part of rts.rules.

   The first four (rules/campaign.js) each teach one thing about the coast - the tide, the fog, the
   crane, the submarine. These four are about the war the newer battles make: an ally who cannot
   hold alone, an enemy that is your own reflection, two bases you can only take by giving your
   ally its orders, and the finale against two live armies at once. Each names the battle it is
   fought on (`skirmish`, rules/skirmish.js), which the mission is laid onto as the first four are.
   Tuned headless both ways (unit/campaign2): the intended play wins, doing nothing loses. */

/* Units of `side` that fight on the ground: the ones a mission sends somewhere. */
function _rtsCampFighters(side) {
  return window._rtsG.ents.filter(function (e) {
    if (e.dead || e.side !== side || e.type !== 'unit' || e.inside || e.air) return false;
    var d = rtsUnitDef(e.def);
    return !!(d && d.weapon && !d.harvest && !d.sea);
  });
}

/* A ring of `n` guns six cells round the start of `side`: its house's turret, every other one a
   pillbox. */
function _rtsCampRing(side, n) {
  var S = window._rtsG.starts[side], gun = rtsBuildableBy(rtsStructDef('turret'), rtsHouseSide(side)) ? 'turret' : 'flametower';
  for (var a = 0; a < n; a++) {
    var t = a / n * Math.PI * 2;
    _rtsMBuild(side, a % 2 ? 'pillbox' : gun, Math.round(S.tx + Math.cos(t) * 6), Math.round(S.tz + Math.sin(t) * 6));
  }
}

RTS_CAMPAIGN.push(
  { id: 'twofronts', name: 'Two Fronts', army: 'allied', diff: 'normal', top: 'hard', seed: 9005, skirmish: { foes: 'ally' },
    brief: 'Your ally holds the flank, and the Dominion has seen that it is the weaker of you. Its columns will march on the allied base, not yours. Your ally cannot hold alone: get your army there, and keep its Command Yard standing for seven minutes.',
    after: 'The flank held and the Dominion columns are spent. Where the armies meet now, each faces its own reflection across the line.',
    goals: [ { id: 'hold', text: function (G, M) { return "Keep your ally's Command Yard standing - " + Math.max(0, Math.ceil((420 - G.t) / 60)) + ' min to go'; } },
             { id: 'yard', text: 'Waves come from the Dominion base: meet them at your ally\'s' } ],
    setup: function (G, M) {
      var E = G.starts.enemy, A = G.starts.ally;
      G.sides.enemy.ctl = 'none';
      G.sides.ally.credits = 0;                         /* stripped for this war: it cannot buy its way out */
      /* ...nor fight, nor earn: everything but its yard and one power plant is gone - with a refinery
         left, its harvest bought it a new army inside two minutes and it held the flank alone */
      G.ents.forEach(function (e) {
        if (e.dead || e.side !== 'ally') return;
        if (e.type === 'unit' || ['yard', 'power'].indexOf(e.def) < 0) {
          if (e.type === 'struct') _rtsFootprint(e, false);
          _rtsKillQuiet(e); e.dead = true; e.hp = 0;
        }
      });
      G.ents.forEach(function (e) { if (!e.dead && e.side === 'enemy' && e.type === 'unit') { e.dead = true; e.hp = 0; } });
      var y = _rtsHas('ally', 'yard'); if (y) { y.tag = 'allyyard'; y.maxHp = y.hp = Math.round(y.maxHp * 2.5); }   /* dug in */
      /* a base that can reinforce: the waves outlast any starting army, so the player has to build */
      var P = G.starts.player;
      _rtsMBuild('player', 'refinery', P.tx - 5, P.tz + 2); _rtsMBuild('player', 'factory', P.tx + 5, P.tz - 3);
      _rtsMBuild('player', 'barracks', P.tx - 4, P.tz - 5); _rtsMBuild('player', 'power', P.tx + 1, P.tz - 7);
      _rtsMUnits('player', 'tank', G.starts.player.tx + 4, G.starts.player.tz + 4, 6, 'force');
      _rtsMUnits('player', 'rocket', G.starts.player.tx + 2, G.starts.player.tz + 6, 5, 'force');
      M.waves = [45, 120, 200, 280, 360]; M.next = 0;
      M.from = { tx: E.tx, tz: E.tz }; M.ally = { tx: A.tx, tz: A.tz };
      M.focus = { tx: A.tx, tz: A.tz };
      _rtsCampReveal(G, A.tx, A.tz, 14);
    },
    check: function (G, M) {
      while (M.next < M.waves.length && G.t >= M.waves[M.next]) {
        var n = M.next++, y = _rtsMTagged(G, 'allyyard')[0];
        var w = _rtsMUnits('enemy', 'tank', M.from.tx, M.from.tz, 3 + n, 'wave')
          .concat(_rtsMUnits('enemy', 'rifle', M.from.tx, M.from.tz, 4, 'wave'))
          .concat(_rtsMUnits('enemy', 'rocket', M.from.tx, M.from.tz, 1 + n, 'wave'));
        w.forEach(function (u) { if (y) _rtsOrderAttack(u, y); });
        _rtsSay('A Dominion column is marching on your ally - wave ' + (n + 1) + ' of ' + M.waves.length + '.');
      }
      if (!_rtsMTagged(G, 'allyyard').length) { M.obj.hold = 'failed'; return { over: 'lose', why: 'Your ally\'s base has fallen, and the flank with it.' }; }
      if (!_rtsHas('player', 'yard')) { M.obj.hold = 'failed'; return { over: 'lose', why: 'Your own command has fallen.' }; }
      if (G.t >= 420) { M.obj.hold = 'done'; M.obj.yard = 'done'; return { over: 'win', why: 'The flank held. The Dominion columns are spent.' }; }
      return null;
    } }
,

  { id: 'mirror', awake: true, name: 'Mirror Line', army: 'soviet', diff: 'easy', seed: 9006, skirmish: { layout: 'mirror' },
    brief: 'The ground here is the same on both sides of the line, down to the last tree: whatever you have, the Compact has its twin. What you have that it does not is a head start. Take its Command Yard inside ten minutes, before it builds up to meet you.',
    after: 'The Compact yard on the line is rubble. The Dominion digs in at two bases and calls its reinforcements: eight minutes out.',
    goals: [ { id: 'yard', text: function (G, M) { return 'Destroy the Compact Command Yard - ' + Math.max(0, Math.ceil((600 - G.t) / 60)) + ' min left'; } },
             { id: 'keep', text: 'Keep your own Command Yard' } ],
    setup: function (G, M) {
      var P = G.starts.player, E = G.starts.enemy;
      var y = _rtsHas('enemy', 'yard');
      if (y) { y.tag = 'target'; y.maxHp = y.hp = y.maxHp * 3; }   /* no rush takes it: measured, a plain yard fell to the head start at 1:02 */
      /* a garrison: the Compact's own guns round its yard, and a tank guard */
      var dx = Math.sign(P.tx - E.tx), dz = Math.sign(P.tz - E.tz);
      _rtsMBuild('enemy', 'turret', E.tx + dx * 6, E.tz + dz * 6); _rtsMBuild('enemy', 'turret', E.tx + dx * 6 + dz * 4, E.tz + dz * 6 - dx * 4);
      _rtsMBuild('enemy', 'turret', E.tx + dx * 6 - dz * 4, E.tz + dz * 6 + dx * 4);
      _rtsMBuild('enemy', 'pillbox', E.tx + dx * 4 + dz * 2, E.tz + dz * 4 - dx * 2); _rtsMBuild('enemy', 'pillbox', E.tx + dx * 4 - dz * 2, E.tz + dz * 4 + dx * 2);
      _rtsMUnits('enemy', 'tank', E.tx + dx * 3, E.tz + dz * 3, 4, 'guard');
      _rtsMBuild('player', 'refinery', P.tx - 5, P.tz + 2); _rtsMBuild('player', 'factory', P.tx + 5, P.tz - 3);
      _rtsMBuild('player', 'barracks', P.tx - 4, P.tz - 5); _rtsMBuild('player', 'power', P.tx + 1, P.tz - 7);
      /* a head start, not the war: with three Bulwarks besides, the yard fell inside ninety seconds */
      _rtsMUnits('player', 'tank', P.tx + 3, P.tz + 6, 3, 'force');
      _rtsMUnits('player', 'v2rl', P.tx + 1, P.tz + 7, 2, 'force');
      M.focus = { tx: P.tx, tz: P.tz }; M.foe = { tx: E.tx, tz: E.tz };
    },
    check: function (G, M) {
      if (!_rtsMTagged(G, 'target').length) { M.obj.yard = 'done'; return { over: 'win', why: 'The Compact yard is rubble. The line is yours.' }; }
      if (!_rtsHas('player', 'yard')) { M.obj.keep = 'failed'; return { over: 'lose', why: 'Your own command has fallen.' }; }
      if (G.t > 600) { M.obj.yard = 'failed'; return { over: 'lose', why: 'The Compact built up faster than you broke through.' }; }
      return null;
    } }
,

  { id: 'orders', name: 'Order of Battle', army: 'allied', diff: 'normal', seed: 9007, skirmish: { foes: 'team' },
    brief: 'Two Dominion bases, one on each side of the line, and eight minutes before their reinforcements land. You cannot take both. Your ally can take one - if you tell it which. Use the ALLY button: send it at one base, and take the other yourself.',
    after: 'Both bases are down, and the reinforcements came ashore all the same. Everything the Dominion has left is on one coast: Breachwater.',
    goals: [ { id: 'y1', text: 'Destroy the Dominion Command Yard across from you' },
             { id: 'y2', text: 'Destroy the second Dominion Command Yard - order your ally there (🤝 ALLY)' },
             { id: 'time', text: function (G, M) { return Math.max(0, Math.ceil((480 - G.t) / 60)) + ' min before their reinforcements land'; } } ],
    setup: function (G, M) {
      var P = G.starts.player, A = G.starts.ally;
      ['enemy', 'enemy2'].forEach(function (k, n) {
        G.sides[k].ctl = 'none';
        var S = G.starts[k], y = _rtsHas(k, 'yard');
        if (y) { y.tag = n ? 'y2' : 'y1'; y.maxHp = y.hp = y.maxHp * 3; }
        G.ents.forEach(function (e) { if (!e.dead && e.side === k && e.type === 'unit') { e.dead = true; e.hp = 0; } });
        _rtsCampRing(k, 8);                              /* one army alone wears down on it */
        _rtsMUnits(k, 'heavy', S.tx + 2, S.tz + 2, 4, 'guard');
      });
      /* the ally waits for its orders: it thinks nothing of its own here (left thinking, it built
         an army of forty and took both bases alone, the player idle), and acts only on ALLY */
      G.sides.ally.ctl = 'none';
      _rtsMUnits('player', 'tank', P.tx + 3, P.tz + 5, 6, 'force');
      _rtsMUnits('player', 'rocket', P.tx + 1, P.tz + 6, 4, 'force');
      _rtsMUnits('ally', 'tank', A.tx + 3, A.tz + 5, 6, 'allyforce');
      _rtsMUnits('ally', 'rocket', A.tx + 1, A.tz + 6, 4, 'allyforce');
      M.focus = { tx: P.tx, tz: P.tz };
    },
    check: function (G, M) {
      var a = _rtsMTagged(G, 'y1').length, b = _rtsMTagged(G, 'y2').length;
      if (!a) M.obj.y1 = 'done';
      if (!b) M.obj.y2 = 'done';
      if (!a && !b) { M.obj.time = 'done'; return { over: 'win', why: 'Both Dominion yards are down. Good orders, commander.' }; }
      if (!_rtsHas('player', 'yard')) return { over: 'lose', why: 'Your own command has fallen.' };
      if (G.t > 480) { M.obj.time = 'failed'; return { over: 'lose', why: 'The Dominion reinforcements have landed.' }; }
      return null;
    } }
,

  { id: 'breachwater', awake: true, name: 'Breachwater', army: 'allied', diff: 'easy', seed: 9008, skirmish: { foes: 'team', size: 'large' },
    brief: 'Everything comes to this coast. Two Dominion armies hold it, both awake, both building, each yard ringed with guns. Your ally waits on your orders, as at the two bases. Break both Command Yards inside ten minutes: send your ally where you are not.',
    after: 'The coast is quiet. The war that began with a convoy on the flats at low water ends here, at Breachwater.',
    goals: [ { id: 'y1', text: 'Destroy the Dominion Command Yard across from you' },
             { id: 'y2', text: 'Destroy the second Dominion Command Yard' },
             { id: 'time', text: function (G, M) { return Math.max(0, Math.ceil((600 - G.t) / 60)) + ' min left'; } } ],
    setup: function (G, M) {
      var P = G.starts.player, A = G.starts.ally;
      ['enemy', 'enemy2'].forEach(function (k, n) {
        var y = _rtsHas(k, 'yard');
        if (y) { y.tag = n ? 'y2' : 'y1'; y.maxHp = y.hp = y.maxHp * 3; }
        _rtsCampRing(k, 8);
        _rtsMUnits(k, 'heavy', G.starts[k].tx + 2, G.starts[k].tz + 2, 4, 'guard');
      });
      G.sides.ally.ctl = 'none';
      _rtsMUnits('ally', 'rocket', A.tx + 1, A.tz + 6, 4, 'allyforce');
      _rtsMBuild('player', 'refinery', P.tx - 5, P.tz + 2); _rtsMBuild('player', 'factory', P.tx + 5, P.tz - 3);
      _rtsMBuild('player', 'barracks', P.tx - 4, P.tz - 5); _rtsMBuild('player', 'power', P.tx + 1, P.tz - 7);
      _rtsMUnits('player', 'tank', P.tx + 3, P.tz + 5, 6, 'force');
      _rtsMUnits('player', 'rocket', P.tx + 1, P.tz + 6, 4, 'force');
      _rtsMUnits('ally', 'tank', A.tx + 3, A.tz + 5, 6, 'allyforce');
      M.focus = { tx: P.tx, tz: P.tz };
    },
    check: function (G, M) {
      var a = _rtsMTagged(G, 'y1').length, b = _rtsMTagged(G, 'y2').length;
      if (!a) M.obj.y1 = 'done';
      if (!b) M.obj.y2 = 'done';
      if (!a && !b) { M.obj.time = 'done'; return { over: 'win', why: 'Both Dominion armies are broken. The coast is yours.' }; }
      if (!_rtsHas('player', 'yard')) return { over: 'lose', why: 'Your own command has fallen.' };
      if (G.t > 600) { M.obj.time = 'failed'; return { over: 'lose', why: 'The Dominion held the coast.' }; }
      return null;
    } }
);
