---
name: test-suite
description: Run, watch, stop and triage command-conquer's test suite - the unit loop, one e2e spec, the full suite in a copy, re-running failures, and telling a flake from a real failure. Use before shipping, when a spec fails, or when a background test run looks stuck or slow.
---

# The test suite

`test/run.js` runs specs three at a time, longest first (from `test/.last-run.json`). A spec that times
itself carries `@solo` in its opening comment and runs alone at the end. Unknown options are refused.

## The loops

```bash
cd /home/user/command-conquer
N="NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node"
python3 build.py                                   # always first: e2e reads the BUILT index.html
eval $N test/run.js --no-build --quiet unit        # all unit specs, about 25-40 s
eval $N test/run.js --no-build e2e audio           # names are substrings: kind, then names
eval $N test/e2e/airpick.test.js                   # one spec straight, every line printed
eval $N test/run.js --no-build --failed            # what failed last time
eval $N test/run.js --list e2e                     # the order a run would use, with last times
```

`--quiet` prints failures and totals only. Failures are repeated under the totals.

## The full suite: one at a time, in a copy

```bash
bash .claude/skills/test-suite/run-full.sh /tmp/claude-.../scratchpad/sNN.out    # with run_in_background
```

- It refuses to start while another run is alive. That is the point of it.
- It runs in `/tmp/ccall`, a copy, because `run.js` rebuilds the pages: never run a suite in the tree
  you are editing.
- About 35 minutes. Wait for the background notification; never `sleep` to poll.
- Read the result with `sed -n '/^=====/,$p' <out>`.

## Stopping a run

```bash
bash .claude/skills/test-suite/stop.sh
```

It kills the runner, its specs and their browsers, then checks nothing is left. Killing only the
`timeout` wrapper or the subshell leaves `run.js` alive and starting specs. Once that left two full
suites sharing four cores for an hour (load average 21), and the slow one produced false failures.

## Is it a flake?

Signs of load, not of the code: a `TimeoutError` (`page.screenshot`, `waitForNavigation`, a click), a
press read as a hold, a millisecond budget missed. Re-run it beside two heavy specs:

```bash
eval $N test/run.js --no-build --quiet --jobs=3 e2e <spec> airforce basespace
```

- If it passes there, it was load. Name it in the PR and fix the test when it recurs.
- The fix is a wait on a condition, not a longer sleep. A spec that measures time gets `@solo`.
- Known load-sensitive specs: `topbar` (a tap's timing, the reload press), `landscape` (a screenshot of
  the 3D view), `grain` (`@solo`).

## Before you trust a run

- Before starting, `ps -eo args | grep -cE "[t]est/run.js|[c]hrome"` should print 0.
- A red unit suite means fix first: never start the full run on it.
- A count like `172/174` is not a pass: every failure gets a cause before anything ships.
