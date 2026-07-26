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

## Blowfish — the last locked door

Four archives store their index Blowfish-encrypted, and `local.mix` is where the palettes live,
so this was the difference between palette *indices* and actual colours.

The scheme is a signature check used backwards as key transport. The archive carries an 80-byte
block after its flags word; that block is "decrypted" with a **public** key (`e = 0x10001`), which
is the public-key operation, not the private one — anyone can do it, and that is the point. The
key is not secret, it is just not in the clear. 56 bytes fall out and they are the Blowfish key
for the index.

The original does this with several hundred lines of hand-rolled 32-bit bignum. JavaScript has
arbitrary-precision integers, so all of it is `m ** e % n`. **Both directions of the chunking are
little-endian**, which is the one detail that silently yields plausible-looking garbage if you
assume otherwise.

Blowfish itself is Schneier's 1993 cipher, unencumbered. Its P-array and S-boxes are the
hexadecimal digits of pi — a mathematical constant rather than anyone's design.

### The bug that every published test vector missed

The first draft encrypted **correctly** — it reproduced all six of Eric Young's ECB vectors — and
could not decrypt its own output. The decrypt loop's Feistel halves are the *mirror* of the
encrypt loop's, not a copy: because encryption ends on a swap, the decryptor's `l` is the
encryptor's `r`, so undoing round 16 (which modified the encryptor's `l`) has to modify the
**decryptor's `r`**.

The published vectors only ever test one direction, so they all passed. The suite now asserts
**both**, on every vector.

A second one landed the moment decryption was switched on: `an encrypted index fails loudly`, an
assertion written back when the answer was simply "not supported", started **throwing** instead of
failing — a 64-byte stub walked off the end of its own key block and `BigInt(undefined)` took the
reader down. A malformed archive has to fail, not throw.

### What opened

| archive | files | named |
|---|---|---|
| conquer | 230 | 164 |
| temperat | 332 | 67 |
| snow | 332 | 5 |
| interior | 153 | 9 |
| **hires** | **162** | **96** |
| **lores** | **141** | **96** |
| **local** | **66** | palettes |
| **speech** | **107** | — |
| allies / russian | 70 | — |

**1593 files across ten archives, 341 of the 477 dictionary names present.** `temperat.pal`,
`snow.pal` and `interior.pal` all recovered — and the infantry (`e1`, `e2`, `e3`, `e6`, `medi`,
`thf`) turned out to be in `hires.mix`, which is why they were missing from `conquer.mix` earlier.

Rendering `2tnk`, `4tnk`, `harv`, `heli`, `powr`, `proc`, `fact` and `dome` through
`temperat.pal` produces the real artwork in its real colours. The gold and green on the vehicles
are the **team-remap range** — the palette slots RA rewrites per player — so team colouring will
work exactly the way the original's does.

**No game data is committed. Only the readers.**
