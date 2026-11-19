---
phase: 17-npc-fire-and-hits-on-the-player
plan: 06
subsystem: simulation
tags: [npc, steering, fire-request, opt-in, requestFire, fire-sites, flight-script, fast-check]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: the gated fire-queue drain, cooling and the test pilot's per-tick ask (17-05); the pure gate (17-04)
provides:
  - SteerContext.fire, built by the world step only when ai.params.fire === true
  - requestFire(world, id), the one bounded de-duplicated push shared by ShipControl.fire and the steering
  - FlightScriptOptions.fire, the param key put only when asked (same key and value as the test pilot)
  - ctx.fire?.() at Oolite's fireMainWeapon sites: evasive and flee-evasive (4035), sniper (4454, restructured to if/else), six and twelve (4575), fly-to (4711)
  - fire-route.test.ts (30 tests) and the flight-script fire-option tests; the Phase 14 steering-scope row amended
affects: [17-07, 17-08, 17-09, 17-10]

plan_head_before: d0fb252a1a7f3f6f5232336fd05e3d694e293023
plan_head_after: 3a403e070a5f80c5e25f6048e99994faf2091cf2
commits: 2

actuals:
  tokens: 12500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "an optional SteerContext capability built in one place (steerEntity) from an AI param, so absence of the key is absence of the capability"
    - "one queue push (requestFire) for both fire routes, one gate at the drain; the routes are kept exclusive by construction and pinned by tests"
    - "lockstep twin worlds (with and without the param) prove a request takes no draw and changes no state"

key-files:
  created:
    - tests/sim/npc/fire-route.test.ts
  modified:
    - src/sim/npc/dispatch.ts
    - src/sim/world/world.ts
    - src/sim/world/control-impl.ts
    - src/sim/world/step.ts
    - src/sim/ai/pilots/flight-script.ts
    - src/sim/npc/behaviours/attack-close.ts
    - src/sim/npc/behaviours/attack-evade.ts
    - src/sim/npc/behaviours/evasive.ts
    - tests/sim/ai/flight-script.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "ctx.fire is a conditional spread in steerEntity keyed on ai.params.fire === true (strict): a forged 1, \"true\" or false does not opt in, and a ship with ai null is never steered"
  - "requestFire keeps ShipControl.fire's exact semantics (bound MAX_ENTITIES, SameValueZero de-duplication) and adds no id validation: its two callers pass an actor id or an entity id, and the drain already refuses an unknown shooter"
  - "The sniper's request sits after the if/else, so the below-15,000 m side hands back to ATTACK_TARGET and still asks in the same update; without ctx.fire that restructure is an exact no-op (same nav, steer and draws)"
  - "flee's turret-only call stays unreachable and unported; FLEE_EVASIVE_ACTION asks through the shared evasive function"

requirements-completed: [CBT-15]

