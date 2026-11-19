---
phase: 18-stations-buoys-and-collisions
plan: 01
subsystem: content
tags: [oolite-ingest, octree, zod, lazy-load, coriolis, buoy, debris]

requires:
  - phase: 13
    provides: ten-hull artifact pattern (compileShipHulls, emitShipHulls, checkHullTree, loadShipHulls)
provides:
  - src/content/generated/ships-static-hulls.json (Coriolis, buoy, barrel, alloy with subentities; five ident names)
  - StaticHullArtifactSchema and the static caps (src/content/schemas/ship-static-hull.ts)
  - loadStaticHulls lazy ?raw loader (src/content/ships-static-hulls.ts)
  - compileStaticHulls, emitStaticHulls, STATIC_HULLS_PATH, STATIC_HULL_KEYS, STATIC_NAME_KEYS, staticSubentityKeys
  - digest golden tests/golden/content/ships-static-hulls.json
affects: [18-02, 18-04, 18-06, 18-09, 18-13, 18-15]

actuals:
  tokens: 68000
  tasks: 2
  commits: 5
plan_head_before: 2c3db216d86cc56f7136131870583fe72db26b66
plan_head_after: baeeca4c76de7cc16f12062641fd58430afe1418

tech-stack:
  added: []
  patterns:
    - "Second lazily loaded hull artifact under its own strict schema and caps; the ten-hull caps stay untouched"
    - "Canonical JSON with compact octree roots via placeholder substitution after canonicalJson"

key-files:
  created:
    - src/content/schemas/ship-static-hull.ts
    - src/content/ships-static-hulls.ts
    - tools/oolite-ingest/convert/static-hulls.ts
    - tools/oolite-ingest/convert/static-hulls.test.ts
    - src/content/generated/ships-static-hulls.json
    - tests/golden/content/ships-static-hulls.json
    - tests/content/ships-static-hulls.test.ts
  modified:
    - src/content/schemas/ship-hull.ts
    - tools/oolite-ingest/generate.ts
    - src/content/generated/manifest.json
    - NOTICE
    - .planning/PROJECT.md

key-decisions:
  - "Statics and debris hulls ship in their own lazily loaded file (DATA-15): the Coriolis hull (32,841 nodes) and tris (30,089) exceed MAX_HULL_NODES 16,384; caps MAX_STATIC_OCTREE_NODES 40,000, MAX_STATIC_ARTIFACT_NODES 104,000, MAX_STATIC_HULL_ARTIFACT_BYTES 270,000, MAX_STATIC_SUBENTITIES 4; load traffic-gated beside loadShipHulls (plan 18-13)"
  - "An absent subentity orientation counts as the identity (Oolite's oo_quaternionForKey default); any authored non-identity orientation fails the build"

patterns-established:
  - "checkHullTree(root, depth, maxNodes = MAX_HULL_NODES): a caller passes its own per-octree cap"

requirements-completed: [DATA-15]

coverage:
  - id: D1
    description: "Coriolis octrees measured against the hull caps and asserted by a test; decision recorded"
    requirement: DATA-15
    verification:
      - kind: unit
        ref: "tests/content/ships-static-hulls.test.ts#records the Coriolis octree sizes: the hull and the tris exceed the ten-hull cap"
        status: pass
      - kind: other
        ref: "rg -c 'Statics and debris hulls ship in their own lazily loaded file' .planning/PROJECT.md == 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Four static hulls with subentities, frangibility, radii, masses and five names in a generated artifact pinned by the drift gate and a digest golden"
    requirement: DATA-15
    verification:
      - kind: unit
        ref: "tests/content/ships-static-hulls.test.ts"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/static-hulls.test.ts"
        status: pass
      - kind: other
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Strict bounded static schema rejecting each bound with the path named; ten-hull caps, file and golden unchanged"
    requirement: DATA-15
    verification:
      - kind: unit
        ref: "tests/content/ships-static-hulls.test.ts#StaticHullArtifactSchema bounds"
        status: pass
      - kind: unit
        ref: "tests/content/ships-hulls.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Lazy loader validates the artifact; concurrent calls share one promise; no sim/app importer yet"
    requirement: DATA-15
    verification:
      - kind: unit
        ref: "tests/content/ships-static-hulls.test.ts#loadStaticHulls"
        status: pass
    human_judgment: false
  - id: D5
    description: "NOTICE provenance paragraph for the derived artifact"
    verification:
      - kind: other
        ref: "rg -c ships-static-hulls.json NOTICE >= 1"
        status: pass
    human_judgment: true
    rationale: "Licensing wording is judged by a reader; the grep only proves the paragraph exists"

