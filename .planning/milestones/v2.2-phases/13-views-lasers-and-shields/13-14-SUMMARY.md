---
phase: 13-views-lasers-and-shields
plan: 14
subsystem: test-hook/docs
tags: [combat, test-hook, probe, e2e-smoke, fidelity, key-decisions, validation, cbt-04, cbt-05, cbt-06, cbt-07, dock-10, input-01, found-17, verify-full-open]
status: complete
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-10 test pilot fire mode and the NPC fire queue; 13-11 ctx.core.combat, the hull table and NPC weapons in the live session; 13-12 the ident and combat HUD messages; 13-15 identTargetSnapshot; 13-16 the NPC catalogue with forward weapons"
provides:
  - "spawnTestShooter(world, player, record, tick): boolean (src/sim/ai/test-spawn.ts): one firing test pilot 1,500 m along the player's nose, nose toward the player, in its hold phase with the player as target"
  - "the ?test=1 hook member spawnTestShooter(): works only in flight with traffic content loaded, taints the session before it touches the world"
  - "probe.combat { view, fwdShield, aftShield, energy, laserTemp, cabinTemp, identLocked }: values and a lock flag, never an entity id"
  - "tests/e2e/combat.spec.ts: one opt-in smoke (?test=1&traffic=1&clock=manual) for the heat, shield and ident loop"
  - "FIDELITY rows E-36 to E-56 with verbatim excerpts at 7437f22, eight combat constants ledger rows and six open items"
  - "13 Key Decisions rows for the phase's remaining decisions"
  - "13-VALIDATION.md signed off honestly: automated evidence complete, verify-full open, owner items listed"
affects: [phase-13 verification, 14-npc-flight (CBT-15 reuses the hit rule), owner decisions D-03, D-04, OQ4, verify-full]
requirements-completed: [CBT-07, CBT-06, CBT-05, CBT-04, DOCK-10, INPUT-01, FOUND-17]
actuals:
  tokens: 33000
  tasks: 3
  commits: 4
plan_head_before: c4c6d8e455630d67d35bd92a82cf97b78698d65a
plan_head_after: 8977ef6e81d34be17fb938809c4fd6d0d67209d5
tech-stack:
  added: []
  patterns:
    - "A world-side test seam under src/sim/ai/ that lints under the sim zone, not the AI zone (one named eslint carve-out)"
    - "A probe group that publishes values read from simulation state and a boolean for anything id-shaped, so the entity-id guard stays unchanged"
key-files:
  created:
    - src/sim/ai/test-spawn.ts
    - tests/sim/ai/test-spawn.test.ts
    - tests/e2e/combat.spec.ts
  modified:
    - src/app/probe.ts
    - src/app/session/probe-publisher.ts
    - eslint.config.js
    - tests/app/probe-shape-compare.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/app/session/start-session.test.ts
    - tests/guards/ai-zone.test.ts
    - tests/fixtures/probe-shape.json
    - FIDELITY.md
    - .planning/PROJECT.md
    - .planning/phases/13-views-lasers-and-shields/13-VALIDATION.md
key-decisions:
  - "The shooter starts in its hold phase with the player as target instead of relying on a scan: a station or planet nearer than the player would win the scan and the shooter would fire at it."
  - "src/sim/ai/test-spawn.ts keeps the plan's path and gets one named eslint carve-out (sim-zone import bans, no AI allow-list) because spawning needs world/world.js and the flight state."
  - "probe.combat is state-determined (published whenever a combat state exists) and pinned in the six session states of the probe-shape fixture, with the new hook member in the two ?test=1 states."
  - "Thirteen Key Decisions rows written (twelve from the plan's list plus the player's energy floor at 0, which the damage-routing FIDELITY row diverges on). The statics row (OQ4) stays pending owner confirmation."
  - "verify-full was not run and is not marked passed: owner decision still pending."
