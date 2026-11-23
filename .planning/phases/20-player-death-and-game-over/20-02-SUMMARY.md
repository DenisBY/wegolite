---
phase: 20-player-death-and-game-over
plan: 02
subsystem: sim-combat
tags: [player-death, edge-ticks, mutual-kill, lethal-ram, freeze-table, property-test, tripwire]

requires:
  - phase: 20-player-death-and-game-over
    provides: "20-01: killPlayer, the dead mode, playerDestroyed.cause, the destroyable player, the dead returns of stepSim, stepFlight and resolveShots"
provides:
  - "death edge cases pinned through the real step: dock, jump, launching, countdown, ident, mutual kill (lasers and ram, both spawn orders), push before death, two lethal records, same-frame steps"
  - "the lethal ram (D-11) with Oolite's reversal and the bank-only comparison, the Krait, both buoys and the subentity contact"
  - "the ledger's lethal boundary and both internal-damage gates with the death outcome"
  - "dead-mode early returns in applyWitchpointArrival and completeLaunch"
  - "tests/sim/death-freeze.test.ts: every sim entry point is a no-op on a dead state"
  - "tests/sim/combat/death.property.test.ts: the lethal predicate and killPlayer are total"
  - "tests/guards/dead-mode-gates.test.ts: the flight-mode gate tripwire (29 files, per-file negative counts)"
affects: [20-03, 20-04, 20-06, 20-07, 20-08, 20-10]

actuals:
  tokens: 17300
  tasks: 3
  commits: 6
  # commits is measured: git rev-list --count 187167433a9d0246bc4b0cdeb38dcf7c71593b11..HEAD before this SUMMARY's own commit

tech-stack:
  added: []
  patterns:
    - "fail-closed positive first-statement return for a dead state in every exported writer of the in-flight mode"
    - "a source-text tripwire that pins the comparing files and each file's count of negative mode comparisons, with synthetic failing inputs"

key-files:
  created:
    - tests/sim/death-freeze.test.ts
    - tests/sim/combat/death.property.test.ts
    - tests/guards/dead-mode-gates.test.ts
  modified:
    - tests/sim/combat/death.test.ts
    - tests/sim/combat/ledger.test.ts
    - src/sim/hyperspace/arrival.ts
    - src/sim/flight/launch.ts

key-decisions:
  - "The two exported writers of inFlight (applyWitchpointArrival, completeLaunch) return first on a dead state; completeLaunch gets no broader mode check because tests call it from a docked state"
  - "The tripwire counts the comparisons of any expression with a FlightMode literal (=== !== == !=, either side) and pins 29 files with their negative counts"
  - "The lethal-predicate property treats a negative shield as malformed input (sanitizeCombat repairs it every tick before a record applies): the oracle's amount bound holds only for shields at or above 0"

requirements-completed: [DEATH-01, QUAL-11]

duration: 34min
completed: 2026-11-23
status: complete
plan_head_before: 187167433a9d0246bc4b0cdeb38dcf7c71593b11
plan_head_after: 2cfd8c042068af9ab21f4203a6f99f04d1e6a258

coverage:
  - id: D1
    description: "No death on the dock tick: a player docking with a low bank is docked after it, the bank refilled, no playerDestroyed, with a Krait overlapping it that would ram on any stepped tick"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#the dock tick (D-10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "No damage on the hyperspaceJumped tick (constructed bank-0 state), with a non-vacuity control that kills on the same scene without the jump"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#the hyperspaceJumped tick (D-10)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A launching player's bank can reach 0 without a death; the first lethal record after launchComplete kills it; a death clears the countdown and the ident lock with no cancelled or ident event"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#a launching player (D-10)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#the countdown and the ident lock die with the ship (D-10)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The mutual kill with lasers and with a ram: both die, one shipDestroyed through the kill path with debris, one playerDestroyed naming the NPC, spawn-order independent; the blast push lands before the death; two lethal records follow ledger (lower id) order; the steps after the lethal one change nothing"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#the mutual kill (D-09)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#two lethal records on one tick"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#the steps after the lethal one in the same frame"
        status: pass
    human_judgment: false
  - id: D5
    description: "The lethal ram kills the player with Oolite's reversal (inelastic for the player, no nudge, the Krait not pushed) naming krait, buoy, buoy-witchpoint and, for the subentity contact, buoy; selfDestroyed compares the bank only"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#the lethal ram (D-11)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The ledger's lethal boundary (damage past the shield equal to the bank kills, absorbed damage never kills, also at bank 0) at the ledger and through the step, and the two internal-damage gates with the death outcome"
    requirement: QUAL-11
    verification:
      - kind: unit
        ref: "tests/sim/combat/ledger.test.ts#kills when the damage past the shield equals the bank (Oolite energy <= 0.0, QUAL-11)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#the lethal boundary through the step (QUAL-11)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Every sim entry point leaves a dead state unchanged, and the lethal predicate and killPlayer are total over malformed input"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/death-freeze.test.ts"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/death.property.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "The flight-mode gate tripwire pins the comparing files and each file's negative comparisons"
    verification:
      - kind: unit
        ref: "tests/guards/dead-mode-gates.test.ts"
        status: pass
    human_judgment: false
