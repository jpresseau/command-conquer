---
name: sound-lab
description: Work on command-conquer's sound - effects, music, ambience loops and the mix. Render and measure a sound offline by number (loudness as heard, spectrum, takes), write WAVs, retune a recipe's vol to its heard target, and rebuild and republish the Battlefield Sound Board artifact so the owner can listen old against new. Use for any change under src/audio/, rts.audio.js, rts.ambience.js or the sound panel.
---

# The sound lab

Nobody in this container can listen. Every claim about a sound is a number about its samples, and
the owner listens on the Sound Board. Both come from the game's own code, so they cannot drift from
what the game plays.

## Where the sound lives

| file | what |
|---|---|
| `src/audio/dsp.js` | the tools: noise, filters, modal (struck) bodies, tones and glides, crackle, the room, `_dspNorm`, `_dspRelease`, `_dspLoop` |
| `src/audio/recipes.js`, `recipes2.js` | one recipe per effect: `{cat, len, takes, peak, heard, vol, fn(sr, rng)}`. `rtsSfxNames()`, `_rtsSfxRender(name, take, sr)` |
| `src/audio/bank.js` | renders every take in idle slices, every effect's first take before any second |
| `src/audio/mix.js` | play, pan by the pixel, the voice cap, the compressor and the limiter |
| `src/audio/score.js`, `instruments.js`, `music.js` | two songs, three intensities, the heat that drives them |
| `src/audio/loops.js` | `RTS_LOOPS` and `_rtsLoopRender(name, sr)`: the world's bed and one engine per hull |
| `src/rts.audio.js` | the buses: `RTS_BUS_BASE` (sfx 0.6, mus 0.28, amb 0.7), `rtsVolSet`, `_rtsVol`, mute |
| `src/rts.ambience.js` | what turns the loops: weather, the hulls in view, birds by daylight |
| `src/ui/soundpanel.js` | the 🔊 panel and its sliders |

## Measure it

```bash
cd /home/user/command-conquer
node .claude/skills/sound-lab/analyse.js                  # every effect
node .claude/skills/sound-lab/analyse.js rifle cannon     # some (substrings)
node .claude/skills/sound-lab/analyse.js --loops          # the ambience loops
node .claude/skills/sound-lab/analyse.js boom --wav=<scratchpad>/wav   # and WAVs of every take
```

- **heard** is dB(A) of the loudest 400 ms with `vol` applied. `unit/sfx` fails any effect more than
  2 dB off its `heard`, marked `!` here. After you change a recipe's sound, set `vol` to **vol fit**.
- **spread** is the dB between the loudest and quietest take. `unit/sfx` wants takes that differ in
  sound but not in level.
- **cen Hz** is the spectral centroid as heard. A cannon sits below a rifle and a collapse below a
  shell landing; `unit/sfx` holds that order.
- **flatness** is measured from 60 Hz to 12 kHz, so a low, dark noise like the wind reads near 0. It
  is only meaningful between sounds that share a band.
- **ms** is the time to render one take. The bank renders in 6 ms idle slices, so a recipe of
  hundreds of ms delays its first play. Keep new recipes near what is there.

The building blocks are in `test/lib/sound.js`: `spectrum`, `bands(x, sr, edges, heard)`, `centroid`,
`flatness`, `peak`, `rms(x, a, b)`, `corr`, `aWeight`. Load the audio in a sandbox with
`load(['src/audio'])` from `test/lib/sandbox.js`.

## The specs that hold it

- `unit/sfx`: every take finite, at its peak, centred and at rest; heard level; character.
- `unit/music`: every bar in key, the layers each intensity adds, the band in tune to 10 cents.
- `unit/worldsound`: loops seamless, wide, and turned on by the right things.
- `e2e/sfxmix`, `e2e/music` and `e2e/soundpanel` hear it in the page.

```bash
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js --no-build --quiet unit sfx music worldsound
```

## The Sound Board (for the owner's ears)

https://claude.ai/artifact/2fxBNzJrYkRFJRNY3Mv8dL has 33 strips of Old against New, the music at
each intensity, and the 13 loops. The old sound is taken verbatim from commit `077fefd`.

```bash
node .claude/skills/sound-lab/board/build.js <scratchpad>/soundboard.html
```

- In a new conversation, first `Artifact` `action: "read"` the URL. A publish to an artifact the
  conversation has not read is refused.
- Then publish the file with that `url` so the link stays the same. Don't create a new one.
- `board/page.js` is the page's own code: strips, the soft clip (0.45 ceiling), the loop toggles.
  `head.html` and `body.html` are its markup.
- A new effect or loop appears on the board automatically, because the strips are derived from
  `rtsSfxNames()` and `RTS_LOOPS`.

## Traps

- `heard` is the target and `vol` is the gain that meets it. Change both only when the effect
  **should** be louder or quieter; otherwise change `vol` alone.
- The sum of many effects is the mix's job: the voice cap, the compressor and the limiter. Don't
  turn one effect down to cure a pile-up.
- A loop's tone must be a whole number of cycles over its length, or the seam is heard.
- Same name, same seed, same sound. A seed change makes `corr` tests fail on purpose.
- AudioContext timing in the browser is load-sensitive. Assert on gains and the scheduler's state,
  not on a millisecond.
