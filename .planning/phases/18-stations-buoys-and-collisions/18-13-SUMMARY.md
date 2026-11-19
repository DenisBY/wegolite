---
phase: 18-stations-buoys-and-collisions
plan: 13
subsystem: combat
tags: [hull-table, octree, lazy-chunk, boot-load, traffic-gate, DATA-15]

requires:
  - phase: 18-01
    provides: "loadStaticHulls() and the validated ships-static-hulls.json artifact"
provides:
  - "SubentityHull, HullData.subentities, HullData.frangible (src/sim/combat/hit.ts)"
  - "hullTable(hulls, statics?) merging the four static hulls after the ten ships, refusing a repeated key"
  - "loadSessionContent(ctx, loaders, onBootFailure), SESSION_CONTENT_LOADERS, SessionContentLoaders, SessionContent (start-session.ts)"
  - "fullHullTable() test helper (ten hulls plus the statics, built independently of hullTable)"
  - "the static chunk's unit boot-path scan (its only traffic-off guard)"
affects: [18-04, 18-06, 18-09, 18-11, 18-15, 18-22]

actuals:
  tokens: 12100
  tasks: 2
  commits: 4
plan_head_before: 7577ac3d2e8f38bc1168904153566613db491fdc
plan_head_after: b4608851f948f6c6e99266748ee634b48bf4d7cd

tech-stack:
  added: []
  patterns:
    - "Boot content load as an exported function with injected loaders, so a test can reject one chunk and observe the failure surface"
    - "Static hull records typed structurally in traffic.ts (it may import only types from src/content/types)"

key-files:
  created: []
  modified:
    - src/sim/combat/hit.ts
    - src/app/session/traffic.ts
    - src/app/session/start-session.ts
    - src/content/ships-static-hulls.ts
    - tests/helpers/hull-table.ts
    - tests/app/session/traffic.test.ts
    - tests/app/session/start-session.test.ts
    - tests/sim/combat/hit.test.ts
    - tests/content/ships-static-hulls.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - docs/PERFORMANCE.md

key-decisions:
  - "hullTable throws on a static key that repeats a ship key (a broken build fails the boot visibly instead of silently replacing a ship hull)"
  - "loadSessionContent returns { staticNames } (kept for plan 18-06) or undefined after a failure or dispose; it builds every table before installing any, so a throw leaves ctx untouched"
  - "Static entries always carry a subentities array (empty for barrel and alloy) and frangible; the ten ship entries carry neither key"

patterns-established:
  - "Pattern: traffic-gated chunk loads go through loadSessionContent's Promise.all as `ctx.runtime.testFlags.traffic ? loaders.X() : Promise.resolve(undefined)`"

requirements-completed: [DATA-15]

coverage:
  - id: D1
    description: "With traffic on the boot loads the static artifact beside the ship hulls and installs one merged 14-key hull table; with traffic off no traffic chunk is requested"
    requirement: DATA-15
    verification:
      - kind: unit
        ref: "tests/app/session/start-session.test.ts#loadSessionContent (plan 18-13)"
        status: pass
      - kind: unit
        ref: "tests/content/ships-static-hulls.test.ts#boot-path isolation"
        status: pass
      - kind: e2e
        ref: "remote: e2e budget.spec.ts at 057be4c (exit=0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A rejected static chunk fails the boot once on the boot-failure surface and installs no hull table"
    requirement: DATA-15
    verification:
      - kind: unit
        ref: "tests/app/session/start-session.test.ts#fails the boot once, with the reason, and installs no hull table when the static chunk rejects"
        status: pass
    human_judgment: false
  - id: D3
    description: "hullTable merge: station with three subentities (Oolite-axis positions, not frangible), buoy with one (7,646.786 kg, frangible), fullHullTable() equal entry for entry"
    requirement: DATA-15
    verification:
      - kind: unit
        ref: "tests/app/session/traffic.test.ts#hullTable with the static hulls (plan 18-13)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The hit rule hits the station hull octree from the merged table (hand-built target, no candidacy)"
    requirement: DATA-15
    verification:
      - kind: unit
        ref: "tests/sim/combat/hit.test.ts#firstShipHit: the station hull from the merged table (plan 18-13)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The app twins run on fullHullTable() and pass unchanged; full suite, lint, typecheck and remote verify green"
    verification:
      - kind: unit
        ref: "docker compose run --rm test (242 files, 6602 passed, 10 skipped)"
        status: pass
      - kind: other
        ref: "remote: run --rm verify at 057be4c (exit=0)"
        status: pass
    human_judgment: false

duration: 23min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 13: Static hulls in the session hull table Summary

**A traffic-on boot now loads `ships-static-hulls` in the same `Promise.all` as the ship hulls and merges both into one 14-key `HullTable` with subentity-aware `HullData`. A rejected chunk fails the boot visibly, and a traffic-off boot never fetches it.**

## Performance

- **Duration:** 23 min
- **Tasks:** 2 (Task 1 tracer, TDD: RED `0a0e724`, GREEN `87e1211`; Task 2: `057be4c`, `b460885`)
- **Files modified:** 14

## Accomplishments

- `HullData` has two new optional fields, `subentities` (`SubentityHull`: key, position in Oolite model axes, mass, octree) and `frangible`. The ten ship hulls carry neither key, so every existing hit and scenario test passes unchanged.
- `hullTable(hulls, statics?)` builds one Map. The merged key set, in order: `oolite_template_cobra3-player, adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper, coriolis-station, buoy, barrel, alloy`.
- The station entry has three subentities (faceplate and tris at the origin, dock at z = 500.2561) and `frangible: false`. The buoy has one subentity (mass 7,646.7861328125) and is frangible. The barrel and the alloy plate have none and are frangible.
- `loadSessionContent(ctx, loaders, onBootFailure)` now holds the boot catalogue load. The session start passes `SESSION_CONTENT_LOADERS` and a callback that runs `showBootFailure` and `publishFailure`. Behavioural tests cover four cases:
  - a rejecting `loadStaticHulls` calls `onBootFailure` once and installs no table
  - with traffic on, all five traffic chunks load into one table
  - with traffic off, no traffic loader is called
  - a dispose during the load installs nothing
