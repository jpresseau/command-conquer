/* Build the Battlefield Sound Board from the game's own sound code.

     node .claude/skills/sound-lab/board/build.js <out.html>

   The page is head.html + body.html, then one script with every file of src/audio/ as the game has
   it now, then the OLD effects and the old one-bar loop taken verbatim from the commit before the
   sound upgrade (077fefd, src/rts.audio.js) for the Old buttons, then page.js. So the New buttons
   play exactly what the game plays. Publish the result with the Artifact tool to the same artifact. */

var fs = require('fs'), path = require('path'), cp = require('child_process');
var ROOT = path.resolve(__dirname, '../../../..'), HERE = __dirname;
var out = process.argv[2];
if (!out) { console.error('usage: node build.js <out.html>'); process.exit(2); }
var OLD_AT = '077fefd';      /* the last commit with the old live synth */
var old = cp.execSync('git show ' + OLD_AT + ':src/rts.audio.js', { cwd: ROOT, encoding: 'utf8' }).split('\n');
/* the old helpers (_rtsNoiseSrc .. _rtsWaveShaper), the old _rtsSfxPlay, and the old music, by their markers */
function from(re) { for (var i = 0; i < old.length; i++) if (re.test(old[i])) return i; throw new Error('not found: ' + re); }
var h0 = from(/^function _rtsNoiseSrc/), h1 = from(/^\/\* Only play things the player can actually see/);
var p0 = from(/^function _rtsSfxPlay/), m0 = from(/^\/\* -+ music --/);
var helpers = old.slice(h0, h1).join('\n'), play = old.slice(p0, m0).join('\n'), music = old.slice(m0).join('\n');
var audio = fs.readdirSync(path.join(ROOT, 'src/audio')).filter(function (f) { return f.endsWith('.js'); });
/* in the game's own include order, read from the skeleton */
var skel = fs.readFileSync(path.join(ROOT, 'src/index.skeleton.html'), 'utf8');
audio.sort(function (a, b) { return skel.indexOf('audio/' + a) - skel.indexOf('audio/' + b); });
var src = audio.map(function (f) { return fs.readFileSync(path.join(ROOT, 'src/audio', f), 'utf8'); }).join('\n');
var page = fs.readFileSync(path.join(HERE, 'head.html'), 'utf8') + fs.readFileSync(path.join(HERE, 'body.html'), 'utf8') +
  '<script>\n' + src + '\n/* THE OLD EFFECTS AND THE OLD LOOP, verbatim from ' + OLD_AT + ' */\n' + helpers + '\n' + play + '\n' + music + '\n</script>\n' +
  '<script>\n' + fs.readFileSync(path.join(HERE, 'page.js'), 'utf8') + '</script>\n';
fs.writeFileSync(out, page);
console.log('wrote ' + out + ' (' + (page.length / 1024).toFixed(0) + ' KB, ' + audio.length + ' audio files: ' + audio.join(', ') + ')');
