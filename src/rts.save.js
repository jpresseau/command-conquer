/* BREACHWATER — saving and loading a battle. From SAVELOAD.CPP.

   The original's shape, and the reason for it:

   `Put_All` writes the WHOLE state - scenario, map, every object heap, the layers, the score,
   the AI base, the misc values - and `Load_Game` reads it back after `Clear_Scenario()` has
   wiped everything. There is no incremental patching of a running game. That is why the
   comment on Load_Game says that if it returns false "the entire game will be in an unknown
   state": a half-applied load is worse than no load, so the integrity check happens FIRST and
   bails "before any damage could be done".

   `Code_All_Pointers` / `Decode_All_Pointers` is the part that actually matters. A pointer
   means nothing in a file, so before writing, every pointer becomes a TARGET (a type plus an
   index) and after reading, every TARGET becomes a pointer again. The JavaScript problem is
   identical in kind: `e.target`, `u.ref`, a team's member list and the selection are all
   object references, and JSON has no way to express "the same object as over there" - encode
   them naively and you get either a cycle it refuses to serialise or a dozen duplicate copies
   of one tank. Here an entity reference codes to `{__e:id}` and decodes back to the live
   object, which is the same trick under a different name.

   The ordering constraint is the original's too. RA codes Houses LAST and decodes them FIRST,
   because everything else's House pointer is coded through them. Here entities are decoded in
   two passes - every shell is created and registered in `byId` before any field is resolved -
   so a reference can always find its target no matter which order the entities were written.

   `SAVEGAME_VERSION` is literally the sum of the sizeof() of every class in the save. Change
   any structure and old saves stop loading automatically, with no discipline required from the
   programmer. `RTS_SAVE_VERSION` below is the same idea in the terms this game has.

   What is NOT saved, per `Post_Load_Game` ("fixup any expediency data that can be inferred
   from the physical data loaded"): meshes, power totals, the base-centre cache. Deriving them
   again is both smaller and safer than trusting a stale copy. */

var RTS_SAVE_KEY  = 'rccmd.save1';
var RTS_SAVE_INFO = 'rccmd.save1.info';
/* THE SLOTS. The player's own save, and the autosave beside it (autosave.js): one format, one
   writer and one reader, under keys of their own, each with the title button and the note that
   speak for it. Nothing written to one slot ever touches the other's keys. */
var RTS_SLOTS = {
  save: { body: RTS_SAVE_KEY, info: RTS_SAVE_INFO, btn: 'rtsResume', note: 'rtsResumeNote' },
  save2: { body: 'rccmd.save2', info: 'rccmd.save2.info', btn: 'rtsResume', note: 'rtsResumeNote' },   /* ui/slots.js */
  save3: { body: 'rccmd.save3', info: 'rccmd.save3.info', btn: 'rtsResume', note: 'rtsResumeNote' },
  auto: { body: 'rccmd.auto1', info: 'rccmd.auto1.info', btn: 'rtsContinue', note: 'rtsAutoNote' }
};
function _rtsSlot(slot) { return RTS_SLOTS[slot] || RTS_SLOTS.save; }

/* The version stamp. Built from the shape of everything that goes into a save, exactly as
   SAVEGAME_VERSION sums the sizeof()s: add a unit, change the map size, add a trigger, and
   every existing save is rejected without anyone having to remember to bump a number. */
function _rtsSaveVersion() {
  var w = 0; for (var k in RTS_WEAPONS) w++;
  /* the 1000 is the SHAPE of G: brains moved onto the seats (core/seats.js), so an older save's
     G.ai would load into a game that no longer reads it */
  return 3 + 1000 + RTS_N_DEFAULT * 31 + RTS_UNITS.length * 7 + RTS_STRUCTS.length * 11 + w * 13
    + RTS_TEAM_TYPES.length * 17 + RTS_TRIGGERS.length * 19;
}

/* Shared static tables are the type-classes: RA saves an index into them, never the table.
   Identity, not equality - two team types with the same name would still be two objects. */
