#!/bin/bash
# Stop every test run, ALL of it: the runner, every spec it started, and their browsers.
# Killing only the wrapper (timeout, a subshell) leaves run.js alive and starting new specs -
# that is how two full suites once shared the machine for an hour.
# Matched by process name, never by a plain pgrep -f: the shell that runs this script carries
# the same words in its own command line, and would be killed or counted with the rest.
runners() { ps -eo pid=,comm=,args= | awk '$2=="node" && /test\/run\.js/ {print $1}'; }
specs()   { ps -eo pid=,comm=,args= | awk '$2=="node" && /\.test\.js/ {print $1}'; }
browsers(){ ps -eo pid=,comm=,args= | awk '$2!~/^(bash|sh|awk|timeout)$/ && /\/opt\/pw-browsers\// {print $1}'; }
for p in $(runners); do pkill -TERM -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done
for p in $(specs) $(browsers); do kill "$p" 2>/dev/null; done
sleep 2
LEFT=$( { runners; specs; browsers; } | wc -l)
echo "left running: $LEFT"
[ "$LEFT" = 0 ]
