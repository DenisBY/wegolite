---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 07
subsystem: tools
tags: [dist-check, ai-harness, acceptance-thresholds, verify-chain, freeze]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: AI_HARNESS_SENTINEL from tools/ai-harness/host.ts (plan 14-04), the populated inert Lave world (ids 101 to 112)
provides:
  - tools/ai-harness/dist-check.ts, DIST_MARKERS (three markers) and checkDist, and the check:dist CLI (exit 0 clean, 1 marker found, 2 dist missing or empty)
  - check:dist wired after build:e2e in verify and verify-full, and after the production build in the Pages workflow, pinned by the container contract test
  - tests/acceptance/thresholds.ts, the one-commit statement of the 20-seed acceptance criteria (thresholds, definitions, start placement with the designed near pass, run minimums, hull-crossing classes, parking rule, frozen set, escalation)
  - tests/acceptance/accepted-crossings.ts, the empty ACCEPTED_HULL_CROSSINGS list (outside the frozen set)
affects: [14-16, 14-17, 14-19]

requirements-completed: []
requirements-advanced: [AI-01, AI-11]

plan_head_before: 25d4d5bceb38f987630338f194e671effd1af688
plan_head_after: b33e72f376fa0ff92e6001e58e90282a1c8685d3

actuals:
  tokens: 14700
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Post-build bundle scan as a chain stage, not a Vitest case: the check needs dist/, which the test step precedes"
    - "Acceptance numbers committed alone, import-free and frozen by a one-commit rule, ahead of the code they gate"

key-files:
  created:
    - tools/ai-harness/dist-check.ts
    - tools/ai-harness/dist-check.test.ts
    - tests/acceptance/thresholds.ts
    - tests/acceptance/accepted-crossings.ts
  modified:
    - package.json
    - compose.yaml
    - .github/workflows/pages.yml
    - tests/contract/container-contract.test.ts
    - CHANGELOG.md

key-decisions:
  - "DIST_MARKERS is exactly three strings (the sentinel value, PriorityAIController, oolite-libPriorityAI); no bare Oolite script file name, because oolite-shuttleAI.js is shipped content and comments reach the source maps, which are skipped"
  - "A dist holding only source maps counts as holding no shipped file (exit 2), so a half-built output cannot pass"
  - "thresholds.ts additionally exports FROZEN_HARNESS_FILES, DETECTOR_CHANGE_TRAILER, GOAL_METRICS, FLEE_TARGET_ALERT_MIN_ACCURACY and PLAYER_PARK_AXIS_ORDER as frozen data, so plan 14-17's freeze check and the harness read one definition"

patterns-established:
  - "Escalation options are stated in the frozen file's module comment, so the criteria and the way out of a breach are on record together before the first run"

coverage:
  - id: D1
    description: "npm run check:dist scans every shipped file under dist/ except source maps for the three markers and exits 0, 1 or 2 as specified; unit-tested both directions on fixture directories"
    verification:
      - kind: unit
        ref: "tools/ai-harness/dist-check.test.ts (15 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The markers are absent from the committed ships-npc.json and from every file under src/ and public/, and a real e2e bundle written to the container's /tmp is clean (106 files)"
    verification:
      - kind: unit
        ref: "tools/ai-harness/dist-check.test.ts#the committed tree holds no marker"
        status: pass
      - kind: command
        ref: "docker compose run --rm test sh -lc 'npx vite build --config vite.e2e.config.ts --outDir /tmp/dist-check --emptyOutDir && npx tsx tools/ai-harness/dist-check.ts /tmp/dist-check' (exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "verify and verify-full run check:dist right after build:e2e, the Pages workflow after the production build, and the container contract test pins the chains; the remote verify passes with the check stage before the e2e smoke"
    verification:
      - kind: unit
        ref: "tests/contract/container-contract.test.ts (24 cases)"
        status: pass
      - kind: command
        ref: "wegolite-remote-run.sh run --rm verify (exit=0, snapshot d1e7f83; log shows check:dist: 106 files scanned in dist, no AI harness marker, before test:e2e:fast)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 20-seed acceptance thresholds and every definition they are measured by, the start placement with the designed near pass, the run minimums, the hull-crossing classes with the episode rule, the frozen set, the escalation and the parking rule are committed in one commit that precedes the steering port and the run; the accepted-crossings list is created empty"
    verification:
      - kind: command
        ref: "rg -c acceptance greps of Task 2 (all as specified); docker compose run --rm typecheck and lint clean; git log --format=%h -- tests/acceptance/thresholds.ts prints b33e72f only"
        status: pass
    human_judgment: true
    rationale: "Whether the frozen numbers are the right criteria for a faithful port is the owner's judgment at plan 14-19's gate; this plan proves only that they are stated, consistent with the sources and committed first."

