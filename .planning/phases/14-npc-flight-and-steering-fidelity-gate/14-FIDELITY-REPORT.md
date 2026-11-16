# Phase 14 fidelity report: NPC flight and steering against their oracles

Plan 14-19, 2026-11-16. Covers AI-01, WORLD-07 and AI-11 (ROADMAP Phase 14, criteria 4 and 5).

**Status: awaiting the owner.** This report is evidence, not a decision. The owner accepts or rejects it and selects the oracle for the later AI port at plan 14-19's blocking checkpoint; nothing here, and no agent, has made that choice. The owner's decision is appended as an "Owner decision" section by plan 14-19, Task 4.

Every number below is copied from a plan summary, from `14-SPIKE.md` or from a run made in plan 14-19; the source is named beside it. Where a plan summary and a rerun disagree, the rerun is stated.

## Summary

- **Oracle fixtures:** 139 independent fixtures with 1,015 checks (13 files in two trees under `tests/oracles/npc/`) cover the flight model and all nine behaviours. The port passes every fixture through `tests/sim/npc/*.oracle.test.ts` with its scripted random draws consumed exactly. No oracle dispute: every fixture passed against the port as ported from the cited lines. One numeric-representation point (the exactly-abeam approach aspect, plan 14-14) needed a recorded snap.
- **Frame-rate rule:** recorded by the oracle before any rate fixture existed, 45 rows, one measured divergence (the tracking-curve gate, 1 tick). All 20 rate fixtures pass at 1/60 s and at 1/120 s.
- **20-seed acceptance run:** 21 of 21 cases pass against the thresholds committed before the port (`b33e72f`), with an empty accepted-crossings list, zero of every failure counter on all 20 seeds and every run minimum met. It was **accepted by an owner-delegated review panel, not by the owner reading the run** (see the acceptance section).
- **Cross-cadence and browser:** the world hash with three flyers across a launch is identical at 30, 60 and 144 Hz; in a real Chromium session the browser's world hash equals the Node replay's at tick 1,801 (remote snapshot `d8b4483`).
- **AI-11 spike:** positive (plan 14-04). The original `oolite-priorityai.js` and `oolite-shuttleAI.js` run unmodified in `node:vm` against a stub host and give deterministic traces.
- **Independence limit:** the oracle and the port read the same Oolite source, so a shared misreading would pass every fixture.
- **Vitest share:** 1,969 added `expect(` lines in Vitest files against 21 in browser specs, 0.9894 (criterion 5, at least 0.90).
- **Open items the owner should know about:** WINDOWS.md entry 3 (a vacuous assertion in a frozen detector test), five residual risks of the acceptance run, the recorded divergences that shape what a green result means, and the unported accuracy 9 dodge. See "Open items".

## Scope of the claim

What this report says: the native steering code reproduces Oolite's flight model and nine steering behaviours **as the committed fixtures state them**, and a scripted 12-ship world flies for 150 simulated seconds on 20 seeds without a detector firing. What it does not say: that the port equals Oolite in every case. The oracle is source-cited maths and hand-checked closed forms, not a run of Oolite. The independence limit and the acceptance residual below bound the claim.

## Per-behaviour results against the oracle

Fixture counts, checks and tolerances were measured from the fixture files at this plan's HEAD (a script over `tests/oracles/npc/**/*.json`). "Exact" is the number of checks with tolerance 0 (discrete fields, ticks and events). Tolerances otherwise run from 1e-9 up to the stated maximum; each was set by the oracle's own float32-versus-float64 measurement (plan 14-01 rule: 4 x max(|f32 - f64|, |f32 - closed form|) + 1e-9, rounded up), never widened to make a row pass. The port's test file reads each fixture, replays it through `steerShip` and a synthetic `WorldView`, and a failed check fails the test, so a passing file means every listed check passed. Horizons are in ticks at dt 1/120 unless noted.

