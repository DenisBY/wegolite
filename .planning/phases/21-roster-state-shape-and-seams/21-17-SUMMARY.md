---
phase: 21-roster-state-shape-and-seams
plan: 17
subsystem: content-pipeline
tags: [texture-atlas, glb, draw-calls, d-05, qual-09, webp, converter]
requires:
  - phase: 21-08
    provides: "29-record catalogue, one GLB per record, the shared-geometry family list"
  - phase: 21-11
    provides: "NPC model prefetch and the first-load figures this plan updates"
  - phase: 21-16
    provides: "tests/e2e/anarchy.spec.ts and the 65 / 68 call baseline"
provides:
  - "mergeHullPrimitives / packHullAtlas / MAX_HULL_ATLAS_SIDE (tools/oolite-ingest/convert/atlas.ts) and the five validity conditions with a recorded refusal (extras.wegolite.mergeRefusal)"
  - "22 NPC GLBs regenerated as one primitive and one material each, with 65 content-addressed atlas images (52 WebP and 13 greyscale PNG emissive masks)"
  - "the measured D-05 fix (1) effect on the full anarchy: 65 -> 39 worst-case calls, 68 -> 42 after a kill, triangles unchanged"
affects: [21-18, 21-19]
key-files:
  created:
    - tools/oolite-ingest/convert/atlas.ts
    - tools/oolite-ingest/convert/atlas.test.ts
  modified:
    - tools/oolite-ingest/convert/glb.ts
    - tools/oolite-ingest/convert/glb.test.ts
    - tools/oolite-ingest/convert/textures.ts
    - tools/oolite-ingest/convert/textures.test.ts
    - tools/oolite-ingest/convert/texture-encode.ts
    - tools/oolite-ingest/convert/texture-encode.test.ts
    - tools/oolite-ingest/generate.ts
    - tests/e2e/npc-assets.spec.ts
    - public/models/*.glb (the 22 multi-primitive NPC hulls)
    - public/textures/** (65 atlas files added, 82 per-primitive NPC textures removed)
    - src/content/generated/manifest.json
    - src/content/generated/texture-encodings.json
    - ASSETS.md
    - docs/PERFORMANCE.md
    - CHANGELOG.md
key-decisions:
  - "The atlas side is the smallest multiple of the smallest region that holds the regions (1 024 + 256 -> 1 280), not a power of two: three.js and WebGL2 take non-power-of-two textures, and a power-of-two atlas would have been 2 048 for every hull with a 1 024-texel hull map"
  - "No gutter: regions are aligned to multiples of their own side, so no mip texel whose block is at most the region side straddles two regions, and a gutter would double the side of every 1 024-texel hull"
  - "Atlas files are content-addressed by a SHA-256 prefix of the atlas pixels (side, channels, data), not of the PNG bytes, so the name does not depend on the zlib build"
  - "The encodings row of an atlas names `atlas:<png name>` as its source and lists every vendored input under `inputs`; single-source rows are unchanged"
  - "The texture emitters write what the emitted GLBs reference (both directions): a merged hull names its atlases, so its per-primitive maps are no longer encoded or baked"
requirements-completed: [DATA-18]
actuals:
  tokens: 24300
  tasks: 3
  commits: 5
duration: 4h
completed: 2026-11-26
status: complete
commits: 5
plan_head_before: 24910d049d5cf42578c51e22d907d35323abae67
plan_head_after: 985b90491d410f736d0f371817596103c3c45ed8
---

# Phase 21 Plan 17: per-hull atlas merge (D-05 fix 1) Summary

**Every NPC hull with two or three primitives (22 of the 29) is now one primitive with one material, built at asset-build time through a texel-exact per-hull texture atlas with the authored gloss, emission and absent-map values baked in; the full 29-key anarchy dropped from 65 to 39 draw calls (68 to 42 after a kill) with the triangle count unchanged.**

## What was built

- `tools/oolite-ingest/convert/atlas.ts`: `packHullAtlas` (a deterministic layout that is a pure function of the region sides), `mergeHullPrimitives` (UV remap, slot atlases, texel-exactness check, the five validity conditions (a) to (e)), `MAX_HULL_ATLAS_SIDE` 2 048. One region per distinct (diffuse, normal, specular, emission source, baked roughness) tuple, in the authored material order; a smaller map in a tuple is upscaled by integer replication, no map is ever shrunk; absent maps are constant regions (normal 128,128,255; specular white; emissive 0; the primitive's roughness); roughness is an atlas (G channel) only when the hull's primitives differ, otherwise `roughnessFactor` is kept.
- `glb.ts`: `planHullMerges`, `hullTextureNames`, `atlasImagesOf`, `referencedTextureFiles`, `MERGED_NPC_GLBS` (= `NPC_SHIP_GLBS`), the merged-material writer (`metallicRoughnessTexture`, `extras.oolite.merged` in authored order), and the refusal record `extras.wegolite.mergeRefusal` (scene extras). A hull of one primitive is emitted byte-identically.
- `textures.ts` / `texture-encode.ts`: `decodeColourPng` (RGB and RGBA), `encodeRgbaPng`, `loadTextureImages`; the encoder takes `atlases` and `referenced`, encodes atlas images through a scratch PNG, and writes rows with `source: atlas:<name>` and `inputs`; the emissive masks of the atlases stay greyscale PNG; the roughness atlas uses the near-lossless profile (constants stay exact).
- Regenerated GLBs and atlas WebPs, 82 per-primitive NPC textures no GLB references any more removed, `ASSETS.md` rows for all 65 atlas files (inputs named, CC BY-NC-SA 3.0) and the removal of the rows of the deleted files, `docs/PERFORMANCE.md`, the CHANGELOG line.

## Measured: anarchy calls and triangles (remote `anarchy.spec.ts`)

| Step | Worst case calls | Worst case triangles | After kill +60 ticks calls | After kill triangles |
|---|---|---|---|---|
| 21-16 baseline (before any fix) | 65 | 77,934 | 68 | 78,598 |
| Task 1 only (anaconda and anaconda-pirate merged, 3 -> 1 per key) | 61 | 77,934 | 64 | 78,598 |
| After fix (1), every NPC hull merged (commit 90c5f209, same at 14c8396b) | **39** | 77,934 | **42** | 78,598 |

The budget (50 calls) now holds with the 29 keys present; plan 21-18 (variant sharing) and plan 21-19 (the decision) read these as the "after fix (1)" step. 39 = 29 hull calls + 10 non-NPC calls; every NPC key now costs exactly one call.

## Measured: per record (base `24910d04` vs `14c8396b`)

Texture memory = width x height x 4 x 4/3 summed over every texture the record loads; bytes = GLB + the texture files it names.

| record | prims before | prims after | refusal | GLB+tex bytes before | GLB+tex bytes after | tex memory MiB before | tex memory MiB after |
|---|---|---|---|---|---|---|---|
| adder | 1 | 1 | - | 817,251 | 817,251 | 21.3 | 21.3 |
| anaconda-pirate | 3 | 1 | merged | 2,183,809 | 2,253,523 | 25.7 | 60.0 |
| anaconda | 3 | 1 | merged | 2,183,781 | 2,253,495 | 25.7 | 60.0 |
| asp | 2 | 1 | merged | 1,281,357 | 1,276,351 | 21.7 | 41.7 |
| boa-mk2-pirate | 2 | 1 | merged | 1,920,222 | 1,922,897 | 22.7 | 33.3 |
| boa-mk2 | 2 | 1 | merged | 1,920,202 | 1,922,873 | 22.7 | 33.3 |
| boa-pirate | 2 | 1 | merged | 2,014,089 | 2,029,804 | 22.7 | 33.3 |
| boa | 2 | 1 | merged | 2,014,069 | 2,029,784 | 22.7 | 33.3 |
| cobra3-alternate | 2 | 1 | merged | 1,716,480 | 1,696,186 | 22.0 | 41.7 |
| cobra3-pirate | 2 | 1 | merged | 1,723,026 | 1,705,214 | 22.0 | 41.7 |
| cobra3-trader | 2 | 1 | merged | 1,724,556 | 1,701,224 | 22.0 | 41.7 |
| cobramk1-alt | 1 | 1 | - | 1,696,788 | 1,696,788 | 21.3 | 21.3 |
| cobramk1 | 1 | 1 | - | 1,678,786 | 1,678,786 | 21.3 | 21.3 |
| ferdelance | 2 | 1 | merged | 1,481,403 | 1,500,702 | 22.7 | 33.3 |
| gecko | 2 | 1 | merged | 2,091,522 | 2,110,322 | 22.3 | 41.7 |
| krait | 1 | 1 | - | 1,680,972 | 1,680,972 | 21.3 | 21.3 |
| mamba-escort | 2 | 1 | merged | 1,448,506 | 1,439,018 | 21.5 | 33.8 |
| mamba | 2 | 1 | merged | 1,440,568 | 1,432,996 | 21.5 | 33.8 |
| moray | 2 | 1 | merged | 1,056,834 | 1,045,549 | 22.3 | 41.7 |
| moraymed | 2 | 1 | merged | 1,072,650 | 1,059,177 | 22.3 | 41.7 |
| python-blackdog | 3 | 1 | merged | 2,426,944 | 2,512,912 | 25.3 | 60.0 |
| python-trader | 2 | 1 | merged | 2,336,943 | 2,356,436 | 26.7 | 60.0 |
| python | 3 | 1 | merged | 2,417,662 | 2,517,448 | 25.3 | 60.0 |
| shuttle | 1 | 1 | - | 1,158,975 | 1,158,975 | 21.3 | 21.3 |
| sidewinder-escort | 1 | 1 | - | 2,129,687 | 2,129,687 | 21.3 | 21.3 |
| sidewinder | 1 | 1 | - | 2,211,829 | 2,211,829 | 21.3 | 21.3 |
| viper-interceptor | 2 | 1 | merged | 209,872 | 267,785 | 4.0 | 16.0 |
| viper-pursuit | 2 | 1 | merged | 206,460 | 263,512 | 4.0 | 16.0 |
| viper | 2 | 1 | merged | 212,056 | 273,806 | 4.0 | 16.0 |

No hull was refused by a validity condition: all 22 multi-primitive hulls (the nine variant families of plan 21-08 among them) merged, so the legacy-nine fallback was not needed and no refusal record exists in a committed GLB. The refusal path is exercised by the synthetic conditions in `atlas.test.ts` and by the GLB test, which derives each hull's expectation (`single`, `merged` or `refused` with its condition) from the converter's own plan, never from a list of hulls.

Totals: GLB bytes 3,030,300 -> 3,002,444; unique NPC texture files 122 -> 91 (65 of them atlas images); NPC texture bytes 29,816,475 -> 30,043,947; texture memory summed over the 29 records 601.0 -> 1,023.2 MiB; each file counted once 458.2 -> 712.2 MiB.

Shared atlas files across variants (content addressing): `anaconda`/`anaconda-pirate`, `boa`/`boa-pirate` and `boa-mk2`/`boa-mk2-pirate` produce the same five atlas files each (one set per pair); the three Cobra Mk III variants share the normal, specular, roughness and emissive atlases and differ only in the diffuse atlas (three files); all variants of one model share the merged geometry (positions, normals, UVs, index) and the layout, which `atlas.test.ts` asserts for every variant pair (at least nine). Layout sides: Anaconda and the Pythons 1,536; Boa, Boa Mk II, Asp, Cobra, Ferdelance, Gecko, Moray 1,280; Mamba 1,152; Viper family 1,024.

## Measured: load (remote `budget.spec.ts` and `traffic.spec.ts`, commit 90c5f209)

| Measure | After (plan 21-17) | Plan 21-11 |
|---|---|---|
| Cold start, traffic off | 8,901,864 B (535,320 below the 9,437,184 ceiling) | 8,899,758 B |
| Cold start, traffic on, without prefetch | 8,933,196 B (503,988 below) | 8,931,090 B |
| Prefetch, total on the wire (29 GLBs, 127 texture replies) | 33,046,391 B (31.5 MiB), 12.4 s at concurrency 2 | 31,242,355 B |

The first-load models (player Cobra, Coriolis, buoy) are byte-identical, so the first-load figures moved by 2,106 B only (later plans' code in the build). The prefetch grew by 1.80 MB because the Cobra variants no longer share the six maps the player's Cobra loads; they own atlases. The ceiling holds with traffic off and on, so the legacy nine kept their merge.

## Findings for plan 21-19

- Texture memory is the cost of fix (1): +70 percent summed over the records (+55 percent counting each file once). The atlas is square and one layout serves every slot, so the roughness atlas (two or three constants) and the neutral fill of the normal, specular and emissive atlases cost GPU memory but almost no file bytes. Two reductions exist and are not applied, because each changes what the atlas holds and would need its own validity argument: a roughness map of one texel per region read with nearest filtering (needs sampler support in the GLB writer), and a layout per slot.
- All NPC hulls are now one primitive, so plan 21-18's instancing of variant hulls works on whole-hull meshes and its `familyKey` can use the merged geometry equality asserted here.

## Deviations from Plan

**1. [Rule 3 - Blocking] RGB maps need a decoder** - the vendored roster maps include colour type 2 (RGB) PNGs (for example `oolite_anaconda_subents_normal.png`) and `decodePng` accepts RGBA only. Added `decodeColourPng` (RGB and RGBA to RGBA) beside it; `decodePng` is unchanged. Commit 6979b1f8.

**2. [Plan refinement within the stated guarantees] atlas side, gutter, name hash** - the plan's design rules allow refining the packing. (a) The side is the smallest multiple of the smallest region that fits, so a 1,024-texel hull with a 256-texel subentity map is 1,280 per side instead of 2,048; this also gives the plan's "exactly 2,048 merges, 2,049 refuses" boundary a meaning (`packHullAtlas([2048, 1])` needs 2,049). (b) No gutter, justified in the module doc. (c) The 12-hex name prefix hashes the atlas pixels (with side and channel count) rather than the PNG bytes, so a zlib change cannot rename the files. The encodings row still records the SHA-256 of the PNG as its `sourceSha256`.

**3. [Rule 1 - Bug] npc-assets spec expected `_emissive.png`** - the remote run of Task 1 failed `tests/e2e/npc-assets.spec.ts` because the emissive mask of an atlas is `oolite_<model>_emissive_atlas_<hash>.png`. The spec now accepts that name beside the old one; commit a75dd66b.

**4. [Rule 3 - Blocking] tests that assumed every vendored texture is served** - `textures.test.ts`, `texture-encode.test.ts` and `glb.test.ts` listed every vendored texture as an emitted file and rebuilt each NPC GLB with `buildShipGlb`. They now derive the served set from the committed GLBs' image URIs (both directions: every served file is referenced, every referenced file exists) and rebuild through `planHullMerges` / `emitModels`; the Cobra variant closure test finds the variant diffuse map as an input of its atlas row. The generator does not delete files, so the 82 unreferenced per-primitive textures were removed by hand and `assets:check` (which reports EXTRA files) confirms the tree.

**5. [Plan wording] roughness texture slot** - `TextureMapKind` gained `roughness` (data profile: near-lossless, constants exact). The plan named the profile of "the slot's map kind"; there was no kind for a baked constant.

**6. [Record correction]** the message of commit 90c5f209 says "20 multi-primitive hulls" and "9 single-primitive hulls"; the measured counts are 22 and 7 (the table above), as `docs/PERFORMANCE.md` states.

## Known Stubs

None.

## Threat Flags

None. The atlas builder reads only vendored files under `third_party/oolite/` and writes under `public/`; T-21-39 (texel exactness test over every corner and slot, five conditions, no shrinking), T-21-40 (65 `ASSETS.md` rows naming inputs, cross-checked by `tests/compliance-assets.test.ts` and the drift gate) and T-21-41 (side cap 2,048, texture memory and cold start measured) are mitigated as planned.

## Gates

- `docker compose run --rm test`: 307 files, 8,501 passed, 10 skipped (before the docs commit; no code changed after).
- `lint`, `typecheck`, `assets:check` (no differences): green at 90c5f209.
- Remote `run --rm e2e` `budget.spec.ts traffic.spec.ts npc-assets.spec.ts models.spec.ts`: 9 passed at 90c5f209.
- Remote `anarchy.spec.ts`: passed at 90c5f209 (39 / 42 calls).
- Remote `run --rm verify` at 14c8396b: exit 0, snapshot 14c8396b, 402 s (lint, typecheck, `assets:check` no differences, 307 unit files 8,501 passed 10 skipped, build, `check:dist`, 28 e2e passed).
- Remote `anarchy.spec.ts budget.spec.ts traffic.spec.ts` at the last code and docs commit 985b9049: 7 passed (exit 0, snapshot 985b9049), anarchy 39 / 77,934 and 42 / 78,598.
- `git diff --quiet 24910d04..HEAD -- src/content/generated/ships-npc.json public/models/cobra3.glb public/models/coriolis.glb public/models/buoy.glb` exits 0, and all seven debris GLBs and the player and station models are byte-identical (the 22 changed GLBs are the 22 merged hulls and nothing else). No record field changed, so QUAL-12's 20-seed run is not due (plan 21-19 runs it at the phase gate).

## Commits

- 6979b1f8 feat: the anaconda pair merged through a texel-exact atlas (Task 1, tracer)
- a75dd66b fix: npc-assets spec accepts the atlas emissive mask
- 90c5f209 feat: every NPC hull merged, 65 atlas images, per-primitive textures removed (Task 2)
- 14c8396b docs: load figures, CHANGELOG line (Task 3)
- 985b9049 docs: corrected hull counts (22 merged, 7 single)

## Self-Check: PASSED