- The hit rule hits the Coriolis hull octree from 3,000 m along station local +X at the Lave pose, using `fullHullTable()` and a hand-built target. With `realHullTable()` the same shot misses.
- The three app twins (`tick-parity`, `sim-driver`, `probe-publisher`) now run on `fullHullTable()` and pass unchanged. `realHullTable()` and `tests/acceptance/**` are untouched.

## Remote runs (committed HEAD)

| Run | snapshot | exit | elapsed |
|-----|----------|------|---------|
| `run --rm verify` | 057be4c | exit=0 | elapsed=194s (242 unit files / 6602 tests; e2e smoke 27 passed) |
| `run --rm e2e … budget.spec.ts` | 057be4c | exit=0 | elapsed=26s (3 passed, traffic-off ceiling holds) |
| `run --rm test … npm run build && wc -c / gzip -9` | 057be4c | exit=0 | elapsed=3s: `ships-static-hulls-DYtUl-Fn.js` 205628 raw, 8529 gzip-9 |
| `run --rm e2e … traffic.spec.ts` (extra) | 057be4c | exit=0 | elapsed=55s (3 passed; traffic-on cold start under the 9 MiB ceiling) |

`budget.spec.ts` does not cover the static chunk: its hull-chunk assertion matches `ships-hulls-*.js` only, and Phase 18 may not edit any existing browser spec except the one D-06 sanctions. The static chunk's only traffic-off guard is therefore the unit boot-path scan in `tests/content/ships-static-hulls.test.ts`. The traffic-on load cost is recorded in docs/PERFORMANCE.md `## Load size`. The cold-start total there (about 9,083,841 bytes) is estimated, because `traffic.spec.ts` asserts the ceiling but prints no byte count.

## Task Commits

1. **Task 1 RED:** `0a0e724` (test). It had 13 failing cases: the `hullTable` merge cases (10 keys instead of 14, `frangible` undefined), `loadSessionContent is not a function`, and the source scans looking for `onBootFailure`. The station hit test already passed at RED: it only exercises `fullHullTable()` and the existing hit rule, which needs no change.
2. **Task 1 GREEN:** `87e1211` (feat). The tracer gate re-ran the targeted tests and typecheck, both green, before expanding.
3. **Task 2:** `057be4c` (test): the boot-path scan, the twins switched, the world-lifecycle scan updated.
4. **Task 2 doc:** `b460885` (docs): the PERFORMANCE.md load-size rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A third T-16-19 source scan in world-lifecycle.test.ts**
- **Found during:** Task 2 (full suite)
- **Issue:** `tests/app/session/world-lifecycle.test.ts` "loads the NPC catalogue once…" expected `showBootFailure` within 900 characters after the `Promise.all`. Moving the load into `loadSessionContent` changed the call shape. This file is not in the plan's list.
- **Fix:** It now expects `onBootFailure` within 1,500 characters, with a comment naming the wiring.
- **Committed in:** `057be4c`

**2. [Rule 2 - Correctness] Duplicate-key refusal in hullTable and fullHullTable**
- **Issue:** A static key equal to a ship key would silently replace a ship hull.
- **Fix:** Both now throw on a repeated key. In the session, the throw reaches the boot-failure surface. A test pins it.
- **Committed in:** `87e1211` (test in `0a0e724`)

**3. [Rule 1 - Stale doc] Loader header in src/content/ships-static-hulls.ts**
- **Issue:** The header said "Nothing imports this module yet".
- **Fix:** It now names the one importer and the traffic gate. This file is not in the plan's list.
- **Committed in:** `057be4c`

**Total deviations:** 3 auto-fixed (1 blocking, 1 correctness, 1 stale doc). **Impact:** no scope change.

## Issues Encountered

- A lint run started while the full suite was running hit ENOENT on the suite's temporary `src/sim/__purity_dom_probe.ts`. This was a race between the two runs, not a lint finding. Lint rerun alone: clean.

## Next Phase Readiness

- Plan 18-04 can read `hull.subentities` and remove the interim header sentence "Subentity data arrives (plan 18-13); the hit rule ignores it until plan 18-04."
- Plan 18-06 gets the ident names from `loadSessionContent(...).staticNames`. Nothing reads them yet.
- Note for 18-04: the Node tick replay `tests/helpers/tick-script.ts` (`committedHullTable`) still builds the ten-hull table. That is harmless while no static is a candidate. Once a static becomes a laser or collision candidate, the replay must use the merged table, or `tick-parity` will diverge.
- No `src/sim/world/**` or NPC change, so no acceptance run was needed.

## Self-Check: PASSED

- Files exist: src/sim/combat/hit.ts, src/app/session/traffic.ts, src/app/session/start-session.ts, tests/helpers/hull-table.ts, docs/PERFORMANCE.md
- Commits on HEAD: 0a0e724, 87e1211, 057be4c, b460885
- Acceptance criteria: SubentityHull 1; interim sentence 1; loadStaticHulls in start-session 4 (>=1); `export async function loadSessionContent` 1; loadSessionContent in test 8; fullHullTable export 1; realHullTable in the twins: none; `git diff --quiet 76229f5 -- tests/acceptance tests/e2e` exit 0; ships-static-hulls in PERFORMANCE.md 2