coverage:
  - id: D1
    description: "The combat loop is observable end to end in the browser through one opt-in smoke and the test hook: holding A warms the fore laser, a scripted Viper placed 1,500 m ahead takes the forward shield below 128, R locks it with 'Ident system locked onto ...', no console error; the hook taints the session"
    requirement: CBT-07
    verification:
      - kind: e2e
        ref: "tests/e2e/combat.spec.ts#the fire key heats the laser, a test shooter drains the shield and R locks it"
        status: pass
      - kind: unit
        ref: "tests/sim/ai/test-spawn.test.ts"
        status: pass
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts#the spawnTestShooter hook (plan 13-14, T-13-27)"
        status: pass
    human_judgment: false
  - id: D2
    description: "probe.combat carries values and a lock flag and no entity id; the recorded probe shape pins it and the hook member"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts#probe.combat (plan 13-14)"
        status: pass
      - kind: unit
        ref: "tests/app/probe-shape-compare.test.ts#the recorded fixture after plan 13-14"
        status: pass
      - kind: e2e
        ref: "tests/e2e/probe-shape.spec.ts (7 states)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every ported combat mechanic has a FIDELITY row with a verbatim excerpt at the pinned commit, and every divergence quotes a PROJECT.md Key Decisions row"
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts (structure, and the verbatim case with OOLITE_SRC at 7437f22, not skipped)"
        status: pass
    human_judgment: false
  - id: D4
    description: "At least 90 % of the phase's new behavioural assertions are Vitest: 1,407 of 1,417 added expect() calls since 6652ae7 (0.993)"
    verification:
      - kind: other
        ref: "git diff 6652ae7 -- tests tools src ':!tests/e2e' | rg -c '^\\+.*expect\\(' = 1407; git diff 6652ae7 -- tests/e2e = 10"
        status: pass
    human_judgment: false
  - id: D5
    description: "The automated gates are green: full suite with coverage floors, assets drift check, verify (lint, typecheck, content drift, unit tests, build, 27 Chromium smoke specs), the combat and probe-shape specs"
    verification:
      - kind: command
        ref: "docker compose run --rm test (169 files, 3588 passed, 2 skipped)"
        status: pass
      - kind: command
        ref: "docker compose run --rm assets npm run assets:check (no differences)"
        status: pass
      - kind: command
        ref: "docker compose run --rm verify (exit 0, 27 Chromium specs passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "verify-full for the phase (render, input and persistence code changed): open, awaiting owner decision. Not run, not passed."
    verification: []
    human_judgment: true
    rationale: "AGENTS.md assigns verify-full to render, input and persistence changes; the owner has not confirmed a roughly 30-minute run on this slow machine for this phase, so the executor does not run it and does not claim it."
  - id: D7
    description: "Owner decisions D-03 (ident message names the ship only), D-04 (R while locked clears and re-acquires; U drops the lock) and OQ4 (stations and buoys are neither hit by a laser nor locked) are recorded as PENDING OWNER CONFIRMATION, not resolved"
    verification: []
    human_judgment: true
    rationale: "Advisor-recommended readings of Oolite that differ from the wording of CONTEXT D-03 and D-04, and a scope reading for the statics; only the owner can confirm or reverse them."
  - id: D8
    description: "WebGL visuals: the four views are not mirrored or clipped, the 1-pixel laser shot is visible, the ident frame sits on the ship; and the facing prompt on its own line at F3 renders as intended"
    verification:
      - kind: unit
        ref: "tests/render/launch-camera.test.ts, tests/render/laser-shots.test.ts, tests/hud/projection.test.ts, tests/ui/station-outfitting.test.ts"
        status: pass
    human_judgment: true
    rationale: "Covered by unit tests only (camera maths, shot buffers, projection, model text); no browser assertion exists for the rendered result, and the F3 facing prompt line break (CSS) is asserted nowhere. A human look is needed."
duration: about 85min
completed: 2026-11-15
---

# Phase 13 Plan 14: Test shooter hook, combat smoke, FIDELITY and phase sign-off Summary

**A `?test=1` hook now puts a firing Viper in the player's sights so shield loss is observable in the browser (one opt-in smoke: A heats the laser, the forward shield falls, R locks the ship), every ported combat mechanic has a FIDELITY row with a verbatim pinned excerpt, thirteen Key Decisions rows record the phase's remaining choices, and the validation is signed off with `verify-full` honestly open.**

## Performance

- **Duration:** about 85 min wall clock (the Docker gates dominate: the full suite twice at about 2.5 min, `verify` about 6 min, the browser specs about 1.5 min)
- **Tasks:** 3 of 3 (Task 1 is a tracer: its `<verify>` ran end to end and passed before Task 2)
- **Commits:** 4 (3 task commits and 1 fix)
- **Files:** 14 touched outside the summary (3 created, 11 modified; `FIDELITY.md` and `PROJECT.md` carry most of the lines)

## Accomplishments

