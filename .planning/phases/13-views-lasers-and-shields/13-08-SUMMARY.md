---
phase: 13-views-lasers-and-shields
plan: 08
subsystem: sim/combat
tags: [combat, stepSim, views, lasers, hit-resolution, dock-reset, hash]
status: complete
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-03 firstShipHit, 13-04 hull table as a caller-supplied option, 13-05 state/weapons/shields modules, 13-07 Entity.energy"
provides:
  - "ControlIntent.fire, copied from InputFrame.fire by the player controller only"
  - "aim.ts: laserFrame(orientation, facing) and playerLaserRay(position, orientation, facing, laser)"
  - "combat/step.ts: stepPlayerCombat, resolveShots, CombatOptions, ShotRequest, HitRecord"
  - "stepSim(..., options?, combat?): stepFlight, stepPlayerCombat, stepWorld, resolveShots"
  - "StepOptions.combat?: CombatOptions { mounts, hulls? }"
  - "laserRefused event; laserFired and shipHit now emitted"
  - "hashWorld(player, world, combat?) appends serializeCombat only for a non-pristine state"
affects: [13-09, 13-10, 13-11, 13-12, 13-13, 13-15, 14]
requirements-completed: [CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10]
actuals:
  tokens: 18200
  tasks: 3
  commits: 3
plan_head_before: 06e4264667c9e0ab3f841c3cb7b9c6c374206d87
plan_head_after: 9b20cc498b8b2397fd1c5e3e4c3f00c7b9d3851b
tech-stack:
  added: []
  patterns:
    - "Combat state lives beside FlightState; its hash line is appended only when not pristine (the isNeverSpawned device), so no pinned hash moves"
    - "Shots are queued before stepWorld and resolved after it: hits are collected in ascending shooter id and applied in one pass, with no handlers"
    - "A test proves 'stepWorld saw the old value' by putting a logging accessor on the target's energy"
key-files:
  created:
    - src/sim/combat/aim.ts
    - src/sim/combat/step.ts
    - tests/helpers/hull-table.ts
    - tests/sim/combat/step.test.ts
    - tests/sim/combat/aim.test.ts
    - tests/sim/combat/dock-reset.test.ts
  modified:
    - src/sim/sim.ts
    - src/sim/flight/step.ts
    - src/sim/flight/controller.ts
    - src/sim/events.ts
    - src/sim/world/serialize.ts
    - tests/sim/flight-controller.test.ts
    - tests/sim/world/flight-hash-pins.test.ts
    - tests/helpers/recorded-flights.ts
key-decisions:
  - "stepPlayerCombat takes the plan's seven parameters and returns { events, shots }. It derives 'in flight at the start of the step' from the flight events: post-flight mode inFlight with no launchComplete event. A setView drained on the tick that completes the launch is therefore ignored, with no extra parameter."
  - "With a combat state but no options.combat, the stock fit (DEFAULT_LASER_MOUNTS) and no hull data apply: the shot is drawn but cannot hit."
  - "resolveShots keeps the plan's six-parameter shape; player and combat are underscore-named and unused until plan 13-10 routes NPC fire onto the player (noUnusedParameters allows the underscore)."
  - "hashWorld sanitises the combat state before the pristine test, so a poisoned value can neither read as pristine nor reach canon. sanitizeCombat is idempotent and a no-op on any state stepPlayerCombat produced."
  - "laserRefused is emitted on every tick the held key is refused; throttling the wording is the app's job (plan 13-12)."
  - "A hit amount is the laser's damage; shipHit carries it even when the target's energy floors at 0 (N2). shield is always false for an NPC target."
