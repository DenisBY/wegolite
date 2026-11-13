---
phase: 02-data-pipeline-content-compiler
plan: 03
subsystem: content-pipeline
tags:
  - planetinfo
  - equipment
  - descriptions
  - labels
  - zod
  - vite-code-split
  - golden-fixtures
  - determinism
  - docker

requires:
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 01's canonical JSON, SHA-256 helper, manifest, generator CLI and assets service
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 02's full-corpus OpenStep parser and the 40 vendored Config plists

provides:
  - 2,048 systems in eight g0-g7 chunks of exactly 256 with stable g{galaxy}-s{index} ids
  - presentFields tracking, so percent_cloud is present on Lave and absent on g0-s8
  - 41 equipment records with integer decicredit prices, tech levels and open condition records
  - the six descriptions.plist label arrays plus 34 sysdata-* format templates, no TL table
  - SystemSchema/EquipmentSchema/LabelsSchema as the zod source of truth for each shape
  - an eager g0 and seven Vite code-split g1-g7 chunks behind one loader
  - Lave and the 41 equipment TL/price pairs pinned as versioned goldens

affects:
  - 02-05 shipdata catalogue
  - 02-09 runtime manifest boundary
  - 03 flight in the Lave system
  - 05 economy and station screens
  - 06 galaxy chart

actuals:
  # chars/4 over the authored diff; the 5.9 MB of generated canonical JSON is
  # excluded because the estimate models authored work, not machine output.
  tokens: 18900
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - One converter per source plist, pure function in, canonical bytes out; all file I/O in generate.ts
    - Identity derived from the authored key only, never from a name or coordinate
    - Separate tuple schemas for 4-component colours and 3-component vectors
    - Open zod records for Oolite-owned dictionaries, strict objects only for our output
    - ?raw glob plus runtime JSON.parse instead of a literal-typed JSON module import
    - A module-level count keeps dynamic glob entries in the production build graph

key-files:
  created:
    - src/content/schemas/system.ts
    - src/content/schemas/equipment.ts
    - src/content/schemas/labels.ts
    - tools/oolite-ingest/convert/systems.ts
    - tools/oolite-ingest/convert/equipment.ts
    - tools/oolite-ingest/convert/labels.ts
    - src/content/systems.ts
    - src/vite-env.d.ts
    - src/content/generated/systems/g0.json
    - src/content/generated/systems/g1.json
    - src/content/generated/systems/g2.json
    - src/content/generated/systems/g3.json
    - src/content/generated/systems/g4.json
    - src/content/generated/systems/g5.json
    - src/content/generated/systems/g6.json
    - src/content/generated/systems/g7.json
    - src/content/generated/equipment.json
    - src/content/generated/labels.json
    - tests/golden/content/lave.json
    - tests/golden/content/equipment.json
    - tools/oolite-ingest/convert/systems.test.ts
    - tools/oolite-ingest/convert/equipment.test.ts
    - tools/oolite-ingest/convert/labels.test.ts
    - src/content/systems.test.ts
  modified:
    - tools/oolite-ingest/generate.ts
    - src/main.ts
    - src/content/generated/manifest.json
    - tests/guards/sim-purity.test.ts

key-decisions:
  - "Converters take a parsed PlistValue and return bytes; generate.ts owns every read and write, so a converter test never touches the snapshot."
  - "The colour and vector key lists are two schemas, not one: sun_color is a 4-component colour and grouping it with the vectors would reject all 2,048 systems."
  - "percentCloud is emitted only when authored, plus a sorted presentFields list, so absent never has to be spelled `undefined`."
  - "Galaxy 0 is eager and g1-g7 are seven dynamic ?raw globs; a module-level LAZY_GALAXY_COUNT keeps those entries in the production build graph before Phase 3 consumes them."
  - "sortHint comes from the authored purchase_sort_order (EQ_FUEL = 1); condition records stay verbatim, including `available_to_all = true` as the bare string \"true\"."
  - "No tech-level label table exists: sysdata-tl-value is a string template and the +1 display adjustment belongs to Phase 5."

requirements-completed: [DATA-05, DATA-07, DATA-08]