| Behaviour | Fixture group (fixtures / checks / exact) | Tolerance maximum | Horizons (ticks) | Port test file (tests) | Disputes | Divergences (Key Decisions row "Phase 14 recorded divergences from Oolite", item) |
|---|---|---|---|---|---|---|
| Flight model | `flight-model.json` (12 / 141 / 0) | 1.3e-3 | 2 to 480 | `flight.oracle.test.ts` (21, shared with idle and tumble) | none | float64 rates (15); fallback thrust ramp for TRACK_AS_TURRET and ENERGY_BOMB_COUNTDOWN (16); yaw not modelled (scope row) |
| Idle (with STOP_STILL) | `idle.json` (3 / 38 / 2) | 1.6e-4 | 120 | `flight.oracle.test.ts` | none | none beyond the flight model |
| Tumble | `tumble.json` (2 / 43 / 4), 4 scripted draws | 5.8e-6 | 150 to 200 | `flight.oracle.test.ts` | none | deferred entry draws (2) |
| Fly to destination (range dispatcher, to, from) | `fly-to-destination.json` (9 / 154 / 15), 6 events; `rate-rule.json` (20 / 120 / 0) at 1/60 and 1/120 | 1.7e-3; 8.0e-6 | 150 to 2,300; 360 to 720 | `navigation.oracle.test.ts` (16), `rate-rule.oracle.test.ts` (26) | none | frustration floor at 0 (19); `d_forward` clamp (12); `shipAIFrustrated` without the behaviour name (4); docking branches not ported (scope) |
| Face destination | `face-destination.json` (6 / 73 / 16), 6 events | 2.8e-6 | 5 to 905 | `navigation.oracle.test.ts` | none | as fly to destination |
| Intercept | `intercept.json` (9 / 45 / 18), 10 events, aim point checked at ticks 0, 90, 119, 120, 121 and 180 | 1.0e-3 | 1 to 180 | `pursuit.oracle.test.ts` (22, shared with flee) | none | tracking-curve gate fixed at 60 ticks (14); defensive curve start (12); `shipTargetAcquired` not posted (5) |
| Flee (and EVASIVE_ACTION, FLEE_EVASIVE_ACTION) | `flee.json` (10 / 58 / 24), 10 scripted draws; evasive rows also in `attack-evade.json` | 1.0e-3 | 1 to 1,802 | `pursuit.oracle.test.ts`, `attack.oracle.test.ts` | none | performFlee aspect and jink draws one update late (3) |
| Attack (dispatcher, fly to and from, six, twelve, sniper, break-off, slow dogfight) | `attack-dispatch.json` (22 / 92 / 49), `attack-close.json` (15 / 69 / 28), `attack-evade.json` (23 / 78 / 46) | 1.0e-3 | 1 to 61 | `attack.oracle.test.ts` (62: the 60 fixtures plus the manifest and the no-fire guard) | none; the exactly-abeam aspect is a representation point, recorded as item 20 | aspect snap 1e-12 (20); weapon range 0 for no weapon (6); accuracy 9 dodge of fly-to not ported (21); float literal factors as doubles (15) |
| Escort | `escort.json` (3 / 47 / 8), 1 event | 2.5e-4 | 240 to 1,802 | `avoid-escort.oracle.test.ts` (9, shared with avoid) | none | fixed escort slots, inert leaders refresh nobody, follower-before-leader order, owner equal to self (7) |
| Avoid collision (proximity zone and pair trigger) | `avoid-collision.json` (5 / 57 / 36) | 1.7e-9 | 300 to 1,520 | `avoid-escort.oracle.test.ts` | none | no collision-chain prefilter, ascending-id order, crew gate, inert ships hold no alert (8, 9, 10) |
| **Total** | **139 fixtures, 1,015 checks, 246 exact** | | | | | |

How the fixtures are covered by the port: `tests/sim/npc/oracle-coverage.test.ts` (30 tests) compares the static manifest `oracle-groups.ts` with the fixture files on disk, the oracle test files and the routing table, so a fixture without a test file, a test file without a manifest row, or an in-scope behaviour id that does not route to its own behaviour fails the suite; only the out-of-scope ids take the idle fallback.

