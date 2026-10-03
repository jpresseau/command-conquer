---
name: perf-bench
description: Measure command-conquer's frame cost in a heavy battle - JS time for the simulation and the render, the render's phases, and the GPU's workload as draws and triangles by phase, with an optional CPU profile. Use before and after any performance change, or to find what a slow battle spends its time on.
---

# Benchmark a heavy battle

```bash
cd /home/user/command-conquer && python3 build.py
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node .claude/skills/perf-bench/bench.js \
  --label=before [--frames=40] [--units=60] [--zoom=3] [--profile]
```

It stages two armies of `--units` each (mixed arms, a third of them hurt) plus six aircraft, in rain,
with the whole map revealed, then prints:
- milliseconds per frame for the simulation and for the render's JS, and the render by phase;
- draws and triangles per frame for each phase (shadow pass, world, units, effects, post);
- with `--profile`, the top functions by self time.

## Read it right

- **SwiftShader's time is not a GPU's time.** It renders about one frame in two seconds. The GPU's work
  (draws, triangles) transfers to a real device; its milliseconds do not. In the profile, `readPixels`
  is that wait.
- **The JS milliseconds are real**, and a phone is about 3-4x slower: 15 ms here is about 50 there.
- **Compare like with like:** a run before the change and one after, same arguments, nothing else
  running (check with `ps -eo args | grep -c "[c]hrome"`).

## Where the numbers have led before

| finding | fix |
|---|---|
| the shadow pass redrew every static tree and ridge every frame (1.06M triangles) | kept world shadows: 0.37M |
| units at a phone's zoom were 8.8k triangles each | a middle level of detail: units' share fell from 788k to 414k a frame |
| the battle's start hitched 100-190 ms | model builds budgeted per frame, the rest warmed in idle time |
| sound effects built new nodes per shot | a pre-rendered bank: one buffer source a shot |

On a phone itself, the in-game GFX readout (`ui/gfxstat.js`) is the instrument. Ask the player for a
screenshot of it during a fight.
