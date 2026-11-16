---
phase: 13-views-lasers-and-shields
plan: 11
subsystem: app/session
tags: [combat, session-wiring, hull-chunk, lazy-load, tick-parity, probe-hash, cold-start-budget]
status: complete
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-10 resolveShots/NpcWeapon/CombatOptions.npcWeapons; 13-09 PlayerProfile.laserMounts and the F3 laser fit; 13-04 loadShipHulls and ShipHullCatalogue; 13-08 stepSim ninth argument"
provides:
  - "SessionCore.combat (PlayerCombatState | undefined) and SessionCore.hulls (HullTable | undefined)"
  - "start-session: loadShipHulls() in the boot Promise.all beside loadNpcCatalogue(), traffic on only, same visible boot-failure surface; a pristine combat state beside every installed flight state; both cleared on dispose"
  - "traffic.ts: TrafficContent.weapons (spec key to NpcWeapon) and hullTable(catalogue), shared by the session and the Node replay"
  - "step-options.ts: StepOptionsInput.laserMounts (required), hulls? and npcWeapons?; buildStepOptions always emits combat: { mounts, hulls?, npcWeapons? }"
  - "sim-driver: laserMounts from ctx.core.profile, hulls and npc weapons when present, ctx.core.combat as stepSim's ninth argument"
  - "save-controller: a fresh pristine combat state with every Load; probe-publisher: worldHash hashes with ctx.core.combat"
  - "tests/helpers/tick-script.ts: the Node replay creates the combat state, passes mounts/hulls/NPC weapons, steps and hashes with combat; TickStep.fire and TickScriptOptions.laserMounts"
  - "src/content/types.ts: type-only export of ShipHull and ShipHullCatalogue"
affects: [13-12, 13-13, 13-15, 13-14]
requirements-completed: [CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10]
actuals:
  tokens: 28000
  tasks: 2
  commits: 2
plan_head_before: 5deecfa19cdc5468171a153e481a08471e4b77cf
plan_head_after: eb1bb3319e18879c3b34bd838f86f1ddf884cab4
duration: 25min
completed: 2026-11-15
tech-stack:
  added: []
  patterns:
    - "Combat facts reach the step only as read-only options (mounts from the validated profile, hull table and NPC weapons from static content); the combat state is session state beside, never inside, the flight state"
    - "A lazy content chunk joins the boot Promise.all behind the same flag as the catalogue it serves, so it shares one visible failure surface and a flag-off session never fetches it"
    - "startSession has no Node harness: its boot wiring is pinned as ordered source facts, and the browser specs prove the load end to end"
key-files:
  created: []
  modified:
    - src/app/session/context.ts
    - src/app/session/start-session.ts
    - src/app/session/sim-driver.ts
    - src/app/session/step-options.ts
    - src/app/session/traffic.ts
    - src/app/session/save-controller.ts
    - src/app/session/probe-publisher.ts
    - src/content/types.ts
    - tests/helpers/tick-script.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/start-session.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/app/session/save-controller.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/app/session/traffic-variants.test.ts
    - tests/content/ships-hulls.test.ts
    - tests/e2e/traffic.spec.ts
    - tests/e2e/budget.spec.ts
key-decisions:
  - "The combat state is not saved: a Load, a Continue and a new game all start with a pristine combat state (full shields, cool lasers, view fore, ident off). A hyperspace jump keeps the one live object, so shields and energy carry over. This is the recorded choice plan 13-14 writes into Key Decisions."
  - "The hull table and the NPC weapon map exist only with traffic on (one flag gates the NPC catalogue and the hull chunk). With traffic off the player's shot is drawn but hits nothing, and nothing in the world could be hit anyway."
  - "The hull type is exported through the type-only door src/content/types.ts, so traffic.ts (which must stay Node-importable and may only value-import from src/sim) builds the hull table without naming the loader module."
  - "Measured traffic-on cold start: 8,855,706 bytes, below the 9,437,184-byte ceiling (D11); traffic off: 8,845,540 bytes."
