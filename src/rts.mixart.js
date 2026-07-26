/* RC COMMAND - real Red Alert artwork, read from the player's own game files.

   Everything else in this project draws its own sprites, because there were no originals to
   draw with. There are now: `ra/mix.js`, `lcw.js`, `blowfish.js` and `shp.js` read the shipped
   archives, and this file is the seam between them and the renderer.

   WHY IT LOADS FROM DISK RATHER THAN SHIPPING WITH THE GAME. Red Alert was released as freeware
   by EA in 2008 and the archives are downloadable, but redistributing the artwork - especially
   re-cut into someone else's spritesheets - is a different thing from linking to the official
   package, and OpenRA, who have thought about this much longer than this project has,
   deliberately do not redistribute it either. So: no game data is committed here, the player
   points the game at their own copy once, and it is cached in their browser afterwards.

   Without content the game is exactly what it was - every procedural sprite still builds, and
   `_rtsArtReady()` is the only thing that decides which set the renderer gets. */

var RTS_MIX = {
  /* the archives worth asking for, and what each is needed for */
  want: ['conquer.mix', 'temperat.mix', 'local.mix', 'hires.mix'],
  open: {},                     /* name -> parsed archive */
  pal: null,                    /* the temperate palette, 256 x RGB */
  ready: false,
  note: ''
};

/* ------------------------------------------------------------------ names --
   Our keys against the originals'. The mapping is the whole reason this file can be short:
   every structure and vehicle we invented was modelled on something real, so almost all of
   them have a counterpart. Anything absent here keeps its procedural sprite, which is why a
   missing entry is a fallback rather than a hole. */
var RTS_MIX_BLD = {
  yard:'fact', power:'powr', apower:'apwr', refinery:'proc', factory:'weap',
  barracks:'barr', radar:'dome', lab:'atek', depot:'fix', silo:'silo',
  helipad:'hpad', turret:'gun', rocketpit:'sam', pillbox:'pbox',
  flametower:'ftur', kennel:'kenn', wall:'brik'
};
var RTS_MIX_UNIT = {
  buggy:'jeep', light:'1tnk', tank:'2tnk', heavy:'4tnk', arty:'arty',
  harvester:'harv', apc:'apc', mcv:'mcv', heli:'heli'
};

/* --------------------------------------------------------------- remapping --
   RA recolours a player's units by rewriting a RANGE of palette entries rather than by tinting
   the sprite - indices 80..95 are the team block, and every unit's artwork is drawn using them
   wherever it wants to show ownership. That is why the vehicles come out of the archive gold
   and green: those are the unremapped slots.

   Rebuilding the block from our own team colour keeps the original's shading intact - the ramp
   inside the block is preserved, only its hue moves - which is what a naive per-pixel tint
   destroys. */
var RTS_REMAP_LO = 80, RTS_REMAP_HI = 95;

