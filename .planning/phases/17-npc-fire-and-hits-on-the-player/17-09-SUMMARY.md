---
phase: 17-npc-fire-and-hits-on-the-player
plan: 09
subsystem: simulation
tags: [npc, npc-vs-npc, kill-path, mutual-kill, cadence, snapshot, properties, d-03, d-10]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: the gated drain and test-pilot ask (17-05), the steering fire route and fire sites (17-06), the live weapon temperature (17-07), the fire-site fixtures against the port (17-08)
provides:
  - tests/sim/combat/npc-vs-npc.scenario.test.ts (13 tests): NPC-kills-NPC through both fire routes, the ledger order, the D-10 mutual kill
  - tests/sim/npc/fire-cadence.test.ts (6 tests): an opted-in fight at 30, 60 and 144 Hz and the mid-fight snapshot round trip
  - an opted-in random-fight property in kill.property.test.ts and a recording-fire steering property in steering.property.test.ts
  - the Key Decisions row "Same-tick mutual kill between NPCs: credit asymmetric by ascending id (D-10)"
affects: [17-10]

plan_head_before: e4dff01461c091170d81da8402c261f6c289f916
plan_head_after: 4c326467eaafc015c86edd9d72fe3d95d0f73b0b
commits: 2

actuals:
  tokens: 13600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "an Arena that composes stepWorld and resolveShots by hand with a recording AI registry (the two shipped modules wrapped only to log delivered events), so kill notifications are observable with no new onEvent in src"
    - "every bounded wait returns {ticks, ended} and the test asserts ended (the vacuity guard)"
    - "a shooter whose beam passes beside its target is built from a hand-set accuracy and a target inside the aim circle but outside the hull, so missedShots is a real fight outcome"

key-files:
  created:
    - tests/sim/combat/npc-vs-npc.scenario.test.ts
    - tests/sim/npc/fire-cadence.test.ts
  modified:
    - tests/sim/combat/kill.property.test.ts
    - tests/sim/npc/steering.property.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "The mutual-kill seeds are 7 (low id faces -Z) and 13 (low id faces +Z); under both the first firing tick is the spawn tick (tick 1) and both ships fire on it. Seed 22 is recorded as the counter-example (only the higher id fires first) and is never accepted by loosening an assertion"
  - "Opted-in scripted attackers in the random fights start with the nose on their target, as pilots do: with the generator's identity orientation they never reached a fire site inside the 80 to 240 ticks of a run (scriptShots 0)"

requirements-completed: [CBT-15, CBT-16]

coverage:
  - id: D1
    description: "An opted-in test pilot shoots an inert Adder (13 energy) through the gate: three 6-point hits, shipDestroyed with the live Viper as killer and entityRemoved on the same tick, shipTargetDestroyed and shipKilledOther to the killer, its hold returning to seek, debris on the kill tick with content and none without; two runs equal per tick"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-vs-npc.scenario.test.ts#a test pilot shoots an NPC to zero energy through the gate and the kill path (tracer, D-03, D-12)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two opted-in flight-script attackers fight through the steering route: the weaker (10 energy against 40) dies through the kill path credited to the other, the holder of the victim (and only it) is told shipTargetLost, the survivor's script is done and a second shipTargetLost changes nothing; the run replays exactly"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-vs-npc.scenario.test.ts#two opted-in attackers fight each other through the steering route (D-05, D-12, D-16)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/npc-vs-npc.scenario.test.ts#the steering-route fight replays exactly (QUAL-11)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two shooters hit a third on one tick in ascending shooter id; the first lethal record's source is the killer (the higher id at 7 energy, the lower id at 1 energy), one shipDestroyed"
    requirement: CBT-16
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-vs-npc.scenario.test.ts#two ships hit a third on one tick: the ledger runs in ascending shooter id (D-16)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Same-tick mutual kill (D-10) through the gate in both spawn orders and through the steering route: victims die in ascending id, the lower-id victim is credited to the other ship, the higher-id victim carries NO_ENTITY; bounded loop to the first firing tick, both ships fired on it"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-vs-npc.scenario.test.ts#a same-tick mutual kill between NPCs: credit stays asymmetric by ascending id (D-10)"
        status: pass
    human_judgment: false
  - id: D5
    description: "An opted-in fight (steering attacker, test pilot at the player, a stray shooter that misses) has an identical tick-indexed hash log and shot-tick list at 30, 60 and 144 Hz over 1,200 ticks, with at least 20 shots from each of the two main shooters"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-cadence.test.ts#an opted-in fight at 30, 60 and 144 Hz (QUAL-11, criterion 1, D-17)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A world snapshotted 600 ticks into the fight, with heat, missedShots and lastShotTick set, restores every entity, weapon record (float32 temperature) and AI params (the fire key) deeply equal, with the same entity hashes and world hash"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-cadence.test.ts#a world snapshotted mid-fight restores equal (D-17)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Random fights with opted-in pilots and scripted attackers hold every boundary invariant, report each kill once, never throw and need no sanitiser repair; random steering with a recording fire never throws and requests at most once per update"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/combat/kill.property.test.ts#random fights with opted-in pilots (CBT-15, D-17)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/steering.property.test.ts#steering with a recording fire is total and asks at most once per update (D-17)"
        status: pass
    human_judgment: false
  - id: D8
    description: "The D-10 Key Decisions row exists and names the Oolite order, the tripwire and the pinning scenario"
    requirement: CBT-15
    verification:
      - kind: other
        ref: "rg -c 'Same-tick mutual kill between NPCs' .planning/PROJECT.md == 1"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-11-19
