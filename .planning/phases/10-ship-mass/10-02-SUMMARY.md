---
phase: 10-ship-mass
plan: 02
subsystem: content-tooling
tags: [ship-mass, content-build, zod, fidelity, notice, oolite]

requires:
  - phase: 10-ship-mass
    provides: "computeShipMasses and shipMass (plan 10-01): float32 Oolite mass for any catalogue key"
provides:
  - "ships-npc.json: nine NPC records with exactly seven fields (the Phase 9 six plus a required positive float32 mass)"
  - "ships-client.json: coriolis-station 515,483,904 and oolite_template_cobra3-player 214,737.6875; ships.json stays mass-free"
  - "NpcShipSchema requires mass; CatalogEntrySchema accepts an optional positive mass"
  - "Hand-written golden pinning five worked-example masses, so a mesh or octree rule change fails the golden and assets:check"
  - "FIDELITY.md rows and excerpts E-27 to E-30, the Constants ledger and the criterion 2 reading; NOTICE wording for the derived masses"
affects: [10-03, 10-04, 12-npc-traffic]

actuals:
  tokens: 16700
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One computeShipMasses call in generate.ts feeds every emitter that writes a mass; the buoy masses are computed but not stored yet"
    - "A key with no computed mass fails the build: through safeParse as <key>.mass for NPC records, as a plain Error for client entries"

key-files:
  created: []
  modified:
    - src/content/schemas/ship-npc.ts
    - src/content/schemas/ship.ts
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/ships.ts
    - tools/oolite-ingest/generate.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - tests/content/ships-npc.test.ts
    - tests/content/ships-client.test.ts
    - tests/golden/content/ships-npc.json
    - src/content/generated/ships-npc.json
    - src/content/generated/ships-client.json
    - src/content/generated/manifest.json
    - FIDELITY.md
    - NOTICE

key-decisions:
  - "ships.json keeps no mass (10-RESEARCH Open Question 4, option a): the client test compares entries with mass removed and asserts the masses separately"
  - "The buoy masses are computed in generate.ts (D-02) but written nowhere; their home is the owner question of plan 10-03, implemented in plan 10-04"
  - "The blockage constant in src/sim/hyperspace/countdown.ts is untouched; D-04 is plan 10-03"

patterns-established:
  - "Build-time mechanic rows in FIDELITY.md cite the schema field in src/ that carries the compiled value, with the tools/ module named in the Mechanic cell"

requirements-completed: [DATA-11]

coverage:
  - id: D1
    description: "Nine NPC records carry the float32 mass shipMass computes; the strict schema requires it and rejects a missing, zero, negative or non-finite value and any other extra field"
    requirement: DATA-11
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts"
        status: pass
      - kind: unit
        ref: "tests/content/ships-npc.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hand-written golden pins fields and five worked-example masses (viper 34040.6796875, adder 16045.4931640625, sidewinder 25087.62109375, shuttle 11317.5634765625, gecko 24669.99609375); regeneration is byte-identical"
    requirement: DATA-11
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts#compiles %s to the hand-written worked example"
        status: pass
      - kind: command
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Client file gives the Coriolis 515,483,904 and the Cobra Mk III 214,737.6875, validates against ShipCatalogueSchema, and ships.json carries no mass"
    requirement: DATA-11
    verification:
      - kind: unit
        ref: "tests/content/ships-client.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "FIDELITY.md rows E-27 to E-30 with excerpts, the constants ledger (Cobra Mk III, Viper, Coriolis, buoy, source constants, criterion 2 reading) and NOTICE provenance for the derived masses"
    requirement: DATA-11
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts"
        status: pass
      - kind: unit
        ref: "tests/compliance.test.ts"
        status: pass
    human_judgment: true
    rationale: "Whether the stated reading of roadmap criterion 2 is acceptable is the owner's call, put to them in the plan 10-03 checkpoint; the excerpt verbatim check against a pinned tree is skipped without OOLITE_SRC."

duration: 12min
completed: 2026-11-14
status: complete
plan_head_before: e9eb04ff818aefd34a9f7e6b143d4cc065357636
plan_head_after: 783125dac7d5683988d1e67c60e4f96eb25ff646
commits: 3
---

# Phase 10 Plan 02: Mass in the Compiled Records Summary

**The nine NPC records, the player Cobra Mk III and the Coriolis station now carry Oolite's float32 mass (Viper 34,040.6796875, Cobra 214,737.6875, Coriolis 515,483,904), required by the strict schema, pinned by a hand-written golden and the drift gate, and entered in FIDELITY.md's constants ledger with NOTICE provenance.**

