---
phase: 22-initial-population
plan: 14
subsystem: session-traffic
tags: [population, session-wiring, browser-twin, re-pin, e2e, changelog, key-decisions]

requires:
  - phase: 22-initial-population
    provides: "createSystemPopulate (22-13), the Node twins re-pinned onto the 28-ship Lave world (22-13), the census golden (22-12)"
provides:
  - "the live browser session populates every arrival with traffic on through createSystemPopulate (start-session.ts)"
  - "the source pin of the session wiring (world-lifecycle.test.ts), the browser traffic-on specs re-pinned onto the populated Lave with each twin equal to its Node value"
  - "lavePopulatedWorld(epoch) fixture beside laveInertWorld (tests/helpers/traffic-fixture.ts)"
  - "CHANGELOG Unreleased entry, Key Decisions row 'The live session populates through the system populator (WORLD-08)', FIDELITY E-35 rewritten"
affects: [22-15, 22-16]

actuals:
  tokens: 7400
  tasks: 3
  commits: 3
plan_head_before: 4307cdddf6f95accec5f9012735ad6d85e15e603
plan_head_after: 0c5c72ca1cf1aec8f14b9bb00833509f4eac14b8

tech-stack:
  added: []
  patterns:
    - "browser twin literals follow the Node twin of the plan that moved them: browser == Node is checked by comparing the two literals, then by the remote spec run"
    - "a spec count that must follow the population is derived from the Node fixture (liveEntityCount(lavePopulatedWorld(0))) instead of a bare literal where the Node side already builds the same world"

key-files:
  created: []
  modified:
    - src/app/session/start-session.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/e2e/traffic.spec.ts
    - tests/e2e/combat.spec.ts
    - tests/e2e/tick-hook.spec.ts
    - tests/e2e/npc-flight.spec.ts
    - tests/e2e/anarchy.spec.ts
    - tests/helpers/traffic-fixture.ts
    - CHANGELOG.md
    - .planning/PROJECT.md
    - FIDELITY.md

key-decisions:
  - "The session passes createSystemPopulate the four call-time getters (npcTraffic, layout, system, galaxy); ctx.core.system is already updated before worldLifecycle.begin on a jump, so the arrival system is the one populated"
  - "The traffic spec's reload check computes the expected cold-Continue entity count from the Node fixture lavePopulatedWorld(0) rather than hard-coding it; the Node death twin (22-13) records the same epoch-0 world (16 ships)"
  - "death-and-reload, game-over-guard, statics and anarchy needed no re-pin: their counts are relative or unpinned"

patterns-established:
  - "Phase 22 re-pin comment format in browser specs: plan id, 'owner-sanctioned, Phase 21 D-04', old value, new value, cause"

requirements-completed: [WORLD-08]

coverage:
  - id: D1
    description: "The live session populates every traffic-on arrival through createSystemPopulate; createInertPopulate is gone from start-session.ts; traffic off unchanged"
    requirement: WORLD-08
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#session wiring of the system populator (plan 22-14, WORLD-08)"
        status: pass
      - kind: unit
        ref: "tests/app/session/test-flags.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The browser equals the Node twin on the populated Lave: combat hash and debris twin, CBT-08 damage twin, replay hash and entity counts"
    requirement: WORLD-08
    verification:
      - kind: e2e
        ref: "tests/e2e/combat.spec.ts (2 tests), tests/e2e/traffic.spec.ts (3 tests), tests/e2e/tick-hook.spec.ts, tests/e2e/npc-flight.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The eight opt-in specs pass on the populated world, traffic stays off by default in the browser-test bundle, and the first-load ceiling and prefetch assertions hold"
    requirement: WORLD-08
    verification:
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm verify-full (exit 0, 167 Chromium tests + 2, snapshot 0c5c72ca)"
        status: pass
      - kind: other
        ref: "git diff --name-only 4307cddd..HEAD -- vite.e2e.config.ts tests/golden/world/inert-lave-epochs-1-20.json tests/golden/world/inert-lave-epoch1.json tests/acceptance (empty)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The change is recorded for players (CHANGELOG), in Key Decisions beside WORLD-15, and in FIDELITY E-35"
    requirement: WORLD-08
    verification:
      - kind: other
        ref: "rg 'The live session populates through the system populator \\(WORLD-08\\)' .planning/PROJECT.md == 1; CHANGELOG Unreleased contains 'populated'"
        status: pass
    human_judgment: false

