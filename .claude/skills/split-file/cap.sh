#!/bin/bash
# The files nearest the 500-line cap that unit/layout enforces (src/, ra/, docs/, test/ specs).
#   bash .claude/skills/split-file/cap.sh          the 15 closest
#   bash .claude/skills/split-file/cap.sh 40       the 40 closest
# The cap counts a trailing newline as a line, so a file wc reads as 500 is over it.
cd "$(dirname "$0")/../../.." || exit 1
find src ra docs test -type f \( -name '*.js' -o -name '*.md' -o -name '*.html' \) 2>/dev/null |
  grep -v '^test/\.' | xargs wc -l | grep -v ' total$' | sort -rn | head -"${1:-15}" |
  awk '{ n = $1 + 1; flag = n > 500 ? "  OVER" : (n > 470 ? "  near" : ""); printf "%5d  %s%s\n", n, $2, flag }'