function _rtsStatics() {
  var m = new Map(), k, i;
  for (k in RTS_WEAPONS) m.set(RTS_WEAPONS[k], 'W:' + k);
  for (i = 0; i < RTS_TEAM_TYPES.length; i++) m.set(RTS_TEAM_TYPES[i], 'T:' + RTS_TEAM_TYPES[i].name);
  for (i = 0; i < RTS_TRIGGERS.length; i++) m.set(RTS_TRIGGERS[i], 'G:' + RTS_TRIGGERS[i].name);
  return m;
}
function _rtsStaticByTok(tok) {
  var kind = tok.charAt(0), name = tok.slice(2), i;
  if (kind === 'W') return RTS_WEAPONS[name] || null;
  if (kind === 'T') { for (i = 0; i < RTS_TEAM_TYPES.length; i++) if (RTS_TEAM_TYPES[i].name === name) return RTS_TEAM_TYPES[i]; }
  if (kind === 'G') { for (i = 0; i < RTS_TRIGGERS.length; i++) if (RTS_TRIGGERS[i].name === name) return RTS_TRIGGERS[i]; }
  return null;
}

var _RTS_TA = { Uint8Array:Uint8Array, Int8Array:Int8Array, Uint16Array:Uint16Array,
  Int16Array:Int16Array, Uint32Array:Uint32Array, Int32Array:Int32Array,
  Float32Array:Float32Array, Float64Array:Float64Array };
function _rtsB64(ta) {
  var b = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength), s = '', CH = 0x8000;
  for (var i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
  return btoa(s);
}
function _rtsUnB64(str, name) {
  var ctor = _RTS_TA[name]; if (!ctor) return null;
  var bin = atob(str), b = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new ctor(b.buffer);
}

/* Code_All_Pointers, as one recursive walk. Entities and type-classes become tokens; typed
   arrays become base64; functions and meshes are dropped. Anything still self-referential
   after those rules is a bug in this list rather than something to paper over, so it throws
   with the path that caused it instead of overflowing the stack. */
function _rtsCode(v, ents, statics, seen, path) {
  if (v === null || v === undefined) return null;
  var t = typeof v;
  if (t === 'number' || t === 'string' || t === 'boolean') return v;
  if (t === 'function') return null;
  /* A DOM NODE IS NOT STATE. With the player's own artwork loaded, a death effect's `seq` holds
     baked <canvas> elements, and walking into one reaches canvas.attributes[0].ownerElement -
     back to the canvas - which trips the cycle detector below and throws mid-save. An infantry
     death is on screen for about 0.9s, so this fired on roughly 6% of saves during a firefight,
     and the throw used to take the save already on disk down with it. Dropped the same way a
     function is: the renderer rebuilds all of it on demand. */
  if (typeof Node !== 'undefined' && v instanceof Node) return null;
  if (ArrayBuffer.isView(v)) return { __ta:v.constructor.name, d:_rtsB64(v) };
  if (statics.has(v)) return { __s:statics.get(v) };
  if (ents.has(v)) return { __e:v.id };
  if (seen.indexOf(v) >= 0) throw new Error('save: reference cycle at ' + path);
  seen.push(v);
  var out, i, k;
  if (Array.isArray(v)) {
    out = [];
    for (i = 0; i < v.length; i++) out.push(_rtsCode(v[i], ents, statics, seen, path + '[' + i + ']'));
  } else {
    out = {};
    for (k in v) {
      if (k === 'mesh') continue;                 /* renderer property, rebuilt on demand */
      if (typeof v[k] === 'function') continue;
      out[k] = _rtsCode(v[k], ents, statics, seen, path + '.' + k);
    }
  }
  seen.pop();
  return out;
}
/* Decode_All_Pointers. `byId` must already hold every entity shell before this runs - that is
   the two-pass ordering, and it is why a save can reference an entity written after it. */
function _rtsDecode(v, byId) {
  if (v === null || typeof v !== 'object') return v;
  if (v.__ta) return _rtsUnB64(v.d, v.__ta);
  if (v.__s) return _rtsStaticByTok(v.__s);
  if (v.__e !== undefined) return byId[v.__e] || null;
  var out, i, k;
  if (Array.isArray(v)) {
    out = [];
    for (i = 0; i < v.length; i++) out.push(_rtsDecode(v[i], byId));
  } else {
    out = {};
    for (k in v) out[k] = _rtsDecode(v[k], byId);
  }
  return out;
}

/* FNV-1a over the serialised body. RA runs a real SHA because a save file is a file on a disk
   that other programs can reach; this only has to catch a truncated or corrupted localStorage
   entry, and it has to catch it BEFORE the running game is touched. */
