---
phase: 21-roster-state-shape-and-seams
plan: 09
subsystem: sim-seams
tags: [retire-ship, hit-reaction, world-view, departure-guard, pitfall-C6, pitfall-C11, FOUND-20]
requires:
  - phase: 21-06
    provides: World.groups and PlayerCombatState.standing, the records the widened view reads
  - phase: 21-03
    provides: the v5 entity fields (bounty, role, groupId, cargo) the ship view reports
provides:
  - retireShip and RetireReason, the non-lethal removal path (src/sim/world/retire.ts)
  - tests/guards/departure-path.test.ts, the guard that keeps killShip and retireShip call sets apart
  - HitReaction and the optional reaction sink of applyLedger and resolveShots
  - ShipView.bounty, .role, .groupId, .energy, .maxEnergy, .cargo, .accuracy, .escortSlot, .ownerId
  - WorldView.playerStanding() and WorldView.groupLeader(groupId); createWorldView's optional trailing standing
affects: [21-12, phase-23, phase-25]
tech-stack:
  added: []
  patterns: [optional output sink on a pure stage, read-only view members copied on read, call-site allow-list tripwire]
key-files:
  created:
    - src/sim/world/retire.ts
    - tests/sim/world/retire.test.ts
    - tests/guards/departure-path.test.ts
    - tests/sim/combat/hit-reaction.test.ts
  modified:
    - src/sim/world/kill.ts
    - src/sim/combat/ledger.ts
    - src/sim/combat/step.ts
    - src/sim/world/view.ts
    - src/sim/world/view-impl.ts
    - tests/sim/world/view.test.ts
    - tests/sim/ai/flight-script.test.ts
    - tests/sim/ai/test-pilot.test.ts
    - tests/sim/npc/oracle-runner.ts
key-decisions:
  - "retireShip checks entity.dead and kind itself and returns false for anything but a live ship; reason is accepted and unused (never stored, hashed or evented)"
  - "The hit-reaction stage reads the applied record, not the shipHit event; the lethal flag is once per victim per call, and every other applied laser record (the doomed ship's later hits included) is still recorded, unflagged"
  - "Reaction energyRemaining uses the value the ledger wrote (floored), never a re-read of entity.energy, because tests/sim/combat/step.test.ts pins that energy is not read after its write"
  - "A buoy's or the station's reaction carries the buoy's remaining health or the station's staticHealth, which the ledger never lowers; a buoy subentity records its remaining energy and is never lethal"
  - "StandingView is declared in view.ts (structural twin of PlayerStanding) so the view module stays types-only; view-impl imports the PlayerStanding type"
  - "shipHit discretion: the hit-reaction stage is not the first shipHit consumer; tests/guards/ship-hit-consumers.test.ts and the doomed-target todo are untouched"
status: complete
commits: 3
plan_head_before: e7a3a61543954efca635af1f6123856c69fcbfa2
plan_head_after: 6c6024421a611249614b605df8bd38fb17d82452
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
requirements-completed: [FOUND-20]
---

# Phase 21 Plan 09: retireShip, the hit-reaction stage and the widened view Summary

**Three seams later phases share land with pin tests and no consumer in ordinary play: `retireShip` (a departure that never dies), the ledger's `HitReaction` stage (every applied laser hit with its aggressor, the lethal one flagged), and the read side of the widened `WorldView`; the frozen run is 21 of 21.**

## Tracer and task results

| Task | Commit | What it proved |
| ---- | ------ | -------------- |
| 1 (tracer) | `85055a16` | `retireShip` end to end: a targeted ship is retired, the holder gets exactly one `shipTargetLost`, the commit reports the removal, no `shipDestroyed`, no debris or cargo, `nextId` unchanged; the departure guard and its synthetic cases |
| 2 | `d4eed3a1` | `HitReaction` and the sink of `applyLedger` and `resolveShots`, the two-shot lethal case, scrape and unapplied cases, the sink-changes-nothing proof and a totality property |
| 3 | `6c602442` | `ShipView` and `WorldView` read members, the pins, the `groupLeader` property, hand-built test views brought up to date |

