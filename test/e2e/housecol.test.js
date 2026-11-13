/* EVERY UNIT SHOWS WHOSE IT IS - sprites/marks.js, and every model's house-coloured part.

   A unit's owner is told by one small part in the house's colour (the cap, the band, the roof),
   and the camera looks DOWN: a part under a wing or under a hull is not there for the player.
   Measured on the frame itself, one unit at a time at the close zoom: drawn in the player's blue,
   then with the player's house colour swapped for the ally's green and the models rebuilt. The
   body colour is the same for both houses (RTS_PAL.veh), so the pixels that change are exactly
   the house-coloured ones the camera can see.

     EVERY UNIT     every one of them shows its house's colour, land, air and sea
     THE JETS       the Kestrel, the Shrike, the Strike Jet and the Falcon carried theirs under the
                    fuselage, the drone's and the bomber's sat in their wings: with roundels on
                    top (window.RTS_MARKS_OFF the before-picture) each shows twice as much
     THE ANIMALS    the Dolphin's and the Kraken's collars show
     THE CONTROL    a tank's house colour is its turret cap, and the roundels do not touch it */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('housecol');
/* the fewest house-coloured pixels any unit may show at the close zoom: set from the roster's own
   measurement (below), a little under its least-marked land unit's */
var HOUSE_MIN = 12;
var HOUSE_SHARE = 0.01;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 760, height: 620, dpr: 1 });
  await g.start(7, 2, { freeze: true });

  var out = await g.page.evaluate(function () {
    var G = window._rtsG, R3 = window._R3D, R = _rtsR, o = {}, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1; G.fx.length = 0; G.sides.enemy.ai.next = 1e9;
    window.RTS_SKY_FORCE = 'day'; R3.cloudAmt = 0; R3.inkAmt = 0; R3.footAmt = 0; R3.afloatAmt = 0;
    function most(kind, r) {
      var best = null, bs = -1;
      for (var z = r + 2; z < RTS_N - r - 2; z += 2) for (var x = r + 2; x < RTS_N - r - 2; x += 2) {
        var s = 0;
        for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
          var k = _rtsIdx(x + dx, z + dz);
          if (G.terrain[k] === kind && (kind === RTS_T_WATER || (!_rtsBlocked(x + dx, z + dz) && !(G.scrap[k] > 0)))) s++;
        }
        if (s > bs) { bs = s; best = [_rtsWX(x), _rtsWX(z)]; }
      }
      return best;
    }
    var land = most(RTS_T_GRASS, 5), sea = most(RTS_T_WATER, 4);
    G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
    var gl = R3.gl, blue = RTS_PAL.team.player.slice(), green = RTS_PAL.team.ally.slice();
    function shot() {
      _rtsRFrame(0);
      var W = R3.cv.width, H = R3.cv.height, b = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function differ(A, B) { var n = 0; for (var p = 0; p < A.length; p += 4) if (Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]) > 24) n++; return n; }
    function house(T) { for (var k = 0; k < 4; k++) RTS_PAL.team.player[k] = T[k]; R3.mesh = {}; }
    function measure(d) {
      var at = d.sea ? sea : land, u = _rtsSpawnUnit('player', d.key, at[0], at[1]);
      if (!u) return { key: d.key, none: true };
      u.x = at[0]; u.z = at[1]; u.rot = 0.6; u.order = null; u.hidden = 0;
      R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam(); _rtsLookAt(at[0], at[1]);
      var A = shot(); house(green); var B = shot(); house(blue);
      /* its own pixels, without the shadow it throws - an aircraft's is beside it, and as big */
      var q0 = R3.q; R3.q = { shadow: 0 };
      var A0 = shot(); R3.hideId = u.id; var C = shot(); R3.hideId = null;
      R3.q = q0;
      u.dead = true; G.ents = G.ents.filter(function (e) { return e !== u; });
      return { key: d.key, sort: d.sea ? 'sea' : d.air ? 'air' : 'land', house: differ(A, B), body: differ(A0, C) };
    }
    o.roster = RTS_UNITS.length;
    o.all = RTS_UNITS.map(measure);
    o.marked = Object.keys(RTS_MARKS);
    window.RTS_MARKS_OFF = true; R3.mesh = {};
    o.before = o.marked.map(function (k) { return measure(rtsUnitDef(k)); });
    o.tankBefore = measure(rtsUnitDef('tank'));
    /* ...and every unit with no roundels is the same model, face for face */
    o.sameOff = RTS_UNITS.filter(function (d) { return o.marked.indexOf(d.key) < 0; }).map(function (d) { return [d.key, _sprUnitModel(d.key, 'player', false, null).length]; });
    window.RTS_MARKS_OFF = false; R3.mesh = {};
    o.sameOn = o.sameOff.map(function (r) { return [r[0], _sprUnitModel(r[0], 'player', false, null).length]; });
    R3.inkAmt = undefined; R3.footAmt = undefined; R3.afloatAmt = undefined;
    return o;
  });

  if (process.env.HOUSECOL_DUMP) out.all && out.all.forEach(function (r) { console.log(r.key + '\t' + r.sort + '\t' + r.house + '\t' + r.body); });
  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (out.on) {
    var by = {}; out.all.forEach(function (r) { by[r.key] = r; });
    S.ok('the roster is measured whole: land, air and sea', out.all.length === out.roster && out.roster > 60 && ['land', 'air', 'sea'].every(function (s) { return out.all.some(function (r) { return r.sort === s; }); }),
         out.all.length + ' of ' + out.roster + ' units');
    S.ok('every unit is drawn', out.all.every(function (r) { return !r.none && r.body > 30; }),
         out.all.filter(function (r) { return r.none || r.body <= 30; }).map(function (r) { return r.key; }).join(' ') || 'all of them');
    var share = function (r) { return r.body ? r.house / r.body : 0; };
    var bare = out.all.filter(function (r) { return !(r.house >= HOUSE_MIN && share(r) >= HOUSE_SHARE); });
    S.ok('EVERY UNIT shows its house\'s colour to the camera: ' + HOUSE_MIN + ' pixels or more at the close zoom, and ' + (HOUSE_SHARE * 100) + '% of what it covers',
         !bare.length,
         bare.length ? bare.map(function (r) { return r.key + ' ' + r.house + ' of ' + r.body; }).join(', ')
                     : 'the least: ' + out.all.slice().sort(function (a, b) { return share(a) - share(b); }).slice(0, 4).map(function (r) { return r.key + ' ' + (share(r) * 100).toFixed(1) + '%'; }).join(', '));
    var bef = {}; out.before.forEach(function (r) { bef[r.key] = r; });
    /* the animals carry no hull to paint: a collar says whose they are, and the Dolphin's was
       a hundredth of a unit wider than its body */
    S.ok('the animals\' collars show: 3% of each or more', ['dolphin', 'kraken'].every(function (k) { return by[k] && share(by[k]) >= 0.03; }),
         ['dolphin', 'kraken'].map(function (k) { return k + ' ' + (share(by[k]) * 100).toFixed(1) + '%'; }).join(', '));
    var jets = ['mig', 'yak', 'strikejet', 'falcon'];
    S.ok('the jets and the drone and the bomber are the ones marked', jets.concat(['drone', 'bomber']).every(function (k) { return out.marked.indexOf(k) >= 0; }) && out.marked.length === 6, out.marked.join(' '));
    S.ok('THE JETS: without their roundels they showed little - a stripe under the fuselage', jets.every(function (k) { return bef[k] && bef[k].house < 45; }),
         jets.map(function (k) { return k + ' ' + (bef[k] ? bef[k].house : 'not measured'); }).join(', '));
    var hb = function (k) { return bef[k] ? bef[k].house : NaN; };
    S.ok('...and with them each shows twice as much or more', jets.every(function (k) { return by[k].house >= hb(k) * 2 && by[k].house >= hb(k) + 30; }),
         jets.map(function (k) { return k + ' ' + hb(k) + ' -> ' + by[k].house; }).join(', '));
    S.ok('...and the drone and the bomber, whose bands were already on top, show more', ['drone', 'bomber'].every(function (k) { return by[k].house >= hb(k) + 12; }),
         ['drone', 'bomber'].map(function (k) { return k + ' ' + hb(k) + ' -> ' + by[k].house; }).join(', '));
    S.eq('THE CONTROL: a tank\'s is the same with the roundels or without them', out.tankBefore.house, by.tank.house);
    var moved = out.sameOn.filter(function (r, j) { return r[1] !== out.sameOff[j][1]; });
    S.ok('...and every unit without roundels is the same model, face for face', out.sameOff.length > 60 && !moved.length,
         moved.length ? moved.map(function (r) { return r[0]; }).join(' ') : out.sameOff.length + ' models');
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
