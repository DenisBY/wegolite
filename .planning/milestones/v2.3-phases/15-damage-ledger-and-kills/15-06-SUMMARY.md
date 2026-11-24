---
phase: 15-damage-ledger-and-kills
plan: 06
subsystem: sim
tags: [property-test, fast-check, kill-path, cross-cadence, snapshot-resume, found-18, found-19, qual-11]
status: complete

requires:
  - phase: 15-damage-ledger-and-kills
    provides: plans 15-04 and 15-05 (applyLedger, killShip, the second commit, drainAiEventsNow) and 15-02 (cargo, weapon, velocity fields, snapshot v4)
provides:
  - "tests/sim/combat/kill.property.test.ts: boundaryHolds, the three directed kill cases, a 50-run seeded random-fight property with non-vacuity floors, and totality properties for applyLedger, killShip and drainAiEventsNow"
  - "world-cadence.test.ts: kill cross-cadence determinism with cargo, a non-pristine weapon record and a velocity"
  - "snapshot.test.ts: 1,000-tick resume equality across a kill"
  - "15-VALIDATION.md signed off (nyquist_compliant true)"
affects: [16, 17, 18, 19, 20]

plan_head_before: 3253ff7eb935ae92bdcf5d2b1e11134d4665f44a
plan_head_after: 1076de697fd025988846a91e540d268defbb0b83
commits: 4

actuals:
  tokens: 18000
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "One boundary helper (boundaryHolds: no dead entity, empty aiQueue and fireQueue, snapshot -> JSON -> parseWorldSnapshot -> restoreWorld with equal hash and equal second snapshot) called after every step; later phases add a kill or spawn source as one more generator branch"
    - "A property that records the live run's decisions (fire key, spawn-now) and replays them on a world forked through the save path"
    - "Non-vacuity counters kept outside the property and asserted after fc.assert under a fixed seed"

key-files:
  created:
    - tests/sim/combat/kill.property.test.ts
  modified:
    - tests/sim/world/world-cadence.test.ts
    - tests/sim/world/snapshot.test.ts
    - .planning/phases/15-damage-ledger-and-kills/15-VALIDATION.md

key-decisions:
  - "The property counts a holder as told only when it was a live flight-script ship with a live nav.targetId and phase not done before the step; the escort script holds its leader through ownerId, not nav.targetId, so it is covered by the dangling-reference case of plan 15-05 and not by the holder-told assertion"
  - "The cadence scenario gives both victims zero energy recharge so the kill ticks (48 and 64) depend only on shot arithmetic, not on recharge rounding"

requirements-completed: [FOUND-19, FOUND-18]

coverage:
  - id: D1
    description: "A kill on the tick a ship spawns, two ships that kill each other on one tick (both spawn orders, D-04 credit by id) and a repeated kill request each leave a world that snapshots and round-trips with equal hash"
    requirement: "FOUND-19"
    verification:
      - kind: unit
        ref: "tests/sim/combat/kill.property.test.ts#a kill on the tick a ship spawns (tracer, FOUND-19, D-12)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/kill.property.test.ts#two ships that kill each other on one tick (D-04)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/kill.property.test.ts#a repeated kill request (FOUND-19)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Random fights hold the boundary at every tick, report each kill once, tell every flight-script holder before the tick ends and replay equal from a mid-fight snapshot; the property is not vacuous"
    requirement: "FOUND-19"
    verification:
      - kind: unit
        ref: "tests/sim/combat/kill.property.test.ts#random fights (FOUND-19, D-12)"
        status: pass
    human_judgment: false
  - id: D3
    description: "applyLedger, killShip and drainAiEventsNow are total on arbitrary ids, amounts, killers and handler faults, including a handler that writes out-of-domain values"
    requirement: "FOUND-19"
    verification:
      - kind: unit
        ref: "tests/sim/combat/kill.property.test.ts#the new sim functions are total (D-15)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Kills, cargo, a non-pristine weapon record and a velocity hash and land identically at 30, 60 and 144 Hz"
    requirement: "FOUND-18"
    verification:
      - kind: unit
        ref: "tests/sim/world/world-cadence.test.ts#kill cross-cadence determinism (FOUND-18, FOUND-19, QUAL-11)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A world restored from a snapshot taken before a kill stays equal to the live world for 1,000 ticks across the kill"
    requirement: "FOUND-19"
    verification:
      - kind: unit
        ref: "tests/sim/world/snapshot.test.ts#keeps a restored world equal to the live world for 1,000 ticks across a kill"
        status: pass
    human_judgment: false

