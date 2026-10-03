---
name: split-file
description: Split a command-conquer source, spec or doc that is at or over the 500-line cap - find the files near the cap, cut at a seam (its own banner comments), add the include to the skeleton, prove the built page is byte-identical, and move shared test helpers to test/lib. Use when unit/layout fails on the cap, when an edit would push a file past it, or for house cleaning.
---

# Split a file at a seam

`unit/layout` caps every file under `src/`, `ra/`, `docs/` and every test spec at **500 lines**.
It counts the trailing newline as a line, so a file that `wc -l` reads as 500 is over. CSS is
exempt, and `CLAUDE.md` has its own cap of 400.

## Which files

```bash
cd /home/user/command-conquer
bash .claude/skills/split-file/cap.sh        # the 15 nearest the cap, OVER / near marked
```

A file at 495 or more will fail on the next edit. Split it before adding to it, not after the
layout spec goes red.

## Where to cut

- At a **seam**: the file's own banner comments (`/* ---- THE PAD ---- */`), one concern per file.
  Never cut at a line number, and never shorten comments to fit; a load-bearing comment moves with
  its code.
- Name the new file for what it holds, in the same directory: `core/airspace.js`, not
  `core/move2.js`.
- Each file is declarations only and nothing runs at load, so the order of includes is for reading,
  not for correctness. Put the new file next to the one it came from.
- Every file is concatenated into one global scope. `build.py` stops on a duplicate top-level name,
  so a helper both halves need lives in exactly one of them.

## Do it

```bash
bash .claude/skills/split-file/same-page.sh save     # build, keep the page as it is
# move the code into src/<dir>/<new>.js, and add its include to src/index.skeleton.html:
#   <script>//@@INC:<dir>/<new>.js@@</script>        directly after the file it came from
bash .claude/skills/split-file/same-page.sh check    # build again: SAME, or the diff to account for
```

- If the moved block was the end of the old file, the page is byte-identical apart from the stamp.
  Otherwise the order changes; read `/tmp/split-diff.txt` and confirm that it only moved.
- `unit/layout` fails an orphan (a file in `src/` the skeleton does not include), a missing include,
  and a file included twice.
- Unit specs `load(['src/<dir>'])` whole directories in skeleton order, so a new file in a directory
  is picked up with no spec edits. A spec that loads a single file by path needs the new path too.
  Grep `test/` for the old file's name.
- Run `git checkout index.html` after `same-page.sh` if you are not committing a build. The stamp
  changes it.

## Specs and docs

- A spec splits **by claim**, into two specs with names a reader can find (`navair` and `navsea`,
  `r3d` and `r3dsprites`). Each half stands alone, with its own browser and its own report.
- Code both halves need moves to `test/lib/<name>.js` (`test/lib/sea.js` is the example) and is
  `require`d. Never copy it into both.
- Add the new spec to `test/README.md`'s table.
- A doc in `docs/` splits by topic, and every doc stays linked from `CLAUDE.md` (`unit/layout`
  checks both ways).

## Prove it

```bash
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js --no-build --quiet unit
```

`layout` must pass, and so must every spec that loads the directory. A split of e2e specs runs both
halves. Then ship it with the `ship` skill. The commit message says what moved where, with the line
counts.
