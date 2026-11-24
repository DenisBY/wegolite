---
phase: 18-stations-buoys-and-collisions
plan: 09
subsystem: combat
tags: [octree, collision, contact, subentity, oracle, fast-check, CBT-18]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-02 geometry oracle (octree-collide.json, isHitByOctreeReference, doOctreesCollideReference); 18-13 HullData.subentities and fullHullTable; 18-20 no MISMATCH on the buoy ram"
provides:
  - "isHitByOctree (src/sim/combat/octree.ts): literal port of Octree.m:473-607, total"
  - "src/sim/combat/collide.ts: HullPose, ContactPart, ContactHull, doOctreesCollide (literal recursive port of ShipEntity.m:1878-1942 with otherDetached and primeDetached)"
  - "tests: hand cases, the 23-fixture oracle consumer, agreement and totality properties"
affects: [18-11, 18-18, 18-21]

actuals:
  tokens: 17000
  tasks: 2
  commits: 3
plan_head_before: 39b50680568ec33fe8360caa1c139304d4418479
plan_head_after: 23d74abb27c26a14177c254e4e7ec25a5a34d004

tech-stack:
  added: []
  patterns:
    - "Contact kernels take a ContactHull (octree plus optional subentities), so the C's recursion with a subentity as prime calls the same function"
    - "Rotation arbitraries draw evenly spread values (noBias integers scaled), never fc.double, so near-identity rotations do not hide a basis bug"

key-files:
  created:
    - src/sim/combat/collide.ts
    - tests/sim/combat/collide.test.ts
    - tests/sim/combat/octree-collide.oracle.test.ts
    - tests/sim/combat/collide.property.test.ts
  modified:
    - src/sim/combat/octree.ts

key-decisions:
  - "The transposed placement of Octree.m:552 is ported as the C has it (resolveVectorInIJK of the child offset); a scratch mutant that corrects it fails two fixtures and both agreement properties"
  - "The C's fourth stage (ShipEntity.m:1924-1938) is not ported: stage 2's recursion already returns the other's hull for a subentity-against-subentity contact"
  - "Totality bounds: an ijk row whose squared length is more than 1e-6 from 1 (1e308, NaN) and a pose orientation outside QUAT_UNIT_TOLERANCE are no contact; an overflowed centre inside the descent is no hit"

patterns-established:
  - "Octree contact frames: Oolite model axes of a Wegolite pose are rotate(q, +X), rotate(q, +Y), rotate(q, -Z); a subentity offset maps to local (x, y, -z)"

requirements-completed: [CBT-18]

coverage:
  - id: D1
    description: "isHitByOctree, a literal port of Octree.m:473-607 with crude prunes, change_oct order, the transposed :552 placement and the prime always axial"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collide.test.ts#isHitByOctree: hand cases"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/octree-collide.oracle.test.ts#tests/sim/combat/octree-collide.oracle.test.ts (16 pair fixtures, direct and hull-pose form)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collide.property.test.ts#isHitByOctree agrees with isHitByOctreeReference"
        status: pass
    human_judgment: false
  - id: D2
    description: "doOctreesCollide, a literal recursive port of ShipEntity.m:1878-1942 returning the contacted part, with detached subentities on either side skipped (PD-01)"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collide.test.ts#doOctreesCollide: the composition over subentities (ShipEntity.m:1878-1942)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/octree-collide.oracle.test.ts#octree-sub-sub-returns-other (and the 6 other compose fixtures)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collide.property.test.ts#doOctreesCollide agrees with doOctreesCollideReference"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real hulls: the player's Cobra meets the buoy at the solid cells' reach, 1 m clear with overlapping spheres reports none"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collide.test.ts#doOctreesCollide: the player's Cobra against the nav buoy"
        status: pass
    human_judgment: false
  - id: D4
    description: "Totality: NaN, infinities and 1e308 in any origin, basis, position or quaternion component, a length-7 node and an over-deep tree are no hit"
    verification:
      - kind: unit
        ref: "tests/sim/combat/collide.property.test.ts#totality"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 09: Octree-Against-Octree Contact Summary

