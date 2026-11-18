---
phase: quick
plan: 261118-n7z
subsystem: flight-sim, session, fidelity, tests
status: complete
tags: [compass, flight-hash-pins, market-sort, fidelity, ci-contract]
requires: []
provides:
  - ADVANCED_COMPASS_KEY gate on cycleCompass/targetStation and the per-step reset to auto
  - regenerated tests/golden/world/flight-hash-pins.json (deliberate 2026-11-18 baseline)
  - marketSort reset on New game, cold Continue and warm Load
affects: [src/sim/flight/step.ts, tests/helpers/recorded-flights.ts, src/app/session]
tech-stack:
  added: []
  patterns: [ownership read only from StepOptions.equipment (T-04-19)]
key-files:
  created: []
  modified:
    - src/sim/flight/step.ts
    - tests/sim/aegis.test.ts
    - tests/helpers/recorded-flights.ts
    - tests/golden/world/flight-hash-pins.json
    - tests/helpers/write-world-goldens.ts
    - tests/sim/world/flight-hash-pins.test.ts
    - tests/helpers/tick-script.ts
    - .planning/PROJECT.md
    - src/app/session/start-session.ts
    - src/app/session/save-controller.ts
    - tests/app/session/start-session.test.ts
    - tests/app/session/save-controller.test.ts
    - src/app/session/chart-controller.ts
    - src/render/hud/draw.ts
    - src/app/hud-model.ts
    - src/render/launch-camera.ts
    - tests/contract/container-contract.test.ts
    - tests/e2e/launch.spec.ts
    - tests/ui/station-status.test.ts
    - FIDELITY.md
    - CHANGELOG.md
    - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
decisions:
  - "Compass modes need the Advanced Space Compass: without EQ_ADVANCED_COMPASS the cycle and target-station keys are inert and a carried non-auto mode resets to auto each step (owner decision 1)"
  - "One deliberate regeneration of the v1 flight-hash pins with removal of baselineFlightState and baselineLaunchPose (owner decision 8, PROJECT.md Key Decisions row)"
metrics:
  duration: approx. 75 min
  completed: 2026-11-18
actuals:
  tokens: 23000
  tasks: 4
  commits: 4
plan_head_before: e113f8dad593506bd27140ddf19623423092e0fc
plan_head_after: 8e0a3bdb1963d98c958a91cd32e83fb68cde7333
---

# Quick 261118-n7z: review follow-ups since 0.5.0 and the compass gate Summary

The basic compass now behaves as in Oolite (mode keys inert without the Advanced Space Compass, a carried
non-basic mode falls back to auto). The flight-hash pins were regenerated once, without their two baseline shims.
The F8 market sort resets on New game, Continue and Load. Seven review findings were closed in FIDELITY,
comments and three new tests. verify-full is green on the remote against the final HEAD.

## Commits

| Task | Commit  | Message |
| ---- | ------- | ------- |
| 1 | e6d0c5f | feat(quick-261118-n7z): gate compass modes on the Advanced Space Compass |
| 2 | b98c02a | test(quick-261118-n7z): regenerate the flight-hash pins once and remove the baseline shims |
| 3 | f25f5d9 | fix(quick-261118-n7z): reset the market sort on new game and load; fix drifted citations |
| 4 | 8e0a3bd | test(quick-261118-n7z): pin the CI gate, the HUD canvas at handover and the manifest units; record HUD alpha and launch roll |

## Task 1: compass gate (owner decision 1)

- `ADVANCED_COMPASS_KEY = "EQ_ADVANCED_COMPASS"` is exported from `src/sim/flight/step.ts`. Ownership is read
  once per step from `options?.equipment?.has(...)`. The step resets a non-auto mode to auto before the command
  loop when the ASC is missing. `cycleCompass` and `targetStation` do nothing without the ASC. With the ASC, the
  cycle is unchanged.
- TDD: the RED run had 6 failures (2 inert-key cases, 3 reset cases, 1 docked reset), then went GREEN.
  `tests/sim/aegis.test.ts` covers the with-ASC cycle (auto -> planet -> station -> witchpoint -> auto, then
  targetStation -> station), inert keys with no options and with an equipment set that lacks the ASC, the
  planet/station/witchpoint reset to `autoCompassTarget`, a kept witchpoint with the ASC, the docked reset, and
  equal `hashFlight` values for twin states.
