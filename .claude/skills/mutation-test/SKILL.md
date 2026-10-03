---
name: mutation-test
description: Prove a new or changed test can fail - break the code it guards on purpose, in a throwaway copy, and check the intended assertion goes red. Use after writing any new check, and before shipping a fix with its test.
---

# Mutation-test a check

A check that cannot fail is not a check. This repo has shipped several that passed with the bug still
present, so every new assertion gets a mutant: break the thing it is about and watch **that assertion**
go red.

## Write the mutants

One JSON file, in the scratchpad, with one entry per fault:

```json
[
  { "name": "nofree", "kind": "e2e", "spec": "music",
    "edits": [ { "file": "src/audio/music.js",
                 "old": "    if (RTS_SONGS[M.song].bpm !== song.bpm) Object.keys",
                 "new": "    if (false) Object.keys" } ] },
  { "name": "u_busy", "kind": "unit", "spec": "airspace",
    "edits": [ { "file": "src/core/move.js",
                 "old": "  if (dp <= RTS_TILE * 1.4 && !busy) {",
                 "new": "  if (dp <= RTS_TILE * 1.4) {" } ] }
]
```

- `old` must appear **exactly once** in the file. Copy it from the source, indentation included.
- Aim each mutant at one assertion: delete a guard, flip a sign, drop a call, keep a constant.
- Several edits in one mutant are applied together.

## Run them

```bash
cd /home/user/command-conquer && python3 build.py
/opt/node22/bin/node .claude/skills/mutation-test/mutate.js /path/to/mutants.json --jobs=3
```

Each mutant runs in its own copy (`/tmp/mut_<name>`), deleted afterwards. Your working tree is never
touched, so there is nothing to revert. e2e mutants rebuild their copy first.

## Read the verdicts

| verdict | meaning | do |
|---|---|---|
| `KILLED` | its spec failed; the red lines are printed | confirm they are the assertions you aimed at |
| `SURVIVED` | everything passed | the check is blind to this fault: strengthen it, then run again |
| `CRASHED` | the spec died without a red assertion | make it fail on an assertion (guard the step that throws) |
| `NOT APPLIED` | `old` matched 0 or 2+ times | fix the text; the mutant proved nothing |

Things a survivor has taught here:
- A test whose setup made the fault unreachable: three helicopters approaching a pad from one side
  never tested the queue.
- A check that read the state after something else had already fixed it: the music stop was measured
  after the output had been unplugged.
- A cache warmed by an earlier step: the next song's samples were already rendered.

## Report

Say in the PR how many mutants ran and that each went red on its own assertion, for example
"14 mutants, each red on its own assertion". Name any survivor you accepted and why.
