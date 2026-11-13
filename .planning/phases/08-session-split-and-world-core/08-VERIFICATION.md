---
phase: 08-session-split-and-world-core
verified: 2026-11-13T12:00:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/08-session-split-and-world-core/08-01-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-01-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-02-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-02-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-03-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-03-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-04-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-04-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-05-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-05-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-06-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-06-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-07-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-07-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-08-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-08-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-09-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-09-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-10-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-10-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-11-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-11-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-12-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-12-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-13-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-13-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-14-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-14-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-15-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-15-SUMMARY.md"
  - ".planning/phases/08-session-split-and-world-core/08-16-PLAN.md"
  - ".planning/phases/08-session-split-and-world-core/08-16-SUMMARY.md"
  - "eslint.config.js"
  - "src/app/game-session.ts"
  - "src/app/probe.ts"
  - "src/app/session/chart-controller.ts"
  - "src/app/session/context.ts"
  - "src/app/session/event-router.ts"
  - "src/app/session/frame-loop.ts"
  - "src/app/session/hyperspace-controller.ts"
  - "src/app/session/probe-publisher.ts"
  - "src/app/session/render-driver.ts"
  - "src/app/session/save-controller.ts"
  - "src/app/session/settings-controller.ts"
  - "src/app/session/sim-driver.ts"
  - "src/app/session/start-session.ts"
  - "src/app/session/station-controller.ts"
  - "src/app/session/step-options.ts"
  - "src/app/session/test-flags.ts"
  - "src/app/session/world-lifecycle.ts"
  - "src/sim/ai/pilots/test-pilot.ts"
  - "src/sim/ai/registry.ts"
  - "src/sim/ai/time.ts"
  - "src/sim/ai/types.ts"
  - "src/sim/events.ts"
  - "src/sim/math.ts"
  - "src/sim/rng.ts"
  - "src/sim/sim.ts"
  - "src/sim/world/aegis.ts"
  - "src/sim/world/control-impl.ts"
  - "src/sim/world/control.ts"
  - "src/sim/world/entity.ts"
  - "src/sim/world/ids.ts"
  - "src/sim/world/layout.ts"
  - "src/sim/world/limits.ts"
  - "src/sim/world/sanitize.ts"
  - "src/sim/world/serialize.ts"
  - "src/sim/world/snapshot.ts"
  - "src/sim/world/step.ts"
  - "src/sim/world/store.ts"
  - "src/sim/world/view-impl.ts"
  - "src/sim/world/view.ts"
  - "src/sim/world/world.ts"
  - "tests/e2e/probe-shape.spec.ts"
  - "tests/e2e/tick-hook.spec.ts"
  - "tests/fixtures/probe-shape.json"
  - "tests/golden/world/flight-hash-pins.json"
covered_digest: "v4:sha256:eec6d14916d2f0f95199e94796ef07e058bdfda805c90cff27f0553f81d94632"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Manual play check queued by plan 08-12 (human_verify_mode end-of-phase). Run `docker compose up preview`, open http://localhost:4173, start a New game, launch, fly, dock at Lave, buy and sell a good, open the chart and target Leesti, launch, jump, then F2 save, reload and Continue."
    expected: "Everything behaves as in release 0.3.0: the split and the world integration are behaviour-neutral (FOUND-10)."
    why_human: "Feel, visual output and a full interactive session cannot be judged from grep or Vitest. The same path is covered automatically by the Chromium core-loop and save-load specs (verify-full green on 3ece12e) and by the Firefox core-loop journey (08-12 and 08-15), so this is a final owner sanity check and not a gap."
---

# Phase 8: Session Split and World Core Verification Report

**Phase Goal:** The game plays exactly as before, but runs on a multi-entity world model with stable ids, seeded per-entity random streams, a world hash and a typed seam for AI, and tests can step the simulation by ticks.
**Verified:** 2026-11-13
**Status:** human_needed (all five roadmap success criteria are verified in the codebase; the one queued manual play check remains)
**Re-verification:** No, initial verification.

## Method

