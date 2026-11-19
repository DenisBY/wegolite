---
phase: 18-stations-buoys-and-collisions
plan: 16
subsystem: combat
tags: [collisions, collideWithShip, scrape, shields, float32, oracle, fast-check]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-03 response oracle (collide.json 28, scrape.json 8, collideWithShipReference); 18-20 real-Oolite verdicts (no MISMATCH)"
provides:
  - "src/sim/combat/response.ts: CollisionParty, CollisionInput, CollisionResponse, collideWithShip, COLLISION_DAMAGE_DIVISOR, SEPARATING_SPEED_LIMIT, ANTI_CONJOIN_MAGNITUDE2, MIN_SCRAPE_DAMAGE, COLLISION_NUDGE_TICKS"
  - "src/sim/combat/shields.ts: routeScrapeDamage and the module-private drainFacingShield kernel shared with routeDamage"
affects: [18-11, 18-18, 18-21, 18-12]

actuals:
  tokens: 14200
  tasks: 2
  commits: 6
plan_head_before: a95489fd10e1e3ee146a3ccf196438bf4dc11a6a
plan_head_after: cb4d4c23b0948168aeddb5bc5261db8e0f52823c

tech-stack:
  added: []
  patterns:
    - "A pure response kernel that applies nothing: net velocity changes as exact sums of the adjustVelocity: arguments, positions as displacements, the subentity's own changes reported apart from the parent's"
    - "Totality by result check: any non-finite number in a response turns it into `separating`"

key-files:
  created:
    - src/sim/combat/response.ts
    - tests/sim/combat/response.test.ts
    - tests/sim/combat/response.oracle.test.ts
    - tests/sim/combat/response.property.test.ts
  modified:
    - src/sim/combat/shields.ts
    - tests/sim/combat/shields.test.ts

key-decisions:
  - "collideWithShip's input carries `other.parentFrangible` (optional, default true as Oolite's frangible default YES, ShipEntity.m:376) beside the plan's `parentVelocity`, so a non-frangible parent takes dam2 (11124-11125); the response reports `dam2Receiver`, `loc`, `v2b`, `v1a`, `antiConjoin`, `nudged` and `dpOtherSubentity` beyond the plan's field list"
  - "A degenerate input (mass not finite or not positive after rounding to a float, or any non-finite number in the response) is `separating`: the pair gets nothing where Oolite would propagate NaN or infinity (T-18-21)"
  - "The scrape fixture scrape-negative-amount-made-positive is held to the plan's documented divergence (a non-positive amount is no damage), not to Oolite's sign flip at PlayerEntity.m:5710-5713; a property test proves the response never produces negative damage"

patterns-established:
  - "Port-vs-oracle agreement on random inputs lives in a sim property test that imports the oracle's reference (the oracle tree still imports no Wegolite code)"

requirements-completed: [CBT-18]

coverage:
  - id: D1
    description: "collideWithShip, a pure cited port of ShipEntity.m:11020-11152 with the C's float32 locals, both reversals, the subentity split and the 10 x DT nudge"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/response.test.ts (17 hand cases from the C)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/response.oracle.test.ts#collideWithShip against collide.json (28 of 28)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/response.property.test.ts#on random contacts, coincident centres and subentities included"
        status: pass
    human_judgment: false
  - id: D2
    description: "routeScrapeDamage: the facing shield absorbs, the remainder lowers energy (floor 0), no cabin heat; routeDamage unchanged"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/shields.test.ts#routeScrapeDamage (PlayerEntity.m:5701-5753)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/response.oracle.test.ts#routeScrapeDamage against scrape.json (7 by the C, 1 documented divergence)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Totality of both kernels for any doubles (NaN, infinities, 1e308)"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/response.property.test.ts (totality describes)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 16: Collision Response Kernels Summary

**`collideWithShip` ported from `ShipEntity.m:11020-11152` as a pure float32-faithful kernel that applies nothing, plus the player's heat-free `routeScrapeDamage`; 28 of 28 collide fixtures and every scrape fixture pass (one held to the plan's documented negative-amount divergence), and fast-check proves agreement with the 18-03 reference and totality.**

## Performance

