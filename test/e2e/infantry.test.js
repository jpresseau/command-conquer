/* WHAT KEEPS EIGHT MEN IN ONE CELL TELLABLE APART.

   This file exists because the answers were all correct and none of them were protected. The
   model's own notes record them as settled BY LOOKING - "two helmets and a gap between them is
   the actual question, and it is answered by looking" - and looking does not survive the next
   edit. Everything below was measured while investigating a complaint that turned out to be
   wrong, so it is written down as the record of what IS true.

   THE COMPLAINT WAS THAT INFANTRY LOOK POOR AND NEED MORE MESH. They do not. Measured against
   the vehicles they stand next to, a rifle squad is 220 triangles over 233 drawn pixels and a
   Battle Tank is 348 over 752 - the infantry are DENSER per pixel the player actually sees.
   Their own file said so first and was right: at one cell tall colour is the identity signal,
   and geometry spent there is geometry nobody can see. The mesh-parity assertion below is here
   to stop that instinct coming back.

   THE PAIR OFFSET IS AT ITS PROVABLE OPTIMUM. Two men are offset 22.5 degrees off the facing
   grid, and infantry bake at eight facings 45 degrees apart. The bake projects sx = x and
   sy = z - 1.3y, so the ground plane reaches the screen with no foreshortening and the pair's
   separation never changes length - what changes is how much of it lies along SCREEN X, which
   is the part that stops the nearer man drawing over the farther one. Minimum over the eight
   facings, for a 7.80-unit separation:

       0 deg -> 0.00      10 deg -> 1.35      22.5 deg -> 2.98      30 deg -> 2.02      45 deg -> 0.00

   22.5 is the maximum, and both of the obvious choices are the worst possible: at 0 or 45 one
   man sits exactly behind the other at four of the eight facings. The worst facing today leaves
   2.97 units between men whose torsos are 3.6 wide - an 18% overlap, which reads as two close
   figures rather than one.

   AND THE MEASUREMENT IS THE HORIZONTAL GAP, NOT THE NUMBER OF HELMETS. Counting helmet
   patches was the first attempt and it cannot see this failure at all: with no foreshortening
   in the bake, a man who is "behind" is drawn HIGHER UP rather than hidden, so his helmet is
   still its own patch. Two men stacked vertically score two exactly as two men side by side
   do - mutation-tested by moving the pair onto the facing grid, which the count passed
   without complaint. What the offset actually buys is that the pair stays SIDE BY SIDE, so
   the distance between the helmets ACROSS the screen is the thing to measure, and it goes to
   zero at 0 and 45 degrees.

   (The model file warns that sprite WIDTH is the wrong instrument here, and it is right for
   the reason it gives - width cannot tell a cleanly stacked pair from a merged one. The gap
   between the two helmet centroids is not the same measurement: it reads the men, not the
   bounding box.)

   WHAT THE HELMET TEST CAN AND CANNOT SEE, because half the roster defeats it. The marker is
   the helmet's TOP face, so counting connected patches of that colour counts readable men - but
   only where the marker tone is unique to the helmet. It is not for four of them: the rifleman
   wears the team colour over his whole body (kit.body is null), the thief's helmet #17191d is
   within a few levels of his #22252b uniform, the rocket soldier's grey marker is close to the
   steel of the tube across his shoulders, and the dog is deliberately ONE animal. Run against
   those, the count returns 1, 3 and 4 - noise about the instrument, not facts about the game.
   So the four kits whose marker is genuinely its own colour are what this measures, and the
   exclusions are named rather than quietly dropped. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('infantry');

/* The four whose helmet marker is a colour nothing else on the model wears. */
var CLEAN = ['grenadier', 'flame', 'engineer', 'medic'];

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 3, {});
  await g.freeze();

  var out = await g.page.evaluate(function (CLEAN) {
    var o = {};
    function hex(h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
    function tris(mesh) { var t = 0; for (var f = 0; f < mesh.length; f++) t += Math.max(1, mesh[f].v.length - 2); return t; }

    /* ---- 1. the markers are distinct from each other ---- */
    var keys = Object.keys(RTS_INF_KIT).filter(function (k) { return RTS_INF_KIT[k].top; });
    var worst = 1e9, worstPair = '';
    for (var i = 0; i < keys.length; i++)
      for (var j = i + 1; j < keys.length; j++) {
        var a = hex(RTS_INF_KIT[keys[i]].top), b = hex(RTS_INF_KIT[keys[j]].top);
        var d = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
        if (d < worst) { worst = d; worstPair = keys[i] + '/' + keys[j]; }
      }
    o.markerMin = Math.round(worst); o.markerPair = worstPair; o.markerCount = keys.length;

    /* ---- 2. both men read at every facing, for the kits the test can see ---- */
    function helmets(k) {
      var want = hex(RTS_INF_KIT[k].top), fr = window._sprUnit(k, 'player', false, undefined);
      var per = [];
      for (var f = 0; f < fr.length; f++) {
        var t = fr[f], c = document.createElement('canvas');
        c.width = t.width; c.height = t.height;
        c.getContext('2d').drawImage(t, 0, 0);
        var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        var W = c.width, H = c.height, mask = new Uint8Array(W * H), lit = 0;
        for (var p = 0; p < d.length; p += 4) {
          if (d[p + 3] < 200) continue;
          if (Math.hypot(d[p]-want[0], d[p+1]-want[1], d[p+2]-want[2]) < 40) { mask[p/4] = 1; lit++; }
        }
        var seen = new Uint8Array(W * H), xs = [], st = [];
        for (var q = 0; q < W * H; q++) {
          if (!mask[q] || seen[q]) continue;
          var n = 0, sx = 0; st.length = 0; st.push(q); seen[q] = 1;
          while (st.length) {
            var cur = st.pop(); n++; sx += cur % W;
            var cx = cur % W, cy = (cur / W) | 0;
            for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
              var nx = cx + dx, ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              var ni = ny * W + nx;
              if (mask[ni] && !seen[ni]) { seen[ni] = 1; st.push(ni); }
            }
          }
          if (n >= 3) xs.push(sx / n);           /* a speck is not a helmet */
        }
        /* HOW FAR APART ACROSS THE SCREEN, which is what "side by side" means. One patch, or
           two patches stacked in the same column, both give zero. */
        per.push(xs.length < 2 ? 0
                 : +(Math.max.apply(null, xs) - Math.min.apply(null, xs)).toFixed(1));
      }
      return per;
    }
    o.pairs = CLEAN.map(function (k) { return { key: k, per: helmets(k) }; });
    o.pairWorst = Math.min.apply(null, o.pairs.map(function (r) { return Math.min.apply(null, r.per); }));

    /* ---- 3. the marker is a real share of the soldier, not a token pixel ---- */
    o.share = CLEAN.map(function (k) {
      var want = hex(RTS_INF_KIT[k].top), fr = window._sprUnit(k, 'player', false, undefined);
      var lo = 100;
      for (var f = 0; f < fr.length; f++) {
        var t = fr[f], c = document.createElement('canvas');
        c.width = t.width; c.height = t.height;
        c.getContext('2d').drawImage(t, 0, 0);
        var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        var n = 0, hit = 0;
        for (var p = 0; p < d.length; p += 4) {
          if (d[p + 3] < 200) continue;
          n++;
          if (Math.hypot(d[p]-want[0], d[p+1]-want[1], d[p+2]-want[2]) < 46) hit++;
        }
        if (n) lo = Math.min(lo, 100 * hit / n);
      }
      return { key: k, min: +lo.toFixed(1) };
    });
    o.shareWorst = Math.min.apply(null, o.share.map(function (r) { return r.min; }));

    /* ---- 4. infantry are not under-meshed: the measurement that stopped a bad instinct ---- */
    function drawnPx(k) {
      var t = window._sprUnit(k, 'player', false, undefined)[0];
      var c = document.createElement('canvas');
      c.width = t.width; c.height = t.height;
      c.getContext('2d').drawImage(t, 0, 0);
      var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = 0;
      for (var p = 3; p < d.length; p += 4) if (d[p] > 200) n++;
      return n;
    }
    function density(k) {
      return tris(window._sprUnitModel(k, 'player', false, undefined)) / drawnPx(k);
    }
    o.rifleDensity = +density('rifle').toFixed(3);
    o.tankDensity = +density('tank').toFixed(3);
    return o;
  }, CLEAN);

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  await g.close();
  await browser.close();

  S.ok('every kit marker is a colour of its own',
       out.markerMin >= 40,
       out.markerCount + ' markers, closest pair ' + out.markerPair + ' at ' + out.markerMin +
       ' - colour is the identity signal at one cell tall, so two kits sharing one would be ' +
       'two units the player cannot tell apart');

  S.ok('THE PAIR STAYS SIDE BY SIDE AT EVERY FACING', out.pairWorst >= 2,
       'helmet gap across the screen, per facing: ' +
       out.pairs.map(function (r) { return r.key + ' [' + r.per.join(' ') + ']'; }).join('  ') +
       '  - the 22.5 degree offset is what buys it. On the facing grid the separation runs ' +
       'straight up the screen and the gap goes to zero at four facings of the eight, which ' +
       'is a squad reading as one column');

  S.ok('...and the marker is a real patch, not a token pixel', out.shareWorst >= 3,
       out.share.map(function (r) { return r.key + ' ' + r.min + '%'; }).join(', ') +
       ' of the drawn soldier at the worst facing');

  /* THE CONTROL AGAINST A BAD INSTINCT. "Infantry look poor, give them more mesh" is wrong and
     was measured to be wrong; this keeps the measurement rather than the conclusion. */
  S.ok('infantry are not under-meshed against the vehicles beside them',
       out.rifleDensity >= out.tankDensity,
       'a rifle squad carries ' + out.rifleDensity + ' triangles per drawn pixel against the ' +
       'Battle Tank\'s ' + out.tankDensity + ' - more geometry is not what a one-cell unit ' +
       'needs, and their own file said so first');

  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
