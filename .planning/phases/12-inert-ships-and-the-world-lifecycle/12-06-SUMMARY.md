---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 06
subsystem: content
tags: [content-build, collision-radius, ship-npc, fidelity, oolite-mesh]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-04/12-05: ShipField and the mass-lock refusal path that consume per-ship mass"
provides:
  - "hullRadius(key, modelFile, mesh) and computeShipRadii(keys, catalogue, meshes) in tools/oolite-ingest/convert/ship-radius.ts"
  - "NPC record field radius (float32 collision radius, metres) through compileNpcShips/emitNpcShips, NpcShipSchema, ships-npc.json, the manifest and the golden"
  - "FIDELITY row E-33, the NOTICE provenance sentence and a Key Decisions row"
affects: [12-07]
status: complete
actuals:
  tokens: 7200
  tasks: 2
  commits: 2
plan_head_before: 74e8f07f30501afb7d097f48fb94907713e4fd0f
plan_head_after: 7bd022aad4736654bcdce81e6c21fd9bbda058d6
tech-stack:
  added: []
  patterns:
    - "a build-time hull measurement copies the computeShipMasses shape: a Map keyed by ship key, one call per key, failure through a SCHEMA ContentError naming key and file"
key-files:
  created:
    - tools/oolite-ingest/convert/ship-radius.ts
    - tools/oolite-ingest/convert/ship-radius.test.ts
  modified:
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - tools/oolite-ingest/generate.ts
    - src/content/schemas/ship-npc.ts
    - src/content/generated/ships-npc.json
    - src/content/generated/manifest.json
    - tests/golden/content/ships-npc.json
    - tests/content/ships-npc.test.ts
    - FIDELITY.md
    - NOTICE
    - .planning/PROJECT.md
key-decisions:
  - "Compile each NPC ship's collision radius next to its mass (owner decision 2026-11-14): float32 sqrt of the largest float32 squared vertex distance (OOMesh.m 1795-1822); the solid-subentity extension (ShipEntity.m 2028-2044) is not ported and the build fails if an NPC entry has one."
requirements-completed: []
---

# Phase 12 Plan 06: Compiled NPC collision radius Summary

Each of the nine NPC records in `ships-npc.json` now carries `radius`, Oolite's float32 hull collision radius computed from the vendored `.dat` vertices at build time, so plan 12-07's populator spawns inert ships with real data and the world hash does not churn later. WORLD-15 is only partly delivered here and is not marked complete.

## Performance

- **Duration:** about 20 min
- **Started:** 2026-11-14T17:36Z
- **Completed:** 2026-11-14T17:56Z
- **Tasks:** 2
- **Files modified:** 13 (two created)

## Accomplishments

- **Tracer (Task 1).** `hullRadius` rounds every vertex coordinate and every operation to float32 (`fround(fround(fround(x*x) + fround(y*y)) + fround(z*z))`, the largest over the mesh, then `fround(sqrt(...))`), as `OOMesh.m:1801-1822` does with `float`. `computeShipRadii` resolves each key's model like `shipMass` and fails closed with a `SCHEMA` ContentError naming key and file for an unknown key, a missing model or mesh, an empty vertex list, a zero, non-finite or non-positive result, and any non-flasher subentity (message: "does not implement the subentity radius term (ShipEntity.m:2028-2044)"). `compileNpcShips`/`emitNpcShips` take a third `radii` argument and `NpcShipSchema` requires `radius: z.number().positive()`; `generate.ts` computes the radii from the same parsed models beside the masses. Regeneration changed only `ships-npc.json` and its manifest row.
- **The nine radii** (metres, float32): adder 29.030517578125, cobramk1 39.260494232177734, gecko 31.911365509033203, krait 50.196590423583984, mamba 44.3935661315918, moray 36.18608093261719, shuttle 22.7517147064209, sidewinder 37.465919494628906, viper 35.057655334472656.
- **Independence of the oracle.** Three computations agree: the production code, a `Float32Array` loop in ship-radius.test.ts that shares no code with it, and a plain Node script over the raw `VERTEX` block run in the container (`/tmp/wegolite-12-06/radius.mjs`, not in the repo; it also showed a float64 result within 1.7e-7 relative). The golden values were taken from the Node script, not from the generated file.
- **Golden extended to all nine ships.** The hand-written golden had five examples; the acceptance row asks for ten `"radius"` lines (fields plus nine entries), so cobramk1, krait, mamba and moray were added with roles and AI name checked against `oolite_template_*` in shipdata.plist and masses against the pinned hull table.
- **Docs (Task 2).** NOTICE says the `radius` comes from the same vendored hull models. FIDELITY.md has row E-33 (Wegolite cell `src/content/schemas/ship-npc.ts:42`, Oolite `OOMesh.m:1803-1822`, faithful) with the verbatim excerpt, and an Open items bullet. PROJECT.md has the Key Decisions row "Compile each NPC ship's collision radius next to its mass", status "Phase 12 plan 12-06".

