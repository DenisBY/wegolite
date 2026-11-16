---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 18
subsystem: app
tags: [npc-flight, session-wiring, test-hook, replay, e2e-smoke, probe-shape]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-11's flightTableFrom and StepOptions.npcFlight; plan 14-16's spawnTestFlyers (sixth parameter station), FlyerRecords and scriptGoalMetric; plan 14-17's frozen acceptance harness
provides:
  - TrafficContent.flight, built by flightTableFrom, handed to every step of the live session and of the Node tick replay as StepOptions.npcFlight
  - the ?test=1 hook member spawnTestFlyers(): boolean (taints first; Shuttle to the station, Viper intercepting, Adder fleeing)
  - testFlyerRecords and TEST_FLYER_KEYS (src/app/session/traffic.ts), the one record picker of the hook and the replay
  - TickStep.spawnFlyers, the replay half of the hook
  - tests/e2e/npc-flight.spec.ts, the opt-in browser smoke
affects: [14-19]

requirements-completed: [WORLD-07]
requirements-advanced: [AI-01]

plan_head_before: 2fdabbb8aa3756a794ebecf087f7fec919da87eb
plan_head_after: d8b4483ca9b2081ab30edcf49e8f31769ade7831

actuals:
  tokens: 8400
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "One builder, two consumers: the session and the Node replay read the same flight table from TrafficContent, so a second mapping cannot drift"
    - "A replay step that must act (spawnFlyers) throws when it cannot, instead of hashing a script that silently did nothing"

key-files:
  created:
    - tests/e2e/npc-flight.spec.ts
    - tests/app/session/tick-flyers.test.ts
  modified:
    - src/app/session/traffic.ts
    - src/app/session/step-options.ts
    - src/app/session/sim-driver.ts
    - src/app/probe.ts
    - src/app/session/probe-publisher.ts
    - tests/helpers/tick-script.ts
    - tests/fixtures/probe-shape.json
    - tests/app/probe-shape-compare.test.ts
    - tests/app/session/traffic.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/probe-publisher.test.ts
    - CHANGELOG.md

key-decisions:
  - "The hook and the replay take the three records from one function, testFlyerRecords(content), and the three keys from one frozen constant, TEST_FLYER_KEYS (shuttle, viper, adder), both in src/app/session/traffic.ts (a file the plan lists), so neither can pick a different hull"
  - "The hook passes layout.station.position as spawnTestFlyers' sixth argument (the plan text showed five), as plan 14-16's summary requires; the replay step passes the same"
  - "The smoke does not assert that the session is untainted before the spawn: advanceTicks already taints it, so the hook's own taint-before-spawn order is a probe-publisher unit test (a refused spawn after a partial spawn keeps the taint)"

patterns-established:
  - "The browser spec replays the Node script twice (ending at the spawn step, ending after the ticks) so the goal-metric comparison has a measured start, not an assumed one"

