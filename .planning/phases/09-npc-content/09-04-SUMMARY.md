---
phase: 09-npc-content
plan: 04
subsystem: content
tags: [oolite, npc-ships, shipdata, schema, golden, lazy-loader, drift-gate]
status: complete
requires:
  - phase: 09-npc-content
    provides: "09-03 nine NPC GLBs, EMITTED_ENTRIES / MODEL_SOURCE_FILES / NPC_SHIP_GLBS rows and shipGlbFile"
provides:
  - "src/content/generated/ships-npc.json: nine six-field NPC records (2,859 bytes), drift-gated"
  - "NpcShipSchema / NpcShipCatalogueSchema (strict) and the import-free NPC_GLB_PATH_PATTERN"
  - "compileNpcShips / emitNpcShips in the generator emitted list"
  - "loadNpcCatalogue / findNpcShip, a lazy validated chunk that nothing on the boot path imports"
affects: [09-05, 10, 12]
plan_head_before: a22bc4f2f5d609c177216d33116769c2242c4891
plan_head_after: f22cf429f386a6922ded6e7fae794422cb472287
actuals:
  tokens: 28000
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "record set equals emitted model set: each record's GLB row must be owned by its key and built from its model alone"
    - "hand-written golden never produced by the compiler; test compares compiler output, template parents, golden and committed bytes"
    - "source-scan boot-path guard instead of an ESLint rule for non-sim code"
key-files:
  created:
    - src/content/npc-glb-path.ts
    - src/content/schemas/ship-npc.ts
    - src/content/ships-npc.ts
    - src/content/generated/ships-npc.json
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - tests/golden/content/ships-npc.json
    - tests/content/ships-npc.test.ts
  modified:
    - tools/oolite-ingest/generate.ts
    - src/content/types.ts
    - src/content/generated/manifest.json
    - NOTICE
key-decisions:
  - "NPC records carry exactly six fields (key, roles, aiType, scanClass, model, glb); roles stay verbatim with probability suffixes; no stat is compiled (DATA-15 deferred)."
  - "aiType and scanClass default to Oolite's own fallbacks (nullAI.plist, CLASS_NEUTRAL); only the Viper authors a scan class."
  - "glb is derived as models/ + shipGlbFile(model), never copied from the plist, and the record's key must be the sole owner of that GLB row."
requirements-completed: [DATA-10, DATA-13]
coverage:
  - id: D1
    description: "Nine six-field NPC records compiled from the resolved shipdata plist, equal to the hand-written golden (viper, adder, sidewinder, shuttle, gecko), their template parents and the committed file"
    requirement: DATA-10
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts"
        status: pass
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check -> no differences"
        status: pass
    human_judgment: false
  - id: D2
    description: "The NPC record set equals the lazily fetched model set: each glb is models/<name>.glb from the shared rule, exists under public/, and is owned by the record's own key"
    requirement: DATA-13
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts#derives each glb from the model"
        status: pass
    human_judgment: false
  - id: D3
    description: "loadNpcCatalogue lazily loads and strict-validates the records; findNpcShip names a missing key; only the loader names the generated file under src/"
    requirement: DATA-13
    verification:
      - kind: unit
        ref: "tests/content/ships-npc.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "NOTICE covers ships-npc.json as a CC BY-NC-SA 3.0 derivative of shipdata.plist"
    requirement: DATA-10
    verification:
      - kind: unit
        ref: "tests/compliance.test.ts"
        status: pass
    human_judgment: false
---

# Phase 9 Plan 04: NPC ship records and lazy catalogue Summary

Nine NPC ship records (roles, AI name, scan class, model, GLB path) are compiled from the resolved `shipdata.plist` into a drift-gated `ships-npc.json`, pinned by a hand-written golden, and read through a lazy, strictly validated loader that nothing on the boot path imports.

## Run record

| Item | Value |
| --- | --- |
| PLAN_BASE | `a22bc4f2f5d609c177216d33116769c2242c4891` |
| Plan head after | `f22cf429f386a6922ded6e7fae794422cb472287` |
| Tasks | 2 (Task 1 tracer, Task 2 auto with tdd; both autonomous) |
| Completed | 2026-11-13 |

## Task commits

