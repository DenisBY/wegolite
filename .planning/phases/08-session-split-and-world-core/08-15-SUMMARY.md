---
phase: 08-session-split-and-world-core
plan: 15
subsystem: app
tags: [world-lifecycle, epoch, sim-driver, stepSim, event-router, hyperspace-arrival, load, anchored-save, d-02, d-03, d-05, d-14, found-11]
status: complete

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-11 stepSim and the world step; 08-12 the final session module layout; 08-13 the snapshot codec; 08-14 ctx.runtime.testFlags and the shared drain of the sim driver
provides:
  - src/app/session/world-lifecycle.ts, Populate, populateNothing, WorldLifecycle (begin, resume, end, resetForRestore) and createWorldLifecycle({ traffic, populate })
  - the one integration point: sim-driver stepOnce calls stepSim over ctx.core.worldLifecycle?.world
  - the worldLifecycle event subscriber (launched begins, docked ends) built inside the router, after stationFlow
  - the arrival and Load bump points (begin inside the arrival install block before the autosave; resetForRestore(0) then resume in loadFromSave)
  - a Key Decisions row in PROJECT.md for the lifecycle, the bump points and the Oolite comparison
affects: [08-16]

plan_head_before: 1c5578cf22837478dd9e5bbb21010801896698d7
plan_head_after: 925b161cfd8dba5618c7f30f7f847ca2bbea040a
actuals:
  tokens: 14550
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "the lifecycle builds a world first and commits epoch and world after, so a throwing populator leaves both unchanged"
    - "the router builds its own worldLifecycle subscriber from ctx (an optional override exists only for a recording test), so the facade (game-session.ts) is untouched"
    - "a durable source-scan guard keeps the Playwright-importable session modules free of DOM, Three and value imports outside src/sim"

key-files:
  created:
    - src/app/session/world-lifecycle.ts
    - tests/app/session/world-lifecycle.test.ts
  modified:
    - src/app/session/context.ts
    - src/app/session/sim-driver.ts
    - src/app/session/event-router.ts
    - src/app/session/start-session.ts
    - src/app/session/hyperspace-controller.ts
    - src/app/session/save-controller.ts
    - tests/app/session-order.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "worldLifecycle is an optional member of EventRouterSubscribers, not a fifth required one: the router builds the real subscriber from ctx, and the facade and the plan 08-10 and 08-12 tests keep their four-subscriber objects unchanged"
  - "begin and resume build the world before committing epoch and world, which is a refinement of the plan's order (epoch += 1, then create): a throwing future populator leaves the lifecycle untouched"
  - "the start-up and dispose wiring has no Node harness for startSession (it builds the renderer, HUD and input), so the creation, the in-flight resume and the traffic argument are pinned as ordered source facts, and dispose is tested through createSessionLifecycle with a lifecycle double and the real lifecycle"

requirements-completed: [FOUND-11]

coverage:
  - id: D1
    description: "stepOnce is the single step call site and runs stepSim over the live world; a launch creates a world that is first stepped on the next tick, docking drops it, and with no NPC the world hash equals the flight hash at every step of a launch and 300 ticks of flight"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#launch creates a world that steps through stepSim; docking drops it (tracer)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bump points: launched begins (epoch 1, worldSeedFor(marketSeed, 1), ids from 101), docked ends and keeps the epoch, an arrival begins inside the install block before the autosave, and a failed arrival changes neither epoch nor world"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#arrival; tests/app/session-order.test.ts#the world lifecycle subscriber (plan 08-15)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Warm in-session Load equals cold Continue: resetForRestore(0) then resume for an in-flight blob, resetForRestore(0) and no world for a docked blob, identical epoch and worldSeed on the next launch or arrival, a failed parse touches neither"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#load"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-05 parity and the lifecycle rules: epochs [1, 1, 2, 3, 3] and identical seeds and starting counters with traffic on and off, populate called four times with the mode's flag, empty worlds with the default populator, per-world ids restarting at 101, saturation at epoch 0xffffffff and the 0..0xfffffffe restore domain"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#lifecycle rules (D-02, D-03, D-05)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The world never enters the save: SaveInputs and the encoded save are identical with and without a live world (an NPC spawned and 50 ticks stepped), their top-level keys are in the exact v2 allow-lists and none of the six world key substrings occurs; src/persistence, probe.ts and the probe-shape fixture are unchanged"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#anchored save: the world never enters the save"
        status: pass
      - kind: other
        ref: "git diff --quiet 1c5578c -- src/app/probe.ts tests/fixtures/probe-shape.json src/persistence exits 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "The Node-importable guard for world-lifecycle.ts and step-options.ts, the routing table (12 kinds with one subscriber, launched and docked with [stationFlow, worldLifecycle]) and the reserved kinds passing through the router without a side effect"
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#Node-importable session modules; tests/app/session-order.test.ts#reserved kinds pass through"
        status: pass
    human_judgment: false
  - id: D7
    description: "The NPC-free world costs at most 1.2 times stepFlight plus 2 microseconds per tick, and the whole release gate and the Firefox journey stay green"
    verification:
      - kind: other
        ref: "docker compose run --rm -v /tmp/wegolite-perf:/scratch test npx tsx /scratch/step-cost.ts: STEP-COST PASS, attempt 1"
        status: pass
      - kind: other
        ref: "docker compose run --rm verify-full on 925b161: exit 0, 28m57.8s; docker compose run --rm e2e-cross on 925b161: exit 0, 2 passed"
        status: pass
    human_judgment: false
  - id: D8
    description: "FOUND-14's traffic half is in place (the flag is read once by 08-14 and now reaches populate); the plan 08-16 hook half is still open, so the requirement stays blocked"
    requirement: FOUND-14
    verification: []
    human_judgment: true
    rationale: "FOUND-14 is shared with plan 08-16 (requirements.ready-ids reports it blocked); the browser-visible half arrives with the probe commit of 08-16"