- Golden check with the shims still in place: the full suite was green (5829 passed, 10 skipped), and
  `git diff --name-only e113f8d -- tests/golden src/content/generated src/sim/world src/sim/npc` was empty. The
  compass gate moved no hash.
- FIDELITY: a new Mechanics row (`src/sim/flight/step.ts:204`,
  `src/Core/Entities/PlayerEntityControls.m:3629-3637`, faithful) with verbatim excerpt E-115. The fidelity
  parser reads citations from the Oolite column only, so the Mechanic cell mentions `PlayerEntity.m:10258-10260`
  in short form. The `step.ts:230` row moved to `257` (same statement).
- Residual ASC differences, not ported (owner kept the current ASC cycle): Oolite switches BASIC to PLANET when
  the ASC is bought (`PlayerEntity.m:10176`). Its cycle also covers the sun, the target and beacons; Wegolite
  cycles only planet, station and witchpoint.

## Task 2: flight-hash pins regeneration (owner decision 8)

- Removed `baselineFlightState` (3 call sites now `initFlightState(context.layout)`), `baselineLaunchPose` and
  its call in `Recorder.step`, and the `CLOCK_START` import. `SimEvent` and `SystemLayout` are still used.
- **Red run** (shims removed, old JSON), `vitest run tests/sim/world/flight-hash-pins.test.ts
  tests/sim/world/hash.test.ts`: Test Files 2 failed; Tests 3 failed | 27 passed | 1 skipped (31):
  - flight-hash-pins > reproduces the committed golden exactly
  - flight-hash-pins > holds when replayed through stepSim with a pristine combat state, hashed with hashWorld
  - hash > empty-world hash identity (D-08) > equals hashFlight and the pinned golden on every recorded sample
- **Old sha256:** `ba5071f73d4952b8738c788790c027183fe874fe7e4281da67eff82f24ced1ab`
- **New sha256** (writer + prettier, run 1 and run 2, identical):
  `e7d667246d7f27da0658abdf43a2b6713ed586ef48be408b38316aaa3a06179d`
- `formatVersion` is still 1, with the same three flights and the same sample ticks (26, 15, 43). All 84 hashes
  moved, because the clock is hashed from the first sample (tick 1). The per-shim attribution (optional) was not
  measured.
- After regeneration: the pins, hash and tick-parity tests passed (59 passed, 1 skipped). The full suite, lint and
  typecheck were green.
- Rewrote the headers of `recorded-flights.ts`, `write-world-goldens.ts`, `flight-hash-pins.test.ts` and the
  `tick-script.ts` cross-reference. They now describe a deliberate 2026-11-18 baseline that needs an
  owner-approved regeneration to change.
- PROJECT.md gains exactly one Key Decisions row: "One deliberate regeneration of the v1 flight-hash pins and
  removal of their baseline shims (owner decision 2026-11-18, quick 261118-n7z)", outcome "✓ Quick 261118-n7z".
- `git diff --name-only e113f8d -- tests/golden src/content/generated src/sim/world src/sim/npc` lists exactly
  `tests/golden/world/flight-hash-pins.json`. No other golden was regenerated. Nothing under `src/sim/world` or
  `src/sim/npc` changed, so no NPC acceptance rerun is needed.

## Task 3: market sort reset and comments

- `save-controller.ts` `loadFromSave`: `ctx.station.marketSort = null;` inside the one synchronous install
  block, after `ctx.core.market = nextMarket;`.
- `start-session.ts`: `ctx.station.marketSort = null;` once, after the New game / Continue if/else and before
  `ctx.core.state = flightState;`. It is outside `clearSaveForNewGame`.
- Test form: the **warm Load** has a **behavioural** test in `save-controller.test.ts` ("(h)"; the existing
  harness drives `loadFromSave`). A docked or in-flight Load resets a column sort, and a parse failure keeps it.
  **startSession** has **ordered source facts** in `start-session.test.ts`: exactly one assignment, after the
  else arm, before the state install, after `await clearSaveForNewGame();`.
- Citations checked at 7437f22: `HeadUpDisplay.m:1113` -> `1110` (draw.ts, hud-model.ts); `2545-2595` ->
  `2542-2594`; `3220-3234` -> `3216-3231`. `launch-camera.ts` now says the world is hidden only while more than
  five rings are alive (`Universe.m:3516-3520`). The chart-controller "launch cinematic" comment was replaced.