coverage:
  - id: D1
    description: "A held fire key travels intent to stepSim to the two-stage hit rule to the target's energy: one laserFired from the Cobra's mount, one shipHit for 15, an Adder's energy 85 to 70"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#fires the fore pulse laser at an Adder 2,000 m ahead and drains it by 15"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-controller.test.ts#ControlIntent.fire (CBT-05)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A shot inside a bounding sphere but outside the real hull misses; stations and buoys are never candidates"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#passes through the bounding sphere beside the hull and misses, with real hull data"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#never hits the station or a buoy: only dynamic ships are candidates"
        status: pass
    human_judgment: false
  - id: D3
    description: "Views select the facing: setView in flight switches view and weapon facing together; docked, launching, launch-complete-tick and forged payloads are ignored; a facing with no laser fires nothing"
    requirement: CBT-04
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#views and facing (CBT-04)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/aim.test.ts#laserFrame"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bookkeeping (weapon cooling, shot timers, energy and shield recharge, cabin cooling) runs only while launching or in flight, never docked; refusals emit laserRefused"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#bookkeeping runs only outside the dock (F6)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#a refused laser (CBT-05)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Docking restores shields and energy to full, zeroes the four laser temperatures, the cabin to 60, the view to fore; launching resets view, temperatures and shields"
    requirement: DOCK-10
    verification:
      - kind: unit
        ref: "tests/sim/combat/dock-reset.test.ts#refills shields and energy and resets temperatures, cabin and view from the docked tick on"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/dock-reset.test.ts#launching resets the weapons"
        status: pass
    human_judgment: false
  - id: D6
    description: "Hits are queued and applied once after stepWorld (A6, Pitfall 7); D-01 not-loaded: no hull table or no entry cannot hit; two runs give identical events and hashes"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#applies the hit after stepWorld on the same tick, in one write"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#hull data not loaded (D-01)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#two runs of the same scenario give identical events and hashes"
        status: pass
    human_judgment: false
  - id: D7
    description: "The combat line is hashed only when not pristine; the three pinned flights replayed through stepSim with a pristine combat state hash to the pinned values"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts#holds when replayed through stepSim with a pristine combat state, hashed with hashWorld"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#combat in the world hash"
        status: pass
    human_judgment: false
---

# Phase 13 Plan 08: Player combat wired into stepSim Summary

**A held fire key now travels from the player controller through `stepSim` to Oolite's two-stage hit rule and drains an NPC's energy (fore pulse, Adder 85 to 70), with views selecting the facing, bookkeeping and the DOCK-10 resets following Oolite, and the combat state hashed only when it is not pristine so no pinned hash moves.**

## Performance

- **Duration:** about 25 min (the full `docker compose run --rm test` takes about 3 min)
- **Tasks:** 3 of 3
- **Files:** 6 created (2 sim, 4 test/helper), 8 modified (5 sim, 3 test/helper)

## Accomplishments

- `ControlIntent.fire?` is copied from `InputFrame.fire` by `PlayerController` (key omitted when not held); `ScriptedLaunchController` and `ZERO_INTENT` never fire.
- `aim.ts`: `laserFrame` (fore `f=F,r=R`; aft `f=-F,r=-R`; port `f=-R,r=F`; starboard `f=R,r=-F`; up unchanged, verified right-handed for every facing) and `playerLaserRay` (origin = position + rotate(q, toWegoliteLocal(mount offset)), range from `LASER_STATS`).
- `combat/step.ts`: `stepPlayerCombat` (dock reset and stop on `docked`; launch reset on `launched`; `setView` in flight validated with `isFacing`; fire gate, `applyShot`, a queued `ShotRequest` or `laserRefused`; then `coolWeapons`, `rechargeEnergyAndShields`, `coolCabin` while launching or in flight) and `resolveShots` (ascending shooter id, targets are live non-dead `ship` entities only, `laserFired` then queued `HitRecord`s applied in one pass, energy floored at 0, `shipHit` with `shield: false`).
- `stepSim` gained the trailing `combat?` parameter; the order is flight, combat, world (existing gate), resolution. A caller with no combat state is exactly as before.
- `hashWorld(player, world, combat?)` appends `serializeCombat` only when `!isPristineCombat`; the pinned flights hold with a pristine state passed every step.
- Tracer proof: a Vitest scenario fires a fore pulse at an Adder through `stepSim`, using the real `ships-hulls.json`, and a shot 20 m above the Adder (inside its 29.03 m sphere, outside the hull) misses.

## Task Commits

1. **Task 1 (tracer): Fire a fore pulse at an NPC through stepSim** - `feae510` (feat)
2. **Task 2: Views and facing, bookkeeping, and the dock and launch resets** - `2bbdf45` (test)
3. **Task 3: Combat in the hash, D-01 not-loaded scenario and same-tick resolution** - `9b20cc4` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TDD RED phase of Task 2 had no failing state**
- **Found during:** Task 2
- **Issue:** The plan lists the views, bookkeeping and reset behaviour under Task 2 (`tdd="true"`), but `stepPlayerCombat` is one function and Task 1's tracer already needed the whole `docked`/`launched`/`setView`/bookkeeping shape to be correct (fire must precede bookkeeping, a docked tick must stop before firing). The Task 2 tests therefore passed on first run.
- **Fix:** Wrote the behaviour tests as specified and kept them as the pin; no production code changed in Task 2. Commit `2bbdf45` is `test(...)` only.
- **Files modified:** tests only
- **Commit:** `2bbdf45`