duration: 60min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 14: The live session on the system populator Summary

**The browser session now populates every traffic-on arrival through `createSystemPopulate` (28 ships at the Lave epoch 1), with every traffic-on browser twin re-pinned once to the Node value plan 22-13 recorded and the change recorded in the changelog, Key Decisions and FIDELITY.**

## Performance

- **Duration:** about 60 min (remote runs: two specs 78 s, five specs 46 s, anarchy 27 s, `verify-full` 376 s failed on a flake then 1,196 s green, acceptance 91 s)
- **Started:** 2026-11-26T18:55Z (approx.)
- **Completed:** 2026-11-26T19:45Z (approx.)
- **Tasks:** 3 (task 1 a tracer, then two auto tasks)
- **Files modified:** 11 (none new)

## Accomplishments

- `start-session.ts` builds the world lifecycle with `createSystemPopulate(() => ctx.core.npcTraffic, () => ctx.core.layout, () => ctx.core.system, () => galaxy)`; `createInertPopulate` is no longer imported or called there. The inert table, `createInertPopulate` and the frozen path are untouched. Traffic off is unchanged (the closure returns before any draw or id).
- The `world-lifecycle.test.ts` source pin (renamed "session wiring of the system populator (plan 22-14, WORLD-08)") asserts `populate: createSystemPopulate(` once after the traffic flag, the four getters, and no `createInertPopulate(`. It was written first and failed against the old wiring (RED), then passed after the switch (GREEN).
- Tracer result: `traffic.spec.ts` (3 tests) and `combat.spec.ts` (2 tests) pass in the browser on the populated Lave, with `TWIN_HASH_60_AFTER_KILL` equal to the Node `HASH_60_AFTER_KILL` ("e0a3e3dc"), and the prefetch and first-load (9,437,184 byte) assertions holding.
- Re-pins below; `death-and-reload`, `game-over-guard`, `statics` and `anarchy` needed none.
- Records: CHANGELOG `### Added` entry, Key Decisions row "The live session populates through the system populator (WORLD-08)" right after the WORLD-15 row (the WORLD-15 status cell now says the table serves only the frozen path), E-35 rewritten.

## Task Commits

1. **Task 1 (tracer)** - `28aa60f1` (feat): session wiring, the source pin, `traffic.spec.ts` and `combat.spec.ts` re-pins, `lavePopulatedWorld`, CHANGELOG
2. **Task 2** - `edff2337` (test): `tick-hook.spec.ts` and `npc-flight.spec.ts` re-pins
3. **Task 3** - `0c5c72ca` (docs): Key Decisions row, E-35, anarchy spec note

**Plan metadata:** the commit of this SUMMARY.

## Browser re-pins (owner-sanctioned, Phase 21 D-04 standing approval)

Condition (1): the cause is measured and intended: the populated world replaces the 12-ship inert table (28 ships at the Lave epoch 1, the census golden), and the hook-spawned shooter takes id 129 instead of 113, which moves its debris and combat streams. Condition (2): every twin value equals the Node value plan 22-13 recorded, and the remote browser run is green on each (a browser value that differed would have stopped the plan; none did). Owner-reserved pins (`inert-lave-epochs-1-20.json`, `inert-lave-epoch1.json`, `tests/acceptance/**`, `vite.e2e.config.ts`) did not move.