I did not rely on SUMMARY.md. I read the implementation files, diffed the phase base `5b189e4` against HEAD `eed6f2a`, and ran gates in Docker:

- `docker compose run --rm test npx vitest run tests/sim/world tests/sim/ai tests/sim/rng.test.ts tests/guards tests/app tests/golden`: 45 files, **1101 passed, 1 skipped, exit 0** (the skip is `tests/sim/world/hash.test.ts:280`, `it.skipIf(OOLITE_SRC === "")`, an optional cross-check against the Oolite checkout, which is not mounted in the container).
- `docker compose run --rm lint` (eslint plus prettier): exit 0.
- `docker compose run --rm typecheck` (root and `tsconfig.sim.json`): exit 0.
- `verify-full` was not re-run (about 30 minutes). The 08-16 executor's green run (2407 unit tests, 128 Chromium specs) on `3ece12e` is taken as given for the browser specs. The only commits after it are docs (`3a2dc17`, `eed6f2a`), so I confirmed no `src` or `tests` change since with `git log`.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A player can start, launch, fly, dock, trade, hyperspace, save and reload exactly as before `game-session.ts` was split; every v1 golden, unit and e2e test passes without regeneration; the probe shape is unchanged through the split and the world integration, then exactly one additive probe commit (08-16) | ✓ VERIFIED (manual play check queued) | The monolith (3,365 lines) is now a 538-line facade whose only function export is `createGameSession`, plus 15 modules under `src/app/session/`. `git diff --name-status 5b189e4 HEAD -- tests/golden tests/fixtures` lists only two added files (`tests/golden/world/flight-hash-pins.json`, `tests/fixtures/probe-shape.json`); no existing golden was modified. Of the pre-existing tests only six were modified, each for a declared reason: `redraw-gate.test.ts` and `economy-purity.test.ts` re-pointed at the concatenating `sessionSource()` helper (D-12 step 0), `container-contract.test.ts` for the added fast-gate spec, `sim-purity.test.ts` for the new world directory, and two stale docked-home label fixes in `scene.spec.ts` and `docking.spec.ts` (deferred-items D-1, a test-side stale assertion from commit 46c9305). The probe fixture was edited once after creation, in `e5756cf` (08-16): 250 insertions, and the single removed line is `"tainted": "boolean"` re-emitted with a trailing comma, so the change is purely additive (`sim`, `worldHash`, `advanceTicks`, the seventh state). `src/sim/flight/**` and `src/sim/hyperspace/**` are unchanged versus the base; `src/sim/math.ts` differs only in that `createSeededRandom` now wraps `RngState`. Targeted Vitest, lint and typecheck are green. |
| 2 | With no NPC present a recorded flight yields the same world hash as its v1 flight hash; ids are never reused within the world that issued them (each world restarts dynamic ids at 101); every simulation pass visits entities in id order | ✓ VERIFIED | `serialize.ts` `hashWorld` appends the world section only when `isNeverSpawned(world)` is false, so an empty world hashes to exactly `fnv1a32(serializeFlight(player))` (D-08); `serializeFlight` is untouched. Pinned by `tests/golden/world/flight-hash-pins.json` (not regenerated) with `flight-hash-pins.test.ts` (4 tests), `hash.test.ts` and `step.test.ts` case (b), which compares the three runs `stepFlight`, `stepSim` with no world and `stepSim` with a world at every tick. `store.ts` keeps `live` strictly ascending, allocates from a monotonic `next` that only increases and is never decremented on kill or commit, and `createWorld` always builds a fresh store at `FIRST_DYNAMIC_ID` (101); no module-level mutable binding exists. `world-lifecycle.ts` calls `createWorld` for every `begin` and `resume`. `stepWorld` walks update, think and sanitize by ascending index over a length snapshot, and `commitWorld` emits `entityRemoved` ascending. `tests/guards/entity-id-scope.test.ts` (10 tests) fails if `src/app` imports `ids.ts` or `store.ts`; I also confirmed with `rg` that nothing outside `src/sim` imports `snapshotWorld`, `restoreWorld`, the store or the ids module. |
| 3 | A snapshot-restored world and its live origin hash identically after 1,000 ticks; lint rejects `Math.random`, `Date`, wall clock, `for..in` and bare `.sort()` in `src/sim` | ✓ VERIFIED | `tests/sim/world/snapshot.test.ts` "keeps the restored world equal to the live world for 1,000 ticks" is non-vacuous: six spawns, ids 102 and 106 killed and committed (live ids [101, 103, 104, 105], `nextId` 107), four moving test pilots, 300 warm-up ticks, a JSON round trip through `parseWorldSnapshot`, then 1,000 stepped ticks compared every 50 ticks on the flight hash, per-entity hashes, `hashWorld`, snapshot JSON and `toStrictEqual` of the player. It passes. `rng.ts` holds `RngState` as one uint32; `forkSeed(worldSeed, entityId, purpose)` uses fixed purpose codes; the entity streams are stored as plain integers (`spawnEntity`). `eslint.config.js` carries `no-restricted-syntax` for `new Date`, `ForInStatement` and every bare-sort form (also `.call/.apply/.bind`, `Reflect`, `Math` aliasing), and `no-restricted-properties` and `-globals` for `Math.random`, `Date.now`, `performance.now`, timers, `process` and `crypto`. `tests/guards/sim-determinism-bans.test.ts` (53 tests, 45 failing probes run through the real root config) passes. An independent `rg` over `src/sim` finds no `Math.random`, `Date`, `performance.now`, `for..in` or bare `.sort()` in non-comment code. |
| 4 | A scripted test pilot reads the world only through `WorldView` and acts only through `ShipControl`; its state survives a JSON round trip; its timers are integer ticks; lint rejects an AI module that imports simulation internals | ✓ VERIFIED | `src/sim/ai/pilots/test-pilot.ts` imports only `../../math.js`, `../../world/ids.js`, `../time.js` and `../types.js`; it reads through `ctx.view` (`scan`, `body`, `ship`, `isValid`) and writes through `ctx.ctl` (`setTarget`, `setDestination`, `setDesiredRange`, `setDesiredSpeed`, `perform`, `scheduleWake`), and it keeps its state in `ai.params` (primitives only). `time.ts` defines `THINK_INTERVAL_TICKS = 15` and an integer `ticks()`. `view.ts` and `control.ts` are type-only and their members are pinned by exhaustive `Record<keyof ...>` tests; `view-impl.ts` returns fresh copies. The AI zone in `eslint.config.js` is an allow-list import regex for depth 1 and 2, plus a ban on `createSeededRandom` and on module-level mutable state. `tests/guards/ai-zone.test.ts` and `tests/sim/ai/test-pilot.test.ts` (16 tests, including the JSON round trip) pass, and `snapshot.test.ts` runs the pilots through a snapshot restore. |
| 5 | A browser spec can advance the simulation by N ticks through the test hook and reads the same hash as a Vitest run of the same N ticks; NPC traffic stays off unless the spec opts in | ✓ VERIFIED | `test-flags.ts` `parseTestFlags` is exact: `hook` only for `test=1`, `manualClock` only with the hook and `clock=manual`, `traffic` true without the hook and only for `traffic=1` under it; it is read once into `ctx.runtime.testFlags` at `start-session.ts:299`. `frame-loop.ts:146` never self-steps under the manual clock (it draws at alpha 1). `sim-driver.ts` `advanceTicks` refuses unless the manual clock is on, `n` is a safe integer in 1..200,000, and the session is not disposed, paused, behind an overlay or stateless; it taints before stepping and shares one drain with the realtime path. `probe.test.worldHash()` and `advanceTicks` are bound at call time (`probe-publisher.ts`), and `probe.sim` publishes primitives only. `tests/e2e/tick-hook.spec.ts` (5 specs) and `tests/app/session/tick-parity.test.ts` (12 tests, including a 601-call per-tick trace) both import `tests/helpers/tick-script.ts`; the e2e spec asserts the browser hash after a launch and 600 ticks equals the Node replay hash and equals `hashFlight`. Traffic: `createWorldLifecycle` receives `traffic` from the parsed flags and passes it to `populate`; the spec asserts `traffic` is false under `?test=1`, true under `&traffic=1`, and that the flags are inert without `test=1`. See the scope note under Gaps Summary: no populator exists yet, so traffic opt-in changes only the flag, as the roadmap intends. |