coverage:
  - id: D1
    description: "In the live session the sim receives the combat state, the profile's mounts, the hull table and the NPC weapon map each step: holding fire in flight fires the mounted laser (heats its facing, laserFired through the router), the profile's mounts decide which facing fires, and a shot hits a Viper ahead through the loaded hulls"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#combat wiring (plan 13-11, CBT-04 to CBT-07)"
        status: pass
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#buildStepOptions"
        status: pass
    human_judgment: false
  - id: D2
    description: "The hull data loads with the NPC catalogue in the same boot Promise.all, only with traffic on, as a separate lazy chunk; a traffic-off session never fetches it; a load failure joins the boot-failure surface"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/app/session/start-session.test.ts#combat and hull wiring at start-up (plan 13-11)"
        status: pass
      - kind: unit
        ref: "tests/content/ships-hulls.test.ts#boot-path isolation"
        status: pass
      - kind: e2e
        ref: "tests/e2e/traffic.spec.ts#a traffic-on cold start requests no NPC model before the first in-flight frame"
        status: pass
      - kind: e2e
        ref: "tests/e2e/budget.spec.ts#a cold start to the first in-flight frame stays under the first-load bytes ceiling"
        status: pass
    human_judgment: false
  - id: D3
    description: "A new game, a Continue and a Load start with a pristine combat state, whatever the replaced session had; the combat state is created only at those two install points, so a hyperspace jump carries it over; dispose clears it"
    requirement: DOCK-10
    verification:
      - kind: unit
        ref: "tests/app/session/save-controller.test.ts#(f) a docked or in-flight Load installs a fresh pristine combat state"
        status: pass
      - kind: unit
        ref: "tests/app/session/start-session.test.ts#creates the combat state only at the two install points, so a hyperspace jump carries it over"
        status: pass
      - kind: unit
        ref: "tests/app/session/start-session.test.ts#drops the combat state and the hull table with the flight state"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Node tick replay and the browser session step and hash the same way with combat: a scripted run that changes view and fires gives the same final hash and the same per-tick trace, traffic off and on; probe.worldHash includes a non-pristine combat state; a pristine run still hashes as the flight hash"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/app/session/tick-parity.test.ts#tick parity with combat (plan 13-11, CBT-04 to CBT-07)"
        status: pass
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts#worldHash and the combat state (plan 13-11)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/traffic.spec.ts#a launch populates the world, draws the ships within budget and matches the Node"
        status: pass
    human_judgment: false
  - id: D5
    description: "The traffic-on cold start with the hull chunk stays under 9,437,184 bytes and the figure is recorded"
    requirement: CBT-07
    verification:
      - kind: e2e
        ref: "tests/e2e/traffic.spec.ts#a traffic-on cold start requests no NPC model before the first in-flight frame (8,855,706 bytes)"
        status: pass
    human_judgment: false
---

# Phase 13 Plan 11: Combat in the live session Summary

**The live session now steps combat: it creates a pristine combat state beside every flight state, passes the profile's laser mounts, the lazily loaded hull table and the NPC weapon map to `stepSim` as read-only options, hashes with combat in the probe, and the Node replay mirrors all of it; the traffic-on cold start with the hull chunk measures 8,855,706 bytes against the 9,437,184-byte ceiling.**

## Performance

- **Duration:** about 25 min (including a 3 min `verify` gate and three browser spec runs)
- **Tasks:** 2 (a tracer, then an auto task with behaviour cases)
- **Files:** 0 created, 18 modified (7 src session/content, 11 tests and specs)

## Measurement (D11)

| Cold start (to the first in-flight frame) | Bytes | Ceiling | Headroom |
|---|---|---|---|
| Traffic on, with the hull chunk (`tests/e2e/traffic.spec.ts`) | **8,855,706** | 9,437,184 | 581,478 |
| Traffic off (`tests/e2e/budget.spec.ts`) | 8,845,540 | 9,437,184 | 591,644 |
| Previous traffic-on figure (plan 13-04 summary) | 8,839,791 | | |

The hull chunk costs 15,915 bytes on the wire (89,673 bytes of JSON, compressed). The traffic spec now also asserts the chunk was fetched (so the figure includes it) and the budget spec asserts a traffic-off cold start never requests it.

## Accomplishments