duration: 48min
completed: 2026-11-13
---

# Phase 8 Plan 15: World lifecycle and the sim-driver integration Summary

**The NPC-free world is plugged into the game at one point: stepOnce runs stepSim over a world that the launched event and a hyperspace arrival create from worldSeedFor(marketSeed, epoch) (bump then derive), that docking and dispose drop, and that a cold Continue or a warm Load re-anchors at epoch 0 so both give the same epoch and seed; nothing the player sees or saves changes, and verify-full is green.**

## Performance

- **Duration:** about 48 min (about 15:28Z to 16:16Z), of which about 41 min were gate runs (verify 5m39s, verify-full 28m58s, Firefox 1m54s, benchmark and targeted runs)
- **Tasks:** 3 (Task 2 as a RED commit and a GREEN commit)
- **Files:** 10 changed (2 created, 8 modified), plus this SUMMARY and the STATE and ROADMAP updates

## Accomplishments

- `src/app/session/world-lifecycle.ts`: pure (imports only `src/sim`), `createWorldLifecycle({ traffic, populate })` with epoch 0 at start (D-03). `begin` refuses without throwing for a non-finite seed or an epoch at 0xffffffff, then bumps and derives; `resume` recreates from the current epoch without a bump; `end` keeps the epoch; `resetForRestore(epoch = 0)` accepts 0..0xfffffffe and returns a flag. The header records the one-tick latency, the prepare/commit rule for a future fallible populator and the D-05 forward note.
- `sim-driver.ts`: the single `stepFlight` call became `stepSim(liveState, ctx.core.worldLifecycle?.world, ...)`; nothing else in `src/app` steps the simulation (`stepFlight(` count under `src/app` is 0). The world is read live on every step.
- `event-router.ts`: `worldLifecycle` follows `stationFlow` in `EVENT_SUBSCRIBER_ORDER`; `launched` and `docked` map to `["stationFlow", "worldLifecycle"]`, twelve kinds to one subscriber; the subscriber tests the kind with `if` (still one `case "docked":` label in `src/app`). `game-session.ts` is untouched.
- `start-session.ts`: creates the lifecycle with `ctx.runtime.testFlags.traffic` right after the one `parseTestFlags` read, resumes an in-flight restore after the market seed is resolved, and ends the world in `dispose()` (idempotent through the existing early return).
- `hyperspace-controller.ts`: `begin(nextSeed)` sits inside the install block after `applyWitchpointArrival` and before `autosave()`; the catch path does not touch the lifecycle. `save-controller.ts`: `loadFromSave` calls `resetForRestore(0)` and, for a non-docked save, `resume(nextSeed)` in its synchronous install block, never on a failed read or parse.
- PROJECT.md Key Decisions row "World lifecycle and epoch bump points" with the Oolite citations `Universe.m:1162-1181`, `1088-1160`, `1090-1124` and `9374-9462` (checked against the checkout) and the D-05 forward note.

## Task Commits

