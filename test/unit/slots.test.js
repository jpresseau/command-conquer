/* SAVE SLOTS (ui/slots.js, rts.save.js RTS_SLOTS), headless, in a real battle:

     THREE OF THEIR OWN   the three slots and the autosave each have keys of their own
     THE SLOT IN USE      💾 with none chosen writes slot 1; with one chosen (window._RTS_SLOT) it
                          writes that one and only that one - the other slots byte-identical - and
                          a slot named outright is written without changing the one in use
     SAVE HERE            rtsSlotSave(k) writes k and makes it the slot in use
     NEWEST               the newest filled slot is the one written last, by its own clock; a slot
                          from an earlier build does not count; none when all are empty
     📂                   with no slot filled it loads the one in use; with one filled, that one,
                          whichever it is, and no panel; with two or more it opens the panel and
                          loads nothing */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('slots');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js', 'src/autosave.js', 'src/ui/slots.js']);
var K = g.RTS_SLOTS, store = g._store;
/* the panel is DOM; here it is a record of whether it was asked to open, and so is a load */
var opened = [], loads = [];
g._rtsSlotsSync = function () {};
g.rtsSlotsPanel = function (on) { opened.push(on); };
g.rtsLoadGame = function (k) { loads.push(k); return true; };
function run(secs) { for (var i = 0; i < 60 * secs; i++) g._rtsTick(1 / 60); }
function keys() { return Object.keys(store).filter(function (k) { return /^rccmd\./.test(k); }).sort(); }
/* a slot's clock, or null when it holds nothing - so a broken save fails an assertion, not the spec */
function tOf(k) { var i = g.rtsSaveInfo(k); return i ? i.t : null; }
function when(k, w) { if (!store[K[k].info]) return; var i = JSON.parse(store[K[k].info]); i.when = w; store[K[k].info] = JSON.stringify(i); }

g._rtsNewGame(7, 'normal'); g.window._rtsUI = {};
var G = g._rtsG;
run(10);

var all = ['save', 'save2', 'save3', 'auto'].reduce(function (a, k) { return a.concat([K[k].body, K[k].info]); }, []);
S.ok('THREE OF THEIR OWN: the three slots and the autosave have eight keys among them, all different', g.RTS_MANUAL_SLOTS.join() === 'save,save2,save3' &&
     all.length === 8 && all.every(function (k, i) { return k && all.indexOf(k) === i; }), all.join(' '));

/* ---------------- the slot in use ---------------- */
S.ok('THE SLOT IN USE: with none chosen it is slot 1', g.window._RTS_SLOT === undefined && g.rtsSlotActive() === 'save', String(g.window._RTS_SLOT));
var ok1 = g.rtsSaveGame(), t1 = Math.round(G.t);
S.ok('...and 💾 writes slot 1, and nothing else', ok1 === true && keys().join() === [K.save.body, K.save.info].sort().join() && tOf('save') === t1, keys().join());
var one = { body: store[K.save.body], info: store[K.save.info] };
g.window._RTS_SLOT = 'save3';
run(5);
var ok3 = g.rtsSaveGame(), t3 = Math.round(G.t);
S.ok('...with slot 3 chosen it writes slot 3, and slot 1 is byte-identical', ok3 === true && g.rtsSlotActive() === 'save3' && tOf('save3') === t3 && t3 > t1 &&
     store[K.save.body] === one.body && store[K.save.info] === one.info && !(K.save2.body in store), JSON.stringify({ t1: t1, t3: t3, keys: keys() }));
run(2);
var ok2 = g.rtsSaveGame('save2'), t2 = Math.round(G.t);
S.ok('...and a slot named outright is written without changing the one in use', ok2 === true && tOf('save2') === t2 && g.rtsSlotActive() === 'save3' &&
     tOf('save3') === t3 && store[K.save.body] === one.body, JSON.stringify({ t2: t2, active: g.rtsSlotActive() }));
S.ok('...a slot not of the player\'s own is never the one in use', (g.window._RTS_SLOT = 'auto', g.rtsSlotActive() === 'save') && (g.window._RTS_SLOT = 'x', g.rtsSlotActive() === 'save'), g.rtsSlotActive());

/* ---------------- save here ---------------- */
run(1);
var okH = g.rtsSlotSave('save2'), tH = Math.round(G.t);
S.ok('SAVE HERE: rtsSlotSave writes the slot and makes it the one in use', okH === true && g.window._RTS_SLOT === 'save2' && g.rtsSlotActive() === 'save2' && tOf('save2') === tH && tH > t2,
     JSON.stringify({ t: tOf('save2'), active: g.rtsSlotActive() }));

/* ---------------- newest ---------------- */
S.ok('NEWEST: the slot written last is the newest, and all three are filled', g.rtsSlotNewest() === 'save2' && g.rtsSlotsFilled().join() === 'save,save2,save3', g.rtsSlotNewest());
when('save', 300); when('save2', 100); when('save3', 200);
S.ok('...by its own clock, not its number', g.rtsSlotNewest() === 'save', g.rtsSlotNewest());
if (store[K.save3.info]) { var i3 = JSON.parse(store[K.save3.info]); i3.v = String(i3.v) + 'x'; store[K.save3.info] = JSON.stringify(i3); }
when('save2', 400);
S.ok('...a slot from an earlier build does not count, filled or newest', g.rtsSlotNewest() === 'save2' && g.rtsSlotsFilled().join() === 'save,save2' && g.rtsSaveStale('save3') === true,
     JSON.stringify({ newest: g.rtsSlotNewest(), filled: g.rtsSlotsFilled() }));

/* ---------------- 📂 ---------------- */
var two = g.rtsLoadClick();
S.ok('📂: with two filled it opens the panel and loads nothing', two === null && opened.join() === 'true' && loads.length === 0, JSON.stringify({ opened: opened, loads: loads }));
delete store[K.save.body]; delete store[K.save.info]; opened = [];
var oneLoad = g.rtsLoadClick();
S.ok('...with one filled, that one, whichever it is, and no panel', oneLoad === true && loads.join() === 'save2' && opened.length === 0, JSON.stringify({ opened: opened, loads: loads }));
delete store[K.save2.body]; delete store[K.save2.info]; loads = [];
g.window._RTS_SLOT = 'save3';
var none = g.rtsLoadClick();
S.ok('...with none filled it tries the slot in use, so the reader can say why there is nothing', none === true && loads.join() === 'save3' && opened.length === 0 && g.rtsSlotNewest() === null,
     JSON.stringify({ loads: loads, newest: g.rtsSlotNewest() }));

require('../lib/report.js')(S);
