---
name: fix-bug
description: Fix a bug the owner reports in command-conquer, often from a phone screenshot - reproduce it in the harness, write the test that fails on it first, find the root cause rather than the symptom, fix, mutation-test, run the suite and ship. Use for any "X doesn't work", "I can't ...", or a screenshot of something wrong.
---

# Fix a reported bug

The owner plays on a phone and reports in a sentence and a screenshot. Assume nothing in the report
is precise except the symptom. The job is the cause.

## 1. Read the report for facts

- From the screenshot: the device (an iPhone in landscape is about 844×390 at DPR 3), the view (2D
  or 3D), the zoom, the theme and weather, what is selected, and what the HUD says.
- From the sentence: what they tried, and what happened instead. "I can't select X" can mean the
  click misses, the selection is cleared, or X is hidden under Y. Each is a different bug.
- If the report shows two problems ("several on top of each other, so I can't see how many"), fix
  both. Each gets its own test.

## 2. Reproduce it in the harness before reading code for a fix

- Stage the scene in a unit test if the bug is in the simulation. Stage it in a page with real input
  if it is about input, layout or what is drawn.
- Use the `visual-check` skill to see it:
  `shot.js --3d --w=844 --h=390 --dpr=3 --setup=<stage.js>`. Then look at the PNG.
- A reproduction is a **failing assertion**, not a feeling. Write it as the new spec now (the
  `write-test` skill), and watch it fail on the current code.
- If it will not reproduce, change one condition at a time towards the screenshot: phone size, touch
  instead of mouse, 3D, zoom, many units, a long match. Don't fix what you could not see fail.

## 3. Find the root cause

- Ask why the wrong thing happens, then ask why again. In #238 the symptom was "can't select the
  helicopters". The cause was that picks were measured on the ground under an aircraft, which is
  drawn lifted by its altitude. The second cause was that nothing kept aircraft apart, and
  everything shared one pad.
- Grep for every caller of the function you are about to change. A 2D/3D or mouse/touch pair
  usually has two paths, and both are broken.
- `git log -S'<name>' --oneline` and `docs/` explain why the code is as it is. Read them before
  undoing a past decision.

## 4. Fix it

- Fix at the cause, in the shared place, so both paths get it. Keep the 500-line cap; the
  `split-file` skill covers a file that would grow past it.
- Avoid magic numbers in the sim: name them (`RTS_AIR_GAP`) next to the code that reads them.
- Keep the simulation deterministic: the same seed gives the same outcome. Assert it if you touched
  movement.

## 5. Prove it

- The new spec passes. With the fix reverted it fails: write that as a mutant and run it with the
  `mutation-test` skill. Every claim in the spec needs its own mutant.
- Then the unit suite, then the full suite in a copy (the `test-suite` skill).
- Take an after-picture with `visual-check` when the bug was visual, and look at it.

## 6. Ship and report

Use the `ship` skill. Tell the owner in their own terms what they will see now ("tap a helicopter
where you see it; they now hover apart and take turns on a pad"), and remind them about ⟳.