**Score:** 5/5 truths verified, 0 present but behavior-unverified.

The state-transition and ordering truths each have a behavioral test and are not presence-only: snapshot resume equality (criterion 3), id order and spawn-during-tick, kill-skipped and jump-step rules in `step.test.ts` (criterion 2), the frame phase order and the dispose order in `session-order.test.ts` and `start-session.test.ts` (criterion 1), and the manual-clock refusal table in `sim-driver.test.ts` (criterion 5).

### Deferred Items

None. Every gap-like item below (AI containment, single-slot swap) is a Phase 8 robustness note, not something a later phase's roadmap text claims.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/app/game-session.ts` | Thin facade, `createGameSession` the only function export | ✓ VERIFIED | 538 lines; exports are `createGameSession`, five types or interfaces, and one `DESTINATION_BUILD_FAULT_MESSAGE` re-export (no value logic) |
| `src/app/session/*.ts` (15 files) | Subsystem split per D-12 | ✓ VERIFIED | context, probe-publisher, render-driver, chart, settings, station, save, hyperspace, event-router, sim-driver, step-options, frame-loop, start-session, test-flags, world-lifecycle; each non-trivial and imported by the facade or a sibling |
| `src/sim/world/{ids,limits,entity,store,world,serialize,snapshot,sanitize,step,view,view-impl,control,control-impl}.ts` | World core | ✓ VERIFIED | Substantive implementations read in full for store, world, serialize, step, ids, view and control; snapshot and sanitize are exercised by 191 and 121 tests |
| `src/sim/rng.ts` | Serialisable stream, `mix32`, `worldSeedFor`, `forkSeed` | ✓ VERIFIED | Pinned by literal vectors in `tests/sim/rng.test.ts` (35 tests); `createSeededRandom` wraps it, so arrival goldens did not regenerate |
| `src/sim/sim.ts` | `stepSim` composing flight then world | ✓ VERIFIED | Calls `stepFlight` unchanged, then `stepWorld` only while launching or in flight and not on a `hyperspaceJumped` step |
| `src/sim/ai/{types,time,registry}.ts`, `pilots/test-pilot.ts` | AI types, tick timers, frozen registry, scripted pilot | ✓ VERIFIED | See criterion 4 |
| `src/sim/events.ts` | Reserved presentation and audio events | ✓ VERIFIED | `laserFired`, `shipHit`, `shipDestroyed`, `entityRemoved`, `commsMessage`, `missileLaunched`, `missileDetonated`, `ecmFired`, `cargoScooped` present |
| `eslint.config.js` | Determinism bans and AI zone | ✓ VERIFIED | See criteria 3 and 4 |
| `tests/fixtures/probe-shape.json`, `tests/e2e/probe-shape.spec.ts` | Frozen then additively extended probe shape | ✓ VERIFIED | Seven states; additive only |
| `tests/golden/world/flight-hash-pins.json` | Pinned v1 flight hashes | ✓ VERIFIED | Added in 08-02, never regenerated |
| `tests/e2e/tick-hook.spec.ts`, `tests/helpers/tick-script.ts` | Browser and Node parity | ✓ VERIFIED | Shared replay module |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `sim-driver.stepOnce` | `stepSim` and live world | `ctx.core.worldLifecycle?.world` read each step | WIRED | The single step call site; no other `stepFlight` or `stepSim` caller in `src/app` |
| `event-router` `launched` / `docked` | `worldLifecycle.begin` / `end` | `createWorldLifecycleFlow` subscriber after `stationFlow` | WIRED | A world exists first on the tick after the launch step (documented rule (i), mirrored by `tick-script.ts`) |
| `hyperspace-controller.handleHyperspaceJumped` | `worldLifecycle.begin(nextSeed)` | Inside the synchronous install block, before the arrival autosave | WIRED | Epoch bump on arrival (D-02) |
| `start-session` boot Continue and `save-controller` warm Load | `resetForRestore(0)` then `resume(seed)` for an in-flight save | Same seed and epoch warm or cold | WIRED | World is never written to the save (no `snapshotWorld` use outside `src/sim`) |
| `frame-loop` | `simDriver.advanceFrame` or alpha 1 | `testFlags.manualClock` | WIRED | |
| `probe-publisher` | `hashWorld(state, lifecycle.world)` | `worldHash()` on demand; `probe.sim` primitives | WIRED | |
| `game-session` facade | `simDriver.advanceTicks` | `createTestHook` fifth parameter | WIRED | |
| `stepWorld` | AI modules | `aiModuleFor` (`Object.hasOwn`) then `createWorldView` and `createShipControl` | WIRED | Prototype-name keys are skipped, not thrown |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `probe.sim` | `tick`, `epoch`, `entities`, `worldLive`, `traffic`, `clock` | `FlightState.tick`, `worldLifecycle.epoch`, `liveEntityCount(world)`, parsed flags | Yes, live reads each frame | ✓ FLOWING |
| `probe.test.worldHash()` | hash string | `hashWorld(ctx.core.state, ctx.core.worldLifecycle?.world)` computed on call | Yes | ✓ FLOWING |
| `advanceTicks` | return value | `ctx.core.state.tick` after real `stepOnce` calls | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| World core, AI seam, RNG, determinism lint probes, session controllers, tick parity, probe-shape comparator, goldens | `docker compose run --rm test npx vitest run tests/sim/world tests/sim/ai tests/sim/rng.test.ts tests/guards tests/app tests/golden` | 45 files, 1101 passed, 1 skipped, exit 0 | ✓ PASS |
| Lint and format | `docker compose run --rm lint` | exit 0 | ✓ PASS |
| Typecheck (root and sim configs) | `docker compose run --rm typecheck` | exit 0 | ✓ PASS |
| Browser specs (tick-hook, probe-shape, core loop, save-load) | not re-run here; 08-16 executor `verify-full` on `3ece12e`: 2407 unit tests, 128 Chromium specs; Firefox `e2e-cross` in 08-12 and 08-15 | green per the orchestrator | ? taken as given (no src or tests change after `3ece12e`) |