---

# Phase 20 Plan 02: Death edge cases and the fail-closed freeze Summary

**The death's edge ticks, the mutual kill, the lethal ram with Oolite's reversal and the ledger's lethal boundary are pinned through the real step; a freeze table proves all eight sim entry points leave a dead state unchanged, after two early returns closed the only fail-open writers (`applyWitchpointArrival`, `completeLaunch`); a property proves the lethal predicate total and a tripwire pins 29 files that compare a flight mode.**

## Performance

- **Duration:** 34 min (the full `test` run alone took about 17 min under load from three sibling executors)
- **Started:** about 2026-11-23T17:20Z
- **Completed:** 2026-11-23T17:54Z
- **Tasks:** 3
- **Files changed:** 7 (3 created; 2 source files, 5 test files)

## Accomplishments

Each edge case and its observed outcome (all through `stepSim`, `resolveShots` or the collision stage; kinds, cause objects, modes and hashes asserted, never call counts):

| Case | Outcome |
|------|---------|
| Dock tick (bank 1, Krait overlapping) | docks on tick 0, bank refilled to full, no `playerDestroyed`; the overlapping Krait never rams because the dock tick steps no world |
| Jump tick (bank 0, constructed) | `hyperspaceJumped`, no `shipHit`, mode `inFlight`; the same scene without the jump kills the player (non-vacuity) |
| Launching player | a beam floors the bank to 0, no death, mode `launching`; after `launchComplete` the next lethal record kills it |
| Countdown and ident | a ram death at 350 m/s with a countdown of 1800 and an ident lock on the Krait: countdown 0, target null, no `hyperspaceCountdownCancelled`, `identEngaged` false, no ident event after `playerDestroyed`; 20 further `stepSim` calls with held fire, pitch, ident, launch and dock commands return `[]` and move no hash, tick or clock |
| Mutual laser kill (Krait at 1 energy, 1,500 m) | one `shipDestroyed` for the Krait with debris released, one `playerDestroyed` `{ laser, krait }`, the Krait's key read before `killShip`; swapping the spawn order (a bystander Viper first) changes the Krait id and nothing else |
| Push before death (150 m, debris content) | the dead player's drift equals the surviving control's drift, `{ x: 0, y: 0, z: 0.00039587 }`; with `killPlayer` moved before the kills the drift is exactly 0 and the case fails (mutation checked) |
| Mutual ram (350 m/s, bank 10, Krait 10) | both die on the contact tick: one `shipDestroyed` for the Krait, one `playerDestroyed` `{ scrape, krait }` |
| Two lethal records (Krait ahead, Viper behind) | the culprit is the lower shooter id's key; with the spawn order swapped it is the other kind; one player hit event follows the first lethal record |
| Same frame | four more `stepSim` calls after the lethal one change no hash, tick or clock |

### Measured ram damage (dam1 on the player)

