/* THE MCV CAN BE DEPLOYED WITHOUT A KEYBOARD.

   This spec exists because it could not. The only deploy path in the game was a keydown
   handler on D, and rules/units.js told the player, in the Mobile Construction Vehicle's own
   description, to "press D, or use the Deploy button" - a button that had never been built.
   So on a phone the one unit whose entire purpose is to found a base where you have no yard
   was undeployable by any means, and the game named the control it was missing. It is the same
   fault the sidebar's hold-to-cancel had, where the game told a phone to right-click: a
   control that exists only as a key is a control a touch player does not have.

   WHAT IS GRADED, and the first one is the whole point:

   - the order can be given by TAP. Not "a button exists" - the button is clicked and the yard
     has to appear, because a button wired to nothing would satisfy the weaker claim.
   - the button appears only when it would do something, so it is not permanent furniture in a
     sidebar that is already tight on a 360px phone, and cannot be tapped into a no-op.
   - it is big enough to hit. This order is one-shot and irreversible on a 2500-credit unit.
   - the key and the button give the SAME order, which is why the loop moved into
     core/transport.js. Two copies would drift, and the drift would be silent.
   - the readout's text and the button coexist. The sidebar rewrites that line every frame, and
     it used to do it by assigning textContent to the row the button now lives in - which would
     have deleted the button on the frame after it appeared. That is a real trap, not a
     hypothetical: it is why the text sits in a span of its own. */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('deploy');

