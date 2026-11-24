---
phase: 15-damage-ledger-and-kills
plan: 04
subsystem: sim
tags: [damage-ledger, kill-path, found-19, second-commit, ident, browser-kill-step, vitest-twin]
status: complete

requires:
  - phase: 15-damage-ledger-and-kills
    provides: plans 15-01 to 15-03 (record fields, snapshot v4, cargo at spawn); Phase 13 HitRecord resolution and the ident lock
provides:
  - "applyLedger and LethalHit (src/sim/combat/ledger.ts): the tick's HitRecords applied once after the world step, lethal victims reported with the first lethal source"
  - "killShip (src/sim/world/kill.ts): the one idempotent, total kill path with the D-04 killer normalised at the call"
  - "resolveShots tail: ledger, kills in ascending victim id, second commitWorld on every stepped tick, then the ident update"
  - "a browser kill step in tests/e2e/combat.spec.ts and its Vitest twin in tests/app/session/tick-parity.test.ts"
  - "PROJECT.md Key Decisions row 'Destroy a ship at zero energy through one damage ledger and one kill path (supersedes N2)'"
affects: [15-05, 15-06, 16, 18, 20]

plan_head_before: 0e654af8705af0e6ca032278b5a60ed11fa84548
plan_head_after: ed6b9f2014bc36bb81a6c17b1a5e6ba8ce754266
commits: 2

actuals:
  tokens: 30000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Ledger then kill: apply every record, decide lethality afterwards, mark dead in ascending victim id with the killer re-checked at kill time"
    - "A Vitest twin of a browser step, run first through the real session driver, router and probe hook, pins the budget locally"

key-files:
  created:
    - src/sim/combat/ledger.ts
    - src/sim/world/kill.ts
    - tests/sim/combat/ledger.test.ts
    - tests/sim/world/kill.test.ts
  modified:
    - src/sim/combat/step.ts
    - src/sim/world/world.ts
    - src/sim/events.ts
    - src/sim/combat/shields.ts
    - tests/sim/combat/step.test.ts
    - tests/sim/world/world-cadence.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/e2e/combat.spec.ts
    - .planning/PROJECT.md
    - CHANGELOG.md

key-decisions:
  - "A ship at zero energy is destroyed through one ledger and one kill path (supersedes N2); every record applies before lethality is decided; killShip re-checks the killer at kill time, so a same-tick mutual kill credits the lower-id victim to the other ship and the higher-id victim NO_ENTITY"
  - "killEntity is a test-only primitive; killShip is the only way non-test code removes a ship; the sanitiser's unknown-kind repair is the one other removal and never touches a ship"
  - "Two named divergences from Oolite are recorded: the same-tick mutual kill, and a shipHit for a ship already doomed by an earlier record of the tick"

requirements-completed: []

duration: about 75 min including the remote runs (browser spec 15 s, verify 144 s, acceptance 82 s)
completed: 2026-11-16
---

# Phase 15 Plan 04: Damage ledger, kill path and the browser kill step Summary

**A ship the player's laser (or a scripted pilot's) brings to zero energy is now destroyed on that tick through one damage ledger and one idempotent `killShip`, removed by a second `commitWorld` before the ident update, and a real browser session shows the shooter leave the scanner and the lock end.**

## Accomplishments

- `applyLedger` (new `src/sim/combat/ledger.ts`) takes the `HitRecord` list that `resolveShots` queues (type moved here unchanged), skips non-finite or non-positive amounts, applies player records through `routeDamage` exactly as before (never lethal, energy floors at 0, D-13), and for NPC targets reads energy once, writes `max(0, after)` once, emits `shipHit` with `shield: false` and collects a victim with the first lethal record's credited source (`PLAYER_ID`, a live other ship, else `NO_ENTITY`). It marks nothing dead and returns the lethal list sorted by victim.
- `killShip` (new `src/sim/world/kill.ts`, in `world/` so Phase 16 debris expiry can call it) returns false and changes nothing for a missing, dead, static, non-integer or non-finite id; marks a non-ship dead silently; for a ship pushes `shipDestroyed` with a copied position, radius, spec key and the killer normalised at the call (D-04).
- `resolveShots` now returns the beams, applies the ledger, kills each lethal victim in ascending id, runs the second `commitWorld` on every stepped tick (gated on the world, never on `combat`), then `updateIdentTarget`. Event order: `laserFired*`, `shipHit*`, `shipDestroyed*`, `entityRemoved*`, ident events.
- `killEntity` documented as test-only (no non-test caller under `src/`), naming the sanitiser's unknown-kind removal as the one other removal.
- N2 is superseded in code, tests (step test, cadence fight), `shields.ts` and `events.ts` docs, the Key Decisions row and `CHANGELOG.md` in one commit.

## Browser kill step and its Vitest twin

Twin (`tests/app/session/tick-parity.test.ts`, local, run before the spec was edited): `session("?test=1&clock=manual&traffic=1", true, true)` with the real `createHudMessages` behind a recorder; the plan's exact sequence (launch, 300 ticks, `setSpeed(0)`, hold fire 30 ticks, release, 60 ticks, hold, `spawnTestShooter()`, 360 ticks, `ident`, 2 ticks, one tick at a time).