**2. [Rule 2 - Missing critical] `hashWorld` repairs the combat state before the pristine test**
- **Found during:** Task 3
- **Issue:** Testing `isPristineCombat` before `sanitizeCombat` would let a poisoned value (NaN) read as non-pristine and then, if repaired to the pristine values, print a spurious combat line (T-13-15 mitigation order).
- **Fix:** `sanitizeCombat(combat)` first, then `isPristineCombat`. Pinned by a test that hashes a NaN/Infinity state without throwing and sees it pristine again.
- **Files modified:** `src/sim/world/serialize.ts`, `tests/sim/combat/step.test.ts`
- **Commit:** `9b20cc4`

### Plan-listed file additions (not behavioural deviations)

- `tests/helpers/hull-table.ts` (new): reads `ships-hulls.json` with `node:fs` and builds the `HullTable` the app would build from the lazy loader. The plan allowed tests to read the file; the helper avoids repeating it.
- `tests/helpers/recorded-flights.ts`: `replayRecordedFlight` takes an optional `combat` state and then steps through `stepSim`; without it the replay is the unchanged `stepFlight` path the golden was captured from. `tests/golden/world/flight-hash-pins.json` is untouched.
- The plan's `ShotRequest`/`HitRecord` and the `CombatOptions` declaration live in `combat/step.ts` as specified; `flight/step.ts` imports the type from there (a type-only import cycle, which the toolchain accepts).

**Total deviations:** 2 auto-fixed (1 Rule 3 process note, 1 Rule 2). **Impact:** none on scope; no architectural change.

## Authentication Gates

None.

## Issues Encountered

- A first draft of the A6 test asserted "exactly one write to the target's energy". `sanitizeEntity` rewrites the same value each stepped tick, so the assertion became: every access before the hit is `read:85` or `write:85`, exactly one `write:70`, and it is the last access of the tick.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/combat/step.test.ts tests/sim/flight-controller.test.ts` : 2 files passed (Task 1)
- `docker compose run --rm test npx vitest run tests/sim/combat/step.test.ts tests/sim/combat/aim.test.ts tests/sim/combat/dock-reset.test.ts` : 3 files passed (Task 2; `tests/sim/combat/` as a whole: 176 passed)
- `docker compose run --rm test npx vitest run tests/sim/world/flight-hash-pins.test.ts tests/sim/combat/step.test.ts tests/sim/world/hash.test.ts` : 3 files, 47 passed (Task 3)
- `docker compose run --rm test` (whole suite, includes `tests/compliance.test.ts` SPDX check): 165 files, 3371 passed, 2 skipped
- `docker compose run --rm lint` and `docker compose run --rm typecheck`: clean
- Acceptance: `rg -c stepPlayerCombat src/sim/sim.ts` = 3; `rg -c laserRefused src/sim/events.ts` = 2; `rg -c 'fire\?: boolean' src/sim/flight/controller.ts` = 1; `rg -c isPristineCombat src/sim/world/serialize.ts` = 3; `tests/sim/combat/dock-reset.test.ts` exists; `git diff --stat tests/golden/world/flight-hash-pins.json` prints nothing.
- `verify` was not run: the plan is pure `src/sim` plus tests (gate policy); nothing browser-facing changed.

## Known Stubs

None.

## Threat Flags

None. T-13-15 (non-finite amount or energy): `resolveShots` queues only a finite positive amount, energy floors at 0 and a non-finite energy reads as 0, `sanitizeCombat` runs at the start of `stepPlayerCombat` and in `hashWorld`. T-13-16 (forged `setView`): `isFacing` validation, pinned for `up`, `constructor`, `__proto__`, empty and wrong-case values. T-13-17 (order-dependent damage): hits queued and applied once after resolution in ascending shooter id, pinned by the accessor test and the run-versus-run test.

## Notes for later plans

- `resolveShots(world, worldStepped, _player, _combat, shots, options)`: 13-10 replaces the underscore parameters and adds the NPC fire queue and the player as a hit candidate.
- `CombatOptions` is `{ mounts, hulls? }`; 13-10 adds `npcWeapons?`. The app (plan 13-09 onward) must pass `options.combat.mounts` from the profile's fitted lasers and `hulls` once the lazy file loads; until then shots draw but cannot hit.
- `laserRefused` fires every held tick; the message-line throttle is the app's concern.
- The `combat/step.ts` file ends with `resolveShots`; 13-15 adds `stepIdent` after it inside this file, so `sim.ts` stays unchanged.
- CHANGELOG.md not touched: sim-internal, no user-visible effect until the app and HUD plans wire the key and the gauges.

## Next

Ready for the next plan of wave 4 (13-09 onward).

## Self-Check: PASSED

- Created files exist on disk (`aim.ts`, `combat/step.ts`, `hull-table.ts`, the three test files); commits `feae510`, `2bbdf45` and `9b20cc4` are ancestors of HEAD.
- All acceptance criteria and plan verification commands re-run green in Docker.
