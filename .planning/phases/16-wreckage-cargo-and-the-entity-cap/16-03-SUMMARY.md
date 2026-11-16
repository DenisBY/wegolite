---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 03
subsystem: content-compiler
tags: [content, glb, textures, debris, data-16, legacy-materials, drift-gate]
status: complete

requires:
  - phase: 16-01
    provides: "the vendored debris sources: oolite_barrel.dat, oolite_alloy.dat, wreck1..wreck5.dat and their textures under third_party/oolite/"
provides:
  - "public/models/{barrel,alloy,wreck1..wreck5}.glb compiled behind the drift gate"
  - "public/textures/{oolite_barrel_diffuse,oolite_barrel_normal,oolite_barrel_specular,oolite_alloy_diffuse,wreck}.webp and oolite_alloy_diffuse_emissive.png"
  - "src/content/generated/ships-debris.json: seven strict debris records (barrel pod, alloy plate, five wrecks in shipdata order) with build-time mass, radius and tumble rates"
  - "DebrisRecordSchema / DebrisCatalogueSchema (src/content/schemas/ship-debris.ts) and the lazy loadDebrisCatalogue (src/content/ships-debris.ts); DebrisRecord and DebrisCatalogue on the type-only door"
  - "DEBRIS_GLBS, debrisGlbFile and LEGACY_TEXTURED_ENTRIES in tools/oolite-ingest/convert/glb.ts; DEBRIS_PATH, DEBRIS_ENTRIES, compileDebris, emitDebris in convert/debris.ts"
affects: [16-06, 16-08, 16-09]

plan_head_before: 67f6326b6aebd6f3558d374ef148c9d8e70b107e
plan_head_after: 5963f9beb5014853ec85dbd41e35aed89650ad91
commits: 2

actuals:
  tokens: 16366
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "One shared single-mesh emit loop (emitSingleMeshGlbs) for the NPC and the debris row sets, each with its own naming rule"
    - "A narrow, listed legacy material rule: only LEGACY_TEXTURED_ENTRIES keys may name an unauthored .png material, and both the GLB build and the texture closure read the same list"

key-files:
  created:
    - tools/oolite-ingest/convert/debris.ts
    - tools/oolite-ingest/convert/debris.test.ts
    - src/content/schemas/ship-debris.ts
    - src/content/ships-debris.ts
    - src/content/generated/ships-debris.json
    - tests/content/ships-debris.test.ts
    - tests/golden/content/ships-debris.json
    - public/models/barrel.glb
    - public/models/alloy.glb
    - public/models/wreck1.glb
    - public/models/wreck2.glb
    - public/models/wreck3.glb
    - public/models/wreck4.glb
    - public/models/wreck5.glb
    - public/textures/oolite_barrel_diffuse.webp
    - public/textures/oolite_barrel_normal.webp
    - public/textures/oolite_barrel_specular.webp
    - public/textures/oolite_alloy_diffuse.webp
    - public/textures/oolite_alloy_diffuse_emissive.png
    - public/textures/wreck.webp
  modified:
    - tools/oolite-ingest/convert/glb.ts
    - tools/oolite-ingest/convert/glb.test.ts
    - tools/oolite-ingest/convert/dat.ts
    - tools/oolite-ingest/convert/textures.ts
    - tools/oolite-ingest/convert/textures.test.ts
    - tools/oolite-ingest/convert/texture-encode.test.ts
    - tools/oolite-ingest/convert/ship-mass.test.ts
    - tools/oolite-ingest/convert/ships.test.ts
    - tools/oolite-ingest/generate.ts
    - src/content/types.ts
    - src/content/generated/manifest.json
    - src/content/generated/ships.json
    - src/content/generated/texture-encodings.json
    - tests/golden/content/ships.json
    - ASSETS.md
    - NOTICE

key-decisions:
  - "Legacy texture rule (16-03): LEGACY_TEXTURED_ENTRIES maps the five wreck keys to [\"wreck.png\"]; materialFor projects an empty dictionary (Oolite's default material: diffuse only, gloss 0, roughness 1) only for a listed .png key the entry does not author; every other missing material still fails (D-21), and a wreck mesh naming a material outside its list fails the build"
  - "D16-07 and D16-16 implemented: the plate is alloy only (no scarred variant compiled); the wrecks are wreckage-component and more-wreckage2..5 in shipdata order; the schema requires exactly one pod, exactly one plate and at least one wreck, at most 16 records, unique keys"
  - "The NPC and debris GLB loops share one helper (emitSingleMeshGlbs) instead of a copied loop; debris tumble defaults reuse the NPC converter's DEFAULT_MAX_FLIGHT_ROLL and DEFAULT_MAX_FLIGHT_PITCH"

patterns-established:
  - "A debris model joins by one DEBRIS_GLBS row, its EMITTED_ENTRIES and MODEL_SOURCE_FILES rows, a MODEL_BOUNDS row, its textures in VENDORED_TEXTURES, a DEBRIS_ENTRIES row and ASSETS.md rows"

