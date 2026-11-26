---
phase: 22-initial-population
plan: 13
subsystem: session-traffic
tags: [population, populate-closure, node-twin, re-pin, cadence, determinism]

requires:
  - phase: 22-initial-population
    provides: "populateSystemWorld (22-10), buildNeighbourhood (22-04), systemFactsFrom (22-06), the census golden (22-12)"
provides:
  - "createSystemPopulate(content, layout, system, galaxy): the Phase 22 populate closure for the session and the Node replay"
  - "populationRecordsFrom(catalogue) and TrafficContent.populationRecords"
  - "the Node replay (tests/helpers/tick-script.ts) on the system populator"
  - "Node twins re-pinned onto the 28-ship Lave world, each moved value with its measured cause"
  - "tests/sim/world/population/cadence.test.ts: 30/60/144 Hz hash equality of populated worlds"
affects: [22-14, 22-15]

actuals:
  tokens: 7700
  tasks: 3
  commits: 4
plan_head_before: b371fd9ead243b61be0fa986186174fd000ab8a0
plan_head_after: ce88732643df0be892f55c9d1c573189056c4f7f

tech-stack:
  added: []
  patterns:
    - "one populate closure shared by the live session and the Node replay (traffic.ts), reading every getter at call time"
    - "re-pin comment format: plan id, owner-sanctioned under Phase 21 D-04, old value, new value, measured cause"

key-files:
  created:
    - tests/sim/world/population/cadence.test.ts
  modified:
    - src/app/session/traffic.ts
    - tests/helpers/tick-script.ts
    - tests/app/session/traffic.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/app/session/tick-flyers.test.ts
    - tests/app/session/death-twin.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/probe-publisher.test.ts

key-decisions:
  - "TrafficContent.populationRecords is a required member (not optional): a content without it must not populate silently; two test literals gain populationRecords: []"
  - "The CBT-08 twin's spawn delay is re-chosen by the plan 19-13 selection rule (smallest delay with a kill, a debris piece and exactly one damaged item) rather than keeping delay 1, which now damages nothing"
  - "render-driver.test.ts, hyperspace-controller.test.ts, world-lifecycle.test.ts, save-v3.test.ts, collision-traffic.scenario.test.ts and traffic-variants.test.ts keep createInertPopulate: own lifecycle fixtures with no browser hash twin (class b)"

patterns-established:
  - "A browser twin that moves with a world change is re-pinned on the Node side first, with the browser literals left for the plan that switches the browser"

requirements-completed: [WORLD-08]

coverage:
  - id: D1
    description: "createSystemPopulate and populationRecordsFrom exist beside the unchanged createInertPopulate; traffic off, a missing getter or a malformed galaxy spawns nothing, draws nothing, burns no id and never throws"
    requirement: WORLD-08
    verification:
      - kind: unit
        ref: "tests/app/session/traffic.test.ts#createSystemPopulate (plan 22-13, WORLD-08)"
        status: pass
      - kind: unit
        ref: "tests/guards/npc-missiles-tripwire.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Node replay builds the populated Lave world: the traffic-on launch world holds the census golden's Lave epoch-1 count (28 ships)"
    requirement: WORLD-08
    verification:
      - kind: unit
        ref: "tests/app/session/traffic.test.ts#the Node replay's Lave launch world (plan 22-13, WORLD-08)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Node twins (tick-parity, tick-flyers, death-twin) are re-pinned once onto the populated world with measured causes; the owner-reserved pins did not move"
    requirement: WORLD-08
    verification:
      - kind: unit
        ref: "tests/app/session (23 files, 739 tests)"
        status: pass
      - kind: other
        ref: "git diff --name-only b371fd9e..HEAD -- tests/golden/world/inert-lave-epochs-1-20.json tests/golden/world/inert-lave-epoch1.json tests/acceptance (empty)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Populated worlds hash equal at 30, 60 and 144 Hz over 600 ticks for Lave and the census's largest galaxy-0 anarchy, with non-vacuity cases"
    requirement: WORLD-08
    verification:
      - kind: unit
        ref: "tests/sim/world/population/cadence.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The browser suite stays green with the session unchanged (remote verify, test:e2e:fast)"
    verification:
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm verify (exit 0, 28 Playwright tests, snapshot ce887326)"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 13: createSystemPopulate and the Node twin Summary

