/* core/base.js - BASE.CPP: the opponent's prebuilt base blueprint. Part of rts.core. */

/* ------------------------------------------------------------- BASE.CPP: the base blueprint

   A base in the originals is not "n refineries and m turrets somewhere near the yard" - it is
   an ORDERED LIST OF NODES, each one a (building type, cell) pair. `Get_Building` looks at the
   node's cell and returns the building only if a building OF THAT TYPE is standing exactly
   there; `Is_Built` is that test as a bool; `Next_Buildable` walks the list in order and hands
   back the first HOLE, optionally filtered to a type. Order is priority, and the cell is part
   of the plan rather than something to work out later.

   The consequence that matters is rebuilding. Blow up an enemy refinery and the node it
   occupied becomes a hole; the next refinery the AI builds goes back in that hole - the same
   cell it was lost from. The base repairs to its plan instead of being reshaped by whatever
   was destroyed.

   The adaptation: RA reads its nodes from the scenario INI, where a designer placed them.
   There are no scenario files here, so the blueprint is SEEDED from the opening layout
   `_rtsLayBase` produces and GROWN by recording every position the AI scan-places into. So the
   first raid is repaired against the designed opening, and later expansion becomes part of the
   plan the moment it is built. */
function _rtsBaseAdd(side, key, tx, tz) {
  var G = window._rtsG;
  if (!G.base) G.base = {};
  if (!G.base[side]) G.base[side] = [];
  G.base[side].push({ key:key, tx:tx, tz:tz });
}
/* Get_Building: type AND cell must both match, which is what makes a node a plan rather than
   a hint. A power plant sitting where the refinery node is does not fill that node. */
function _rtsBaseGetBuilding(side, node) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.selling || e.type !== 'struct' || e.side !== side) continue;
    if (e.def === node.key && e.tx === node.tx && e.tz === node.tz) return e;
  }
  return null;
}
/* Next_Buildable: the first hole, in list order. A null type means "any hole".

   One addition to the original: a hole whose cell can no longer be built on is skipped rather
   than returned. RA checks placement separately; doing it inside the walk matters here because
   returning only the FIRST hole means one permanently blocked node - the player walled over it,
   ore crept in - would shadow every later hole of the same type and the plan would stop
   repairing itself from that point on. A hole you cannot build in is not a hole you can fill. */
function _rtsNextBuildable(side, key) {
  var G = window._rtsG, list = (G.base && G.base[side]) || [];
  for (var i = 0; i < list.length; i++) {
    var n = list[i];
    if (key && n.key !== key) continue;
    if (_rtsBaseGetBuilding(side, n)) continue;
    if (!_rtsCanPlace(side, n.key, n.tx, n.tz)) continue;
    return n;
  }
  return null;
}
/* Is_Node: is this building part of the plan? Used to keep _rtsPlaceStruct from adding a
   second node every time a hole is filled by the building it was a hole for. */
function _rtsBaseIsNode(e) {
  if (!e || e.type !== 'struct') return false;
  var G = window._rtsG, list = (G.base && G.base[e.side]) || [];
  for (var i = 0; i < list.length; i++)
    if (list[i].key === e.def && list[i].tx === e.tx && list[i].tz === e.tz) return true;
  return false;
}
/* Selling is a decision NOT to have the building - the AI sells for cash or to shed power
   load. Leaving the node behind would make it a hole, the AI would rebuild it, and the pair
   would oscillate forever. Destruction leaves the node; a sale removes it. */
function _rtsBaseDropNode(e) {
  var G = window._rtsG;
  if (!G.base || !G.base[e.side]) return;
  var list = G.base[e.side];
  for (var i = 0; i < list.length; i++)
    if (list[i].key === e.def && list[i].tx === e.tx && list[i].tz === e.tz) { list.splice(i, 1); return; }
}

