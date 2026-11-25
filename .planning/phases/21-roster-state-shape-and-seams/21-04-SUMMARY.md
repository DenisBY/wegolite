---
phase: 21-roster-state-shape-and-seams
plan: 04
subsystem: content-pipeline
tags: [hull-octree, aliases, hullTable, zod, derived-counts, playwright]
requires:
  - phase: 21-roster-state-shape-and-seams
    provides: "21-01 inert-world isolation (nine-key INERT_RECORD_KEYS)"
provides:
  - "Hull octrees shared per model: converter grouping, optional ShipHull.aliases, MAX_HULL_ALIASES"
  - "Alias-aware hullTable (same HullData object, throws on any repeated key or alias)"
  - "Hull, content and browser tests whose roster counts are derived from the catalogue"
affects: [21-08 roster growth, 21-11 NPC prefetch, 21-19 budget decision]
status: complete
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
plan_head_before: a0a7fd4d602ac3edc89e02b31bff30e8bb39ba3f
plan_head_after: e9a8c4668f6aef0348ac1fafafb61be97b93d9d3
tech-stack:
  added: []
  patterns:
    - "One octree per model; a group of one key writes no aliases key, so the committed chunk stays byte-identical"
    - "Roster counts in tests derive from the compiled records, with a non-empty floor"
key-files:
  created: []
  modified:
    - tools/oolite-ingest/convert/ship-hulls.ts
    - tools/oolite-ingest/convert/ship-hulls.test.ts
    - src/content/schemas/ship-hull.ts
    - src/app/session/traffic.ts
    - tests/app/session/traffic.test.ts
    - tests/content/ships-hulls.test.ts
    - tests/helpers/hull-table.ts
    - tests/e2e/budget.spec.ts
    - tests/e2e/npc-assets.spec.ts
    - tests/e2e/traffic.spec.ts
key-decisions:
  - "MAX_HULL_ALIASES = 8: headroom over the three Cobra variants of 21-RESEARCH section 1, far under MAX_HULLS"
  - "Entry key of a group is PLAYER_HULL_KEY for the Cobra group, otherwise the first key in code-unit order; entries stay in the order of their entry key within the key list"
  - "A key listed twice is refused by the converter with a SCHEMA error (the only way a grouping could repeat a key); the catalogue schema independently refuses a repeat across entries"
requirements-completed: [DATA-18]
---

# Phase 21 Plan 04: Hull sharing per model and derived roster counts Summary

Hull octrees are now shared per model through an optional `aliases` list, `hullTable` registers each alias with the same `HullData` object, and the hull, content and browser tests derive every roster count from the catalogue, so plan 21-08 grows the roster as a data change. On today's ten keys nothing moves: `assets:check` reports no differences and no generated or golden file changed.

## What was built

- **Grouping rule (converter).** `compileShipHulls(catalogue, models, keys = HULL_SHIP_KEYS)` groups `keys` by each record's resolved model. The entry `key` is `PLAYER_HULL_KEY` when the group holds it, otherwise the first key of the group in code-unit order; the other keys become `aliases` in code-unit order, and the member is left out when the list is empty. Entries are ordered by the position of the entry key within `keys` (player first), so today's ten entries keep their order. `emitShipHulls` writes `"aliases"` first (code-unit key order) as one element per line, only for an entry that has aliases. The `keys` parameter (default the real list) lets the tests drive a synthetic two-key model.
- **Schema.** `ShipHullSchema` gains `aliases: z.array(z.string().min(1)).max(MAX_HULL_ALIASES).optional()` (`MAX_HULL_ALIASES = 8`, beside `MAX_HULLS`). `ShipHullCatalogueSchema` gained a `superRefine` that refuses a key or alias seen twice across the catalogue, which includes an alias equal to its own entry's key. `MAX_HULLS` and `MAX_HULL_ARTIFACT_BYTES` are untouched.
- **`hullTable`.** Builds the map entry by entry: the entry key, then each alias, all pointing at one `HullData` object (identity, not a copy). Any key or alias already in the table throws `Wegolite: the hull key "<key>" repeats a key already in the hull table.`; the existing static-key check now also catches a static key that repeats an alias.
- **Derived counts.**
  - `ship-hulls.test.ts`: `HULL_SHIP_KEYS.length === 1 + NPC_SHIP_KEYS.length`; entry count equals the number of distinct models resolved from the catalogue; entry keys plus aliases cover `HULL_SHIP_KEYS` exactly once; root-line count follows the entry count.
  - `tests/content/ships-hulls.test.ts`: key coverage through entries plus aliases, entry count equals keys minus aliases, the NPC radius check resolves an alias.
  - `budget.spec.ts`, `npc-assets.spec.ts`, `traffic.spec.ts`: GLB count equals the compiled record count, texture count at least one per GLB, each with a non-empty floor. Values today (measured): 9 GLBs, 43 textures, 10 hull keys, 10 hull entries.