coverage:
  - id: D1
    description: "An opted-in flight-script attacker's fly-to asks on every update, the gate draws once per request it lets through (timer open), and each hit costs the Adder exactly 6 energy (recharge 0)"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#an opted-in scripted attacker fires from fly-to through the gate (tracer, D-05, D-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Without the opt-in nothing changes: lockstep twin worlds agree through the first request (the request takes no draw), no request or shot or heat over a whole approach, only the value true opts in, a ship with no AI cannot ask"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#without the opt-in nothing changes (criterion 4, T-17-15)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts, tests/sim/world/populate.test.ts, tests/sim/npc/npc-cadence.test.ts, tests/sim/npc/flyers.scenario.test.ts, tests/app/session/tick-flyers.test.ts, tests/sim/world/world-cadence.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "requestFire never throws, never exceeds MAX_ENTITIES and never queues an id twice over any id sequence (live, dead, missing, NO_ENTITY, negative, non-integer, NaN, infinities, duplicates, longer than MAX_ENTITIES); ShipControl.fire delegates to it"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#requestFire, the one bounded de-duplicated push (D-17, T-17-17)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/control.test.ts (unchanged)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A faulted opted-in pilot loses its AI, builds no ctx.fire again, and the drain refuses the request already queued with no draw, shot, cost or heat"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#a faulted pilot (review Fable M4, T-17-15)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Each fire site asks as the last statement on every path that reaches it and on none that returns earlier: evasive after the hand-over (not on the alert return, no target guard), sniper on both sides of 15,000 m, six and twelve, fly-to"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#evasive and flee-evasive ask once, after the hand-over (ShipEntity.m:4035)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#the sniper asks on both sides of 15,000 m, after the if/else (ShipEntity.m:4414-4454)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#six and twelve ask on every update that reaches 4575"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#fly-to asks as its last statement (ShipEntity.m:4711)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The two fire routes stay exclusive: the set of behaviours whose step asks is exactly Oolite's six ids, the flight-script source never calls ctl.fire, the test pilot performs only IDLE, FLY_TO_DESTINATION and STOP_STILL, and a world holding both opted-in pilots queues one entry per id per tick"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-route.test.ts#the routes stay exclusive (advisor warning, T-17-17)"
        status: pass
    human_judgment: false
  - id: D7
    description: "QUAL-11 is unchanged by the steering route (the flyers never opt in): 21 passed, every metric identical to the 17-04 baseline"
    requirement: CBT-15
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (snapshot 3a403e0, exit=0, elapsed=77s, 21 passed)"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-11-19
status: complete
---

# Phase 17 Plan 06: The steering fire route Summary

**An opted-in pilot's steering now asks the NPC fire gate at Oolite's own call sites (evasive, sniper, six/twelve, fly-to) through `ctx.fire`, built only from `ai.params.fire === true` and sharing one bounded push with `ShipControl.fire`; every world that does not opt in replays byte-identically and the 20-seed run is unchanged.**

## Performance

- **Duration:** 27 min (2026-11-19T01:08Z to 01:35Z)
- **Tasks:** 2 (Task 1 a tracer)
- **Files:** 1 created, 10 modified; 1113 insertions and 48 deletions over the two commits

## Commits

| Commit | Subject | Role |
|--------|---------|------|
| `a66b3c7` | `feat(17-06): an opted-in pilot's fly-to asks the fire gate (D-05, tracer)` | Task 1: `SteerContext.fire`, `requestFire`, the `fire` option, the fly-to site, the tracer and route tests |
| `3a403e0` | `feat(17-06): evasive, sniper and six/twelve ask the fire gate at Oolite's sites (D-06)` | Task 2: the other three sites, exclusive-route tests, flight-script tests, the amended Key Decisions row |

`commits: 2` measured with `git rev-list --count` from `plan_head_before` `d0fb252`.

## Accomplishments

- `SteerContext.fire?: () => void` (`dispatch.ts`) is built in the one place the context is built, `steerEntity` in `world/step.ts`, as a conditional spread: `...(entity.ai?.params["fire"] === true ? { fire: () => requestFire(world, entity.id) } : {})`. The strict `=== true` means a forged `1`, `"true"` or `false` param does not opt in; a ship with `ai` null is never steered.
- `requestFire(world, id)` (`world.ts`) is the push `ShipControl.fire` used to carry inline: refuse at `MAX_ENTITIES` entries, refuse a duplicate, else push. `control-impl.ts`'s `fire` keeps its actor check and delegates to it, so there is one bound and one de-duplication for both routes, and one gate at the drain (advisor decision 2). `control.test.ts` is unchanged and green.
- `createFlightScriptAi(..., { fire: true })` puts the key `fire: true` on the params and nothing else (the same conditional spread as `createTestPilotAi`); without it the param record has exactly the six HEAD keys, so every existing world serialises and hashes byte-identically. No hashed entity field was added.
- The fire sites, each the last statement on every path that reaches it (a lost target or an alert returns earlier, as in Oolite):

| Site | Oolite line | Port |
|------|-------------|------|
| evasive and flee-evasive | `ShipEntity.m:4035` | `evasive.ts`, after the hand-over block, not on the proximity-alert return, no target guard |
| sniper | 4454 (outside the 4414 if/else) | `attack-evade.ts`, restructured to `if (range < 15000) { ATTACK_TARGET } else { speed, tracking, frustration }` then the shared request |
| six and twelve | 4575 | `attack-close.ts`, after the aspect hand-over |
| fly-to | 4711 | `attack-close.ts`, after the frustration block (which may switch to ATTACK_TARGET) |