The port's own hand-derived unit tests (written before the oracle was opened, plans 14-09 to 14-15) add `flight.test.ts` 18, `track.test.ts` 37, `target.test.ts` 42, `tracking-curve.test.ts` 16, `avoid.test.ts` 29, `flee.test.ts` 25, `evasive.test.ts` 12, `attack-dispatch.test.ts` 66, `attack-close.test.ts` 42, `attack-evade.test.ts` 25, `proximity.test.ts` 40 and `escort-refresh.test.ts` 27 tests, plus `constants.test.ts` 141 and the totality property `steering.property.test.ts` 41. The run at this plan's HEAD (`tests/sim/npc`, `tests/acceptance`, `tests/oracles`, `tests/guards`) passed 36 files, 1,270 tests.

Non-vacuity: every port plan ran deliberate one-line mutations (a roll sign, the speed clamp, the `d_forward` clamp, the damping branch, the jink z sign, the aspect threshold 0.9995, `PROXIMITY_WARN_DISTANCE2` 16 to 9, `NO_WEAPON_RANGE` 32000 and others), each failed the tests it should, and each was reverted.

### Oracle disputes and how they were settled

- **None between oracle and port.** In plans 14-09 to 14-15 every fixture of every group passed at its first run against code ported from the cited lines.
- **Exactly-abeam approach aspect (plan 14-14).** Two oracle rows (`attack-dispatch-accuracy-below-0-aspect-exactly-0-twelve` and `attack-slow-dogfight-abeam-slows-to-a-tenth`) need an aspect of exactly 0 from opposite sides of a comparison; a quaternion quarter turn leaves about 2.2e-16 whose sign depends on rounding, so no single sign passes both. Settled by `ASPECT_ZERO_SNAP` = 1e-12 in `approachAspectToPrimaryTarget`, recorded as a divergence. An owner who prefers no snap would have to accept one of the two rows failing. The plan 14-14 summary calls this "61 of 62 fixtures at the first run"; the file holds 60 fixtures and the test file 62 tests, so the figure is tests, not fixtures.
- **Fixture corrections before commit** (not disputes): plan 14-01 corrected a stationary-pose frustration row, two position checks of a decelerating pitching ship, and the frustration after the face settle (dt, not 0); plan 14-06 corrected exact-abeam and exact-zero-elevation grid poses and the unexpressible `maxFlightSpeed` 0 (a 1e-6 stand-in; plan 14-02 hit the same contract limit and used desired speed 0).
- **Contract limits found while writing fixtures:** a ship that must not move cannot have `maxFlightSpeed` 0 (the contract requires it positive); the attack-fly-to accuracy 9 dodge needs a target's weapon type, which a fixture body does not carry, so no fixture reaches it (plan 14-02).

### Coverage the oracle does not give (stated plainly)

- The evasive hand-over (EVASIVE_ACTION to ATTACK_TARGET and FLEE_EVASIVE_ACTION to FLEE_TARGET after 0.5 s, the alert check and the roll-agreement window) is covered by hand-derived unit tests and mutation runs only: both oracle evasive fixtures have a horizon of one tick (plan 14-13). The live flyers scenario never takes the evasive branch either (plan 14-16); the 20 seeds exercise it where an evasive draw happens, but no per-seed counter says how often.
- The avoid-collision oracle fixtures carry no primary target, so the tracking-curve restart on resume (`ShipEntity.m:5946`) is covered by unit tests, not by the oracle (plan 14-06).
- Multi-ship interaction is covered by the world cases of plan 14-15 and by the acceptance run, not by the single-ship oracle fixtures.

## Frame-rate rule outcome (plans 14-06 and 14-10)