**Oolite's octree-against-octree contact test and its recursion over subentities are ported as pure kernels. All 23 fixtures from 18-02 pass, and the port agrees with the independent transliteration. The player's Cobra first touches the nav buoy at 120.088 m side-on and at 99.619 m when turned 90 degrees. Nothing calls the kernels yet, so no world, hash or golden changes.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-11-19T20:55:41Z
- **Completed:** 2026-11-19T21:19:56Z
- **Tasks:** 2 (Task 1 tracer, RED then GREEN; Task 2 tests only)
- **Files:** 4 created, 1 modified

## Accomplishments

- `isHitByOctree(prime, other, origin, ijk)` ports `Octree.m:473-607` literally:
  - the empty checks and the two crude prunes (`:497-503` and `:504-512`, where the radius compare only picks the prune);
  - nearest-octant order through `change_oct` (`:70`);
  - decomposition of the other with `resolveVectorInIJK` of the child offset (`:550-554`), keeping the C's transpose;
  - decomposition of the axial tree otherwise.
  The prime is always the axial tree. Recursion is capped by each tree's own level against `MAX_OCTREE_DEPTH`, the same rule as `isHitByLine`.
- `doOctreesCollide(prime, primePose, other, otherPose, otherDetached?, primeDetached?)` ports `ShipEntity.m:1878-1942`:
  - hull against hull (`:1895-1900`);
  - each prime subentity against the whole other, by calling itself (`:1902-1911`), where any contact returns the other's hull;
  - the prime against each of the other's subentities (`:1913-1922`).
  The fourth stage (`:1924-1938`) is left out because it cannot be reached. Detached indices on either side are skipped (PD-01). Stage 2 passes `otherDetached` through.
- Cobra against buoy, using `fullHullTable()`, with the buoy at the origin and the player on +X:

  | Player pose | First contact moving inward (0.25 m scan) | Last contact moving outward | 1 mm scan | Solid-cell reach |
  |---|---|---|---|---|
  | identity (side-on) | 120.00 m | 120.00 m | 120.088 m | 54.589 + 65.500 = 120.089 m |
  | 90 degrees about Y (nose first) | 99.50 m | 99.50 m | 99.619 m | 54.589 + 45.031 = 99.620 m |

  Contact begins exactly where the solid leaf cubes meet, because with these poses every prune is an exact cube test. The part reported is `hull`. At 200 m there is no contact. At reach + 1 m the result is `null` although the bounding spheres still overlap (72.70 + 59.14 = 131.83 m), so there is no sphere-only contact.

## Fixture and Property Counts

- `octree-collide.json`: 23 of 23 pass. The 16 pair fixtures run in both forms: direct `isHitByOctree`, and `doOctreesCollide` with the prime at the identity pose. The 7 compose fixtures map to `null`, `{ kind: "hull" }` or `{ kind: "subentity", index }`. This includes both prime-role fixtures, the pruned corner, the transposed decomposition and `octree-sub-sub-returns-other`. Every basis quaternion turns the unit axes back onto `wegoliteBasis` within 1e-12.
- Agreement with `isHitByOctreeReference`: 300 random depth-2 pairs (59 hits, 241 misses). A further 300 pairs use a small solid prime inside a turned, sparse depth-2 other, which always decomposes the other (116 hits, 184 misses).
- Agreement with `doOctreesCollideReference`: 300 random hulls with up to two subentities each, under identity and the three half turns. Every outcome appears: `none`, `hull` and `subentity`.
- Totality: 300 runs each inject NaN, plus or minus Infinity, or plus or minus 1e308 into one origin or basis component, or into one pose position or quaternion component. There is also a node array of length 7 on each side, and a chain of 8 nested arrays (no hit; 7 nested arrays still hit).
- Scratch mutants (under /tmp, restored before commit):
  - Correcting the `:552` transpose fails `octree-rotated-decomposition-transposed`, `octree-prime-smaller-axial-prime` and both agreement properties.
  - Always making the larger tree axial fails `octree-prime-smaller-axial-prime`.

No dispute: no fixture failed against the port at any point.

## Task Commits

1. **Task 1: Cobra against buoy, end to end (tracer):** `6a18912` (test, RED), `ae4d914` (feat, GREEN)
2. **Task 2: fixtures, agreement and totality:** `23d74ab` (test)

## TDD Gate Compliance