function _mixTeamPal(base, hex) {
  var pal = new Uint8Array(base);
  var t = _sprCol(hex);
  for (var i = RTS_REMAP_LO; i <= RTS_REMAP_HI; i++) {
    /* position within the block, 0 = lightest in RA's ordering */
    var f = (i - RTS_REMAP_LO) / (RTS_REMAP_HI - RTS_REMAP_LO);
    /* a ramp from near-white through the team colour to near-black, matching how the block is
       used: highlights at the top, shadow at the bottom */
    var k = f < 0.5 ? (1 - f * 2) : 0, d = f < 0.5 ? 0 : (f - 0.5) * 2;
    for (var c = 0; c < 3; c++) {
      var v = t[c] * (1 - d) + 0 * d;         /* darken toward the bottom of the ramp */
      v = v + (255 - v) * k * 0.75;           /* lighten toward the top */
      pal[i * 3 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return pal;
}

/* A SHP frame is palette indices; index 0 is transparent. RA also reserves index 4 for the
   drop shadow, which is drawn as translucent black rather than as a palette colour - painting
   it literally puts a hard green blob under every unit. */
var RTS_SHADOW_INDEX = 4;

function _mixFrameToCanvas(fr, w, h, pal) {
  var cv = _sprMake(w, h), g = cv.g;
  var img = g.createImageData(w, h), d = img.data;
  for (var i = 0; i < w * h; i++) {
    var v = fr[i], o = i * 4;
    if (v === 0) { d[o + 3] = 0; continue; }
    if (v === RTS_SHADOW_INDEX) { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 90; continue; }
    d[o] = pal[v * 3]; d[o + 1] = pal[v * 3 + 1]; d[o + 2] = pal[v * 3 + 2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv.c;
}

function _mixShp(name) {
  var i, a;
  for (i = 0; i < RTS_MIX.want.length; i++) {
    a = RTS_MIX.open[RTS_MIX.want[i]];
    if (a && !a.error && a.has(name)) {
      var s = window.RA_SHP.shpOpen(a.read(name));
      if (!s.error) return s;
    }
  }
  return null;
}

function _rtsArtReady() { return !!(RTS_MIX.ready && RTS_MIX.pal); }

/* ------------------------------------------------------------- structures --
   A structure SHP's frame 0 is the finished building. The renderer wants the same shape the
   procedural baker returns - a canvas plus `head`, the headroom above the footprint - and the
   original's art is already drawn to the same convention: the footprint sits at the bottom. */
function _mixBuilding(key, side) {
  var nm = RTS_MIX_BLD[key];
  if (!nm) return null;
  var s = _mixShp(nm + '.shp');
  if (!s) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  var c = _mixFrameToCanvas(s.frame(0), s.width, s.height, pal);
  var d = rtsStructDef(key), footD = d.h * RTS_TS;
  return { c: c, head: Math.max(0, s.height - footD) };
}

/* ----------------------------------------------------------------- units --
   RA stores vehicles at 32 facings, which is what this project already bakes since the facing
   count was corrected. A turreted vehicle keeps hull and turret in ONE file: frames 0..31 are
   the hull and 32..63 the turret, which lines up exactly with how the renderer draws them.

   Facing order runs the opposite way round from ours and starts somewhere else, and this was
   NOT worked out by reading - it was measured. Decoding all 32 turret frames of 2tnk.shp and
   taking the pixel furthest from centre (which is the barrel tip) gives the bearing each frame
   actually points at:

       frame  0 -> -93 deg (north)      frame 16 -> +94 deg (south)
       frame  8 -> -173 deg (west)      frame 24 ->  -7 deg (east)

   So RA's index starts at north and runs ANTICLOCKWISE, while ours starts east and runs
   clockwise. Solving  -90 - i*(360/n) = f*(360/n)  gives i = -n/4 - f.

   The first version of this had the quarter-turn's sign the other way and every vehicle drove
   sideways; a centroid-based check called it wrong but could not say by how much, because a
   turret's centroid barely moves. The barrel tip is the measurement that settles it. */
function _mixFacing(f, n) {
  var i = (-(n / 4) - f) % n;                  /* east-clockwise -> north-anticlockwise */
  return ((i % n) + n) % n;
}

function _mixUnit(key, side, prone, part) {
  var nm = RTS_MIX_UNIT[key];
  if (!nm) return null;
  var s = _mixShp(nm + '.shp');
  if (!s) return null;
  var d = rtsUnitDef(key), n = _sprFacingsFor(d);
  var turreted = !!RTS_TURRETED[key];
  if (s.count < n) return null;
  if (part === 'turret' && (!turreted || s.count < n * 2)) return null;
  var pal = _mixTeamPal(RTS_MIX.pal, RTS_PAL.team[side][0]);
  var base = (part === 'turret') ? n : 0;
  var out = [];
  for (var f = 0; f < n; f++) {
    var idx = base + _mixFacing(f, n);
    var fr = s.frame(idx);
    out.push(fr ? _mixFrameToCanvas(fr, s.width, s.height, pal) : _sprMake(s.width, s.height).c);
  }
  return out;
}

/* ------------------------------------------------------------------ load --
   Handed a list of File objects from a picker. Each is read, parsed, and kept; the palette is
   pulled out of local.mix. Everything is reported rather than assumed, because a player who
   picks the wrong folder should be told which archive is missing. */
function rtsMixLoadFiles(files, done) {
  var left = files.length, got = [];
  if (!left) { done && done('No files chosen.'); return; }
  for (var i = 0; i < files.length; i++) {
    (function (file) {
      var fr = new FileReader();
      fr.onload = function () {
        var name = String(file.name || '').toLowerCase();
        try {
          var a = window.RA_MIX.mixOpen(new Uint8Array(fr.result));
          if (a.error) got.push(name + ': ' + a.error);
          else { RTS_MIX.open[name] = a; got.push(name + ': ' + a.count + ' files'); }
        } catch (e) { got.push(name + ': ' + (e && e.message ? e.message : 'unreadable')); }
        if (--left === 0) _mixFinish(got, done);
      };
      fr.onerror = function () { got.push(file.name + ': could not be read'); if (--left === 0) _mixFinish(got, done); };
      fr.readAsArrayBuffer(file);
    })(files[i]);
  }
}

function _mixFinish(log, done) {
  var loc = RTS_MIX.open['local.mix'];
  if (loc && !loc.error) {
    var p = loc.read('temperat.pal');
    if (p) RTS_MIX.pal = window.RA_SHP.palOpen(p);
  }
  var haveArt = !!(RTS_MIX.open['conquer.mix'] && !RTS_MIX.open['conquer.mix'].error);
  RTS_MIX.ready = !!(haveArt && RTS_MIX.pal);
  RTS_MIX.note = log.join('\n');
  if (!haveArt) RTS_MIX.note += '\nconquer.mix is the one with the artwork in it.';
  if (!RTS_MIX.pal) RTS_MIX.note += '\nlocal.mix is needed for the palette.';
  if (RTS_MIX.ready) { _RTS_SPR = null; _RTS_UFIT = {}; _RTS_USCALE = {}; }
  done && done(RTS_MIX.ready ? null : RTS_MIX.note, RTS_MIX.note);
}

/* The picker's change handler. Kept here rather than in rts.ui.js because everything it talks
   to is in this file, and because the whole feature has to be removable in one piece. */
function rtsMixPicked(input) {
  var note = document.getElementById('rtsMixNote');
  if (note) note.textContent = 'Reading...';
  rtsMixLoadFiles(input.files, function (err, log) {
    if (!note) return;
    if (_rtsArtReady()) {
      note.textContent = 'Original artwork loaded. ' +
        Object.keys(RTS_MIX.open).length + ' archives read.';
      note.className = 'ok';
    } else {
      note.textContent = (log || err || 'Nothing usable in those files.');
      note.className = 'bad';
    }
  });
}
