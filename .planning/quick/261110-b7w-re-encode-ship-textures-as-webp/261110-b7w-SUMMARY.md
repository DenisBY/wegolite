---
phase: quick-261110-b7w
plan: 261110-b7w
subsystem: content
tags: [performance, load-size, content-build, textures]
status: complete
---

# Quick task 261110-b7w: re-encode the ship textures as WebP

## What changed

- The sixteen ship and station textures are served as WebP: 6 251 016 bytes
  against 19 727 075 bytes of PNG. The cold start to the first in-flight frame
  is 7 490 424 bytes (7.14 MiB), down from 20 996 848 (20.03 MiB); the
  regression ceiling in `budget.spec.ts` is now 8 MiB.
- `tools/oolite-ingest/convert/texture-encode.ts` (new) picks a profile from
  the material slots that name each file and runs `cwebp` 1.2.4:
  - diffuse: `-q 90 -m 6 -sharp_yuv -noalpha` (0.93 MB for seven files);
  - specular: `-q 90 -m 6 -sharp_yuv -exact -alpha_q 100` (2.46 MB for four);
  - normal: `-near_lossless 60 -z 9 -noalpha` (2.86 MB for six; exact
    lossless measured 4.59 MB).
- The GLBs name the WebP images through `EXT_texture_webp`, listed in
  `extensionsRequired`. The five emissive bakes keep a core PNG `source`.
- `src/content/generated/texture-encodings.json` (new) records each output's
  source, source hash, arguments, encoder and output hash. A build or a drift
  check re-uses a committed output when the source hash and arguments match
  and the file still has the recorded hash; `--reencode` encodes all again.
- `cwebp` and `dwebp` come from the Debian `webp` package, installed in the
  `ci` stage of the image.
- The byte-for-byte PNG copies under `public/textures/` are removed. The
  vendored PNGs under `third_party/oolite/Textures/` and `CHECKSUMS.sha256`
  are unchanged.

## Decision revised

Phase 2 D-20 ("copy the original PNGs verbatim; no KTX2/Basis in Phase 2").
The row in `.planning/PROJECT.md` Key Decisions holds the reasoning and what
the drift gate now proves. `ASSETS.md` has one row per WebP naming its source
PNG and the modification; `NOTICE` describes the re-encoded files as
derivative works under CC BY-NC-SA 3.0.

## What the drift gate proves now

For the encoded textures the gate no longer re-creates the bytes. It proves
that each committed file has the hash in the record, that the record's source
hash is the vendored PNG's and that its arguments are the ones the code would
use. The unit tests add the content check: every committed file is decoded
with `dwebp` and compared with its source (normal maps within 3 levels per
channel on every pixel, specular alpha exact, lossy colour within a mean error
ceiling). A change that alters a file, the record and the manifest together is
caught by those decode tests only if it changes the picture beyond the bounds.

## Behaviour change

A browser without WebP decoding cannot load the models: the extension is
required and there is no PNG fallback. Every current Chrome, Firefox and Safari
decodes WebP.

GPU memory is unchanged: the browser decodes to the same RGBA textures.

## Found on the way

The client reads only the alpha channel of the specular maps (as strength);
Oolite uses RGB as specular colour and alpha as gloss. Recorded as P8 in
`.planning/reviews/2026-11-09-logic-security-review.md`; not changed here.

## Verification

Run in Docker:

- `typecheck`, `lint`, `assets:check`: passed.
- `docker compose run --rm test`: 101 files, 1354 tests passed, 1 skipped.
- Before/after screenshots of the Cobra at launch and the Coriolis from two
  vantage points (old PNG build against this build): no visible difference;
  every texture request returned 200 in both.
- `npm run build` and the full Chromium browser suite (`npx playwright test
  --project=chromium`): 114 passed. That run also covers quick task
  261110-a3k on every spec.

Not run: `verify`, `verify-full` as a whole, `e2e-cross` (Firefox). Firefox
has decoded WebP since version 65, but the suite did not run there after this
change. Nothing was measured on a real GPU or over a real network.