| Case | Speed | dam1 | Notes |
|------|-------|------|-------|
| Krait, bank 10, no shield | 350 m/s | 228.564 | `selfDestroyed`, no nudge, Krait not pushed (reversal cancels `vel2a`) |
| Nav buoy and witchpoint buoy, bank 10, no shield | 250 m/s | 873.364 | identical for both buoys (one hull, one mass); culprit `buoy` / `buoy-witchpoint` |
| Krait, bank 100, forward shield 128 (bank-only case) | 300 m/s | 167.925 | between the bank and shield plus bank: the player is reversed (`selfDestroyed`) and alive, energy 61.609 after the contact tick |
| Nav buoy subentity (player hull swapped for the pod barrel with a raised radius, bank 1) | 200 m/s drift | 6.117 on the player (source id 5, the buoy); 171.790 on id 7 | culprit `buoy`, not the subentity's id |

The lethal-boundary pins (`bank` and `shield` set by hand against the Viper's 6-point beam): shield 4 and bank 2 kills (equal), shield 4 and bank 3 leaves 1, shield 6 and bank 0 survives (the shield absorbs all). In the ledger: shield 4, bank 5, record 9 kills; record 8 leaves 1; shield 50, bank 0, record 50 survives.

### The two early returns

`if (state.mode === "dead") return;` is the first statement of `applyWitchpointArrival` (`src/sim/hyperspace/arrival.ts`) and of `completeLaunch` (`src/sim/flight/launch.ts`), each with a one-line comment. `completeLaunch` on a docked state still sets `"inFlight"` (`tests/sim/death-freeze.test.ts`, and the unchanged `autosave.test.ts` and `restore-drift.test.ts` pass).

### The tripwire's pinned values

`tests/guards/dead-mode-gates.test.ts` pins 29 files with their count of negative comparisons (`!==` / `!=` against a mode literal), measured on the tree after this plan's own edits (the rough comment-counting scan of planning found 26 at `a5a03ce`; these are the comment-free values):

| Negative count | Files |
|----------------|-------|
| 4 | `src/app/session/station-controller.ts`, `src/sim/flight/step.ts` |
| 3 | `src/app/hints.ts`, `src/app/session/probe-publisher.ts`, `src/app/session/start-session.ts` |
| 2 | `src/app/session/save-controller.ts`, `src/app/session/sim-driver.ts` |
| 1 | `src/sim/combat/death.ts`, `src/sim/combat/ident.ts`, `src/sim/dock/computer.ts`, `src/sim/dock/step.ts`, `src/sim/flight/controller.ts`, `src/sim/flight/launch.ts`, `src/sim/npc/proximity.ts`, `src/ui/station-nav.ts`, `src/ui/station-tabs.ts` |
| 0 | `src/app/hud-model.ts`, `src/app/mode.ts`, `src/app/session/{chart-controller,event-router,frame-loop,render-driver}.ts`, `src/persistence/{autosave,save}.ts`, `src/sim/combat/{collide,ledger,step}.ts`, `src/sim/hyperspace/arrival.ts`, `src/sim/sim.ts` |

Later plans write positive comparisons in files already on the list. If a sibling plan's new file (for example 20-05's `src/ui/game-over.ts`) compares a mode literal, or a plan adds a negative comparison, the guard fails by design and that plan re-pins in its own commit.

### Fail-open sites found by the scenarios

None beyond the two the plan named. Every scenario of Tasks 1 and 2 passed against 20-01's code on its first run (they pin behaviour 20-01 already built); the freeze table's `completeLaunch` and `applyWitchpointArrival` rows were the only RED rows. No file under `src/sim/combat/`, `src/sim/npc/**` or `src/sim/world/**` changed.

## Task Commits

1. **Task 1: edge ticks and the mutual kill (tracer)** - `51c784b` (test)
2. **Task 2: lethal ram and the ledger's boundary and gates** - `35bf30e` (test)
3. **Task 3, RED: the freeze table** - `e239408` (test)
4. **Task 3, GREEN: the two early returns** - `1c73c5f` (feat)
5. **Task 3: the property and the tripwire** - `aafe2ab` (test)
6. **Style fix to the GREEN commit** - `2cfd8c0` (style)

**Plan metadata:** the commit that adds this SUMMARY (docs).

## TDD Gate Compliance