**The system-populator closure `createSystemPopulate` (call-time getters, total, nothing drawn with traffic off) plus the `populationRecordsFrom` bridge, the Node tick replay and its twins moved onto the 28-ship Lave world with every moved literal re-pinned once with its measured cause, and 30/60/144 Hz hash equality of populated worlds.**

## Performance

- **Duration:** about 70 min (the two remote runs took 5 and 8 min)
- **Started:** 2026-11-26T18:20Z (approx.)
- **Completed:** 2026-11-26T18:58Z (approx.)
- **Tasks:** 3 (task 1 a tracer, then two auto tasks)
- **Files modified:** 9 (1 new)

## Accomplishments

- `createSystemPopulate(content, layout, system, galaxy)` in `src/app/session/traffic.ts`: with traffic on it reads the four getters at call time, builds `buildNeighbourhood(galaxy, system.systemIndex)` and `systemFactsFrom`, and calls `populateSystemWorld` with `content.populationRecords`. With traffic off, or content, layout or system missing, it returns before any draw, spawn or id. A missing or malformed galaxy list gives empty neighbour lists, never a throw. `createInertPopulate`, `INERT_RECORD_KEYS` and `TrafficContent.records` are untouched.
- `populationRecordsFrom(catalogue)` maps each compiled record to `PopulationRecord` by named fields (including `hyperspaceMotor`), never reading `missiles` or `maxMissiles`; its output deep-equals the tests' `committedPopulationRecords()`. `trafficContent` carries it as `populationRecords`.
- `runTickScript` populates through `createSystemPopulate` over the Lave record and the galaxy-0 list (`systems/g0.json`). Tracer result: the traffic-on launch world holds 28 ships, equal to the census golden's Lave epoch-1 count (digest `g0-s7`, first token); the old literal 12 is gone from the replay path.
- Node twins re-pinned (below); `cadence.test.ts` proves populated worlds are cadence independent.

## Task Commits

1. **Task 1 RED** - `4db7e205` (test): failing tests for `createSystemPopulate`, `populationRecordsFrom` and the populated Lave replay (target assertions failed: missing symbols, and "expected 12 to be 28" on the replay)
2. **Task 1 GREEN** - `ee895087` (feat): the closure, the bridge, the replay switch, `populationRecords: []` on two test literals
3. **Task 2** - `7c66610f` (test): the re-pins
4. **Task 3** - `ce887326` (test): the cadence test

**Plan metadata:** the commit of this SUMMARY.

## Re-pins (owner-sanctioned, Phase 21 D-04 standing approval)

Condition (1), the cause measured and intended, is met per value below. Condition (2), Node equal to the browser, is checked by plan 22-14, which switches the browser session: the browser twin literals (`tests/e2e/combat.spec.ts` `TWIN_*`, others) were NOT touched here and are the values 22-14 must reproduce. The owner-reserved pins (`inert-lave-epochs-1-20.json`, `inert-lave-epoch1.json`, `tests/acceptance/**`) did not move (`git diff --name-only` over them is empty).

Common cause: the replay and the session mirror now build the Lave world with the system populator, 28 ships at epoch 1 (census golden) instead of the 12-ship inert table, and the hook-spawned shooter takes id 129 instead of 113. An entity's streams are forked from (world seed, id, purpose), so its combat and damage draws move.

