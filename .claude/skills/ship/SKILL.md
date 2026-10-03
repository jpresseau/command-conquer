---
name: ship
description: Ship a finished change to main in command-conquer - build, unit tests, the full suite in a copy, commit, push, open a PR, squash-merge it and realign the branch. Use whenever a change is done and verified, without being asked; the owner has confirmed auto-merge.
---

# Ship a change to main

Pages serves `main`, so a change is not done until it is merged. The owner has durably confirmed:
ship every verified change all the way, without asking.

## 1. Check, in this order (stop at the first red)

```bash
cd /home/user/command-conquer
python3 build.py
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js --no-build --quiet unit
```

Read the unit result **before** starting the full run. Twice a full run was started on a red unit
suite and had to be killed, and once the kill missed the runner and two suites ran at once for an
hour (see the `test-suite` skill).

Then the full suite, in a copy, through the `test-suite` skill (`run-full.sh`). About 35 minutes.
Wait for the notification; do not poll with sleep.

A failure that is timing under load (a `TimeoutError`, a screenshot timeout, a reload that did not
navigate) is re-run three at a time with two heavy specs beside it before it is called a flake:

```bash
node test/run.js --no-build --quiet --jobs=3 e2e <the spec> airforce basespace
```

Anything else is a real failure: fix it, then go round again.

## 2. Commit

- `git status --short` first, and add files by name. Never `git add -A`.
- `index.html` is generated: commit it with its `src/` change.
- `test/.last-run.json` is ignored. Leave it.
- The message says what changed and why, with the measurement behind it. It ends with the attribution
  lines from the session's system reminder (`Co-Authored-By: ...` and `Claude-Session: ...`).
- Never put a model name or id in a commit, a PR, code or an artifact.

## 3. Push, PR, merge

```bash
git push -u origin claude/command-conquer-rebuild-54ump3
git rev-parse HEAD            # the 40-character SHA for the merge
```

Use the GitHub MCP tools (load them with ToolSearch `select:mcp__github__create_pull_request,mcp__github__merge_pull_request`).
There is no `gh` CLI.

- `create_pull_request`: owner `jpresseau`, repo `command-conquer`, head `claude/command-conquer-rebuild-54ump3`, base `main`.
  The body has the problem, what changed (one bullet per file or concern), the tests (the new specs, the mutants, the
  full-suite count), and ends with the PR attribution from the system reminder.
- `merge_pull_request`: `merge_method: squash`, `expectedHeadSha: <the full SHA>`, commit title `<PR title> (#<n>)`.

## 4. Realign the branch onto the new main

The clone has no fetch refspec, so name the ref:

```bash
git fetch origin main:refs/remotes/origin/main
git checkout -B claude/command-conquer-rebuild-54ump3 origin/main
git push -u origin claude/command-conquer-rebuild-54ump3 --force-with-lease=claude/command-conquer-rebuild-54ump3:<the SHA you merged>
```

## 5. Tell the owner

Say what shipped in plain words: what a player will notice, the key numbers, and the full-suite count. Name
any flake honestly. Remind them once: **Pages takes about a minute, then press ⟳ in the game.**