## Verification

| Gate | Result |
|------|--------|
| Targeted vitest (hulls converter, content hulls, traffic, inert-isolation) | 4 files, 102 tests passed |
| `docker compose run --rm assets` then `assets:check` | no differences; `git status` shows no generated or golden file changed; `git diff --name-only a0a7fd4d..HEAD -- src/content/generated tests/golden/content` is empty |
| `docker compose run --rm lint` | exit 0 (eslint and prettier clean) |
| `docker compose run --rm typecheck` | exit 0 |
| `docker compose run --rm test` (full) | 7702 passed, 2 failed, 10 skipped: `tests/guards/tools-determinism.test.ts` ("Math.sin fails lint", 5 s timeout) and `tools/oolite-ingest/convert/textures.test.ts` ("serves each vendored texture as WebP only", 5 s timeout), both while three agents shared the machine (run took 592 s). Rerun alone: both files pass (25 tests). Not caused by this plan. |
| Remote `verify` (snapshot e9a8c466) | exit 0, elapsed 208 s, 28 browser tests passed |
| Remote `budget.spec.ts`, `npc-assets.spec.ts`, plus `traffic.spec.ts` (snapshot e9a8c466) | exit 0, elapsed 71 s, 8 passed, none flaky |

No `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` change, so no 20-seed run (QUAL-12 does not apply). No twin literal, epoch pin or inert-world golden moved. No `CHANGELOG.md` entry: the change is internal (no user-visible behaviour).

## Deviations from Plan

**1. [Rule 2 - coupled places] `tests/e2e/traffic.spec.ts` derived too.** It carried the same literal `toBe(9)` / `toHaveLength(9)` / `toHaveLength(43)` NPC counts (lines 238, 455, 456) as the two specs named in the plan. Left as literals they would break in plan 21-08, which is the failure pitfall C9 and the plan's own truth ("every hard-coded roster count ... derived") exist to prevent. Same derivation and floor applied. Commit e9a8c466.

**2. [Rule 2 - coupled places] `tests/helpers/hull-table.ts` made alias-aware.** `realHullTable()` builds the table independently of `hullTable` and the equality case in `traffic.test.ts` compares the two entry for entry; once 21-08 adds aliases the helper would have diverged. It now registers aliases with the entry's `HullData`. No behaviour change today. Commit d717128b.

**3. Converter test for the repeat edge.** A grouping cannot by itself produce a repeated alias, so the "alias repeating another entry's key fails the converter with a SCHEMA error" edge is reached through a key listed twice, which `compileShipHulls` now refuses with a `SCHEMA` content error naming the key. The catalogue schema's own repeat check is tested directly (alias equal to another entry's key, to another alias, to its own key, a repeat inside one list).

**4. `compileShipHulls` / `emitShipHulls` gained an optional `keys` parameter** (default `HULL_SHIP_KEYS`) so the synthetic catalogue can be compiled without touching the real key list.

## Known Stubs

None.

## Threat Flags

None. T-21-11 is mitigated as planned: strict schema with `min(1)` strings and a bounded list, a catalogue-level repeat check, and a `Map` in `hullTable` that throws on any repeat.

## Self-Check: PASSED

- Files modified exist; commits d717128b and e9a8c466 are ancestors of HEAD.
- Acceptance greps: `aliases` present in `ship-hull.ts` and `traffic.ts`; no `toHaveLength(10)` in the two hull tests; no `toHaveLength(9)` / `toHaveLength(43)` in the browser specs; `21-04` present in `budget.spec.ts` and `npc-assets.spec.ts`.
