---
phase: 17-npc-fire-and-hits-on-the-player
plan: 07
subsystem: simulation
tags: [npc, weapon-temperature, hot-branches, attack-dispatcher, float32, fire-sites, divergences]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: the float32 cutout NPC_WEAPON_CUTOUT_F32, the gate and heatWeapon/coolWeapon (17-04), the drain and cooling (17-05), the steering fire route and the four fire sites (17-06)
provides:
  - NPC_WEAPON_TEMP_USABLE derived from NPC_WEAPON_CUTOUT_F32 x NPC_MAX_WEAPON_TEMP (217.60000610351562); the constant-zero weapon temperature removed with every reader
  - behaviourAttackTarget and break-off's hand-over (3932) reading entity.weapon.temperature
  - the sniper (4456), six/twelve (4577) and fly-to (4713) hot tails handing back to ATTACK_TARGET
  - hot-weapon.test.ts (20 tests): stepped heat-up, cutout and recovery against a float32 hand loop
  - the Phase 14 divergences row amended (items 15, 21, 22 and the new item 23)
affects: [17-08, 17-09, 17-10]

plan_head_before: f4d64505aa55e86dfc9dfc5460896a40a0c5ee37
plan_head_after: 30f2a0c5699a561d5dff97718c5205c57f678c84
commits: 3

actuals:
  tokens: 19850
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "one float32 home for the NPC thresholds: USABLE is a product of the gate's cutout constant, so the gate and the behaviours cannot disagree at the boundary"
    - "stepped scenarios mirror the heat with a literal float32 hand loop (fround) over the observed shot events, not with the port's own heatWeapon/coolWeapon"
    - "a behaviour under test is re-injected before every tick (injectedRun) so one behaviour steers while the real world step, gate, heat and cooling run"

key-files:
  created:
    - tests/sim/npc/hot-weapon.test.ts
  modified:
    - src/sim/npc/constants.ts
    - src/sim/npc/behaviours/attack.ts
    - src/sim/npc/behaviours/attack-evade.ts
    - src/sim/npc/behaviours/attack-close.ts
    - src/sim/npc/behaviours/flee.ts
    - tests/sim/npc/constants.test.ts
    - tests/sim/npc/attack-dispatch.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "The hot reads use the steering-time temperature (after the previous tick's cooling, before this tick's shot): the request is queued during steering and the shot lands at the drain, so every tail reads what it read in Oolite's update order"
  - "Fly-to's 4713 condition uses the raw aimToleranceOf(accuracy), so a non-zero missedShots does not enter it (review Fable L3); pinned with missedShots 100 at ranges either side of 6,127 m"
  - "The fly-to dodge (4721-4730) stays unported as Phase 14 divergence 21, restated exactly in the header and the divergences row"

requirements-completed: [CBT-15]

coverage:
  - id: D1
    description: "A continuously firing opted-in attacker heats by the float32 hand loop on every tick over 6,000 ticks; the dispatcher takes the ordinary chain below 64, the heating branch from 64 and the no-usable-weapon branch past the cutout; the fly-to tail hands back; the gate refuses from the cutout with no draw and cooling lets it fire again"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/hot-weapon.test.ts#a firing attacker heats up, cuts out and recovers (tracer, criterion 1, D-06, D-07)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The dispatcher and break-off read the live temperature at 64 and 217.6 (float32), and the existing dispatcher table passes with the temperature set on the entity"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/hot-weapon.test.ts#the dispatcher reads the live temperature (ShipEntity.m:4079-4126)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/hot-weapon.test.ts#break-off's hand-over reads the live temperature (ShipEntity.m:3932)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/attack-dispatch.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The sniper, six/twelve and fly-to tails hand back to ATTACK_TARGET exactly when the read exceeds 0.85f x 256 (strict), with Oolite's accuracy and raw aim_tolerance conditions, and fly-to never dodges"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/hot-weapon.test.ts#the sniper's hot tail (ShipEntity.m:4456)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/hot-weapon.test.ts#six and twelve's hot tail (ShipEntity.m:4577)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/hot-weapon.test.ts#fly-to's hot tail (ShipEntity.m:4713-4720)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/hot-weapon.test.ts#stepped hot tails against the 1e6-energy target (criterion 1, D-06)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The USABLE constant is the float product of the one cutout constant and the constant-zero weapon temperature export is gone from code, tests and comments"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/constants.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every non-opted-in world is byte-identical: the frozen anchors, world-cadence and the 20-seed QUAL-11 run are unchanged"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts, tests/sim/world/populate.test.ts, tests/sim/npc/npc-cadence.test.ts, tests/sim/npc/flyers.scenario.test.ts, tests/app/session/tick-flyers.test.ts, tests/sim/world/world-cadence.test.ts"
        status: pass
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (snapshot 30f2a0c, exit=0, elapsed=77s, 21 passed)"
        status: pass
    human_judgment: false

