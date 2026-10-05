/* WHAT A UNIT IS FOR, SAID ON THE FIELD (ui/selhint.js):

     EVERY VERB     every unarmed unit resolves to a verb with a tip, at a desk and on a phone, and
                    so does every new armed specialist; every tip names a flag some unit carries,
                    and every verb in the order has a tip
     IN ITS WORDS   no phone tip names a key, a click or a right button; every key a desk tip names
                    is one the keyboard handles (ui/keys.js)
     ONCE           the first selection of a kind says its tip on the message line and keeps it as
                    the readout's title; a second selection of that kind says nothing; a tank or a
                    mixed selection says nothing; a tip waits rather than talk over a fresh message;
                    on a phone it is said in a phone's words
     THE STATE      the readout carries mines left, a bomber loaded / loading / going home / on its
                    run / a run waiting, a drone circling or shadowing, men aboard
     THE BUTTON     reads LAY MINE for a Mine Layer or a Mine Boat, BRIDGE for the Bridge Layer,
                    DEPLOY for the Mobile Yard and for a mixture */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');
var fs = require('fs'), path = require('path');

var S = new Suite('selhint');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js', 'src/ui']);
var ROOT = path.join(__dirname, '..', '..');

function fresh() {
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  g.window._rtsUI = { place: null, mode: null, attackMove: false, keys: {} };
  return G;
}
function spawn(key, side) {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, (g.rtsUnitDef(key) || {}).sea ? 'sea' : null);
  return g._rtsSpawnUnit(side || 'player', key, g._rtsWX(c[0]), g._rtsWX(c[1]));
}
var desk = function () { return false; }, phone = function () { return true; };

/* ---------------- every verb ---------------- */
var unarmed = g.RTS_UNITS.filter(function (d) { return !d.weapon; });
var noTip = unarmed.filter(function (d) { return !g._rtsVerbTip(d, false) || !g._rtsVerbTip(d, true); });
S.ok('every unarmed unit has a verb, and a tip for a desk and for a phone', unarmed.length >= 15 && !noTip.length,
     unarmed.length + ' unarmed' + (noTip.length ? '; without a tip: ' + noTip.map(function (d) { return d.key; }).join(', ') : ''));
var specialists = ['bomber', 'spotter', 'hovercraft', 'flakship', 'monitor', 'apc'];
var noSp = specialists.filter(function (k) { return !g._rtsVerbTip(g.rtsUnitDef(k), false); });
S.ok('...and so does every armed unit with an order of its own: the bomber, the Spotter, the Hovercraft, the Flak Cruiser, the Monitor, the APC', !noSp.length, noSp.join(', ') || 'all six');
var keys = Object.keys(g.RTS_VERB_TIPS);
var dead = keys.filter(function (k) { return !g.RTS_UNITS.some(function (d) { return d[k]; }); });
var untipped = g.RTS_VERB_ORDER.filter(function (k) { return !g.RTS_VERB_TIPS[k]; });
var unordered = keys.filter(function (k) { return g.RTS_VERB_ORDER.indexOf(k) < 0; });
S.ok('every tip names a flag some unit carries, and every verb in the order has its tip', keys.length >= 15 && !dead.length && !untipped.length && !unordered.length,
     keys.length + ' tips' + (dead.length ? '; no unit carries ' + dead.join(', ') : '') + (untipped.length ? '; no tip for ' + untipped.join(', ') : '') + (unordered.length ? '; not in the order: ' + unordered.join(', ') : ''));

/* ...and a unit with more than one flag is selected for its most particular verb: the Paradrop
   Plane and the Sky Crane carry, the Hovercraft carries, the drone spots - each tip is its own */
var own = { paraplane: /drop zone/, skycrane: /hook it on/, hovercraft: /crosses land and water/, drone: /circles there/, repairtruck: /mends your vehicles/, tender: /mends your ships/, mineboat: /in the water/ };
var wrong = Object.keys(own).filter(function (k) { return !own[k].test(g._rtsVerbTip(g.rtsUnitDef(k), false) || ''); });
S.ok('a unit with more than one flag is told its own verb: the plane its drop, the crane its sling, the drone its circle, the tender its ships', !wrong.length,
     wrong.map(function (k) { return k + ': ' + g._rtsVerbTip(g.rtsUnitDef(k), false); }).join(' | ') || Object.keys(own).length + ' checked');

