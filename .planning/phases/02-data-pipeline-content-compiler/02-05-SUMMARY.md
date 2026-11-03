---
phase: 02-data-pipeline-content-compiler
plan: 05
subsystem: content-pipeline
tags:
  - shipdata
  - like-ship
  - inheritance
  - cycle-detection
  - market-definition
  - coriolis
  - zod
  - golden
  - determinism

requires:
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 01's ContentError contract, canonical JSON/hash, manifest and assets service
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 02's hardened OpenStep parser (bare tokens stay strings, last-wins dictionaries)
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 03/04's committed generated tree and the five vendored .dat model filenames

provides:
  - mergeShip() with Oolite's shallow merge, two non-inheritable keys and five alias pairs
  - applyOverrides() that patches raw entries before resolution and cannot add one
  - resolveAll() with memos, a visiting stack, closed-chain LIKE_SHIP_CYCLE, LIKE_SHIP_DANGLING and a 64-hop cap
  - CatalogEntrySchema with a tri-state market_definition and an open typed ShipDef
  - 194-entry ships.json (81 templates, 102 usable, 7 vendored models, 180/8/6 tri-state)
  - the Coriolis composite's 17 subentities, with the dock selected by subentity_key and both raw is_dock and typed isDock
  - model-path containment under third_party/oolite/Models with a DAT_MESH failure
  - a versioned golden pinning the counts, the Cobra chain and both representative entries

affects:
  - 02-06 GLB writer (modelVendored, shipDef.materials/subentities, dock at 0,0,500.2561)
  - 03 flight (Cobra flight stats and smooth flag)
  - 04 station approach (Coriolis subentity composition)
  - 05 economy (market_definition tri-state)

actuals:
  # chars/4 over the authored diff (65,474 bytes); the 706 KB generated
  # ships.json and its manifest row are excluded: the estimate models authored work.
  tokens: 16368
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - Resolution is a join - insertion order produces identical canonical output, proven with a fast-check shuffle
    - Depth is counted in like_ship hops, not entries, so a four-entry chain reports 3
    - Dictionary storage stays Map throughout resolution; a plist key can never reach a prototype
    - Typed projection plus a verbatim extras record; the raw subentities array is deliberately kept beside the typed one
    - Raw Oolite sub-dictionaries are open records; strictness applies only to our own CatalogueEntry

key-files:
  created:
    - tools/oolite-ingest/like-ship.ts
    - tools/oolite-ingest/like-ship.test.ts
    - tools/oolite-ingest/convert/ships.ts
    - tools/oolite-ingest/convert/ships.test.ts
    - src/content/schemas/ship.ts
    - src/content/generated/ships.json
    - tests/fixtures/shipdata/cycle.plist
    - tests/fixtures/shipdata/dangling.plist
    - tests/fixtures/shipdata/overrides-adds-entry.plist
    - tests/golden/content/ships.json
  modified:
    - tools/oolite-ingest/generate.ts
    - src/content/generated/manifest.json
    - tools/oolite-ingest/convert/equipment.ts
    - tools/oolite-ingest/openstep/parser.ts

key-decisions:
  - "maxChainDepth counts like_ship hops: the pinned data's longest chain is four entries (anaconda-pirate -> template -> anaconda -> template), i.e. depth 3, which matches the research's measured value; counting entries would have reported 4."
  - "extras keeps every resolved key that the typed record does not consume except is_template/model/market_definition/materials, including the raw subentities array (so is_dock stays the authored string \"true\") and custom_views. The alternative - dropping custom_views - would violate the must-have that no authored value is dropped."
  - "The emitted catalogue is 706,617 bytes of canonical JSON. The plan's ~532 KB full-inline figure is a compact-JSON measurement; the equivalent canonical full inline is ~496 KB, and duplicating the typed surface plus verbatim extras can exceed it. Fidelity was chosen over the size note; the test keeps a 750 KB regression bound."
  - "A model value is resolved against third_party/oolite/Models and rejected with DAT_MESH if it escapes, before any file is opened."
  - "The override fixture carries both halves (base and overrides) as two top-level keys so one sub-15-line file proves both the patch and the ignored added key."