function _rtsNewGame(seed, diff) {
  /* THE battlefield size is decided here and only here. It is derived from whether a map is
     loaded, because every grid below is allocated against it and they must agree.

     It used to be set as a side effect of assembling a map - which was fine when assembling
     meant "about to play this", and wrong the moment anything assembled a map to ASK A
     QUESTION. The editor's CHECK button does exactly that and never loads the map, so one
     click left RTS_N at the checked map's size for the rest of the session and the next
     generated battle came out 124 wide instead of 128. Nothing reported it. */
  RTS_N = (window._RTS_MAP && window._RTS_MAP.n) ? window._RTS_MAP.n : RTS_MAP_DEFAULT_N;
  /* Adopting a map adopts its theatre, for the same reason and in the same place as the size
     above: this is the one point that means "about to play this", so it is the only place the
     artwork is allowed to change under the renderer. A generated battle is always temperate. */
  if (typeof rtsSetTheatre === 'function')
    rtsSetTheatre((window._RTS_MAP && window._RTS_MAP.theatre) || 'TEMPERAT');

  var G = {
    t:0, seed:seed || 12345, over:null, msg:null, msgT:0, shake:0,
    /* the whole difficulty system is this one string plus RTS_DIFF; see _rtsBias */
    diff:(RTS_DIFF[diff] ? diff : (RTS_DIFF[window._RTS_DIFF] ? window._RTS_DIFF : RTS_DIFF_DEFAULT)),
    blocked:new Uint8Array(RTS_N * RTS_N),
    terrain:new Uint8Array(RTS_N * RTS_N),  /* RTS_T_* - what the ground IS, for the renderer */
    scorch:new Uint8Array(RTS_N * RTS_N),   /* 0 none, 1-6 scorch variant, +8 bit = crater */
    /* BASE.CPP's node list, per side: the ordered (type, cell) plan a base is rebuilt against */
    base:{ player:[], enemy:[] },
    corpses:[],                             /* {x,z,v} the renderer has yet to stamp */
    /* THE RECORD, as opposed to the hand-off. `corpses` is drained by the renderer - it pops
       each entry into the terrain bake and the list is empty again by the next frame - so it is
       a queue, not a memory, and a save taken after the frame that stamped them held nothing.
       Bodies already on the battlefield vanished across a load and the ground came back freshly
       mown. G.scorch already had this shape (a persistent grid, with newScorch as its queue);
       this is the same idea for corpses, and the load rebuilds the queue from it. */
    corpseLog:[],
    newScorch:[],                           /* cells the renderer has yet to stamp */
    scrap:new Float32Array(RTS_N * RTS_N),
    /* GoldValue 35 / GemValue 110: a flag per tile, not a second resource. Same mining, same
       refinery, ~3x the credits - so a gem field is worth crossing the map for. */
    gems:new Uint8Array(RTS_N * RTS_N),
    /* MAP.CPP's IsMapped / IsVisible, one byte each. These are the PLAYER's knowledge of the
       map - the AI is not fogged, exactly as the original's computer opponent is not. */
    mapped:new Uint8Array(RTS_N * RTS_N),
    vis:new Uint8Array(RTS_N * RTS_N),
    owner:new Int32Array(RTS_N * RTS_N),   /* entity id occupying the tile, 0 = none */
    ents:[], byId:{}, nextId:1,
    sel:[], proj:[], fx:[],
    sides:{ player:_rtsSideNew('player'), enemy:_rtsSideNew('enemy') },
    rnd:null,                              /* seeded on first use; see _rtsRnd */
    ai:{ next:0, wave:0, build:6, place:0, state:0, lastHit:-999, want:null },
    teams:{}, teamSeq:0, teamHold:{},
    stats:{ killed:0, lostU:0 }
  };
  window._rtsG = G;
  /* AttackDelay: how long you get before the first wave, stretched on the easy setting. */
  G.ai.next = RTS_WAVE_FIRST * _rtsBias('enemy').build;
  _rtsPathfindInit();
  var rnd = _rtsRngMake(G.seed);

  /* --- ore fields: a few blobs, biggest ones out in the contested middle --- */
  /* The fourth number is the gem flag. The gem patches sit out in contested ground, never in
     either starting corner - a high-value deposit you can mine in total safety is not a
     decision, and both bases are meant to want the middle.

     Gem patches are SMALL, and have to be. A gem step is priced at four times GemValue while
     _adjgem caps a gem cell at three steps, so a harvester bay filled with gems is worth an
     order of magnitude more than the same bay filled with gold. Fields sized for the old
     flat 3x multiplier left the AI sitting on 90k credits it could not spend by the four
     minute mark. Small patch, no regrowth, enormous payout: that is the whole point of the
     deposit in the middle of the map. */
  /* A real map, if the player loaded one, replaces this whole section: its terrain, its
     passability, its ore and its author's start positions all arrive together, already
     checked for connectivity when it was loaded. See src/map for why cliffs and
     coastlines have to come from a map rather than from a generator. */
  var _mapStarts = (typeof _rtsMapApply === 'function') ? _rtsMapApply(G) : null;
  if (_mapStarts) {
    G.starts = _mapStarts;
  } else {
  /* The two starts are rolled BEFORE anything else is laid down, because the ore, the roads,
     the connectivity fill and the team waypoints are all expressed relative to them. */
  G.starts = _rtsPickStarts(rnd);
  var fields = _rtsOreFields(G.starts);
  for (var f = 0; f < fields.length; f++) {
    var cx = fields[f][0], cz = fields[f][1], rad = fields[f][2], isGem = fields[f][3];
    for (var tx = cx - rad; tx <= cx + rad; tx++) for (var tz = cz - rad; tz <= cz + rad; tz++) {
      if (!_rtsInB(tx, tz)) continue;
      var d = Math.hypot(tx - cx, tz - cz);
      if (d > rad * (0.72 + rnd() * 0.42)) continue;    /* ragged edge rather than a disc */
      G.scrap[_rtsIdx(tx, tz)] = 1;                     /* shape only; density set below */
      if (isGem) G.gems[_rtsIdx(tx, tz)] = 1;
    }
  }
  _rtsGenTerrain(G, rnd, G.starts);
  }

  /* --- the two bases: player bottom-left, opponent top-right.
     Footprints are small (Command Yard 3x3) so a base is a cluster of compact structures
     on a large map, the way the originals laid out - not a few slabs filling the screen. --- */
  /* Each base is laid out in its own local frame - `along` toward the opponent, `across` to
     the side - so the same arrangement works whichever axis the roll produced. Scan_Place_Object
     is what fills in when a slot is blocked: it walks outward through distances, trying every
     facing at each, rather than giving up on the exact cell. */
  _rtsLayBase(G.starts.player, G.starts.enemy, [
    ['struct','yard',    0,  0], ['struct','power',   1,  5],
    ['unit',  'rifle',   3, -3], ['unit',  'rifle',   4, -1], ['unit', 'buggy', 1, -4]
  ], 'player');
  /* The opponent's opening defence is whichever one its OWN army has. This list hardcoded two
     Gun Turrets, which are Allied - so the default match, where the player is Allied and the
     opponent is therefore Soviet, opened with a Soviet base defended by two Allied buildings
     with Allied statistics, and the AI never sold or replaced them. Its build planner already
     filters on rtsBuildableBy and carries a comment about faction lists breaking exactly this
     way; the opening layout was the one that had not been told. */
  var eTurret = rtsBuildableBy(rtsStructDef('turret'), rtsHouseSide('enemy')) ? 'turret' : 'flametower';
  _rtsLayBase(G.starts.enemy, G.starts.player, [
    ['struct','yard',    0,  0], ['struct','power',  -1, -5],
    ['struct','refinery',5,  0], ['struct','barracks',4, -5],
    ['struct','factory', 4,  5], ['struct',eTurret,   9, -2], ['struct',eTurret, 9, 3],
    ['unit',  'harvester',11, 1], ['unit','rifle',   10, -2], ['unit','tank',   11, 3]
  ], 'enemy');

  /* Density LAST. Terrain generation and the two bases both erase ore, and a cell's level is
     a function of how many neighbours still have some - so running the adjust before those
     passes bakes in counts that no longer describe the field. */
  _rtsTiberiumAdjust(G);

  /* Waypoints last as well, for the same reason: they are snapped to open ground and named
     after ore fields, so they have to be derived from the finished map, not the blank one. */
  _rtsBuildWaypoints(G);
  _rtsTrigInit(G);
  _rtsCrateInit(G);           /* after the map is finished: a crate needs clear ground */

  _rtsRecalcPower('player'); _rtsRecalcPower('enemy');
  return G;
}

