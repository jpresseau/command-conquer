/* Print a suite and set the exit code. Every spec ends with this, so a spec is a file that
   builds a Suite and hands it over - there is no framework and nothing to register with. */

module.exports = function report(S) {
  if (S.notes.length) console.log(S.notes.join('\n'));
  if (S.fails.length) {
    console.log(S.name + ': ' + S.pass + ' passed, ' + S.fails.length + ' FAILED');
    S.fails.forEach(function (f) { console.log('  ✗ ' + f); });
    process.exitCode = 1;
  } else {
    console.log(S.name + ': ' + S.pass + ' assertions passed');
  }
};