| Spec | Value | Old | New | Node twin / cause |
| ---- | ----- | --- | --- | ----------------- |
| `combat.spec.ts` | `TWIN_HASH_60_AFTER_KILL` | "14a8a453" | "e0a3e3dc" | `HASH_60_AFTER_KILL` in `tick-parity.test.ts` (22-13): 16 more ships in the world text, shooter id 113 -> 129, moved debris |
| same | `TWIN_ENTITIES_AT_KILL` | 16 | 33 | `ENTITIES_AT_KILL`: 28 ships + 4 pods + 1 plate |
| same | `TWIN_PLATES_AT_KILL` | 0 | 1 | `DEBRIS_AT_KILL.plates`: a plate model is now requested after the kill |
| same | `TWIN_WRECKS_AT_KILL` (new constant) | (implicit 2) | 0 | `DEBRIS_AT_KILL.wrecks`: the wreck-model poll became conditional on it, as the CBT-08 test already was (the debris is 4 pods, 1 plate, 0 wrecks; the pods count of 4 is implied by the entity count) |
| same | `TWIN_DAMAGE_SPAWN_DELAY` | 1 | 2 | `DAMAGE_SPAWN_DELAY` (22-13): at delay 1 the populated world damages no item; the plan 19-13 selection rule picks 2 |
| same | `TWIN_DAMAGE_FIRST_OFFSET` | 613 | 612 | `DAMAGE_FIRST_OFFSET` |
| same | `TWIN_DAMAGE_ENTITIES_AT_KILL` | 13 | 29 | `DAMAGE_ENTITIES_AT_KILL`: 28 ships + 1 wreck |
| same | `TWIN_DAMAGE_HASH_60_AFTER_KILL` | "5028fc8f" | "7bb254ef" | `DAMAGE_HASH_60_AFTER_KILL` |
| `traffic.spec.ts` | entities at launch (two tests) and after 600 ticks | 12 | 28 | census epoch 1 for Lave; the Node replay of the same script (hash equal) was already populated by 22-13 |
| same | reload test entities | 12 | `liveEntityCount(lavePopulatedWorld(0))` | the cold Continue rebuilds the epoch-0 world through the populator (the Node death twin records 16 ships and next id 117) |
| same | reload test scanner pose and expected ships | `laveInertWorld(0)` | `lavePopulatedWorld(0)` | the pose lies 5 km from the first ship of the world the browser now builds, so the scanner check stays non-vacuous |
| `tick-hook.spec.ts` | entities after the traffic opt-in launch | 12 | 28 | census epoch 1 for Lave |
| `npc-flight.spec.ts` | entities after the flyers | `12 + FLYERS` | `28 + FLYERS` | 28 populated ships + 3 flyers (31, as `tick-flyers.test.ts` records) |
| `death-and-reload.spec.ts`, `game-over-guard.spec.ts`, `statics.spec.ts`, `anarchy.spec.ts` | none | | | no 12-ship literal; they pass unchanged. `anarchy.spec.ts` counts are relative to `entitiesBefore` (a comment records it); the death twin's tick offset and cause did not move |

No fixture adaptation was needed: no scripted shooter, flyer path or ram met a populated ship (the ships are inert and placed by the populator, never launched, D-01), so nothing was moved through hook arguments and the population was not touched. No spec gained a fixed sleep.

## Gates

