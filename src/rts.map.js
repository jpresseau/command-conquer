/* Play on a real Red Alert map.

   Everything else on this battlefield is generated, and for cliffs and coastlines that was
   always going to hit a wall: RA's terrain templates carry no orientation. The enum is
   SHORE01..SHORE37 - numbered, not oriented - their passability masks are nearly all "solid"
   because terrain type encodes what you can drive on rather than what shape the art is, and
   the map editor RA shipped just stamps whichever piece the human picked. There is nothing
   for a generator to reason from. A MAP, though, already contains the answer: a person placed
   every piece, and the placement is the data.

   So the map is not generated here, it is READ. The player supplies a map file the same way
   they supply the artwork, for the same reason - nothing of anyone else's ships in this repo.

   What a loaded map replaces:

     terrain + passability   from the template under each cell (ra/tiletab.js classifies it)
     ore and gems            from the map's own resource layer, not scattered by us
     start positions         the spawn points its author placed, when they are usable

   What it does NOT replace: the rules, the units, the AI. It is a battlefield, not a mission.

   The grid is square (RTS_N x RTS_N) and real maps are not - they run from 56x56 to 192x192
   in the published set - so a square WINDOW is taken out of the map's playable bounds. The
   alternative, splitting the grid into separate width and height, means touching every one of
   the ~55 places that do coordinate arithmetic, with no test suite underneath. The window
   costs a border; the refactor could cost correctness everywhere. */

var RTS_MAP_DEFAULT_N = RTS_N;   /* the generated map's size, to restore when a map is dropped */
var RTS_MAP_MAXN = 160;   /* bigger than this and the sim is doing work nobody can see */
var RTS_MAP_MINN = 48;    /* smaller and there is no room for two bases and a fight */
var RTS_MAP_EDGE = 10;    /* a start this close to the window edge has nowhere to build */

/* The loaded map, or null for "generate one". Lives on window so a battle started from any
   path sees the same answer. */
window._RTS_MAP = window._RTS_MAP || null;

/* One line describing a loaded map, shared by the picker and by the restore-on-boot path so
   they cannot drift into saying different things about the same map. */
function rtsMapDescribe(M) {
  var s = M.stats || {};
  return '“' + M.title + '”' + (M.author ? ' by ' + M.author : '') +
         ' — ' + M.n + '×' + M.n + ' of ' + M.yaml.w + '×' + M.yaml.h +
         ', ' + ((s.ore || 0) + (s.gems || 0)) + ' ore cells, ' + (s.trees || 0) +
         ' trees. Start a battle to play it.';
}

/* The file picker on the title screen. Mirrors rtsMixPicked: read, report in place, and never
   half-apply - a map that fails validation leaves the previous state alone rather than
   dropping the player onto a broken battlefield. */
function rtsMapPicked(input) {
  var note = document.getElementById('rtsMapNote');
  function say(msg, cls) { if (note) { note.textContent = msg; note.className = cls || ''; } }
  if (!input.files || !input.files.length) return;
  say('Reading...');
  rtsMapLoadFiles(input.files).then(function (M) {
    if (!M || M.error) { rtsMapClear(); say(M ? M.error : 'could not read that map', 'bad'); return; }
    window._RTS_MAP = M;
    if (typeof rtsStoreSaveMap === 'function') rtsStoreSaveMap(M);   /* chosen once, not every visit */
    say(rtsMapDescribe(M), 'ok');
  }, function (e) {
    rtsMapClear();
    say('could not read that map: ' + ((e && e.message) || e), 'bad');
  });
}

/* Land class letter -> the game's terrain enum, and whether it stops a unit.
   Straight out of world.yaml's ground locomotors: they list Clear, Rough, Road, Bridge, Ore,
   Gems and Beach, and omit Rock, Water and River - so that omission IS the obstacle list.

   Rough maps onto plain ground rather than onto RTS_T_ROCK, which blocks. When a real map is
   loaded the picture comes from the real template art, so this enum only has to drive
   gameplay - passability, where ore may sit, what counts as water for a splash - and not
   appearance. That is why collapsing rough onto grass costs nothing visually. */
var RTS_MAP_LAND = {
  c: { t: 0, block: 0 },   /* clear   -> grass          */
  r: { t: 0, block: 0 },   /* rough   -> grass, drivable */
  d: { t: 4, block: 0 },   /* road                       */
  g: { t: 4, block: 0 },   /* bridge  -> road            */
  b: { t: 5, block: 0 },   /* beach   -> sand            */
  k: { t: 2, block: 2 },   /* rock    -> cliff, blocks   */
  w: { t: 3, block: 2 },   /* water                      */
  i: { t: 3, block: 2 },   /* river   -> water           */
  '-': { t: 0, block: 0 }  /* a hole in the template     */
};