coverage:
  - id: D1
    description: "The compiled flight table reaches every step: TrafficContent.flight equals flightTableFrom of the catalogue (nine rows, frozen); buildStepOptions passes npcFlight when given and omits the key otherwise (docked and undocked); the session driver hands ctx.core.npcTraffic.flight to the step and omits it without traffic; the Node replay passes the same table; tick parity between session and replay stays exact"
    requirement: WORLD-07
    verification:
      - kind: unit
        ref: "tests/app/session/traffic.test.ts#builds the flight table with flightTableFrom; tests/app/session/sim-driver.test.ts#hands the loaded NPC masses to the step; #carries the NPC flight table under npcFlight; tests/app/session/tick-parity.test.ts (unchanged, 21 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "spawnTestFlyers() in flight with a world, a layout and the three hulls spawns the Shuttle, Viper and Adder (flight-script AIs station, intercept, flee, 3,000 m from the player, each at its compiled maximum speed, the Shuttle's nose on the live station centre), taints the session before the world is touched and returns true; docked, launching, disposed, without a world, layout, traffic content or one of the hulls it returns false and taints nothing; a full world and a refusal after a partial spawn return false, keep the taint (and the earlier ship in the partial case); the probe publishes no entity id; the probe-shape fixture lists the member in both hook rows"
    requirement: WORLD-07
    verification:
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts#the spawnTestFlyers hook (plan 14-18, T-14-29) (9 cases); tests/app/probe-shape-compare.test.ts#pins the shooter and flyers hook members as functions"
        status: pass
  - id: D3
    description: "A replay step with spawnFlyers calls the same spawner with the same records, flight table, tick and station centre before its ticks (15 entities, last three shuttle, viper, adder; equal to an explicit spawn on the same state); one spawn step plus 300 ticks equals the spawn, then ticks 1 and 299; a script that cannot spawn (traffic off, docked) throws"
    requirement: WORLD-07
    verification:
      - kind: unit
        ref: "tests/app/session/tick-flyers.test.ts (4 cases)"
        status: pass
  - id: D4
    description: "In a traffic-on test session three flyers appear on the scanner (ship contacts before the spawn plus 3 one tick after it), 1,200 ticks later the scanner count equals the Node HUD model's count for the replayed world, the browser world hash equals the Node replay's at tick 1,801, the station flyer is closer to the station, the interceptor closer to the player and the fleer farther by scriptGoalMetric, draw calls are within 50 once the models of the present keys loaded, and no console error"
    requirement: WORLD-07
    verification:
      - kind: e2e
        ref: "tests/e2e/npc-flight.spec.ts#three scripted flyers are on the scanner, drawn within budget and replay the Node hash (remote Chromium, snapshot d8b4483, passed; passed again inside verify-full)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The full local suite, lint, typecheck, the three opt-in specs and the remote verify and verify-full gates pass on the final committed code"
    verification:
      - kind: command
        ref: "docker compose run --rm test (203 files, 4997 passed, 10 skipped, exit 0, coverage floors held); lint; typecheck; remote e2e npc-flight + combat + traffic (5 passed, exit 0, snapshot d8b4483); remote verify (27 passed, exit 0, snapshot d8b4483); remote verify-full (203 unit files, 134 + 2 e2e passed, exit 0, snapshot d8b4483)"
        status: pass
    human_judgment: false

duration: 60min
completed: 2026-11-17
---

# Phase 14 Plan 18: Flying NPCs in the browser Summary

**The live session and the Node replay now hand the same `flightTableFrom` table to every step, the `?test=1` hook `spawnTestFlyers()` puts a Shuttle flying to the station, a Viper intercepting and an Adder fleeing into the world (tainting first), and one opt-in Chromium smoke shows them on the scanner, within the draw-call budget and equal, hash for hash, to the Node replay 1,200 ticks later.**

## Performance

- **Duration:** about 60 minutes
- **Tasks:** 3 of 3 (Task 1 was the `tracer`; auto mode is on, so its `<verify>` was re-run before expanding and passed)
- **Commits:** 4 (three tasks plus one spec fix); 14 files, 893 added lines, about 8,400 tokens by chars/4 over the added `src` and `tests` lines
- **Files:** 2 created, 12 modified

## Accomplishments

- **Wiring (Task 1):** `TrafficContent.flight = flightTableFrom(catalogue)`; `StepOptionsInput.npcFlight` goes to `StepOptions.npcFlight` with the omit-when-absent spread; `sim-driver.ts` passes `ctx.core.npcTraffic.flight` beside the masses; `tests/helpers/tick-script.ts` passes `content.flight`. One builder, no second mapping.
- **Hook (Task 2):** `spawnTestFlyers(): boolean` on the hook interface (doc comment states the taint and the partial-spawn case), implemented in `probe-publisher.ts` like `spawnShooter`: the same guards plus the layout, the three records from `testFlyerRecords`, `markHookMutation()` before the world is touched, then `spawnTestFlyers(world, liveState, records, traffic.flight, liveState.tick, liveLayout.station.position)`. `probe.ts` sets `hook.tainted` on success; in the refused case the taint is already in `ctx.runtime.testTainted`, which `updateProbe` mirrors to `hook.tainted`. The probe-shape fixture lists the member in both hook rows. `TickStep.spawnFlyers` replays it.
- **Smoke (Task 3):** `tests/e2e/npc-flight.spec.ts` plus the `CHANGELOG.md` `### Added` entry.

## Task Commits

1. **Task 1 (tracer): the compiled flight table reaches every step** - `3b1d40e` (feat)
2. **Task 2: the spawnTestFlyers hook member, its replay step and the probe-shape row** - `36f5086` (feat)
3. **Task 3: the opt-in NPC flight smoke and the changelog entry** - `c67cc2e` (test)
4. **Fix: the smoke does not assert an untainted session after advanceTicks** - `d8b4483` (test)

Tracer feedback gate: auto mode on; the Task 1 `<verify>` (five session test files, typecheck) was re-run and passed before Task 2.

## Verification

All on the final code (`d8b4483`, the last code commit; later commits are planning documents only).

| Gate | Where | Result |
|------|-------|--------|
| `docker compose run --rm test` (full, coverage floors) | local | 203 files, 4997 passed, 10 skipped, exit 0 |
| `docker compose run --rm lint` | local | exit 0 (eslint and prettier clean) |
| `docker compose run --rm typecheck` | local | exit 0 (both projects) |
| `run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/npc-flight.spec.ts tests/e2e/combat.spec.ts tests/e2e/traffic.spec.ts"` | remote, snapshot d8b4483 | 5 passed, exit 0, 51 s |
| `run --rm verify` | remote, snapshot d8b4483 | 27 e2e passed, exit 0, 140 s |
| `run --rm verify-full` | remote, snapshot d8b4483 | 203 unit files passed, 134 + 2 e2e passed, exit 0, 563 s; no flake rerun needed |

The first remote run (snapshot c67cc2e) failed the new spec on a wrong assertion of mine, not on the code: the spec asserted `test.tainted` was false before the spawn, but `advanceTicks` already taints the session (documented on the hook). The assertion was removed (the hook's own taint order is a unit test) and the spec passed at d8b4483.

Acceptance greps: `rg -c npcFlight src/app/session/step-options.ts` = 4, `tests/helpers/tick-script.ts` = 1; `rg -c flightTableFrom src/app/session/traffic.ts` = 3; `rg -c spawnTestFlyers src/app/probe.ts` = 3; `rg -c '"spawnTestFlyers": "function"' tests/fixtures/probe-shape.json` = 2; `FLYER_SMOKE_TICKS = 1_200` present once; `CHANGELOG.md` has the `### Added` entry in the spec's commit.

Freeze check: `git diff 2fdabbb..HEAD` over `tests/acceptance`, `tests/oracles`, `src/sim/ai/pilots/flight-script.ts` and `src/sim/ai/test-spawn.ts` is empty; no commit of this plan touches a frozen file.

## Observed values (recorded, not promised)

Node replay of the smoke script (launch, 600 ticks, spawn at tick 601, then 1,200 ticks), by `scriptGoalMetric`:

- **Station flyer (Shuttle, 80 m/s):** 3,300.2 m from the station centre at the spawn, 2,591.7 m after 1,200 ticks (a gain of 709 m; phase `flying`, not done: the goal is 2,500 m).
- **Interceptor (Viper, 320 m/s):** 2,892.2 m from the player's hull at the spawn, 728.9 m after 1,200 ticks (its pilot `done`).
- **Fleer (Adder, 240 m/s):** 2,898.3 m at the spawn, 3,476.0 m after 1,200 ticks (phase `flying`; the goal is 25,600 m, far off).
- **World hash:** `09c03072` at the spawn step, `d11fee94` after the 1,200 ticks; the browser's `worldHash()` equals the second at tick 1,801 with 15 entities.
- The draw-call count is a budget check only: the loaded scene already uses about 17 calls and the instanced NPC layer adds at most one per ship kind, so the check is weak evidence on its own. The hash equality (browser equals Node, with the flyers steering through the real flight table) and the scanner count carry the proof. The run's call count is attached to the Playwright report as the `npc-flight-calls` annotation.

## Decisions Made

See key-decisions. Further choices:

- **Test file location:** the replay-step cases live in a new `tests/app/session/tick-flyers.test.ts` (not in the plan's file list) so `tick-parity.test.ts` stays unchanged, as the plan asks.
- **Metrics in Node, not in the page:** the goal-metric comparison runs on the two Node replays; the hash equality proves the browser flies the same.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The spawner takes a sixth argument**
- **Found during:** Task 2
- **Issue:** the plan text shows `spawnTestFlyers(world, liveState, records, flight, tick)`; plan 14-16 changed it to take `station: Vec3` last, and `records` as `{ station, intercept, flee }`.
- **Fix:** the hook and the replay step pass `layout.station.position` and the `FlyerRecords` object from `testFlyerRecords`. (A direction from the orchestrator and plan 14-16's summary, not a surprise.)
- **Files modified:** `src/app/session/probe-publisher.ts`, `tests/helpers/tick-script.ts`
- **Commit:** `36f5086`

**2. [Rule 1 - Bug] The smoke asserted an untainted session before the spawn**
- **Found during:** Task 3 (first remote run, snapshot c67cc2e)
- **Issue:** `advanceTicks` already taints the session, so `test.tainted` is true at the point I asserted it false.
- **Fix:** removed that assertion; the assertion after the spawn stays with a comment, and the hook's taint-before-spawn order is covered by `probe-publisher.test.ts`.
- **Files modified:** `tests/e2e/npc-flight.spec.ts`
- **Commit:** `d8b4483`

### Plan wording / additions

- **`traffic.ts` also holds `testFlyerRecords` and `TEST_FLYER_KEYS`** (the plan names the keys as "named constants" in the hook): placing them in the shared module lets the replay use the same picker. They are in the plan's file list.
- **Extra test file** `tests/app/session/tick-flyers.test.ts` and an added `probe-shape-compare.test.ts` case.
- **Gates beyond the plan:** the plan defers `verify` to 14-19 and `verify-full` to an owner decision; the orchestrator instructed running both here, and they passed (the 14-19 gate still reruns on its own final code).

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug), both inside this plan's own code. **Impact:** none on scope.

## Authentication Gates

None.

## Issues Encountered

None beyond deviation 2.

## Known Stubs

None.

## Threat Flags

None new. T-14-29 (test state made durable) is mitigated and tested: the hook exists only with `?test=1`, `markHookMutation()` taints before the world is touched and also when the spawner refuses (a full world; a refusal after a partial spawn, which keeps the earlier ship), and autosave refuses a tainted session. T-14-30 (entity ids in the probe) is mitigated: the hook returns a boolean, no probe field was added and the entity-id scope guard stays green. The prohibition "no hook member or option makes NPC flight reachable without `?test=1`" holds: `spawnTestFlyers` exists only on the `?test=1` hook, and a plain session keeps every NPC inert (the populator never attaches the pilot). T-14-SC: no package installed.

## Facts for plan 14-19

- **Divergence list:** this plan adds no divergence from Oolite; it adds wiring and test code only. The earlier list of 14-15 and 14-16's note (the extra spawner argument is a deviation from the plan text, not from Oolite) stand.
- **Evidence for the report:** the smoke proves the browser world is hash-identical to the Node replay with the real compiled flight table and three flight-script flyers (tick 1,801, 15 entities); the Node metrics above (Shuttle 3,300 to 2,592 m, Viper 2,892 to 729 m, Adder 2,898 to 3,476 m); remote verify and verify-full both green on d8b4483.
- **Remote evidence is current:** no `src/sim` or frozen file changed after plan 14-17's run, so the 20-seed acceptance run is not stale; 14-19 should rerun the freeze check (`git diff 2fdabbb..HEAD -- tests/acceptance tests/oracles src/sim/ai/pilots/flight-script.ts src/sim/ai/test-spawn.ts` is empty at the end of this plan).
- **Shared requirement ID:** `WORLD-07` is declared by this plan (completed) and by earlier plans as advanced; the `ready-ids` gate decides whether it reads Complete if plan 14-19 also declares it.
- **Gate counts for the final report:** local suite 203 files, 4997 passed, 10 skipped; verify-full 134 + 2 e2e.

## Self-Check: PASSED

- Created files exist: `tests/e2e/npc-flight.spec.ts`, `tests/app/session/tick-flyers.test.ts`, `14-18-SUMMARY.md`.
- Commits `3b1d40e`, `36f5086`, `c67cc2e` and `d8b4483` are ancestors of HEAD; `git show --first-parent --diff-filter=D --name-only` on each prints no deleted file.
- `commits: 4` is measured with `git rev-list --count 2fdabbb..HEAD` before this SUMMARY commit.
