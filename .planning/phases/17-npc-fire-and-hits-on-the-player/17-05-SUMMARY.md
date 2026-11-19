---
phase: 17-npc-fire-and-hits-on-the-player
plan: 05
subsystem: simulation
tags: [npc, fire-gate, drain, weapon-heat, cooling, missed-shots, test-pilot, node-twin, browser-spec, float32]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: the pure NPC fire gate, onTarget, heat and missedShots readers (17-04)
provides:
  - the gated drainFireQueue, the single place an NPC ShotRequest is produced (D-08)
  - coolShips (every live ship's float32 weapon cooling each stepped tick) and the missedShots update at resolution
  - the per-tick test-pilot ask (scheduleWake 1 then fire) with a once-set nav target
  - the D-08 inventory amended once, the Node twin and the browser spec re-pinned to the gated fight
  - the A7 Key Decisions row amended and the NPC fire gate row with the plain per-laser periods
affects: [17-06, 17-07, 17-08, 17-09, 17-10]

plan_head_before: ed750059b9af77a1f9697659a746395eecdcfa28
plan_head_after: 3d5e735b7d976b4aeb218aaa77c8ef831d40abe3
commits: 2

actuals:
  tokens: 28200
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "one gate site at the fire-queue drain: refuse cheaply with no draw, one draw from the shooter's own combat stream written back, ray built before any write"
    - "gate cases hand resolveShots a hand-steered ship (AI component, resolved accuracy, player as nav target) once per tick; hit-rule cases hand it explicit ShotRequests"

key-files:
  created: []
  modified:
    - src/sim/combat/step.ts
    - src/sim/ai/pilots/test-pilot.ts
    - tests/sim/combat/npc-fire.test.ts
    - tests/sim/ai/test-pilot.test.ts
    - tests/sim/ai/test-spawn.test.ts
    - tests/sim/world/kill.test.ts
    - tests/sim/combat/kill.property.test.ts
    - tests/sim/world/world-cadence.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/e2e/combat.spec.ts
    - .planning/PROJECT.md
    - CHANGELOG.md

key-decisions:
  - "The drain gates every NPC request in one place: npcFireBlocked, the weapon row and isMountKey refuse with no draw; the gate takes its one draw from the shooter's own combat stream (local copy, written back whatever the result); cost, float32 heat and lastShotTick are written only with a pushed ShotRequest"
  - "Cooling runs after the drain and the recharge and before the empty-shot return (Oolite's order, cooling at the next update), so the gate reads the temperature the previous tick left"
  - "The hook shooter fires at the gate's rate (first shot within 12 ticks, then at least 12 apart), so the twin kill moves from 794 to 672 and the debris stream (the shooter's combat stream) changes the released debris"
  - "The browser spec asserts hud.drawn plus the probe's combat values, not hud.elements entries: shield and energy are not HUD_ELEMENTS (tests/e2e/hud.spec.ts pins the list)"

requirements-completed: [CBT-15, CBT-16]

coverage:
  - id: D1
    description: "Every NPC shot passes the gate at the drain: refusals with no draw and no write (inert, AI-less after a think throw, self target, dead, non-ship, no weapon row, non-mount laser, world not stepped), one draw per gate call, unarmed draw and refuse, ray before commit"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#who may fire (the drain's refusals, T-17-11, T-17-26)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#the gate takes one draw per request that passes the cheap checks"
        status: pass
    human_judgment: false
  - id: D2
    description: "The hook-spawned shooter fires its first shot within 12 ticks and never twice less than 12 ticks apart; its hits drain the forward shield then the energy bank; cost, heat and lastShotTick follow a hand model; aiDropped stays 0"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#a hook-spawned shooter fires through the gate (tracer, CBT-15, D-09)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cooling by fround(6 x dt) in float32 each stepped tick, including ticks with no shot; a pristine record is never written; the cutout refuses with no draw until cooled; missedShots moves -1 on a hit and +1 on a miss"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#weapon cooling (ShipEntity.m:2214-2218, D-07)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#the heat cutout (ShipEntity.m:9935)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#missedShots moves at resolution (ShipEntity.m:10396, 10425, D-15)"
        status: pass
    human_judgment: false
  - id: D4
    description: "NPC hits on the player by the shared rule: equal-to-shield leaves energy untouched, a larger hit spills and floors, abeam drains forward, behind drains aft"
    requirement: CBT-16
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#an NPC hit on the player, by the shared rule (CBT-16, D-16)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The D-08 inventory is amended once; the 30/60/144 Hz hash equality holds with a gated firing pilot; the frozen anchors did not move"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/world/world-cadence.test.ts#kill cross-cadence determinism (FOUND-18, FOUND-19, QUAL-11)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts, tests/sim/world/populate.test.ts, tests/sim/npc/npc-cadence.test.ts, tests/sim/npc/flyers.scenario.test.ts, tests/app/session/tick-flyers.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "The Node twin and the one opt-in browser spec agree on the gated fight: kill offset 672, 15 entities, hash a545cb4b, shield and energy 360 ticks after the spawn"
    requirement: CBT-16
    verification:
      - kind: unit
        ref: "tests/app/session/tick-parity.test.ts#the browser kill step's twin (plan 15-04, FOUND-19, R2-1)"
        status: pass
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm e2e ... tests/e2e/combat.spec.ts (snapshot 3d5e735, exit=0, 1 passed)"
        status: pass
    human_judgment: false
  - id: D7
    description: "QUAL-11 is unchanged by the drain and the cooling over every ship (21 passed, every metric identical to the 17-04 baseline)"
    requirement: CBT-15
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (snapshot 3d5e735, exit=0, 21 passed)"
        status: pass
    human_judgment: false

duration: 29min
completed: 2026-11-19
status: complete
---

# Phase 17 Plan 05: Gate every NPC shot Summary

**Every NPC shot now passes Oolite's NPC fire gate at the one fire-queue drain (heat, energy, the whole-tick timer, one draw, roll and aim), ships cool in float32 each stepped tick, the test pilot asks every tick and the gate sets the rate, and the Node twin and the browser spec agree on the gated fight (kill at spawn + 672, shield 0.1833 and bank 210.133 after 360 ticks).**

## Performance

- **Duration:** 29 min (2026-11-19T00:37:26Z to 01:06Z)
- **Tasks:** 3 (Task 1 a tracer; Tasks 1 and 2 ended without a commit, Task 3 made the one D-08 code commit)
- **Files:** 12 modified, 1362 insertions and 299 deletions over the plan's two commits

## Commits

| Commit | Subject | Role |
|--------|---------|------|
| `ad1c78d` | `feat(17-05): gate every NPC shot (D-08)` | the ONE D-08 code commit |
| `3d5e735` | `test(17-05): the browser spec follows the twin's debris (no plate released)` | follow-up after the first remote combat run (see Deviations) |

`ad1c78d` file list: `src/sim/combat/step.ts`, `src/sim/ai/pilots/test-pilot.ts`, `tests/sim/combat/npc-fire.test.ts`, `tests/sim/ai/test-pilot.test.ts`, `tests/sim/ai/test-spawn.test.ts`, `tests/sim/world/kill.test.ts`, `tests/sim/combat/kill.property.test.ts`, `tests/sim/world/world-cadence.test.ts`, `tests/app/session/tick-parity.test.ts`, `tests/e2e/combat.spec.ts`, `.planning/PROJECT.md`, `CHANGELOG.md`. No earlier commit of this plan touched `src/sim/combat/step.ts`. The recovery branch `wip/17-05` was not needed: no stop condition fired.

## Accomplishments

- `drainFireQueue(world, worldStepped, player, layout, options)` is the single gate site. Per request it skips (no draw, no write) an undefined, dead or non-ship shooter, a ship `npcFireBlocked` refuses, a missing weapon row and a laser that is not a mount key. Otherwise it runs `npcFireGate` with a local copy of the shooter's own combat stream (written back whatever the result), its temperature, energy, `lastShotTick`, resolved accuracy, `rangeToTargetIn` and an `npcOnTarget` thunk over a view built with the compiled player radius. On `fired` it builds the ray first and only then writes the energy cost, the float32 heat and `lastShotTick` together with the pushed `ShotRequest`. The queue is always cleared.
- `coolShips` runs after `rechargeShips`, before the empty-shot return, and skips a pristine record. The resolve loop moves the NPC shooter's `missedShots` (-1 hit, +1 miss).
- The test pilot's `hold` sets the nav target once (only when the ship's target differs), then `scheduleWake(self, 1)`, then `ctl.fire`. Its think's own random wake never moves the one-tick wake back (never-later rule).
- `npc-fire.test.ts` was rewritten (39 tests) with hand models: the tracer replays the player's bank with `rechargeEnergyAndShields` and `routeDamage`, the shooter's energy and float32 temperature per tick, shot spacing and `lastShotTick`; draw counts come from a hand loop over the same stream; the cutout start tick from a hand loop. Three mutations of `step.ts` (no `coolShips` call, no `npcFireBlocked`, no stream write-back) each fail 3 to 4 tests.

