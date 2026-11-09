---
phase: quick-261109-r4n
plan: 261109-r4n
subsystem: render
tags: [quality, sky, nebulae, assets, provenance]
status: complete

key-files:
  created:
    - src/render/bodies/nebulae.ts
    - tests/render/nebulae.test.ts
    - third_party/oolite/Textures/oolite-nebula-1.png
    - public/textures/oolite-nebula-1.png
  modified:
    - tools/oolite-ingest/convert/textures.ts
    - tools/oolite-ingest/generate.ts
    - scripts/vendor-oolite.sh
    - ASSETS.md
    - src/render/system-scene.ts
---

# Quick task 261109-r4n: sky nebulae at High quality

## What changed

- `src/render/bodies/nebulae.ts` ports Oolite's nebula quads: the cluster
  loop (with its documented off-by-one), sizes of 0.02 to 0.32 rad, the
  brightness rule, the texture probabilities from `nebulatextures.plist`, the
  `SaturatedColorInRange` colour rule with its hue quirk, and the two universal
  sky colours from `planetinfo.plist`. Lave draws 96 quads from
  `sky_n_blurs = 129`.
- The quads are drawn at High only, on a shell at 1.4e6 m just inside the
  starfield, with one mesh per used texture (at most four draw calls).
- Four textures (`oolite-nebula-1..4.png`, 81 KB together) were taken from the
  local Oolite checkout with `git show 7437f22:Resources/Textures/...`, the
  pinned commit, not fetched over the network. They are listed in
  `scripts/vendor-oolite.sh`, `CHECKSUMS.sha256` and `ASSETS.md`, and copied to
  `public/textures` by a new `copySkyTextures` step that reuses the
  hash-verified copy path.
- The settings label is now "High-quality graphics".

## Decisions

- The random stream is Wegolite's seeded generator, not Oolite's, so a
  system's nebulae are deterministic but are not laid out as in Oolite.
- Blending is in display space, as in Oolite: the nebula shader omits the
  colour-space conversion. A first cut through the colour-managed
  `MeshBasicMaterial` was almost invisible.
- `NEBULA_DISPLAY_GAIN = 3` is presentation tuning. At Oolite's legacy values
  (at most 0.1 per quad) the nebulae barely register without Oolite 1.92's HDR
  pipeline.
- Nebulae are tied to High rather than drawn always, so Standard stays the
  unchanged path that every budget and browser test renders.

## Verification

Run in Docker:

- `docker compose run --rm typecheck` and `docker compose run --rm lint`:
  passed.
- `docker compose run --rm assets npm run assets:check`: no differences.
- `docker compose run --rm test`: 98 files, 1276 tests passed, 1 skipped.
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test --project=chromium tests/e2e/settings.spec.ts tests/e2e/budget.spec.ts"`:
  9 passed; the toggle test asserts 0 nebula quads at Standard and more than 0
  at High, with no console errors.

Not run: `verify`, `verify-full` (owner's request), the rest of the e2e suite,
Firefox.

## Known gaps

- Stars are still points. Oolite draws them as textured sprites of varying
  size (`startextures.plist`); that is not ported.
- The look was checked on SwiftShader screenshots only.
- A mistake during the task: the checksum step was first run as a script file,
  which shifted its arguments and overwrote `third_party/oolite/pin.json`. The
  file was restored from git and the step re-run with the right arguments
  before the content build; `assets:check` and the provenance tests pass on the
  final state.
