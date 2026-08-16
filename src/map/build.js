/* map/build.js - turning a loaded map into the grids a battle runs on. Part of rts.map. */

/* ------------------------------------------------------------------ build --
   Turn the loaded map into the four grids a battle runs on. This happens at LOAD time, not at
   battle start, for one reason: it is where the map can be found unplayable, and a player who
   picked a bad map should be told so while they are still looking at the menu rather than
   dropped into a battle that cannot be fought.

   Ore is marked here, not sized here. The generated path sets a cell to 1 as a shape marker
   and lets _rtsTiberiumAdjust derive the real density from how many of the eight neighbours
   also carry ore - CELL.CPP's rule, and the reason a field reads thick in the middle and thin
   at the edge. A real map's own density byte is deliberately ignored so that both kinds of
   map feed the same pass and a field is worth the same wherever it came from. */
function _rtsMapBuild(M) {
  var b = M.bin, f = M.fit, N = RTS_N, tx, tz;
  var G = {
    terrain: new Uint8Array(N * N),
    blocked: new Uint8Array(N * N),
    /* A REAL MAP IS FLAT, and left that way on purpose. Relief is read off the generator's own
       noise field (see _rtsGenTerrain), and a map authored in 1996 has no such field - nor any
       elevation of its own, since Red Alert draws its cliffs rather than modelling them. There
       is nothing here to infer height FROM that would not be invention, and inventing it would
       put slopes through bases and chokepoints the author placed on flat ground. Zero
       everywhere is exactly the map the author drew. */
    height:  new Uint8Array(N * N),
    scrap:   new Float32Array(N * N),
    gems:    new Uint8Array(N * N)
  };
  var ore = 0, gems = 0, blocked = 0;

  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      var mx = f.ox + tx, my = f.oy + tz, i = _rtsIdx(tx, tz);
      if (mx < 0 || my < 0 || mx >= b.w || my >= b.h) {   /* window ran off the map */
        G.terrain[i] = RTS_T_ROCK; G.blocked[i] = 2; blocked++;
        continue;
      }
      var L = RTS_MAP_LAND[_rtsMapClass(b, mx, my, M.theatre)] || RTS_MAP_LAND.c;
      G.terrain[i] = L.t;
      G.blocked[i] = L.block;
      if (L.block) { blocked++; continue; }

      /* ResourceIndex 1 is ore and 2 is gems (world.yaml). 3 is a wall, which only RA's own
         scenarios carry - OverlayPack stores sandbag/fence/concrete walls in the same layer
         as the ore, and they are obstacles, not scenery. */
      var rt = b.resType[my * b.w + mx];
      if (rt === 1) { G.scrap[i] = 1; ore++; }
      else if (rt === 2) { G.scrap[i] = 1; G.gems[i] = 1; gems++; }
      else if (rt === 3) { G.terrain[i] = RTS_T_WALL; G.blocked[i] = 2; blocked++; }
    }
  }

  /* Trees are not terrain. RA stores them as ACTORS - t01, t05, tc02 and so on - so a map
     read from the tile layer alone comes out treeless, which is why the forests were missing
     from the first render. They are placed here, over the terrain, because a tree sitting on
     water or on a cliff is the map's business and not ours to second-guess. */
  var trees = 0, acts = M.yaml.actors || [];
  for (var a = 0; a < acts.length; a++) {
    if (!/^tc?\d\d$/.test(acts[a].type)) continue;
    var ax = acts[a].x - f.ox, az = acts[a].y - f.oy;
    if (!_rtsInB(ax, az)) continue;
    var ai = _rtsIdx(ax, az);
    if (G.blocked[ai]) continue;                    /* already a cliff or the sea */
    G.terrain[ai] = RTS_T_TREE; G.blocked[ai] = 2;
    G.scrap[ai] = 0; G.gems[ai] = 0;
    trees++; blocked++;
  }

  var starts = _rtsMapStarts(G, M) || _rtsMapFallbackStarts(G);
  if (!starts) return { error: 'could not find two places on this map to put a base' };
  var bad = _rtsMapCheck(G, starts);
  if (bad) return { error: bad };

  var sea = _rtsMapSea(G, N);
  return { grid: G, starts: starts,
           stats: { ore: ore, gems: gems, trees: trees, blocked: blocked,
                    water: sea.water, shore: sea.shore } };
}

/* Is there a navy to be had on this map? Two questions, and only the second one matters to a
   player: a map can be covered in water and still have nowhere to put a shipyard, because every
   inch of its coast is cliff. So this counts water cells AND the places a yard would actually be
   legal - a clear footprint whose surrounding ring touches the sea, which is `_rtsCanPlace` plus
   `_rtsShoreOk` asked of the grid before the game owns it.

   Counted here rather than read off `window._rtsG` because this runs at map-load time, on the
   title screen, where there is no game yet. The whole point is to answer "can I build ships on
   this?" BEFORE committing to a battle, since the alternative is loading scenarios one at a time
   and squinting at them. */
function _rtsMapSea(G, N) {
  var water = 0, shore = 0, i, x, z;
  for (i = 0; i < N * N; i++) if (G.terrain[i] === RTS_T_WATER) water++;
  if (!water) return { water: 0, shore: 0 };

  var d = (typeof rtsStructDef === 'function') && rtsStructDef('navalyard');
  var w = (d && d.w) || 3, h = (d && d.h) || 3;
  for (z = 0; z + h <= N; z++) {
    for (x = 0; x + w <= N; x++) {
      var free = true, ax, az;
      for (ax = x; ax < x + w && free; ax++)
        for (az = z; az < z + h && free; az++)
          if (G.blocked[_rtsIdx(ax, az)] !== 0 || G.scrap[_rtsIdx(ax, az)] > 0) free = false;
      if (!free) continue;
      var touches = false;
      for (var ox = -1; ox <= w && !touches; ox++) {
        for (var oz = -1; oz <= h; oz++) {
          if (ox >= 0 && ox < w && oz >= 0 && oz < h) continue;   /* inside the footprint */
          var cx = x + ox, cz = z + oz;
          if (_rtsInB(cx, cz) && G.terrain[_rtsIdx(cx, cz)] === RTS_T_WATER) { touches = true; break; }
        }
      }
      if (touches) shore++;
    }
  }
  return { water: water, shore: shore };
}

/* Copy the prepared grids onto a fresh game state, in place of _rtsGenTerrain. Returns the
   start positions, or null when no map is loaded - which is how generating stays the default. */
function _rtsMapApply(G) {
  var M = window._RTS_MAP;
  if (!M || !M.built) return null;
  G.terrain.set(M.built.grid.terrain);
  G.blocked.set(M.built.grid.blocked);
  G.scrap.set(M.built.grid.scrap);
  G.gems.set(M.built.grid.gems);
  return { player: { tx: M.built.starts.player.tx, tz: M.built.starts.player.tz },
           enemy:  { tx: M.built.starts.enemy.tx,  tz: M.built.starts.enemy.tz } };
}