requirements-completed: [DATA-02, DATA-07, DATA-08]

coverage:
  - id: D1
    description: "like_ship resolution matches Oolite: shallow merge, like_ship stripped, display_name/is_template inherited only when the child declares them, five alias pairs collapsed, overrides applied before resolution and unable to add entries, cycles carry the closed chain, dangling targets fail unless is_external_dependency, depth capped at 64, and 20 shuffled insertions produce identical canonical output."
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/like-ship.test.ts (12 tests including the fast-check order-independence property)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The 194-entry catalogue is typed compiled content: 81 templates, 102 usable, seven vendored-model entries, the 180/8/6 market_definition tri-state, the Coriolis's 17 subentities with the keyed dock, and model paths confined to the vendored Models directory."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/ships.test.ts (9 catalogue tests)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check (no differences; manifest carries ships.json's SHA-256)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The versioned golden pins 194/81/102/3, the seven vendored keys, the tri-state counts, the Cobra anchors and the Coriolis dock, and the full repository verification is green with byte-stable generation."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/ships.test.ts#ship golden fixture (4 tests)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm verify (exit 0: lint, typecheck, assets:check, 139 unit tests, build, 2 Playwright)"
        status: pass
      - kind: other
        ref: "two consecutive docker compose run --rm assets; combined sha256 of src/content/generated unchanged"
        status: pass
    human_judgment: false

duration: 14 min
completed: 2026-11-03
status: complete

plan_head_before: 0c60c6d189f21b6c42972960257b0fd63d663832
plan_head_after: 4114ff8c565e0407b2e7bd5cadcf81fd74adaae6
commits: 6
---

# Phase 2 Plan 05: `like_ship` Resolution and the Shipdata Catalogue Summary

**Oolite's real inheritance rules now resolve the pinned `shipdata.plist` into a 194-entry typed catalogue — 81 templates, 102 usable, seven vendored models, a 180/8/6 `market_definition` tri-state and the Coriolis composite's 17 subentities with its dock at `(0, 0, 500.2561)`.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-03T11:42:00Z (approx.)
- **Completed:** 2026-11-03T11:56:00Z
- **Tasks:** 3
- **Files modified:** 12 authored files plus the generated catalogue and manifest

## Accomplishments

- `mergeShip` reproduces `-mergeShip:withParent:` exactly: child wins, `like_ship` is always stripped, `display_name` and `is_template` are inherited only when the child declares them (presence, not string type), and the five alias pairs collapse to the child's spelling. With the naive "inherit everything" rule the catalogue would report 173 templates instead of 81.
- `applyOverrides` runs on the raw entries before resolution and ignores an override key the base dictionary does not declare, so the pinned snapshot's lone `griff_spacebar_subent_template` override stays inert: 194 entries in, 194 out.
- `resolveAll` resolves with memos and an explicit visiting stack. A cycle reports the whole closed chain (`a → b → c → a`), a missing target reports `LIKE_SHIP_DANGLING` with the chain to the missing key unless the entry declares `is_external_dependency`, and a chain beyond 64 hops fails instead of recursing. Twenty shuffled insertions produce byte-identical canonical output.
- The catalogue keeps all 102 usable entries rather than applying Oolite's missing-model prune. `modelVendored` marks exactly seven usable entries (five Cobra variants and two stations), so plan 06 knows which entries produce geometry.
- `market_definition` is a discriminated union: 180 `absent`, 8 `empty` (the empty authored array inherited into the station entries, Coriolis included) and 6 `explicit` (the rock-hermit definitions, preserved verbatim with `type = "class"`, `name = "oolite-mining"`).
- The Coriolis projects 17 subentities: three keyed entities in source order (`faceplate`, `tris`, `dock`) and 14 flashers. `extras.subentities[2].is_dock` remains the authored string `"true"`, `shipDef.subentities[2].isDock` is boolean `true`, and both carry `[0, 0, 500.2561]`. The dock is selected by `subentity_key`/`isDock`, never by index.
- A resolved model path is joined under `third_party/oolite/Models` and any escape throws `DAT_MESH` naming the entry and the attempted path before the file is opened.
- `ships.json` is wired into `generate.ts` and the manifest records its SHA-256. Two consecutive `assets` runs change no byte; `verify` exits 0 with 139 unit tests.