### Probe Execution

SKIPPED: the phase declares no `probe-*.sh` scripts (no PLAN or SUMMARY references one, and `scripts/*/tests/probe-*.sh` has no phase 8 entries). The runtime `window.__wegolite` probe is covered by the probe-shape spec and fixture above.

### Requirements Coverage

Every ID in the five requirement set appears in at least one PLAN `requirements:` field, and REQUIREMENTS.md maps no other ID to Phase 8 (no orphans).

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| FOUND-10 | 08-01, 08-04, 08-06, 08-08, 08-10, 08-12, 08-16 | v1 play unchanged after the split; goldens, unit and e2e pass without regeneration; probe shape unchanged | ✓ SATISFIED | Criterion 1. Manual play check queued (human_verification) |
| FOUND-11 | 08-02, 08-03, 08-05, 08-07, 08-11, 08-13, 08-15 | Many entities, stable ids never reused in their world, id-order iteration, empty-world hash equals the v1 flight hash | ✓ SATISFIED | Criterion 2 |
| FOUND-12 | 08-02, 08-03, 08-05, 08-11, 08-13 | Serialisable seeded streams forked per entity and purpose; no `Math.random`, `Date`, wall clock in `src/sim`; live and restored worlds hash identically after 1,000 ticks | ✓ SATISFIED | Criterion 3 |
| FOUND-13 | 08-07, 08-09, 08-11 | AI reads through `WorldView`, acts through `ShipControl`; plain serialisable AI state; integer tick timers | ✓ SATISFIED | Criterion 4 |
| FOUND-14 | 08-14, 08-15, 08-16 | Tests advance the simulation by N ticks via the hook; traffic off by default in browser tests, opt-in per spec | ✓ SATISFIED | Criterion 5 |