duration: 15min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 01: Static and debris hull artifact Summary

**The Coriolis (three solid subentities), the navigation buoy (one), the cargo barrel and the alloy plate now compile from the vendored models into `ships-static-hulls.json` (205,542 bytes, 85,896 octree nodes), a second lazily loaded artifact behind a strict bounded schema, with the five ident names, a digest golden, NOTICE provenance and the Key Decisions row.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-11-19T17:35:24Z
- **Completed:** 2026-11-19T17:50:00Z
- **Tasks:** 2
- **Files modified:** 12

## Measurement (DATA-15 criterion 1)

Measured in the `assets` container from the emitted file (root half-width, depth, nodes, solid leaves, compact root bytes):

| Octree | Half-width | Depth | Nodes | Solid leaves | Root bytes |
|---|---|---|---|---|---|
| `coriolis-station` hull | 500.5 | 6 | 32,841 | 11,148 | 76,829 |
| `oolite_coriolis_faceplate` at (0,0,0) | 534.7979736328125 | 6 | 6,601 | 2,220 | 15,421 |
| `oolite_coriolis_tris` at (0,0,0) | 500.5 | 6 | 30,089 | 11,912 | 72,089 |
| `oolite_coriolis_dock` at (0,0,500.2561) | 250.5 | 5 | 1,737 | 790 | 4,263 |
| `buoy` hull | 58.22785949707031 | 5 | 10,945 | 4,181 | 26,070 |
| `oolite_buoy_subentity` at (0,0,0) | 24.34779930114746 | 5 | 3,025 | 812 | 6,861 |
| `barrel` | 5.287789821624756 | 4 | 457 | 172 | 1,085 |
| `alloy` | 5 | 4 | 201 | 56 | 457 |
| **Total** | | | **85,896** | | file **205,542 bytes** |

The hull and the tris each exceed `MAX_HULL_NODES` (16,384); the set would push the ten-hull file past `MAX_HULL_ARTIFACT_BYTES` (200,000). The values equal the research measurement.

Radii: coriolis-station 779.3702392578125, buoy 59.13554763793945, barrel 5.798625946044922, alloy 5.149232387542725 (equal to `ships-client.json` and `ships-debris.json`). Frangible: false for the station, true for the other three. Subentity masses: faceplate 58,255,096; tris 220,998,576; dock 7,579,321; buoy subentity 7,646.7861328125.

**Derived caps** (headroom over the measurement the golden pins, not an independent bound): `MAX_STATIC_OCTREE_NODES` 40,000 (32,841 plus about 20 %), `MAX_STATIC_ARTIFACT_NODES` 104,000 (85,896 plus about 20 %), `MAX_STATIC_HULL_ARTIFACT_BYTES` 270,000 (205,542 plus about 30 %), `MAX_STATIC_SUBENTITIES` 4. Also bounded: hulls 1..8, names up to 16, keys and names 1..64 characters.

**Names compiled:** coriolis-station "Coriolis Station", buoy "Navigation Buoy", buoy-witchpoint "Witchpoint Beacon", barrel "Cargo container", alloy "Metal fragment".

The digest golden is written from the same build it pins, so it detects drift but is no independent evidence that the octrees are right. That evidence comes from 18-02's mesh-derived fixtures, which reach the artifact through 18-04.

