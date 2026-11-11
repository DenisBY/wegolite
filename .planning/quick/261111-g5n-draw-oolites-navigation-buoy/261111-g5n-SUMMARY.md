---
phase: quick-261111-g5n
plan: 261111-g5n
subsystem: render
tags: [fidelity, assets, content-build]
status: complete
---

# Quick task 261111-g5n: draw Oolite's navigation buoy

## What changed

- Vendored at the pinned commit 7437f22: `oolite_buoy.dat`,
  `oolite_buoy_subents.dat` and five `oolite_buoy_*.png` textures, with
  checksums and `scripts/vendor-oolite.sh` entries.
- The content build emits `public/models/buoy.glb` (hull and core nodes), five
  WebP textures and one baked emissive PNG: 1 322 175 bytes in all.
- `emission_map` given as a bare file name is now an RGB illumination image
  (map kind `illumination`), encoded like a diffuse map and referenced directly
  as the emissive texture.
- The `flasher` subentities of `buoy` and `buoy-witchpoint` are resolved at
  build time into the GLB scene `extras`.
- `src/render/bodies/buoy.ts` replaces `beacon.ts`: a clone of the shared model
  plus one additive billboard per flasher, animated with the brightness formula
  of `OOFlasherEntity.m`, tumbling at `performBuoyTumble`'s rates.
- The asset cache loads a third model; `SystemScene` gains `buoys`, updated in
  `applyFrame` with the flight clock.

## Decision revised

Phase 3 D-04 (procedural beacon markers, no new asset). The PROJECT.md row
lists the three approximations: state-free colour step and tumble, a generated
light blob, and the unchanged 10 m simulation radius.

## Delegated

Per AGENTS.md the mechanical follow-up went to the smallest model: updating
three existing test files to the new interfaces and counts, and 14 `ASSETS.md`
rows. The main agent read the changes, checked every row hash against the
manifest and `CHECKSUMS.sha256`, corrected the alpha wording of four rows (the
sources have no alpha channel) and fixed two lint errors the subagent reported
in the new code.

## Known gap, deferred by the owner

The buoys can be flown through, as the placeholder could. On 2026-11-11 the
owner deferred collisions with the planet, the sun and the buoys until shields
exist (CBT-01); see
`.planning/todos/pending/2026-11-10-add-planet-and-sun-collision.md`.

## Verification

Run in Docker:

- `docker compose run --rm verify-full`: lint, typecheck, `assets:check`, 105
  unit files and 1420 tests passed; Chromium browser suite 116 passed; the seam
  spec 2 passed.
- `docker compose run --rm e2e-cross` (Firefox): 2 passed.
- Screenshots of the station buoy and of the witchpoint beacon on the software
  rasteriser. Draw calls per scene rose by 4 (13 docked, 10 in flight, budget
  50); the cold start is 8 814 224 bytes and the ceiling is now 9 MiB.

Not checked: the look on a real GPU, and the flasher timing against a running
Oolite; the formula was ported from the source and tested against hand-worked
values.
