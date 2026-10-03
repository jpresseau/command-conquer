#!/bin/bash
# A split should move code, not change it. Build before and after and compare the pages with the
# build stamp masked out.
#   bash .claude/skills/split-file/same-page.sh save     before the split: build, keep the page
#   bash .claude/skills/split-file/same-page.sh check    after it: build again, compare
# A pure move of whole declarations into a new file, included where the old text was, is
# byte-identical. If you reorder or reword anything, check says how many lines differ, and you
# read the diff and account for every line.
cd "$(dirname "$0")/../../.." || exit 1
KEEP=/tmp/split-before.html
mask() { sed -E 's/[0-9a-f]{7,} · [0-9]{4}-[0-9]{2}-[0-9]{2}/STAMP/g; s/[0-9]{4}-[0-9]{2}-[0-9]{2}/DAY/g' "$1"; }
python3 build.py >/dev/null || { echo "build failed"; exit 1; }
case "$1" in
  save)  cp index.html "$KEEP"; echo "saved the page as it is now ($(wc -c < index.html) bytes)";;
  check) [ -f "$KEEP" ] || { echo "run save first"; exit 1; }
         if diff <(mask "$KEEP") <(mask index.html) >/tmp/split-diff.txt; then echo "SAME: the built page is unchanged apart from the stamp"
         else echo "DIFFERENT: $(grep -c '^[<>]' /tmp/split-diff.txt) lines - see /tmp/split-diff.txt"; exit 1; fi;;
  *) echo "usage: same-page.sh save|check"; exit 2;;
esac
