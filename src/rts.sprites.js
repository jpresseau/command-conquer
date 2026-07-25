/* RC COMMAND - sprite generation.

   Every sprite in the game is drawn here, in code, onto an offscreen canvas at LOW
   resolution - 24 pixels per map cell - and then blitted to the screen with image
   smoothing off. Drawing small and upscaling with nearest-neighbour is what produces
   chunky, hard-edged pixels; drawing large and scaling down just produces soft 3D-looking
   art, which is the trap the first version of this game fell into.

   Nothing here is traced, ripped or copied from any existing game. It is original pixel
   art, generated procedurally, in the visual language of the mid-90s 2D RTS: a tight
   palette, three tones per surface (lit top, mid face, shadowed side), a near-black
   outline, and a high viewing angle where a structure is mostly roof with a sliver of
   front wall. */

var RTS_TS = 24;                 /* pixels per map cell in sprite space */
var _RTS_SPR = null;

/* Temperate-theatre palette. Deliberately desaturated and dark - bright, clean colours
   read as modern; grubby ones read as 1996. */
var RTS_PAL = {
  out:   '#14161a',
  grass: ['#4a5a2e', '#55663a', '#3e4c26', '#5e6e42'],
  dirt:  ['#6a5940', '#776548', '#5a4c36'],
  rock:  ['#6e6a5e', '#807c70', '#57544a'],
  ore:   ['#a8842a', '#cca63c', '#e0c055', '#8a6a1e'],
  conc:  ['#8e8e86', '#a2a29a', '#6e6e66'],
  steel: ['#5a626e', '#6e7684', '#434a54'],
  dark:  ['#33383f', '#414852', '#242930'],
  glass: '#7fa8c0',
  lit:   '#ffd98a',
  team: {
    player: ['#2f5fa8', '#3f7fd0', '#1e3f74', '#5f9fe8'],
    enemy:  ['#a83228', '#d04438', '#741e18', '#e86a58']
  }
};

function _sprMake(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c: c, g: g };
}
function _sprRect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
function _sprOutline(g, x, y, w, h) {
  g.strokeStyle = RTS_PAL.out; g.lineWidth = 1;
  g.strokeRect((x | 0) + 0.5, (y | 0) + 0.5, (w | 0) - 1, (h | 0) - 1);
}
/* A structure block seen from above and slightly in front: roof, front wall, shaded right
   edge, hard outline. This one primitive carries most of the building look. */
function _sprBlock(g, x, y, w, h, front, tones) {
  var roofH = h - front;
  _sprRect(g, x, y, w, roofH, tones[1]);              /* roof */
  _sprRect(g, x, y + roofH, w, front, tones[0]);      /* front wall, darker */
  _sprRect(g, x + w - 2, y, 2, h, tones[2]);          /* shaded right side */
  _sprRect(g, x, y, w, 1, tones[3] || tones[1]);      /* lit top edge */
  _sprOutline(g, x, y, w, h);
}
function _sprNoise(g, x, y, w, h, cols, n, seed) {
  var s = seed || 1;
  function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
  for (var i = 0; i < n; i++) {
    _sprRect(g, x + rnd() * w, y + rnd() * h, 1 + (rnd() * 2 | 0), 1, cols[(rnd() * cols.length) | 0]);
  }
}

