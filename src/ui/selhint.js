/* ui/selhint.js - what a selected unit is FOR, said where the player is looking.

   THE ORDERS WERE THERE AND NOTHING SAID SO. A Recon Drone circles wherever it is sent, a Mine
   Boat lays on D, a Heavy Bomber carpets what it is sent at - and the only place any of it was
   written was the build tooltip, read once, before the unit existed. Once on the field, the
   readout said "Mine Boat - 380/380 hp" and the DEPLOY button said DEPLOY over a mine, a bridge
   and a Command Yard alike. Three things here, all read off the unit's own rules:

     THE TIP       the first time a match selects a kind of unit with an order of its own, the
                   message line says what to do with it - in the words the device can obey
                   (right-click and keys at a desk; hold, AMOVE and the sidebar's buttons on a
                   phone) - and the readout keeps it as its hover title (_rtsSelTipFrame)
     THE STATE     the readout carries what the order needs to know: mines left, bombs loaded or
                   loading, a run waiting, men aboard, what a drone is shadowing (_rtsUnitStateTxt)
     THE BUTTON    reads what it does: LAY MINE, BRIDGE or DEPLOY (_rtsDeployLabel)

   One tip per verb, keyed by the rule flag that gives the unit the verb (RTS_VERB_TIPS), and
   the unit resolved to its most particular verb (RTS_VERB_ORDER). unit/selhint holds it from
   both ends: every unarmed unit has a verb, every tip names a flag some unit carries, and no
   phone tip names a key or a right button. */

/* most particular first: a Paradrop Plane `carries` too, but its tip is the drop's */
var RTS_VERB_ORDER = ['carpets', 'orbits', 'slings', 'paradrops', 'hover', 'bridge', 'mines', 'sweeps', 'jams', 'spots',
  'heals', 'deploy', 'escorts', 'shallow', 'harvest', 'capture', 'steal', 'demo', 'carries'];

/* d: the unit's rules. desk/touch: the tip, without the unit's name (the caller puts it first). */
var RTS_VERB_TIPS = {
  carpets: { desk: function () { return 'right-click a target to carpet it, or A + right-click the ground to carpet that spot.'; },
             touch: function () { return 'hold on a target to carpet it, or tap AMOVE and hold on the ground to carpet that spot.'; } },
  orbits: { desk: function () { return 'right-click a place and it circles there; right-click a unit and it shadows it.'; },
            touch: function () { return 'hold on a place and it circles there; hold on a unit and it shadows it.'; } },
  slings: { desk: function () { return 'select a vehicle and right-click the crane to hook it on, then right-click where to set it down - or U to drop it here.'; },
            touch: function () { return 'select a vehicle and hold on the crane to hook it on, then hold where to set it down - or tap UNLOAD to drop it here.'; } },
  paradrops: { desk: function () { return 'select infantry and right-click the plane over its Airfield to board, then right-click the drop zone - or U to jump here.'; },
               touch: function () { return 'select infantry and hold on the plane over its Airfield to board, then hold on the drop zone - or tap UNLOAD to jump here.'; } },
  hover: { desk: function () { return 'crosses land and water. Select infantry and right-click it to board; right-click a shore to land them, or U to unload where it stands.'; },
           touch: function () { return 'crosses land and water. Select infantry and hold on it to board; hold on a shore to land them, or tap UNLOAD where it stands.'; } },
  bridge: { desk: function () { return 'drive to the water\'s edge facing the far bank, then D or BRIDGE lays a span up to ' + RTS_LAYBRIDGE_SPAN + ' cells.'; },
            touch: function () { return 'drive to the water\'s edge facing the far bank, then tap BRIDGE to lay a span up to ' + RTS_LAYBRIDGE_SPAN + ' cells.'; } },
  mines: { desk: function (d) { return 'D or LAY MINE puts a mine ' + (d.sea ? 'in the water ' : '') + 'where it stands; ' + (d.sea ? 'its yard' : 'a Repair Bay') + ' restocks it.'; },
           touch: function (d) { return 'tap LAY MINE to put a mine ' + (d.sea ? 'in the water ' : '') + 'where it stands; ' + (d.sea ? 'its yard' : 'a Repair Bay') + ' restocks it.'; } },
  sweeps: { desk: function () { return 'finds enemy mines within ' + RTS_SWEEP.see + ' cells and beats out the ones in reach; left idle, it clears what it found.'; } },
  jams: { desk: function () { return 'parked, it hides your units within ' + RTS_JAM.r + ' cells from enemy eyes and guns until they fire or the enemy comes close.'; } },
  spots: { desk: function () { return 'every gun of yours finds what it sees at full reach, through fog and Jammers.'; } },
  heals: { desk: function (d) {
    var k = d.healKind === 'vehicle' ? 'vehicles' : d.healKind === 'ship' ? 'ships' : 'infantry';
    return 'mends your ' + k + ' near it for free' + (d.healKind ? '; left idle, it goes to a damaged one by itself.' : '.');
  } },
  deploy: { desk: function () { return 'D or DEPLOY sets it down as a Command Yard where it stands.'; },
            touch: function () { return 'tap DEPLOY to set it down as a Command Yard where it stands.'; } },
  escorts: { desk: function () { return 'sails with your nearest ship by itself and keeps aircraft off it; it cannot hit ships or the shore.'; } },
  shallow: { desk: function () { return 'at low tide it can sit on the drying flats, where no other ship can go, and shell the shore.'; } },
  harvest: { desk: function () { return 'right-click scrap to gather it; it takes the load to a Refinery by itself.'; },
             touch: function () { return 'hold on scrap to gather it; it takes the load to a Refinery by itself.'; } },
  capture: { desk: function () { return 'right-click an enemy building to take it over.'; },
             touch: function () { return 'hold on an enemy building to take it over.'; } },
  steal: { desk: function () { return 'right-click an enemy Refinery to steal its credits.'; },
           touch: function () { return 'hold on an enemy Refinery to steal its credits.'; } },
  demo: { desk: function () { return 'right-click an enemy building to blow it up with C4.'; },
          touch: function () { return 'hold on an enemy building to blow it up with C4.'; } },
  carries: { desk: function (d) { return 'select units and right-click it to board' + ((d.sea || d.air) ? '; right-click the ground to put them down there' : '') + ', or U to unload where it stands.'; },
             touch: function (d) { return 'select units and hold on it to board' + ((d.sea || d.air) ? '; hold on the ground to put them down there' : '') + ', or tap UNLOAD where it stands.'; } },
};