status: complete
---

# Phase 17 Plan 09: NPC fights NPC in Vitest Summary

**An NPC shot to zero energy by another NPC now provably leaves the world through Phase 15's kill path by both fire routes, the D-10 same-tick mutual kill is pinned and recorded, an opted-in fight is identical at 30, 60 and 144 Hz and across a mid-fight snapshot, and random fights and steering with fire are total. Tests and one Key Decisions row only; no `src` change, so no acceptance run.**

## Performance

- **Duration:** 27 min (about 2026-11-19T02:30Z to 02:57Z)
- **Tasks:** 2 (Task 1 a tracer)
- **Files:** 2 created, 3 modified; 1,306 insertions and 2 deletions over the two commits

## Commits

| Commit | Subject | Role |
|--------|---------|------|
| `f627b61` | `test(17-09): an NPC shot to zero energy by another NPC dies through the kill path (D-03, D-12, D-16)` | Task 1: the tracer, the steering-route fight and the ledger order |
| `4c32646` | `test(17-09): the NPC mutual kill, the cadence and snapshot proofs and the fire properties (D-10, D-17)` | Task 2: the mutual kill, `fire-cadence.test.ts`, the two properties and the D-10 row |

`commits: 2` measured with `git rev-list --count` from `plan_head_before` `e4dff01`.

## Scenarios, bounds and numbers

