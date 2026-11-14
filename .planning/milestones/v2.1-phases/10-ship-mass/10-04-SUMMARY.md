---
phase: 10-ship-mass
plan: 04
subsystem: content-tooling
tags: [ship-mass, buoy, content-build, fidelity, notice, owner-decision]

requires:
  - phase: 10-ship-mass
    provides: "computed ship masses in the generator (10-02) and the 7,179.7 m Coriolis blockage radius plus the owner answers (10-03)"
provides:
  - "ships-client.json carries a third entry, buoy, with its computed mass 698,691.1875 (buoy-client); pinned by tests/content/ships-client.test.ts"
  - "NOTICE names oolite_buoy and oolite_buoy_subents as the source of the stored buoy mass"
  - "PROJECT.md Key Decisions row 'Navigation buoy mass:' (amends D-05); the 06-16 Outcome records the closed buoy data gap"
  - "FIDELITY.md E-22 and the ledger's buoy row agree with the owner answers"
  - "Browser-spec comments cite the 7,179.7 m radius and restate the fly-away margin"
affects: [12-npc-traffic]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A client entry carried only for its mass (buoy): the emitter needs no change beyond CLIENT_SHIP_KEYS because the masses map already holds the key"

key-files:
  created: []
  modified:
    - tools/oolite-ingest/convert/ships.ts
    - src/content/ships.ts
    - tests/content/ships-client.test.ts
    - src/content/generated/ships-client.json
    - src/content/generated/manifest.json
    - NOTICE
    - docs/PERFORMANCE.md
    - .planning/PROJECT.md
    - FIDELITY.md
    - tests/e2e/hyperspace.spec.ts
    - tests/e2e/core-loop.spec.ts
    - tests/e2e/autosave.spec.ts

key-decisions:
  - "Navigation buoy mass lives in ships-client.json as a third `buoy` entry (answer buoy-client); amends D-05"
  - "Blockage stays Coriolis-only until Phase 12; the buoy mass is stored but not consumed"

requirements-completed: [DATA-11]

duration: 40min
completed: 2026-11-14
status: complete
plan_head_before: 1b5961eedc76bafd0953e07b192f45c135d946c3
plan_head_after: 57b07b017be5aa39a1148f7266c953a3c5946c1e
commits: 2
---

# Phase 10 Plan 04: Buoy Mass Home and Phase Gate Summary

**The navigation buoy's computed mass, 698,691.1875, is compiled into ships-client.json as a third `buoy` entry, pinned by a test and covered by NOTICE, and every record and browser-test comment now agrees with the owner's answers.**

## Branches that ran

- Task 1: buoy-client (owner answer in plan 10-03). Test edited first and run red (3 failed), then `CLIENT_SHIP_KEYS` gained `buoy`, the loader header and NOTICE were updated, and `docker compose run --rm assets` regenerated only `ships-client.json` and `manifest.json`.
- Task 2: coriolis-computed (comment rewrite ran, not skipped). The hyperspace spec was run in the e2e container.

## Measurements

- `ships-client.json`: 15,244 bytes before, 19,518 bytes after (`wc -c`; +4,274, more than the plan's "about 2 KB" estimate because the entry carries the full shipDef). `ships.json` is untouched (706,570 bytes, no mass field).
- First-load budget (`tests/e2e/budget.spec.ts`, 3 passed): cold-start transfer 8,835,212 bytes against the unchanged 9,437,184-byte ceiling; 8,834,862 bytes at the end of Phase 9. Recorded in docs/PERFORMANCE.md and the PROJECT.md row. The measured growth is only 350 bytes although the file grew 4,274 bytes on disk; the earlier figure predates plan 10-02, so other build changes in between are folded in and the two numbers are not a like-for-like delta.
- `tests/e2e/hyperspace.spec.ts` under the 7,179.7 m radius (T-10-12): 3 passed (4.5 min), including "chart target, countdown, abort, refusal, arrival and reload" (fly-away completions) and "a jump completed beside the station is refused as blocked". The fly-away margin needed no code change: the ship is at least 7,000 m from the station at KeyH and holds 175 u/s or more for the 15 s countdown, so it completes at least about 9,600 m out; the blocked test's 3.5 km completion is inside 7,179.7 m.
- Full Vitest suite: 141 files, 2,657 passed, 2 skipped, duration 161 s (coverage thresholds met, exit 0). Fidelity contract: 8 passed, 1 skipped. `assets:check`: no differences. `lint` and `typecheck`: pass.

## Accomplishments

- Buoy mass stored and pinned (`mass("buoy")` toBe 698691.1875); the missing-key and empty-masses cases now name `buoy`, the first key in code-unit order.
- NOTICE adds the two buoy models to the ships-client.json mass paragraph (T-10-16).
- PROJECT.md: new "Navigation buoy mass:" row recording the D-05 amendment, the shared-model mass breakdown, why not a tenth NPC record, and the first-load cost; the 06-16 row's Decision and Rationale cells are unchanged and its Outcome notes the closed buoy gap, with the dodecahedron and icosahedron stations still massless (D-03).
- FIDELITY.md E-22 reads "only the Coriolis station blocks; the navigation buoy's compiled mass is not consumed until Phase 12, ..." with the quoted Decision title unchanged; the ledger's buoy row names `ships-client.json` as the home and the test that pins it. Prettier realigned the table padding, which explains the large FIDELITY.md diff.
- The three browser specs no longer cite 6,747 m (comment-only changes; verified by diffing against the plan base).

## Deviations from Plan

None - plan executed exactly as written. No CHANGELOG entry: the buoy entry changes build output only, with no user-visible effect (the unreleased 10-03 entry already covers the blockage change).

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None.

## Task Commits

1. Task 1: `4097a0a` feat(10-04): carry the navigation buoy's computed mass in ships-client.json
2. Task 2: `57b07b0` docs(10-04): record the buoy mass home, close the buoy data gap and restate the blockage radius

## Self-Check: PASSED

- All modified files exist; both commits are ancestors of HEAD; acceptance greps for both tasks pass (buoy mass 698691.1875, 3 client entries, 0 mass fields in ships.json, one buoy Key Decision row with "amends D-05", E-22 old wording gone, 06-16 Decision title unchanged, no 6,747 left in tests/e2e, e2e diff comment-only).
