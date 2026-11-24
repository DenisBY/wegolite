---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 02
subsystem: sim
tags: [debris, cargo-pods, entity-cap, kill-path, drift, rng-draw-order, world-17, cbt-08-staged]
status: complete

requires:
  - phase: 15-damage-ledger-and-kills
    provides: "killShip (the one kill path), resolveShots' second commit, Entity.velocity (D-01), Entity.cargo (D-06), the per-entity combat stream"
provides:
  - "src/sim/world/debris.ts: DebrisModel, DebrisBox, DebrisHull, DebrisContent, DebrisContext, releaseDebris (Oolite's pod rule), the cap constants DEBRIS_ENTITY_LIMIT (243.2) and WRECKAGE_ENTITY_LIMIT (128), clampDebrisVelocity and the pod constants"
  - "killShip(world, id, killer, events, debris?): releases a ship's debris after shipDestroyed and the notifications"
  - "CombatOptions.debris: resolveShots builds a DebrisContext (tick, content, octrees when loaded) for each kill"
  - "SpawnInit.velocity, type- and domain-checked by spawnEntity"
  - "stepDebris: the drift pass for kinds cargo and wreckage, run in stepWorld after the update loop"
  - "tests/helpers/debris-fixture.ts: debrisFixture() for sim tests"
affects: [16-04, 16-06, 16-08, 16-09, 17, 18]

plan_head_before: bfce6dc5d40da8f60dd30075fd14991d7fd6844a
plan_head_after: 4b9f90172f00c38c2cc140149a4f54008ef69454
commits: 2

actuals:
  tokens: 16900
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Draw everything, then gate: every draw of a debris piece is taken from a local copy of the victim's stream before its spawn is attempted, so a refused spawn (cap, bad content, store full) moves no later draw and no nextId"
    - "Oracle from the C: the pod test re-implements releaseCargoPodsDebris line by line over a copy of the victim's stream instead of calling the port"

key-files:
  created:
    - src/sim/world/debris.ts
    - tests/helpers/debris-fixture.ts
    - tests/sim/world/debris.test.ts
    - tests/sim/world/debris-cap.test.ts
  modified:
    - src/sim/world/entity.ts
    - src/sim/world/world.ts
    - src/sim/world/kill.ts
    - src/sim/world/step.ts
    - src/sim/combat/step.ts
    - tests/sim/world/spawn-refusal.test.ts
    - tests/sim/world/kill.test.ts

key-decisions:
  - "D16-12 draw order implemented: canFragment first, then per capsule one survival draw and 13 draws per survivor (box xyz, jitter xyz, kick xyz, quaternion wxyz); the 16-04 seam sits after the pod loop"
  - "D16-05 cap gate per piece, after the piece's draws: liveEntityCount(world) < 0.95 * MAX_ENTITIES; frame-time and visibility terms dropped"
  - "DebrisContent.hulls must be a Map instance; anything else reads as an empty table (defaults for every victim), never a throw"

patterns-established:
  - "A kill-time spawn goes through spawnEntity with SpawnInit.velocity and is clamped to the sanitiser domain at the write (clampDebrisVelocity), so it needs no repair"

requirements-completed: []  # WORLD-17 is advanced, not closed: its text is about drawing (plans 16-07, 16-08) and 16-09 closes it; CBT-08 is staged to Phase 19

coverage:
  - id: D1
    description: "A ship with cargo destroyed by the player's laser releases Oolite's cargo pods on the kill tick, from its own stream in the fixed order, and the pods drift, hash and snapshot"
    requirement: WORLD-17
    verification:
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#releases the oracle's pods on the kill tick, which drift, hash and snapshot"
        status: pass
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#equals the oracle for cargo {1,3,20,200}, world seed {1,7,42,9001,0xdeadbeef}"
        status: pass
    human_judgment: false
  - id: D2
    description: "The entity cap holds per piece: pods spawn while at most 243 live, never above 244 from debris alone, draws independent of the cap, a kill at a full store resolves"
    verification:
      - kind: unit
        ref: "tests/sim/world/debris-cap.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The release and the drift are total and in domain; SpawnInit.velocity is type- and domain-checked"
    verification:
      - kind: unit
        ref: "tests/sim/world/kill.test.ts#killShip with a debris context: totality and idempotence"
        status: pass
      - kind: unit
        ref: "tests/sim/world/spawn-refusal.test.ts (velocity rows)"
        status: pass
    human_judgment: false
  - id: D4
    description: "QUAL-11 standing gate: the frozen 20-seed NPC acceptance run after src/sim/world/** changed"
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance at 4b9f901"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-11-17
---