- The headers of `evasive.ts`, `attack-evade.ts` and `attack-close.ts`, the module doc of `dispatch.ts` and `flight-script.ts` state the new contract. The hot-weapon returns (4456, 4577, 4713) and the accuracy >= 9 dodge stay comments for plan 17-07.
- `.planning/PROJECT.md`: the "Phase 14 NPC steering scope" row's cut "no weapon fire from steering" now reads "unless the pilot opted in (Phase 17, D-05: ... flee's turret-only call stays unreachable ...) (amended by plan 17-06)".

## Evidence

- **Tracer.** A Viper with `createFlightScriptAi(0, { script: "attack", targetId: <Adder>, fire: true })`, an inert Adder 3,000 m ahead with `energyRechargeRate` 0, real hulls and `npcWeapons`, stepped with `stepWorld` plus the drain. The Viper reaches ATTACK_FLY_TO_TARGET within a few ticks and asks on every fly-to update (49 of 49 in the first 51 ticks) and on no other tick; the gate draws exactly once per request on a tick the 12-tick timer is open and never otherwise; five hits take the Adder from 85 to exactly 55 energy (6 a hit).
- **No draw at steering time.** Two lockstep worlds, identical except the param, agree on the Viper's pose, nav, steer and combat stream every tick through the first request; on that tick the opted-in world's `fireQueue` is `[viper]`, the other's is empty, and the streams are equal.
- **Without the key.** Over 1,800 ticks of the same approach (the Viper does run fly-to) the queue is always empty, nothing fires, the stream is untouched by the drain, the weapon stays cold (`temperature` 0, `lastShotTick` 0) and the Adder keeps 85.
- **requestFire property:** 500 fast-check runs over sequences of up to 768 ids drawn from live-range integers, small and negative integers, `NO_ENTITY`, NaN, +/-Infinity, `MAX_SAFE_INTEGER`, -0, 0.5 and arbitrary doubles. It never throws, never exceeds `MAX_ENTITIES`, holds no id twice (SameValueZero) and keeps the first `MAX_ENTITIES` distinct ids in order.
- **Exclusive routes.** Running every entry of `BEHAVIOUR_ROUTES` with a counting `ctx.fire` finds exactly `ATTACK_FLY_TO_TARGET`, `ATTACK_FLY_TO_TARGET_SIX`, `ATTACK_FLY_TO_TARGET_TWELVE`, `ATTACK_SNIPER`, `EVASIVE_ACTION` and `FLEE_EVASIVE_ACTION` (hand-derived from Oolite). The flight-script source (comments stripped) has no `ctl.fire` or `.fire(`; the test pilot's source performs exactly `IDLE`, `FLY_TO_DESTINATION` and `STOP_STILL`, none in the set; a world with an opted-in attacker and an opted-in test pilot queues one entry per id per tick, the attacker only on fly-to updates.
- **Per-site no-op.** Each site scenario is run with and without a `ctx.fire`; the nav and steer records, the emitted events and the draw count are identical, so a ship with no `ctx.fire` behaves as before (this covers the sniper restructure).
- **Faulted pilot.** The attacker's think is forced due on a tick a throwing flight-script module runs: the steering asks first, the think throws, fault containment nulls the AI, the drain refuses the queued request (no `laserFired`, no draw, no `lastShotTick` write, heat only cooled, energy only recharged), then 40 more ticks queue nothing and a request made on its behalf is refused.
- **Mutations** (not committed), each caught: removing the fly-to request fails 3 tests; `fires = true` in `steerEntity` fails 3; restoring the sniper's early return, moving the evasive call before the alert and removing the six request together fail 7.

## Verification