function _rtsHash(s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/* Put_All. Every key of G goes in except the four handled specially: `ents` holds the entity
   bodies themselves rather than references to them, `byId` is an index rebuilt on load, and
   the two generators are closures whose position is saved as a number. */
function _rtsSaveState(G) {
  var ents = new Set(G.ents), statics = _rtsStatics(), body = {}, k;
  for (k in G) {
    if (k === 'ents' || k === 'byId' || k === 'rnd' || k === 'oreRnd' || k === 'crateRnd') continue;
    if (typeof G[k] === 'function') continue;
    body[k] = _rtsCode(G[k], ents, statics, [], k);
  }
  body.ents = [];
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i], b = {};
    for (k in e) {
      if (k === 'mesh' || typeof e[k] === 'function') continue;
      b[k] = _rtsCode(e[k], ents, statics, [], 'ent.' + k);
    }
    body.ents.push(b);
  }
  body.rnd = G.rnd ? G.rnd.get() : null;
  body.oreRnd = G.oreRnd ? G.oreRnd.get() : null;
  /* The crate stream, for the same reason as the ore one: restore the crates without their
     generator's POSITION and the next crate to expire lands somewhere else than it would
     have. `oreRnd` shipped that exact bug once - the field grew differently after every
     load - and it was caught by a simulation-identity test rather than by reading the code. */
  body.crateRnd = G.crateRnd ? G.crateRnd.get() : null;
  return body;
}

/* Load_Game's second half, applied to a game that _rtsNewGame has just built. The fresh game
   supplies every invariant (arrays allocated, generators created); this overwrites the state
   on top of it. */
function _rtsApplyState(G, body) {
  var i, k;
  /* Pass one: shells and the id index, before anything is resolved. */
  var shells = [], byId = {};
  for (i = 0; i < body.ents.length; i++) { var s = { id:body.ents[i].id }; shells.push(s); byId[s.id] = s; }
  /* Pass two: fill them in, now that every reference has something to point at. */
  for (i = 0; i < body.ents.length; i++) {
    var b = body.ents[i], e = shells[i];
    for (k in b) e[k] = _rtsDecode(b[k], byId);
    e.mesh = null;
  }
  for (k in body) {
    if (k === 'ents' || k === 'rnd' || k === 'oreRnd' || k === 'crateRnd') continue;
    G[k] = _rtsDecode(body[k], byId);
  }
  G.ents = shells;
  G.byId = byId;
  /* Both generators are created lazily during play, so a save taken after they exist has to
     bring them into being on a game young enough not to have them yet - otherwise the ore
     stream restarts from its seed and the field grows differently from the moment of loading.
     The construction has to match the lazy one exactly, seed included. */
  if (body.rnd !== null && body.rnd !== undefined) {
    if (!G.rnd) G.rnd = _rtsRngMake((G.seed ^ 0x9e3779b9) >>> 0);
    G.rnd.set(body.rnd);
  }
  if (body.oreRnd !== null && body.oreRnd !== undefined) {
    if (!G.oreRnd) G.oreRnd = _rtsRngMake(G.seed ^ 0x5eed);
    G.oreRnd.set(body.oreRnd);
  }
  if (body.crateRnd !== null && body.crateRnd !== undefined) {
    if (!G.crateRnd) G.crateRnd = _rtsRngMake((G.seed ^ 0xc4a7e) >>> 0);
    G.crateRnd.set(body.crateRnd);
  }

  /* Post_Load_Game: everything inferable from what was just loaded, derived rather than
     trusted. Power is a sum over the buildings; the base-centre cache re-times itself; the
     scorch marks have to be handed back to the renderer because the terrain bake it stamped
     them into was thrown away with the old battle. */
  _rtsRecalcPower('player'); _rtsRecalcPower('enemy');
  G.zc = null; G.zcT = -99;
  G.newScorch = [];
  for (i = 0; i < G.scorch.length; i++) if (G.scorch[i]) G.newScorch.push(i);
  /* And the bodies, for exactly the same reason: the terrain bake they were stamped into died
     with the old battle. G.corpses is a hand-off queue the renderer drains, so it is empty by
     the frame after a death and a save taken later held nothing - the battlefield came back
     freshly mown. G.corpseLog is the record; this refills the queue from it. */
  G.corpses = (G.corpseLog || []).slice();
  G.scrapDirty = true; G.visDirty = 1;
  return G;
}

/* ---------------------------------------------------------------------------- the interface */

