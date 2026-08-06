/* The smallest assertion library that says something useful when it fails.

   No dependencies and no package manager, matching the rest of the repo. The one rule it
   enforces is that a failure has to name the VALUE, not just the expectation: "expected 3814,
   got 4806" is a bug report, "assertion failed" is a puzzle. */

function Suite(name) {
  this.name = name;
  this.pass = 0;
  this.fails = [];
  this.notes = [];
}

/* The base assertion. `detail` is printed on success too, because a passing test that prints
   its measurement is how a reader checks the test is measuring the right thing at all. */
Suite.prototype.ok = function (what, cond, detail) {
  if (cond) { this.pass++; if (detail) this.notes.push('    ' + what + ': ' + detail); }
  else this.fails.push(what + (detail ? ' — ' + detail : ''));
  return !!cond;
};

Suite.prototype.eq = function (what, got, want) {
  return this.ok(what, Object.is(got, want), 'got ' + fmt(got) +
                 (Object.is(got, want) ? '' : ', expected ' + fmt(want)));
};

Suite.prototype.near = function (what, got, want, tol) {
  var d = Math.abs(got - want);
  return this.ok(what, d <= tol, 'got ' + fmt(got) + ', expected ' + fmt(want) +
                 ' ±' + tol + ' (off by ' + round(d) + ')');
};

Suite.prototype.bytes = function (what, got, want) {
  var same = got && want && got.length === want.length;
  var at = -1;
  if (same) for (var i = 0; i < got.length; i++) if (got[i] !== want[i]) { at = i; break; }
  return this.ok(what, same && at < 0,
    same ? (at < 0 ? got.length + ' bytes' : 'differs at byte ' + at + ': ' + got[at] + ' vs ' + want[at])
         : 'length ' + (got ? got.length : got) + ' vs ' + (want ? want.length : want));
};

/* Free-text observation that is not itself an assertion - the numbers a reader needs to judge
   whether the assertions above are asking for the right thing. */
Suite.prototype.note = function (line) { this.notes.push('    ' + line); };

Suite.prototype.throws = function (what, fn, match) {
  var threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (!threw) return this.ok(what, false, 'did not throw');
  var msg = String(threw && threw.message || threw);
  return this.ok(what, !match || match.test(msg), 'threw "' + msg.slice(0, 90) + '"');
};

function round(v) { return Math.round(v * 1000) / 1000; }
function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v.length > 70 ? v.slice(0, 70) + '…' : v);
  if (typeof v === 'number') return String(round(v));
  if (v && v.length !== undefined && typeof v !== 'function') return '[' + v.length + ' items]';
  return String(v);
}

module.exports = { Suite: Suite };