REQUIREMENTS.md already shows all five as `[x]` and "Complete".

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (phase-modified `src/**`, `eslint.config.js`, test helpers and guards) | n/a | `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER` | none found | No unreferenced debt marker; the debt-marker gate does not fire |
| `src/sim/world/step.ts` | 115, 209 | No containment around `module.think` and `module.onEvent` (review WR-01) | ⚠️ Warning | See Gaps Summary; unreachable with the only registered module |
| `src/app/session/world-lifecycle.ts` | 127-133, 141-147 | Unreachable `epoch` guards (review WR-02, necessity) | ⚠️ Warning (info in effect) | Dead defensive code, no behaviour impact |

The review's eight info items (IN-01 to IN-08) were read and I agree with their classification: none contradicts a success criterion.

### Human Verification Required

#### 1. End-of-phase manual play check (from plan 08-12, `human_verify_mode = end-of-phase`)

**Test:** `docker compose up preview`, open http://localhost:4173, start a New game, launch, fly, dock at Lave, buy and sell a good, open the chart and target Leesti, launch, jump, then F2 save, reload and Continue.
**Expected:** Everything behaves as in release 0.3.0 (the split and the world integration are behaviour-neutral, FOUND-10).
**Why human:** Visual output, flight feel and a complete interactive session cannot be judged programmatically. The same journey is covered by the Chromium core-loop and save-load specs and the Firefox journey, so this is a final sanity check by the owner, not an observed gap.

