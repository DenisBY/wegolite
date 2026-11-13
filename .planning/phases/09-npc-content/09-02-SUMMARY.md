---
phase: 09-npc-content
plan: 02
subsystem: content
tags: [oolite, glb, converter, npc-ships, textures, provenance]
status: complete
requires:
  - phase: 09-npc-content
    provides: "09-01 vendored oolite_viper.dat and both Viper PNGs"
provides:
  - "buildShipGlb, shipGlbFile and NPC_SHIP_GLBS in tools/oolite-ingest/convert/glb.ts"
  - "public/models/viper.glb with oolite_viper_diffuse.webp, oolite_viper_normal.webp and oolite_viper_diffuse_emissive.png"
  - "table-driven NPC GLB test block and naming-rule tests that plan 09-03 rows inherit"
affects: [09-03, 09-04, 09-05]
plan_head_before: 6ff8fd69fc1bd5d8cc64330bf3cc27413e9ae401
plan_head_after: 76ace5db1064fe52009deb41089c93986ab82f43
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "one generic single-mesh GLB builder driven by explicit EMITTED_ENTRIES / MODEL_SOURCE_FILES / NPC_SHIP_GLBS rows"
    - "one naming rule oolite_<name>.dat -> <name>.glb shared by converter and later record compiler"
key-files:
  created:
    - public/models/viper.glb
    - public/textures/oolite_viper_diffuse.webp
    - public/textures/oolite_viper_normal.webp
    - public/textures/oolite_viper_diffuse_emissive.png
  modified:
    - tools/oolite-ingest/convert/glb.ts
    - tools/oolite-ingest/convert/dat.ts
    - tools/oolite-ingest/convert/textures.ts
    - tools/oolite-ingest/convert/textures.test.ts
    - tools/oolite-ingest/convert/texture-encode.test.ts
    - tools/oolite-ingest/convert/glb.test.ts
    - ASSETS.md
    - NOTICE
    - src/content/generated/manifest.json
    - src/content/generated/texture-encodings.json
key-decisions:
  - "NPC GLBs have exactly one node (the hull); sub-entities are not compiled (D-04)."
requirements-completed: [DATA-10]
coverage:
  - id: D1
    description: "The content build emits viper.glb plus its WebP and emissive textures from the vendored sources, and assets:check regenerates them byte-identical"
    requirement: DATA-10
    verification:
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check -> no differences"
        status: pass
    human_judgment: false
  - id: D2
    description: "cobra3.glb, coriolis.glb and buoy.glb are byte-identical after the Cobra moves onto the generic builder"
    requirement: DATA-10
    verification:
      - kind: other
        ref: "git diff --quiet 6ff8fd6 -- public/models/cobra3.glb public/models/coriolis.glb public/models/buoy.glb (exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each NPC GLB row is pinned by bytes, single node, material and texture closure, front faces and MODEL_BOUNDS span; the naming rule and row-set invariants are tested"
    requirement: DATA-10
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#NPC ship GLBs, #the NPC GLB naming rule"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every new public file has an ASSETS.md row with SHA-256; NOTICE covers every GLB under public/models/"
    requirement: DATA-10
    verification:
      - kind: unit
        ref: "tests/compliance-assets.test.ts, tests/compliance.test.ts"
        status: pass
    human_judgment: false
---

# Phase 9 Plan 02: Generic NPC ship GLB builder and the Viper Summary

The GLB converter now builds any single-mesh NPC ship from a table row (`buildShipGlb`, `shipGlbFile`, `NPC_SHIP_GLBS`), proven end to end on the Viper with its WebP and emissive textures, provenance rows and a table-driven test block that plan 09-03's eight rows inherit.

## Run record

| Item | Value |
| --- | --- |
| PLAN_BASE | `6ff8fd69fc1bd5d8cc64330bf3cc27413e9ae401` |
| Plan head after | `76ace5db1064fe52009deb41089c93986ab82f43` |
| Tasks | 2 (both autonomous; Task 1 tracer verified end to end before Task 2) |
| Completed | 2026-11-13 |

## Task commits