- `tests/oracles/npc/frame-rate-rule.json` holds the rule text, `crossDtTolerance` 0.01 rad (committed first, in `ae0f4c9`, before any rate fixture existed and never touched) and 45 audited rows: 7 rate-times-dt, 2 dt-limiter, 10 accumulator, 5 time-compare, 4 draw, 4 one-shot, 13 out-of-scope. Every non-out-of-scope row is confirmed by fixture ids that exist in the two trees, and `rate-rule.oracle.test.ts` checks the rows of the ported functions against the static manifest and the test files on disk.
- **Confirmed:** a ten-pose grid at 1/60 and 1/120 settles to within 0.002777 rad (pose `up-45`), then 0.001504, 0.001449, 0.001174 and 0.001013; the other five are below 0.00075. All 20 `rate-` fixtures pass through the port at their own step size.
- **Accumulators** fire at the float32-derived ticks (61, 360, 901, 1,126, 1,201, 1,801), never at `ceil(seconds x 120)`.
- **Measured divergence (one):** the tracking-curve sampling gate (`ShipEntity.m:5444-5449`), `measuredDifference` 1 tick. Oolite's `universal_time` is a double sum, so the gate opens after 60 steps from a base of 0 and after 61 from a base of 1000.0 or 12345.678; the port's fixed 60 is one of Oolite's two values.
- **Recorded, not a divergence:** the `trackDestination` overshoot limiter never binds at 1/120 s for `max_flight_roll` or `max_flight_pitch` below 3.84, which holds for all nine in-scope ships; its one 1/60 s effect leaves a settled difference of 0.000439 rad.
- Oolite's `delta_t` is the measured frame interval (capped at 0.25 s), so no single fixed-step conversion is exact; this is why the rule is stated with a tolerance.

## 20-seed acceptance (plan 14-17), against thresholds committed before the port

Thresholds are `tests/acceptance/thresholds.ts`, the single commit `b33e72f` (plan 14-07). The harness (`detectors.ts`, `detectors.test.ts`, `npc-flight.acceptance.ts`) is the single commit `ab7343b`. The run is `npm run test:acceptance`, outside `verify` and `verify-full`.