- **Shooter seam (Task 1).** `spawnTestShooter` places one ship of the given record 1,500 m along the player's nose, turned half a turn about the player's up axis, with a test pilot created with `fire: true, holdRange: 2000` and already in its hold phase targeting the player. The hook member calls it with the Viper record and the live world; it needs a ship in flight, a live world and the loaded traffic content, taints the session through the one mutation point before touching the world, and otherwise returns false and changes nothing (taint included).
- **Probe.** `probe.combat` publishes the view, both shields, the energy banks, the current facing's laser temperature, the cabin temperature and `identLocked` (from `identTargetSnapshot`, so no id leaves the sim). The recorded probe shape gained the group in the six session states and the hook member in the two `?test=1` states.
- **Opt-in smoke.** `tests/e2e/combat.spec.ts` launches, holds A for 30 manual ticks (LT above 0), spawns the shooter, advances 360 ticks (forward shield below 128; the session reads tainted), presses R and waits for "Ident system locked onto" with a live lock, and asserts no console error. It follows traffic.spec's opt-in convention; the e2e bundle keeps traffic off by default.
- **FIDELITY (Task 2).** Rows E-36 to E-56 map the fire gates (heat, energy), shot cost, weapon cooling, the recharge gate, the three recharge passes, damage routing, overflow and cabin heat, cabin cooling, the docked reset, the two-stage laser hit, the octree leaf distance and visiting order, the laser frame, ident acquisition, the R and U keys, the laser purchase with trade-in, and the NPC energy recharge. Each has a Wegolite line, a verbatim excerpt of at most 20 lines at `7437f22` (the structure check and the verbatim check both pass; verbatim was not skipped), and every divergence quotes its Key Decisions row. Eight combat constants ledger rows and six open items were added.
- **Key Decisions (Task 2).** Thirteen rows, listed under Decisions Made.
- **Gates and sign-off (Task 3).** Full suite, assets drift check, `verify` and the two browser specs pass. The Vitest share is 1,407 / 1,417 = 0.993 (browser assertions: 8 in `combat.spec.ts`, 2 in changed existing specs). `13-VALIDATION.md` has every row green, the Wave 0 boxes ticked, `nyquist_compliant: true` and `wave_0_complete: true` (every task had an automated verify that passed), a Manual-Only table for what automation cannot judge, and `verify-full` recorded as open.

## Task Commits

1. **Task 1: Test shooter hook, probe combat fields and the opt-in combat smoke** - `3a4616a` (feat)
2. **Task 2: FIDELITY rows, combat ledger and the remaining Key Decisions** - `141ba3c` (docs)
3. **Task 3: Phase gates, Vitest ratio and validation sign-off** - `8977ef6` (docs), preceded by the guard-test fix `beca1d9` (fix)

## Files Created/Modified

- `src/sim/ai/test-spawn.ts` - `spawnTestShooter`, `TEST_SHOOTER_DISTANCE`, `TEST_SHOOTER_HOLD_RANGE`
- `src/app/probe.ts`, `src/app/session/probe-publisher.ts` - `WegoliteCombatProbe`, `probe.combat`, the hook member and its precondition checks
- `eslint.config.js` - `SIM_IMPORT_PATTERNS` extracted from the sim zone block and one block for `src/sim/ai/test-spawn.ts`
- `tests/sim/ai/test-spawn.test.ts` (8), `tests/app/session/probe-publisher.test.ts` (+8), `tests/app/probe-shape-compare.test.ts` (+3), `tests/guards/ai-zone.test.ts` (+1 positive control), `tests/app/session/start-session.test.ts` (guard regex)
- `tests/e2e/combat.spec.ts` - the opt-in smoke; `tests/fixtures/probe-shape.json` - the recorded shape
- `FIDELITY.md`, `.planning/PROJECT.md`, `.planning/phases/13-views-lasers-and-shields/13-VALIDATION.md`

## Decisions Made

PROJECT.md Key Decisions rows added (each names its plans and Reversibility where it applies):

