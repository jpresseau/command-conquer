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

## SHP reader — and the day the real data turned up

`shp.js` decodes Red Alert's shape format. It was written against the real `conquer.mix`, which
arrived long after `mix.js` and `lcw.js` were built for it.

A SHP is a header, an offset record per frame, then the frame data. The only part that needs care
is that a frame is stored in one of **three** ways and two of them are deltas:

| format | meaning |
|---|---|
| `0x80` | LCW (Format80) compressed, standalone |
| `0x40` | XOR delta against the frame named by the record's second half |
| `0x20` | XOR delta against the **previous** frame |

RA leans on `0x20` heavily for rotation sets — 32 facings of the same tank differ only slightly
from their neighbour — so a reader that decodes "just the frame I want" returns garbage for 30 of
them. `shp.frame(i)` walks the chain and memoises, and there is an assertion that asking for a
chained frame **first** gives the same answer as asking for it in order.

### Verified against the real archives

| | |
|---|---|
| `conquer.mix` | 230 files, index parsed, **164 identified by name** |
| `temperat.mix` | 332 files | 
| `2tnk.shp` | 64 frames, 36×36, 0 decode failures (32 hull + 32 turret) |
| `4tnk.shp` | 64 frames, 48×48 |
| `harv.shp` | 111 frames, 48×48 |
| `heli.shp` | 32 frames, 46×29 |
| `powr.shp` | 2 frames (intact, damaged) |

The MIX index stores **hashes, not names**, so there is no way to enumerate an archive. Names are
recovered by hashing a dictionary and probing — and OpenRA's `mods/ra/sequences/*.yaml` is a ready
made dictionary, since it names the SHP behind every actor. 477 names, 245 of them present in the
readable archives.

### What is still locked

Four of the eleven archives — `hires`, `lores`, `local`, `speech` — have **Blowfish-encrypted
indexes**, and `mix.js` reports that rather than misreading it as noise (there has been an
assertion for exactly this since before any data existed). `local.mix` is where the palettes live,
which is why sprites currently decode to palette **indices** with no colours attached.

Unlocking it needs the RA MIX v2 header: an 80-byte RSA-wrapped block holding a 56-byte Blowfish
key, then a Blowfish-ECB encrypted index. That is the last blocker between this and real art.

### Licensing

The data is the **Red Alert freeware release**, published by EA in 2008 and distributed through
OpenRA's own content downloader (`mods/ra-content/installer/downloads.yaml`). The zip's SHA1
matches that manifest exactly: `aa022b208a3b45b4a45c00fdae22ccf3c6de3e5c`. **No game data is
committed to this repository** — only the readers.