| File | Value | Old | New | Measured cause |
| ---- | ----- | --- | --- | -------------- |
| `tests/app/session/tick-parity.test.ts` | replay ship count (`LAVE_POPULATED`), next id | 12, 113 | 28, 129 | census epoch 1 for Lave; ids 101 to 128 |
| same | `ENERGY_AT_KILL` | 83.7999999999947 | 83.78333333332803 | per-tick trace against the inert-populate run: bank and shield identical for 585 ticks after the spawn; the shot that empties the shield lands at spawn + 586 here, +587 there. Shooter id 113 -> 129 moves its fire-gate stream. `KILL_OFFSET` 672, `SHIELD_AFTER_SHOOTING` and `ENERGY_AFTER_SHOOTING` (spawn + 360) do not move |
| same | `DEBRIS_AT_KILL` | 2 pods, 0 plates, 2 wrecks | 4 pods, 1 plate, 0 wrecks | the debris is drawn from the shooter's combat stream, which moved with its id |
| same | `ENTITIES_AT_KILL` | 16 | 33 | 28 populated ships + 4 pods + 1 plate (was 12 + 2 + 2) |
| same | `HASH_60_AFTER_KILL` | "14a8a453" | "e0a3e3dc" | 16 more ships in the world text, the moved shooter id and debris |
| same (CBT-08 twin) | `DAMAGE_SPAWN_DELAY` | 1 | 2 | scan over delays 0 to 240 on the populated world: delays 0 and 1 damage nothing; delay 2 is the smallest with a kill, a debris piece and exactly one damaged item (the plan 19-13 selection rule) |
| same | `DAMAGE_FIRST_OFFSET` | 613 | 612 | the delay-2 row: `kill=672 damaged=EQ_GAL_DRIVE debris=0/0/1 entities=29 hash60=7bb254ef first=612:EQ_GAL_DRIVE` |
| same | `DAMAGE_ENTITIES_AT_KILL` | 13 | 29 | 28 populated ships + the one wreck |
| same | `DAMAGE_HASH_60_AFTER_KILL` | "5028fc8f" | "7bb254ef" | as the row above; damaged item (EQ_GAL_DRIVE), debris (0/0/1) and kill offset (672) are unchanged |
| `tests/app/session/tick-flyers.test.ts` | ships before the flyers (`POPULATED`) | 12 (3 flyers: 15 total) | 28 (31 total) | census epoch 1 for Lave |
| `tests/app/session/death-twin.test.ts` | restored world's next id | 113 | 117 | the Continue rebuilds the epoch-0 world through the system populator: 16 ships (the census covers epochs 1 to 20 only). `DEATH_TICK_OFFSET` and `DEATH_CAUSE` do not move |

The session mirrors in `tick-parity.test.ts` and `death-twin.test.ts` now use `createSystemPopulate(..., () => ctx.core.system, () => galaxy)`, the wiring 22-14 puts into `start-session.ts`. The session-versus-replay equality rows (hash and per-tick trace, traffic on, plain and combat) pass without a literal change.

Browser twin literals that 22-14 must match (not edited): `TWIN_HASH_60_AFTER_KILL` (combat.spec.ts:105) -> "e0a3e3dc"; the debris twin's `{ pods: 4, plates: 1, wrecks: 0 }` and 33 entities; `TWIN_DAMAGE_SPAWN_DELAY` 1 -> 2, `TWIN_DAMAGE_FIRST_OFFSET` 613 -> 612, `TWIN_DAMAGE_ENTITIES_AT_KILL` 13 -> 29, `TWIN_DAMAGE_HASH_60_AFTER_KILL` -> "7bb254ef"; `ENERGY_AT_KILL` if the browser spec pins it; the death twin's restored-world ids; and every browser spec that compares the browser world with `runTickScript(..., { traffic: true })` (`traffic.spec.ts`, `npc-flight.spec.ts`, `tick-hook.spec.ts`).

## Gates