duration: 14min
completed: 2026-11-15
---

# Phase 14 Plan 07: the dist absence check and the frozen acceptance thresholds Summary

**`npm run check:dist` fails any `verify`, `verify-full` or Pages build whose bundle contains the dev-only AI harness or the AILib code (three markers, source maps skipped, exit 2 on a missing or empty `dist`), and `tests/acceptance/thresholds.ts` fixes the 20-seed acceptance criteria, the start placement with its designed near pass and the pre-declared escalation in a single commit ahead of the steering port.**

## Performance

- **Duration:** about 14 minutes of wall clock, plus a 206 s remote `verify`
- **Tasks:** 2 of 2
- **Files:** 4 created, 5 modified

## Accomplishments

- **`check:dist`.** `DIST_MARKERS` holds the harness sentinel value, `PriorityAIController` and `oolite-libPriorityAI`. `checkDist(dir)` walks every file, skips `*.map`, and returns exit 0, 1 (file and marker printed) or 2 (directory missing, empty, or holding only source maps). The module comment records why no Oolite script file name is a marker and states the rule that no tracked file under `src/` or `public/` may contain a marker, even in a comment.
- **Non-vacuous on a clean tree.** The unit test finds no marker in the committed `ships-npc.json` or in any of the files under `src/` and `public/`, so a clean-tree failure would show up in `test` before any build. A real e2e bundle built into the container's `/tmp` scans clean (106 files, exit 0).
- **Wired in.** `compose.yaml` `verify` and `verify-full` run `npm run check:dist` right after `npm run build:e2e`; `pages.yml` runs it after `npm run build`; the contract test pins the two chains and the Pages string. `e2e` and `e2e-cross` stay without it (browser-test runners, an accepted scope boundary of the plan). `CHANGELOG.md` has the contributor entry.
- **Frozen thresholds.** `thresholds.ts` (no imports) holds `ACCEPTANCE_EPOCHS`, `SCRIPT_MAPPING`, the three script ranges, `HORIZON_TICKS`, the two run-time constants, the goal metrics, the window, stuck, frozen, station-sphere, hull-crossing and repair constants, `HULL_CROSSING_CLASSES` with the classification order and episode rule, `ALERT_ACTING_BEHAVIOURS` with each Oolite line, `FLYER_START_OFFSETS` with the designed near pass derivation, `RUN_MINIMUMS`, `NEAR_PLAYER_RADIUS_M`, the parking rule, the frozen-set definition and the escalation options (a) to (c). `accepted-crossings.ts` exports the empty `ACCEPTED_HULL_CROSSINGS` and its entry type.

## Task Commits

1. **Task 1 (tracer): the dist absence check wired into verify, verify-full and Pages** - `d1e7f83` (feat)
2. **Task 2: the acceptance thresholds, start placement, run minimums and the empty accepted-crossings list** - `b33e72f` (test)

Tracer feedback gate: auto mode is on, so the tracer's `<verify>` was run end to end after the commit (targeted vitest, the real-bundle check, then the remote `verify`); all passed and the plan expanded.

## Verification