requirements-completed: [DATA-16]

coverage:
  - id: D1
    description: "The barrel, alloy and five wreck models compile to GLBs with re-encoded textures behind the drift gate"
    requirement: DATA-16
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#debris GLBs"
        status: pass
      - kind: other
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D2
    description: "A strict debris catalogue of seven records with build-time mass, radius and tumble rates, loaded lazily"
    requirement: DATA-16
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/debris.test.ts"
        status: pass
      - kind: unit
        ref: "tests/content/ships-debris.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The legacy wreck texture rule is limited to the five listed entries and tested both ways"
    requirement: DATA-16
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#the legacy texture rule (DATA-16, T-16-10)"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/textures.test.ts#adds the legacy wreck texture and the alloy plate's maps (DATA-16)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Provenance: ASSETS.md generated-asset rows with actual SHA-256 for every new public file, and the NOTICE paragraph for ships-debris.json"
    requirement: DATA-16
    verification:
      - kind: unit
        ref: "tests/compliance-assets.test.ts"
        status: pass
      - kind: unit
        ref: "tests/compliance.test.ts"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-11-17
---

# Phase 16 Plan 03: Debris Content Compilation Summary

**The cargo barrel, the alloy plate and the five wrecks compile from the vendored `.dat` files to GLBs with re-encoded textures, and to a strict, lazily loaded seven-record debris catalogue with build-time float32 masses, radii and tumble rates; the legacy-textured wrecks go through one narrow, listed material rule.**

## Performance

- **Duration:** about 35 min
- **Started:** 2026-11-16T23:00Z (approx.)
- **Completed:** 2026-11-16T23:33Z
- **Tasks:** 2 of 2
- **Files:** 36 changed (20 created, 16 modified)

## Accomplishments

- `DEBRIS_GLBS` (alloy, barrel, wreck1..wreck5) with `EMITTED_ENTRIES` and `MODEL_SOURCE_FILES` rows, `debrisGlbFile` (`oolite_<name>.dat` through `shipGlbFile`, `wreck<1-9>.dat` to `wreck<n>.glb`, anything else a SCHEMA error), and one shared single-mesh emit loop for the NPC and debris rows.
- `LEGACY_TEXTURED_ENTRIES` and the default-material projection in `materialFor`; the texture closure adds `wreck.png` as a diffuse reference of each wreck, so both closure directions stay fatal.
- `convert/debris.ts` compiles the seven records from the resolved catalogue, checks each GLB is owned by its own key and model, and validates with the strict schema; `generate.ts` computes the debris masses and radii from the same parsed meshes.
- `DebrisRecordSchema` (strict, closed role set, model and GLB patterns, finite bounded numbers) and `DebrisCatalogueSchema` (1..16 records, unique keys, exactly one pod, exactly one plate, at least one wreck); `loadDebrisCatalogue` copies the NPC loader (non-eager `?raw` glob, cached promise, error naming the path). Nothing outside `src/content` imports it (a test pins that until plan 16-06).
- ASSETS.md rows for the 7 GLBs and 6 texture files, each with its actual SHA-256; one NOTICE paragraph for `ships-debris.json`.

## Debris records (exact float32 values)

| Key | Role | Model | Mass (kg) | Radius (m) | Roll / pitch | Research | GLB primitives / triangles / bytes |
|-----|------|-------|-----------|------------|--------------|----------|-----------------------------------|
| barrel | pod | oolite_barrel.dat | 993.3700561523438 | 5.798625946044922 | 0.5 / 0.5 | 993.37 / 5.7986 | 1 / 156 / 19,068 |
| alloy | plate | oolite_alloy.dat | 273.4375 | 5.149232387542725 | 0.5 / 0.5 | 273.44 / 5.1492 | 1 / 20 / 4,036 |
| wreckage-component | wreck | wreck1.dat | 3979.17236328125 | 17.278099060058594 | 0.20000000298023224 / same | 3979.17 / 17.28 | 1 / 14 / 3,216 |
| more-wreckage2 | wreck | wreck2.dat | 5793.83251953125 | 18.661623001098633 | 0.20000000298023224 / same | 5793.83 / 18.66 | 1 / 38 / 5,812 |
| more-wreckage3 | wreck | wreck3.dat | 2678.518310546875 | 19.393409729003906 | 0.20000000298023224 / same | 2678.52 / 19.39 | 1 / 20 / 3,860 |
| more-wreckage4 | wreck | wreck4.dat | 4352.720703125 | 21.188261032104492 | 0.20000000298023224 / same | 4352.72 / 21.19 | 1 / 10 / 2,776 |
| more-wreckage5 | wreck | wreck5.dat | 6317.5546875 | 22.416988372802734 | 0.20000000298023224 / same | 6317.55 / 22.42 | 1 / 20 / 3,860 |

Every mass and radius is within 0.01 of the research container measurement (largest difference 0.0047 kg, more-wreckage5). Every model is one primitive, so plan 16-08's draw-call estimate is one draw per debris instance batch per model.