## Gates run (all in Docker, local)

| Gate | Result |
| --- | --- |
| Targeted Vitest: ship-radius, npc-ships, ship-mass, tests/content/ships-npc | 4 files, 139 tests passed |
| `docker compose run --rm assets` then `assets npm run assets:check` | wrote 103 files; only ships-npc.json and manifest.json changed; "no differences" |
| Fidelity contract and compliance with `OOLITE_SRC` at 7437f22 (`git archive`) | 2 files, 25 tests passed, verbatim excerpt case ran (not skipped) |
| `docker compose run --rm test` (full, coverage) | exit 0, 145 files, 2,871 passed, 2 skipped, no coverage error |
| `docker compose run --rm lint` | exit 0 (ESLint and Prettier clean) |
| `docker compose run --rm typecheck` | exit 0, no `error TS` |

No `verify`/`verify-full`, no remote run: the plan's gate policy excludes them for build-tool and content work.

Acceptance counts: `computeShipRadii` in generate.ts 2; `radius: z.number().positive()` in the schema 1; `"radius"` in ships-npc.json 9 lines (one per record), in the golden 10; node check of the nine finite positive radii exit 0; `E-33` in FIDELITY.md 3 lines; `radius` in NOTICE 2; the Key Decisions row 1.

## Task commits

| Task | Commit | Note |
| --- | --- | --- |
| 1 | ce46c4e | feat: hullRadius/computeShipRadii, radius through compile, schema, generated file, golden |
| 2 | 7bd022a | docs: NOTICE, FIDELITY E-33, Key Decisions row |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] FIDELITY Fidelity cell must be exactly `faithful`**
- **Found during:** Task 2 (fidelity contract run)
- **Issue:** the first draft of row E-33 put an explanatory sentence in the Fidelity cell, which the contract test rejects (cell must be `faithful` or a divergence quoting PROJECT.md).
- **Fix:** the cell is `faithful`; the no-solid-subentity note went into the Mechanic cell and a FIDELITY Open items bullet.
- **Files modified:** FIDELITY.md
- **Commit:** 7bd022a

### Departures worth a reviewer's eye (no rule triggered)

- **Excerpt range.** The plan asks for one range of at most 20 lines holding both the maximum loop and the `sqrtf`. `OOMesh.m:1801` (`magnitude2`) to 1822 is 22 lines, so E-33 quotes 1803-1822, the plan's own example: it holds the running-maximum update and the `sqrtf` but not the `magnitude2` line. The Open items bullet and the ship-radius.ts module comment cite 1801.
- **Rounding of inputs.** The plan's formula writes `fround(x*x)` on the parsed double; ship-radius.ts first rounds each coordinate to float32 (Oolite stores `float` vertices, and octree.ts does the same). The test loop and the Node script use the same rule. The float64 result differs from the float32 one by at most about 1.7e-7 relative.
- **Test-first order.** The implementation file was written before the new test file existed, so no separate RED run was recorded for ship-radius.test.ts; the rows were run green with the implementation, and the independent-loop values come from a separate script.
- **Golden size.** Four examples (cobramk1, krait, mamba, moray) were added to the golden so all nine ships are pinned, as the acceptance row's count assumes.

## Known Stubs

None.

## Threat Flags

None. The new field flows build input to generated JSON to a strict schema, as T-12-13, T-12-14 and T-12-15 describe; no new endpoint or trust boundary.

## Self-Check: PASSED

- FOUND: tools/oolite-ingest/convert/ship-radius.ts, tools/oolite-ingest/convert/ship-radius.test.ts
- FOUND commits ce46c4e and 7bd022a on HEAD