/* ------------------------------------------------------------------ load --
   A map arrives either as an .oramap (a zip) or as the loose map.bin + map.yaml pair that a
   zip would have contained. Both are accepted because both are what people actually have. */
function rtsMapLoadFiles(files) {
  var list = [], i;
  for (i = 0; i < files.length; i++) list.push(files[i]);
  if (!list.length) return Promise.resolve({ error: 'no files chosen' });

  function readAs(f, asText) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(asText ? r.result : new Uint8Array(r.result)); };
      r.onerror = function () { res(null); };
      if (asText) r.readAsText(f); else r.readAsArrayBuffer(f);
    });
  }

  var packed = list.filter(function (f) { return /\.oramap$/i.test(f.name); })[0];
  var binF   = list.filter(function (f) { return /(^|\/)map\.bin$/i.test(f.name); })[0];
  var ymlF   = list.filter(function (f) { return /(^|\/)map\.yaml$/i.test(f.name); })[0];

  var get;
  if (packed) {
    get = readAs(packed, false).then(function (buf) {
      var z = window.RA_ZIP.zipOpen(buf);
      if (z.error) return { error: 'not a readable .oramap: ' + z.error };
      return Promise.all([z.read('map.bin'), z.read('map.yaml')]).then(function (r) {
        if (!r[0] || !r[1]) return { error: 'the .oramap has no map.bin/map.yaml inside it' };
        var txt = '';
        for (var k = 0; k < r[1].length; k++) txt += String.fromCharCode(r[1][k]);
        return { bin: r[0], yaml: txt, name: packed.name };
      });
    });
  } else if (binF && ymlF) {
    get = Promise.all([readAs(binF, false), readAs(ymlF, true)]).then(function (r) {
      return { bin: r[0], yaml: r[1], name: ymlF.name };
    });
  } else {
    return Promise.resolve({ error: 'choose an .oramap file, or both map.bin and map.yaml' });
  }

  return get.then(function (g) {
    if (g.error) return g;
    var b = window.RA_MAP.ramapBin(g.bin);
    if (b.error) return { error: 'map.bin: ' + b.error };
    var y = window.RA_MAP.ramapYaml(g.yaml);
    if (y.error) return { error: 'map.yaml: ' + y.error };
    if (b.w !== y.w || b.h !== y.h) {
      return { error: 'map.bin says ' + b.w + 'x' + b.h + ' but map.yaml says ' + y.w + 'x' + y.h };
    }
    /* Only the temperate tileset is wired up: it is the one whose classification table is
       baked in, and the one the artwork loader's temperat.mix draws. Saying so is much more
       use than rendering a snow map as an unreadable mess. */
    if (y.tileset && y.tileset !== 'TEMPERAT') {
      return { error: 'this is a ' + y.tileset + ' map - only TEMPERAT maps are supported so far' };
    }
    var fit = _rtsMapFit(y);
    if (fit.error) return { error: fit.error };

    /* The battlefield takes the map's size. RTS_N is read at runtime everywhere - there is no
       baked 128 anywhere in the grid maths - and rts.save.js already folds it into the save's
       version stamp, so a size change invalidates old saves by itself instead of loading one
       at the wrong dimensions. Restored by rtsMapClear when the map is dropped. */
    var prevN = RTS_N;
    RTS_N = fit.n;
    var M = { bin: b, yaml: y, fit: fit, name: g.name, title: y.title, author: y.author, n: fit.n,
              /* the bytes as they arrived, so rts.store.js can remember the map and re-read it
                 through whatever these rules look like on the next visit */
              raw: { bin: g.bin, yaml: g.yaml } };
    /* Build now so an unplayable map is refused at the menu rather than at the battle. */
    var built = _rtsMapBuild(M);
    if (built.error) { RTS_N = prevN; return { error: built.error }; }
    M.built = built;
    M.stats = built.stats;
    return M;
  });
}

/* Drop the loaded map and go back to generating. Putting the grid size back is the part that
   matters - leaving RTS_N at a loaded map's size would silently resize the generated map too. */
function rtsMapClear() {
  window._RTS_MAP = null;
  RTS_N = RTS_MAP_DEFAULT_N;
}

/* ------------------------------------------------------------------- fit --
   Choose the square window. Centring it on the CENTROID of the spawns is the obvious move and
   the wrong one: on a wide map with starts at both ends the centroid is the middle, and a
   window centred there contains neither end. A match needs two starts, not eight - so take
   the furthest-apart PAIR that fits, and centre on them. That optimises for distance between
   the two bases, which is the thing that makes a match worth playing. */
