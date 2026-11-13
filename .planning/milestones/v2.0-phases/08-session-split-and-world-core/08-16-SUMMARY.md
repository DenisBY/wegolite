---
phase: 08-session-split-and-world-core
plan: 16
subsystem: app
tags: [probe, test-hook, advance-ticks, world-hash, probe-sim, tick-parity, probe-shape, d-09, d-10, d-13, found-10, found-14]
status: complete

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-01 the frozen probe-shape fixture and spec; 08-14 test flags, MAX_ADVANCE_TICKS, advanceTicks and markHookMutation; 08-15 the world lifecycle (epoch, world) and step-options
provides:
  - probe.sim = { tick, epoch, entities, worldLive, traffic, clock }, published only while a flight state exists
  - probe.test.worldHash() (on demand; "" without a state or after dispose) and probe.test.advanceTicks(n) (always present; steps only under ?test=1&clock=manual)
  - createTestHook(state, scenes, onMutate, profile, sim) with a required fifth parameter
  - the re-recorded probe-shape fixture (seven states, the seventh testHookManualDocked)
  - tests/helpers/tick-script.ts (runTickScript with a per-tick trace), tests/app/session/tick-parity.test.ts, tests/e2e/tick-hook.spec.ts
  - a Key Decisions row in PROJECT.md for the manual clock, the criterion-5 scope and the SC1/D-13 reconciliation
affects: [phase-08-verification, 12-inert-ships-and-the-world-lifecycle]

plan_head_before: cb937c5f969375cef543f9bb5f07df951419994c
plan_head_after: 3ece12e076c8b5ccbf000a44891e33a0e81113f4
actuals:
  tokens: 13000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "the hook's sim members are bound at call time through the publisher and the driver owns the manual-clock refusal rule, so the hook adds no flag check of its own"
    - "probe.sim is a fresh plain object of primitives rebuilt in updateProbe; entities comes from liveEntityCount(world), so src/app never reads the world's store"
    - "a pure Node replay (tick-script.ts) shared by Vitest and the Playwright runner, with a per-tick trace that names the first diverging tick"

key-files:
  created:
    - tests/helpers/tick-script.ts
    - tests/app/session/tick-parity.test.ts
    - tests/e2e/tick-hook.spec.ts
  modified:
    - src/app/probe.ts
    - src/app/session/probe-publisher.ts
    - src/app/game-session.ts
    - tests/fixtures/probe-shape.json
    - tests/e2e/probe-shape.spec.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/app/session/sim-driver.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "advanceTicks and worldHash are always-present hook functions, so plan 08-01's frozen contract (every probe.test member reads function in docked ?test=1) holds; stepping stays gated by ?test=1&clock=manual in the driver"
  - "browser/Vitest parity is claimed at its honest Phase 8 scope: the browser world is empty, so it proves tick control, option parity and the lifecycle's epoch bumps and world creation; non-empty-world determinism stays Vitest-only (plans 08-11 and 08-13)"
  - "ROADMAP success criterion 1 governs the split through plan 08-15; D-13 sanctions this one additive probe commit (e5756cf), recorded in the PROJECT.md row"

patterns-established:
  - "a browser parity spec compares a probe-read hash with a Node replay hash and with hashFlight of the replay, so two sides cannot agree on one wrong value"

requirements-completed: [FOUND-14, FOUND-10]