1. Hold the player's combat state beside `FlightState`, outside the flight hash and outside the save. **The combat state is not saved: New game, Continue and Load all start with full shields (plan 13-11's recorded choice); a jump keeps the live object.**
2. Resolve combat damage in the same tick, after the world step, in ascending shooter id (A6).
3. Floor the player's energy at 0 until a death phase exists (added; the damage-routing FIDELITY row diverges on it).
4. NPC fire shares only the hit and damage rule with the player's laser (A7). **NPC fire has no recharge gate: only the test pilot's 15-tick think interval limits it (plan 13-10).**
5. Quantise the laser recharge gate to integer ticks and keep the strict `>`.
6. External cabin temperature is 0; sun and atmosphere heating stay out (D-05).
7. Statics are neither laser nor ident targets (OQ4, F10): **PENDING OWNER CONFIRMATION**.
8. Run the octree ray maths in float64 (A2). **Oolite's octree hit resolves at the parent cell of a solid leaf; the port keeps that faithfully (plan 13-03).**
9. The ident frame is a recorded non-element drawing; `HUD_ELEMENTS` stays eleven (D-03, D-07). **WebGL visuals are covered by unit tests only and need a human look (plan 13-13).**
10. World snapshot version 2 and one deliberate regeneration of the inert golden (plan 13-07; `flight-hash-pins.json` untouched).
11. Save v4 with the stock fore pulse as the value-neutral migration default (plan 13-06).
12. Load the hull artifact as nested-array JSON with the NPC catalogue, and measure the traffic-on cold start: 8,855,706 bytes beside 8,839,791, ceiling 9,437,184, headroom 581,478 (plan 13-11).
13. Do not emit an `energyLow` message this phase (A5).

The D-03 and D-04 rows written by plans 13-12 and 13-15 are unchanged and stay "PENDING OWNER CONFIRMATION"; nothing here claims an owner resolution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The AI lint zone refuses the shooter seam's imports**
- **Found during:** Task 1
- **Issue:** `src/sim/ai/test-spawn.ts` must import `spawnEntity` (`world/world.js`), `isScanClass` (`world/populate.js`) and the flight state, but every file directly under `src/sim/ai/` is held to the AI allow-list (AI siblings, `math`, `world/ids|view|control`). The plan fixes the path and does not list `eslint.config.js`.
- **Fix:** extracted the sim zone's import bans into one constant (`SIM_IMPORT_PATTERNS`, same patterns, same behaviour) and added one block for exactly `src/sim/ai/test-spawn.ts` that applies those bans plus the sim and module-state syntax bans instead of the AI allow-list. Nothing else under `src/sim/ai/` gains the exemption. `tests/guards/ai-zone.test.ts` lints the file as a positive control; the 106 existing guard probes still pass.
- **Files modified:** `eslint.config.js`, `tests/guards/ai-zone.test.ts`
- **Verification:** `docker compose run --rm lint`, `tests/guards`
- **Committed in:** `3a4616a`

**2. [Rule 2 - Missing critical functionality] The shooter must not depend on a scan to pick the player**
- **Found during:** Task 1
- **Issue:** a freshly created test pilot starts in `seek` and targets the nearest body of `view.scan`, which includes the station, the planet and the sun. Right after a launch the nearest body to a spawn point 1,500 m ahead can be the station, so the smoke would fire at the station and never drain the shield.
- **Fix:** `spawnTestShooter` sets the pilot's `phase` to `hold` and `targetId` to the player, as the existing `npc-fire` scenario does, so the first think fires at the player.
- **Files modified:** `src/sim/ai/test-spawn.ts`
- **Verification:** `tests/sim/ai/test-spawn.test.ts` (the params, and the shield drain through `stepSim`); the browser smoke
- **Committed in:** `3a4616a`

**3. [Rule 1 - Bug] A source-scan guard counted `probe.combat = ...` as a combat-state install point**
- **Found during:** Task 3 (full suite)
- **Issue:** `tests/app/session/start-session.test.ts` asserts that only `start-session.ts` and `save-controller.ts` contain `.combat = `; the new probe assignment in `probe-publisher.ts` matched.
- **Fix:** the regex excludes `probe.combat = ` (a publication of values, not an install). The guard's purpose (only two install points create a combat state) is unchanged.
- **Files modified:** `tests/app/session/start-session.test.ts`
- **Verification:** the file passes alone and in the full suite
- **Committed in:** `beca1d9`

### Other departures from the plan text