# Phase 16 Plan 02: Cargo Pods on the Kill Path and the Entity Cap Summary

**A ship destroyed through `killShip` with a debris context now releases Oolite's cargo pods (`ShipEntity.m:7814-7879`: 70/40/10 survival chance, at most 15, a random point of the bounding box plus a -3..3 m jitter, a 0.1 x (0..199 - 100) m/s kick plus the ship's drift) from a local copy of its own combat stream. The pods drift each world step, and a per-piece gate keeps debris below 0.95 x 256 live entities without moving any draw.**

## Performance

- **Duration:** about 30 min (started 2026-11-16T22:42:44Z)
- **Tasks:** 2 of 2
- **Files:** 4 created, 7 modified

## Accomplishments

- `releaseDebris` ports the pod rule draw for draw. The canFragment roll comes first (D16-13), then one survival draw per capsule in index order and 13 draws per survivor. No commodity, amount, role or ejecta-temperature draw is taken (D16-01, D16-24). The box offset is added unrotated after `toWegoliteLocal` (D16-18), and the velocity is the kick plus `victim.velocity`, never `victim.speed`, clamped into the sanitiser's domain at the write.
- Pods are kind `cargo`, `CLASS_CARGO`, spec key `barrel`, radius from the content, energy 1 of max 1, no recharge, no AI and speed 0 (D16-15). They post no event and survive the second commit.
- `killShip` takes an optional `DebrisContext` and releases debris only for a ship, after `shipDestroyed` and `notifyKill`. Every Phase 15 caller passes none, so their behaviour is unchanged. `resolveShots` builds the context from `CombatOptions.debris` with `tick: player.tick`, and adds `octrees` (the hull table) only when it has loaded.
- `stepDebris` integrates `velocity * dt` for live cargo and wreckage only. It runs in `stepWorld` after the update loop and before the think phase. Ships are not integrated (D16-19).
- The cap (D16-05) is checked before each spawn attempt and after that piece's draws: `liveEntityCount(world) < DEBRIS_ENTITY_LIMIT` (243.2). `WRECKAGE_ENTITY_LIMIT` (128) is defined here for plan 16-04. There is no eviction (D16-06).
- `SpawnInit.velocity` is type-checked in `isMalformedInit` and domain-checked in `domainRefusal` (each component finite, magnitude at most `MAX_ENTITY_VELOCITY`), then copied component by component. When it is absent the velocity is zero, so existing spawns hash the same.
- D16-03 / OC-3 holds without any filter change. Tests show that a pod in the laser's line is not hit, that `npcContacts` does not list it, and that it does not mass-lock.

## Pinned tracer values

An Adder with cargo 10 and 10 energy, 2,000 m ahead, world seed 7, killed by one fore pulse shot through `stepSim`:

- pod count: **4**
- first pod position: `(9999989.988414517, -12.830020767197482, -2006.82235684927)`
- first pod velocity: `(-3.1, 9, -8.6)`
- first pod orientation: `(w 0.5907595014547972, x 0.3389898509108958, y 0.5440022806395012, z -0.49005164123723666)`

All four pods equal the oracle written from the C. After one more tick each pod has moved by exactly `velocity * DT`. A snapshot taken at the tick boundary round-trips (JSON, `parseWorldSnapshot`, `restoreWorld`) to an equal hash.

## Task Commits

1. **Task 1 (tracer): pods released on a kill, drift, oracle tests**: `a3dd062` (feat)
2. **Task 2: the per-piece cap, totality, the spawn domain**: `4b9f901` (feat)

## Decisions implemented (by ID)