## Encoded texture sizes

| File | Bytes | Encoding |
|------|-------|----------|
| public/textures/oolite_barrel_diffuse.webp | 49,906 | lossy q90, source has no alpha |
| public/textures/oolite_barrel_normal.webp | 102,202 | near-lossless 60, source has no alpha |
| public/textures/oolite_barrel_specular.webp | 166,200 | lossy q90, alpha kept exactly |
| public/textures/oolite_alloy_diffuse.webp | 17,426 | lossy q90, alpha dropped |
| public/textures/oolite_alloy_diffuse_emissive.png | 34,209 | alpha baked to greyscale |
| public/textures/wreck.webp | 6,664 | lossy q90, source has no alpha |

## Task Commits

1. **Task 1: the cargo barrel end to end (tracer)** - `3f76210` (feat)
2. **Task 2: the alloy plate and the five legacy-textured wrecks** - `5963f9b` (feat)

Tracer gate: auto mode, the Task 1 `<verify>` (assets, targeted tests, `assets:check`) re-run green before Task 2 started.

## Decisions Made

See key-decisions above. No owner-confirmation item (OC-1..OC-7) is touched by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned counts and lists in existing tests moved with the new models**
- **Found during:** Task 1 and Task 2
- **Issue:** `VENDORED_MODEL_FILES` derives from `MODEL_SOURCE_FILES`, so the newly vendored models flip `modelVendored` on 14 more catalogue entries in `ships.json` (barrel, oolite-cargopod-virtual, alloy, scarred-alloy, the wreckage entries and their templates) and change several pinned counts: the texture closure size (54 to 59), the encoder profile counts (lossless 19 to 20, alpha 14 to 15), the vendored model count (16 to 23), the hull-mass table (16 to 23 meshes) and the usable vendored entry list.
- **Fix:** Updated `textures.test.ts`, `texture-encode.test.ts`, `ship-mass.test.ts` (seven hull-mass rows; the barrel and alloy are octree depth 4, a size consequence of the existing adaptive rule), `ships.test.ts` and `tests/golden/content/ships.json`. The `scarred-alloy` entry shows `modelVendored: true` in `ships.json` only because it shares `oolite_alloy.dat`; no scarred GLB, texture or record is compiled (D16-07).
- **Files modified:** the five test files above and the ships golden
- **Commits:** `3f76210`, `5963f9b`

**2. [Rule 1 - Clarity] The GLB test helper accepts a legacy texture name**
- **Found during:** Task 2
- **Issue:** The shared single-mesh GLB check asserted every material name is a key of the owner's material table, which a wreck (no materials dictionary) cannot satisfy.
- **Fix:** The check accepts the owner's `LEGACY_TEXTURED_ENTRIES` list as well; the NPC and debris GLBs now run the same helper.
- **Commit:** `5963f9b`

**Total deviations:** 2 auto-fixed (1 blocking, 1 test-helper). **Impact:** test bookkeeping only; no generated content beyond the plan's files changed except `ships.json`'s `modelVendored` flags, which the drift gate covers.

## Gates

- `docker compose run --rm assets`: pass (118 files written)
- `docker compose run --rm assets npm run assets:check`: pass, "no differences"
- `docker compose run --rm test npx vitest run tools/oolite-ingest tests/content tests/compliance-assets.test.ts tests/compliance.test.ts`: 28 files, 672 tests pass
- `docker compose run --rm test` (full suite with coverage): 211 files pass, 5364 tests pass, 10 skipped, exit 0
- `docker compose run --rm lint`: pass (eslint clean, prettier clean)
- `docker compose run --rm typecheck`: pass
- Not run, by the plan's gate policy: `verify`, `verify-full`, browser specs, the 20-seed acceptance run (no browser-facing code, no `src/sim/world/**` or `ships-npc.json` change).

## Issues Encountered

None.

## Next Phase Readiness

Plan 16-06 can build the sim's `DebrisContent` from `loadDebrisCatalogue()` (and relax the "no importer" test in `tests/content/ships-debris.test.ts` in the same commit); plan 16-08 can draw the seven GLBs (one primitive each).

## Self-Check: PASSED

- All 20 created files exist on disk; commits `3f76210` and `5963f9b` are ancestors of HEAD.
- Task 1 acceptance: `barrel.glb` in glb.ts 4, `oolite_barrel.dat` in dat.ts 1, `oolite_barrel_diffuse.png` in textures.ts 1, files present, `ships-debris.json` in NOTICE 1, `import.meta.glob` in the loader 1, no importer outside `src/content`.
- Task 2 acceptance: `LEGACY_TEXTURED_ENTRIES` in glb.ts 4, `wreck.png` in textures.ts 1, 7 `"key"` lines, wreck5/alloy/wreck.webp present, 7 ASSETS.md GLB rows, no `scarred` in `ships-debris.json` or `debris.ts`.
