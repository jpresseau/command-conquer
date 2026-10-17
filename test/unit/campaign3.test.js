/* THE CAMPAIGN'S FINALE, HEADLESS (rules/campaign2.js `breachwater`): two Dominion armies, both
   left thinking and building, each yard ringed with guns and guarded, and an ally that acts only
   on the player's orders.

     ORDERED        the player's army at the first yard, the ally sent at the second: both fall
                    inside the ten minutes
     ALONE          the player's army alone takes the first yard but not both in time
     IDLE           nothing is done and the clock runs out
   unit/campaign2.test.js has missions five to seven. */

var { Suite } = require('../lib/assert.js');
var { mission, play } = require('../lib/mission.js');

var S = new Suite('campaign3');

function finale(mode) {
  var o = mission('breachwater'), g = o.g, G = o.G;
  var foes = ['enemy', 'enemy2'].map(function (k) { return G.sides[k].ctl; });
  var r = play(o, 610, mode === 'idle' ? null : function (i) {
    if (i % (60 * 12) === 7) { g._rtsQueue('player', 'tank'); g._rtsQueue('player', 'rocket'); }
    var y = g._rtsMTagged(G, 'y1')[0] || g._rtsMTagged(G, 'y2')[0];
    if (y && i % (60 * 20) === 5) g._rtsCampFighters('player').forEach(function (u) { if (!u.target || u.target.dead) g._rtsOrderAttack(u, y); });
    var y2 = g._rtsMTagged(G, 'y2')[0] || g._rtsMTagged(G, 'y1')[0];
    if (mode === 'ordered' && y2 && i % (60 * 100) === 10) g._rtsAllyCommand('attack', y2.x, y2.z);
  });
  return { r: r, foes: foes, ally: G.sides.ally.ctl, y1: g._rtsMTagged(G, 'y1').length, y2: g._rtsMTagged(G, 'y2').length };
}
var od = finale('ordered'), al = finale('alone'), id = finale('idle');
S.ok('Breachwater: both Dominion seats think, the ally waits on orders', od.foes.join() === 'ai,ai' && od.ally === 'none', JSON.stringify(od));
/* with two minutes to spare: without the rings of guns it was won at 593 s, not 362 - the guns
   crowd the Dominion bases and slow them, so they are what leaves a player room */
S.ok('...ordered, both yards fall with two minutes to spare', od.r.over === 'win' && od.r.t < 480 && !od.y1 && !od.y2, JSON.stringify(od));
S.ok('...alone, the first yard falls but not both in time', al.r.over === 'lose' && !al.y1 && al.y2 === 1 && al.r.t >= 600, JSON.stringify(al));
S.ok('...idle, the clock runs out', id.r.over === 'lose' && id.r.t >= 600, JSON.stringify(id));

require('../lib/report.js')(S);