## Early twin measurement (Task 1) and final literals (Task 3)

Measured on the working tree as soon as the drain compiled, with a scratch copy of the twin under `/tmp/17-05-twin` mounted into the container (never a repository file):

| Quantity | Ungated (old pin) | Early (Task 1) | Final pin (Task 3, same) |
|----------|-------------------|----------------|--------------------------|
| kill offset (`KILL_OFFSET`) | 794 | 672 | 672 |
| player bank at the kill (`ENERGY_AT_KILL`) | about 50, floor 16 | 59.7499999999951 | pinned, floor 38.4 |
| `laserRefused` reaching the router | none | none | none |
| forward shield at spawn + 360 (`SHIELD_AFTER_SHOOTING`) | - | 0.18333333333333332 | pinned |
| energy at spawn + 360 (`ENERGY_AFTER_SHOOTING`) | - | 210.13333333333128 | pinned |
| entities at the kill (`ENTITIES_AT_KILL`) | 19 | 15 | 15 |
| debris at the kill | 3 pods, 1 plate, 3 wrecks | 2 pods, 0 plates, 1 wreck | pinned |
| `HASH_60_AFTER_KILL` | `34393ce1` | `a545cb4b` | `a545cb4b` |

No stop condition fired: the bank paid for every pulse (no `laserRefused`), the kill is far inside the 1,500-tick bound, and the bank at the kill (59.75) is above the modelled minimum.