- **State and boot load:** `SessionCore` gained `combat` and `hulls`. `start-session.ts` adds `loadShipHulls()` to the boot `Promise.all` under the same `ctx.runtime.testFlags.traffic ?` condition as `loadNpcCatalogue()` and inside the same `try`/`showBootFailure` surface (T-13-23), builds `ctx.core.hulls` with `hullTable(...)`, creates `ctx.core.combat = createPlayerCombatState()` right after `ctx.core.state` is assigned (new game and Continue), and clears both on dispose.
- **Step options:** `buildStepOptions` takes a required `laserMounts` and optional `hulls`/`npcWeapons` and always emits `combat: { mounts, ...hulls?, ...npcWeapons? }` with absent keys omitted. The sim driver feeds it `ctx.core.profile.laserMounts` (never a command, T-13-24), the hulls, the traffic weapons, and passes `ctx.core.combat` as the ninth `stepSim` argument; the chart-behind steps use the zero frame so nothing fires there.
- **Static content builders:** `traffic.ts` builds a `weapons` map (spec key to `{ laser: forwardWeapon, offset: forwardWeaponPosition }`) in `trafficContent` and exports `hullTable(catalogue)`; no entity id appears in `src/app` (`tests/guards/entity-id-scope.test.ts` passes).
- **Loads and hash:** `save-controller.ts` installs `createPlayerCombatState()` in the one synchronous install block, right after the state; `probe-publisher.ts` passes `ctx.core.combat` to `hashWorld`.
- **Replay parity:** `tick-script.ts` creates a combat state, passes mounts (profile's, or the script's) and, with traffic on, the hull table read from the committed generated file plus the NPC weapon map, steps and hashes with combat; `TickStep.fire` holds the fire key. The real session (driver, router, lifecycle, probe) and the replay agree on the final hash and on every per-tick hash for a run that launches, flies 600 ticks, then fires on the aft view and the fore view, traffic off and on.
- **Isolation allow-list:** `tests/content/ships-hulls.test.ts` now allows exactly the loader and `start-session.ts` to import the hull chunk module, and asserts start-session never names the generated file.

## Task Commits

1. **Task 1 (tracer): holding A in the live session fires the profile's laser (state, options, boot load)** - `99888e8` (feat)
2. **Task 2: Load resets, probe hash, replay parity, chunk checks and the cold-start measurement** - `eb1bb33` (feat)