The tracer gate (auto mode): Task 1's targeted run (`retire`, `departure-path`, `kill-credit-consumers`, `kill`; 81 passed) went end to end before Task 2 started.

## The retireShip contract and its guard

`retireShip(world, id, reason): boolean` in `src/sim/world/retire.ts`. It returns false (and changes nothing) for a missing id, a dead entity, a static, the player, a cargo or wreckage entity and any non-finite or fractional id. Otherwise it marks the ship dead through `world.store.kill` and posts `shipTargetLost` through `postAiEvent` to every other live ship whose `nav.targetId` is the id, in ascending id, as `notifyKill` does. It posts no `shipDestroyed`, releases no debris, credits nothing, draws from no stream and never mentions the kill-credit word. The normal commit reports the id (`entityRemoved` is emitted by the committing caller). `reason` (`docked`, `jumped`, `landed`, `expired`) is never stored or hashed. The fast-check property over random worlds and id sequences shows: never throws, true at most once per id, survivors' fields and streams byte-identical, `nextId` unchanged, the queue holds only `shipTargetLost`.

`tests/guards/departure-path.test.ts` (comment-stripped `src/**`): a `killShip(` token only in `kill.ts` (definition), `world/step.ts` (energy 0) and `combat/step.ts` (the kill loop); `retireShip(` only in `retire.ts`. The rule string names pitfall C11 and that Phase 23's departure stand-in updates the allow-list in its own commit. A vacuity floor, synthetic failing inputs with file and line, and a comment-only pass are covered. `kill.ts`'s module claim now names both removal paths.

## The HitReaction shape and lethal rule

`HitReaction { victim, aggressor, kind: "laser", lethal, energyRemaining }` is pushed to an optional trailing `reactions?: HitReaction[]` of `applyLedger` (and passed through `resolveShots`), one per applied laser record in ledger order, after the record is applied, whatever the target kind (ship, pod, buoy, buoy subentity, station, the player).

- `lethal` is true on the first record of the call that takes the victim's energy (or health) to 0 or below (for the player, the record that satisfies the Phase 20 death condition), once per victim; later hits on the doomed victim are recorded unflagged.
- A `"scrape"` record produces none (`takeScrapeDamage` is not an offence); it still applies as before.
- Unapplied records (bad amount, missing or dead target, no world, a wreck, a dead player) produce none.
- No sink: identical events, lethal list, outcome, combat state and `hashWorld` (a test with and without a sink proves it; the existing suites and twin literals are unchanged).

The property over arbitrary ledgers (laser and scrape in random order, NaN, negative, huge and infinite amounts, missing and non-entity sources, the player, the station and both buoys) never throws, pairs one reaction with each applied laser `shipHit` in order, flags lethal at most once per victim and leaves events and state equal to the sink-less run.

## The view members added

`ShipView` gained `bounty`, `role`, `groupId`, `energy`, `maxEnergy`, `cargo`, `accuracy` (`steer.accuracy`), `escortSlot` (`steer.escortSlot`) and `ownerId`, each documented with the entity field it reads. `WorldView` gained `playerStanding()` (a fresh `{ legalStatus, kills }` copy, pristine `{0, 0}` when `createWorldView` got no standing) and `groupLeader(groupId)` (linear scan of `World.groups`, `NO_ENTITY` otherwise). `createWorldView` takes an optional trailing `standing?: PlayerStanding`; no call site passes it (Phase 25 does). `ShipControl` is untouched (`control.ts` and `control-impl.ts` show no diff; 21-12 adds the fire facing). The exhaustive `Record<keyof WorldView, true>` pin was updated deliberately and a matching `Record<keyof ShipView, true>` pin added.

## The shipHit discretion outcome

The hit-reaction stage is not the first `shipHit` consumer: it reads the applied record. `tests/guards/ship-hit-consumers.test.ts`, `tests/guards/kill-credit-consumers.test.ts` and the doomed-target todo `2026-11-17-skip-shiphit-for-a-doomed-target.md` are untouched (empty diff against the plan base); the todo stays parked for its audio or flash consumer.

