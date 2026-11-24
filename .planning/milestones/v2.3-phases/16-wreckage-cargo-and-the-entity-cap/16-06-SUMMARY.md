---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 06
subsystem: app-session
tags: [session, traffic, debris, explosions, test-hook, tick-parity, world-17, data-16, d16-09]
status: complete

requires:
  - phase: 16-02
    provides: "DebrisContent, CombatOptions.debris and the debris release on the kill path"
  - phase: 16-03
    provides: "ships-debris.json, DebrisCatalogueSchema and loadDebrisCatalogue"
  - phase: 16-04
    provides: "wreckage, plates, the blast and the lifetimes in releaseDebris"
  - phase: 16-05
    provides: "explosions.json, loadExplosionCatalogue and NpcShip.boundingBox"
provides:
  - "debrisContentFrom(catalogue, debris): the one builder of the sim's DebrisContent, shared by the session and the Node replay"
  - "TrafficContent.debris, .debrisModels and .explosion; trafficContent(catalogue, { debris?, explosions? }); TrafficExtras; DEFAULT_SHIP_EXPLOSION_KEY"
  - "StepOptionsInput.debris into CombatOptions.debris; the sim driver passes it on every traffic-on step"
  - "The boot loads the debris and explosion catalogues with traffic on only, in the same Promise.all and on the same failure surface as the NPC catalogue"
  - "spawnTestShooter(cargo?) on the ?test=1 hook, the probe publisher and the sim (D16-09): taint first, a non-number or out-of-domain count spawns nothing and returns false"
  - "The debris twin in tick-parity.test.ts: the numbers the browser step of plan 16-09 must reproduce"
affects: [16-07, 16-08, 16-09]

plan_head_before: de2deb9a84a26aa79f09194dc63e104fb250d9eb
plan_head_after: d154d8738d694a2532d7d5bfb0feda8a802907d8
commits: 2

actuals:
  tokens: 11100
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Optional catalogue extras on trafficContent, each key set only when its source is present (exactOptionalPropertyTypes)"
    - "A test hook argument from the page is typed `unknown` in the publisher and narrowed after the taint; the sim's spawnEntity is the domain check"

key-files:
  created: []
  modified:
    - src/app/session/traffic.ts
    - src/app/session/step-options.ts
    - src/app/session/sim-driver.ts
    - src/app/session/start-session.ts
    - src/app/session/probe-publisher.ts
    - src/app/probe.ts
    - src/sim/ai/test-spawn.ts
    - tests/app/session/tick-parity.test.ts
    - tests/app/session/traffic.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/start-session.test.ts
    - tests/sim/ai/test-spawn.test.ts
    - tests/helpers/tick-script.ts
    - tests/content/ships-debris.test.ts
    - tests/content/explosions.test.ts

key-decisions:
  - "debrisContentFrom is the only place the sim's DebrisContent is built; the session (trafficContent) and the Node replay (tick-script) both go through it"
  - "traffic.ts restates the default explosion key as DEFAULT_SHIP_EXPLOSION_KEY (it imports only types from src/content); a unit test pins it equal to the schema's DEFAULT_EXPLOSION_KEY"
  - "The hook's cargo argument: absent keeps the Phase 15 spawn bit for bit; after the taint a non-number returns false, a number goes to spawnEntity, which refuses anything outside 0 to MAX_ENTITY_CARGO (D16-09, T-16-18)"

requirements-completed: []  # WORLD-17 and DATA-16 are advanced, not closed: WORLD-17 is about drawing (16-07, 16-08) and 16-09 closes both; REQUIREMENTS.md stays open until then, as in 16-02 and 16-04

duration: 75min
completed: 2026-11-17
---

# Phase 16 Plan 06: Debris content wired into the live session Summary

**With traffic on, the session now loads the debris and explosion catalogues at boot and builds the sim's `DebrisContent` with one builder, `debrisContentFrom`, which the Node replay also uses. Every fixed step carries that content, so a kill in a real session releases pods, wrecks and a plate. The `?test=1` shooter takes an optional cargo count, and a Vitest twin through the real driver, router and hook pins the kill tick, the piece counts and the world hash for plan 16-09.**