duration: 33min
completed: 2026-11-19
status: complete
---

# Phase 17 Plan 07: The weapon temperature live in the attack steering Summary

**The forward weapon temperature now steers Phase 14's attack behaviours at Oolite's float32 thresholds (the dispatcher and break-off, and the sniper, six/twelve and fly-to hot tails), proven by a stepped heat-up, cutout and recovery against a literal float32 hand loop, with every non-opted-in world and the 20-seed run unchanged.**

## Performance

- **Duration:** 33 min (about 2026-11-19T01:30Z to 02:03Z)
- **Tasks:** 3 (Task 1 a tracer)
- **Files:** 1 created, 8 modified; 773 insertions and 54 deletions over the three commits

## Commits

| Commit | Subject | Role |
|--------|---------|------|
| `28d60ec` | `feat(17-07): the dispatcher and break-off read the live weapon temperature (D-06, D-07, tracer)` | Task 1: USABLE derived from the cutout, the constant-zero temperature deleted with all readers, dispatcher and break-off on the live field, the tracer |
| `c8d4995` | `feat(17-07): the sniper, six and fly-to hot tails read the live weapon temperature (D-06)` | Task 2: the three tails, flee's header, the tail and stepped tests |
| `30f2a0c` | `docs(17-07): the Phase 14 divergences row follows the live weapon temperature and names the unported fire calls` | Task 3: items 15, 21, 22 amended and item 23 added |

`commits: 3` measured with `git rev-list --count` from `plan_head_before` `f4d6450`.

## Branches ported (Oolite lines, `ShipEntity.m`)

| Site | Lines | Port |
|------|-------|------|
| dispatcher ready / usable tiers | 4079-4090 | `behaviourAttackTarget` reads `entity.weapon.temperature` against `NPC_WEAPON_TEMP_READY` (64) and `NPC_WEAPON_TEMP_USABLE` (217.60000610351562); the third parameter is gone |
| break-off hand-over | 3932 | `entity.weapon.temperature < READY` |
| sniper tail | 4456 | after `ctx.fire?.()`: `temperature > USABLE && accuracy >= 0` sets ATTACK_TARGET |
| six and twelve tail | 4577 | after `ctx.fire?.()`: `temperature > USABLE` sets ATTACK_TARGET at any accuracy |
| fly-to tail | 4713-4720 | after `ctx.fire?.()`: `temperature > USABLE && accuracy >= 0 && aimToleranceOf(accuracy) x range < 1,250,000`, then `aspect < 0` sets frustration 0 and ATTACK_TARGET, no else |

All reads are the steering-time temperature (after the previous tick's cooling, before this tick's shot). `NPC_WEAPON_TEMP_USABLE = NPC_WEAPON_CUTOUT_F32 * NPC_MAX_WEAPON_TEMP`, the C float product `0.85f * 256.0f`; there is one `Math.fround(0.85)` in the code (the cutout itself).

## Unreachable and unported (each re-confirmed against the Oolite checkout)

The six fire-call sites outside the ported four (4035, 4454, 4575, 4711), plus fly-to's own unreachable terms:

| Oolite line | Behaviour | Call | Why unported |
|-------------|-----------|------|--------------|
| 4328, 4330 | `behaviour_attack_broadside_target:leftside:` | `firePortWeapon:`, `fireStarboardWeapon:` | ATTACK_BROADSIDE is on Phase 14's OUT list; port and starboard weapons are none on every compiled record |
| 4607 | `behaviour_attack_mining_target` | `fireMainWeapon:` (range < 3,000 m) | OUT list; entered from a miner's AI script; no compiled NPC carries a mining laser |
| 4821, 4823 | `behaviour_running_defense` | `fireMainWeapon:` (turret forward laser), else `fireAftWeapon:` | OUT list; needs an aft weapon or a turret forward laser, neither compiled |
| 4891-4892 | `behaviour_flee_target` | `fireMainWeapon:` (turret laser only) | flee is ported; the call needs a turret laser; recorded in `flee.ts`'s header |
| 5186, 5208 | `behaviour_track_as_turret` | `fireTurretCannon:` | no turret is modelled; OUT list |
| 5391-5397 | `behaviour_scripted_ai` | the four facings | Oolite's JavaScript AI is out of scope |