| Task | Commit | Result |
| --- | --- | --- |
| 1 (tracer) Viper end to end | `7fce580` | generic builder, naming rule, NPC table, Viper outputs, ASSETS.md rows, test pins at 23 names |
| 2 NPC GLB test block and NOTICE | `76ace5d` | 10 new tests; NOTICE covers every GLB |

## New public files

| File | Bytes |
| --- | --- |
| `public/models/viper.glb` | 78948 |
| `public/textures/oolite_viper_diffuse.webp` | 66490 |
| `public/textures/oolite_viper_normal.webp` | 59644 |
| `public/textures/oolite_viper_diffuse_emissive.png` | 6974 |

`MODEL_BOUNDS["oolite_viper.dat"]` was added exactly as planned (`50, 18.1363, 65.1994`); the build raised no `MESH_BOUNDS`, so no re-measurement was needed.

## Verification (all in Docker)

- `assets:check`: `no differences` (run after both commits).
- `docker compose run --rm test npx vitest run tools/oolite-ingest tests/compliance-assets.test.ts tests/compliance.test.ts`: 16 files, 250 tests passed.
- The verbose run lists `NPC ship GLBs > viper.glb is pinned by rows, bytes and geometry` as passed.
- `lint` and `typecheck`: pass.
- Acceptance counts: `buildShipGlb`, `shipGlbFile`, `NPC_SHIP_GLBS` each 1; `texture-encodings.json` 23 files; `manifest.json` 53 files; `ASSETS.md` public models and textures rows 38; `NPC_SHIP_GLBS` 7 and `shipGlbFile` 5 occurrences in glb.test.ts; `Every generated mesh under` in NOTICE 1.
- `git diff --quiet 6ff8fd6 -- public/models/{cobra3,coriolis,buoy}.glb` exits 0, and `git status` after regeneration showed no existing texture or GLB modified.

## Deviations from Plan

**1. [Style] ASSETS.md rows follow the existing block grouping, not strict code-unit order**
- The plan says to insert rows in code-unit path order. The existing public block is grouped (models, baked emissive PNGs, the nebula copies, then WebP files) and is not in strict code-unit order (for example `oolite_cobra3_diffuse_emissive.png` precedes `oolite-nebula-1.png`). The four rows were inserted at the end of the matching group instead of reordering existing rows. `tests/compliance-assets.test.ts` accepts this.
- Files: `ASSETS.md`. Commit `7fce580`.

**2. [Test refinement] Bounds assertion compares per axis directly**
- The plan asks for the POSITION accessor span per axis to equal `MODEL_BOUNDS` within 1e-3. The axis conversion only mirrors z, so the test compares x, y and z spans one to one with relative tolerance 1e-3 and states why.
- Files: `tools/oolite-ingest/convert/glb.test.ts`. Commit `76ace5d`.

**Total deviations:** 2, both cosmetic. **Impact:** none on the build output or gates.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema; T-09-06 to T-09-10 mitigations are in place (naming rule fails closed, byte-identity of the three existing GLBs, one provenance row per file with manifest-copied SHA-256, owner/model agreement asserted in both `emitModels` and the test).

## Notes for later plans

- Plan 09-03 adds eight rows: a name in `NPC_SHIP_GLBS`, one owner in `EMITTED_ENTRIES`, one source in `MODEL_SOURCE_FILES`, one `MODEL_BOUNDS` row, the new PNG names in `VENDORED_TEXTURES`, then the test pins (name count 23 grows, `EMISSIVE_FILES`, the `lossless`/`alpha` counts in `texture-encode.test.ts`). The ASSETS.md row helper is `/tmp/wegolite-09-02/rows.mjs` (scratch only; it may be gone after a reboot, and is easy to rewrite from the plan text). Rows go in the matching group of the public block.
- No `CHANGELOG.md` entry: nothing user-visible until a later plan loads these models.
- `NOTICE` no longer lists GLB names, so later GLBs need no NOTICE edit.

## Self-Check: PASSED

- Four new public files exist; manifest rows present: FOUND.
- Commits `7fce580` and `76ace5d` are ancestors of HEAD: FOUND.
- Plan-level verification (assets:check, Vitest, lint, typecheck): PASSED.