- FIDELITY line shifts: `chart-controller.ts:198` -> `199`, `launch-camera.ts:192` -> `193` (same statements).
- CHANGELOG Fixed entry added.

## Task 4: FIDELITY wording, divergences, tests

- E-100 row: the tie order is Wegolite's choice. Oolite's `sortedArrayUsingFunction:` calls
  (`PlayerEntity.m:9616-9624`) leave equal keys to Foundation.
- E-113 row: Oolite draws ten rings and hides the world only while more than five are alive
  (`Universe.m:3516-3520`).
- E-08 row (launch roll): Wegolite rolls the hull with the station during the launch (D-10). Oolite saves the spin
  and zeroes `flightRoll` (`PlayerEntity.m:6469-6470`). `performLaunchingUpdates` restores it once
  `breakPatternHide` is false (`PlayerEntity.m:3521-3522`, context verified).
- Open items: added "HUD alpha (open)" (`hud.plist:392` overall_alpha 0.75, `HeadUpDisplay.m:1645` aegis
  0.5 x 0.75, `crosshairs.plist:45-51` arms 0.75 inner to 0.25 outer per `OOCrosshairs.m:142-147`,
  `HeadUpDisplay.m:1339` lollipop tails 1/3). The same item is in the flight-HUD todo under a new "Open items
  found in quick task 261118-n7z" heading.
- Tests: (a) region-scoped assertions on the aggregate `verify:` job in `container-contract.test.ts`; (b) `#hud`
  backing store and bounding box greater than 0 at handover in `launch.spec.ts`; (c) a manifest with t, kg and g
  goods and no `alien_items` in `station-status.test.ts`.
- Fidelity contract in verbatim mode (`OOLITE_SRC=/oolite`, 7437f22 archive): 9 passed.

## Gate results

| Gate | Where | Result |
| ---- | ----- | ------ |
| `docker compose run --rm test` | local, after each task | green: T1 5829 passed / 10 skipped; T2 5829/10; T3 5832/10; T4 5833/10 (221 files) |
| `docker compose run --rm lint` | local, after each task | green |
| `docker compose run --rm typecheck` | local, after each task | green |
| fidelity contract with `OOLITE_SRC` | local | 9 passed (after T1 and T4) |
| `wegolite-remote-run.sh run --rm verify-full` | remote, snapshot `8e0a3bd` (final HEAD) | **exit=0, elapsed=672s**: unit 5833 passed / 10 skipped; Chromium e2e 140 passed (8.9m); bundle seam check 2 passed |

## Deviations from Plan

1. **[Rule 1 - citation] Market sorter lines.** The plan gave `PlayerEntity.m:9621-9627`. At 7437f22 the
   `sortedArrayUsingFunction:` calls are at lines 9616-9624 (9621-9627 covers only the HOLD/UNIT cases and the
   OFF break), so FIDELITY cites `9616-9624`. The plan's check `rg -c "9621-9627" FIDELITY.md` therefore finds 0
   by design. `rg -c "9616-9624"` finds 1.
2. **[Rule 1 - stale comment] `src/app/hud-model.ts:200`** said "the recorded launch-and-fly golden is frozen",
   which stopped being true after Task 2. It now says the golden pins the torus fields. This is comment-only, in
   a file the plan already lists for Task 3.
3. **Launch-roll restore citation** is `PlayerEntity.m:3521-3522` (the `breakPatternHide` guard plus the
   assignment), not `:3522` alone. The surrounding condition was verified as the plan asked.
4. The todo's HUD alpha line sits under a new heading, "Open items found in quick task 261118-n7z", and not under
   the 261118-cyn heading, so its origin is labelled.

## Pins moved

Only the planned one: `tests/golden/world/flight-hash-pins.json` (Task 2, cause: removal of the clock and
launch-pose shims). No pin moved in Task 1, 3 or 4.

## PROJECT.md compass grep

`rg -n -i "compass" .planning/PROJECT.md` before this task: one hit, line 320 (261118-ih8 legend sizing). After
this task: that hit and the new decision-8 row (line 324), which mentions the compass gate's no-hash proof. No
Key Decision chose free compass cycling, so nothing is superseded.

## Known Stubs

None.

## Self-Check: PASSED

- Files exist: src/sim/flight/step.ts, tests/golden/world/flight-hash-pins.json, all modified files above.
- Commits present on HEAD: e6d0c5f, b98c02a, f25f5d9, 8e0a3bd.