- **Task 1 RED:** `docker compose run --rm -T test npx vitest run tests/sim/combat/collide.test.ts -t "two solid roots touching on a face hit" --reporter=tap-flat`, exit 1. The target failed with "expected false to be true" against the stub `isHitByOctree`. Classifier: `RED_EVIDENCE_OK / target_test_failed`. Semantic check: the target ran and failed on the planned assertion. Across the whole file, 8 tests failed and 5 passed; the passing five only expect `false` or `null`, which a stub returns. The first full-file TAP run was refused as `invalid_record` because vitest wrote multi-line YAML strings for `toEqual` diffs. The target-only rerun is the evidence.
- **Task 1 GREEN:** all 13 hand cases pass. I tightened the distance assertions after measuring: inward contact lies within one 0.25 m step of the solid-cell reach. This tightens a hand test and does not change the port.
- **Tracer gate (auto mode):** after GREEN I reran the Task 1 verify (`collide`, `octree` and `hit` tests: 54 passed, typecheck exit 0) before starting Task 2.
- **Task 2:** this task only adds tests, and the kernels already existed from Task 1 GREEN, so there is no RED commit (the behaviour-adding predicate is false). The mutants above show the new tests can fail.

## Decisions Made

See the key-decisions in the frontmatter. In short: the `:552` transpose is kept, stage 4 is not ported, and the totality bounds are an ijk row length within 1e-6 of unit, a pose quaternion within `QUAT_UNIT_TOLERANCE`, and a finite centre at every step.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The agreement property first could not detect a corrected transpose**
- **Found during:** Task 2
- **Issue:** `fc.double` draws evenly over double representations and favours 0 and the bounds. Most generated quaternions were therefore identity or half turns, where `B = B^T`. The scratch mutant that "corrects" `:552` passed all 300 runs.
- **Fix:** rotation components and origins are now drawn by `even(min, max)`, which scales unbiased integers. A second agreement property puts a small solid prime inside a turned, sparse depth-2 other. Both properties now fail the mutant and pass the port.
- **Files modified:** tests/sim/combat/collide.property.test.ts
- **Committed in:** 23d74ab

**2. [Rule 1 - Bug] C line numbers in the plan for the composition stages**
- **Found during:** Task 1
- **Issue:** the plan cites `:1899-1906` and `:1909-1918`. In the checkout (equal to the pin for this file), the stages are `:1895-1900`, `:1902-1911`, `:1913-1922` and `:1924-1938`.
- **Fix:** collide.ts cites the measured lines.
- **Committed in:** ae4d914

**Total deviations:** 2 auto-fixed (Rule 1). **Impact:** the tests got stronger and the citations are correct. No fixture, tolerance, threshold or package changed.

## Issues Encountered

- The `doOctreesCollide` signature takes `ContactHull = Pick<HullData, "octree" | "subentities">` rather than `HullData`. A `HullData` still fits, and so does a `SubentityHull`, which lets stage 2 call the same function with a subentity as prime, as the C does.
- Out of scope, not changed: the `OctreeNode` doc comment in octree.ts still cites `Octree.m:640-645` for the node layout. 18-02 found that those lines are `volumeOfOctree`.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/combat tests/oracles/combat/geometry tests/guards`: 32 files, 634 passed.
- `docker compose run --rm test`: 245 files, 6697 passed, 10 skipped, exit 0, no coverage-threshold error.
- `docker compose run --rm lint`: exit 0. `docker compose run --rm typecheck`: exit 0.
- Acceptance greps:
  - one `export function isHitByOctree`;
  - one `export function doOctreesCollide`;
  - the comment-stripped `killer|shipHit|Math.random|Date.now|performance.now|try\s*{` grep on collide.ts prints nothing;
  - `octree-collide.json` appears 2 times in the consumer;
  - `isHitByOctreeReference` appears 5 times in the property test.
- No remote run, as the plan specifies: the kernels have no caller. No file under `src/sim/world/**` or `src/sim/npc/**` changed, so the 20-seed acceptance run is not required. There is no CHANGELOG line because nothing changes for the player yet.

## User Setup Required

None.

## Next Phase Readiness

- 18-11 and 18-18 can build the collision stage on `doOctreesCollide`. Once its sphere pass has run, the caller passes poses in Wegolite world axes and the detached-subentity sets from `World.buoys`.

## Self-Check: PASSED

- The 4 created files and 1 modified file exist.
- Commits 6a18912, ae4d914 and 23d74ab are ancestors of HEAD.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-19*