**Derivation of the kill offset.** The player's pulse hits at spawn + 1 + 61k and takes 15 each. The Viper's 180 energy now pays 0.5 per shot: at ten shots a second that is 5 a second against a recharge of 4, a net loss of about 1 a second, so it holds about 174 by the 12th pulse. Eleven pulses (165) leave it alive, the 12th (180) kills it: spawn + 1 + 11 x 61 = 672 (reviewer estimate confirmed; the ungated shooter lost no energy and needed 14 pulses).

**Derivation of the bank floor.** At most `floor((672 - 1) / 12) + 1` = 56 shooter shots in 672 ticks, so at most 56 x 6 = 336 points land. The shield absorbs 128 plus whatever it refills (each refilled point is paid by the bank), the player's own 12 pulses cost 12 x 0.8 = 9.6, and the 4-a-second regeneration is ignored. Energy at the kill is at least 256 - 9.6 - (336 - 128) = 38.4 (`ENERGY_AT_KILL_FLOOR`); the exact measured value is also pinned so any drift of the gate's shot count (6 points a shot) fails.

The debris differs from the ungated pins because the kill's debris is drawn from the dying ship's own combat stream, which now also serves the gate's draws. This is measured, not derived. The browser spec pins the same literals (`TWIN_KILL_OFFSET` 672, `TWIN_ENTITIES_AT_KILL` 15, `TWIN_HASH_60_AFTER_KILL` `a545cb4b`, `TWIN_SHIELD_AFTER_SHOOTING`, `TWIN_ENERGY_AFTER_SHOOTING`) and passed against them.

## The D-08 inventory (search re-run at the plan's start; every hit once)

Search: `rg -n "fire: true|createTestPilotAi|spawnTestShooter|\.fire\(|fireQueue|THINK_INTERVAL|every think|15 ticks|15-tick" tests --glob '!tests/oracles/**'` (31 files).

