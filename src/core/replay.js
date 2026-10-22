/* core/replay.js - RECORDING A BATTLE, AND PLAYING IT BACK. Part of rts.core; the title's button,
   the end card's and the replay's own bar are replay.js.

   The simulation is deterministic - the same start, the same ticks of the same lengths and the
   same orders on the same ticks make the same battle, to the bit (unit/campaign-save resumes four
   missions on that) - so a replay is small: the setup (replay.js keeps it in the header), the
   length of every tick, and every call the interface made into the simulation, each with the
   number of ticks run before it. The live loop's step is the difference of two Date readings in
   whole milliseconds, capped at 100 (ui/camera.js), so a tick is one character in `dts`; a tick
   of any other length - a spec's 1/60 - goes in `odd` by its number.

   THE CALLS. RTS_REPLAY_CMDS names every simulation function the interface calls that changes the
   battle. Each is wrapped, once (_rtsRecInstall), so that a call from outside a tick and from no
   other recorded call is logged while recording, refused while a replay plays - the player
   watches; the replay's own calls go through - and passes untouched the rest of the time. Calls
   inside a tick are the simulation's own and are never logged. test/unit/replay holds the list
   from both ends: every simulation function the interface calls is here or in RTS_REPLAY_PURE,
   which says why it need not be (it reads, it sets up the battle, or it only writes the message
   line), and src/ui writes no unit's or side's orders by hand (core/commands.js).

   A "...Selected" call acts on the selection, so its record carries the selection's ids, and a
   replay selects them before making it. An entity in an argument is recorded by id and found by
   id again; the ids are dealt in the same order in both runs, being part of the battle. */
var RTS_REPLAY_CMDS = [
  '_rtsOrderMove', '_rtsOrderAttack', '_rtsOrderBoard', '_rtsOrderCapture', '_rtsOrderHarvest',
  '_rtsOrderUnloadAt', '_rtsLandAt', '_rtsDroneOn', '_rtsBomberSend', '_rtsSetRally',
  '_rtsPlaceStruct', '_rtsQueue', '_rtsCancel', '_rtsSuspend', '_rtsResume', '_rtsSell',
  '_rtsToggleRepair', '_rtsSuperFire', '_rtsAllyCommand', '_rtsHoldSelected', '_rtsDeploySelected',
  '_rtsUnloadSelected', '_rtsKill',
  /* core/commands.js: what used to be written by hand */
  '_rtsWayClear', '_rtsWayAdd', '_rtsBombClear', '_rtsOrderDemo', '_rtsOrderToRefinery', '_rtsReadyClear', '_rtsRepeatSet'
];
var RTS_REPLAY_PURE = {
  read: ['_rtsAground', '_rtsAirHeld', '_rtsBias', '_rtsBlocked', '_rtsBoardReachable', '_rtsBoardWhyNot',
    '_rtsBridgeAt', '_rtsCanBoard', '_rtsCanDeploy', '_rtsCanEngage', '_rtsCanPlace', '_rtsCanProduce',
    '_rtsCanRally', '_rtsCanUnload', '_rtsCargoCount', '_rtsDomainOf', '_rtsElev', '_rtsEntSeen', '_rtsGarrisonable', '_rtsGarrisonCap', '_rtsHas',
    '_rtsHostile', '_rtsHullReaches', '_rtsIdx', '_rtsInB', '_rtsIsBridgeCell', '_rtsIsTransport', '_rtsJamUp',
    '_rtsJammed', '_rtsMinesLeft', '_rtsMissionGoals', '_rtsMissionGold', '_rtsMissionLevels',
    '_rtsMissionMedal', '_rtsMissionOf', '_rtsPowerFactor', '_rtsQueueCat', '_rtsRadarStaticShown',
    '_rtsSkirmishOf', '_rtsStormGrounds', '_rtsSuperDefOf', '_rtsSuperHint', '_rtsSuperProgress',
    '_rtsSuperReady', '_rtsSuperSources', '_rtsSurvivalBounty', '_rtsTX', '_rtsTideAny', '_rtsTideLine',
    '_rtsWX', '_rtsWhyLocked', 'rtsArmyName', 'rtsArmyTitle', 'rtsBuildableBy', 'rtsCapacity', 'rtsCapturable',
    'rtsHouseSide', 'rtsMoney', 'rtsStructDef', 'rtsUnitDef', 'rtsArmySide', '_rtsReplayHash', '_rtsRevealed', '_rtsReplayValid',
    '_rtsReplayTimes',
    /* the picture's: heights, sight and where a gun points (src/render, src/render3d) */
    '_rtsAirLift', '_rtsVisible', '_rtsMineShown', '_rtsBridgeDeckY', '_rtsMuzzleAngle', '_rtsFireCoord',
    '_rtsWithPlayer', '_rtsStandY', '_rtsEffectsSeen', '_rtsElevNormal', '_rtsTileElev'],
  /* the battle's setup, before a recording starts, or a save's, which is not recorded */
  setup: ['_rtsNewGame', '_rtsMissionSetup', '_rtsSurvivalSetup', '_rtsRecalcPower', '_rtsRngMake', 'rtsSetArmySide',
    '_rtsRecStart', '_rtsRecStop', '_rtsReplayBegin', '_rtsReplayStep', '_rtsReplayTo'],
  /* the message line, which nothing in the simulation reads */
  say: ['_rtsSay'],
  /* the loop itself: recorded as the ticks */
  loop: ['_rtsTick']
};
var _rtsRec = null;