Also unreachable, for the same reason (no aft, port, starboard or turret weapons on any compiled record): fly-to's `aft/port/starboard` terms (4717) and the dispatcher's RUNNING_DEFENSE (4131-4133, 4174-4176) and ATTACK_BROADSIDE (4134-4136, 4171-4173) branches. These are recorded in the divergences row as the new item 23.

The fly-to dodge stays unported, restated exactly: the `else if` at 4721-4730, taken when the 4713 condition is false, accuracy >= `COMBAT_AI_FLEES_BETTER_2` (9) and the target is not fleeing, sets frustration 0 and EVASIVE_ACTION when the target has a forward weapon at aspect > 0.99999 (or an aft weapon at aspect < -0.999). The port never dodges from fly-to (Phase 14 divergence 21; D-06 covers fire sites and hot-weapon branches only). When the 4713 condition is true Oolite skips the `else if`, as the port does.

## Evidence

- **Tracer.** An opted-in Viper (beam laser, 3.2 a shot) attacks an inert Adder 3,000 m ahead with `maxEnergy` `MAX_ENTITY_ENERGY` (1e6) and no recharge. Over 6,000 stepped ticks the entity's temperature equals a literal float32 hand loop (shot ticks taken from the `laserFired` events, then `fround(t + fround(3.2))`, then `max(fround(t - fround(6 dt)), 0)`) on every tick. READY (64) is crossed around tick 300 and the cutout around tick 1,000 (asserted inside 250-350 and 900-1,100). Per-tick checks over the whole run: a dispatcher update below 64 picks fly-to, from 64 up to 217.6 the heating branch (fly-from), past it the no-usable-weapon branch (fly-to with the jink left alone); a fly-to update reading above the limit hands back to ATTACK_TARGET; every request at or above the cutout is refused with no shot and no draw; a shot only fires below the cutout; 160 shots fired, 76 of them after the first cutout refusal (cooling lets it fire again); the peak stays under the cutout plus one shot (220.7). The viper's own dance (hot hand-back, heating back-off to fly-from, return and fire again) is Oolite's regulation loop around the cutout.
- **Dispatcher probes.** At the first read in [60, 64) it takes the ordinary chain (jink zeroed); at the first read at or above 64 it backs off with an evasive jink (x, y non-zero, z negative); at the first read at or above 217.60000610351562 it takes the overheated branch and the preset jink is left as it is.
- **Break-off.** 63.9 hands over to fly-to-target with frustration reset; 64, 100, 217.6 and 250 do not.
- **Tails.** Sniper: accuracy 0 and 2 hand back above the limit, -1 does not, the limit itself and one float32 step below it do not; six and twelve: any accuracy from -5 to 9 hands back strictly above the limit; fly-to: the 408,000 case hands back with frustration 0, the cool, 100 and at-the-limit cases do not, 204 x 6,000 passes and 204 x 7,000 does not with and without `missedShots` 100, accuracy -1 does not and 0 does, aspects 0, 0.5 and 1 change nothing, and an accuracy-9 pilot in the target's gunsights does not take EVASIVE_ACTION.
- **Injected runs.** Each of fly-to, six (accuracy -1 and 2), twelve and the sniper (Adder at 20,000 m) is re-injected before every tick from a start of 217.9 cooling through the limit in the real world step; the hand-back equals "the read exceeds 217.60000610351562" tick by tick, with both outcomes present in every run.
- **Mutations** (not committed), each caught: reading a constant 0 in the dispatcher and break-off fails 3 tests; removing the six tail fails 5; fly-to `>=` without the accuracy term fails 2; dropping the fly-to aspect term fails 1; dropping the sniper accuracy term fails 1.

## Verification

