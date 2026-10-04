/* A locked cameo in the real sidebar: greyed, and it tells you why.

   test/unit/locked pins the rule - _rtsWhyLocked - without a browser. This is the other half:
   that the sidebar actually DRAWS from it. The bug it exists for was invisible in the rule and
   only visible on screen. With the full tech tree and one Commando already alive, the Commando
   cameo was drawn enabled, and clicking it played the deny beep and printed an EMPTY message
   line: the queue refused, and the player was told nothing at all and shown nothing at all.

   The tooltip is measured because it is the only channel that answers WITHOUT a click. A greyed
   cameo used to be silent until you clicked it, so the only way to learn what a locked Refinery
   wanted was to press a button that visibly does nothing. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('cameo');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  /* Frozen: the assertions below read the sidebar between evaluate calls, and a running match
     would go on building and dying underneath them. */
  await g.start(7, 15, { freeze: true });

  /* ---------- 1. nothing built yet: the tech tree is legible from the tooltips ---------- */
  var early = await g.page.evaluate(function () {
    var U = window._rtsUI;
    rtsTab('struct'); _rtsSyncSidebar(0);
    /* Every cameo checked against its own reason rather than one hand-picked building: what the
       starting base already provides is a generation detail, and a spec that guessed it would
       be asserting on the map rather than on the sidebar. */
    var locked = [], open = [], wrong = [];
    Object.keys(U.btns).forEach(function (k) {
      var b = U.btns[k], why = _rtsWhyLocked('player', k), grey = /locked/.test(b.className);
      (why ? locked : open).push(k);
      if (grey !== !!why) wrong.push(k + ': grey ' + grey + ' vs why ' + why);
      else if (why && b.title.indexOf(why) < 0) wrong.push(k + ': tooltip missing "' + why + '"');
      else if (!why && /\n\n/.test(b.title)) wrong.push(k + ': tooltip carries a reason anyway');
    });
    return { locked: locked, open: open, wrong: wrong,
             sample: locked.length ? { k: locked[0], title: U.btns[locked[0]].title } : null,
             have: ['yard','power','refinery','barracks','factory','radar','lab']
               .filter(function (k) { return !!_rtsHas('player', k); }) };
  });
  S.note('the starting base has: ' + early.have.join(', '));
  S.ok('some of the tech tree is locked at the start and some is not',
       early.locked.length > 0 && early.open.length > 0,
       early.locked.length + ' locked, ' + early.open.length + ' open');
  S.ok('every cameo is greyed exactly when there is a reason, and carries that reason in its ' +
       'tooltip', !early.wrong.length, early.wrong.join(' | ') || 'all agree');
  S.ok('...which reads as a sentence, with no click', !!early.sample &&
       /first\.|army|at a time/.test(early.sample.title),
       early.sample ? early.sample.k + ': ' + JSON.stringify(early.sample.title) : 'nothing locked');

  /* ---------- 2. the Commando at her cap ---------- */
  var cap = await g.page.evaluate(function () {
    var G = window._rtsG, U = window._rtsUI, S2 = G.sides.player;
    var yd = _rtsHas('player', 'yard');
    var ytx = _rtsTX(yd.x), ytz = _rtsTX(yd.z);
    /* Stand the whole tree up at once. Placement is a real _rtsCanPlace search so the base is
       a legal one; the buildings are then finished by hand rather than by waiting out ninety
       seconds of build time per structure. */
    ['power', 'refinery', 'barracks', 'factory', 'radar', 'lab'].forEach(function (k) {
      if (_rtsHas('player', k)) return;
      for (var r = 2; r <= 20; r++)
        for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          if (_rtsCanPlace('player', k, ytx + ox, ytz + oz)) {
            _rtsPlaceStruct('player', k, ytx + ox, ytz + oz); return;
          }
        }
    });
    G.ents.forEach(function (e) {
      if (e.type === 'struct' && e.side === 'player' && e.building) {
        e.building = 0; e.bprog = 1; e.hp = rtsStructDef(e.def).hp;
      }
    });
    _rtsRecalcPower('player');
    S2.credits = 20000;

    rtsTab('infantry'); _rtsSyncSidebar(0);
    var free = { cls: U.btns.tanya.className, title: U.btns.tanya.title,
                 canProduce: _rtsCanProduce('player', 'tanya') };

    _rtsSpawnUnit('player', 'tanya', yd.x + RTS_TILE * 3, yd.z);
    _rtsSyncSidebar(0);
    G.msg = ''; G.msgT = 0;
    _rtsItemClick('tanya');
    return { free: free,
             capped: { cls: U.btns.tanya.className, title: U.btns.tanya.title,
                       canProduce: _rtsCanProduce('player', 'tanya'),
                       canQueue: _rtsCanQueue('player', 'tanya') },
             said: G.msgT > 0 ? G.msg : '(nothing)' };
  });
  S.ok('with the tech and none alive the Commando is buildable', !/locked/.test(cap.free.cls),
       cap.free.cls);
  S.eq('...and the sidebar\'s own question agrees', cap.free.canProduce, true);
  S.eq('the queue refuses a second Commando', cap.capped.canQueue, false);
  S.eq('...and so does the question the sidebar draws from, which it did not before',
       cap.capped.canProduce, false);
  S.ok('...so the cameo is greyed rather than left looking buildable',
       /locked/.test(cap.capped.cls), cap.capped.cls);
  S.ok('...the tooltip says why', /one at a time/.test(cap.capped.title),
       JSON.stringify(cap.capped.title));
  S.ok('...and clicking it says something rather than beeping into silence',
       cap.said !== '(nothing)' && /one at a time/.test(cap.said), cap.said);

  /* ---------- 3. the reason clears again, and does not pile up ---------- */
  var cleared = await g.page.evaluate(function () {
    var G = window._rtsG, U = window._rtsUI;
    var t = G.ents.filter(function (e) { return !e.dead && e.def === 'tanya'; })[0];
    /* Tick the sidebar a few times while she is alive: the reason is appended to a stored base
       tooltip, so a pass that re-appended every frame would grow it without bound. */
    for (var i = 0; i < 5; i++) _rtsSyncSidebar(0.016);
    var whileAlive = U.btns.tanya.title;
    t.dead = true;
    _rtsSyncSidebar(0);
    return { whileAlive: whileAlive, after: U.btns.tanya.title,
             repeats: (whileAlive.match(/You may only have one at a time\./g) || []).length };
  });
  S.eq('the reason is appended once however many frames pass', cleared.repeats, 1);
  S.ok('and it goes away when the reason does',
       !/You may only have one at a time\./.test(cleared.after),
       JSON.stringify(cleared.after));
  S.ok('...leaving the ordinary description behind', /Commando/.test(cleared.after),
       JSON.stringify(cleared.after));

  /* ---------- 4. no cameo is nearest-neighbour DOWNSCALED onto its plate ----------

     A cameo is composited with imageSmoothingEnabled = false so the artwork keeps its hard
     pixel edges, and under that flag a reduction drops source pixels irregularly - the
     "chewed" look, which is a different fault from merely soft. The plate therefore has to be
     at least as large as the largest sprite it must hold.

     It was a literal, justified in its own comment by "the largest building sprite is 72px".
     RTS_PS then doubled every procedural bake underneath it and nothing recomputed the
     literal, so a third of the cameos quietly went back onto the reduction path the literal
     existed to escape - the Construction Yard at 0.661. The plate is measured from the sprites
     now, and this asserts the PROPERTY (nothing reduces) rather than a number, so the same rot
     cannot recur through a future density change. */
  var plates = await g.page.evaluate(async function () {
    /* The plate size is read off a REAL cameo - the PNG _rtsMakeIcons produced - not from the
       sizing helper, so reverting the helper to a literal fails this rather than being
       recomputed identically on both sides. */
    var S = _rtsSprites(), side = 'player', icons = _rtsMakeIcons(side);
    var probe = await new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res(im.naturalWidth); };
      im.onerror = function () { res(0); };
      im.src = icons[RTS_STRUCTS[0].key];
    });
    var down = [], worst = 1, i, c;
    function chk(key, src, pad) {
      if (!src) return;
      var sc = Math.min((probe - pad * 2) / src.width, (probe - pad * 2) / src.height);
      if (sc < 1) { down.push(key + ' @' + sc.toFixed(3)); worst = Math.min(worst, sc); }
    }
    for (i = 0; i < RTS_STRUCTS.length; i++) {
      c = S.bld[side][RTS_STRUCTS[i].key]; chk(RTS_STRUCTS[i].key, c && c.c, 6);
    }
    for (i = 0; i < RTS_UNITS.length; i++) {
      c = S.unit[side][RTS_UNITS[i].key]; chk(RTS_UNITS[i].key, c && c[6], 14);
    }
    return { plate: probe, down: down, worst: worst,
             total: RTS_STRUCTS.length + RTS_UNITS.length };
  });
  S.ok('no cameo is squeezed onto its plate', plates.down.length === 0,
       plates.total + ' cameos on a ' + plates.plate + 'px plate, none reduced' +
       (plates.down.length ? ' - except ' + plates.down.slice(0, 6).join(', ') : '') +
       ' (the stale 160px literal reduced ten of them, worst 0.661)');

  /* ---------- 5. the placement ghost is the size of the building it places ----------
     The 2D ghost was the sprite drawn at the wrong density - RTS_PS times too large, floating
     beside the footprint. In 3D the ghost is the building's own mesh (render3d/place3d.js), so
     the claim is asked of the picture: the screen box the translucent ghost covers spans the
     footprint it will occupy, projected through the same camera - not three times it. (The
     placed building is no reference: its cast shadow and the base dressing round it double
     its box.) */
  var ghost = await g.page.evaluate(function () {
    var R = _rtsR, G = window._rtsG, R3 = window._R3D, gl = R3.gl;
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    /* a structure the player has NOT built, on open ground beside the yard */
    var key = null, k, yd = _rtsHas('player', 'yard'), spot = null;
    for (i = 0; i < RTS_STRUCTS.length && !key; i++) {
      k = RTS_STRUCTS[i].key;
      if (_rtsHas('player', k) || RTS_STRUCTS[i].wall || RTS_STRUCTS[i].shore) continue;
      var d0 = rtsStructDef(k);
      if (d0.w < 2) continue;
      for (var r = 4; r < 14 && !spot; r++)
        for (var dz = -r; dz <= r && !spot; dz++)
          for (var dx = -r; dx <= r && !spot; dx++)
            if (_rtsCanPlace('player', k, yd.tx + dx, yd.tz + dz, true)) spot = [yd.tx + dx, yd.tz + dz];
      if (spot) key = k;
    }
    if (!key) return { key: null };
    var d = rtsStructDef(key);
    R.focus.x = _rtsWX(spot[0]) + d.w * RTS_TILE / 2; R.focus.z = _rtsWX(spot[1]) + d.h * RTS_TILE / 2;
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    function grab() {
      _rtsRFrame(0); _rtsRFrame(0);
      var W = R3.cv.width, H = R3.cv.height, px = new Uint8Array(W * H * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { W: W, H: H, px: px };
    }
    function box(a, b) {
      var x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
      for (var y = 0; y < a.H; y++) for (var x = 0; x < a.W; x++) {
        var q = (y * a.W + x) * 4;
        if (Math.abs(a.px[q] - b.px[q]) + Math.abs(a.px[q + 1] - b.px[q + 1]) + Math.abs(a.px[q + 2] - b.px[q + 2]) < 40) continue;
        n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return n ? { w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, n: n } : null;
    }
    var bare = grab();
    _rtsGhostShow(key); _rtsGhostMove(spot[0], spot[1], true);
    var withGhost = grab();
    _rtsGhostHide();
    /* the footprint's corners on the ground, in GL pixels (the overlay is CSS px times dpr) */
    var x0 = _rtsWX(spot[0]) - RTS_TILE / 2, z0 = _rtsWX(spot[1]) - RTS_TILE / 2;
    var xs = [[x0, z0], [x0 + d.w * RTS_TILE, z0], [x0, z0 + d.h * RTS_TILE], [x0 + d.w * RTS_TILE, z0 + d.h * RTS_TILE]].map(function (c) {
      return _rtsGroundToScreen(c[0], c[1]).x * R3.cv.width / R.W;
    });
    var fl = Math.min.apply(null, xs), fr = Math.max.apply(null, xs);
    return { key: key, ghost: box(bare, withGhost), real: { w: Math.round(fr - fl), cx: Math.round((fl + fr) / 2) } };
  });
  S.ok('a structure the player has not built was available to ghost', !!ghost.key,
       ghost.key || 'none');
  var gb = ghost.ghost, rb = ghost.real;
  S.ok('...and the ghost shows on screen', !!gb, 'ghost ' + JSON.stringify(gb));
  if (gb) {
    S.ok('the ghost is drawn about as wide as the footprint it will occupy, over it',
         gb.w >= rb.w * 0.8 && gb.w <= rb.w * 1.35 && Math.abs(gb.cx - rb.cx) <= rb.w * 0.15,
         'the ' + ghost.key + ' ghost spans ' + gb.w + ' px about x=' + gb.cx + '; its footprint ' +
         rb.w + ' px about x=' + rb.cx + ' (the 2D ghost was RTS_PS times too large)');
  }

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