/* ---------------- in its words ---------------- */
var phoneBad = [], deskKeys = {};
g.RTS_UNITS.forEach(function (d) {
  var t = g._rtsVerbTip(d, true), k = g._rtsVerbTip(d, false);
  if (t && /click|(^|[\s(])[A-Z](?= (or|\+|to) )/.test(t.replace(/^[^:]*:/, ''))) phoneBad.push(d.key + ': ' + t);
  ((k || '').replace(/^[^:]*:/, '').match(/(?:^|[\s(])([A-Z])(?= (?:or|\+|to) )/g) || []).forEach(function (m) { deskKeys[m.trim()] = 1; });
});
S.ok('no phone tip names a key, a click or a right button', !phoneBad.length, phoneBad.join(' | ') || 'none');
var keysSrc = fs.readFileSync(path.join(ROOT, 'src/ui/keys.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
var handled = {};
(keysSrc.match(/k === '([a-z])'/g) || []).forEach(function (m) { handled[m.slice(-2, -1).toUpperCase()] = 1; });
var named = Object.keys(deskKeys), missing = named.filter(function (k) { return !handled[k]; });
S.ok('every key a desk tip names is one the keyboard handles - D, U and A among them', named.length >= 3 && ['D', 'U', 'A'].every(function (k) { return deskKeys[k]; }) && !missing.length,
     'named ' + named.join(',') + '; handled ' + Object.keys(handled).join(',') + (missing.length ? '; not handled: ' + missing.join(',') : ''));

/* ---------------- once ---------------- */
var G = fresh(), U = g.window._rtsUI, el = { title: '' };
g._rtsTouchUI = desk;
var ml = spawn('minelayer'), ml2 = spawn('minelayer'), tk = spawn('tank'), dr = spawn('drone');
var tipML = g._rtsVerbTip(g.rtsUnitDef('minelayer'), false);
G.msg = ''; G.msgT = 0;
g._rtsSelTipFrame([ml], el);
var said1 = G.msg, title1 = el.title;
G.msg = ''; G.msgT = 0;
g._rtsSelTipFrame([ml2], el);
var said2 = G.msg, title2 = el.title;
g._rtsSelTipFrame([tk], el); var titleTank = el.title;
g._rtsSelTipFrame([ml, tk], el); var titleMixed = el.title;
g._rtsSelTipFrame([tk, ml2], el); var titleMixed2 = el.title;
S.ok('the first Mine Layer selected says its tip on the message line, and the readout keeps it as its title', said1 === tipML && title1 === tipML && /D or LAY MINE/.test(tipML), JSON.stringify(said1));
S.ok('...a second Mine Layer says nothing, and still keeps it as the title', said2 === '' && title2 === tipML, JSON.stringify(said2));
S.ok('...a tank says nothing and has no title, and nor has a Mine Layer with a tank, in either order', titleTank === '' && titleMixed === '' && titleMixed2 === '' && G.msg === '', JSON.stringify([titleTank, titleMixed, titleMixed2, G.msg]));
g._rtsSay('Base under attack!');
g._rtsSelTipFrame([dr], el);
var over = G.msg;
G.msgT = 0;
g._rtsSelTipFrame([], el); g._rtsSelTipFrame([dr], el);
S.ok('...a tip does not talk over a fresh message: the drone\'s waits for its next selection', over === 'Base under attack!' && G.msg === g._rtsVerbTip(g.rtsUnitDef('drone'), false),
     JSON.stringify([over, G.msg]));
G.tipSeen = {}; U.tipSel = null; G.msgT = 0;
g._rtsTouchUI = phone;
g._rtsSelTipFrame([ml], el);
S.ok('...and on a phone it is said in a phone\'s words', /tap LAY MINE/.test(G.msg) && !/D or/.test(G.msg), JSON.stringify(G.msg));
g._rtsTouchUI = desk;

/* ---------------- the state ---------------- */
var st = function (e) { return g._rtsUnitStateTxt(e); };
ml.mines = 3; var s3 = st(ml); ml.mines = 1; var s1 = st(ml);
S.ok('the readout carries a layer\'s mines left', s3 === ' · 3 mines' && s1 === ' · 1 mine', JSON.stringify([s3, s1]));
var bm = spawn('bomber');
bm.ammo = 1; bm.rearming = 0; var sLoaded = st(bm);
bm.rearming = 5; var sLoading = st(bm);
bm.rearming = 0; bm.ammo = 0; var sHome = st(bm);
bm.ammo = 1; bm.run = { k: 2 }; var sRun = st(bm);
bm.run = null; bm.ammo = 0; bm.bombNext = { x: 1, z: 1 }; var sWait = st(bm);
S.ok('...a bomber loaded, loading, going home to load, on its run, and with a run waiting',
     sLoaded === ' · loaded' && sLoading === ' · loading' && sHome === ' · going home to load' && sRun === ' · on its run' && sWait === ' · going home to load, next run waiting',
     JSON.stringify([sLoaded, sLoading, sHome, sRun, sWait]));
dr.order = 'orbit'; var sCirc = st(dr);
dr.orbitOn = tk.id; var sShadow = st(dr);
S.ok('...a drone circling, and shadowing what it shadows', sCirc === ' · circling' && sShadow === ' · shadowing ' + g.rtsUnitDef('tank').name, JSON.stringify([sCirc, sShadow]));
var apc = spawn('apc'), rf = spawn('rifle');
var sEmpty = st(apc); g._rtsBoard(rf, apc); var sOne = st(apc);
S.ok('...and men aboard - nothing said of an empty hold', sEmpty === '' && sOne === ' · 1 aboard', JSON.stringify([sEmpty, sOne]));

/* ---------------- the button ---------------- */
var lab = function (keys) { return g._rtsDeployLabel(keys.map(function (k) { return spawn(k); })); };
var L = { ml: lab(['minelayer']), mb: lab(['mineboat']), bl: lab(['bridgelayer']), mcv: lab(['mcv']), mix: lab(['minelayer', 'mcv']), two: lab(['minelayer', 'minelayer', 'tank']) };
S.ok('the button reads LAY MINE for a Mine Layer or a Mine Boat, BRIDGE for the Bridge Layer, DEPLOY for the Mobile Yard and for a mixture',
     L.ml === 'LAY MINE' && L.mb === 'LAY MINE' && L.bl === 'BRIDGE' && L.mcv === 'DEPLOY' && L.mix === 'DEPLOY' && L.two === 'LAY MINE', JSON.stringify(L));

require('../lib/report.js')(S);