- `docker compose run --rm test npx vitest run tools/ai-harness/dist-check.test.ts tests/contract/container-contract.test.ts`: 2 files, 39 tests passed. With `tests/guards` as well (the harness-isolation guard): 11 files, 260 tests passed.
- Real bundle: `npx vite build --config vite.e2e.config.ts --outDir /tmp/dist-check --emptyOutDir` then `tsx tools/ai-harness/dist-check.ts /tmp/dist-check`: `106 files scanned, no AI harness marker`, exit 0.
- `docker compose run --rm lint` and `docker compose run --rm typecheck`: clean after both tasks.
- Remote `verify` (committed HEAD `d1e7f83`): `exit=0 elapsed=206s`; 176 test files, 3,893 tests passed, 10 skipped; `check:dist: 106 files scanned in dist, no AI harness marker` appears between the e2e build and `test:e2e:fast`; 27 Chromium smoke specs passed.
- Acceptance greps of Task 2: every count as specified (`HORIZON_TICKS`, `MAX_HULL_CROSSINGS`, `STATION_SCRIPT_RANGE_M`, `PLAYER_PARK_DISTANCE_M`, the classes, `ALERT_ACTING_BEHAVIOURS`, `FLYER_START_OFFSETS`, `RUN_MINIMUMS`, `attackTicksNearPlayer: 5_500`, the two timeouts all 1 or at least 1; `PLAYER_PARK_MIN_SHIP_CLEARANCE_M` 0; `ACCEPTED_HULL_CROSSINGS`, `firstTick` and `"other"` present in `accepted-crossings.ts`, list empty).

## Execution-time checks recorded for plan 14-17 and the reviewers

- **`thresholds.ts` commit:** `b33e72f`. `git log --format=%h -- tests/acceptance/thresholds.ts` lists that commit only (summary check, not a test).
- **Slot-to-role table** checked against `src/sim/world/populate.ts:95-104` and `tests/golden/world/inert-lave-epoch1.json`: 101 moray (trader), 102 cobramk1 (trader), 103 adder (trader), 104 and 105 sidewinder (hunters), 106 krait, 107 sidewinder, 108 moray (pirates), 109 and 110 viper (police), 111 adder (shuttle role), 112 cobramk1 (scavenger). It matches the plan's slot table.
- **Per-slot radius ranges** from `ships-npc.json`: trader Adder 29.03, Moray 36.19, Cobra Mk I 39.26; pirate 29.03 (Adder) to 50.20 (Krait); hunter 31.91 (Gecko) to 50.20 (Krait); police Viper 35.06; scavenger role held only by the Adder and the Cobra Mk I (29.03, 39.26). Shuttle role: Adder and Shuttle (22.75, unarmed, 80 m/s), so only slot 111 can draw it.
- **Near-pass margins** (slots 102 and 112, 29.03 <= r <= 39.26): L = 83 m is above the largest radius sum 78.52 m by 4.48 m; below the smallest proximity zone 2 x 29.03 + 29.03 = 87.09 m by 4.09 m; below the smallest pair trigger 4 x 29.03 = 116.12 m by 33.1 m. Masses are 16,045 kg and up, above the 2,000 kg floor.
- **Placement geometry** recomputed from the committed `FLYER_START_OFFSETS` and the Lave layout (scratch scripts under the session scratchpad, mounted into the test container; nothing added to the repository): minimum start separation 4,000 m (flyer 5 to the station centre) and 5,000 m among flyers and the parked player, escort pairs 1,500 m; the near pass is the only straight path within 4,000 m of another start (flyer 1 past flyer 11 at 83.0 m; the next closest station, intercept or flee path is 4,717 m, and the paths of flyers 2 and 8 are 7,071 m and 5,657 m); tightest planet-interval margin 9,568 m (flyer 0, axis b); farthest start 16,155 m from the station; station to planet surface 41,113 m; parked-player planet clearance 37,651 m, sun clearance 818,645 m.
- **Oolite lines** re-read in `/home/opencode/git/oolite` before they went into doc comments: `ShipEntity.m` 665-672, 3881, 4128, 4160, 4652-4663, 4898, 4925, 6105, 6119-6131, 8705-8708, the proximity call-site lines (3812, 3911, 3950, 4631, 4787, 4914, 4962, 5044, 5131, 5150 and the out-of-scope ones), `ShipEntity.h` 124-128, `CollisionRegion.m` 296-324 and `Universe.h` 99-100. All matched the plan.