function _rtsMapFit(y) {
  var b = y.bounds;
  var n = Math.min(RTS_MAP_MAXN, b.w, b.h);
  if (n < RTS_MAP_MINN) {
    return { error: 'playable area is only ' + b.w + 'x' + b.h + ' - too small for a battle' };
  }
  var sp = y.spawns || [], best = null, i, j;
  for (i = 0; i < sp.length; i++) {
    for (j = i + 1; j < sp.length; j++) {
      var a = sp[i], c = sp[j];
      if (Math.abs(a.x - c.x) > n - 2 * RTS_MAP_EDGE) continue;
      if (Math.abs(a.y - c.y) > n - 2 * RTS_MAP_EDGE) continue;
      var d = Math.hypot(a.x - c.x, a.y - c.y);
      if (!best || d > best.d) best = { a: a, c: c, d: d };
    }
  }
  var cx = best ? (best.a.x + best.c.x) / 2 : b.x + b.w / 2;
  var cy = best ? (best.a.y + best.c.y) / 2 : b.y + b.h / 2;
  var ox = Math.max(b.x, Math.min(b.x + b.w - n, Math.round(cx - n / 2)));
  var oy = Math.max(b.y, Math.min(b.y + b.h - n, Math.round(cy - n / 2)));
  return { n: n, ox: ox, oy: oy, pair: best ? [best.a, best.c] : null };
}

/* --------------------------------------------------------------- classify --
   The land class under one map cell. A template id the table does not know, or a tile index
   past the end of its row, is treated as clear rather than as an error - an unknown piece of
   scenery should not become an invisible wall in the middle of the battlefield. */
function _rtsMapClass(b, mx, my) {
  var k = my * b.w + mx;
  var id = b.tmpl[k], rec = window.RA_TILETAB[id];
  if (!rec) return 'c';
  var ch = rec.t.charAt(b.tidx[k]);
  return ch || 'c';
}

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
      var L = RTS_MAP_LAND[_rtsMapClass(b, mx, my)] || RTS_MAP_LAND.c;
      G.terrain[i] = L.t;
      G.blocked[i] = L.block;
      if (L.block) { blocked++; continue; }

      /* ResourceIndex 1 is ore and 2 is gems (world.yaml). */
      var rt = b.resType[my * b.w + mx];
      if (rt === 1) { G.scrap[i] = 1; ore++; }
      else if (rt === 2) { G.scrap[i] = 1; G.gems[i] = 1; gems++; }
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

  return { grid: G, starts: starts,
           stats: { ore: ore, gems: gems, trees: trees, blocked: blocked } };
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

/* ----------------------------------------------------------------- starts --
   Prefer the spawn points the map's author placed; they are chosen with knowledge of the
   terrain that no heuristic here has. But an authored spawn can still be unusable once the
   window has been cropped, so each one is checked for buildable room and quietly nudged if
   it is a tile or two inside a cliff. If fewer than two survive, fall back to picking starts
   the generated way - the terrain is still real, only the placement is ours. */
