# `ra/` — reading the real game's data

This directory is the start of an **asset-driven** Red Alert, as opposed to the procedurally
generated game in `src/`. Nothing here is wired into `index.html` yet.

## Why it exists

The game in `src/` draws every pixel in code. That is why it does not look like Red Alert and
why no amount of work on it ever will: the look of RA lives in its **artwork**, and artwork
cannot be derived from the source release. EA open-sourced the *code* in 2024; the content —
sprites, terrain tiles, palettes, sound, maps, and `RULES.INI` with the real balance numbers —
shipped separately inside `.MIX` archives and was never part of it.

An exact rebuild therefore needs the original `.MIX` files, from any legitimate copy: the 2008
freeware release, the Remastered Collection, or an original CD.

## What is here

| file | what it does |
|---|---|
| `lcw.js` | LCW ("Format80") decompression, ported line-for-line from `CODE/LCWUNCMP.CPP`, plus the XOR delta ("Format40") used by SHP frames. Every asset in the game arrives through one of these. |
| `mix.js` | MIX archive reader — header, index, and `Calc_CRC` from `TOOLS/MIX/MIXFILE.CPP`. Reads by name; returns views, never copies. |
| `test.js` | `node ra/test.js`. 28 assertions, **no assets required**. |

## Testing without the data

Every decoder here is proven by building its input in the test rather than by reading a real
file, so the code is known-good *before* any game data exists. When real archives arrive, a
failure will be about the data rather than about the reader.

The assertion that matters most is `LCW overlapping back-reference expands a run`. LCW encodes
long runs as a one-byte backward reference with a large count, so the copy has to be
byte-at-a-time and has to read bytes it wrote moments earlier. A decoder built on `subarray`
or a typed-array `set` reads uninitialised memory instead and produces subtly wrong images —
it is the single most common way a hand-written LCW decoder is wrong, and it fails on some
frames and not others.

## Still to write

- **SHP** — frame headers, per-frame LCW or XOR-delta, and the 8-facing convention.
- **TMP / icon sets** — terrain templates (`WWFLAT32/TILE/ICONSET.CPP`, catalogued in
  `CODE/TDATA.CPP`). This is what makes RA's ground look *drawn* rather than generated.
- **PAL** — 256 x 3 bytes at 6 bits per channel, so every value needs scaling to 8-bit.
- **House remap** — team colour in RA is a palette-index substitution over a reserved range
  (`WWFLAT32/SHAPE/DRAWSHP.ASM`), not a tint over finished pixels.
- **`RULES.INI`** — the real `Strength`, `Cost`, `Speed`, `ROF`, `Damage` and `Armor` values,
  replacing the invented tables in `src/rts.rules.js`.
- **Blowfish** — needed only for encrypted indices; the theatre and artwork archives are not
  encrypted, so this is not on the critical path.

## Fetching the source

`raw.githubusercontent.com/electronicarts/CnC_Red_Alert/main/<PATH>` is reachable and files
can be pulled directly by exact path. The GitHub *API* is blocked in this environment, so
directories cannot be listed — but `CODE/`, `WWFLAT32/`, `WIN32LIB/` and `TOOLS/` all fetch.