coverage:
  - id: D1
    description: "The one deliberate post-split probe commit adds probe.sim, test.worldHash and test.advanceTicks and the seventh fixture state, and removes or renames nothing: deleting those additions from the new fixture gives the old fixture for each of the six earlier states"
    requirement: FOUND-10
    verification:
      - kind: e2e
        ref: "tests/e2e/probe-shape.spec.ts (seven states, assert mode)"
        status: pass
      - kind: other
        ref: "scripted subtractive diff (see Probe-shape diff): PROBE-SHAPE DIFF PASS"
        status: pass
    human_judgment: false
  - id: D2
    description: "Under ?test=1&clock=manual the loop never self-steps (tick unchanged over 30 or more frames) and advanceTicks(5) advances exactly 5 ticks; 0 and 1.5 are refused; under plain ?test=1 advanceTicks(100000) steps nothing and does not taint"
    requirement: FOUND-14
    verification:
      - kind: e2e
        ref: "tests/e2e/tick-hook.spec.ts (manual clock; plain ?test=1 refusal)"
        status: pass
      - kind: unit
        ref: "tests/app/session/tick-parity.test.ts#the sim hook reads live objects (G-8)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A launch plus 600 ticks read the same world hash in the browser, in a Node replay and in the real sim driver under Vitest, and that hash equals hashFlight (no NPC); a per-tick trace names the first diverging tick; a scripted jump bumps the epoch 0 to 1 to 2 and recreates the world from the arrival seed"
    requirement: FOUND-14
    verification:
      - kind: e2e
        ref: "tests/e2e/tick-hook.spec.ts#a launch and 600 ticks read the same world hash in the browser and in the Node replay"
        status: pass
      - kind: unit
        ref: "tests/app/session/tick-parity.test.ts#tick parity with the Node replay (success criterion 5)"
        status: pass
    human_judgment: false
  - id: D4
    description: "NPC traffic is off under ?test=1 and on only with &traffic=1; the clock and traffic flags are inert without test=1"
    requirement: FOUND-14
    verification:
      - kind: e2e
        ref: "tests/e2e/tick-hook.spec.ts#traffic is off under ?test=1 and on only for a spec that opts in; #the clock and traffic flags are inert without ?test=1"
        status: pass
    human_judgment: false
  - id: D5
    description: "worldHash reads live objects, returns the empty sentinel on a stale hook, and neither taints nor requests a redraw; probe.sim holds only primitives and mutating it leaves the world and the hash unchanged; src/app neither imports the world's store module nor reads its store field; the redraw gate keeps five request sites"
    requirement: FOUND-14
    verification:
      - kind: unit
        ref: "tests/app/session/tick-parity.test.ts#probe.sim; #the sim hook reads live objects (G-8)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The phase gate: verify-full exits 0 (second run; the first run hit five host-load timeouts that pass on rerun) and no earlier golden changed since 5b189e4"
    verification:
      - kind: other
        ref: "docker compose run --rm verify-full on 3ece12e: exit 0, 28m23s, 136 unit files / 2407 tests (2 skipped), 128 Chromium specs plus 2 seams specs"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-11-13
---

# Phase 8 Plan 16: The tick hook and browser/Vitest parity Summary

**The test hook gains `advanceTicks` and `worldHash`, the probe gains `probe.sim`, and a browser run, a Node replay and the real sim driver read the same hash after a launch and 600 ticks; the probe shape grew by exactly those three additions in one commit, and verify-full is green.**

## Performance

- **Duration:** about 70 min (about 16:19Z to 17:29Z), of which about 60 min were gate runs (two verify-full runs of 28 min each overlapped with the targeted work, a 4 min rerun of five specs)
- **Tasks:** 2
- **Files:** 11 changed (3 created, 8 modified) plus this SUMMARY and the STATE, ROADMAP and REQUIREMENTS updates

## Accomplishments