- **RED (Task 3):** `e239408`. `docker compose run --rm test npx vitest run tests/sim/death-freeze.test.ts` failed 2 of 10: `completeLaunch` and `applyWitchpointArrival` "leaves the hashes, the tick and the mode as they were", each on `expected 'inFlight' to be 'dead'` at the mode assertion (the target tests executed and failed on the planned assertion for the intended reason: a dead state revived). The other six entry-point rows passed, as 20-01's dead returns already hold. Semantic assessment: valid RED (no import, fixture or zero-test fault). The format-based `gsd_run check tdd-red-evidence` classifier was not run (no TAP/JUnit reporter output was captured; the plan type is `execute`, not `tdd`).
- **GREEN:** `1c73c5f` (`feat`) follows the RED commit; the freeze table, `autosave.test.ts` and `restore-drift.test.ts` pass.
- **Tasks 1 and 2** carry `tdd="true"` but describe behaviour the code already has (20-01 built it), so their tests passed on the first run and there is no RED commit for them. They were proved non-vacuous by mutation instead: moving `killPlayer` before the kills failed the push case and the mutual-kill case; comparing the ram damage with the shields plus the bank in `energyOf` failed the bank-only case. Both mutations were reverted.

## Decisions Made

- The property's amount bound skips negative shields: a negative shield (malformed, repaired by `sanitizeCombat` at the start of every tick before any record applies) counts as extra damage past it, so a death can follow from an amount below the bank. Reachable only through a state that bypasses `sanitizeCombat`, not through `stepSim`.
- The tripwire reports a pinned file that stops comparing as a violation too, so a removed gate is reviewed as well.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dropped space in the GREEN commit**
- **Found during:** plan-boundary `lint` (prettier)
- **Issue:** my edit to `src/sim/hyperspace/arrival.ts` produced `const safety =layout...`
- **Fix:** prettier restored the space
- **Files modified:** `src/sim/hyperspace/arrival.ts`
- **Verification:** `docker compose run --rm lint` exit 0
- **Committed in:** `2cfd8c0`

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** none on scope.

### Notes on the plan text

- The plan's dock-tick behaviour names a player "with a low bank"; the Krait overlapping the player was added so the case proves the dock tick steps no world (a stepped tick would ram at once).
- Task 2's subentity contact needs the player's hull swapped for the pod barrel with a raised collision radius (the player's own hull cannot reach the subentity alone, per the 2026-11-20 scan in `collision-buoy.test.ts`); the case says so.
- The shared git directory accepted the `gsd-plan-head-before-20-02` ledger, so `plan_head_before` is read from it (same value as the spawn base).

## Issues Encountered

The first full `docker compose run --rm test` (HEAD `aafe2ab`) failed 8 tests, all `Test timed out` (7 at 5000 ms, 1 at 30000 ms: `tools-determinism` lint probe, `tick-flyers`, `world-lifecycle`, `kill.property`, `attack-dispatch`, `hot-weapon`, `static-hulls`, `textures`), while three sibling executors ran their own suites on the same machine. All eight files pass together on rerun (8 files, 192 tests). `textures.test.ts` is a known flake. The run printed no coverage threshold error. No remote gate (`verify`) by the plan's gate policy.

## Plan-boundary verification

- Targeted: `death.test.ts` + `ledger.test.ts` + `internal-damage` + `collision-stage` + `collision-buoy` + both collision property tests: 7 files, 146 tests passed; `death-freeze`, `death.property`, `dead-mode-gates`, `autosave`, `restore-drift` passed.
- `docker compose run --rm typecheck`: exit 0.
- `docker compose run --rm lint`: exit 0 (eslint and prettier), after `2cfd8c0`.
- `docker compose run --rm test`: 276 of 284 files passed first, the 8 timeouts passed on rerun (above).

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path, file access or schema; the two early returns only close T-20-05.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 2 siblings (20-03 to 20-05) and the app plans (20-04, 20-06 to 20-08) can rely on the dead state being inert at sim level and on the tripwire naming any gate they add. Siblings that add a mode comparison in a file off the list, or a negative comparison anywhere, will see the guard fail at merge and must re-pin in their own commit.

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*

## Self-Check: PASSED

Created files exist (`tests/sim/death-freeze.test.ts`, `tests/sim/combat/death.property.test.ts`, `tests/guards/dead-mode-gates.test.ts`), the six task commits are ancestors of HEAD, the working tree held only this SUMMARY before its commit, and every acceptance criterion of Tasks 1 to 3 was run and passed.