- **Duration:** about 15 min
- **Started:** 2026-11-19T21:23:55Z
- **Completed:** 2026-11-19T21:39Z
- **Tasks:** 2 (both TDD; Task 1 a tracer)
- **Files:** 4 created, 2 modified

## Accomplishments

- `collideWithShip(input)` follows the C step by step with each line cited: `loc` by normal-or-z-basis (Wegolite (0, 0, -1) for coincident centres), the parent's velocity for a subentity, `v2b`/`v1a`, the `v2b < -1` return, the 1 m step and `v = 0`, the float damage expressions, the anti-conjoin replacement, the destroyed flags read first and only for a `destroyable` party, both reversals (selfDestroyed's on `other` itself, so a subentity contact gives `dvOtherBody = +vel2a` and `dvOtherSubentity = -vel2a`), the receiver of dam2 (`other`, or a non-frangible parent), and the nudge with `t = f(10 x DT)`. No scoop branch (PD-05), no station case, no script event.
- `routeScrapeDamage(state, amount, otherOffset, forward)`: shares the facing-shield drain with `routeDamage` through the module-private `drainFacingShield`; no heat; energy floors at 0.
- What 18-11 and 18-18 need for the 18-20 anti-conjoin finding (the player's call returns early when separating, then the buoy's own call pushes the player away at 1 m/s, `ShipEntity.m:11080, 11096-11099, 11149-11150`): the response distinguishes `separating` (the C's `return NO`, so the stage must not drop the pair from the other side's list) from `collided`, any party can be `self`, and the zero-relative-speed case gives `antiConjoin: true`, `dvOtherBody = loc` (the other pushed away at 1 m/s) and `dv1 = -loc`, pinned by the hand case "zero relative speed pushes the other away at 1 m/s (the buoy-as-self case)".

## Float choices

- `Math.fround` on the GLfloat locals `m1`, `m2`, `v2b`, `v1a`, `t`, on the input velocities, and on every step of `vector_subtract`, `dot_product`, `magnitude2`, `vector_multiply_scalar` and `m x v2b x v2b / 50000000`, left to right as the C evaluates them.
- Double: `hploc` (`vec x 1/sqrt(|vec|^2)`), positions and displacements, `dam1`/`dam2` after widening, and the compares with the double literals 0.1 and 0.05 (a float `magnitude2` of f(0.1) is above the double 0.1: no anti-conjoin, pinned by a hand case).
- Energies are compared as given (`dam1 > energy`); Wegolite holds them as doubles.

## Fixture pass counts

| File | Fixtures | Result |
|------|----------|--------|
| `collide.json` | 28 | 28 pass |
| `scrape.json` | 8 | 7 pass by the C; `scrape-negative-amount-made-positive` passes as the documented divergence (state unchanged) |

Mutations each killed by the oracle consumer or the agreement property: the selfDestroyed reversal moved to the parent, the anti-conjoin compare against f(0.1), the damage in double, the self nudge sign flipped, `otherDestroyed` without `destroyable`.

## Disputes

- None against the C for the collide fixtures.
- `scrape-negative-amount-made-positive`: the plan (review L413@b45e113) keeps "a non-positive amount is no damage" where Oolite flips the sign (`PlayerEntity.m:5710-5713`). The plan also asks every scrape fixture to pass; the two cannot both hold for this one fixture. The consumer runs it against the plan's rule and names it in `SCRAPE_DIVERGENCES`; the property test proves the response never produces a negative damage, so no caller reaches it. FIDELITY row for 18-12: the sign flip is not ported.

## Task Commits

1. **Task 1 (tracer): collideWithShip** — `73daf2d` (test, RED), `e94cd9e` (feat, GREEN), `9d7d6cc` (test, oracle consumer). Tracer gate (auto mode): the Task 1 verify was rerun after the commits, 4 files and 71 tests passed and typecheck exited 0, so expansion went ahead.
2. **Task 2: routeScrapeDamage, scrape fixtures, totality** — `7ea0bb0` (test, RED), `4018127` (feat, GREEN), `cb4d4c2` (test, oracle extension and property test).

## TDD Gate Compliance