## Performance

- **Duration:** about 75 min
- **Started:** 2026-11-17T00:15Z
- **Completed:** 2026-11-17T01:30Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- `src/app/session/traffic.ts`: `debrisContentFrom(catalogue, debris)` turns each NPC record into a hull entry (mass, `fragmentChance`, `boundingBox` as `vec` min and max). It takes the pod and plate models from the debris catalogue and the wrecks in catalogue order, and returns undefined if the catalogue has no pod or no plate. `trafficContent(catalogue, extras?)` adds `debris`, `debrisModels` and `explosion` only when their source is present. The result stays frozen and every existing field is unchanged.
- `step-options.ts` puts `debris` into `combat.debris` only when it is given. `sim-driver.ts` passes `ctx.core.npcTraffic.debris` when it exists.
- `start-session.ts` adds `loadDebrisCatalogue()` and `loadExplosionCatalogue()` to the boot `Promise.all`, behind the same `ctx.runtime.testFlags.traffic ?` guard, so they share the NPC catalogue's failure surface. With traffic off, neither chunk is fetched.
- The hook (D16-09): `spawnTestShooter(cargo?: number)` in `probe.ts`. In the publisher, `spawnShooter(cargo?: unknown)` keeps every existing refusal and calls `markHookMutation()` before it touches the world; after that, a defined non-number returns false. The sim's `spawnTestShooter(..., cargo?)` puts `cargo` into the `SpawnInit` only when it is defined. No hook member was added, so the probe shape is unchanged.
- `tests/helpers/tick-script.ts`: with traffic on, the replay builds its content from the committed `ships-npc.json`, `ships-debris.json` and `explosions.json` (strict schemas) and passes `debris` to every step, as the session does. Every existing replay pin passed unchanged.

## The debris twin (for the browser step of plan 16-09)

`tests/app/session/tick-parity.test.ts`, describe "the debris twin (plan 16-06, WORLD-17, D16-09)". It runs the 15-04 sequence through the real driver, router and hook, with `?test=1&clock=manual&traffic=1` and the populated Lave world:

1. Launch (1 tick), then advance 300 ticks; `setSpeed(0)`.
2. Hold fire for 30 ticks, release it for 60.
3. With fire held, call `spawnTestShooter(20)` (a Viper with cargo 20).
4. Advance 360 ticks; send `ident`; advance 2 ticks.
5. Advance one tick at a time until the scanner loses a ship.

Measured and pinned values:

| Quantity | Value |
|----------|-------|
| Kill tick relative to the spawn | **+794** (the same as the 15-04 twin: cargo changes no combat value) |
| Pods (`cargo`, specKey `barrel`) live on the kill tick | **3** |
| Plates (`cargo`, specKey `alloy`) live on the kill tick | **1** |
| Wrecks (`wreckage`) live on the kill tick | **3** |
| `probe.sim.entities` on the kill tick | **19** (12 populated, minus the Viper, plus the 7 pieces; equals `liveEntityCount`) |
| `worldHash()` 60 ticks after the kill (fire released) | **`a10b2dfc`** (equals the session's own `hashWorld`) |

Three pods survived at cargo 20, so the count did not have to be raised to 30. No sim rule was tuned.

The same describe also covers the hook's refusals (T-16-18). Called with -1, 1.5, 201, NaN, `"20"` or `{ cargo: 20 }`, the hook taints the session, returns false and spawns nothing: the live count and `nextId` do not change. The 15-04 twin (no argument) passed unchanged, pins included, now that a Viper's kill also releases debris.

## Task Commits

1. **Task 1: a hook-spawned shooter with cargo destroyed in a real session leaves its debris (tracer)** - `7885d9a` (feat)
2. **Task 2: the Node replay builds the same content, the builder and hook are unit-pinned** - `d154d87` (test)

The tracer gate ran: Task 1's `<verify>` (the targeted tests and typecheck) passed end to end before Task 2 started.

## Gates

- Targeted (Task 1): `tick-parity`, `traffic`, `sim-driver`, `probe-publisher`, `probe-shape-compare`, `entity-id-scope`: 6 files, 155 tests passed.
- Targeted (Task 2): `tests/app/session tests/sim/ai/test-spawn.test.ts tests/guards`: passed after the fixes below.
- Full suite with coverage (`docker compose run --rm test`): 214 files passed, 5471 tests passed, 10 skipped, no threshold error. `lint` was clean (eslint and prettier), and `typecheck` reported no `error TS`.
- **Remote `verify`** (`/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify`) at committed HEAD **d154d87**: **exit 0**, **149 s** elapsed. It covered lint, typecheck, the content drift check, the unit tests (214 files), the build, `check:dist` and the e2e smoke subset (27 of 27 passed).
- No acceptance run: nothing under `src/sim/npc/**` or `src/sim/world/**` and no `ships-npc.json` change. No frozen detector or threshold was touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Source pins on the boot `Promise.all` broke with Task 1's refactor**
- **Found during:** Task 2 (targeted run over `tests/app/session`)
- **Issue:** Task 1 had put the traffic flag into a local `traffic` variable and spread the extras into the `trafficContent` call. Two existing source pins failed: `start-session.test.ts` (hull load) and `world-lifecycle.test.ts` (NPC load). They look for `ctx.runtime.testFlags.traffic ?` before each load, and for `showBootFailure` within 900 characters after the `Promise.all`. Task 1's targeted set did not include these files.
- **Fix:** Restored the original guard expression for every load. `TrafficExtras` now accepts an explicit `undefined`, so the boot passes `{ debris: debrisCatalogue, explosions: explosionCatalogue }` directly. Added a matching source pin for the two new loaders in `start-session.test.ts`.
- **Files modified:** `src/app/session/start-session.ts`, `src/app/session/traffic.ts`, `tests/app/session/start-session.test.ts`
- **Commit:** `d154d87`

**2. [Rule 1 - Bug] The 16-03 and 16-05 pins "imported by nothing outside src/content yet (plan 16-06 wires it)"**
- **Found during:** Task 2 (full suite)
- **Issue:** Those pins asserted the state from before this plan, and this plan is the one that changes it.
- **Fix:** They now assert that the boot (`src/app/session/start-session.ts`) is the only importer outside `src/content`.
- **Files modified:** `tests/content/ships-debris.test.ts`, `tests/content/explosions.test.ts`
- **Commit:** `d154d87`

**3. [Scope] Hook refusal cases live in the twin's describe**
- The plan's behaviour list puts the hook's refusal rows under Task 1 without naming a file. They are an `it.each` in the debris twin's describe in `tick-parity.test.ts`, which runs through the real publisher. Stepping the manual clock already taints the session, so the test clears `testTainted` before it calls the hook, so that the hook's own taint can be observed.

## Known Stubs

None. The debris is in the world but not yet drawn; plans 16-07 (explosion layer) and 16-08 (debris layer) draw it, as the plan states.

## Threat Flags

None. The hook argument (T-16-18), the boot failure surface (T-16-19) and the entity-id scope (T-16-20) are in the plan's register and are mitigated as planned: taint first, `spawnEntity`'s domain check, the shared boot `catch`, and static content keyed by spec key only. `entity-id-scope.test.ts` passed.

## Issues Encountered

- `tests/guards/harness-isolation.test.ts` failed once in a targeted run while other containers were busy on this machine. It passed alone, in the full suite and in the remote `verify`. It walks `src/` and `public/`; the failure looked like a timeout under load. This was not investigated further.

## Next Phase Readiness

- Plan 16-07 can read `ctx.core.npcTraffic.explosion` for the cloud setting, and plan 16-08 can read `ctx.core.npcTraffic.debrisModels` for model paths and sizes.
- Plan 16-09's browser step must reproduce: kill at spawn +794, 3 pods, 1 plate, 3 wrecks, 19 entities, and hash `a10b2dfc` 60 ticks after the kill, with the render layers on.

## Self-Check: PASSED

- FOUND: src/app/session/traffic.ts (`export function debrisContentFrom`)
- FOUND: tests/app/session/tick-parity.test.ts (`spawnTestShooter(20)`)
- FOUND: tests/helpers/tick-script.ts (`ships-debris.json`)
- FOUND: 7885d9a, d154d87 in HEAD's history