## Decisions Made

- No marker for a bare Oolite script file name, and a `dist` holding only source maps is reported as empty (exit 2).
- `thresholds.ts` exports a few small frozen constants beyond the plan's list (`FROZEN_HARNESS_FILES`, `DETECTOR_CHANGE_TRAILER`, `GOAL_METRICS`, `FLEE_TARGET_ALERT_MIN_ACCURACY`, `PLAYER_PARK_AXIS_ORDER`), each carrying a definition the plan states in prose, so plan 14-17 reads one source.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lint and format on the first draft**
- **Found during:** Task 1, after the first lint run
- **Issue:** `no-useless-assignment` on a `let isDirectory = false` in `checkDist`, and one prettier diff in the test file.
- **Fix:** moved the directory test into a small `isDirectory(path)` helper; ran prettier on the two new files.
- **Files modified:** `tools/ai-harness/dist-check.ts`, `tools/ai-harness/dist-check.test.ts`
- **Commit:** `d1e7f83` (fixed before the commit)

**2. [Rule 3 - Blocking] The parking rule had no natural constant to carry its doc comment**
- **Found during:** Task 2, review of the first draft of `thresholds.ts`
- **Issue:** the draft hung the parking-rule comment on an invented boolean constant, which would have been noise in a frozen file.
- **Fix:** the rule's text now sits on `PLAYER_PARK_AXIS_ORDER`, the data it defines; no constant was added for it.
- **Files modified:** `tests/acceptance/thresholds.ts`
- **Commit:** `b33e72f` (fixed before the commit)

**Total deviations:** 2 auto-fixed, both before their commits. **Impact:** none on scope.

## Issues Encountered

None. The remote `verify` ran on a HEAD that already held plan 14-06's finished commits and passed on the first run, so the plan's rerun clause was not needed.

## Known Stubs

None. `ACCEPTED_HULL_CROSSINGS` is intentionally empty (filled only on the owner's option (a) answer at plan 14-17's checkpoint); this is the designed state, not a stub. No entry was added to `.planning/WINDOWS.md`.

## Threat Flags

None beyond the plan's threat model: the new surface is a read-only scan of `dist/` and a data-only module with no imports.

## Next Phase Readiness

- Plan 14-16 (flight-script pilot, spawner) and plan 14-17 (acceptance harness) can import `tests/acceptance/thresholds.ts` and must not edit it; plan 14-17's freeze check should expect exactly the commit `b33e72f` and use `FROZEN_HARNESS_FILES` and `DETECTOR_CHANGE_TRAILER`.
- Plan 14-17 must assert `STATION_RADIUS_M` equals `layout.station.radius` and the three script ranges equal the spawner's exports.
- AI-01 and AI-11 are advanced, not completed: the AI-11 dist absence check is now in place, but the fidelity report and the owner's oracle choice (plan 14-19) remain; AI-01 needs the port and the 20-seed run.
- Any later phase that ports the AILib controller under one of the three marker names must revise `DIST_MARKERS` deliberately.

## Self-Check: PASSED

- Created files exist: `tools/ai-harness/dist-check.ts`, `tools/ai-harness/dist-check.test.ts`, `tests/acceptance/thresholds.ts`, `tests/acceptance/accepted-crossings.ts`.
- Commits exist on this branch: `d1e7f83` and `b33e72f`; measured `commits: 2` from `plan_head_before` to `plan_head_after`.
- Task acceptance criteria re-run: pass (see Verification).
