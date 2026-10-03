#!/bin/bash
# Stop every test run, ALL of it: the runner, every spec it started, and their browsers.
# Killing only the wrapper (timeout, a subshell) leaves run.js alive and starting new specs -
# that is how two full suites once shared the machine for an hour.
for p in $(pgrep -f "test/run.js"); do pkill -TERM -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done
pkill -f "\.test\.js" 2>/dev/null
pkill -f "/opt/pw-browsers/" 2>/dev/null
sleep 2
LEFT=$(pgrep -af "test/run.js|\.test\.js|/opt/pw-browsers/" | wc -l)
echo "left running: $LEFT"
[ "$LEFT" = 0 ]