## Performance

- **Duration:** about 12 min
- **Completed:** 2026-11-14
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 14 modified, 0 created

## Accomplishments

- `NpcShipSchema` requires `mass: z.number().positive()`; `compileNpcShips` and `emitNpcShips` take the masses map and a missing mass fails as `<key>.mass`. `generate.ts` computes the masses once after `readModels` (before `emitModels` runs `repairWinding`) for the nine role ships, the client pair and the two buoys.
- `CatalogEntrySchema` accepts an optional positive `mass`; `emitClientShips(catalogue, masses)` writes it on the two client entries and throws a `Wegolite:` error when a key has no computed mass. `ships.json` is byte-unchanged and mass-free (asserted).
- The golden lists `mass` among the fields and pins five worked examples with the mass source appended to each `sources` string. `assets:check` and the byte-identical regeneration test fail if a mesh or octree rule moves a mass.
- FIDELITY.md gains four faithful rows and verbatim excerpts (E-27 mass formula, E-28 subentity addition, E-29 depth rule, E-30 five-level volume limit) and a `## Constants ledger` with the criterion 2 reading and the two historical source constants that are not reproduced. NOTICE records that both compiled files derive from the vendored `.dat` models and stay CC BY-NC-SA 3.0.

## Task Commits

1. **Task 1 (tracer): NPC record mass end to end** - `713a19e` (feat)
2. **Task 2: Cobra Mk III and Coriolis client entries carry their mass** - `a4ae8a6` (feat)
3. **Task 3: Constants ledger, FIDELITY rows E-27 to E-30, NOTICE** - `783125d` (docs)

## Byte sizes and line citations

| File | Before | After |
| --- | --- | --- |
| `src/content/generated/ships-npc.json` | 2,859 | 3,105 |
| `src/content/generated/ships-client.json` | 15,196 | 15,244 |
| `src/content/generated/ships.json` | 706,570 | 706,570 (unchanged) |

The new FIDELITY.md rows cite `src/content/schemas/ship-npc.ts:36` (E-27, E-29, E-30) and `src/content/schemas/ship.ts:97` (E-28), the `mass` field lines.

## Verification

| Check | Result |
| --- | --- |
| `docker compose run --rm test npx vitest run` npc-ships, ship-mass, ships, drift, `tests/content`, fidelity and compliance files | 10 files, 185 passed, 1 skipped (the OOLITE_SRC verbatim case) |
| `docker compose run --rm assets npm run assets:check` | no differences |
| `docker compose run --rm lint` | pass |
| `docker compose run --rm typecheck` | pass |
| Task acceptance greps and `jq` checks (9 NPC masses, 2 client masses, 0 in ships.json, 5 golden masses, 2 `computeShipMasses` matches) | all met |

`verify` and `verify-full` were not run (owner's slow-machine gate policy; tools, schemas, generated data, tests and documents only). Running the fidelity contract with `OOLITE_SRC` pointed at the current Oolite checkout fails on E-04 (`PlayerEntityControls.m`, which changed after the pin); that check needs a tree at `7437f22`. The four new excerpts were copied programmatically from `ShipEntity.m`, `OOMesh.m` and `Octree.m`, which have no diff against `7437f22`.

## Deviations from Plan

None - plan executed exactly as written.

Process notes (not plan deviations): the Task 1 and Task 2 tests were edited in the same pass as the code rather than as separate RED commits (the plan is `type: execute`). `CHANGELOG.md` was not touched: the masses are internal build data with no user-visible change yet; the plan lists no changelog entry and plan 10-03 owns it.

## Known Stubs

None. The buoy masses are computed in `generate.ts` but intentionally stored nowhere until the owner decides their home in plan 10-03.

## Threat Flags

None. No new endpoint, auth path or file access; the only new surface is one number per record, validated by the strict schemas (T-10-05, T-10-06), with provenance recorded in NOTICE (T-10-07) and drift pinned by the golden and `assets:check` (T-10-08).

## Next Phase Readiness

Plan 10-03 can put the D-04 decision (the Coriolis blockage constant: 455,223,200 from the source comment versus the computed 515,483,904, which fails the existing 6,800 m "does not block" pin) and the buoy-mass home to the owner, and ask them to accept the criterion 2 reading now written in FIDELITY.md.

## Self-Check: PASSED

- Files exist: all 14 modified files and this SUMMARY.
- Commits `713a19e`, `a4ae8a6` and `783125d` are ancestors of HEAD; `git rev-list --count e9eb04f..HEAD` was 3 before this SUMMARY commit.
- All acceptance criteria and the plan-level verification commands re-run green after the last code commit.