1. **Task 1 (tracer): launch creates a world that steps through stepSim, docking drops it** - `1f77a5d` (feat)
2. **Task 2 (TDD): lifecycle rules, D-05 parity and session wiring** - RED `2c5d780` (test; 3 failures: two dispose cases and the start-up wiring), GREEN `84178b9` (feat)
3. **Task 3: arrival and Load bump points, anchored save, decision row** - `925b161` (feat)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Files Created/Modified

- `src/app/session/world-lifecycle.ts` - the lifecycle (new)
- `src/app/session/context.ts` - `SessionCore.worldLifecycle`
- `src/app/session/sim-driver.ts` - `stepSim` at the single step site
- `src/app/session/event-router.ts` - `worldLifecycle` subscriber, order and routing table
- `src/app/session/start-session.ts` - creation, in-flight resume, end on dispose
- `src/app/session/hyperspace-controller.ts`, `src/app/session/save-controller.ts` - the arrival and Load bump points
- `tests/app/session/world-lifecycle.test.ts` - tracer, lifecycle rules, session wiring, arrival, load, anchored save, Node-importable guard (new, 27 tests)
- `tests/app/session-order.test.ts` - order and table updated, lifecycle subscriber cases, "reserved kinds pass through" (30 -> 38 tests)
- `.planning/PROJECT.md` - one Key Decisions row

## Decisions Made

- `worldLifecycle` is an optional member of `EventRouterSubscribers`; the router builds the real subscriber from `ctx`. The plan says to wire it inside `event-router.ts` without touching the facade; a required fifth member would have broken the facade and every 08-10 and 08-12 test object, so the optional override is only for a recording test.
- `begin` and `resume` build the world before committing `epoch` and `world` (the plan writes `epoch += 1` first). The observable behaviour is the same; a throwing populator now leaves the lifecycle unchanged, which fits rule (ii) of the header.
- `startSession` has no Node harness, so its three lifecycle points (creation with the traffic argument before the restore branch, the in-flight resume after the seed, a single `createWorldLifecycle(` call) are pinned as ordered source facts; the browser save-load specs in verify-full exercise the in-flight Continue end to end (no probe field shows the world yet, plan 08-16 adds one).

## Deviations from Plan

### Auto-fixed Issues

None. Process notes:

1. **[Process] `verify` ran once, not once per task.** Tasks 1 and 2 each list `docker compose run --rm verify`; it ran once after Task 2's GREEN commit (`84178b9`): exit 0, 135 unit files / 2,387 tests (2 skipped), 26 Chromium specs, 5m39s. Task 3's `verify-full` is a superset on the final tree. Targeted vitest, typecheck and lint ran after every task.
2. **[Process] Task 2 was committed as RED then GREEN.** Most Task 2 behaviour rows already held after Task 1 (the lifecycle was complete); the RED run failed three cases (both dispose cases and the start-up wiring), and the GREEN commit is the `start-session.ts` wiring.
3. **[Process] Mutation check.** With the arrival `begin` and the Load `resetForRestore(0)` removed, three of the arrival and load tests fail (arrival success, in-flight Load, docked Load); the source was restored before the commit.

**Total deviations:** 0 auto-fixed, 3 process notes. **Impact:** none on scope; the file set is the plan's ten (`src/sim/world/step.ts` was not touched: the step-cost check passed).

## Step cost

Scratch benchmark `/tmp/wegolite-perf/step-cost.ts` (never in the repository), run as `docker compose run --rm -v /tmp/wegolite-perf:/scratch test npx tsx /scratch/step-cost.ts`. Container Node version: v24.22.2. 2,000-tick warm-up and 5 timed runs of 12,000 ticks per variant, idle intent.

| Attempt | (a) stepFlight | (b) stepSim, empty session world | (c) stepSim, 8 pilots (informational) | (b)/(a) | Bound 1.2 x (a) + 2 | Result |
|---------|----------------|-----------------------------------|----------------------------------------|---------|---------------------|--------|
| 1 | 0.623 us/tick | 1.276 us/tick | 26.416 us/tick | 2.049 | 2.748 us | PASS |

Only attempt 1 was needed (best of three, first attempt passed). The ratio is above 1.2 only because the baseline is 0.6 us; the absolute cost of the empty world is 0.65 us per tick, under one thousandth of the 8,333 us tick budget, and the plan's threshold (1.2 x plus 2 us) holds with 1.47 us to spare. Variant (c), 26.4 us per tick for eight pilots, has no Phase 8 threshold.