/* ------------------------------------------------------------------ terrain */
function _sprTerrain() {
  var out = [], i;
  for (i = 0; i < 6; i++) {
    var t = _sprMake(RTS_TS, RTS_TS);
    var base = i < 4 ? RTS_PAL.grass : RTS_PAL.dirt;
    _sprRect(t.g, 0, 0, RTS_TS, RTS_TS, base[0]);
    _sprNoise(t.g, 0, 0, RTS_TS, RTS_TS, base, 90, i * 977 + 13);
    /* a few tufts so the ground is not flat noise */
    for (var k = 0; k < 5; k++) {
      var tx = (k * 7 + i * 3) % RTS_TS, ty = (k * 11 + i * 5) % RTS_TS;
      _sprRect(t.g, tx, ty, 1, 2, base[2]);
    }
    out.push(t.c);
  }
  return out;
}
function _sprRock() {
  var t = _sprMake(RTS_TS, RTS_TS), g = t.g, P = RTS_PAL.rock;
  _sprRect(g, 3, 6, 18, 14, P[0]);
  _sprRect(g, 5, 4, 13, 5, P[1]);
  _sprRect(g, 4, 16, 16, 4, P[2]);
  _sprNoise(g, 3, 4, 18, 16, P, 40, 7);
  _sprOutline(g, 3, 4, 18, 16);
  return t.c;
}
/* Ore in four density stages, drawn as clustered nuggets lying flat on the cell. */
function _sprOre() {
  var out = [], P = RTS_PAL.ore;
  for (var s = 0; s < 4; s++) {
    var t = _sprMake(RTS_TS, RTS_TS), g = t.g;
    var n = 5 + s * 7, seed = s * 313 + 91;
    var r = seed;
    function rnd() { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; }
    for (var i = 0; i < n; i++) {
      var x = 2 + rnd() * (RTS_TS - 6), y = 2 + rnd() * (RTS_TS - 6);
      var w = 2 + (rnd() * 3 | 0), h = 2 + (rnd() * 2 | 0);
      _sprRect(g, x, y + 1, w, h, P[3]);           /* shadow under the nugget */
      _sprRect(g, x, y, w, h, P[(rnd() * 3) | 0]);
      _sprRect(g, x, y, 1, 1, P[2]);               /* glint */
    }
    out.push(t.c);
  }
  return out;
}

/* --------------------------------------------------------------- buildings --
   Each returns a canvas sized (w cells x h cells) plus headroom above for the parts of
   the structure that rise off its footprint. The footprint's top-left is at
   (0, headroom) so the renderer can blit by cell without extra bookkeeping. */
