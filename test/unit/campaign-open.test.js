/* WHICH MISSIONS ARE OPEN (campaign.js rtsCampOpen), and the story between them (rules `after`):

     IN ORDER     a new player has the first mission and no other; each win opens the next
     STAYS OPEN   a mission once won stays open, and so does the one after it, whatever came
                  before (a record kept from before the campaign was locked)
     THE STORY    every mission has its own line of story for its win card, a sentence or two */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('campaign-open');
var g = loadFast(['src/rules', 'src/core', 'src/campaign.js']);
var C = g.RTS_CAMPAIGN, n = C.length;
function open(done) { var out = []; for (var i = 0; i < n; i++) out.push(g.rtsCampOpen(i, done) ? 1 : 0); return out.join(''); }
function won(ids) { var d = {}; ids.forEach(function (id) { d[id] = { won: true, secs: 300 }; }); return d; }

S.ok('there are missions to open', n >= 8, String(n));
S.eq('IN ORDER: a new player has the first mission and no other', open({}), '1' + '0'.repeat(n - 1));
S.eq('...winning the first opens the second', open(won([C[0].id])), '11' + '0'.repeat(n - 2));
S.eq('...a mission played and lost opens nothing', open({ lowwater: { won: false, secs: 90 } }), '1' + '0'.repeat(n - 1));
S.eq('...and all won, all open', open(won(C.map(function (m) { return m.id; }))), '1'.repeat(n));
S.eq('STAYS OPEN: one won out of order stays open, and opens the one after it', open(won([C[4].id])), '1000110' + '0'.repeat(n - 7));
S.ok('...and past the last there is nothing', !g.rtsCampOpen(n, won(C.map(function (m) { return m.id; }))), '');

var lines = C.map(function (m) { return m.after || ''; });
S.ok('THE STORY: every mission has its own line for its win card, a sentence or two', lines.every(function (t) { return t.length >= 60 && t.length <= 200; }) &&
     new Set(lines).size === n, lines.map(function (t) { return t.length; }).join(' '));

require('../lib/report.js')(S);