function _rtsMapStarts(G, M) {
  var f = M.fit, out = [], i;
  var sp = (M.yaml.spawns || []).map(function (s) {
    return { tx: s.x - f.ox, tz: s.y - f.oy };
  }).filter(function (s) {
    return s.tx >= RTS_MAP_EDGE && s.tz >= RTS_MAP_EDGE &&
           s.tx < RTS_N - RTS_MAP_EDGE && s.tz < RTS_N - RTS_MAP_EDGE;
  });

  for (i = 0; i < sp.length; i++) {
    var fixed = _rtsMapClearSpot(G, sp[i].tx, sp[i].tz);
    if (fixed) out.push(fixed);
  }
  if (out.length < 2) return null;                 /* caller falls back to _rtsPickStarts */

  /* Two houses, furthest apart, exactly as the generated picker does it. */
  var bi = 0, bj = 1, bd = -1;
  for (i = 0; i < out.length; i++) {
    for (var j = i + 1; j < out.length; j++) {
      var d = Math.hypot(out[i].tx - out[j].tx, out[i].tz - out[j].tz);
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
  }
  return { player: out[bi], enemy: out[bj] };
}

/* No usable authored spawns - a campaign map, or one whose starts the window cropped away.
   The terrain is still real; only the placement falls back to ours. Same rule the generated
   picker uses (a ring inset from the edge, then the furthest-apart pair), but every candidate
   is dragged to open ground first, because on a real map a ring position lands in the sea
   about as often as not. */
function _rtsMapFallbackStarts(G) {
  var cand = [], n = 16, R = RTS_N * 0.36, mid = RTS_N / 2, i, j;
  for (i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    var spot = _rtsMapClearSpot(G, Math.round(mid + Math.cos(a) * R), Math.round(mid + Math.sin(a) * R));
    if (spot) cand.push(spot);
  }
  if (cand.length < 2) return null;
  var bi = 0, bj = 1, bd = -1;
  for (i = 0; i < cand.length; i++) {
    for (j = i + 1; j < cand.length; j++) {
      var d = Math.hypot(cand[i].tx - cand[j].tx, cand[i].tz - cand[j].tz);
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
  }
  return { player: cand[bi], enemy: cand[bj] };
}

/* A start needs a clear patch, not just a clear tile. Search outward for a spot whose
   surroundings are mostly buildable; give up rather than return somewhere a yard cannot go. */
function _rtsMapClearSpot(G, tx, tz) {
  function open(cx, cz) {
    var free = 0, tot = 0;
    for (var ox = -4; ox <= 4; ox++) {
      for (var oz = -4; oz <= 4; oz++) {
        var x = cx + ox, z = cz + oz;
        if (!_rtsInB(x, z)) return -1;
        tot++;
        if (!G.blocked[_rtsIdx(x, z)]) free++;
      }
    }
    return free / tot;
  }
  if (open(tx, tz) >= 0.8) return { tx: tx, tz: tz };
  for (var r = 1; r <= 8; r++) {
    for (var a = 0; a < 16; a++) {
      var th = (a / 16) * Math.PI * 2;
      var cx = Math.round(tx + Math.cos(th) * r * 2), cz = Math.round(tz + Math.sin(th) * r * 2);
      if (cx < RTS_MAP_EDGE || cz < RTS_MAP_EDGE ||
          cx >= RTS_N - RTS_MAP_EDGE || cz >= RTS_N - RTS_MAP_EDGE) continue;
      if (open(cx, cz) >= 0.8) return { tx: cx, tz: cz };
    }
  }
  return null;
}

/* ----------------------------------------------------------- connectivity --
   A generated map guarantees a route between the bases by carving roads last. A real map
   guarantees nothing: its author may have meant the two halves to be joined by a bridge, or
   by a transport, and cropping a window can sever a route that existed on the full map. So
   this checks, and the caller refuses a map that fails rather than starting a battle that
   cannot be fought. Plain flood fill from one start - the pathfinder's own rules, without
   the pathfinder, because it only has to answer "reachable at all". */
function _rtsMapReach(G, from) {
  var N = RTS_N, seen = new Uint8Array(N * N), q = [_rtsIdx(from.tx, from.tz)];
  seen[q[0]] = 1;
  for (var h = 0; h < q.length; h++) {
    var cur = q[h], cx = cur % N, cz = (cur / N) | 0;
    for (var d = 0; d < 4; d++) {
      var nx = cx + [1, -1, 0, 0][d], nz = cz + [0, 0, 1, -1][d];
      if (!_rtsInB(nx, nz)) continue;
      var ni = _rtsIdx(nx, nz);
      if (seen[ni] || G.blocked[ni]) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  return seen;
}

/* Does this map hold together as a battlefield? Both bases must be able to reach each other,
   and each must be able to reach ore, or its economy never starts. */
function _rtsMapCheck(G, starts) {
  var seen = _rtsMapReach(G, starts.player);
  if (!seen[_rtsIdx(starts.enemy.tx, starts.enemy.tz)]) {
    return 'the two start positions have no route between them';
  }
  var ore = 0;
  for (var i = 0; i < seen.length; i++) if (seen[i] && G.scrap[i] > 0) ore++;
  if (!ore) return 'no ore is reachable from the start positions';
  return null;
}

/* ------------------------------------------------------------------ paint --
   Draw the real template art for one cell, exact - the template and tile the map names, not a
   random pick from a set the way generated ground is painted. Returns false when the artwork
   is not loaded or the tile is a hole, so the caller can fall back to its own ground. */
function _rtsMapPaintCell(d, S, tx, tz) {
  var M = window._RTS_MAP;
  if (!M || !_rtsArtReady()) return false;
  var b = M.bin, f = M.fit;
  var mx = f.ox + tx, my = f.oy + tz;
  if (mx < 0 || my < 0 || mx >= b.w || my >= b.h) return false;
  var k = my * b.w + mx, rec = window.RA_TILETAB[b.tmpl[k]];
  if (!rec) return false;
  var set = _mixTiles(rec.img + '.tem');
  if (!set) return false;
  var t = set.tile[b.tidx[k]];
  if (!t) return false;                              /* a hole in the template */
  var pal = RTS_MIX.pal;
  for (var y = 0; y < RTS_TS; y++) {
    var row = (tz * RTS_TS + y) * S;
    for (var x = 0; x < RTS_TS; x++) {
      var p = t[y * RTS_TS + x] * 3, o = (row + tx * RTS_TS + x) * 4;
      d[o] = pal[p]; d[o + 1] = pal[p + 1]; d[o + 2] = pal[p + 2]; d[o + 3] = 255;
    }
  }
  return true;
}