- Targeted: `traffic.test.ts`, `npc-missiles-tripwire.test.ts`, `inert-isolation.test.ts` (87 tests) pass; `tests/app/session` 23 files, 739 tests pass; `cadence.test.ts` 4 tests pass.
- `docker compose run --rm lint` and `typecheck`: clean (local).
- Remote full Vitest suite (`run --rm test`, snapshot ce887326): exit 0, 322 files passed, 1 skipped, 10,453 tests passed, 16 skipped, 305 s test duration (308 s wall).
- Remote `run --rm verify` (snapshot ce887326): exit 0, 456 s elapsed, `test:e2e:fast` 28 Playwright tests passed. The session is unchanged until 22-14, so the fast browser subset stays green. The full Chromium suite was NOT run: the specs that compare the browser with the replay (`traffic.spec.ts`, `npc-flight.spec.ts`, `tick-hook.spec.ts` with traffic on) and the twin-literal specs are expected to diverge between this plan and 22-14, by the plan's design (22-14 switches the browser and the eight traffic-on specs).
- No 20-seed acceptance run: no change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`, and no runtime NPC traffic path changed (`createSystemPopulate` is not wired into `start-session.ts` yet).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `populationRecords` made the typecheck fail on five `TrafficContent` literals**
- **Found during:** Task 1
- **Issue:** `TrafficContent.populationRecords` is a required member, so `tests/app/session/sim-driver.test.ts` (four literals) and `probe-publisher.test.ts` (one) no longer typechecked.
- **Fix:** added `populationRecords: []` to each hand-built content (these tests never populate).
- **Files modified:** `tests/app/session/sim-driver.test.ts`, `tests/app/session/probe-publisher.test.ts` (outside the plan's file list)
- **Verification:** typecheck clean, both files pass.
- **Committed in:** `ee895087`

**2. [Plan guidance - re-pin scope] the CBT-08 twin's spawn delay changed 1 -> 2**
- **Found during:** Task 2
- **Issue:** at delay 1 the populated world damages no item, so the twin's `damagedAtKill` assertion (and its purpose) failed; this is more than a literal re-pin.
- **Fix:** re-ran the plan 19-13 scan over delays 0 to 240 on the populated world (a temporary, uncommitted test in `tick-parity.test.ts`, removed before the commit) and applied the plan's own selection rule, which chose delay 2 with the same damaged item, debris and kill offset. Recorded above; the browser twin's delay constant must change to 2 in 22-14.
- **Files modified:** `tests/app/session/tick-parity.test.ts`
- **Committed in:** `7c66610f`

**3. [Plan guidance - class b] `render-driver.test.ts` left unchanged**
- The plan lists it among the candidate files, but it builds its own inert worlds with `populateInertWorld` as a fixture (no `runTickScript`, no browser hash twin); it stays on the inert fixture, as the plan's class (b) rule says, and passes.

---

**Total deviations:** 1 auto-fixed (Rule 3), 2 recorded scope calls.
**Impact on plan:** none on scope: no sim, content or golden file changed.

## Issues Encountered

- `git`-bearing compound shell commands are refused in this worktree sandbox; the plan-head ledger file was written with a plain `echo` to the worktree git dir instead of a compound command.

## Known Stubs

None. `createSystemPopulate` is built and used by the Node replay and the two session mirrors; wiring it into `start-session.ts` is plan 22-14, by the ROADMAP scope note.

## Threat Flags

None. No new endpoint, auth path, file access or trust-boundary schema; the closure runs only inside the existing synchronous install block and adds no throw path (T-22-20: total by construction, `traffic.test.ts` covers traffic off, each missing getter and a malformed galaxy).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 22-14 can wire `createSystemPopulate(() => ctx.core.npcTraffic, () => ctx.core.layout, () => ctx.core.system, () => galaxy)` into `start-session.ts` and match the browser twins to the Node values listed above.
- Expect the replay-versus-browser specs to be red on the full Chromium suite until 22-14 lands.

## Self-Check: PASSED

- Files exist: `src/app/session/traffic.ts` (`createSystemPopulate`, `populationRecordsFrom`), `tests/sim/world/population/cadence.test.ts`.
- Commits `4db7e205`, `ee895087`, `7c66610f`, `ce887326` are ancestors of HEAD.
- Acceptance criteria: `createSystemPopulate` exported once; `createInertPopulate` kept; `tick-script.ts` has one `createSystemPopulate(` and no `createInertPopulate(`; no non-comment `.missiles`/`.maxMissiles` in `traffic.ts`; `22-13` present in `tick-parity.test.ts`; the golden and acceptance paths are unchanged; `1/144` present in `cadence.test.ts`.

---
*Phase: 22-initial-population*
*Completed: 2026-11-26*
