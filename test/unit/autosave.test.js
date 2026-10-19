/* THE AUTOSAVE (autosave.js, rts.save.js RTS_SLOTS), headless, in a real battle:

     ITS OWN SLOT   it writes only the autosave's two keys; the player's own save, on disk
                    beforehand, is byte-identical after it
     THE MINUTE     the HUD tick writes it once RTS_AUTO_EVERY seconds of battle have passed since
                    the battle opened, not before, and again a minute later; what it wrote reads
                    back as the battle at that moment, under a header that says where it is
     THE END        a battle that is over clears it, and leaves the player's save alone
     STORAGE FULL   an autosave that does not fit leaves nothing half-written and the player's
                    save untouched, and says so once; a body that fits under a header that does
                    not is cleared; and a player's save that does not fit beside an autosave
                    makes the autosave go and is written
     STALE          an autosave from different code is no autosave, and is said to be stale
     WHICH FIRST    CONTINUE is offered for an autosave newer than the player's save, not older */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('autosave');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js', 'src/autosave.js']);
var A = g.RTS_SLOTS.auto, P = g.RTS_SLOTS.save, store = g._store;

/* every key a call writes or removes */
var wrote = [], set0 = g.localStorage.setItem, rm0 = g.localStorage.removeItem;
g.localStorage.setItem = function (k, v) { wrote.push(k); return set0(k, v); };
g.localStorage.removeItem = function (k) { wrote.push(k); return rm0(k); };
function battle() { g._rtsNewGame(7, 'normal'); g.window._rtsUI = {}; return g._rtsG; }
/* the HUD tick once a second, at the end of it */
function run(G, secs) { for (var i = 0; i < 60 * secs; i++) { g._rtsTick(1 / 60); if (i % 60 === 59) g._rtsAutoTick(G, g.window._rtsUI); } }

S.ok('the autosave has keys of its own', A.body !== P.body && A.info !== P.info && A.body !== P.info && A.info !== P.body, JSON.stringify(A));

/* ---------------- its own slot, and the minute ---------------- */
var G = battle();
run(G, 20);
g.rtsSaveGame();
var mine = { body: store[P.body], info: store[P.info] };
wrote = [];
/* a second at a time until it lands, so the moment it was written is the moment it is read */
function until(G, limit) { for (var s = 0; s < limit && !g.rtsSaveInfo('auto'); s++) run(G, 1); return g.rtsSaveInfo('auto'); }
run(G, 35);
var early = g.rtsSaveInfo('auto');
var first = until(G, 30), body1 = g._rtsReadSave('auto').body, now1 = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
S.ok('THE MINUTE: nothing is written before a minute of battle has passed', !!mine.body && early === null, JSON.stringify(early));
S.ok('...and then it is, a minute in, the header saying where and the body reading back as the battle at that moment',
     !!first && first.t >= 60 && first.t <= 62 && /units and buildings/.test(first.desc) && JSON.stringify(body1) === JSON.stringify(now1),
     JSON.stringify(first && { t: first.t, desc: first.desc }));
run(G, 59);
var before2 = g.rtsSaveInfo('auto').t;
run(G, 2);
var second = g.rtsSaveInfo('auto');
S.ok('...and again a minute later, not sooner', before2 === first.t && !!second && second.t >= 120 && second.t <= 123, JSON.stringify({ before: before2, after: second && second.t }));
S.ok('ITS OWN SLOT: it wrote only the autosave\'s keys, and the player\'s save is byte-identical', wrote.length >= 4 &&
     wrote.every(function (k) { return k === A.body || k === A.info; }) && store[P.body] === mine.body && store[P.info] === mine.info,
     JSON.stringify(wrote.filter(function (k, i, a) { return a.indexOf(k) === i; })));

/* ---------------- the end ---------------- */
G.over = 'win';
g._rtsAutoTick(G, g.window._rtsUI);
S.ok('THE END: a battle that is over clears it, and leaves the player\'s save alone', !(A.body in store) && !(A.info in store) &&
     store[P.body] === mine.body && store[P.info] === mine.info && g._rtsAutoSave() === false, JSON.stringify(Object.keys(store)));

/* ---------------- storage full ---------------- */
var quota = Infinity, failKey = null;
g.localStorage.setItem = function (k, v) {
  var used = 0;
  Object.keys(store).forEach(function (x) { if (x !== k) used += store[x].length; });
  if (used + String(v).length > quota || k === failKey) { var e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
  return set0(k, v);
};
G = battle(); run(G, 5);
quota = mine.body.length + mine.info.length + 1000;        /* the player's save, and no room for a second */
G.msgT = 0; G.msg = '';
var ok = g._rtsAutoSave(), msg1 = G.msg;
G.msg = ''; g.window._rtsUI.autoT = -1; g._rtsAutoSave();
S.ok('STORAGE FULL: an autosave that does not fit leaves nothing half-written and the player\'s save untouched', ok === false &&
     !(A.body in store) && !(A.info in store) && store[P.body] === mine.body, JSON.stringify(Object.keys(store)));
S.ok('...and says so once', /Autosave could not be written: storage is full/.test(msg1) && G.msg === '', JSON.stringify({ first: msg1, again: G.msg }));
quota = Infinity; failKey = A.info; g.window._rtsUI = {};
S.ok('...a body that fits under a header that does not is cleared', g._rtsAutoSave() === false && !(A.body in store) && !(A.info in store), JSON.stringify(Object.keys(store)));
failKey = null;
g._rtsAutoSave();
var withAuto = A.body in store;
quota = (store[P.body] || '').length + (store[P.info] || '').length + (store[A.info] || '').length + 1000;   /* the save has room only if the autosave goes */
run(G, 5);
var saved = g.rtsSaveGame();
S.ok('...and a player\'s save that does not fit beside an autosave makes the autosave go, and is written', withAuto && saved === true &&
     !(A.body in store) && !!g.rtsSaveInfo('save') && g.rtsSaveInfo('save').t === Math.round(G.t), JSON.stringify({ withAuto: withAuto, saved: saved, keys: Object.keys(store) }));
quota = Infinity;

/* ---------------- stale ---------------- */
g._rtsAutoSave();
var info = JSON.parse(store[A.info]); info.v = info.v + 1; store[A.info] = JSON.stringify(info);
S.ok('STALE: an autosave from different code is no autosave, and is said to be stale', g.rtsSaveInfo('auto') === null && g.rtsSaveStale('auto') === true &&
     g.rtsSaveStale('save') === false, '');

/* ---------------- which first ---------------- */
S.ok('WHICH FIRST: CONTINUE is offered for an autosave newer than the player\'s save, or with none - not an older one, nor no autosave',
     g._rtsAutoNewer({ when: 2 }, { when: 1 }) && g._rtsAutoNewer({ when: 2 }, null) && !g._rtsAutoNewer({ when: 1 }, { when: 2 }) &&
     !g._rtsAutoNewer({ when: 2 }, { when: 2 }) && !g._rtsAutoNewer(null, { when: 1 }), '');

require('../lib/report.js')(S);
