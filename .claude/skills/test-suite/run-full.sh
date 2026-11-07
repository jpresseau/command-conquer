#!/bin/bash
# The full suite, in a copy of the tree, one run at a time.
#   run-full.sh [out-file]      (start it with the Bash tool's run_in_background)
# The copy is because run.js rebuilds the pages it tests: a suite running in the working tree
# would test whatever the next edit left half-built.
OUT=${1:-/tmp/suite.out}
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
# node processes only: the shell that started this script has "test/run.js" in its own command
# line, and a plain pgrep -f refused every run on that.
RUNS=$(ps -eo pid=,comm=,args= | awk '$2=="node" && /test\/run\.js|\.test\.js/')
if [ -n "$RUNS" ]; then
  echo "REFUSED: a test run is already going - run stop.sh first, or wait for it" | tee "$OUT"
  echo "$RUNS" | tee -a "$OUT"
  exit 1
fi
rm -rf /tmp/ccall && cp -r "$REPO" /tmp/ccall && cd /tmp/ccall || exit 1
NODE_PATH=/opt/node22/lib/node_modules timeout 9000 /opt/node22/bin/node test/run.js --quiet > "$OUT" 2>&1
CODE=$?
# The times this run took, back to the tree the next copy is made from: run.js starts the longest
# specs first from them, and left in the copy they went with it, so most specs ran in name order.
cp test/.last-run.json "$REPO/test/.last-run.json" 2>/dev/null
echo "EXIT $CODE" >> "$OUT"