The scenario file composes `stepWorld` and `resolveShots` by hand (the composition of `stepSim` without the player's own flight) with a recording AI registry: the two shipped modules (`TEST_PILOT`, `FLIGHT_SCRIPT`) wrapped so that every delivered event is logged. No `onEvent` was added in `src`. The player is parked at 1e9 and no combat state is passed, so it is never in a firing line.

| Scenario | Setup | Bound | Result |
|----------|-------|-------|--------|
| Tracer: pilot kills an Adder | Viper test pilot (fire, hold) 1,000 m from an inert Adder, 13 energy, no recharge, cargo 40; seed 7 | 1,500 ticks | kill on tick 25 (hits at 1, 13, 25: 13 -> 7 -> 1 -> -5); events laserFired, shipHit, shipDestroyed (killer Viper), entityRemoved on tick 25; Viper told shipTargetLost, shipTargetDestroyed, shipKilledOther on tick 25; hold returns to seek within 60 ticks; with the debris fixture pieces spawn on tick 25 |
| Steering route fight | two Vipers 1,500 m apart, scripted attack with `fire: true`, energies 40 and 10, plus one non-firing holder of each fighter 100 km away; seed 7 | 6,000 ticks | the 10-energy fighter dies credited to the other; the holder of the victim alone gets shipTargetLost; survivor's script `done`, behaviour IDLE; a second shipTargetLost changes no param |
| Ledger order | two pilots 16 m apart on one tick at an Adder 1,000 m ahead; seed 7 | 200 ticks | first firing tick is tick 1 and both fire; hits in ascending shooter id; with 7 energy the higher id is the killer, with 1 energy the lower id |
| Mutual kill, gate route | two 1-energy pilots nose to nose 1,000 m apart, both spawn orders; seeds 7 and 13 | 200 ticks | first firing tick 1, both fire, destroyed `[low, high]` with killers `[high, NO_ENTITY]`, both removed, no AI delivery (both ships are dead when the queue is drained) |
| Mutual kill, steering route | two 10-energy scripted attackers, seed 7 | 6,000 ticks | both destroyed on tick 15, killers `[b, NO_ENTITY]` |

Every bounded loop returns `{ticks, ended}` and the test asserts `ended` and `ticks < bound`.

### Mutual-kill seeds

A scratch pass (inside the target file, removed before commit) over seeds 1 to 40 and both spawn orders: on the first firing tick (tick 1 in every case) both ships fire for every seed except 22, where only the higher id fires and kills the other before it can answer. Seeds 7 (the low id faces -Z) and 13 (the low id faces +Z) are fixed in `MUTUAL_SEEDS`; seed 22 is recorded in the test's comment as the counter-example.

### Cadence and snapshot

- `fire-cadence.test.ts`: 1,200 ticks, three opted-in shooters (a scripted attacker on a 1e6-energy Adder, a test pilot at the player with 20 energy, a stray pilot whose beam passes 50 m beside an Adder 2,000 m away, its accuracy set to 0 by hand). The tick-indexed hash log (1,200 entries) and the shot list are identical at 30, 60 and 144 Hz. At least 20 shots from each of the attacker and the pilot (asserted); the stray fires twice (each a miss, `missedShots` 2, then the tightened aim circle stops it); no two shots of one ship closer than 12 ticks; the attacker's weapon reaches 195 at tick 903 (heat live).
- Snapshot at 600 ticks after the spawn: a hot weapon (the attacker), `lastShotTick` set (all) and `missedShots` 2 (the stray) are present; `restored.store.live` equals the original, every weapon and AI params record equals one by one (the `fire` key on all three shooters), float32 temperature is bit-identical, `entityHashes` and `hashWorld` (with the player's combat state) equal, and equal to the hash logged at that tick.

### Properties

| Property | Runs | Evidence |
|----------|------|----------|
| random fights, opted-in (seed 20261709) | 40 | boundary invariants and zero repairs every tick; tallies: 78 pilot shots, 27 scripted-attacker shots, 34 NPC-credited kills in 25 runs, 39 runs with a kill, 20 mutual-kill runs, 28 runs with debris content; floors 30 / 10 / 10 / 10 / 10 |
| steering with a recording fire (unseeded) | 150 | 16,350 updates, 6,113 requests, 103 runs with at least one, never more than one per update, always finite, unit, sanitiser repairs nothing; floors 500 requests and 30 runs |

## Verification

| Check | Result |
|-------|--------|
| Task 1 verify: `npc-vs-npc.scenario.test.ts` | 9 tests passed (the Task 1 set); `Tracer verified end-to-end - expanding` |
| Task 1 acceptance: `tests/guards` | 13 files, 256 passed |
| Task 2 verify: the four files | 4 files, 73 passed |
| `docker compose run --rm test` (full, coverage thresholds) | 235 files, 6427 passed, 10 skipped, exit 0 |
| `docker compose run --rm lint`, `docker compose run --rm typecheck` | clean (run before the full suite, not concurrently with it) |
| Acceptance criteria | `test -f` both new files; `rg -c "Same-tick mutual kill between NPCs" .planning/PROJECT.md` == 1 |

`verify`, `verify-full` and the 20-seed acceptance run were not run: tests and one planning row, no `src` change (plan gate policy).

## Deviations from Plan

**1. [Rule 1 - Bug in the plan's premise] A scripted attacker with the generator's identity orientation never reached a fire site.** Found during: Task 2 (random fights). With `fire: true` added to the script role, 40 runs gave 0 script shots: the attackers spawned facing -Z with targets anywhere else, and a run is only 80 to 240 ticks. Fix: an opted-in scripted attacker starts with its nose on its target (as the generator already does for pilots), and the script is tiled four times. Files: `tests/sim/combat/kill.property.test.ts`. Existing properties are unchanged (the field is absent unless the opt-in map sets it). Commit: `4c32646`.

**2. [Plan detail] The snapshot case's `missedShots` comes from a third shooter, not from the two named fights.** Both main fights hit every shot (`missedShots` floors at 0 on a hit), so a real miss needed a shooter whose beam passes beside a target inside its aim circle; `fire-cadence.test.ts` carries a stray pilot with a hand-set accuracy for that. Not a deviation of behaviour; recorded because the plan's "a non-zero missedShots" would otherwise have been set by hand.

**3. [Plan detail] Energy of the steering-route fight.** The first draft used 20 and 20 energy: both attackers starved at 0.5 energy (each paid 0.5 a shot with no recharge, and 3 hits of 6 left 0.5), so nobody died. Energies 40 and 10 give a deterministic single kill; 10 and 10 is the steering-route mutual kill.

**Total deviations:** 3 (1 generator premise fixed, 2 test-design notes). **Impact:** none on `src` or on any existing property.

## Authentication Gates

None.

## Owner questions (recorded, not blocking)

1. Informational, carried from 17-05 and 17-07: D-07 shot period (`round(rate x 120)`: 12, 300, 12, against the literal Oolite counts 13, 301, 13). The cadence file asserts only "no two shots closer than 12 ticks" and the 20-shot floors, so a change would not move a pinned number here; the scenario tick 25 kill (shots at 1, 13, 25) would move to 27.
2. Informational: the first firing tick of the mutual-kill and ledger scenarios is the spawn tick for every seed except 22. If the owner wants the case where the two ships do not fire on the same tick pinned as well (the higher id firing alone and winning), seed 22 is the ready example.

## Known Stubs

None.

## Threat Flags

None: tests and one planning row, no endpoint, auth path, file access or schema change. T-17-20 (credit differs from Oolite) is recorded by the D-10 row and pinned by the mutual-kill scenarios; T-17-21 (a random fight or steering context throwing) is covered by the two new properties.

## Self-Check: PASSED

- Files found: `tests/sim/combat/npc-vs-npc.scenario.test.ts`, `tests/sim/npc/fire-cadence.test.ts`, `tests/sim/combat/kill.property.test.ts`, `tests/sim/npc/steering.property.test.ts`, `.planning/PROJECT.md`.
- Commits `f627b61` and `4c32646` are ancestors of HEAD; `commits: 2` measured from `plan_head_before` `e4dff01`.
- `rg -c "Same-tick mutual kill between NPCs" .planning/PROJECT.md` is 1; the full suite, `lint` and `typecheck` exit 0.
