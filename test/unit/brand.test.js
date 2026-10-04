/* THE GAME IS BREACHWATER, AND SAYS NOTHING ELSE (src/, index.skeleton.html, manifest, sw.js).

   It grew out of a rebuild of Red Alert and is its own game now: its own name, its own two
   armies (the Meridian Compact and the Basalt Dominion) and its own names for every unit,
   building and superweapon. The old names were in fifty places a player reads - the title,
   the top bar, the army picker, tooltips, superweapon hints, the message line - and a rename by
   hand leaves one behind. So this asks the source itself.

     EVERY STRING IN THE CODE   every string literal in src/, comments stripped (they keep the
                                history of the port, and no player reads them), is clean of the
                                old game's name, its armies and its units
     THE PAGE                   the title, the heading and every word of the page's own text,
                                the manifest, and the service worker's banner
     THE ROSTER                 every unit, structure and superweapon name and description,
                                and both army names, read from the tables themselves */

var fs = require('fs');
var path = require('path');
var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('brand');
var ROOT = path.join(__dirname, '..', '..');

/* Case-sensitive for the armies: their KEYS are still 'allied' and 'soviet' in code (saves and
   localStorage hold them), and a key is not a word a player reads. */
var OLD = [/Red Alert/i, /Command (&|&amp;|and) Conquer/i, /Westwood/, /\b(Soviets?|SOVIETS?)\b/, /\b(Allied|ALLIED)\b/,
           /\b(Allies|ALLIES)\b/, /\bTesla\b/, /\bMammoth\b/, /\bMiGs?\b/, /\bYaks?\b/, /\bV2 Rocket/,
           /\bChrono(sphere|shift)/, /Iron Curtain/, /\bGPS\b/, /\bTanya\b/, /\bChinooks?\b/,
           /Atom Bomb/, /War Factory/, /Radar Dome/, /Tech Center/, /Service Depot/];
function dirty(text) { return OLD.filter(function (re) { return re.test(text); }).map(String); }

/* The string literals of a JS file, with its comments skipped. A small scanner rather than a
   regex over the text, because a quote inside a comment ("the Allies' Pillbox") would
   otherwise open a string that swallows the code after it. */
function strings(src) {
  var out = [], i = 0, n = src.length;
  while (i < n) {
    var c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { var e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      var j = i + 1, buf = '';
      while (j < n && src[j] !== c) { if (src[j] === '\\') { buf += src[j + 1]; j += 2; continue; } buf += src[j++]; }
      out.push(buf); i = j + 1; continue;
    }
    i++;
  }
  return out;
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce(function (a, f) {
    var p = path.join(dir, f.name);
    return a.concat(f.isDirectory() ? walk(p) : /\.js$/.test(f.name) ? [p] : []);
  }, []);
}

/* ---------------- every string in the code ---------------- */
var files = walk(path.join(ROOT, 'src')), found = [], scanned = 0;
files.forEach(function (f) {
  strings(fs.readFileSync(f, 'utf8')).forEach(function (s) {
    scanned++;
    var bad = dirty(s);
    if (bad.length) found.push(path.relative(ROOT, f) + ': "' + s.slice(0, 70) + '"');
  });
});
/* the population: the scanner really reads strings, and reads the ones that matter */
var ui = strings(fs.readFileSync(path.join(ROOT, 'src/title.js'), 'utf8')).join(' | ');
S.ok('the scan reads the code\'s strings - thousands of them, the title screen\'s among them',
     scanned > 3000 && /START BATTLE|COMPACT/.test(ui), scanned + ' strings in ' + files.length + ' files');
S.ok('no string a player can be shown names the old game, its armies or its units', !found.length,
     found.slice(0, 8).join(' || ') || 'clean');

/* ---------------- the page ---------------- */
var page = fs.readFileSync(path.join(ROOT, 'src/index.skeleton.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
S.ok('the page is titled Breachwater', /<title>Breachwater<\/title>/.test(page), (page.match(/<title>.*<\/title>/) || [''])[0]);
S.ok('...and says so in its heading', /<h1>BREACHWATER<\/h1>/.test(page), (page.match(/<h1>.*<\/h1>/) || [''])[0]);
S.ok('...and nowhere in its text says anything else', !dirty(page).length, dirty(page).join(', ') || 'clean');
var man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
S.ok('the installed app is called Breachwater', man.name === 'Breachwater' && man.short_name === 'Breachwater',
     man.name + ' / ' + man.short_name);
S.ok('...and its description is clean', !dirty(man.description).length, man.description);
['sw.js', 'icon.svg'].forEach(function (f) {
  var t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  S.ok(f + ' carries the new name and not the old', /Breachwater/.test(t) && !dirty(t).length, dirty(t).join(', ') || 'clean');
});

/* ---------------- the roster, from the tables ---------------- */
var g = load(['src/rules']);
var texts = [];
g.RTS_UNITS.forEach(function (u) { texts.push(u.key + ': ' + u.name + ' / ' + u.desc); });
g.RTS_STRUCTS.forEach(function (s) {
  texts.push(s.key + ': ' + s.name + ' / ' + s.desc);
  if (s.super) texts.push(s.key + ' super: ' + s.super.name + ' / ' + s.super.hint);
});
S.ok('the tables are read: every unit and structure', texts.length >= g.RTS_UNITS.length + g.RTS_STRUCTS.length && g.RTS_UNITS.length > 20,
     g.RTS_UNITS.length + ' units, ' + g.RTS_STRUCTS.length + ' structures');
var badRoster = texts.filter(function (t) { return dirty(t).length; });
S.ok('no unit, building or superweapon carries an old name', !badRoster.length, badRoster.slice(0, 6).join(' || ') || 'clean');
S.eq('the two armies have names of their own', [g.rtsArmyTitle('allied'), g.rtsArmyTitle('soviet')].join(' / '),
     'Meridian Compact / Basalt Dominion');

require('../lib/report.js')(S);