Script text (evidence only, the full file as run):

```ts
// Scratch benchmark for plan 08-15 Task 3 step 5 (never part of the repository).
// Measures median microseconds per tick of: (a) stepFlight alone, (b) stepSim with
// the empty session world, (c) stepSim with the empty world plus eight test pilots.
import { createWorldLifecycle } from "/app/src/app/session/world-lifecycle.ts";
import { createTestPilotAi } from "/app/src/sim/ai/pilots/test-pilot.ts";
import { ZERO_INTENT } from "/app/src/sim/flight/controller.ts";
import { initFlightState } from "/app/src/sim/flight/state.ts";
import type { FlightState } from "/app/src/sim/flight/state.ts";
import { stepFlight } from "/app/src/sim/flight/step.ts";
import { identity, vec } from "/app/src/sim/math.ts";
import { stepSim } from "/app/src/sim/sim.ts";
import { DT } from "/app/src/sim/time.ts";
import { spawnEntity } from "/app/src/sim/world/world.ts";
import type { World } from "/app/src/sim/world/world.ts";
import { laveFixture } from "/app/tests/helpers/lave.ts";

const { layout, config } = laveFixture();
const WARMUP = 2_000;
const RUNS = 5;
const TICKS = 12_000;
const ATTEMPTS = 3;
const RATIO = 1.2;
const ALLOWANCE_US = 2;

function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  return state;
}

function sessionWorld(): World {
  const lifecycle = createWorldLifecycle({ traffic: false });
  lifecycle.begin(0x12345678);
  const world = lifecycle.world;
  if (world === undefined) throw new Error("no world");
  return world;
}

function withPilots(player: FlightState): World {
  const world = sessionWorld();
  for (let i = 0; i < 8; i += 1) {
    const entity = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "test-pilot",
        scanClass: "CLASS_NEUTRAL",
        position: vec(
          player.position.x + 400 * (i + 1),
          player.position.y + 60 * i,
          player.position.z - 200 * i,
        ),
        orientation: identity(),
        radius: 40,
        speed: 0,
        ai: createTestPilotAi(player.tick, {
          scanRange: 1e9,
          holdRange: 1,
          cruiseSpeed: 150,
        }),
      },
      player.tick,
    );
    if (entity === undefined) throw new Error("pilot spawn refused");
  }
  return world;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function measure(stepOnce: () => void): number {
  for (let i = 0; i < WARMUP; i += 1) stepOnce();
  const perRun: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const start = performance.now();
    for (let i = 0; i < TICKS; i += 1) stepOnce();
    perRun.push(((performance.now() - start) * 1000) / TICKS);
  }
  return median(perRun);
}

function variantA(): number {
  const player = flyingPlayer();
  return measure(() => {
    stepFlight(player, layout, config, ZERO_INTENT, [], DT);
  });
}

function variantB(): number {
  const player = flyingPlayer();
  const world = sessionWorld();
  return measure(() => {
    stepSim(player, world, layout, config, ZERO_INTENT, [], DT);
  });
}

function variantC(): number {
  const player = flyingPlayer();
  const world = withPilots(player);
  return measure(() => {
    stepSim(player, world, layout, config, ZERO_INTENT, [], DT);
  });
}

console.log(`node ${process.version}`);
let passed = false;
for (let attempt = 1; attempt <= ATTEMPTS && !passed; attempt += 1) {
  const a = variantA();
  const b = variantB();
  const c = variantC();
  const bound = RATIO * a + ALLOWANCE_US;
  const ok = b <= bound;
  console.log(
    `attempt ${attempt}: (a) stepFlight median ${a.toFixed(3)} us/tick; ` +
      `(b) stepSim empty world median ${b.toFixed(3)} us/tick; ` +
      `(c) stepSim 8 pilots median ${c.toFixed(3)} us/tick; ` +
      `ratio (b)/(a) ${(b / a).toFixed(3)}; bound ${bound.toFixed(3)} us; ${ok ? "PASS" : "over"}`,
  );
  passed = ok;
}
if (!passed) {
  console.log("STEP-COST FAIL");
  process.exit(1);
}
console.log("STEP-COST PASS");
```

### verify-full wall time