function _rtsRecInstall() {
  if (_rtsRecInstall.done) return;
  _rtsRecInstall.done = true;
  var realTick = window._rtsTick;
  window._rtsTick = function (dt) {
    var R = _rtsRec;
    if (!R) return realTick(dt);
    if (R.mode === 'rec') {
      var ms = Math.round(dt * 1000);
      if (ms >= 1 && ms <= 100 && ms / 1000 === dt) R.dts += String.fromCharCode(48 + ms);
      else { R.dts += '/'; R.odd[R.n] = dt; }
    }
    R.inTick++;
    try { return realTick(dt); } finally { R.inTick--; R.n++; }
  };
  RTS_REPLAY_CMDS.forEach(function (name) {
    var real = window[name];
    if (typeof real !== 'function') return;
    window[name] = function () {
      var R = _rtsRec;
      if (!R || R.inTick || R.depth) return real.apply(this, arguments);
      if (R.mode === 'play' && !R.applying) { _rtsReplayRefuse(R); return false; }
      if (R.mode === 'rec') R.cmds.push(_rtsRecCall(R, name, arguments));
      R.depth++;
      try { return real.apply(this, arguments); } finally { R.depth--; }
    };
  });
}
/* an order given by hand during a replay: refused, and said so - once in a while, not per unit */
function _rtsReplayRefuse(R) {
  var G = window._rtsG;
  R.refused = (R.refused || 0) + 1;
  if (G && !(R.saidT > G.t - 2)) { R.saidT = G.t; _rtsSay('A replay plays itself - watch, or ✕ to leave it.', 3); }
}
/* an argument as the record keeps it: an entity by its id, undefined and the non-finite numbers
   spelled out, since JSON has neither */
function _rtsRecEnc(v) {
  if (v === undefined) return { '~': 'u' };
  if (typeof v === 'number' && !isFinite(v)) return { '~': String(v) };
  if (!v || typeof v !== 'object') return v;
  if (v.id !== undefined && (v.type === 'unit' || v.type === 'struct')) return { '@': v.id };
  if (Array.isArray(v)) return v.map(_rtsRecEnc);
  var o = {};
  for (var k in v) o[k] = _rtsRecEnc(v[k]);
  return o;
}
function _rtsRecEnt(G, id) {
  for (var i = 0; i < G.ents.length; i++) if (G.ents[i].id === id) return G.ents[i];
  return { id: id, dead: true, hp: 0 };          /* gone by then in the recording too */
}
function _rtsRecDec(G, v) {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(function (x) { return _rtsRecDec(G, x); });
  if (v['~'] !== undefined) return v['~'] === 'u' ? undefined : Number(v['~']);
  if (v['@'] !== undefined) return _rtsRecEnt(G, v['@']);
  var o = {};
  for (var k in v) o[k] = _rtsRecDec(G, v[k]);
  return o;
}
function _rtsRecCall(R, name, args) {
  var c = { k: R.n, f: name, a: Array.prototype.map.call(args, _rtsRecEnc) }, G = window._rtsG;
  if (/Selected$/.test(name) && G && G.sel) c.s = G.sel.map(function (e) { return e.id; });
  return c;
}