## Task Commits

Each task was committed atomically (the two TDD tasks followed RED → GREEN):

1. **Task 1 RED: pin the like_ship merge, override and cycle contract** — `236a90e` (test)
2. **Task 1 GREEN: resolve like_ship, overrides and cycles** — `5d0dd2b` (feat)
3. **Task 2 RED: pin the shipdata catalogue, Coriolis composite and tri-state** — `0bb7de7` (test)
4. **Task 2 GREEN: compile the 194-entry shipdata catalogue** — `9e34d25` (feat)
5. **Task 3: pin the catalogue counts and the Cobra chain** — `087ac06` (test)
6. **Follow-up: keep the banned-function grep out of comments** — `4114ff8` (chore)

**Plan metadata:** committed after this SUMMARY (docs).

## Files Created/Modified

- `tools/oolite-ingest/like-ship.ts` — `ShipFields`, `LIKE_SHIP_NON_INHERITABLE`, `ALIAS_PAIRS`, `MAX_LIKE_SHIP_DEPTH`, `mergeShip`, `applyOverrides`, `resolveAll`, `ResolutionResult`.
- `tools/oolite-ingest/like-ship.test.ts` — 12 tests across merge rules, aliases, cycles, dangling/external, the depth cap, order independence and the Cobra chain.
- `tools/oolite-ingest/convert/ships.ts` — `compileShips`, `emitShips`, `coerceBoolean`, `coerceVector`, `VENDORED_MODEL_FILES`, `SHIPS_PATH`.
- `tools/oolite-ingest/convert/ships.test.ts` — 13 tests: counts, anchors, tri-state, vendored keys, extras, size bound, path escape and the golden.
- `src/content/schemas/ship.ts` — `MarketDefinitionSchema`, `SubentitySchema`, `ShipDefSchema`, `CatalogEntrySchema`, `ShipCatalogueSchema` and their types.
- `tools/oolite-ingest/generate.ts` — reads `shipdata.plist` and `shipdata-overrides.plist`, emits `ships.json`.
- `src/content/generated/ships.json`, `manifest.json` — the catalogue and its hashed manifest row.
- `tests/fixtures/shipdata/{cycle,dangling,overrides-adds-entry}.plist` — three small failure/fixture dictionaries.
- `tests/golden/content/ships.json` — the versioned counts, vendored keys, tri-state and both anchors.
- `tools/oolite-ingest/convert/equipment.ts`, `openstep/parser.ts` — comment wording only.

## Decisions Made

- **Depth is counted in hops.** The plan and golden require `maxChainDepth: 3`, but the pinned data's longest chain is four entries (`anaconda-pirate → template → anaconda → template`). Counting entries would report 4; counting `like_ship` hops reports the measured 3 and still describes the Cobra chain as three entries.
- **`extras` keeps the raw `subentities` array, stats, `roles` and `custom_views`.** Only `is_template`, `model`, `market_definition` and `materials` are excluded because the typed record consumes them. This preserves the authored `is_dock` string and the must-have that no authored value is dropped.
- **`ShipDef` is open, `CatalogEntry` is strict.** Materials and every subentity dictionary stay open records so a snapshot bump does not fail the build, while our own record rejects an unexpected field.
- **`coerceVector` handles all three Oolite vector encodings.** The Coriolis flashers use a space-separated string and the dock uses an array; a dictionary form is supported for future data.
- **`market_definition` never computes prices.** `definitions` is carried as raw dictionaries; Phase 5 owns the economy.

## Deviations from Plan

### Auto-fixed / process adaptations

**1. [Rule 1 - Interpretation] `maxChainDepth` counts hops, not entries**
- **Found during:** Task 1 GREEN
- **Issue:** Counting chain entries reported 4, while the plan's measured value is 3. The pinned `anaconda-pirate` chain has four entries but three `like_ship` hops.
- **Fix:** `ResolutionResult.maxChainDepth` is `chain.length - 1`. The Cobra chain remains three entries and the golden matches.
- **Files modified:** `tools/oolite-ingest/like-ship.ts`, `like-ship.test.ts`
- **Committed in:** `5d0dd2b`