### Gaps Summary

No BLOCKER. All five roadmap success criteria hold in the code, the five requirement IDs are accounted for, and nothing outside the declared deviations changed an existing golden or test expectation.

Warnings carried forward (none blocks the phase goal; neither is a must-have truth):

1. **WR-01 (confirmed by reading `step.ts`):** `invoke()` calls the AI module with no containment. A throwing module would unwind through `stepSim` after `stepFlight` already mutated state, so that tick's flight events are dropped, `rng.ai` is not written back, and the throw repeats every tick while `frame()` keeps re-arming `requestAnimationFrame`. No plan in Phase 8 promised module-level exception containment (the plan text promises only that `ShipControl` ignores bad arguments without throwing and that unknown `aiKey` values are skipped, both implemented), and the sole registered module cannot throw, so this is not a Phase 8 failure. It should be decided before Phases 12, 13 and 22 add real AI to this seam: either contain inside `invoke` (retire the AI and count a repair) or wrap the `stepWorld` call in `try/finally`. The Phase 8 AI seam is labelled provisional in the roadmap until those phases exercise it.
2. **WR-02:** the unreachable `epoch` clauses in `begin` and `resume` are safe to delete; no effect on behaviour.

Scope notes, reported so the owner is not surprised (not defects):

- Browser/Vitest parity (criterion 5) is proven on an empty world: no populator exists, so in the browser the world holds no entity and the compared hash equals the flight hash. The spec guards against agreeing on the same wrong value by also asserting equality with `hashFlight` and the epoch, `worldLive` and tick values. A parity run with entities in the browser becomes possible only when Phase 12 adds a populator or a scenario-spawn tool. The replay in `tick-script.ts` is a mirror of the session's setup rather than the same code path; its header lists each mirrored source line so drift is diagnosable, and `tick-parity.test.ts` also runs the real driver against it.
- `populateNothing` is the populate function in both traffic modes, so the D-05 reading proven here is "the epoch and each fresh world's starting counter do not depend on the traffic flag". The forward note in `world-lifecycle.ts` (rule (iii)) hands the decision for a real populator to Phase 12.
- The two deferred flakes in `deferred-items.md` (D-2: `launch.spec.ts:129` hint, `save-load.spec.ts:634`) pre-exist the split and were measured as such in 08-06; D-1 (the two stale label assertions) was fixed in the phase, as shown in the `scene.spec.ts` and `docking.spec.ts` diffs.
- IN-03 (single-slot swap frame, test-only reachability) and IN-08 (a refused `begin` on a saturated epoch leaves the old world, about 4.29 billion launches) are low risk for Phase 8 and worth folding into the WR-01 follow-up.

---

_Verified: 2026-11-13_
_Verifier: Claude (gsd-verifier)_