D16-01 (OC-1), D16-03 (OC-3), D16-05 (pods part), D16-06, D16-12 (first part), D16-13, D16-15, D16-18, D16-19, D16-24, and 15-CONTEXT D-01, D-02 and D-15. The Key Decisions rows are written by plan 16-09.

## Verification

- Targeted runs in the local container: `debris.test.ts`, `kill.test.ts`, `combat/step.test.ts`, `combat/kill.property.test.ts`, `world-cadence.test.ts` (112 passed); then `debris.test.ts`, `debris-cap.test.ts`, `spawn-refusal.test.ts`, `kill.test.ts`, `sanitize.test.ts` (482 passed).
- Mutation check: with the cap gate disabled, 4 of the 5 `debris-cap.test.ts` cases fail. The tests are not vacuous (Pitfall 7).
- Full suite in the local container with coverage thresholds: `docker compose run --rm test`, 209 files, 5293 passed and 10 skipped, exit 0. `docker compose run --rm lint` and `docker compose run --rm typecheck` both exit 0.
- `verify` was not run: this plan changes only `src/sim` and tests, and the plan's gate policy for that is `test`, `lint` and `typecheck`.
- **QUAL-11 acceptance run (remote, by hand):** `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` at HEAD **4b9f901**. Result: **21 of 21 passed**. In all 20 seeds `repairs`, `aiFaulted`, `aiDropped`, `hashFailures`, `hullCrossingEpisodes`, `hullCrossingsUnexcused`, `stuck` and `frozen` were all 0, and no flyer died. Elapsed: 79 s wall clock, 76.6 s vitest.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Totality] Content and victim reads guarded beyond the listed cases**
- **Found during:** Task 2
- **Issue:** The release dereferenced `ctx.content.hulls.get`, `ctx.content.pod.key` and `victim.velocity` directly. A malformed content object (a non-Map table, a null pod) would throw inside the kill path.
- **Fix:** Added `hullOf` (a Map instance check, then an object check), a pod model that is not an object (all draws still taken, nothing spawned), and `vecOrZero` for the victim's position and velocity. The drift pass also skips an entity whose position or velocity is not an object. Each case is tested, including that a bad pod model leaves the victim's final stream equal to the reference run.
- **Files modified:** src/sim/world/debris.ts, src/sim/world/step.ts
- **Commit:** 4b9f901 (debris.ts), a3dd062 (step.ts)

### Process note

The tasks carry `tdd="true"`. The tests and the implementation of each task went into one commit rather than separate RED and GREEN commits. The tracer gate was still run: Task 1's `<verify>` was re-run end to end and passed before Task 2 started. The cap tests were shown to bite with the mutation check above.

## Known Stubs

- `src/sim/world/debris.ts`: `canFragment` is drawn and then deliberately unused (`void canFragment`), and a marked seam follows the pod loop. Plan 16-04 consumes both (wreckage, alloy plate, blast). This is intentional per D16-12; the pod goal of this plan does not depend on it.
- `tests/helpers/debris-fixture.ts`: the hull bounding boxes are synthetic (plus and minus half the hull radius). The compiled box arrives in plan 16-05, and the app tests of plan 16-06 use the real catalogue.

## Threat Flags

None. No new network, auth or file surface. Debris spawns post no event and no entity id leaves `src/sim`.

## Requirements

- WORLD-17: advanced, not checked off. This plan creates the pod debris records, but the requirement's text ("drawn within the draw-call budget and do not affect the world hash") is closed by the render plans 16-07 and 16-08 and the close-out plan 16-09. Phase 15 used the same convention: a plan that only part-delivers a requirement lists `[]`.
- CBT-08: staged. The destruction clauses are proved in this phase but checked off only in Phase 19, so CBT-08 is deliberately not listed under `requirements-completed`.

## Self-Check: PASSED

- FOUND: src/sim/world/debris.ts, tests/helpers/debris-fixture.ts, tests/sim/world/debris.test.ts, tests/sim/world/debris-cap.test.ts
- FOUND: a3dd062, 4b9f901 (ancestors of HEAD)