coverage:
  - id: D1
    description: "2,048 systems emitted as eight chunks of exactly 256, unique g{galaxy}-s{index} ids, ascending systemIndex, one explicit skip list for the two non-system keys and a hard failure for a third."
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/systems.test.ts (six chunk/identity/order/present/SCHEMA/tuple tests)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lave pinned field by field from the committed g0.json with exact equality, including percentCloud 85, raw tech level 4 and no display-adjusted field."
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/systems.test.ts#Lave golden fixture"
        status: pass
    human_judgment: false
  - id: D3
    description: "41 equipment records with integer decicredit prices and tech levels, a tuple6 guard that rejects a short tuple with SCHEMA, and open condition records that preserve unknown keys."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/equipment.test.ts (six tests, including the golden TL/price pairs)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D4
    description: "The six descriptions.plist label arrays with exact lengths and verbatim glyphs, plus 34 sysdata-* templates and no invented tech-level array."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/labels.test.ts (six tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-14 loading split delivered: galaxy0() synchronous over 256 records, loadGalaxy(3) over the seven code-split entries, and a production build with exactly seven g1-g7 chunks and no g0 chunk."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: "src/content/systems.test.ts (four eager/dynamic split tests)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm app npm run build; ls dist/assets | grep -E '^g[1-7]-.*\\.js$' | wc -l => 7, g0 => 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every new artefact is under the drift gate: manifest rows for 11 generated files, assets:check clean on the committed tree, and two consecutive builds byte-identical."
    requirement: DATA-08
    verification:
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check (exit 0)"
        status: pass
      - kind: other
        ref: "sha256sum of manifest and g0-g7 before and after two docker compose run --rm assets (all OK)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm verify (exit 0, 93 unit tests, build, 2 e2e)"
        status: pass
    human_judgment: false

duration: 10 min
completed: 2026-11-03
status: complete

plan_head_before: 67aea74eff99ad570b607722ff6bdbf20c69a15b
plan_head_after: e3a501d916693a106fc8442b72bd4a75d59fe326
commits: 5
---

# Phase 2 Plan 03: Systems, Equipment and Labels Summary

**All 2,048 systems, 41 equipment tuples and the six label arrays now compile from the pinned snapshot into typed, hashed content, with Lave and the equipment anchors pinned and galaxy 0 eager / g1-g7 code-split in the production build.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-03T11:21:58Z
- **Completed:** 2026-11-03T11:32:04Z
- **Tasks:** 3
- **Files modified:** 28 (17 authored, 11 generated)

## Accomplishments

- `planetinfo.plist`'s 2,050 top-level keys become exactly 2,048 systems: `universal` and `interstellar space` are skipped by name, a third non-system key is a `SCHEMA` failure, and each galaxy is asserted at exactly 256 records before it is written.
- Identity is the authored `"<galaxy> <index>"` key alone. Nothing deduplicates by name or coordinates, so equal names survive as separate records, and each chunk is ordered by numeric `systemIndex`.
- Raw fidelity is pinned: `radiusKm` is the authored kilometres (no ×10), `techLevelRaw` is the authored level (no +1), `station` stays the role fragment `coriolis`, and `percent_cloud` is present on Lave and genuinely absent on `g0-s8`.
- The 41 `equipment.plist` positional tuples are destructured through a `tuple6` guard; prices stay integer decicredits with `priceUnit: "decicredits"`, and every condition key is preserved in an open record that is never evaluated.
- `descriptions.plist` yields exactly six label arrays and 34 `sysdata-*` templates, verbatim (`☆ Deadly ☆`, `[population|multiply:0.1|precision:1] Billion`), with no tech-level table invented.
- D-14's loading half is real: `galaxy0()` returns 256 records synchronously, `loadGalaxy(3)` resolves a code-split chunk, and the production build emits exactly seven `g1`-`g7` chunk files with no `g0` chunk.
- `verify` is green end to end: lint, typecheck, `assets:check`, 93 unit tests, the production build, and both Playwright cases.

## Task Commits

Each task was committed atomically (tasks 1 and 2 followed RED → GREEN):

1. **Task 1 RED: pin the 2,048-system chunk contract** — `5cef8d5` (test)
2. **Task 1 GREEN: eight stable-ID galaxy chunks** — `b1acfe4` (feat)
3. **Task 2 RED: equipment tuples and label arrays** — `c3d201b` (test)
4. **Task 2 GREEN: equipment and label emitters** — `1b475c5` (feat)
5. **Task 3: per-galaxy loader and Lave/equipment goldens** — `e3a501d` (feat)

**Plan metadata:** committed after this SUMMARY (docs).

## Files Created/Modified

- `src/content/schemas/system.ts` — `SystemSchema` (open record), `SystemVectorSchema` (3), `SystemColorSchema` (4), `System`, `SystemChunk`.
- `src/content/schemas/equipment.ts` — strict `EquipmentSchema` with an open `conditions` record and integer `price`/`techLevel`.
- `src/content/schemas/labels.ts` — strict `LabelsSchema` pinning the six array lengths and the template record.
- `tools/oolite-ingest/convert/systems.ts` — `compileSystems` / `emitSystems`; key-namespace validation, raw-unit projection, per-galaxy count guard.
- `tools/oolite-ingest/convert/equipment.ts` — `compileEquipment` / `emitEquipment`; `tuple6` narrowing, open condition projection, `purchase_sort_order` as `sortHint`.
- `tools/oolite-ingest/convert/labels.ts` — `compileLabels` / `emitLabels`; six arrays plus sorted string-valued `sysdata-*` templates.
- `tools/oolite-ingest/generate.ts` — now reads four Config plists and emits all 12 files; path-escape and `inputRoot`/`outRoot` rules unchanged.
- `src/content/systems.ts` — eager g0 glob, seven literal dynamic globs, `GALAXY_CHUNK_PATHS`, `galaxy0`, `loadGalaxy`, `loadAnyGalaxy`, `LAZY_GALAXY_COUNT`.
- `src/vite-env.d.ts` — SPDX header plus the `vite/client` reference so `import.meta.glob` is typed.
- `src/main.ts` — imports the loader and reports `homeSystems` / `codeSplitGalaxies` on the existing probe.
- `src/content/generated/systems/g0.json` … `g7.json`, `equipment.json`, `labels.json`, `manifest.json` — committed canonical output.
- `tests/golden/content/lave.json`, `tests/golden/content/equipment.json` — `version: 1` fixtures generated from the committed output and cross-checked against the research table.
- `tests/guards/sim-purity.test.ts` — the two spawned-gate tests now carry an explicit 30 s timeout.

## Decisions Made

- **Pure converters, I/O in `generate.ts`.** The plan's prose wrote `emitSystems(inputRoot)`, but the repository pattern keeps file reads and writes in `generate.ts`; every emitter now takes a parsed `PlistValue` and returns bytes.
- **Two tuple schemas.** `sun_color` is grouped with the seven other four-component colours, not with the vectors. The measured corpus has four components on every colour and three on every vector, and a synthetic 3-component colour / 4-component vector are each rejected.
- **`z.looseObject` for `SystemSchema`.** This is the zod 4 spelling of the plan's `.passthrough()`: the record models all 40 authored keys but must not reject a key a future bump adds.
- **`presentFields` instead of `undefined`.** A sorted authored-key list distinguishes present from absent without ever emitting `undefined`, which is what keeps `percent_cloud` honest.
- **`?raw` at runtime, not JSON modules.** Eight literal-typed 256-record imports would make `tsc` infer large object types; `JSON.parse` after a raw glob keeps the type surface to `SystemChunk` and still gives Vite the code split.
- **A module-level `LAZY_GALAXY_COUNT` is load-bearing.** An unused dynamic glob is tree-shaken, which silently emitted zero chunks; referencing the count from the app probe keeps all seven dynamic entries in the build graph.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The production build tree-shook all seven dynamic galaxies**
- **Found during:** Task 3 (build gate)
- **Issue:** The plan requires `dist/assets` to contain seven `g1`-`g7` chunks, but `src/content/systems.ts` had no consumer in the build graph. Nothing imported the module, and once `main.ts` imported only `galaxy0`, Rolldown removed the unused `lazyGalaxies` object and its dynamic imports. The first build emitted a single `index-*.js` and zero galaxy chunks.
- **Fix:** `src/main.ts` now imports the loader (so `galaxy0` and the module are in the graph) and reads `LAZY_GALAXY_COUNT`, which keeps the lazy glob object alive. Two additive probe fields (`homeSystems`, `codeSplitGalaxies`) report the split. No plan-listed file consumed the loader, so the app entry is the smallest honest consumer until Phase 9's content boundary lands.
- **Files modified:** `src/main.ts`, `src/content/systems.ts`
- **Verification:** `docker compose run --rm app npm run build` emits `g1`-`g7` (7 files, 0 `g0`); `src/content/systems.test.ts#declares exactly one eager glob…`; the index bundle contains no g1 system name.
- **Committed in:** `e3a501d`

**2. [Rule 1 - Bug] Sim-purity gate test exceeded Vitest's 5 s default**
- **Found during:** Task 3 (full `verify`)
- **Issue:** `tests/guards/sim-purity.test.ts` spawns `npx eslint` with a type-aware program. The added tool and schema files pushed that spawn to ~5.9 s, past Vitest's 5 s default, so `verify` failed on a timeout rather than an assertion. The first task-3 `verify` run exited 1 for this reason.
- **Fix:** Both spawned-gate cases carry an explicit `30_000 ms` timeout with a comment naming the cause. No assertion was weakened.
- **Files modified:** `tests/guards/sim-purity.test.ts`
- **Verification:** `docker compose run --rm verify` exits 0 (93 tests, build, 2 e2e).
- **Committed in:** `e3a501d`

### Process notes

**3. Emitter signature differs from the plan's prose.** Emitters take a parsed `PlistValue` rather than `inputRoot`, keeping the plan-01 converter pattern: all reads and writes stay in `generate.ts`. `inputRoot`/`outRoot`, the mkdtemp check and the path-escape assertion are unchanged.
- **Committed in:** `b1acfe4`, `1b475c5`

**4. A bare `true` in conditions stays the string `"true"`.** `equipment.plist` writes `available_to_all = true;`, which the parser classifies as a bare atom, not a boolean (the corpus uses `yes`/`no` for booleans). The record preserves `"true"` verbatim; coercing it would bake Oolite's runtime rule into content, so the test asserts the authored string instead.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug) + 2 process notes.
**Impact on plan:** The build-graph fix was required for the plan's own D-14 acceptance gate and changed only two additive probe fields; the timeout fix restored a green `verify` without weakening a gate. No scope creep.

## Issues Encountered

- `dist/` is rewritten by the container as root. Removing it from the host user fails with `Permission denied`, so the clean rebuild used `docker compose run --rm app sh -lc 'rm -rf dist && npm run build'`. Pre-existing container behavior, no repository change.
- Vite still reports the pre-existing "chunks larger than 500 kB" advisory: the g0 chunk is ~694 kB of raw JSON by design (D-14 eager galaxy 0).

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- Plan 02-05 can add the shipdata catalogue beside the three converters; `generate.ts` reads one more Config plist and the manifest row appears automatically.
- Phase 3 has a synchronous `galaxy0()` with Lave at `g0-s7`, the exact coordinates (`chartX` 20, `chartY` 173) and the raw fields it needs to place the system.
- Phase 5 has the equipment catalogue and the six label arrays; the +1 tech-level display and the population phrasing are still presentation, not content.
- Open item for 02-09: the runtime manifest boundary does not exist yet, so `src/content/systems.ts` is the only content loader wired into the app today.

---

## Self-Check: PASSED

- [x] `tools/oolite-ingest/convert/systems.test.ts` (8), `equipment.test.ts` (6), `labels.test.ts` (6) and `src/content/systems.test.ts` (4) all pass.
- [x] `src/content/generated/systems/g0.json` … `g7.json` exist with 256 records each; Lave `g0-s7` has `percentCloud: 85` and `g0-s8` has none.
- [x] `equipment.json` has 41 `priceUnit: "decicredits"` records; `labels.json` carries `sysdata-tl-value`.
- [x] `docker compose run --rm assets npm run assets:check` exits 0; two consecutive builds leave every hash unchanged.
- [x] `docker compose run --rm app npm run build` emits exactly seven `g1`-`g7` chunks and no `g0` chunk.
- [x] `docker compose run --rm verify` exits 0.
- [x] Five commits exist on this branch (`5cef8d5`, `b1acfe4`, `c3d201b`, `1b475c5`, `e3a501d`).
- [x] `grep -rn "localeCompare\|toFixed\|Math.random\|Date.now" tools/oolite-ingest/convert/` returns nothing.

*Phase: 02-data-pipeline-content-compiler*
*Completed: 2026-11-03*
