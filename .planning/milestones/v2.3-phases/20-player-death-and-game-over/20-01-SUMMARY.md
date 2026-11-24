---
phase: 20-player-death-and-game-over
plan: 01
subsystem: sim-combat
tags: [player-death, ledger, killPlayer, collision, persistence-guard, tripwire-retired]

requires:
  - phase: 19-internal-damage
    provides: the ledger's internal-damage gate and the combat state this plan leaves untouched
provides:
  - "killPlayer / playerDeathCause (src/sim/combat/death.ts): the one death path and the cause of the lethal record"
  - "FlightMode member dead; PlayerDeathCause; playerDestroyed.cause"
  - "applyLedger outcome parameter: the lethal decision at the damage point"
  - "the player collider is destroyable; the tripwire marker and its guard are retired"
  - "snapshotForSave refuses a dead state (DEATH-06, first layer)"
  - "tests/guards/player-death-producer.test.ts: playerDestroyed has one producer"
  - "measured nav-buoy rams (idle launch, 250 and 350 m/s) pinned in collision-buoy.test.ts"
affects: [20-02, 20-03, 20-04, 20-06, 20-09, 20-10]

actuals:
  tokens: 21000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "lethal decision in the ledger at the damage point, reported through an optional outcome object, applied by one killPlayer call in resolveShots"
    - "dead state is frozen by a positive first-statement return in stepSim, stepFlight and resolveShots"

key-files:
  created:
    - src/sim/combat/death.ts
    - tests/sim/combat/death.test.ts
    - tests/guards/player-death-producer.test.ts
  modified:
    - src/sim/flight/state.ts
    - src/sim/events.ts
    - src/sim/combat/ledger.ts
    - src/sim/combat/step.ts
    - src/sim/combat/collide.ts
    - src/sim/combat/response.ts
    - src/sim/combat/shields.ts
    - src/sim/combat/internal-damage.ts
    - src/sim/sim.ts
    - src/sim/flight/step.ts
    - src/persistence/autosave.ts
    - CHANGELOG.md
  deleted:
    - tests/guards/collision-player-death.test.ts

key-decisions:
  - "The culprit of a death is the spec key of an NPC source or the ident key of a static source (buoy, coriolis-station), omitted when unknown, never an entity id (D-04)"
  - "snapshotForSave throws for a dead state before its mode mapping; the throw leaves buildSnapshotInputs before queueSnapshot, so nothing is written"
  - "The idle straight launch is lethal (measured), so the CHANGELOG death line carries the sentence naming it"

requirements-completed: [DEATH-01, DEATH-06, QUAL-11]

duration: 45min
completed: 2026-11-23
status: complete
plan_head_before: d8b37162e500e63f678f534d54c5ecf4ae83a57b
plan_head_after: d3d8e3aa798cabb8859efe9097d8d38e0c701129

coverage:
  - id: D1
    description: "A laser record that empties the bank of a player in flight kills it on that tick through killPlayer: mode dead, energy 0, one playerDestroyed with a position copy and cause {damage, culprit}"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#sets the dead mode, empties the bank and posts one playerDestroyed with a copy of the position and the cause"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#a larger hit spills the rest into energy, heats the cabin, floors the energy at 0 and kills the player"
        status: pass
    human_judgment: false
  - id: D2
    description: "The lethal decision is taken in the ledger (inFlight, damage past the shield above 0, bank minus damage at or below 0); a shield that absorbs the hit never kills; a second lethal record of a call is skipped"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/ledger.test.ts#routes a lethal player record through the shields, floors the bank at 0 and sets the death outcome with the source's key"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#a second lethal record in the same call is skipped: one hit event, one death"
        status: pass
    human_judgment: false
  - id: D3
    description: "The player is destroyable in the collision stage; the 250 and 350 m/s nav-buoy rams and the idle straight launch kill the player (measured, pinned) while the 350 m/s Krait ram survives by shield and bank"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-buoy.test.ts#the idle straight launch rams the nav buoy and the player dies about a minute later (D-11)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collision-buoy.test.ts#at 350 m/s from full shields and bank both are destroyed on the contact tick (D-09, D-11)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#a Krait rammed to zero is destroyed through killShip with its debris, credited to the player"
        status: pass
    human_judgment: false
  - id: D4
    description: "A dead state is frozen: resolveShots, stepSim and stepFlight return no events and move no hash, tick or clock; killPlayer is a no-op unless the player is in flight"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#stepSim returns [] for a dead state and moves no hash, tick or clock"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/death.test.ts#leaves a docked, a launching and an already dead state untouched"
        status: pass
    human_judgment: false
  - id: D5
    description: "No commit can encode or write a dead player: snapshotForSave throws for a dead state and a dead state never queues a write through autosave or the manual save"
    requirement: DEATH-06
    verification:
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#refuses a dead state before any mapping (DEATH-06), never encoding it as docked"
        status: pass
      - kind: unit
        ref: "tests/app/session/save-controller.test.ts#a dead state never queues a write, through autosave or the manual save"
        status: pass
    human_judgment: false
  - id: D6
    description: "The single death path is machine-checked: playerDestroyed has one producer, killPlayer, called once from resolveShots, with one enumerated app consumer"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/guards/player-death-producer.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "The breaking change is announced in CHANGELOG, including the idle-launch buoy death"
    requirement: DEATH-01
    verification: []
    human_judgment: true
    rationale: "Wording of a user-facing release note; the idle-launch claim is confirmed in the browser by the phase UAT (20-10)"