**2. [Rule 1 - Conflict] The projection is 706,617 bytes, above the plan's ~532 KB note**
- **Found during:** Task 2 GREEN
- **Issue:** The plan asks for `extras` to hold every remaining resolved key verbatim *and* for the file to stay well under the ~532 KB full-inline figure. Keeping `custom_views` (ten templates, inherited widely) plus the typed surface makes that impossible: the canonical full inline is ~496 KB, and the faithful projection with extras is 706 KB. Dropping `custom_views` would have violated the must-have "no authored value is dropped".
- **Fix:** Fidelity won. The emitted catalogue is a projection of the typed surface plus verbatim extras; the test asserts a 750 KB regression bound and documents the measurement. Acceptance criteria for counts, tri-state, anchors and paths are all met.
- **Files modified:** `tools/oolite-ingest/convert/ships.ts`, `ships.test.ts`, `src/content/generated/ships.json`
- **Committed in:** `9e34d25`

**3. [Rule 3 - Verification] Reworded comments that matched the banned-function grep**
- **Found during:** plan-level verification
- **Issue:** `grep -rn "eval\|new Function" tools/oolite-ingest/` matched doc comments saying "evaluated" and an older parser comment.
- **Fix:** Reworded four comments to "interpreted"/"run as code"; no code changed.
- **Files modified:** `like-ship.ts`, `convert/ships.ts`, `convert/equipment.ts`, `openstep/parser.ts`
- **Verification:** the grep now returns nothing; `lint` and `verify` are green.
- **Committed in:** `4114ff8`

---

**Total deviations:** 2 interpretation/fidelity adaptations + 1 comment-only fix.
**Impact on plan:** All functional acceptance criteria pass. The only unmet wording is the sketch size target, which conflicts with the plan's own "no authored value dropped" must-have and is documented rather than hidden.

## Issues Encountered

- The `extras` shape initially excluded `subentities`, which broke the required raw-dock assertion. The plan is explicit that the raw array survives beside the typed one; it was restored and the size trade-off recorded above.
- `anaconda-pirate`'s four-entry chain surfaced the hop-vs-entry depth ambiguity; the measured `3` is the hop count.
- The test fixture for overrides originally read its `base` entry as the resolution root (a field dictionary, so zero ship entries). It now wraps that dictionary in a one-key root and asserts the patched field value.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- Plan 06 has everything the GLB writer needs: `modelVendored` selects the seven entries, `shipDef.materials` gives per-material configuration, `shipDef.subentities` gives the 17 Coriolis parts with coerced positions, and the dock's raw `is_dock` string sits in `extras` for provenance.
- Plan 06 should convert the dock transform `(0, 0, 500.2561)` at the node level; this plan deliberately leaves it raw.
- Phase 5 receives the tri-state market definition and the full resolved catalogue without any economy computation.
- Open item: the plan's 153-key `shipdataEntrySchema.plist` drift allowlist remains unimplemented because D-01 does not vendor `Resources/Schemata/`; a later bump that adds a key is accepted silently by design.
- Open item: `custom_views` is carried but unconsumed; Phase 3 can use it for cockpit camera stations without a content change.

---

*Phase: 02-data-pipeline-content-compiler*
*Completed: 2026-11-03*

## Self-Check: PASSED

- [x] All 3 tasks executed and committed (`236a90e`, `5d0dd2b`, `0bb7de7`, `9e34d25`, `087ac06`, `4114ff8`).
- [x] `docker compose run --rm verify` exits 0 (139 unit tests, build, 2 Playwright).
- [x] `docker compose run --rm assets npm run assets:check` reports no differences and `manifest.json` has a `ships.json` row.
- [x] Two consecutive `assets` runs leave `src/content/generated` byte-identical.
- [x] `ships.json` holds 194 entries, 81 templates, 102 usable, seven usable `modelVendored` entries and 180/8/6 tri-state counts.
- [x] `grep -rn "eval\|new Function" tools/oolite-ingest/` returns nothing; the banned math/date grep returns nothing.
- [x] Every file named in `key-files.created` exists on disk and every task commit is an ancestor of HEAD.