(async function () {
  var browser = await chromium.launch();
  /* A REAL PHONE CONTEXT, so the tap is a touch and the layout is the one a player gets. */
  var g = await openPage(browser, { device: devices['iPhone 13'] });
  await g.start(7, 10, {});
  await g.freeze();

  var out = await g.page.evaluate(function () {
    var o = {}, G = window._rtsG;
    /* Put an MCV somewhere it can ACTUALLY deploy. Searched rather than guessed: a fixed offset
       from the yard lands wherever the map generator happens to have put trees, ore or a slope,
       and a spec that fails because it picked bad ground is a spec that will be edited until it
       lies. _rtsDeploy centres the yard on the vehicle, so that is the placement asked here. */
    var yard = _rtsHas('player', 'yard'), sd = rtsStructDef('yard');
    window._rtsFindDeploySpot = function (skipTiles) {
      for (var rad = 4; rad <= 20; rad += 2)
        for (var dx = -rad; dx <= rad; dx += 2)
          for (var dz = -rad; dz <= rad; dz += 2) {
            var tx = _rtsTX(yard.x) + dx, tz = _rtsTX(yard.z) + dz;
            if (skipTiles && skipTiles.some(function (t) {
              return Math.abs(t[0] - tx) < sd.w + 2 && Math.abs(t[1] - tz) < sd.h + 2; })) continue;
            if (_rtsCanPlace('player', 'yard', tx - ((sd.w - 1) >> 1), tz - ((sd.h - 1) >> 1), true))
              return { tx: tx, tz: tz, x: _rtsWX(tx), z: _rtsWX(tz) };
          }
      return null;
    };
    var spot = _rtsFindDeploySpot(null);
    o.foundSpot = !!spot;
    var mcv = spot ? _rtsSpawnUnit('player', 'mcv', spot.x, spot.z) : null;
    if (mcv) { window._rtsSpot1 = [spot.tx, spot.tz]; }
    o.spawned = !!mcv;
    if (!mcv) return o;
    G.sel = [mcv];
    _rtsSyncSidebar();

    var btn = document.getElementById('rtsDeployBtn');
    o.exists = !!btn;
    if (!btn) return o;
    o.shownForMcv = !btn.hidden;
    var r = btn.getBoundingClientRect();
    o.w = Math.round(r.width); o.h = Math.round(r.height);

    /* ...and it must NOT show for something that cannot take the order. */
    var tank = _rtsSpawnUnit('player', 'tank', yard.x + 56, yard.z + 40);
    G.sel = tank ? [tank] : [];
    _rtsSyncSidebar();
    o.hiddenForTank = !!btn.hidden;

    /* THE READOUT TRAP: the sidebar rewrites the selection line every frame. Run it a few
       times with the MCV selected and the button has to survive being in that row. */
    G.sel = [mcv];
    for (var f = 0; f < 5; f++) _rtsSyncSidebar();
    o.survivesRepaint = !!document.getElementById('rtsDeployBtn') &&
                        !document.getElementById('rtsDeployBtn').hidden;
    o.textStillWritten = /Mobile|MCV/i.test(document.getElementById('rtsSelTxt').textContent);

    /* WHERE the yard lands, because three places described this and none of them matched the
       code: the comment in core/transport.js, docs/core-units.md and the answer given to a
       player all said "adjacent to the vehicle, not under it" while the arithmetic subtracted
       w-1 and put the vehicle at the south-east corner. Recorded here so the claim is a
       measurement rather than a sentence. */
    window._rtsMcvTile = [_rtsTX(mcv.x), _rtsTX(mcv.z)];
    o.yardsBefore = G.ents.filter(function (e) {
      return !e.dead && e.type === 'struct' && e.def === 'yard' && e.side === 'player';
    }).length;
    return o;
  });

  if (out.exists && out.shownForMcv) {
    /* THE CLAIM: a real tap on the real element, through the page, deploys. */
    await g.page.locator('#rtsDeployBtn').tap();
    Object.assign(out, await g.page.evaluate(function () {
      var G = window._rtsG;
      var sd = rtsStructDef('yard'), mt = window._rtsMcvTile, made = null;
      G.ents.forEach(function (e) {
        if (!e.dead && e.type === 'struct' && e.def === 'yard' && e.side === 'player' &&
            Math.abs(e.tx - mt[0]) <= sd.w && Math.abs(e.tz - mt[1]) <= sd.h) made = e;
      });
      return {
        yardsAfter: G.ents.filter(function (e) {
          return !e.dead && e.type === 'struct' && e.def === 'yard' && e.side === 'player';
        }).length,
        mcvGone: !G.ents.some(function (e) { return !e.dead && e.def === 'mcv'; }),
        /* the vehicle's own cell against the footprint's middle cell */
        centreOff: made ? [made.tx + ((sd.w - 1) >> 1) - mt[0],
                           made.tz + ((sd.h - 1) >> 1) - mt[1]] : null
      };
    }));

    /* AND THE KEY GIVES THE SAME ORDER - one path, so the two cannot drift. */
    Object.assign(out, await g.page.evaluate(function () {
      var G = window._rtsG;
      /* a SECOND legal spot, clear of the yard the tap just founded */
      var spot2 = _rtsFindDeploySpot([window._rtsSpot1]);
      var m2 = spot2 ? _rtsSpawnUnit('player', 'mcv', spot2.x, spot2.z) : null;
      if (!m2) return { keyTested: false };
      G.sel = [m2];
      var before = G.ents.filter(function (e) {
        return !e.dead && e.type === 'struct' && e.def === 'yard' && e.side === 'player';
      }).length;
      var did = _rtsDeploySelected();
      var after = G.ents.filter(function (e) {
        return !e.dead && e.type === 'struct' && e.def === 'yard' && e.side === 'player';
      }).length;
      return { keyTested: true, keyDid: did, keyGained: after - before };
    }));
  }

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  await g.close();
  await browser.close();

  S.ok('a legal deploy site was found and an MCV put on it', out.foundSpot && out.spawned,
       out.foundSpot ? (out.spawned ? 'spawned on placeable ground' : 'spawn refused')
                     : 'no legal yard site within 20 tiles of the base');
  S.ok('the Deploy button exists at all', out.exists,
       out.exists ? 'present' : 'MISSING - the only deploy path is the D key, and a phone has none');
  if (out.exists) {
    S.ok('...and shows when an MCV is selected', out.shownForMcv,
         out.shownForMcv ? 'visible' : 'hidden with a deployable unit selected');
    S.ok('...and hides for a unit that cannot deploy (control)', out.hiddenForTank,
         out.hiddenForTank ? 'hidden for a Battle Tank' :
         'shown for a tank - it is permanent furniture, not a contextual order');
    S.ok('...and is big enough for a finger', out.h >= 30 && out.w >= 44,
         out.w + 'x' + out.h + ' css px - a one-shot irreversible order on a 2500-credit unit');
    S.ok('...and survives the sidebar rewriting the selection line every frame',
         out.survivesRepaint && out.textStillWritten,
         out.survivesRepaint ? 'still there after 5 repaints, and the readout still says what ' +
         'is selected' : 'DELETED by the readout write - textContent on the row wipes it');
    S.ok('A TAP DEPLOYS IT: the yard appears and the vehicle is gone',
         out.yardsAfter === out.yardsBefore + 1 && out.mcvGone,
         'yards ' + out.yardsBefore + ' -> ' + out.yardsAfter +
         ', the MCV ' + (out.mcvGone ? 'became it' : 'is STILL THERE - the button did nothing'));
    S.ok('...and it lands CENTRED on the vehicle, not offset into a corner',
         !!out.centreOff && out.centreOff[0] === 0 && out.centreOff[1] === 0,
         out.centreOff ? 'footprint centre is ' + out.centreOff[0] + ',' + out.centreOff[1] +
         ' cells from where the MCV stood - Adjacent_Cell(NW) is one step, and subtracting ' +
         'w-1 (two, for a 3x3) put the vehicle at the south-east corner and grew the yard up ' +
         'and to the left' : 'no yard found near the vehicle');
    if (out.keyTested) {
      S.ok('...and the key gives the same order through the same path',
           out.keyDid === 1 && out.keyGained === 1,
           out.keyDid + ' deployed, ' + out.keyGained + ' yard gained - one loop in ' +
           'core/transport.js, so the key and the button cannot drift apart');
    }
  }
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
