/* Is this actually installable as a desktop app, and does the button behave?

   Two halves, because they fail differently:

   1. THE MANIFEST AND ITS ASSETS. Chromium's install criteria are concrete: a manifest that
      parses, with name, a start_url in scope, a standalone-ish display, and an icon of at
      least 192px that actually LOADS. A manifest listing an icon that 404s is a manifest that
      passes inspection and refuses to install, so every icon is fetched rather than trusted.

   2. THE BUTTON, which must be THERE whether or not the browser is currently offering an
      install. The first version only appeared on beforeinstallprompt, and that event is
      invisible, unreliable and often never sent - so a missing button and an unavailable
      install were indistinguishable, which is exactly how it got reported. What is asserted
      now is that it exists before any browser event, that clicking it with no prompt in hand
      produces per-browser instructions rather than silence, that the instructions retract
      once a real prompt does arrive, and that it disappears only once the app is installed.
      beforeinstallprompt does not fire in headless Chromium, so it is dispatched by hand -
      a plain Event carrying prompt() and userChoice is the same shape as the real one. */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');

(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var browser = await chromium.launch();
  var page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  var errs = [];
  page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(function () { return typeof rtsInstallInit === 'function'; });
  await page.waitForTimeout(600);

  var r = await page.evaluate(async function () {
    /* ---- the manifest, as the browser resolves it ---- */
    var link = document.querySelector('link[rel=manifest]');
    var mres = await fetch(link.href);
    var mtype = mres.headers.get('content-type') || '';
    var man = await mres.json();
    /* every icon must really load, at the size it claims */
    var icons = [];
    for (var i = 0; i < (man.icons || []).length; i++) {
      var ic = man.icons[i];
      var url = new URL(ic.src, link.href).href;
      var ok = false, real = '';
      try {
        var im = await new Promise(function (res, rej) {
          var x = new Image(); x.onload = function () { res(x); }; x.onerror = rej; x.src = url;
        });
        ok = true; real = im.naturalWidth + 'x' + im.naturalHeight;
      } catch (e) { ok = false; }
      icons.push({ src: ic.src, claims: ic.sizes, loads: ok, real: real });
    }
    /* ---- the service worker: an install criterion, and it must control the page ---- */
    var reg = null;
    try { reg = await navigator.serviceWorker.getRegistration(); } catch (e) {}

    /* ---- the button ---- */
    var btn = document.getElementById('rtsInstall');
    var note = document.getElementById('rtsInstallNote');
    /* The button must be THERE before any browser event - that is the whole fix. Clicking it
       with no prompt available must produce advice, not silence. */
    var beforeAny = btn.hidden;
    btn.click();
    var helpShown = !note.hidden && note.textContent.length > 10;
    var helpText = note.textContent;
    /* Chromium will not fire beforeinstallprompt headlessly, so drive the handler directly.
       A hand-made event with a prompt()/userChoice is exactly the shape the real one has. */
    var promptCalls = 0;
    var ev = new Event('beforeinstallprompt');
    ev.prompt = function () { promptCalls++; };
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
    var noteAfterEvent = note.hidden;          /* advice retracts: one click will do it now */
    btn.click();
    await new Promise(function (r2) { setTimeout(r2, 30); });
    var stillThere = !btn.hidden;              /* the offer does not vanish on use */
    /* second click, prompt spent: must not re-prompt, must fall back to advice */
    btn.click();
    await new Promise(function (r2) { setTimeout(r2, 30); });
    var afterSpentHelp = !note.hidden;
    window.dispatchEvent(new Event('appinstalled'));
    var afterInstalled = btn.hidden;

    return {
      manifest: { type: mtype, name: man.name, display: man.display, start: man.start_url,
                  scope: man.scope, desc: man.description },
      icons: icons, sw: !!reg, swScope: reg ? reg.scope : '',
      btn: { beforeAny: beforeAny, helpShown: helpShown, helpText: helpText,
             noteAfterEvent: noteAfterEvent, stillThere: stillThere,
             afterSpentHelp: afterSpentHelp, afterInstalled: afterInstalled,
             promptCalls: promptCalls, label: btn.textContent.trim().slice(0, 40) }
    };
  });

  console.log('manifest: "' + r.manifest.name + '"  display=' + r.manifest.display +
              '  type=' + r.manifest.type);
  console.log('  description: ' + r.manifest.desc.slice(0, 72) + '…');
  r.icons.forEach(function (i) {
    console.log('  icon ' + i.src + ' claims ' + i.claims + ' -> ' +
                (i.loads ? 'loads at ' + i.real : 'DOES NOT LOAD'));
  });
  console.log('service worker registered: ' + r.sw + '  scope ' + r.swScope);
  var b = r.btn;
  console.log('button present before any browser event: ' + (!b.beforeAny));
  console.log('  clicked with no prompt -> advice shown: ' + b.helpShown);
  console.log('    "' + b.helpText + '"');
  console.log('  advice retracts once the browser offers a prompt: ' + b.noteAfterEvent);
  console.log('  button survives being used: ' + b.stillThere +
              '   spent prompt falls back to advice: ' + b.afterSpentHelp);
  console.log('  gone once installed: ' + b.afterInstalled +
              '   prompt() called ' + b.promptCalls + ' time(s)');

  var fails = [];
  if (!/manifest/.test(r.manifest.type)) fails.push('manifest served as ' + r.manifest.type);
  if (r.manifest.display !== 'standalone') fails.push('display is ' + r.manifest.display);
  if (/Scrap|Redline/.test(r.manifest.desc)) fails.push('the description still uses pre-rename names');
  var big = r.icons.filter(function (i) { return i.loads && parseInt(i.claims) >= 192; });
  if (!big.length) fails.push('no icon of 192px or more actually loads - it will not install');
  r.icons.forEach(function (i) {
    if (!i.loads) fails.push('icon ' + i.src + ' 404s');
    else if (i.real !== i.claims) fails.push('icon ' + i.src + ' claims ' + i.claims + ' but is ' + i.real);
  });
  if (!r.sw) fails.push('no service worker - one install criterion is unmet');
  if (b.beforeAny) fails.push('the button is hidden before any browser event - that was the bug');
  if (!b.helpShown) fails.push('clicking with no prompt available did nothing');
  if (!/Chrome|Edge|Safari|Firefox|Install/.test(b.helpText))
    fails.push('the advice does not name a browser or an action: "' + b.helpText + '"');
  if (!b.noteAfterEvent) fails.push('the advice stayed up after a real prompt became available');
  if (!b.stillThere) fails.push('the button vanished when used');
  if (!b.afterSpentHelp) fails.push('a spent prompt event left the button doing nothing');
  if (!b.afterInstalled) fails.push('the button is still there once installed');
  if (b.promptCalls !== 1) fails.push('prompt() called ' + b.promptCalls + ' times, expected 1');
  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');

  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})();