| Check | Result |
|-------|--------|
| Task 1 targeted: `hot-weapon`, `constants`, `attack-dispatch`, `attack-evade`, `attack.oracle` | 5 files, 302 tests passed; `Tracer verified end-to-end - expanding` (re-run after the tracer commit) |
| `typecheck` after each task | clean |
| Task 2: `tests/sim/npc` | 29 files, 962 tests passed |
| Frozen anchors and world-cadence: `flight-hash-pins`, `populate`, `npc-cadence`, `flyers.scenario`, `tick-flyers`, `world-cadence` | 6 files, 70 tests passed, unchanged |
| `docker compose run --rm test` (full, coverage thresholds) | 232 files, 6348 passed, 10 skipped, exit 0 |
| `docker compose run --rm lint`, `docker compose run --rm typecheck` | clean (a first lint and typecheck run overlapped the full suite, whose purity guard writes probe files into the tree, and failed with ENOENT/TS6053; the reruns after it finished are clean) |
| Acceptance criteria | `weapon\.temperature` in `attack.ts` 3, `attack-evade.ts` 3 and `attack-close.ts` 3; `NPC_WEAPON_CUTOUT_F32 * NPC_MAX_WEAPON_TEMP` on code lines 1; `fround(0.85)` on code lines 1; `rg -w NPC_WEAPON_TEMP src tests` prints nothing; `4890` in `flee.ts` 1; fly-to's 4713 condition uses `aimToleranceOf(`; `amended by plan 17-07`, `4607`, `4821` and `4721-4730` in PROJECT.md each present |
| Remote QUAL-11 acceptance (`npm run test:acceptance`) | snapshot `30f2a0c` (committed HEAD), `exit=0`, `elapsed=77s`, 1 file, 21 passed |

### QUAL-11 compared with the 17-04 baseline

Summed or minimum over the 20 epochs; identical to the baseline `dc79f37` (and to 17-04's post-change and 17-06's runs):

| Metric | Baseline | This run (`30f2a0c`) |
|--------|----------|----------------------|
| minimum hull clearance | 41.41144779320824 | 41.41144779320824 |
| minimum station clearance | 2713.001472744365 | 2713.001472744365 |
| arrivals (station / intercept / flee) | 40 / 40 / 40 | 40 / 40 / 40 |
| AVOID_COLLISION entries | 23 | 23 |
| attack ticks near the player | 61662 | 61662 |
| stuck / frozen / frustration / stationSphere | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| hull crossing episodes / unexcused | 0 / 0 | 0 / 0 |
| aiFaulted / aiDropped / repairs / hashFailures | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| stuck / frozen windows evaluated | 175 / 293 | 175 / 293 |

The flyers run attack behaviours but never opt in, so temperature stays 0 in every frozen world and each hot read takes the branch it always took.

`verify` and `verify-full` were not run (no browser-facing code; plan 17-10 runs the one `verify`). No fire-site fixture file was opened (they are consumed in plan 17-08).

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- The tracer scenario was extended beyond the plan's 1,400-tick sketch to 6,000 ticks. After Task 2 the fly-to hot tail hands back at the cutout and the dispatcher's heating branch then backs the viper off (fly-from) so it cools; "cooling lets it fire again" only follows once it returns to fly-to (76 shots after the first refusal in the run). This is Oolite's regulation loop, not a port defect.
- An existing `constants.test.ts` pin could not hold the literal 217.60000610351562 (ESLint `no-loss-of-precision`), so the pin is `Math.fround(217.6)` (the nearest float to 217.6, equal to `fround(0.85) * 256`) with the long value in a comment, plus a pin to `NPC_WEAPON_CUTOUT_F32 * 256`.
- `CHANGELOG.md` was not touched: nothing here is user-visible (an opt-in param no shipped world sets).

**Total deviations:** 0.

## Authentication Gates

None.

## Owner questions (recorded, not blocking)

1. Informational (carried from 17-04, unchanged): D-07 shot period, keep `round(rate x 120)` (12, 300, 12) or take the literal Oolite counts (13, 301, 13) for beam, mining and military. With the temperature live, the beam shot period also sets how fast an attacker reaches the cutout (net +2.6 a 12-tick cycle for the Viper); a change would move the tick numbers asserted in the tracer's 250-350 and 900-1,100 windows.

## Known Stubs

None.

## Threat Flags

None: no endpoint, auth path, file access or schema change (a hashed field now steers behaviour choices, the trust boundary named as T-17-18 in the plan; mitigated by the frozen anchors, world-cadence and the remote 20-seed run above, and T-17-19 holds as the sanitiser bounds the field and a NaN compare is false).

## Self-Check: PASSED

- Files found: `tests/sim/npc/hot-weapon.test.ts`, `src/sim/npc/constants.ts`, `src/sim/npc/behaviours/attack.ts`, `src/sim/npc/behaviours/attack-evade.ts`, `src/sim/npc/behaviours/attack-close.ts`, `src/sim/npc/behaviours/flee.ts`, `tests/sim/npc/constants.test.ts`, `tests/sim/npc/attack-dispatch.test.ts`, `.planning/PROJECT.md`.
- Commits `28d60ec`, `c8d4995`, `30f2a0c` are ancestors of HEAD; `commits: 3` measured from `plan_head_before` `f4d6450`.