function rtsHasSave(slot) {
  try { return !!window.localStorage.getItem(_rtsSlot(slot).info); } catch (_e) { return false; }
}
/* Get_Savefile_Info: read the header WITHOUT loading the game. RA puts the description at the
   front of the file for exactly this reason - the load menu must not have to parse a whole
   save to print one line. Here the header is a separate small record. */
function rtsSaveInfo(slot) {
  try {
    var raw = window.localStorage.getItem(_rtsSlot(slot).info);
    if (!raw) return null;
    var info = JSON.parse(raw);
    if (info.v !== _rtsSaveVersion()) return null;   /* a save from different code is no save */
    return info;
  } catch (_e) { return null; }
}
/* "There IS a save, but this build cannot read it." rtsSaveInfo returns null for that case,
   the same as for no save at all, and the title screen needs to tell the two apart: a battle
   that silently disappears from the menu after an update looks exactly like a battle that was
   never saved, and the player has no way to know which happened. */
function rtsSaveStale(slot) {
  try {
    var raw = window.localStorage.getItem(_rtsSlot(slot).info);
    if (!raw) return false;
    return JSON.parse(raw).v !== _rtsSaveVersion();
  } catch (_e) { return false; }
}
/* The header a save is filed under (Get_Savefile_Info's record), for `text`, the body of G. */
function _rtsSaveHeader(G, text) {
  var mins = Math.floor(G.t / 60), secs = Math.floor(G.t % 60);
  return { v:_rtsSaveVersion(), hash:_rtsHash(text), bytes:text.length,
    diff:G.diff, seed:G.seed, t:Math.round(G.t), when:(new Date()).getTime(),
    /* WHICH ARMY. rtsHouseSide reads this out of localStorage rather than out of G, so the
       faction is the one piece of a battle that lives outside the state being written. Left
       unrecorded, resuming after switching sides loaded the base intact and then refused to
       build from it: a standing Kennel that cannot make dogs. */
    side:(typeof rtsArmySide === 'function') ? rtsArmySide() : null,
    /* A DAILY, if this is one (daily.js): its spec, so a resume is still the daily - its army
       for this battle only, its result on the end card - rather than an ordinary battle that
       wrote the day's army over the player's stored preference. */
    daily:window._RTS_DAILY || null,
    /* A MISSION, if this is one (campaign.js): which, and at what level. Everything it remembers
       is on G.mission and goes in with G; this is what the page around it needs - the battle is
       resumed as that mission, not laid again, and the player's own army is put back after. */
    mission:G.mission ? window._RTS_MISSION || { id:G.mission.id, lvl:G.mission.lvl } : null,
    desc:(window._RTS_DAILY ? 'Daily — ' : '')
      + (G.mission && _rtsMissionOf(G.mission.id) ? _rtsMissionOf(G.mission.id).name + ' — ' + RTS_DIFF[G.mission.lvl].name
        : (RTS_DIFF[G.diff] ? RTS_DIFF[G.diff].name : G.diff)) + ' — '
      + mins + ':' + (secs < 10 ? '0' : '') + secs
      + ' — ' + G.ents.filter(function (e) { return !e.dead && e.side === 'player'; }).length + ' units and buildings' };
}
/* Write one slot: {ok, wroteBody, err}.
   CLEAN UP WHAT THIS CALL WROTE, AND ONLY THAT. Serialisation is hoisted out of the caller's
   storage try for exactly this reason, and the storage half once went on doing the thing that
   describes: one try around both setItem calls, and a catch that removed both keys whatever had
   actually happened.

   The realistic failure is a full quota, and the body is the big write - 300KB of battle
   against a header of a few hundred bytes - so it is the FIRST setItem that throws. Measured
   with the quota exhausted: nothing was written, and then both keys were removed, destroying a
   complete 315,744-character save from earlier in the session. The player is told "no room
   left in storage", finds RESUME BATTLE gone from the title screen, and is never told that
   saving DESTROYED the old battle rather than merely failing to replace it.

   So: the body failing means nothing was written and the pair already on disk is intact and
   consistent - touch nothing. A body written under a header that failed is the only genuinely
   half-written outcome, and the only one worth clearing, because a new body under an old
   header is a pair whose checksum cannot match. */