function _sprBuilding(key, side) {
  var def = rtsStructDef(key), TM = RTS_PAL.team[side];
  var cw = def.w * RTS_TS, ch = def.h * RTS_TS;
  var head = Math.round(RTS_TS * 0.9);
  var t = _sprMake(cw, ch + head), g = t.g;
  var y0 = head;                                   /* top of the footprint */
  var C = RTS_PAL.conc, S = RTS_PAL.steel, D = RTS_PAL.dark;

  /* ground shadow, offset down-right like every sprite in the genre */
  g.globalAlpha = 0.28;
  _sprRect(g, 3, y0 + 3, cw - 3, ch - 2, '#000');
  g.globalAlpha = 1;

  if (key === 'yard') {
    _sprBlock(g, 1, y0 - 14, cw - 3, ch + 12, 10, C);
    _sprRect(g, 4, y0 - 10, cw - 10, 8, TM[0]);            /* team roof panel */
    _sprRect(g, 4, y0 - 10, cw - 10, 1, TM[3]);
    for (var i = 0; i < 3; i++) _sprRect(g, 6 + i * 8, y0 + 2, 4, 3, D[0]);  /* roof vents */
    _sprRect(g, cw - 16, y0 - 22, 3, 14, S[0]);            /* derrick mast */
    _sprRect(g, cw - 22, y0 - 22, 12, 2, S[1]);
    _sprRect(g, 6, y0 + ch - 12, cw - 16, 8, D[2]);        /* apron */
    for (i = 0; i < 5; i++) _sprRect(g, 8 + i * 6, y0 + ch - 11, 3, 6, '#c9a227');
    _sprOutline(g, 1, y0 - 14, cw - 3, ch + 12);

  } else if (key === 'power') {
    _sprBlock(g, 1, y0 - 8, cw - 3, ch + 6, 8, C);
    /* two stacks */
    [3, cw - 14].forEach(function (sx) {
      _sprRect(g, sx + 2, y0 - 18, 9, 14, S[1]);
      _sprRect(g, sx + 2, y0 - 18, 9, 2, S[2]);
      _sprRect(g, sx + 3, y0 - 20, 7, 3, D[2]);
      _sprOutline(g, sx + 2, y0 - 20, 9, 16);
    });
    _sprRect(g, 4, y0 + 2, cw - 10, 4, TM[0]);
    _sprRect(g, 5, y0 + ch - 9, cw - 12, 4, D[0]);
    _sprOutline(g, 1, y0 - 8, cw - 3, ch + 6);

  } else if (key === 'refinery') {
    _sprBlock(g, 1, y0 - 10, cw - 14, ch + 8, 9, C);
    /* silos on the right */
    for (var s2 = 0; s2 < 2; s2++) {
      var sx2 = cw - 14 + s2 * 6;
      _sprRect(g, sx2, y0 - 16 + s2 * 3, 6, 22, S[1]);
      _sprRect(g, sx2, y0 - 16 + s2 * 3, 6, 2, S[2]);
      _sprRect(g, sx2, y0 - 17 + s2 * 3, 6, 2, TM[0]);
      _sprOutline(g, sx2, y0 - 17 + s2 * 3, 6, 23);
    }
    /* hazard-striped unloading dock at the bottom */
    _sprRect(g, 4, y0 + ch - 10, cw - 22, 8, D[2]);
    for (i = 0; i < 6; i++) _sprRect(g, 5 + i * 5, y0 + ch - 9, 3, 6, '#c9a227');
    _sprRect(g, 4, y0 - 6, cw - 20, 3, TM[0]);
    _sprOutline(g, 1, y0 - 10, cw - 14, ch + 8);

  } else if (key === 'barracks') {
    _sprBlock(g, 1, y0 - 8, cw - 3, ch + 6, 9, C);
    _sprRect(g, 2, y0 - 7, cw - 5, 9, TM[0]);              /* pitched team roof */
    _sprRect(g, 2, y0 - 7, cw - 5, 1, TM[3]);
    _sprRect(g, 2, y0 + 2, cw - 5, 1, TM[2]);
    _sprRect(g, cw / 2 - 4, y0 + ch - 9, 8, 7, D[2]);      /* door */
    _sprRect(g, 4, y0 + ch - 6, 5, 4, RTS_PAL.rock[0]);    /* sandbags */
    _sprRect(g, cw - 10, y0 + ch - 6, 5, 4, RTS_PAL.rock[0]);
    _sprOutline(g, 1, y0 - 8, cw - 3, ch + 6);

  } else if (key === 'factory') {
    _sprBlock(g, 1, y0 - 12, cw - 3, ch + 10, 10, C);
    for (i = 0; i < 5; i++) _sprRect(g, 3, y0 - 10 + i * 3, cw - 7, 2, S[i % 2]);  /* ribbed roof */
    _sprRect(g, 3, y0 - 12, cw - 7, 2, TM[0]);
    _sprRect(g, cw / 2 - 9, y0 + ch - 12, 18, 10, D[2]);   /* roll-up door */
    for (i = 0; i < 5; i++) _sprRect(g, cw / 2 - 8 + i * 4, y0 + ch - 11, 2, 8, '#c9a227');
    _sprRect(g, 2, y0 - 18, 4, 7, S[1]);                   /* exhaust */
    _sprOutline(g, 1, y0 - 12, cw - 3, ch + 10);

  } else if (key === 'turret') {
    _sprRect(g, 3, y0 + 6, RTS_TS - 6, 10, RTS_PAL.conc[2]);
    _sprOutline(g, 3, y0 + 6, RTS_TS - 6, 10);
    _sprRect(g, 6, y0 + 2, RTS_TS - 12, 8, TM[0]);
    _sprRect(g, 6, y0 + 2, RTS_TS - 12, 1, TM[3]);
    _sprOutline(g, 6, y0 + 2, RTS_TS - 12, 8);
    _sprRect(g, RTS_TS / 2 - 1, y0 - 4, 3, 8, RTS_PAL.dark[0]);   /* barrel, points up by default */
  }
  return { c: t.c, head: head };
}

/* ------------------------------------------------------------------- units --
   Drawn once per facing. Eight facings is what the originals used for most vehicles and
   it is plenty at this size; the sim's continuous heading is quantised on draw. */