- Targeted local: `world-lifecycle.test.ts` + `test-flags.test.ts` pass (79 tests); `tests/contract` pass; `lint` and `typecheck` clean (local, after the last commit's files).
- Remote specs (each after its commit): traffic + combat 5 passed (snapshot 28aa60f1, 78 s); death-and-reload, game-over-guard, tick-hook, npc-flight, statics 14 passed (snapshot edff2337, 46 s); anarchy 1 passed (snapshot edff2337, 27 s; `anarchy-counts: worstCaseCalls 39, worstCaseTriangles 92686, afterKillCalls 41, afterKillTriangles 93174, keys 29, debrisEntities 3`, within `DRAW_CALL_BUDGET` and `TRIANGLE_BUDGET`, the 21-18 tripwire not hit).
- Remote `verify-full` (a superset of the plan's `verify`: lint, typecheck, content drift, the full Vitest suite, the build and the full Chromium suite) at snapshot 0c5c72ca: first run exit 1 on one failing test, `tests/guards/harness-isolation.test.ts` "nothing shipped imports the harness or carries its sentinel", with `ENOENT .../src/sim/ai/__purity_probe_2.ts`. This is a race between two guard tests under the parallel Vitest workers (`tests/guards/ai-zone.test.ts` creates and deletes `__purity_probe_N.ts` files under `src/sim/ai/` while the harness-isolation scan reads the tree); neither file nor the code under test is touched by this plan, and 10,452 other tests passed. Rerun once at the same snapshot: **exit 0, 1,196 s elapsed, 322 test files passed (1 skipped), 10,453 tests passed (16 skipped), 167 Chromium tests passed, plus 2 more**, no failed or flaky test.
- 20-seed NPC acceptance run (`run --rm test npm run test:acceptance`, remote, snapshot 0c5c72ca): exit 0, 91 s, 1 file, 21 tests passed. The thresholds, detectors and inputs are unchanged (`git diff --name-only 4307cddd..HEAD -- tests/acceptance` is empty); this plan changes the NPC traffic runtime path of the browser only, and the frozen acceptance inputs still use the inert path.
- Acceptance criteria: `rg -c "populate: createSystemPopulate\("` = 1; `createInertPopulate(` in `start-session.ts` = 0; the two twin hash literals are both "e0a3e3dc" (the Node file also holds "7bb254ef" for the damage twin, matched by `TWIN_DAMAGE_HASH_60_AFTER_KILL`); Key Decisions row count = 1; CHANGELOG Unreleased matches "populated"; the golden, acceptance and `vite.e2e.config.ts` diff is empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A populated-world fixture was missing for the reload scanner check**
- **Found during:** Task 1
- **Issue:** `traffic.spec.ts`'s reload test placed the pose and computed the expected scanner count from `laveInertWorld(0)`, which models the frozen inert table, so it could not describe the world the browser now builds.
- **Fix:** added `lavePopulatedWorld(epoch)` to `tests/helpers/traffic-fixture.ts` (same seed as `laveInertWorld`, populated through `createSystemPopulate` over `systems/g0.json`), and an opt-in third argument `populated` to `poseNearFirstShip`; `laveInertWorld` and its other users (frozen goldens, acceptance, `hud-model.test.ts`) are unchanged.
- **Files modified:** `tests/helpers/traffic-fixture.ts` (outside the plan's file list)
- **Verification:** traffic spec passes on the remote; typecheck and lint clean.
- **Committed in:** `28aa60f1`

**2. [Plan guidance - re-pin scope] the combat twin's wreck-model poll became conditional**
- **Found during:** Task 1
- **Issue:** the debris twin's kill now releases no wreck (0 wrecks), but the spec polled unconditionally for a wreck model, which would fail.
- **Fix:** a `TWIN_WRECKS_AT_KILL` constant (0), the poll guarded by it, the same shape the spec's CBT-08 test already uses.
- **Committed in:** `28aa60f1`

**3. [Flake, not caused by this plan] `harness-isolation.test.ts` raced `ai-zone.test.ts` in the first `verify-full`**
- Recorded under Gates. Rerun at the same snapshot, green. Not fixed here (out of scope: neither file is touched by this plan). It is worth a follow-up todo: the two guards share `src/sim/ai/` and run in parallel workers.

---

**Total deviations:** 1 auto-fixed (Rule 3), 1 recorded scope call, 1 out-of-scope flake.
**Impact on plan:** none on scope. The only addition is a test fixture; no sim, content, golden or acceptance file changed.

## Issues Encountered

- `git`-bearing compound shell commands and any command mentioning the worktree path inside a redirect are refused in this worktree sandbox; remote logs were written under `/tmp/t14` through plain commands and a small helper script.

## Known Stubs

None.

## Threat Flags

None. The session wiring adds no endpoint, auth path, file access or trust-boundary schema; the closure was proven total in plan 22-13 (T-22-20) and is the one call site switched here. T-22-22 (flaky scripted geometry): no spec met a populated ship, and no spec gained a sleep. T-22-23 (a re-pin hiding a Node/browser divergence): every twin value equals its Node value and the browser run is green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 22-15 can add `tests/e2e/population-anarchy.spec.ts` (the QUAL-09 browser proof) and the phase gate on top of the populated session; `anarchy.spec.ts` already runs within budget with the population present (39 calls, 92,686 triangles).
- Follow-up worth recording: the `harness-isolation` / `ai-zone` guard race under parallel workers.

## Self-Check: PASSED

- Files exist: `src/app/session/start-session.ts` (with `createSystemPopulate(`), `tests/helpers/traffic-fixture.ts` (`lavePopulatedWorld`), this SUMMARY.
- Commits `28aa60f1`, `edff2337`, `0c5c72ca` are ancestors of HEAD (3 commits measured by `git rev-list --count 4307cddd..HEAD` before this SUMMARY).
- Acceptance criteria re-run and passing (see Gates); STATE.md and ROADMAP.md untouched.

---
*Phase: 22-initial-population*
*Completed: 2026-11-26*