function _rtsWriteSlot(slot, text, info) {
  var K = _rtsSlot(slot), wroteBody = false;
  try {
    window.localStorage.setItem(K.body, text);
    wroteBody = true;
    window.localStorage.setItem(K.info, JSON.stringify(info));
    return { ok: true, wroteBody: true, err: '' };
  } catch (e) {
    if (wroteBody) {
      try { window.localStorage.removeItem(K.body); window.localStorage.removeItem(K.info); } catch (_x) {}
    }
    return { ok: false, wroteBody: wroteBody, err: (e && e.name) || 'Error' };
  }
}
/* `slot`: one of the player's own (ui/slots.js); the active one when left out */
function rtsSaveGame(slot) {
  var G = window._rtsG;
  if (!G) return false;
  slot = slot || (typeof rtsSlotActive === 'function' ? rtsSlotActive() : 'save');
  /* SERIALISE FIRST, OUTSIDE THE TRY THAT OWNS THE CLEANUP. Both steps could throw and only one
     of them can leave a half-written pair behind, so they must not share a catch: a serialiser
     failure used to run the removeItem pair and DELETE THE SAVE ALREADY ON DISK - a save from
     ten minutes ago destroyed by an attempt to make a new one, with nothing written in its
     place. Storage is not touched until there is something complete to put in it. */
  var text, info;
  try {
    text = JSON.stringify(_rtsSaveState(G));
    info = _rtsSaveHeader(G, text);
  } catch (e) {
    _rtsSay('Could not save: the battle could not be written down (' + (e && e.message ? e.message : e) + ').');
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    return false;                                 /* nothing on disk has been touched */
  }
  var w = _rtsWriteSlot(slot, text, info);
  /* NO ROOM, AND THE AUTOSAVE IS WHAT FILLS IT: the player's own save is worth more than the copy
     the game kept by itself, so the autosave makes way and the save is tried once more */
  if (!w.ok && !w.wroteBody && w.err === 'QuotaExceededError' && typeof _rtsAutoClear === 'function' && _rtsAutoClear()) w = _rtsWriteSlot(slot, text, info);
  if (w.ok) {
    _rtsSay('Battle saved.');
    if (typeof _rtsSfx === 'function') _rtsSfx('click');
    return true;
  }
  _rtsSay('Could not save: '
    + (w.err === 'QuotaExceededError' ? 'no room left in storage.' : 'storage unavailable.')
    /* Worth saying out loud rather than leaving to be inferred: the point of the change is that
       the older battle survives, and a player who has just been refused assumes the worst
       unless told otherwise. */
    + (w.wroteBody ? '' : ' Your previous save is untouched.'));
  if (typeof _rtsSfx === 'function') _rtsSfx('deny');
  return false;
}
/* Verify everything before touching the running game - version, presence, checksum, parse -
   and only then tear the battle down. Load_Game's whole structure is this precaution. */
/* SIX WAYS TO HAVE NOTHING TO RESUME, and this used to return the same bare null for all of
   them. The index and the body live under two different keys, and only the INDEX decides
   whether RESUME BATTLE appears - so every failure below is the case where the index survived
   and the body did not, which is precisely when the button is on screen promising something it
   cannot deliver. Returning the reason costs nothing; the caller decides where to put it. */
function _rtsReadSave(slot) {
  var info = rtsSaveInfo(slot);
  if (!info) return { body:null, why:'none', msg:'There is no saved battle to resume.' };
  var text;
  try { text = window.localStorage.getItem(_rtsSlot(slot).body); }
  catch (_e) {
    return { body:null, why:'blocked',
      msg:'This browser will not let the game read its own storage, so the save cannot be '
        + 'opened. Private browsing is the usual cause.' };
  }
  if (!text) {
    return { body:null, why:'gone',
      msg:'The saved battle itself is gone — the browser cleared its storage, but left the '
        + 'record of it behind.' };
  }
  /* Length before hash: a save cut short by a full quota is a different accident from one that
     was altered, and "you ran out of room" is something the player can act on. */
  if (text.length !== info.bytes) {
    return { body:null, why:'truncated',
      msg:'The saved battle is incomplete — it was cut short as it was written, which normally '
        + 'means the browser ran out of storage room.' };
  }
  if (_rtsHash(text) !== info.hash) {
    return { body:null, why:'damaged', msg:'The saved battle is damaged and cannot be trusted.' };
  }
  var body;
  try { body = JSON.parse(text); }
  catch (_e2) {
    return { body:null, why:'damaged', msg:'The saved battle is damaged and cannot be read.' };
  }
  if (!body || !body.ents || !body.ents.length) {
    return { body:null, why:'empty', msg:'The saved battle has nothing in it.' };
  }
  return { body:body, why:'', msg:'', info:info };
}
/* Put the reason where the player just clicked. In a match that is the message line; on the
   TITLE SCREEN there is no match and no message line - which is the whole bug, because the
   only explanation this function ever had was behind `if (window._rtsG)` and RESUME BATTLE is
   pressed from a screen where _rtsG is by definition null. The button did nothing, said
   nothing, and was indistinguishable from a broken button. */