## Gates

| Gate | Result |
| ---- | ------ |
| Task 1 targeted (retire, departure-path, kill-credit-consumers, kill) | 81 passed |
| Task 2 targeted (hit-reaction, ledger, step, ship-hit-consumers, kill-credit-consumers, tick-parity) | 153 passed |
| Task 3 targeted (view, control) | 80 passed |
| `docker compose run --rm typecheck` | clean (after updating four hand-built views and one field name, see Deviations) |
| `docker compose run --rm test` | 298 files, 8168 passed, 10 skipped. A first full run under load reported 3 failures (two named: `tests/sim/npc/attack-dispatch.test.ts` and `tools/oolite-ingest/convert/textures.test.ts`, both 5 s test timeouts that passed alone); the rerun of the whole suite was green. Recorded per the brief; no timeout changed |
| `docker compose run --rm lint` | clean after prettier on two test files |
| Remote 20-seed NPC acceptance (`test npm run test:acceptance`, snapshot `6c602442`) | exit 0, 1 file, 21 of 21 passed (epochs 1-20 plus the aggregate), 84.7 s |

The acceptance run is the frozen QUAL-12 check: no thresholds or detectors changed, no twin literal or golden moved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hand-built `WorldView` and `ShipView` fixtures failed typecheck**
- **Found during:** Task 3 plan gate (`typecheck`; Vitest does not typecheck, so the targeted runs were green)
- **Issue:** `tests/sim/ai/flight-script.test.ts`, `tests/sim/ai/test-pilot.test.ts` and `tests/sim/npc/oracle-runner.ts` build `ShipView` and `WorldView` literals by hand and lacked the new members
- **Fix:** added the members (inert values; the oracle runner's `entityShip` reads the entity); not in the plan's `files_modified`
- **Files modified:** the three files above
- **Commit:** `6c602442`

**2. [Rule 1 - Bug] `retire.test.ts` read a non-existent `world.nextId`**
- **Found during:** the same typecheck
- **Issue:** the counter is `world.store.nextId`; the Task 1 test passed under Vitest because the undefined comparison was equal on both sides
- **Fix:** read `world.store.nextId`; the assertion now bites
- **Files modified:** `tests/sim/world/retire.test.ts`
- **Commit:** `6c602442`

**3. [Rule 1 - Bug] The reaction read `entity.energy` after the ledger's write**
- **Found during:** Task 2 verify (`tests/sim/combat/step.test.ts` pins that energy is never read after its write)
- **Fix:** the reaction carries the floored value the ledger wrote
- **Files modified:** `src/sim/combat/ledger.ts`
- **Commit:** `d4eed3a1`

**4. [Formatting] Prettier on `tests/sim/combat/hit-reaction.test.ts` and `tests/sim/world/view.test.ts`** (lint gate), in `6c602442`.

No architectural change, no re-pin, no package change.

## Known Stubs

None. `retireShip`, the reaction sink and the new view members have no production consumer by design (Phase 23 and Phase 25 are the first); each is covered by tests and, for the two removal paths, a guard.

## Threat Flags

None beyond the plan's register: T-21-17 (departure credit) is mitigated by `retireShip` having no credit pair and the departure guard; T-21-18 (dropped lethal offence) by the flagged-lethal reaction and its two-shot test; T-21-19 (view leaking mutable state) by the copying `playerStanding()` and scalar-only members.

## Self-Check: PASSED

- `src/sim/world/retire.ts`, `tests/sim/world/retire.test.ts`, `tests/guards/departure-path.test.ts`, `tests/sim/combat/hit-reaction.test.ts`: present.
- Commits `85055a16`, `d4eed3a1`, `6c602442` are ancestors of HEAD.
- Acceptance greps: `export function retireShip` 1, `retireShip` in `kill.ts` 1, `export interface HitReaction` 1, `fc.assert|property` in the reaction test 2, `playerStanding|groupLeader` in `view.ts` 3; empty diffs for `ship-hit-consumers.test.ts`, the todo, `control.ts` and `control-impl.ts`.
- STATE.md and ROADMAP.md not modified.