- `src/app/probe.ts`: `WegoliteSimProbe` (six primitive fields, each documented; `entities` counts live non-dead dynamic entities of the current world only, never the statics or the player, 0 without a world), `WegoliteSimTestHook { worldHash, advanceTicks }`, `WegoliteProbe.sim?`, both members required on `WegoliteTestHook`, and `createTestHook` with a required fifth `sim` parameter (no casts anywhere).
- `src/app/session/probe-publisher.ts`: `probe.sim` is published inside `if (currentState !== undefined)` as a fresh plain object (`entities` through `liveEntityCount`, never the store), deleted when there is no state and in `withdrawProbe`; `worldHash` reads the live state and the live lifecycle world per call and returns `""` for a missing state or a disposed session; `advanceTicks` delegates to the driver, which keeps the single refusal rule. `game-session.ts` passes the late-bound `advanceTicks` dep (two lines).
- `tests/helpers/tick-script.ts`: `runTickScript(steps, { traffic?, trace? })`, a pure replay of a New game (profile, market seed, dock geometry, controllers, one idle frame per step, `buildStepOptions`, `stepSim`, the lifecycle reactions); its header maps every setup value to the line it mirrors and states that it supersedes `recorded-flights.ts` for post-split semantics.
- `tests/app/session/tick-parity.test.ts` (12 tests): the real driver against the replay (one call pair, a 601-call per-tick trace that names the first diverging tick, a scripted launch-skip-jump through `advanceTicks` with the real hyperspace controller: epoch 0 to 1 to 2, world recreated from `worldSeedFor(arrivalMarketSeed(...), 2)`, ids from 101, hash equals `hashFlight`), the live-read hook, the taint after the new fifth parameter, the plain `?test=1` refusal, the manual-clock step, the stale-hook sentinel (disposed and no state), `probe.sim` primitives and mutation immunity, its absence without a state, and the five-request scan.
- `tests/e2e/tick-hook.spec.ts` (5 specs, chromium): manual clock never self-steps and `advanceTicks(5)` is exact (0 and 1.5 refused); browser `worldHash` equals the Node replay hash, which equals `hashFlight` of the replay; `&traffic=1` opt-in; inert flags without `test=1` (after `startNewGame`); plain `?test=1` refuses `advanceTicks(100000)`.
- `tests/e2e/probe-shape.spec.ts` and the fixture: the `| sim |` audit row, `sim` in the shared key list, and the seventh state `testHookManualDocked`.
- PROJECT.md: one Key Decisions row (outcome "Phase 8 plans 08-14 and 08-16") with the criterion-5 scope ("browser world is empty"), the shared-code limit of the parity test and the SC1/D-13 reconciliation.

## Task Commits

1. **Task 1 (tracer): the one deliberate probe commit** - `e5756cf` (feat). The tracer feedback gate ran in auto mode: the Task 1 verify commands (probe-shape and tick-hook specs, the Vitest scans) passed before the commit and nothing changed after it, so expansion went ahead.
2. **Task 2: parity, opt-in, inert flags, the decision row** - `3ece12e` (test)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Probe-shape diff

The scripted subtractive check (script under /tmp/wegolite-shape, mounted at /scratch; `old.json` is `git show cb937c5:tests/fixtures/probe-shape.json`, `new.json` the re-recorded fixture). Run with `docker compose run --rm -v /tmp/wegolite-shape:/scratch test node /scratch/diff.mjs`.

```js
// Subtractive probe-shape check (plan 08-16 Task 1 step 4, review 10b4108 L401).
// For each of the six states plan 08-01 recorded, deleting the `sim` key and the
// hook's `worldHash` and `advanceTicks` keys from the new shape must give exactly
// the old shape. The seventh state (testHookManualDocked) is new.
import { readFileSync } from "node:fs";

const oldShape = JSON.parse(readFileSync("/scratch/old.json", "utf8"));
const newShape = JSON.parse(readFileSync("/scratch/new.json", "utf8"));
const canon = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );
let failed = false;
const oldNames = Object.keys(oldShape);
console.log("old states:", oldNames.join(", "));
console.log("new states:", Object.keys(newShape).join(", "));
for (const name of oldNames) {
  const copy = structuredClone(newShape[name]);
  const hadSim = "sim" in copy;
  delete copy.sim;
  let hook = "";
  if (copy.test) {
    hook = `test.worldHash=${copy.test.worldHash} test.advanceTicks=${copy.test.advanceTicks}`;
    delete copy.test.worldHash;
    delete copy.test.advanceTicks;
  }
  const same = canon(copy) === canon(oldShape[name]);
  const simExpected = name !== "menu";
  const ok = same && hadSim === simExpected;
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: sim=${hadSim} ${hook} subtractive-equal=${same}`);
}
const extra = Object.keys(newShape).filter((k) => !oldNames.includes(k));
console.log("added states:", extra.join(", "));
const manual = newShape.testHookManualDocked;
const manualOk =
  extra.length === 1 &&
  extra[0] === "testHookManualDocked" &&
  manual.test.advanceTicks === "function" &&
  manual.test.worldHash === "function" &&
  "sim" in manual;