| Task | Commit | Result |
| --- | --- | --- |
| 1 (tracer) Records, schema, compiler, generator wiring, golden, NOTICE | `c6b076d` | `ships-npc.json` (9 records), manifest row, 18 compiler tests |
| 2 Lazy loader, type-only door, boot-path guard | `f22cf42` | `loadNpcCatalogue` / `findNpcShip`, 10 loader tests |

## What was built

- `ships-npc.json` is 2,859 bytes; `manifest.json` now lists 102 files. The Viper is the only record with an authored `scanClass` (`CLASS_POLICE`); the other eight compile to the `CLASS_NEUTRAL` default of ShipEntity.m:520 and 2126-2127. No record uses the `nullAI.plist` default; all nine author an `ai_type`.
- The compiler refuses a record whose GLB row is not owned by its own key and built from its own model alone, so the record set cannot drift from the emitted model set. A swapped viper model (`oolite_adder.dat`) is tested to fail.
- The strict schema rejects an extra field (for example `mass`, which Phase 10 will add deliberately), a glb outside `models/`, an off-origin glb and empty roles.
- `src/content/ships-npc.ts` starts with `ships` so the existing sim ESLint denial `**/content/ships*` covers it; `types.ts` exports `NpcShip` and `NpcShipCatalogue` as types only. A source scan fails if any other non-test file under `src/` names the generated file. Phase 12 relaxes that guard in the same commit that adds its first consumer.

## Plist values against the planned worked examples

All five worked examples (viper, adder, sidewinder, shuttle, gecko) matched the plist exactly; no value differed. The golden's `sources` cite the plist lines I re-read (for example gecko `ai_type` at 2279, model 2325, roles 2327).

## Verification (all in Docker)

- `vitest run tools/oolite-ingest/convert/npc-ships.test.ts tools/oolite-ingest/drift.test.ts tests/content tests/compliance.test.ts tests/guards/content-boundary.test.ts`: 8 files, 76 tests passed.
- `assets:check`: `no differences`. `lint` and `typecheck`: pass.
- Acceptance counts: `jq length` 9; key set `[["aiType","glb","key","model","roles","scanClass"]]`; viper `CLASS_POLICE`; manifest 102 files; `emitNpcShips` appears twice in `generate.ts`; golden has 5 examples; NOTICE names `ships-npc.json` on one line; `npc-glb-path.ts` has one code line and `ship-npc.ts` imports it once; `rg -l 'ships-npc' src` (non-test, non-generated) prints only `src/content/ships-npc.ts`.
- `verify` and `verify-full` were not run (owner gate policy for plans 01-04).

## Deviations from Plan

**1. [Rule 1 - Bug] Unused import in the new test**
- **Found during:** Task 1 lint and typecheck.
- **Issue:** `join` was imported in `npc-ships.test.ts` and never used.
- **Fix:** removed the import. **Files modified:** `tools/oolite-ingest/convert/npc-ships.test.ts`. **Commit:** `c6b076d` (fixed before the commit).

**Total deviations:** 1 auto-fixed (trivial). **Impact:** none.

## Auth gates

None.

## Known Stubs

None. `loadNpcCatalogue` has no consumer yet by design (Phase 12), which is guarded rather than a stub.

## Threat Flags

None. T-09-16 to T-09-20 mitigations are in place: `glb` is derived, never copied, and both it and `model` are pattern-checked at build time and again in the loader; the schema is strict with six fields; `src/sim` is denied by the existing `**/content/ships*` rule and sees types only; NOTICE covers the generated file.

## Notes for later plans

- No `CHANGELOG.md` entry: nothing is user-visible until the populator loads these records.
- Plan 09-05's asset cache imports `NPC_GLB_PATH_PATTERN` from `src/content/npc-glb-path.ts` (no import there, so no zod in the render layer).
- The `aiType` is the authored `ai_type`; Oolite swaps it from `autoAImap.plist` at spawn when `auto_ai` is on. That is Phase 12's decision, not compiled here.
- The `coverage` of the new loader code is the success path only; its two error branches (missing glob entry, failed validation) are not reachable through the static glob in a unit test, and the `src/content` 66% floor is not at risk.

## Self-Check: PASSED

- All eight created files exist on disk: FOUND.
- Commits `c6b076d` and `f22cf42` are ancestors of HEAD: FOUND.
- Plan-level verification (Vitest, assets:check, lint, typecheck): PASSED.