## Accomplishments
- Converter `tools/oolite-ingest/convert/static-hulls.ts` wired into `generate.ts`. Subentity masses come from one `computeShipMasses` call. A subentity with a non-identity orientation or no key fails the build.
- Strict schema `StaticHullArtifactSchema`. The walk is iterative, with a per-octree cap and a total cap, and every rejection names its path. `checkHullTree` gained an optional `maxNodes` parameter. No ten-hull constant changed, and `ships-hulls.json` and its golden are byte-identical.
- Lazy loader `loadStaticHulls()`. It loads the file through a non-eager `?raw` glob, caches the promise and names the path on failure. Nothing under `src/sim` or `src/app` imports it yet; plan 18-13 adds that.
- NOTICE paragraph added. `CHECKSUMS.sha256` and `budget.spec.ts` are untouched. Key Decisions row added to PROJECT.md.

## Task Commits

1. **Task 1 (tracer): Coriolis hull through the build to a validated load.** RED `9f86287` (test), GREEN `b7847b2` (feat). Tracer gate in auto mode: `<verify>` re-ran and passed (assets, targeted vitest, typecheck), then expansion went ahead.
2. **Task 2: buoy, barrel, plate, names, caps, golden, provenance, decision.** RED `eef7629` (test), GREEN `941fb0e` (feat), REFACTOR `baeeca4` (doc reflow).

## TDD Gate Compliance

- Task 1 RED: `tests/content/ships-static-hulls.test.ts > the generated static hull file > exists and parses under the strict static hull artifact schema` failed on its assertion because the file was absent (5/5 failed). Classifier: `RED_EVIDENCE_OK target_test_failed` (TAP). The RED commit includes the schema and the loader, because the test imports them; without them the run would have been a load failure.
- Task 2 RED: `...holds exactly the four hulls and the five ident names, in order` failed on its key-order assertion (10/31 failed; the schema-bound cases already passed with Task 1's schema). The TAP report was rejected as `invalid_record`, because Vitest writes multi-line diffs without indentation. I reran the same tests with the JUnit reporter: `RED_EVIDENCE_OK target_test_failed`.
- GREEN: all targeted tests pass. REFACTOR: comment only.

## Verification

- `docker compose run --rm assets` exit 0; `assets npm run assets:check`: "no differences" (exit 0)
- Targeted: `tests/content/ships-static-hulls.test.ts tools/oolite-ingest/convert/static-hulls.test.ts tests/content/ships-hulls.test.ts tests/content/ships-client.test.ts tests/guards`: 17 files, 317 tests passed
- `docker compose run --rm test` (full, with coverage): exit 0
- `lint` exit 0 (eslint plus prettier clean); `typecheck` exit 0
- No remote run, per the plan's gate policy: no browser-facing code changed.

## Decisions Made
- The statics ship as their own lazy artifact, with the caps derived above. See the PROJECT.md Key Decisions row "Statics and debris hulls ship in their own lazily loaded file".
- An absent subentity `orientation` is read as the identity, which is Oolite's default. Every stock subentity authors `(1, 0, 0, 0)`, so this changes no output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The boot-path scan in the ten-hull test matched my doc comments**
- **Found during:** Task 1
- **Issue:** The new loader's and schema's doc comments named the ten-hull file by its literal file name. The regex in `tests/content/ships-hulls.test.ts` ("named by no non-test source file other than the loader and the session start-up") treats any mention of that name as an importer.
- **Fix:** The comments now name the ten-hull artifact through `loadShipHulls` and `ship-hull.ts`. The ten-hull test is unchanged.
- **Files modified:** src/content/ships-static-hulls.ts, src/content/schemas/ship-static-hull.ts
- **Committed in:** b7847b2

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** wording only; no scope change.

## Issues Encountered
- Lint failed once (ENOENT on `src/sim/__purity_ban_date_now.ts`) because it ran at the same time as the full test suite, whose guard tests write and remove probe files there. A rerun after the suite finished was clean.

## User Setup Required
None.

## Next Phase Readiness
- Plan 18-13 can wire `loadStaticHulls()` into the session, traffic-gated beside `loadShipHulls()`.
- Plan 18-06 can read the ident names from `artifact.names`.
- Plan 18-15 can read the buoy subentity's octree and mass.

## Self-Check: PASSED