**Result (plan 14-17's final run at `ab7343b`): 21 of 21 cases passed** (epochs 1 to 20 and the run-minimums case), 137.6 s of the 30-minute budget (7.6 %), each epoch 6.7 to 7.3 s against the 300 s per-epoch timeout.

| Criterion | Threshold | Result over the 20 seeds |
|---|---|---|
| Stuck windows (3,600-tick windows, progress below 1 % of the start or 1 m) | 0 | 0 on every seed (175 windows evaluated) |
| Frozen windows (path under 100 m at desired speed 10 m/s or more) | 0 | 0 on every seed (294 windows evaluated) |
| `shipAIFrustrated` while a goal is unmet | 0 | 0 |
| Entries into the station's 500 m sphere | 0 | 0; minimum clearance recorded by the harness 1,994.67 m (epochs 1, 12, 17, 19, 20) |
| Hull crossings not excused by `accepted-crossings.ts` | 0 | 0 episodes, 0 unexcused; minimum hull clearance 41.41 m (epoch 10) |
| Repairs, AI faults, AI drops, `hashWorld` failures | 0 each | 0 each |

| Run minimum (sum over 20 seeds) | Floor | Measured |
|---|---|---|
| Station arrivals / intercept arrivals / flee arrivals | 20 / 20 / 20 | 40 / 40 / 40 |
| AVOID_COLLISION entries | 20 | 23 (2 on epochs 10, 18 and 20, 1 elsewhere) |
| Attack ticks within 1,000 m of the player | 5,500 | 61,662 |
| Stuck windows evaluated | 60 | 175 |
| Frozen windows evaluated | 40 | 294 |

**Accepted crossings, as committed:** `tests/acceptance/accepted-crossings.ts` is empty. No episode was accepted, so no class and no owner's reason exist to list.

**Who accepted the run, stated honestly.** Plan 14-17's checkpoint answer (option-continue, 2026-11-16) was given by **a review panel on the owner's delegation, not by the owner reading the run**. Three independent reviewers (Fable, Opus, Sonnet) read the harness and each returned TRUST-WITH-CAVEATS; none found a vacuous detector or a weakened threshold. The run was green with nothing to accept, so none of the escalation options (a), (b) or (c) was used, and no harness or port file was changed. This plan's gate is the owner's own look at the result and should be read with the caveats below.

**Acceptance residual (stated by plan 14-07, repeated by plan 14-17).** The run places no flyer on a collision course, so a zero crossing count is evidence about a designed near pass inside the alert band (index 1 passes the parked index 11 at 83 m), attack passes to the nearby range and arrivals at the station's script range, **not about head-on closure**. Head-on closure is covered by the oracle avoid-collision fixtures (plan 14-06) and the world cases of plan 14-15. All 20 seeds fly near-identical geometry (the system layout is epoch-independent and the start placement overrides every position); an epoch changes only which record each slot draws and each ship's random streams. Seed spread is therefore narrow.

**Residual risks recorded by the panel, not repaired (the harness and thresholds are frozen):**

1. `avoidCollisionEntries` is a run-wide sum (23 against 20) that does not name the flyer; the per-seed lines show at least 1 on every seed, which is the only per-seed evidence.
2. Zero station-sphere entries and zero hull crossings are close to certain by design (station flyers stop at 2,500 m; the near pass stays about 83 m apart); `thresholds.ts` accepts this residual.
3. `tests/acceptance/detectors.test.ts:164-177` ("uses the collision radius for stage A") asserts only `typeof result === "boolean"` and is vacuous. Changing it needs the owner's option (c) and a commit with the `Detector-change-approved-by-owner` trailer. It is recorded as an open `deviation` entry (number 3) in `.planning/WINDOWS.md`, which blocks `/gsd-ship` until the owner resolves or waives it.
4. Frustration is covered in two halves only (pilot counter and observer); no live case forces a stall. The harness also silently skips a body with no hull-table entry; all ten spec keys are present today.
5. The frozen-path sum omits the first-tick segment (marginally stricter), and no `PlayerCombatState` is passed (the player is never shot at; no threshold depends on it).

### The freeze check and exact-content gate at this plan's HEAD

Run at plan 14-19's HEAD (after the Task 1 commit `2796702`), the plan's own command: `thresholds.ts` has exactly 1 commit; the three harness files have 1 commit and 0 trailer commits; `flight-script.ts` and `test-spawn.ts` have 0 commits since `ab7343b`; no frozen file or `accepted-crossings.ts` has an uncommitted edit; `npc-flight.acceptance.ts` equals the ten pinned lines byte for byte (`cmp`). **Result: pass.** No frozen file was touched by this plan.

### The acceptance rerun at this plan's HEAD: skipped, by the plan's stated rule

`git diff 2fdabbb HEAD` (plan 14-17's summary commit) over `src/sim`, `src/content/generated`, `tests/acceptance`, `vitest.acceptance.config.ts`, `tests/helpers/traffic-fixture.ts`, `hull-table.ts`, `npc-flight.ts`, `npc-weapons.ts` and `lave.ts` is empty, so the rerun was skipped and the run of plan 14-17 (21 passed at `ab7343b`) is cited. Context the owner may want: plan 14-18 changed `src/app/session/*`, `src/app/probe.ts` and `tests/helpers/tick-script.ts` after that run; the acceptance harness imports only `src/sim` and the listed helpers, never `src/app` or `tick-script.ts`, so the rule's list is sufficient.

## Cross-cadence and browser results

- **30, 60 and 144 Hz (plan 14-16, `npc-cadence.test.ts`):** with the three flyers spawned 90 ticks after a launch and 2,400 ticks flown, the tick-indexed `hashWorld` log, the launch, spawn and end ticks and the flyers' final poses and phases are identical at all three cadences, and every flyer moved. The acceptance run additionally hashes the world on every tick of every seed.
- **Browser smoke (plan 14-18, `tests/e2e/npc-flight.spec.ts`, remote Chromium, snapshot `d8b4483`, passed, and passed again inside `verify-full`):** `spawnTestFlyers()` on the `?test=1` hook taints the session first, then the three flyers appear on the scanner; 1,200 ticks later the scanner count equals the Node HUD model's, the browser world hash equals the Node replay's at tick 1,801 with 15 entities (`d11fee94`; `09c03072` at the spawn step), the Shuttle is closer to the station (3,300.2 m to 2,591.7 m), the Viper closer to the player (2,892.2 m to 728.9 m) and the Adder farther (2,898.3 m to 3,476.0 m), draw calls are within the budget of 50 once the models loaded, and there is no console error. The draw-call check is weak evidence on its own (about 17 calls loaded); the hash equality carries the proof.
- **Remote gates at `d8b4483`:** `verify` 27 browser specs passed, exit 0, 140 s; `verify-full` 203 unit files and 134 + 2 e2e passed, exit 0, 563 s; the targeted `npc-flight`, `combat` and `traffic` specs 5 passed, 51 s.
- **Remote `verify` at this plan's HEAD:** exit 0 at snapshot `7fbd649` (see "Gates run in plan 14-19" below).

## The AI-11 spike (plan 14-04, `14-SPIKE.md`)

- **Outcome: positive.** The original `Resources/Scripts/oolite-priorityai.js` (6,838 lines) and `Resources/AIs/oolite-shuttleAI.js` (99 lines) of the pinned tree run unmodified in separate `node:vm` contexts, construct a `PriorityAIController` through `aiStarted`, wake on the engine's own `AIScriptWakeTime` and `aiAwoken` protocol (strict `>`, `ShipEntity.m:2480`) and produce deterministic ordered traces over three fixtures (calm 9 entries, hostile 7, reconsider timing 50), identical across two runs with the same draw counts.
- **Host inventory:** 40 distinct read members, 4 calls (`findNearestStation`, `checkCourseToDestination`, `performFlyToRangeFromDestination`, `performFlee`) and 4 writes; one member was missing on the first run (`hostile.isWormhole`) and was added. **Stub size:** `host.ts` 533 non-blank lines, `load.ts` 116, `spike.test.ts` 339 (11 cases).
- **Timeout coverage:** every entry into Oolite code goes through `runInContext` with `timeout: 2000`, asserted per context; a runaway loop in either context is terminated. Latent gap: a host-held `Timer` callback (two sites in the library, not reached) would have to be run through a `runInContext` wrapper.
- **Time used:** about 15 minutes of wall clock; the one-session box did not run out. Without `OOLITE_SRC` the run is `3 passed, 8 skipped`; mounted, `11 passed`.
- **Feasibility for AI-07:** feasible, with the risks the spike lists: stub growth (roughly one stub member per new branch reached), closure-held timers, the clock (the port must compare the written wake time, not the frame it landed on), random draw order and count, live shared objects, and input availability. Estimate for the rest: one stub-host session per further role AI (trader, pirate, police, hunter), one for the Timer-callback path and one for a comparison driver; confidence low, since only one role AI was reached.
- **Dist absence (AI-11's second half):** `npm run check:dist` (plan 14-07) scans the built bundle for three markers (the harness sentinel, `PriorityAIController`, `oolite-libPriorityAI`; source maps skipped; exit 2 on a missing or empty `dist`), runs in `verify`, `verify-full` and the Pages build, and found no marker in 106 shipped files; `tests/guards/harness-isolation.test.ts` keeps `tools/ai-harness` out of `src/`, `public/`, `index.html` and every root Vite config.
- **Input question for AI-07 (the owner's answer is recorded in Task 4):** keep reading Oolite's scripts from the local `OOLITE_SRC` mount (the differential harness then runs on a machine with the checkout only; its 8 Oolite-running cases skip on the remote machine and in CI), or vendor `Resources/Scripts/*.js` and `Resources/AIs/*.js` through a human-run `scripts/vendor-oolite.sh` bump with `ASSETS.md` and `CHECKSUMS.sha256` rows, which the harness needs to run in CI (the two files used total 6,937 lines; the directories are larger, and an agent must not fetch them). The spike's and this plan's recommendation: keep the mount until the priority-AI phase is planned, and decide vendoring then.

## The independence limit

The oracle trees (plans 14-01, 14-02, 14-06) and the port (plans 14-09 to 14-15) were written by separate agents from the same pinned Oolite source (`7437f22`). The oracle author never read `src/sim/npc`; the porter opened an oracle fixture only after the port's own hand-derived unit tests passed; `tests/guards/oracle-independence.test.ts` refuses any import or file read of `src` from `tests/oracles`. These are process rules (only the import and file-read scan is mechanical). Consequently **a misreading of an Oolite line that both readers share is not caught by any fixture**; the oracle is source-cited maths, not a run of Oolite. What does reduce that risk: every fixture states its derivation and its Oolite citation, closed forms were re-derived in the generator and again in the self-test, and a float32 emulation mode cross-checked the float64 reference. The AI-07 differential harness, which runs Oolite's own JavaScript, would be the first check that does not share the source reading for the decision layer; Oolite's Objective-C steering still has no runtime check.

## Recorded divergences and scope cuts

The full numbered list is the PROJECT.md Key Decisions row "Phase 14 recorded divergences from Oolite" (22 items, each with its plan); FIDELITY.md quotes it from every divergence cell of E-57 to E-70. Those that change what a green result means:

- **Lazy accuracy draw and deferred perform entries** (14-09, 14-13, 14-14): draw order differs from Oolite's, and performFlee reads the approach aspect one update late.
- **No collision-chain prefilter in the proximity pass** (14-01, 14-06, 14-15): can raise an alert Oolite's `+-2 x radius` interval filter would skip, for unequal radii far from the planet; no acceptance pair is affected.
- **Inert ships hold no alert; every ship is crewed; escort slots fixed** (14-15).
- **Aspect snap, frustration floors at 0, `d_forward` clamp** (14-14, 14-10): Wegolite additions that keep the steering record inside its domain; each has a forcing test.
- **Accuracy 9 dodge of attack fly-to not ported** (14-14): needs the target's weapon types, which `BodyView` does not carry; stock accuracy is below 5, so it needs a forged accuracy.
- **float64 for every GLfloat field except `frustration` and `successFactor`** (14-09).
- **NPC render poses are not interpolated** (RESEARCH A7).

Scope cuts (PROJECT.md row "Phase 14 NPC steering scope"): afterburner and `has_fuel_injection`, missiles, cloaking, turret, broadside and running-defense branches, no weapon fire from steering, no sun glare, Newtonian velocity, yaw, docking branches, the player never targeting an NPC, all nine ships crewed, and every other behaviour id running the idle fallback. In normal play ships are still inert: only a `?test=1` session can give them an AI (WORLD-07's flying NPCs are shown through the test hook, not in normal play; the populator never attaches a pilot).

## Criterion 5: the share of Vitest assertions

Measured at this plan's HEAD:

- `git diff 86c4236 -- tests tools src ':!tests/e2e' | rg -c '^\+.*expect\('` = **1,969** (Vitest and tool tests)
- `git diff 86c4236 -- tests/e2e | rg -c '^\+.*expect\('` = **21** (the one new browser spec, `npc-flight.spec.ts`)
- Share = 1,969 / (1,969 + 21) = **0.9894**, at least 0.90.

This counts added diff lines containing `expect(`, a count of written assertions, not of assertions executed. The Vitest side includes the oracle self-tests (`reference.self.test.ts`, `pursuit.self.test.ts`) and the detector tests, which are many and mostly parameterised, so the share is met easily and says little on its own. The baseline `86c4236` is the phase's own pattern-map commit, so the diff holds Phase 14's changes only.

## Gates run in plan 14-19

| Gate | Result |
|---|---|
| `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` (unmounted) | 8 passed, 1 skipped (the verbatim case) |
| Same with a freshly re-created pinned tree mounted (`OOLITE_SRC`) | 9 passed, none skipped: all 14 new excerpts are verbatim at their cited lines |
| `tests/sim/npc`, `tests/acceptance`, `tests/oracles`, `tests/guards` | 36 files, 1,270 tests passed (93 s) |
| Freeze check and exact-content gate | pass (above) |
| Acceptance rerun | skipped by the stated rule (above) |
| `docker compose run --rm test` (full, with the `src/sim` coverage floors) | exit 0; 203 files, 4,997 tests passed, 10 skipped (`npm run test:fast` count, 118 s) |
| `docker compose run --rm lint` (eslint and prettier) | exit 0 |
| `docker compose run --rm typecheck` (both projects) | exit 0 |
| `docker compose run --rm assets npm run assets:check` | exit 0, "no differences" |
| Remote `verify` (`wegolite-remote-run.sh run --rm verify`) at snapshot `7fbd649`, the committed HEAD with the report | exit 0, 143 s: 203 unit files, 4,997 tests passed, 10 skipped; `assets:check` no differences; `check:dist` 106 files scanned, no AI harness marker; 27 Chromium specs passed. The commit after it changes `.planning` documents only |
| The AI-11 spike at this HEAD, pinned tree mounted (`OOLITE_SRC`) | `tools/ai-harness` and `harness-isolation.test.ts`: 3 files, 33 tests passed (the spike 11, none skipped). Unmounted: 18 passed, 8 skipped |

### Remote verify runs across the phase (for the record)

The plan calls plan 14-19's `verify` "the phase's single remote verify besides plan 14-07's own". In practice more were run, each on a plan that made a browser-visible change: plan 14-07 at `d1e7f83` (206 s), plan 14-11 at `f6433ac` (a test shooter now ramps from rest), plan 14-12 at `3538e89`, plan 14-15 at `00a04dd` (a per-tick pass over all ships), plan 14-16 at `4fb6a5f` and plan 14-18 at `d8b4483` (`verify` and `verify-full`). All passed with exit 0 and 27 Chromium specs for `verify`. Plan 14-19's own `verify` is the last. `verify-full` last ran at `d8b4483` (203 unit files, 134 + 2 e2e, 563 s, exit 0); no `src/` or test file changed after it (only documents), so it does not need a rerun unless the owner asks.

## Coverage of `src/sim/**`

From the full run of plan 14-19 (`test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`): lines 97.96 %, statements 97.06 %, functions 99.46 %, branches 94.84 %, against the floors 93, 91, 97 and 86 (plan 14-16's figures were 97.78, 96.89, 99.46 and 94.43).

## Open items

1. **WINDOWS.md entry 3** (the vacuous stage-A assertion in a frozen detector test): needs the owner's option (c) and the trailer commit, or a waiver. It blocks `/gsd-ship` while open.
2. **IN-02 and IN-04** (an `aiFaulted` that nothing records; a failed NPC model never retried) were not folded in; no consumer in this phase. They stay todos unless the owner says otherwise.
3. **The five acceptance residual risks** and the acceptance residual (no head-on closure; near-identical geometry), above.
4. **The oracle coverage gaps** listed above (evasive hand-over, the curve restart on resume, multi-ship interaction).
5. **Requirements are not yet marked complete.** AI-01, WORLD-07 and AI-11 stay pending in `REQUIREMENTS.md` until the owner accepts this report (plan 14-19, Task 4). Plan 14-18's summary lists WORLD-07 as completed by that plan; `REQUIREMENTS.md` still says Pending, and the report's acceptance decides it.
6. **The oracle choice for AI-07** and the mount-or-vendor question are the owner's (plan 14-19, Task 3).