/* Start recording the battle just laid, under `head` (replay.js: what lays it again). */
function _rtsRecStart(head) {
  _rtsRecInstall();
  _rtsRec = { mode: 'rec', head: head, dts: '', odd: {}, cmds: [], n: 0, inTick: 0, depth: 0 };
  return _rtsRec;
}
/* ...and stop: the replay, with how the battle stood at its end, to check a playback against */
function _rtsRecStop() {
  var R = _rtsRec, G = window._rtsG;
  if (!R || R.mode !== 'rec') return null;
  _rtsRec = null;
  return { v: 1, head: R.head, dts: R.dts, odd: R.odd, cmds: R.cmds,
           end: { n: R.n, t: G ? G.t : 0, over: (G && G.over) || null, hash: G ? _rtsReplayHash(G) : '' } };
}

/* Play `rec` on the battle its header has just laid again. */
function _rtsReplayBegin(rec) {
  _rtsRecInstall();
  _rtsRec = { mode: 'play', rec: rec, n: 0, ci: 0, inTick: 0, depth: 0, applying: 0, acc: 0, done: false };
  return _rtsRec;
}
function _rtsReplayDt(rec, i) {
  var c = rec.dts.charCodeAt(i);
  return c === 47 ? rec.odd[i] : (c - 48) / 1000;
}
/* the calls made before tick R.n, made again */
function _rtsReplayCalls(R) {
  var G = window._rtsG, cmds = R.rec.cmds;
  while (R.ci < cmds.length && cmds[R.ci].k <= R.n) {
    var c = cmds[R.ci++];
    /* ONLY A COMMAND: a replay can come from a file (replay.js), and a name the record should
       not hold - any other function on the page - is skipped, never called */
    if (RTS_REPLAY_CMDS.indexOf(c.f) < 0 || typeof window[c.f] !== 'function') { R.bad = (R.bad || 0) + 1; continue; }
    if (c.s) G.sel = c.s.map(function (id) { return _rtsRecEnt(G, id); }).filter(function (e) { return !e.dead; });
    R.applying++;
    try { window[c.f].apply(null, c.a.map(function (x) { return _rtsRecDec(G, x); })); }
    finally { R.applying--; }
  }
}
/* `secs` of the recording's own time, at most `cap` ticks: the calls and ticks that fit. Returns
   how many ticks ran; R.done once the last has. */
function _rtsReplayStep(R, secs, cap) {
  var rec = R.rec, len = rec.dts.length, ran = 0;
  R.acc += secs;
  while (R.n < len && ran < cap) {
    var dt = _rtsReplayDt(rec, R.n);
    if (R.acc < dt) break;
    _rtsReplayCalls(R);
    R.acc -= dt;
    window._rtsTick(dt);
    ran++;
  }
  if (R.n >= len) { _rtsReplayCalls(R); R.done = true; }
  if (ran >= cap) R.acc = Math.min(R.acc, 0.25);          /* a slow machine falls behind, not into a spiral */
  return ran;
}

/* How a battle stands, to the bit: every entity's place and health, every side's purse, the clock -
   what a replay that went the recording's way ends on, and one that went its own does not. */