Tracer gate: `HUMAN_VERIFY_MODE` end-of-phase with an automated-only `<verify>`; the Task 1 tests and the 770 tests of `tests/app tests/content tests/guards tests/compliance.test.ts` were re-run green after the commit work and before expansion (`Tracer verified end-to-end - expanding`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/content/types.ts` needed the hull type**
- **Found during:** Task 1
- **Issue:** `hullTable(catalogue)` in `traffic.ts` needs the `ShipHullCatalogue` type, but `traffic.ts` may only import types from `src/content/types.ts` (a guard in `world-lifecycle.test.ts`), and importing the type from `ships-hulls.ts` would make it a second importer of the loader and trip the isolation test.
- **Fix:** added `export type { ShipHull, ShipHullCatalogue }` to the type-only door.
- **Files modified:** `src/content/types.ts`
- **Commit:** `99888e8`

**2. [Rule 3 - Blocking] Existing callers of `buildStepOptions` and a `TrafficContent` literal**
- **Found during:** Task 1 (typecheck)
- **Issue:** the new required `laserMounts` and `weapons` fields broke `traffic-variants.test.ts`, the `buildStepOptions` cases and one `npcTraffic` literal in `sim-driver.test.ts`; the exact-shape assertions on the options also gained the `combat` key.
- **Fix:** added `laserMounts: DEFAULT_LASER_MOUNTS` and `weapons: new Map()`, and extended the two shape expectations (`combat: { mounts }`). No assertion was weakened.
- **Files modified:** `tests/app/session/traffic-variants.test.ts`, `tests/app/session/sim-driver.test.ts`
- **Commit:** `99888e8`

**3. [Rule 2 - Missing critical] Browser assertions that make the measurement meaningful**
- **Found during:** Task 2
- **Issue:** the plan asks for the traffic-on cold start with the hull chunk to be measured, but the existing spec would pass whether or not the chunk was fetched, and nothing proved a traffic-off session never fetches it.
- **Fix:** `traffic.spec.ts` asserts the `ships-hulls-*.js` chunk is in the request log; `budget.spec.ts` asserts a traffic-off cold start never requests it. Both specs pass.
- **Files modified:** `tests/e2e/traffic.spec.ts`, `tests/e2e/budget.spec.ts`
- **Commit:** `eb1bb33`

**4. [Plan wording] "lowers the profile-mounted laser's facing temperature"**
- **Found during:** Task 1
- **Issue:** a shot raises the facing's laser temperature (`applyShot` adds `shotTemperature`) and resets its shot timer to 0; it never lowers the temperature.
- **Fix:** the case asserts the temperature rises to just under the shot's heat (one tick of cooling is applied in the same step) and that the shot timer drops below the others; for the profile-mounts case it asserts the aft temperature rises and the fore stays 0.

**Process note:** the Task 1 commit also carries the `tick-script.ts` combat wiring and the `ships-hulls.test.ts` allow-list change, because `buildStepOptions`'s new required field breaks the replay's typecheck and `start-session.ts` importing the loader fails the isolation test; neither could land in a later commit without a red intermediate state.

**Total deviations:** 3 auto-fixed (2 Rule 3, 1 Rule 2) plus 1 wording correction. **Impact:** none on scope or behaviour; no architectural change.

## Authentication Gates

None.

## Issues Encountered

- The first heat assertion expected exactly 7 (the pulse's shot temperature); the same step's cooling takes 0.05 back, so the case asserts the band (heat - 1, heat].
- `startSession` still has no Node harness, so the boot-load wiring is pinned as ordered source facts (as plan 12-08 did for the NPC catalogue), with the browser specs proving the fetch end to end.

## Verification

- `docker compose run --rm test npx vitest run tests/app/ tests/content/ships-hulls.test.ts tests/guards/ tests/compliance.test.ts`: 38 files, 734 tests pass (includes the SPDX compliance test and `entity-id-scope`)
- `docker compose run --rm typecheck` and `docker compose run --rm lint`: clean
- `docker compose run --rm verify` (lint, typecheck, content drift, unit tests, build, e2e smoke subset): pass, 27 Chromium tests
- `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/traffic.spec.ts tests/e2e/budget.spec.ts"`: 6 passed, 0 failed
- Acceptance: `rg -c loadShipHulls src/app/session/start-session.ts` = 2 (import and call); `rg -c combat src/app/session/context.ts` >= 1; the fire, boot-load, pristine, Load-reset, probe-hash, parity and isolation cases pass.
- `tests/golden/flight-hash-pins.json` was not touched.
- CHANGELOG.md not touched: nothing is user-visible until 13-12 and 13-13 draw the lasers and the HUD reads the combat state (a held fire key already fires a shot in the simulation, but nothing renders it and no number is shown).

## Known Stubs

None.

## Threat Flags

None. T-13-23 (hull chunk load failure): the load is inside the boot `try` with the NPC catalogue, so a failure shows `showBootFailure` and publishes the failure, never a half state (pinned by the source-order case). T-13-24 (forged mounts): mounts come only from `ctx.core.profile.laserMounts`, passed as read-only step options, never from a command (pinned by the "takes the mounts from the profile" case).

## Notes for later plans

- `ctx.core.combat` is the live combat state for the HUD and the renderer (13-12, 13-13); it is undefined only before boot completes and after dispose. `ctx.core.hulls` is undefined with traffic off.
- With traffic off the NPC weapon map and hull table are absent, so no shot can hit; with traffic on the player's shot hits an NPC (energy drains, `shipHit`), and an NPC fires only if something calls `ShipControl.fire` (no shipped AI does, D-11).
- `tests/helpers/tick-script.ts` signature additions: `TickStep.fire?`, `TickScriptOptions.laserMounts?`, `TickScriptResult.combat`. Later specs that compare a browser hash to the replay must hold the same fire key and mounts.
- Plan 13-14 should record in Key Decisions: the combat state is not saved, and every Load, Continue and new game starts pristine.

## Self-Check: PASSED

- Files modified exist on disk (all 18 listed in `key-files.modified`).
- Commits `99888e8` and `eb1bb33` are ancestors of HEAD; the measured commit count since the plan ledger is 2.
- All acceptance criteria and plan verification commands re-run green in Docker.