- RED 1: `docker compose run --rm -T test npx vitest run tests/sim/combat/response.test.ts --reporter=tap-flat`, exit 1; target `head-on, equal masses closing at 100 m/s: elastic exchange, damage and nudge` failed on `expected +0 to be close to -1` (the zero stub's loc). Classifier `RED_EVIDENCE_OK / target_test_failed`. Semantic assessment: the target ran and failed on its first planned assertion; every other failure is the same stub.
- RED 2: `docker compose run --rm -T test npx vitest run tests/sim/combat/shields.test.ts --reporter=tap-flat`, exit 1; target `50 from ahead takes the forward shield 64 -> 14 and touches nothing else` failed on `expected 64 to be 14` (no-op stub). Classifier `RED_EVIDENCE_OK / target_test_failed`. Every pre-existing shields test passed.
- Each GREEN commit follows its RED commit; no REFACTOR commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hand case expected the double 0.2 for a float damage**
- **Found during:** Task 1 GREEN. The C's `dam` is the float expression widened, f(0.2) = 0.20000000298023224. The hand case now expects `f(0.2)`.
- **Committed in:** `e94cd9e`

**2. [Rule 2 - Missing critical] `parentFrangible` and `dam2Receiver`**
- **Found during:** Task 1. The plan's input has only `parentVelocity`, but the C routes dam2 to a non-frangible parent (11124-11125) and the fixture `collide-subentity-nonfrangible-parent` expects it. Added `other.parentFrangible?: boolean` (default true) and `dam2Receiver` on the response, plus the diagnostic fields `loc`, `v2b`, `v1a`, `antiConjoin`, `nudged`, `dpOtherSubentity` the fixtures carry.
- **Committed in:** `e94cd9e`

**3. [Rule 2 - Missing critical] Totality beyond the mass guard**
- **Found during:** Task 1. Finite inputs up to 1e308 can overflow a float velocity or the line of centres. Any non-finite number in the response now gives `separating`, so the "no non-finite output from finite inputs" truth holds.
- **Committed in:** `e94cd9e`

**4. Agreement property added** (beyond the plan's totality list): `response.property.test.ts` compares the port with `collideWithShipReference` on 500 random contacts.

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical) plus one extra property. **Impact:** none on scope; nothing calls the kernels yet, so no world, hash or golden moved.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/combat/response.test.ts tests/sim/combat/response.oracle.test.ts tests/oracles/combat/response tests/guards/oracle-independence.test.ts`: 4 files, 71 tests passed.
- `docker compose run --rm test npx vitest run tests/sim/combat tests/oracles/combat/response tests/guards`: 35 files, 684 tests passed.
- `docker compose run --rm test` (with coverage): 248 files, 6,764 tests passed, 10 skipped, exit 0.
- `docker compose run --rm lint`: exit 0. `docker compose run --rm typecheck`: exit 0.
- Acceptance greps: `export function collideWithShip` 1, `export const COLLISION_DAMAGE_DIVISOR = 50_000_000` 1, the comment-stripped `killer|shipHit|routeDamage|takeEnergyDamage|canScoop|Math\.random|try \{` grep on `response.ts` prints nothing, `export function routeScrapeDamage` 1.
- `REQUIREMENTS.md` keeps CBT-18 pending, as 18-03 and 18-09 left it: the kernels have no caller until 18-11 and 18-18 wire them, so the requirement is not met yet.
- No remote run (plan gate policy: `src/sim/combat/**` with no caller); nothing under `src/sim/world/**` or `src/sim/npc/**` changed, so no acceptance rerun.

## Next Phase Readiness

18-11 can wire `collideWithShip` and `routeScrapeDamage` into the tick: apply `dv1`/`dvOtherBody` and `dp1`/`dpOther`, record `dvOtherSubentity` and `dpOtherSubentity` as divergences, route `dam1` for the player through `routeScrapeDamage` and keep the pair in the other side's list on `separating`. 18-12 adds the FIDELITY row for the unported negative-scrape sign flip.

## Self-Check: PASSED

- All 6 key files exist; commits `73daf2d`, `e94cd9e`, `9d7d6cc`, `7ea0bb0`, `4018127`, `cb4d4c2` are ancestors of HEAD.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-19*