| Run | Commit | Result | Wall time | Files / tests | Chromium specs |
|-----|--------|--------|-----------|----------------|----------------|
| 08-01 split baseline (`5b189e4`) | 5b189e4 | red on two stale specs | 25m56s | 105 / 1,424 | 116 |
| 08-12 step-9 gate (second run) | 391e788 | green | 29m34s | 132 / 2,300 | 122 |
| this plan (first run) | `925b161` | green, exit 0 | **28m58s** | 135 / 2,395 (2 skipped) | 122 plus 2 seams |

The wall time is 2 percent below the step-9 gate (the 10 percent investigation bar is 32m31s) and 11.7 percent above the 08-01 baseline, which had 6 fewer Chromium specs and 1,000 fewer unit tests. No flaky test fired and no rerun was needed. Playwright reported 24.6 min for the 122 Chromium specs and 1.3 min for the 2 seams specs.

## Firefox (non-blocking)

- **Command:** `docker compose run --rm e2e-cross` on the main tree at the committed HEAD
- **Commit:** `925b161cfd8dba5618c7f30f7f847ca2bbea040a`; **exit status:** 0; **real:** 1m53.8s
- **Result:** 2 passed, 0 failed: `core-loop.spec.ts:265` "new game to launch to trade to hyperspace to dock to save and reload" (1.6 min) and `engine.spec.ts:68` "the engine creates a WebGL2 context and renders advancing frames" (9.7 s). No failing spec.
- **Comparison with the plan 08-12 step-9 run (`391e788`):** the same two specs, both passed, 1m55.7s then and 1m53.8s now: no cross-engine regression from the integration.

## Known Stubs

None. `populateNothing` is the intended Phase 8 populator (Phase 12 supplies the inert populator, Phase 22 full traffic).

## Threat Flags

None. No new endpoint, auth path or file access; T-08-27 (begin and resume ignore a non-finite seed and never throw inside a step), T-08-28 (begin before autosave, tested call order), T-08-33 (the anchored-save test and the unchanged `src/persistence`), T-08-39 (the benchmark and verify-full wall time), T-08-45 (warm Load equals cold Continue, `epoch < 0xffffffff` guard) and T-08-57 (the restore domain) are mitigated and tested.

## Issues for the owner

- The plan's end-of-phase human check (play a launch, a jump, a dock, a Load) is unchanged from 08-12 and is not needed for this plan: the world is invisible to the player and is covered by the tracer, the arrival and load cases and the full browser gate.
- No probe field exposes the world until plan 08-16, so no browser spec can assert the world directly yet; FOUND-14 stays blocked on 08-16.
- Phase 11 hand-off recorded in the Key Decisions row: pass `save.epoch` into `resetForRestore(save.epoch)` at both boot Continue and warm Load, and surface the `false` return for a saturated or corrupt saved epoch.

## Next Phase Readiness

Plan 08-16 (the one deliberate probe commit) can import `world-lifecycle.ts` and `step-options.ts` from the Playwright Node runner (the durable guard keeps them importable), expose `advanceTicks` and a world hash on the hook, and must mirror the one-tick world latency in its tick script.

## Self-Check: PASSED

- Files exist: `src/app/session/world-lifecycle.ts`, `tests/app/session/world-lifecycle.test.ts` (FOUND); no step-cost file in `git status --porcelain --untracked-files=all`.
- Commits exist and are ancestors of HEAD: `1f77a5d`, `2c5d780`, `84178b9`, `925b161`; `git rev-list --count 1c5578c..HEAD` before this SUMMARY = 4.
- Acceptance criteria re-run: `stepFlight(` count under `src/app` 0, `stepSim(` in `sim-driver.ts` 1, one `case "docked":` (in `event-router.ts`), `world-lifecycle.ts` imports only `src/sim` modules, no `EntityId` in its code, no factory-level lifecycle variable in `sim-driver.ts`, "reserved kinds pass through" 1, "Node-importable session modules" 1, "one-tick latency" / "prepare step" / "D-05" present in the header, `createWorldLifecycle(` 1 and `testFlags.traffic` 1 in `start-session.ts`, `new URLSearchParams` 0 in `start-session.ts` and `game-session.ts`, `begin(nextSeed)` (line 225) before `autosave()` (line 243), PROJECT.md citations `Universe.m:1162-1181` and `Universe.m:1088-1160` and "burn ids with traffic off" present, `describe("load` 1, the probe, the probe-shape fixture and `src/persistence` unchanged since `1c5578c`.
- Gates: targeted vitest, typecheck and lint green after each task; `verify` (84178b9) and `verify-full` (925b161) exit 0.