| Measure | Value |
|---|---|
| Spawn tick | 391 |
| Kill tick | 1185, i.e. spawn + 794 (the budget predicted 794: 1 + 13 x 61) |
| Chunk of the browser's step 4 that sees it | the 8th 60-tick chunk (ticks spawn + 782 to spawn + 842; step 4 starts at spawn + 362) |
| Player bank (`combat.energy`) at the kill | 50.1 (floor asserted: 16) |
| `fwdShield` at the kill | 0.05 |
| `laserTemp.fore` at the kill | 60.8 |
| `laserRefused` routed between spawn and kill | 0 |
| Routed on the kill tick | `identLost` only; no fresh lock |
| Ident message at the end of the kill tick | "Target lost." |

The budget held, so no owner decision was needed. The spec (`tests/e2e/combat.spec.ts`) adds the 60-tick readiness wait, presses A before `spawnTestShooter()` (the awk ordering check exits 0), and step 4 reads the scanner ship count from `hud.contacts` after each 60-tick chunk (bound 1,500 ticks since spawn), releases A, asserts the count dropped by exactly one, then waits for "Target lost." with no lock or a fresh "Ident system locked onto" lock. The spec passes on the remote machine; which of the two ident outcomes it saw is not distinguishable from the pass, and the twin (same world, same sequence) shows "Target lost.".

## Straggler sweeps (D-11)

Recipe run before the rule flipped, and again at the end (same classification both times; no class 3 hit).

| Hit | Class | Reason |
|---|---|---|
| `tests/sim/world/sanitize.test.ts:574` (`energy` repaired to 0) | 1 | the sanitiser's energy repair, not damage |
| `tests/sim/combat/npc-fire.test.ts` `energyOf` rows (332, 333, 469, 592-655) | 1 | at most a few 6-damage beam hits on 85 or 180 energy, or recharge only; line 395 uses `killEntity` directly |
| `tests/sim/combat/shields.test.ts:175` | 1 | the player's floor, unchanged (D-13) |
| `tests/sim/combat/step.test.ts` `energyOf` rows (152 to 619) | 1 | one or two hits, far below `maxEnergy`; the 200-tick fire-held run delivers 4 pulse hits (60 of 85) |
| `tests/sim/combat/step.test.ts:622-634` "floors ... never destroys it (N2)" | 2 | superseded: replaced by the lethal-hit test plus two ident cases |
| `tests/sim/combat/step.test.ts:560-585` write-log test | 2 (kept) | still valid, unchanged and green: the ledger writes once and never re-reads |
| `tests/sim/world/world-cadence.test.ts` combat scenario | 2 | the Adder (85) now dies partway; added `adderDestroyed`, `adderDestroyedTick`, `adderRemovedTick` to `CombatLog` and kill assertions, rewrote header comments |
| every `liveEntityCount` hit (11 files) | 1 | population counts in scenarios that fire nothing |

## Task Commits

1. **Task 1: ledger, killShip, second commit, ident (tracer)** - `fd4ae52` (feat)
2. **Task 2: browser kill step, Vitest twin, retired N2 wording** - `ed6b9f2` (test)

The tracer gate: Task 1's six-file Vitest verify and typecheck were green before expansion.

## Gates

- Local, container: targeted Task 1 files (6 files, 121 tests) pass; `docker compose run --rm test` (full, coverage thresholds met): 206 files, 5216 passed, 10 skipped, exit 0; `lint` and `typecheck` clean.
- Remote, committed HEAD `ed6b9f2`:
  - `wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"`: exit 0, 1 passed (7.2 s), elapsed 15 s.
  - `wegolite-remote-run.sh run --rm verify`: exit 0, 27 passed, elapsed 144 s.
  - `wegolite-remote-run.sh run --rm test npm run test:acceptance`: exit 0, 21 of 21 pass, elapsed 82 s. All 20 seeds `repairs` 0, `aiFaulted` 0, `aiDropped` 0, `hashFailures` 0; `ACCEPTANCE-TOTALS` (stationArrivals 40, interceptArrivals 40, fleeArrivals 40, avoidCollisionEntries 23, attackTicksNearPlayer 61662, stuckWindowsEvaluated 175, frozenWindowsEvaluated 294) identical to the 15-02 and 15-03 runs; no flyer dies (nothing fires in the frozen worlds).
- Acceptance checks of both tasks (greps, the `killEntity(` guard, the NPC energy-write check printing `ledger.ts`, `step.ts`, `sanitize.ts`, the awk ordering check) all pass.

## Deviations from Plan

None - plan executed exactly as written.

Notes (no behaviour change): `prettier --write` was run on four touched files after the first lint run flagged them; the executor ran the full `test` command with output to a file after noticing a `| tail` pipe hides the exit code, so the recorded 5216-test result is from a captured run.

## Known Stubs

None. `killShip` posts no AI event and there is no explosion or wreckage by design; the notifications are plan 15-05 and the debris is Phase 16.

## Threat Flags

None. No new endpoint, auth path or trust-boundary file access; T-15-12, T-15-14, T-15-15, T-15-16 and T-15-23 are mitigated as the plan states (second commit on every stepped tick with a `snapshotWorld` assertion, total ledger and kill path with unit pins, statics and player never in the store, no new app-facing export, the twin proves the browser step's budget).

## Owner-decision state

OD-1 (the golden regeneration order) is unchanged by this plan: still pending owner acknowledgement. The Phase 15 Key Decisions row for this plan carries no pending item.

## Self-Check: PASSED

- Created files exist: `src/sim/combat/ledger.ts`, `src/sim/world/kill.ts`, `tests/sim/combat/ledger.test.ts`, `tests/sim/world/kill.test.ts`.
- Commits `fd4ae52` and `ed6b9f2` are ancestors of HEAD; `commits: 2` is measured from the plan-head ledger (`0e654af..HEAD`).