- **Extra files.** `tests/fixtures/probe-shape.json` (the plan asks for the fixture update but does not list it), `tests/app/session/probe-publisher.test.ts`, `tests/guards/ai-zone.test.ts`, `tests/app/session/start-session.test.ts` and `eslint.config.js` were modified beyond `files_modified`. The fixture was root-owned (a previous Docker write run), so it was regenerated by script and replaced through a rename in the directory I own, then formatted with Prettier; the diff is exactly the 56 added lines.
- **FIDELITY ranges.** Starting-point ranges were confirmed against the pinned file: the fire gate is two rows (`5460-5464`, `5478-5481`; the plan's 22-line range exceeds the 20-line cap), the recharge passes are three rows (`2581-2597`, `2603-2616`, `2619-2625`), damage routing is `5646-5662` plus the overflow and heat block `5666-5677`, cabin cooling is `2662-2672`, ident acquisition is `Universe.m:5689-5707`, the laser purchase is `PlayerEntity.m:9210-9217`, and the octree rows are `361-366` and `413-422`. Four rows beyond the plan's list were added (the laser frame, the R key, the U key, the NPC energy recharge) so that every mechanic this phase ported has one.
- **PROJECT.md.** One more Key Decisions row than the plan's list (the energy floor, row 3 above).
- **Wave 0 and the validation file.** The Manual-Only section was rewritten (it claimed every behaviour had automated verification, which the earlier summaries show is not true for the visuals and the F3 prompt line).

---

**Total deviations:** 3 auto-fixed (1 Rule 1, 1 Rule 2, 1 Rule 3) plus the departures above. **Impact:** no scope creep; the eslint carve-out is the only change to a guard configuration and is limited to one named file.

## Issues Encountered

- The first full-suite run failed one source-scan test (deviation 3); fixed and re-run green.
- `verify-full` was deliberately not run (see below); nothing else was skipped.

## verify-full: open, awaiting owner decision

AGENTS.md assigns `verify-full` to render, input and persistence changes, and this phase changed all three (13-13, 13-02, 13-06). The owner's decision on a roughly 30-minute run on this slow machine is still pending (recorded in `13-VALIDATION.md` "Gate decision"; no answer in STATE.md, the orchestrator's prompt or the validation file). The executor therefore did not run it. It is **not passed**; it is reported as an open item to the orchestrator. The evidence that stands in its place is `verify` (27 Chromium smoke specs) and the targeted `combat.spec.ts` and `probe-shape.spec.ts`, all green.

## Open items for the owner (none resolved here)

- **verify-full** for Phase 13: run it, or accept the `verify` evidence.
- **D-03** (ident message names the ship only), **D-04** (R while locked clears and re-acquires, U drops the lock) and **OQ4** (stations and buoys neither hit by a laser nor locked): all PENDING OWNER CONFIRMATION in PROJECT.md Key Decisions. The cost of each literal alternative is written in its row.
- **A human look** at the four views (not mirrored or clipped), the 1-pixel laser shot's visibility, the ident frame placement, and the F3 facing prompt on its own line.

## Facts carried from earlier plans

(a) 13-03: Oolite's octree hit resolves at the parent cell of a solid leaf (faithful port; FIDELITY E-49 and Open items). (b) 13-09: the facing prompt on its own line at F3 has no DOM or browser assertion (human_judgment; Manual-Only table). (c) 13-13: the WebGL visuals are covered by unit tests only and need a human look (Key Decisions row 9, Open items). (d) 13-11: the combat state is not saved, so New game, Continue and Load start with full shields (Key Decisions row 1). (e) 13-07: snapshot version 2 and the one golden regeneration (Key Decisions row 10). (f) 13-10: NPC fire has no recharge gate, only the test pilot's think interval (Key Decisions row 4).

## Known Stubs

None. The shooter seam is a deliberate test-only helper, never called by the populator.

## Threat Flags

None new. The `?test=1` hook mutation is T-13-27 (mitigated: the hook exists only under the flag and sets the taint before it mutates; `probe.combat` carries no id, T-13-28, pinned by `probe-publisher.test.ts` and the unchanged `entity-id-scope` guard).

## Next Phase Readiness

This is the last plan of Phase 13. The orchestrator runs the phase verification. The open items above are the owner's.

## Self-Check: PASSED

- Created files exist: `src/sim/ai/test-spawn.ts`, `tests/sim/ai/test-spawn.test.ts`, `tests/e2e/combat.spec.ts`, this summary.
- Commits exist on `main`: `3a4616a`, `141ba3c`, `beca1d9`, `8977ef6`.
- Acceptance: `rg -c spawnTestShooter src/app/probe.ts` is 4; `tests/e2e/combat.spec.ts` exists; `rg -c E-36 FIDELITY.md` is 3; the Vitest shooter cases and both browser specs pass; the fidelity contract passes in both modes; PROJECT.md holds the rows; `tests/compliance.test.ts` passes inside the full suite.