| Check | Result |
|-------|--------|
| Task 1: `fire-route`, `control`, `attack-close`, `attack.oracle`, `steering.property` | 5 files, 193 tests passed (tracer gate re-run after the commit-ready tree: `Tracer verified end-to-end - expanding`) |
| Task 1: `typecheck` | clean |
| Task 2: `tests/sim/npc`, `flight-script`, `test-pilot` | 30 files, 1003 tests passed; with the later `flight-script` additions: `fire-route`, `flight-script`, `test-pilot` 90 passed |
| Frozen anchors and world-cadence: `flight-hash-pins`, `populate`, `npc-cadence`, `flyers.scenario`, `tick-flyers`, `world-cadence` | 6 files, 70 tests passed, unchanged |
| `docker compose run --rm test` (full, coverage thresholds) | 231 files, 6329 passed, 10 skipped, exit 0 |
| `docker compose run --rm lint`, `docker compose run --rm typecheck` | clean |
| Acceptance criteria | `readonly fire?` 1; `export function requestFire` 1; `options.fire === true` 1; `ctx.fire?.()` in `attack-close.ts` 2; `.fire(` in `flight-script.ts` 0; `ctx.fire?.()` totals 4 (evasive 1, attack-evade 1, attack-close 2); `amended by plan 17-06` in PROJECT.md 1 |
| Remote QUAL-11 acceptance (`npm run test:acceptance`) | snapshot `3a403e0` (committed HEAD), `exit=0`, `elapsed=77s`, 1 file, 21 passed |

QUAL-11 compared with the 17-04 baseline (summed or minimum over the 20 epochs): minimum hull clearance 41.41144779320824, minimum station clearance 2713.001472744365, arrivals 40 / 40 / 40, AVOID_COLLISION entries 23, attack ticks near the player 61662, stuck / frozen / frustration / stationSphere 0, hull crossings 0 / 0, aiFaulted / aiDropped / repairs / hashFailures 0, stuck and frozen windows 175 / 293: identical to the baseline. The flyers run attack behaviours but never opt in, so no request, draw or heat occurs.

`verify` and `verify-full` were not run (no browser-facing code; plan 17-10 runs the one `verify`). No fire-site fixture was opened (they are consumed in plan 17-08).

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- Tests were written after the implementation (the plan marks Task 1 a tracer and the behaviours are small); the mutations above stand in for a red phase.
- `CHANGELOG.md` was not touched: nothing here is user-visible (an opt-in param no shipped world sets).

**Total deviations:** 0.

## Authentication Gates

None.

## Owner questions (recorded, not blocking)

1. Informational (carried from 17-05): any later change to the number of draws per request re-pins the debris and hash literals of the twin and browser spec. This plan changes none (no shipped world opts in), so no literal moved.
2. Plan 17-07 makes the weapon temperature live in the hot-weapon branches that follow these request sites; the dispatcher's 4122 evasive branch and the three hot returns (4456, 4577, 4713) are still comments. An opted-in attacker therefore keeps firing at the gate's 12-tick rate without Oolite's break-off until then.

## Known Stubs

None. The three hot-weapon returns and the accuracy >= 9 dodge are documented scope cuts with plan 17-07 as their owner, not stubs that stand in for data.

## Threat Flags

None: no new endpoint, auth path, file access or schema change. T-17-15 (a ship firing without opting in) is mitigated and tested (`ctx.fire` exists only for `fire === true`; forged values, `ai: null` and a faulted pilot cannot ask or fire); T-17-17 (two requests merged into one draw) is pinned by the exclusive-route tests and `requestFire`'s de-duplication; T-17-16 (a forged `fire: true` in a snapshot) is accepted as planned.

## Self-Check: PASSED

- Files found: `tests/sim/npc/fire-route.test.ts`, `src/sim/world/world.ts` (`requestFire`), `src/sim/npc/dispatch.ts` (`fire?`), `src/sim/ai/pilots/flight-script.ts`, `src/sim/npc/behaviours/{attack-close,attack-evade,evasive}.ts`, `.planning/PROJECT.md`.
- Commits `a66b3c7` and `3a403e0` are ancestors of HEAD; `commits: 2` measured from `plan_head_before` `d0fb252`.
- The plan's automated verify commands all passed, including the remote acceptance run (21 of 21, unchanged numbers, snapshot `3a403e0`).