duration: about 18 min including the local gate runs and the remote full test run
completed: 2026-11-16
---

# Phase 15 Plan 06: Kill boundary properties and cross-cadence kills Summary

**A seeded random-fight property proves, over 50 runs that provably contain kills, mutual kills, spawn-tick kills and flight-script holders, that every tick boundary holds no dead entity or queued event and snapshots through the save path, while a cargo-carrying kill scenario hashes and lands its kills on ticks 48 and 64 at 30, 60 and 144 Hz.**

## Accomplishments

- `tests/sim/combat/kill.property.test.ts` (new, 1,175 lines after Prettier). `boundaryHolds` is the one invariant helper: no dead entity in `store.live`, empty `aiQueue` and `fireQueue`, then `snapshotWorld`, `JSON`, `parseWorldSnapshot`, `restoreWorld`, equal `hashWorld` and an equal second snapshot. A comment names the Phase 16 extension point.
  - Directed cases (Task 1, the tracer): kill on the spawn tick (spawned with `spawnTick = player.tick + 1`, `player.tick` after the step equals it, one `shipDestroyed` for `PLAYER_ID`, one `entityRemoved`, the next spawn gets a fresh id; the comment names that Phase 15 has no in-step spawn source); mutual kill in both spawn orders (the lower-id victim credited to the other ship, the higher-id victim to `NO_ENTITY`, D-04); a repeated kill request (player shot plus a test shooter's shot give one kill, a later `killShip` returns false and leaves the hash unchanged, and a second `killShip` on a ship already marked dead returns false with no event).
  - Random fights (Task 2): 1 to 6 ships from the nine NPC records with `maxEnergy` biased to 1, each inert, a firing test pilot (nose-on to the player, the weakest other ship or a generated ship, delayed first think), a native-steered flight-script "attack" or "intercept" ship, or an "escort" with a generated `ownerId` and `escortSlot`; a duel branch (two one-energy Vipers 1,000 m apart nose to nose); a spawn-now branch (a one-energy Adder 300 m on the nose, spawned between steps with `spawnTick = player.tick + 1` only when the fore pulse laser is ready by the `rechargeTicks`, temperature and energy gates, with the fire key forced down on that step); a 20 to 60 step fire script. Driven through `stepSim` with the real hulls, NPC weapons and flight table. Assertions: the boundary after every step; per id at most one `shipDestroyed` (ship ids only), exactly one `entityRemoved` after it, no `aiFaulted`, every killer nobody, the player or a ship alive at that moment; every surviving flight-script holder of a ship killed on a step has phase "done" at the end of that step (the real `onEvent` ran under `stepSim`); a fork through the save path at a random tick replayed with the live run's recorded actions ends with the same hash and the same event stream.
  - Totality (Task 2, 100 runs each, fixed seeds): `applyLedger` never throws and returns live, sorted, unique ship victims; `killShip` never throws and a refused call changes neither hash, events nor queue; `drainAiEventsNow` with an injected registry whose `onEvent` throws, records, fires or writes `NaN`, `Infinity` or `1e300` into `ai.params` never throws, leaves `aiQueue` empty and `fireQueue` at its entry length, and the world snapshots and round-trips after the commit.
- `tests/sim/world/world-cadence.test.ts`: describe "kill cross-cadence determinism (FOUND-18, FOUND-19, QUAL-11)": a `KillScenario` with a cargo-3 Adder (30 energy, killed by the player's held pulse laser), a Sidewinder (20 energy, killed by a firing Viper test pilot), and the Viper carrying `weapon` (12.5, 7, 2) and `velocity` (1, 0, 0). 720 ticks at 30, 60 and 144 Hz; hash samples every 30 ticks and on every kill tick; the section text is captured at start + 30 and contains `;cargo:3`, `;wpn:` and `;vel:` while the Adder is still alive.
- `tests/sim/world/snapshot.test.ts`: "keeps a restored world equal to the live world for 1,000 ticks across a kill": a snapshot after a 10-tick warm-up and before the lethal hit; live and restored worlds (and players and combat states) stay equal every tick over `COMPARE_TICKS`; both emit the same `shipDestroyed` and `entityRemoved` on the same tick (after the snapshot); the flight-script holder of the victim is "done" in both; a later spawn never reissues the victim's id.
- `15-VALIDATION.md`: the per-task map marked passed for plans 15-01 to 15-06 in six sequential waves, the manual-only table rewritten with each remote run and its HEAD, `nyquist_compliant: true` and `wave_0_complete: true`.

## Run results

- **Property file wall time:** `kill.property.test.ts` runs in about 1.1 s to 2 s in the local container (the 50-run random-fight test about 0.9 to 1.7 s), far inside the slow-machine budget.
- **Non-vacuity counters under the fixed seed 20261116 (50 runs):** 46 runs with a kill (floor 25), 22 with a mutual kill, 35 with a kill on the spawn tick (20 of them the dedicated spawn-now ship), 4 with a kill whose victim had a surviving flight-script holder. No floor was tuned.
- **Kill ticks per cadence:** identical at 30, 60 and 144 Hz: the Sidewinder (id 102) destroyed by the Viper (id 103) on tick 48, the Adder (id 101) destroyed by the player (100) on tick 64, each removed on the same tick; the run ends at tick 722. The Adder's kill tick 64 is later than the pinned section tick 32, as asserted.
- **Mutation checks (all restored):** removing the `drainAiEventsNow` call in `resolveShots` fails the property (the AI queue is not empty at the boundary, 3 cases fail); replacing the killer normalisation in `killShip` with `return killer` fails the mutual-kill case (`[102, 101]` instead of `[102, 0]`) and the property ("credited to a dead killer").
- **Gates:** local container `lint` and `typecheck` clean; the three Task files pass locally (27 tests); remote `wegolite-remote-run.sh run --rm test` at committed HEAD `d3a69c9`: exit 0, 207 files, 5245 passed, 10 skipped, coverage thresholds met, 66 s. No `verify` and no acceptance run: this plan changes tests and planning docs only (no `src/sim` fix was needed), as its gate policy states.

## Task Commits

1. **Task 1: the three directed kill cases and the snapshot round trip (tracer)** - `32fbcfb` (test)
2. **Task 2: random-fight boundary property and totality properties** - `e5dde0d` (test)
3. **Task 3: kill cross-cadence scenario and 1,000-tick resume** - `d3a69c9` (test)
4. **Task 3: validation sign-off** - `1076de6` (docs)

The tracer gate: Task 1's verify (the file's five tests) passed before expansion.

## Deviations from Plan

None - plan executed exactly as written. The plan's Task 3 was committed as two commits (tests, then the validation sign-off) because the sign-off records the remote full-test run, which needs the tests committed first.

## Defects found in src/sim

None. The property, the totality runs and the cadence scenario passed against the code of plans 15-04 and 15-05 without a source change, so no acceptance run was required.

## Known Stubs

None.

## Threat Flags

None. Tests and planning documents only. T-15-17, T-15-18, T-15-19 and T-15-22 are mitigated as the plan states: the boundary and round trip after every tick, the cross-cadence kill scenario, a 1 to 2 second property file, and a fixed seed with a biased generator and counters asserted after `fc.assert`.

## Owner-decision state

- OD-1 (golden regeneration order) and OD-2 (D-05 narrowing: the closed sets need no edit) stay pending owner acknowledgement; nothing here approves them. The validation sign-off is the executor's strategy sign-off, not an owner decision.
- This is the last plan of Phase 15: FOUND-18 (fields, hash, snapshot v4, cargo at spawn, cadence kills) and FOUND-19 (ledger, kill path, notifications, boundary property) are complete; the phase is ready for verification.

## Self-Check: PASSED

- Files exist: `tests/sim/combat/kill.property.test.ts`, `tests/sim/world/world-cadence.test.ts`, `tests/sim/world/snapshot.test.ts`, `.planning/phases/15-damage-ledger-and-kills/15-VALIDATION.md`.
- Commits `32fbcfb`, `e5dde0d`, `d3a69c9` and `1076de6` are ancestors of HEAD; `commits: 4` is measured from the plan-head ledger (`3253ff7..HEAD`).
- Acceptance greps: `restoreWorld(`, `fc.assert` (4), `drainAiEventsNow` (5), `createFlightScriptAi` (3), `seed: <digits>` (4), `rechargeTicks` (1), `kill cross-cadence` (1), `serializeWorldSection` (3), `shipDestroyed` in snapshot.test.ts (3) and `^nyquist_compliant: true` (1) all present.