function _sprUnit(key, side) {
  var d = rtsUnitDef(key), TM = RTS_PAL.team[side], S = RTS_PAL.steel, D = RTS_PAL.dark;
  var size = key === 'harvester' ? 26 : (d.kind === 'infantry' ? 16 : 22);
  var frames = [];
  for (var f = 0; f < 8; f++) {
    var t = _sprMake(size, size), g = t.g;
    var cx = size / 2, cy = size / 2, a = f / 8 * Math.PI * 2;
    g.globalAlpha = 0.3; _sprRect(g, 2, size - 5, size - 4, 3, '#000'); g.globalAlpha = 1;
    g.save();
    g.translate(cx, cy); g.rotate(a);
    if (d.kind === 'infantry') {
      /* a two-man squad reads better than one dot at this scale */
      [[-2, -2], [2, 2]].forEach(function (o) {
        g.fillStyle = TM[0]; g.fillRect(o[0] - 2, o[1] - 3, 4, 5);
        g.fillStyle = '#c8a882'; g.fillRect(o[0] - 1, o[1] - 5, 3, 3);
        g.fillStyle = RTS_PAL.out; g.fillRect(o[0] - 2, o[1] + 2, 4, 1);
      });
      if (key === 'rocket') { g.fillStyle = D[0]; g.fillRect(0, -5, 6, 2); }
    } else {
      var bw = key === 'harvester' ? 18 : (key === 'tank' ? 15 : 13);
      var bh = key === 'harvester' ? 11 : 9;
      g.fillStyle = D[2]; g.fillRect(-bw / 2 - 1, -bh / 2 - 1, bw + 2, bh + 2);  /* outline */
      g.fillStyle = TM[0]; g.fillRect(-bw / 2, -bh / 2, bw, bh);
      g.fillStyle = TM[1]; g.fillRect(-bw / 2, -bh / 2, bw, 3);                  /* lit top */
      g.fillStyle = TM[2]; g.fillRect(-bw / 2, bh / 2 - 2, bw, 2);               /* shadow */
      /* tracks / wheels */
      g.fillStyle = D[0];
      g.fillRect(-bw / 2, -bh / 2 - 2, bw, 2);
      g.fillRect(-bw / 2, bh / 2, bw, 2);
      if (key === 'tank') {
        g.fillStyle = TM[3]; g.fillRect(-4, -4, 8, 8);
        g.fillStyle = D[2]; g.fillRect(-4, -4, 8, 1);
        g.fillStyle = D[0]; g.fillRect(3, -1, 9, 2);                             /* barrel */
      } else if (key === 'harvester') {
        g.fillStyle = S[1]; g.fillRect(-8, -4, 7, 8);                            /* ore bin */
        g.fillStyle = RTS_PAL.ore[1]; g.fillRect(-7, -3, 5, 6);
        g.fillStyle = TM[3]; g.fillRect(3, -3, 5, 6);                            /* cab */
      } else {
        g.fillStyle = TM[3]; g.fillRect(-2, -3, 5, 6);
        g.fillStyle = D[0]; g.fillRect(2, -1, 7, 2);
      }
    }
    g.restore();
    frames.push(t.c);
  }
  return frames;
}

/* Muzzle flashes, explosions and the ore-sparkle, all as small frame strips. */
function _sprFx() {
  var boom = [], i;
  for (i = 0; i < 6; i++) {
    var s = 12 + i * 7, t = _sprMake(s, s), g = t.g, c = s / 2;
    var cols = ['#fff2c0', '#ffcf6a', '#ff9a2e', '#e0561c', '#8a3410', '#3a2418'];
    g.fillStyle = cols[Math.min(5, i)];
    g.beginPath(); g.arc(c, c, c - 1 - i * 0.4, 0, 6.283); g.fill();
    if (i < 4) { g.fillStyle = cols[Math.max(0, i - 1)]; g.beginPath(); g.arc(c, c, (c - 1) * 0.55, 0, 6.283); g.fill(); }
    boom.push(t.c);
  }
  var flash = [];
  for (i = 0; i < 3; i++) {
    var f = _sprMake(9, 9), fg = f.g;
    fg.fillStyle = i === 0 ? '#fff6d0' : (i === 1 ? '#ffd070' : '#ff9a30');
    fg.beginPath(); fg.arc(4.5, 4.5, 4 - i, 0, 6.283); fg.fill();
    flash.push(f.c);
  }
  return { boom: boom, flash: flash };
}

function _rtsSprites() {
  if (_RTS_SPR) return _RTS_SPR;
  var S = { terrain: _sprTerrain(), rock: _sprRock(), ore: _sprOre(),
    bld: {}, unit: {}, fx: _sprFx() };
  ['player', 'enemy'].forEach(function (side) {
    S.bld[side] = {}; S.unit[side] = {};
    RTS_STRUCTS.forEach(function (d) { S.bld[side][d.key] = _sprBuilding(d.key, side); });
    RTS_UNITS.forEach(function (d) { S.unit[side][d.key] = _sprUnit(d.key, side); });
  });
  _RTS_SPR = S;
  return S;
}