function _rtsReplayHash(G) {
  var h = 0x811c9dc5;
  function add(s) { s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } }
  add(G.t); add(G.over || '');
  G.order.forEach(function (k) { var S = G.sides[k]; add(k + ':' + S.credits + ':' + S.ore + ':' + !!S.lost); });
  G.ents.filter(function (e) { return !e.dead; }).sort(function (a, b) { return a.id - b.id; })
    .forEach(function (e) { add(e.id + e.def + e.side + ':' + e.x + ':' + e.z + ':' + e.hp); });
  return ('00000000' + h.toString(16)).slice(-8);
}

/* SEEKING: on to tick n (or the end), every call and tick between, as fast as they run - the
   timeline's jump forward (replay.js; a jump back lays the battle again and comes forward). */
function _rtsReplayTo(R, n) {
  var rec = R.rec, len = rec.dts.length, ran = 0;
  while (R.n < n && R.n < len) {
    _rtsReplayCalls(R);
    window._rtsTick(_rtsReplayDt(rec, R.n));
    ran++;
  }
  if (R.n >= len) { _rtsReplayCalls(R); R.done = true; }
  R.acc = 0;
  return ran;
}
/* the battle's clock after each tick, for the timeline: times[i] is the time i ticks in */
function _rtsReplayTimes(rec) {
  var len = rec.dts.length, out = new Float64Array(len + 1);
  for (var i = 0; i < len; i++) out[i + 1] = out[i] + _rtsReplayDt(rec, i);
  return out;
}

/* THE MAP REVEALED, for a replay's watcher (replay.js's 👁): every visibility test says seen - but
   only while the picture is drawn. Inside a tick, and while a recorded call is made again, the
   simulation asks the same questions (a gun's muzzle flash, a trigger, the jammer) and must get
   the answers the battle got, or the replay goes its own way; a recording is never revealed. */
function _rtsRevealed() { var R = _rtsRec; return !!(R && R.mode === 'play' && R.reveal && !R.inTick && !R.applying); }

/* A REPLAY FROM A FILE IS UNTRUSTED: the reason it cannot be played, or '' - its shape, the
   battle it names, every tick a step the live loop could have taken, every call a command */
function _rtsReplayValid(r) {
  if (!r || typeof r !== 'object' || r.v !== 1) return 'not a Breachwater replay';
  var h = r.head;
  if (!h || typeof h !== 'object' || typeof h.seed !== 'number' || !isFinite(h.seed)) return 'it has no battle to lay';
  if (!RTS_DIFF[h.diff]) return 'its difficulty is not one this game has';
  if (RTS_ARMY_SIDES.indexOf(h.army) < 0) return 'its army is not one this game has';
  if (h.mission && (typeof h.mission !== 'object' || !_rtsMissionOf(h.mission.id))) return 'its mission is not one this game has';
  if (h.skirmish != null && typeof h.skirmish !== 'object') return 'its map setup is not one this game has';
  if (h.sky != null && typeof h.sky !== 'string') return 'its sky is not one this game has';
  if (typeof r.dts !== 'string' || !r.dts.length || !/^[\x2f\x31-\x94]*$/.test(r.dts)) return 'its ticks are not a battle\'s';
  if (!r.odd || typeof r.odd !== 'object') return 'its ticks are not a battle\'s';
  for (var k in r.odd) if (r.dts.charCodeAt(+k) !== 47 || typeof r.odd[k] !== 'number' || !(r.odd[k] > 0 && r.odd[k] <= 1)) return 'its ticks are not a battle\'s';
  for (var i = 0; i < r.dts.length; i++) if (r.dts.charCodeAt(i) === 47 && !(i in r.odd)) return 'its ticks are not a battle\'s';
  if (!Array.isArray(r.cmds)) return 'it has no orders';
  for (i = 0; i < r.cmds.length; i++) {
    var c = r.cmds[i];
    if (!c || typeof c.k !== 'number' || !Array.isArray(c.a) || RTS_REPLAY_CMDS.indexOf(c.f) < 0) return 'it gives an order this game does not take';
    if (c.s != null && !Array.isArray(c.s)) return 'it gives an order this game does not take';
  }
  return '';
}