| File | Disposition |
|------|-------------|
| `tests/sim/combat/npc-fire.test.ts` | amended: hit-rule cases feed `resolveShots` explicit `ShotRequest`s (an inert ship can no longer fire: no AI, unresolved accuracy); the gate, refusal, cooling, cutout, missedShots and tracer cases are new; the pilot cases go through the gate |
| `tests/sim/ai/test-pilot.test.ts` | amended: the call list is `setDesiredSpeed, setTarget once, scheduleWake 1, fire, scheduleWake 12`; no `setTarget` when the ship's nav target holds (the fake view's `ownTarget`); without fire the list is unchanged |
| `tests/sim/ai/test-spawn.test.ts` | amended: the first-step shield drain became "the first shot within 12 ticks"; the 360-tick run states the gate's rate (at most 30 beam shots), no longer `THINK_INTERVAL_TICKS` or 24 thinks |
| `tests/sim/world/kill.test.ts` | amended (669): the holding shooter's lethal shot comes on the first tick whose roll passes within 12 ticks, boundary invariants asserted every tick. Verified unchanged: 426-441, 588-617 (handler fire discarded in the drain) and 835-925 (the survivors test's pilot does not fire, so its 15-tick think cadence and "left hold within 15 ticks" stand) |
| `tests/sim/combat/kill.property.test.ts` | amended: the D-04 same-tick duel and the repeated-kill case pass explicit `ShotRequest`s (`shotOf`, `playerShot`, `resolveOnly`), same victims and credit assertions; the generator's `holdingPilot` comment states the per-tick ask; the queue-truncation properties (1279-1314) unchanged and green |
| `tests/sim/world/world-cadence.test.ts` | KillScenario amended: the "never targeted" R2-11b assertion became "the Viper holds the Sidewinder from its first stepped tick (tick 3) to its death (tick 55)"; comments state that the gate now reads the seeded weapon record (timer to tick 19) and that the Sidewinder dies on the fourth beam hit at the gate's ticks 19, 31, 43 and 55; the two kills (ticks 55 and 64) and the 30/60/144 Hz equality hold. The combat-scenario test (470-520) passed unchanged (its bounds are lower bounds) |
| `tests/sim/world/step.test.ts:370` | verified only (non-firing pilot) |
| `tests/sim/world/{control,snapshot,snapshot-codec,sanitize,debris*}.test.ts`, `tests/app/session/{sim-driver,world-lifecycle,probe-publisher}.test.ts`, `tests/app/probe-shape-compare.test.ts`, `tests/helpers/tick-script.ts`, `tests/sim/combat/{step,dock-reset}.test.ts`, `tests/sim/{ai/flight-script,ai/time,flight-controller}.test.ts`, `tests/guards/fire-decision-source.test.ts`, `tests/e2e/laser-shots.spec.ts`, `tests/fixtures/probe-shape.json` | verified only (queue API, non-firing pilots, the player's fire intent, the 15-tick think constant itself) |
| `tests/app/session/tick-parity.test.ts`, `tests/e2e/combat.spec.ts` | Task 3: re-pinned (see above) |
| `tests/sim/npc/{attack.oracle,attack-dispatch}.test.ts` | unchanged here (no steering fire yet); reworded in plans 17-07 and 17-08 |

Frozen anchors (`flight-hash-pins`, `populate`, `npc-cadence`, `flyers.scenario`, `tick-flyers`): 5 files, 60 tests, unchanged and green.

## The gate row's numbers (A7 amended, NPC fire gate row added in `.planning/PROJECT.md`)

| Laser | NPC period under D-07 (`npcRechargeTicks`) | Literal Oolite NPC frames at 120 Hz (17-01) | Player port (strict `>`) |
|-------|--------------------------------------------|---------------------------------------------|--------------------------|
| pulse | 60 | 60 | 61 |
| beam | 12 | 13 | 13 |
| mining | 300 | 301 | 301 |
| military | 12 | 13 | 13 |

The NPC beam and military fire about 8 % faster than literal Oolite (10.0 against 9.23 shots a second) and than the player. D-07 is kept as the owner locked it; this is owner question 1.

## Verification

| Check | Result |
|-------|--------|
| Task 1 verify: `npc-fire.test.ts`, `fire.test.ts`, `control.test.ts` (tracer gate re-run) | 3 files, 101 tests passed; `typecheck` clean. `Tracer verified end-to-end - expanding` |
| Task 2 verify: `tests/sim/ai tests/sim/world tests/sim/combat` | 37 files, 1607 passed, 1 skipped |
| Task 2 verify: five frozen-anchor files | 5 files, 60 passed |
| Task 3 verify: `tick-parity`, `probe-publisher`, `sim-driver` | 3 files, 129 passed |
| `docker compose run --rm test` (full, coverage thresholds) | 230 files, 6297 passed, 10 skipped, exit 0 |
| `docker compose run --rm lint`, `docker compose run --rm typecheck` | clean (also re-run after the follow-up commit) |
| Remote combat spec, first run | snapshot `ad1c78d`, `exit=1`, `elapsed=44s`: failed at the plate-model wait (see Deviations); the shield, energy, kill-offset, entity-count assertions before it passed |
| Remote combat spec, after the follow-up | snapshot `3d5e735`, `exit=0`, `elapsed=14s`, 1 passed |
| Remote acceptance run (`npm run test:acceptance`) | snapshot `3d5e735`, `exit=0`, `elapsed=76s`, 1 file, 21 passed |

QUAL-11 compared with the 17-04 baseline (summed or minimum over the 20 epochs): minimum hull clearance 41.41144779320824, minimum station clearance 2713.001472744365, arrivals 40 / 40 / 40, AVOID_COLLISION entries 23, attack ticks near the player 61662, stuck / frozen / frustration / stationSphere 0, hull crossings 0 / 0, aiFaulted / aiDropped / repairs / hashFailures 0, stuck and frozen windows 175 / 293: identical to the baseline.

The full `verify` and `verify-full` were not run (plan 17-10 runs the one `verify`; this plan's code is pure `src/sim/` plus a browser spec proved by its own remote run).

## Deviations from Plan

**1. [Rule 1 - Bug] The browser spec waited for a plate model the re-measured kill never releases.** Found during: Task 3 remote run. The first remote combat run (snapshot `ad1c78d`) reached and passed the shield, energy, kill-offset (672), entity-count (15) and request-order assertions, then failed polling for `/models/alloy.glb`: the twin's debris now holds no plate. Fix: `TWIN_PLATES_AT_KILL = 0` (from the Node twin's `DEBRIS_AT_KILL.plates`) and the drawn-asset list requests the plate model only when the twin releases one; the header comment was updated. Files: `tests/e2e/combat.spec.ts`. Commit: `3d5e735` (the follow-up pair the plan allows after a failed remote run; D-08's atomic change had already landed in `ad1c78d`). Verification: remote combat spec exit 0.

**2. [Plan premise] "hud.elements includes the shield and energy elements" is not true in this repository.** `HUD_ELEMENTS` holds 11 ids with no shield or energy entry, and `tests/e2e/hud.spec.ts` pins that they are NOT elements (the FWD/AFT bars and the energy banks are drawn inside the HUD model, not as separate elements). The spec therefore asserts the probe's `combat.fwdShield`, `combat.aftShield` and `combat.energy` (the same combat state the HUD reads) equal the twin's literals and that `hud.drawn` is true. No bypass and no accuracy pin (D-04).

**3. [Process] Ships the gate serves in `npc-fire.test.ts` are hand-steered.** The plan's wording ("inert ships made to fire") would no longer fire: the gate cases give the ship an AI component, a resolved accuracy and the player as nav target, and call `resolveShots` once per tick (the drain, recharge and cooling without the world step). The throw case runs `stepWorld` with a registry whose module queues `ctl.fire` and throws, then `resolveShots`.

**Total deviations:** 3 (1 bug in a pinned expectation, 2 process or plan-premise notes). **Impact:** none on the plan's behaviour; the commit pair is recorded as the plan allows.

## Authentication Gates

None.

## Owner questions (recorded, not blocking)

1. **D-07 shot period (unchanged from 17-01 and 17-04):** keep `round(rate x 120)` (NPC beam and military 12, mining 300, pulse 60) or take the literal Oolite counts (13, 301, 13 for beam, mining and military). One line in `npcRechargeTicks` plus one twin and browser re-pin (kill offset, bank, hash and shield literals). The gate row states the numbers plainly.
2. Informational: the first draw per ship is now taken at the first stepped tick of a gated shooter, so any later change to the number of draws per request (for example the plan 17-06 steering fire sites) re-pins the debris and hash literals again.

## Known Stubs

None. The `weapon.laser === NO_LASER` guard after the gate in `drainFireQueue` is a type-narrowing totality guard (the gate has already refused `noWeapon`), not a stub.

## Threat Flags

None: no new endpoint, auth path, file access pattern or schema change. T-17-11 (ungated path), T-17-12 (`aiDropped` stays 0 over the 360-tick shooter run), T-17-13 (twin measured first, browser equals it, no literal edited to pass) and T-17-26 (ray before commit, non-mount key refused before the gate) are covered by `npc-fire.test.ts`.

## Self-Check: PASSED

- Files found: `src/sim/combat/step.ts`, `src/sim/ai/pilots/test-pilot.ts`, `tests/sim/combat/npc-fire.test.ts`, `tests/app/session/tick-parity.test.ts`, `tests/e2e/combat.spec.ts`, `.planning/PROJECT.md`, `CHANGELOG.md`.
- Commits `ad1c78d` (code, lists `src/sim/combat/step.ts`, `.planning/PROJECT.md`, `tests/app/session/tick-parity.test.ts`) and `3d5e735` are ancestors of HEAD; `commits: 2` measured with `git rev-list --count` from `plan_head_before` `ed75005`.
- `rg -c "amended by plan 17-05" .planning/PROJECT.md` is 1 and `rg -c "NPC fire gate" .planning/PROJECT.md` is 2; the literals of `KILL_OFFSET`, `ENTITIES_AT_KILL`, `HASH_60_AFTER_KILL` and `AFTER_SHOOTING` are identical in the twin and the spec; `CHANGELOG.md` holds the entry under `### Changed` with `### Fixed` below it.
- The plan's automated verify commands all passed, including the remote combat spec and the remote acceptance run.