function _rtsLoadFailed(res, slot) {
  if (window._rtsG) { _rtsSay(res.msg); return; }
  var n = document.getElementById(_rtsSlot(slot).note);
  if (n) { n.hidden = false; n.textContent = res.msg; }
  /* The button has just been shown to be lying, so stop offering it for this visit. Nothing is
     deleted: a browser that is merely blocked right now may not be blocked next time, and
     throwing away the player's save on a failed READ is not ours to do. */
  if (res.why !== 'none') {
    var r = document.getElementById(_rtsSlot(slot).btn);
    if (r) r.hidden = true;
  }
}
/* `slot`: 'save', the player's own (the default), or 'auto' (autosave.js) */
function rtsLoadGame(slot) {
  var res = _rtsReadSave(slot);
  var body = res.body;
  if (!body) {
    _rtsLoadFailed(res, slot);
    if (typeof _rtsSfx === 'function') _rtsSfx('deny');
    return false;
  }
  /* Put the army back before anything reads it. rtsHouseSide answers out of the live preference
     rather than out of G, so resuming a Soviet battle while the title screen says ALLIED used to
     load the Soviet base and then hand you the Allied roster - a Kennel standing in your base
     that cannot build a dog. Saves written before this field existed have no `side`, and are
     left exactly as they were rather than being guessed at. */
  _rtsLoadArmy(res.info);
  /* The load goes through the same door as starting a battle: close, open, and hand the state
     to rtsOpen so it lands after _rtsNewGame and before the renderer bakes the terrain. */
  window._RTS_PENDING_LOAD = body;
  window._RTS_PENDING_SLOT = slot || 'save';      /* the autosave is kept only for its own resume */
  if (slot && slot !== 'auto') window._RTS_SLOT = slot;   /* the next save goes back where this came from (ui/slots.js) */
  if (document.getElementById('rcgRts')) rtsClose();
  rtsOpen(body.seed);
  return true;
}
/* The army a save is resumed with. An ordinary battle's is stored, as the player's choice. A
   DAILY'S is not: it is set for the battle only, the way daily.js sets it, with the player's own
   army and difficulty kept to be put back by rtsDailyEnd - resuming a Dominion daily once wrote
   Dominion into a Compact player's stored preference, and resumed it as a plain match with no
   daily line on the end card. */
function _rtsLoadArmy(info) {
  /* an ordinary battle loaded from inside a mission is not that mission: hand the page back */
  if (window._RTS_MISSION && !(info && info.mission) && typeof rtsCampEnd === 'function') rtsCampEnd();
  if (!info || !info.side) return;
  /* A MISSION'S the same way as a daily's, kept for rtsCampEnd to put the player's own back */
  if (info.mission) {
    var m = typeof _rtsMissionOf === 'function' && _rtsMissionOf(info.mission.id);
    if (!window._RTS_MISSION) window._RTS_CAMP_PREV = { diff: window._RTS_DIFF, army: typeof rtsArmySide === 'function' ? rtsArmySide() : window._RTS_ARMY };
    window._RTS_MISSION = info.mission;
    if (m) window._RTS_DIFF = m.diff;
    window._RTS_ARMY = info.side;
    return;
  }
  if (info.daily) {
    if (!window._RTS_DAILY_PREV) window._RTS_DAILY_PREV = { diff: window._RTS_DIFF, army: typeof rtsArmySide === 'function' ? rtsArmySide() : window._RTS_ARMY };
    window._RTS_DAILY = info.daily;
    if (info.daily.diff) window._RTS_DIFF = info.daily.diff;
    window._RTS_ARMY = info.side;
    return;
  }
  if (typeof rtsSetArmySide === 'function') rtsSetArmySide(info.side);
}