/* the verb a unit is selected for, by its rules: the first flag of RTS_VERB_ORDER it carries */
function _rtsVerbOf(d) {
  if (!d) return null;
  for (var i = 0; i < RTS_VERB_ORDER.length; i++) if (d[RTS_VERB_ORDER[i]]) return RTS_VERB_ORDER[i];
  return null;
}
/* The tip for one kind of unit, for this device: "Name: what to do." - or null */
function _rtsVerbTip(d, touch) {
  var v = _rtsVerbOf(d), T = v && RTS_VERB_TIPS[v];
  if (!T) return null;
  var f = (touch && T.touch) || T.desk;
  return d.name + ': ' + f(d);
}
/* The kind of unit a selection is, when it is one kind: the player's units in it, all one def */
function _rtsSelOneKind(sel) {
  var def = null;
  for (var i = 0; i < sel.length; i++) {
    var e = sel[i];
    if (!e || e.dead || e.side !== 'player' || e.type !== 'unit') return null;
    if (def && e.def !== def) return null;
    def = e.def;
  }
  return def;
}

/* Once a frame, from the sidebar: on a NEW selection of one kind with a verb, the readout's
   title becomes the tip, and the first such selection of that kind this match says it on the
   message line - unless something else is being said, so a tip never talks over "Base under
   attack" (it waits for a later selection instead). */
function _rtsSelTipFrame(sel, el) {
  var G = window._rtsG, U = window._rtsUI;
  if (!G || !U) return;
  var key = sel.map(function (e) { return e && e.id; }).join(',');
  if (U.tipSel === key) return;
  U.tipSel = key;
  var def = _rtsSelOneKind(sel), d = def && rtsUnitDef(def);
  var touch = typeof _rtsTouchUI === 'function' && _rtsTouchUI();
  var tip = d ? _rtsVerbTip(d, touch) : null;
  if (el) el.title = tip || '';
  if (!tip) return;
  var seen = G.tipSeen || (G.tipSeen = {});
  if (seen[def] || G.msgT > 1.5) return;
  seen[def] = 1;
  _rtsSay(tip, 7);
}

/* What the readout adds after "Name - hp": the state the unit's order turns on. */
function _rtsUnitStateTxt(e) {
  var d = rtsUnitDef(e.def) || {}, out = '';
  if (d.mines) { var m = _rtsMinesLeft(e); out += ' · ' + m + (m === 1 ? ' mine' : ' mines'); }
  if (d.carpets) {
    out += e.run ? ' · on its run' : e.rearming > 0 ? ' · loading' : e.ammo > 0 ? ' · loaded' : ' · going home to load';
    if (e.bombNext) out += ', next run waiting';
  }
  if (d.orbits) {
    var t = e.orbitOn != null && window._rtsG.byId[e.orbitOn];
    if (t && !t.dead) out += ' · shadowing ' + (rtsUnitDef(t.def) || {}).name;
    else if (e.order === 'orbit') out += ' · circling';
  }
  if (d.carries) { var n = _rtsCargoCount(e); if (n) out += ' · ' + n + ' aboard'; }
  return out;
}

/* The DEPLOY button's word, for what the selection's deployables would do (core/transport.js
   _rtsDeploy): LAY MINE, BRIDGE or DEPLOY - and DEPLOY for a mixture, which is all of them. */
function _rtsDeployLabel(sel) {
  var w = null;
  for (var i = 0; i < sel.length; i++) {
    if (!_rtsCanDeploy(sel[i])) continue;
    var d = rtsUnitDef(sel[i].def), x = d.mines ? 'LAY MINE' : d.bridge ? 'BRIDGE' : 'DEPLOY';
    if (w && w !== x) return 'DEPLOY';
    w = x;
  }
  return w || 'DEPLOY';
}