console.log(`${manualOk ? "OK  " : "FAIL"} testHookManualDocked has sim and both hook members as functions`);
if (!manualOk) failed = true;
console.log(failed ? "PROBE-SHAPE DIFF FAIL" : "PROBE-SHAPE DIFF PASS");
process.exit(failed ? 1 : 0);
```

Output:

```
old states: menu, docked, paused, chart, inFlight, testHookDocked
new states: menu, docked, paused, chart, inFlight, testHookDocked, testHookManualDocked
OK   menu: sim=false  subtractive-equal=true
OK   docked: sim=true  subtractive-equal=true
OK   paused: sim=true  subtractive-equal=true
OK   chart: sim=true  subtractive-equal=true
OK   inFlight: sim=true  subtractive-equal=true
OK   testHookDocked: sim=true test.worldHash=function test.advanceTicks=function subtractive-equal=true
added states: testHookManualDocked
OK   testHookManualDocked has sim and both hook members as functions
PROBE-SHAPE DIFF PASS
```

Exactly one commit after the plan base touches `tests/fixtures/probe-shape.json` and `src/app/probe.ts` (`e5756cf`), and its message body names probe.sim, test.worldHash, test.advanceTicks and the new state.

## Verification

- Task 1: `probe-shape.spec.ts` in write mode (7 passed), then assert mode together with `tick-hook.spec.ts` (8 passed); `vitest run tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts tests/app/session` (15 files, 247 tests); typecheck and lint clean. Acceptance: `interface WegoliteSimProbe` 1; five `redrawGate.request();` over `game-session.ts` and `src/app/session`; the fixture node check exits 0 (seven states, both `advanceTicks` "function"); `| sim |` 1 in the shape spec; the narrowed store gate prints nothing and exits 1.
- Task 2: `tick-parity.test.ts` 12 tests; `tick-hook.spec.ts` 5 passed (the plan wants at least five); acceptance greps: `runTickScript(` in both files, no src/render, ui, input or content value import in the replay, `advanceTicks(100000)` 1, `worldHash()` 10 in the Vitest file, `trace` 6 in the replay, `hashFlight` 2 in the spec, `clock=manual`, `success criterion 1` and `browser world is empty` each 1 in PROJECT.md. A mutation check (idle frame speed 1 in the replay) made two parity tests fail; the source was restored before the commit.
- RESEARCH A7: the Playwright runner imports `tests/helpers/tick-script.ts` directly; the conditional fixture `tests/fixtures/tick-parity.json` was not created and no fallback is in use.
- No pre-existing golden changed since 5b189e4 (`git diff --quiet 5b189e4 -- tests/golden/content tests/golden/hyperspace tests/golden/market tests/golden/save tests/golden/kinematic-probe.json` exits 0).

### verify-full

| Run | Commit | Result | Wall time | Files / tests | Chromium specs |
|-----|--------|--------|-----------|----------------|----------------|
| 1 | `3ece12e` | exit 1, 5 failed | 27m58s | 136 / 2,407 (2 skipped) | 121 passed, 5 failed, 2 did not run |
| targeted rerun of the 5 failures | `3ece12e` | 11 passed (the five specs plus the rest of probe-shape) | 4.1m | n/a | 11 |
| 2 | `3ece12e` | **exit 0** | **28m23s** | 136 / 2,407 (2 skipped) | 128 passed plus 2 seams specs |

Run 1 failures, all timeouts, with the host load average at 6 to 8 on 4 cores (other services on the machine restarted during the run): `hyperspace.spec.ts:194` (180 s wait for the jump; 6.5 min), `launch.spec.ts:129` (the known D-2 one-frame hint flake), `probe-shape.spec.ts:286` in-flight (30 s test timeout; the same spec took 11 s unloaded and 23 s under load on the rerun), `save-load.spec.ts:205` and `:248` (5 s wait for `#docked` after New game, the D-2 symptom seen at `:634` earlier). No failing spec touches code this plan changed in a way that could slow it (`updateProbe` adds one small object per frame); each passed on the immediate rerun and run 2 passed everything without a retry. The wall time of run 2 is 2.6 percent below the 08-15 gate (28m58s) and 11.7 percent above the 08-01 baseline.

## Decisions Made

- `worldHash()` computes the hash from the live lifecycle world per call and never caches; the `""` sentinel (no real hash is empty) covers both menu mode and a disposed session.
- `advanceTicks` on the hook is a one-line delegate; the refusal table lives only in the driver (plan 08-14), so unit and browser proofs of the refusal exercise the same code.
- The replay does not mirror the hyperspace edge mapping or the arrival; a jump is proven through the real driver in Vitest only, as the plan scopes it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The two existing `createProbePublisher` callers in tests needed the new required `advanceTicks` dep**
- **Found during:** Task 1 (typecheck)
- **Issue:** `tests/app/session/probe-publisher.test.ts` and `tests/app/session/sim-driver.test.ts` build a publisher without the new required dep, so typecheck failed.
- **Fix:** one added line in each (`advanceTicks: () => 0`); no behaviour change in those tests.
- **Files modified:** the two test files above (outside the plan's `files_modified`, one line each)
- **Commit:** `e5756cf`

Process notes:

1. **[Process] No other file outside the plan's list was touched.** `tests/e2e/probe-shape.spec.ts` (inside the list) also gained `sim` in its shared key list, so every sampled session state waits for `probe.sim` before the shape is taken.
2. **[Process] verify-full ran twice** (see the table): the first run failed on five load-sensitive timeouts that passed on rerun; the second run is the gate evidence.

**Total deviations:** 1 auto-fixed (Rule 3), 2 process notes. **Impact:** none on scope.

## Known Stubs

None.

## Threat Flags

None. The surface added is exactly the planned one: `worldHash` and an always-present `advanceTicks` behind `?test=1` (T-08-32, refusal proven in Node and in the browser), the fixture re-record proven subtractive (T-08-34), `probe.sim` as primitives with the narrowed store gate (T-08-46) and the stale-hook sentinel (T-08-58). The prohibition for FOUND-14 (the manual clock and the traffic flag must not change a session opened without exactly `?test=1`) is proven by `tests/app/session/test-flags.test.ts` (08-14) and by the inert-flags browser spec.

## Issues for the owner

- The two verify-full runs show how load-sensitive five specs are on this host (hyperspace 194, launch 129, probe-shape in-flight, save-load 205 and 248); D-2 in `deferred-items.md` already records the launch and save-load ones. The probe-shape in-flight spec (30 s test timeout) and `hyperspace.spec.ts:194` (180 s wait) timed out only at a load average of 6 to 8; consider adding them to D-2 or raising their budgets in a hygiene plan.
- FOUND-10 and FOUND-14 are marked complete: `requirements.ready-ids` reported both ready (no sibling plan blocks them). The browser jump-parity with a populated world stays deferred to Phase 12, as the Key Decisions row records.

## Next Phase Readiness

Phase 8 has no further plans. The orchestrator can run phase verification: the probe shape is frozen except for the one recorded additive commit, the session is split, the world lifecycle is in, and the hook can step and hash the simulation without wall time.

## Self-Check: PASSED

- Files exist: `src/app/probe.ts`, `src/app/session/probe-publisher.ts`, `tests/helpers/tick-script.ts`, `tests/app/session/tick-parity.test.ts`, `tests/e2e/tick-hook.spec.ts` (FOUND); `tests/fixtures/tick-parity.json` correctly absent (no A7 fallback).
- Commits exist and are ancestors of HEAD: `e5756cf`, `3ece12e`; `git rev-list --count cb937c5..HEAD` before this SUMMARY = 2.
- Acceptance criteria re-run after the last code change (see Verification); typecheck, lint and verify-full (run 2) exit 0; no scratch file in the repository (`git status` shows only this SUMMARY and the pre-existing review-diagnostics directories); the gate's root-owned `dist/` and `test-results/` were removed.