---

# Phase 20 Plan 01: Player death in the simulation Summary

**One lethal ledger record kills a player in flight through `killPlayer`: the world freezes, the tick posts one `playerDestroyed` with `{ damage, culprit }`, a lethal ram takes Oolite's reversal for the now destroyable player, and a dead state can neither be saved nor stepped.**

## Performance

- **Duration:** about 45 min (the full `test` run alone is about 9 min)
- **Started:** about 2026-11-23T16:25Z
- **Completed:** 2026-11-23T17:10Z
- **Tasks:** 3
- **Files changed:** 24 (3 created, 1 deleted)

## Accomplishments

- `src/sim/combat/death.ts`: `playerDeathCause` (spec key of an NPC, else ident key of a static, else none) and `killPlayer` (no-op unless `inFlight`; mode `dead`, hyperspace attempt cleared without a cancelled event, bank 0, ident lock dropped, one `playerDestroyed` with a copy of the position).
- `applyLedger(..., outcome?)` decides the lethal record at the damage point (inFlight, damage past the shield above 0, bank before minus damage at or below 0, finite bank); it skips player records for a dead player or once a death is set. The internal-damage gate is untouched.
- `resolveShots` returns `[]` first for a dead player, then calls `killPlayer` once between the kills (and the player's push) and the AI drain, reached with or without a stepped world. `stepSim` and `stepFlight` return `[]` for a dead state.
- The player collider is `destroyable: true`; the tripwire marker and `tests/guards/collision-player-death.test.ts` are gone, replaced by `tests/guards/player-death-producer.test.ts` (rules a to d, synthetic failing inputs for each).
- `snapshotForSave` throws for a dead state; the caller audit below shows no trigger reaches it before 20-04.
- The nav-buoy ram was measured before anything pinned it (table below); both rams and the idle straight launch are pinned.

## Task Commits

1. **Task 1: the death commit (tracer)** - `b10e191` (feat)
2. **Task 2: collision pins for a destroyable player** - `1c15992` (test)
3. **Task 3: laser pins as death cases, save-controller no-write pin, forward references removed** - `d3d8e3a` (test)

**Plan metadata:** the commit that adds this SUMMARY (docs).

## Ram measurement (Task 1 item 15; scratch run under the session scratchpad, never committed)

Full shields (forward 128, aft 128) and bank 256 from `createPlayerCombatState()`, `createWorld(7)`, the collision options of `collision-buoy.test.ts`. "Tick" counts from 0 (the launch command's tick for the idle case, the first tick after the 400 m placement for the others). dam1 is the player's `shipHit` amount, dam2 the buoy's. The facing shield is the forward one (nose-on).

| Case | Contact tick (seconds) | Closing speed | dam1 | dam2 | Forward shield / bank before | Damage past the shield | Outcome |
|------|------------------------|---------------|------|------|------------------------------|------------------------|---------|
| idle launch (real launch from Lave, idle controls, 175 m/s) | 6450 (53.75 s after the launch command) | 175 m/s | 427.948 | 131.527 | 128 / 256 | 299.948 | player dead, cause `{ scrape, buoy }`; buoy NOT destroyed (dam2 below its 250) |
| 250 m/s nose-on, placed 400 m out | 147 (1.225 s) | 250 m/s | 873.364 | 268.422 | 128 / 256 | 745.364 | player dead, cause `{ scrape, buoy }`; buoy destroyed, credited to the player |
| 350 m/s nose-on, placed 400 m out | 105 (0.875 s) | 350 m/s | 1711.793 | 526.107 | 128 / 256 | 1583.793 | player dead, cause `{ scrape, buoy }`; buoy destroyed, credited to the player |

Both the 250 and the 350 m/s ram are lethal, so the stop-and-report condition did not trigger. The idle straight launch is lethal, so the CHANGELOG death line carries the sentence naming it; 20-10 carries the matching UAT item, and 20-09's twin consumes the 350 m/s row.

## Intermediate-state audit (Task 1 item 14, call site by call site)

`buildSnapshotInputs` (`src/app/session/save-controller.ts:173`) is the only app caller of `snapshotForSave` (`rg -n 'snapshotForSave\(' src/app` prints exactly one line). Every trigger that reaches it:

| Trigger | Call site | Why a dead state cannot reach the refusal |
|---------|-----------|-------------------------------------------|
| pre-launch autosave (pre-roll) | `sim-driver.ts:289` | only after `liveState.mode === "docked"` is checked at `:274-281` |
| pre-launch autosave (manual clock) | `sim-driver.ts:331` | inside `currentState.mode === "docked" && stationScreen === "home"` |
| dock autosave | `event-router.ts:276` | runs on the `docked` event, which a dead state never emits (never stepped); a tick that docks leaves the mode `docked`, so `killPlayer` is a no-op on it |
| arrival autosave | `hyperspace-controller.ts:282` | runs on `hyperspaceJumped`; the jump tick skips the world (`worldStepped` false), so no NPC or collision record exists to kill; 20-02 proves the jump tick |
| purchases and fits | `station-controller.ts:414,525,574,631`, `start-session.ts:904` | docked station screens only |
| F2 manual save | `start-session.ts:713,719`, `save-controller.ts:641`, `openSaveScreen` | returns unless docked (`save-controller.ts:568-582`) |

If a dead state did reach one, the throw leaves `autosave()`, `manualSave()` or `writeManualSave()` at `buildSnapshotInputs`, before `queueSnapshot`, so nothing is written; `tests/app/session/save-controller.test.ts` pins that no-write outcome (it holds now and after 20-04's latch). No catch was added. Two `game-session.ts` entries (`:261`, `:295`) only forward to `saveController.autosave()` for the hyperspace and station controllers (the rows above).

## Files Created/Modified

See `key-files`. The new doc lines name the decision (D-04, D-11, DEATH-01), not the phase number, so Task 3's forward-reference gate over `src/sim` is empty.

## Decisions Made

- The culprit is resolved inside the sim as a key string (`world.store.get(source).specKey`, else `staticTargetById(source).identKey`); the type has no entity id (T-20-02).
- `killPlayer` is called outside the stepped-world condition so a lethal outcome on an unstepped world is applied rather than dropped; the stepped-world work is split around it (kills and push before, AI drain, commit and ident after).
- The `playerDestroyed` producer guard reports each offending line once and requires exactly one push in `death.ts` and exactly one call in `step.ts` (a missing push or call also fails).

## Pin maintenance after the full suite

The full suite showed no scenario that ended in an unintended death: `tick-parity`, `tick-flyers`, `sim-driver`, `collision-traffic.scenario`, `collision-cadence` and every other file outside the ones named in the plan passed unchanged. The only pins that moved are those the plan names:

| File | Subject | Change |
|------|---------|--------|
| `tests/sim/combat/collision-stage.test.ts` (350 m/s Krait ram) | the Krait kill credit | comment now explains survival by shield and bank (228.6, below the 256 bank), plus a no-`playerDestroyed` assertion; mode `inFlight` kept |
| `tests/sim/combat/collision-buoy.test.ts` (250 m/s case) | a destroyed buoy is no collider and never moves | the ram now asserts both destroyed and cause `{ scrape, buoy }` (dam1 873.364); the no-collider part flies a fresh live player through the same world and asserts `inFlight` at its end |
| `tests/sim/combat/ledger.test.ts` (two cases) | the lethal outcome | assert `outcome.playerDeath` with the source's key; a twin case without `outcome` keeps the old array and floor |
| `tests/sim/combat/npc-fire.test.ts` (floor case) | the energy floor | the energy-3 shot now kills; a second shot on the dead player is a no-op |

No twin literal moved (`ENERGY_AT_KILL`, `HASH_60_AFTER_KILL`, `TWIN_*`, `DAMAGE_*`): nothing was re-pinned. No file under `tests/golden`, `src/sim/npc`, `src/sim/world` or `src/content/generated/ships-npc.json` changed (`git diff --name-only d8b3716 HEAD -- ...` is empty).

## Mutual-kill-credit check

This plan reads and changes no NPC kill credit. `tests/guards/kill-credit-consumers.test.ts`, `ship-hit-consumers.test.ts` and `entity-id-scope.test.ts` pass unchanged (whole `tests/guards` directory green). The folded todo `2026-11-18-mutual-kill-credit-symmetry.md` stays open; 20-10 records the check.

## Deviations from Plan

### Auto-fixed Issues

None - no Rule 1 to 3 fixes were needed.

### Process notes

- **TDD gate (Task 1).** The plan sets Task 1 `tdd="true"` but requires one atomic commit (the retired guard fails on any partial change), so there is no separate `test(...)` commit before the `feat(...)` commit for the death behaviour; the behaviour tests (`death.test.ts`, the producer guard, the autosave cases) landed with the implementation in `b10e191`. The legacy 250 m/s buoy case failed against the committed death (RED) and was repaired in Task 2's `test(...)` commit. The plan frontmatter type is `execute`, not `tdd`.
- **Worktree bookkeeping files.** The shared git directory is outside the worktree, and the sandbox refused writes to it, so the `gsd-plan-head-before` ledger and the spawn-toplevel sentinel were not created. `plan_head_before` is the verified spawn base `d8b3716` and `commits` is measured with `git rev-list --count d8b3716..HEAD` (3 task commits at SUMMARY time).
- **Scratch location.** The ram measurement ran from the session scratchpad directory mounted at `/app/tests/zz-scratch` (the `/tmp/death-ram` path of the plan could not be created by the shell guard); nothing was added to the repository and the empty mount point was removed.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

The first full `docker compose run --rm test` ran while `lint` and another agent's test run shared the machine and reported five 5000 ms timeouts (`tick-flyers`, `combat/step` cadence, `attack-dispatch`, `tools-determinism` lint probe, `textures`); all five files and the guards passed on a rerun. (`textures.test.ts` is a known 5000 ms flake; the others were load-induced.)

## Plan-boundary verification

- `docker compose run --rm test` (HEAD `d3d8e3a`): exit 0, 281 test files and 7356 tests passed (10 skipped), coverage thresholds met (`death.ts` 100 % lines, `ledger.ts` 98.4 %).
- `docker compose run --rm lint`: exit 0 (eslint and prettier).
- `docker compose run --rm typecheck`: exit 0.
- No remote gate (`verify`) by the plan's gate policy: `src/sim`, one persistence guard and tests only.

## Known Stubs

None.

## Threat Flags

None. The `playerDestroyed` payload carries no entity id; no new endpoint, auth path or storage surface.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 2 (20-02 to 20-05) can build on `killPlayer`, the `dead` mode and `playerDestroyed.cause`. 20-04 adds the session latch and the controller guards in front of the `snapshotForSave` refusal. The suite is green with the death in place; the intermediate state (a player can die with no game-over view until 20-07) stays unpushed until the phase gate, as the owner accepted.

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*

## Self-Check: PASSED

Created files exist (`death.ts`, `death.test.ts`, `player-death-producer.test.ts`), the three task commits are ancestors of HEAD, the working tree held only this SUMMARY before its commit, and every acceptance criterion of Tasks 1 to 3 was run and passed.
