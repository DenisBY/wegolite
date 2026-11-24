---
phase: 18-stations-buoys-and-collisions
plan: 02
subsystem: testing
tags: [oracle, octree, collision, laser-hit, subentity, fixtures, independence]

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: the independent-oracle pattern and tests/guards/oracle-independence.test.ts
provides:
  - "tests/oracles/combat/geometry: DockMouthFixtureSchema, OctreeCollideFixtureSchema, readDat, rayMeshDistance, deriveDockMouth, isHitByOctreeReference, doOctreesCollideReference, bruteForceOverlap"
  - "fixtures/dock-mouth.json: 20 cited beam fixtures (17 Coriolis, 3 buoy) with up-front tolerances and the octree depth each assumes"
  - "fixtures/octree-collide.json: 23 cited octree-against-octree and composition fixtures"
affects: [18-04, 18-09, 18-11, 18-18, 18-20]

actuals:
  tokens: 44594
  tasks: 2
  commits: 4
plan_head_before: e00799766a3eb5d6bb53060f11fc2f7fe1415989
plan_head_after: 516f8868a12a8f3bef2244c291685079a3d381d8

tech-stack:
  added: []
  patterns:
    - "Fixture tolerance fixed up front from leaf size and incidence; candidates are dropped, never widened"
    - "An implicit-octree transliteration of isHitByLine screens beam fixtures inside the oracle"
    - "Seeded property loop with a derived slack, plus local mutants that each flip one pinned fixture"

key-files:
  created:
    - tests/oracles/combat/geometry/schema.ts
    - tests/oracles/combat/geometry/dat.ts
    - tests/oracles/combat/geometry/ray-mesh.ts
    - tests/oracles/combat/geometry/derive.ts
    - tests/oracles/combat/geometry/octree-collide.ts
    - tests/oracles/combat/geometry/fixtures/dock-mouth.json
    - tests/oracles/combat/geometry/fixtures/octree-collide.json
    - tests/oracles/combat/geometry/geometry.self.test.ts
  modified: []

key-decisions:
  - "Dock-mouth beams are axis-parallel only: isHitByLine (Octree.m:336-455) visits octants entry first, then the x, y, z neighbours in a fixed order, which equals ray order only for an axis-parallel ray off the octree's centre planes"
  - "The octree oracle keeps Octree.m:552 as written: resolveVectorInIJK places the other's children with the transpose of the geometric map; fixture octree-rotated-decomposition-transposed pins it (the C misses a 3.33 m overlap)"
  - "Soundness and completeness carry the derived crude-prune slack (sqrt(3) - 1) x the larger root half-width and run on symmetric poses (identity, half turns); identity poses must match brute force exactly"
  - "No buoy subentity fixture: the best exact subentity wins have a 3.79 m margin against the 13.58 m that twice the tolerance requires"

patterns-established:
  - "Geometry oracle ids: dock- and octree- prefixes, unique across every JSON file under tests/oracles"
  - "Rotated octree fixtures carry wegoliteBasis = S B S, S = diag(1, 1, -1), B with the ijk axes as columns"

requirements-completed: [CBT-17, CBT-18]

coverage:
  - id: D1
    description: "Dock-mouth and buoy beam fixtures re-derived from the vendored meshes and the doesHitLine subentity rule, with tolerances, margins, clearances and the edge floor"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/oracles/combat/geometry/geometry.self.test.ts#re-derives every fixture exactly from the meshes and the C rule"
        status: pass
      - kind: unit
        ref: "tests/oracles/combat/geometry/geometry.self.test.ts#keeps the edge floor: two slot-edge and two faceplate-edge beams"
        status: pass
      - kind: unit
        ref: "tests/oracles/combat/geometry/geometry.self.test.ts#the octree model of the C agrees on the winner, within the tolerance"
        status: pass
    human_judgment: false
  - id: D2
    description: "Octree-against-octree reference and composition fixtures, prime-role mutants, the pruned corner, the transposed placement and the soundness/completeness loop"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/oracles/combat/geometry/geometry.self.test.ts#re-derives every fixture from the transliterated C"
        status: pass
      - kind: unit
        ref: "tests/oracles/combat/geometry/geometry.self.test.ts#keeps the prime axial: each prime-role fixture flips under its own mutant"
        status: pass
      - kind: unit
        ref: "tests/oracles/combat/geometry/geometry.self.test.ts#never invents a contact and never over-prunes beyond the slack (1000 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Independence: every file under tests/oracles/combat/geometry passes the unchanged oracle-independence guard"
    verification:
      - kind: unit
        ref: "tests/guards/oracle-independence.test.ts#finds no import of Wegolite code and no src file read under tests/oracles"
        status: pass
    human_judgment: false
  - id: D4
    description: "The process rule: no Wegolite source, tests/helpers, tools or generated content was read while authoring"
    verification: []
    human_judgment: true
    rationale: "The import guard is mechanical; the reading rule is a process rule (plan prohibition CBT-17, flagged-unverified). Plan 18-20 measures the edge: false dock-mouth fixtures on real Oolite as the counter."

duration: 44min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 02: Independent Geometry Oracle Summary

**Exact-mesh dock-mouth beam fixtures under the doesHitLine subentity rule, plus a literal transliteration of Oolite's isHitByOctree and doOctreesCollide with 23 cited fixtures. The work also found that the C places a rotated other's octants with the transposed basis (`Octree.m:552`).**

## Performance

- **Duration:** 44 min
- **Started:** 2026-11-19T17:51:52Z
- **Completed:** 2026-11-19T18:36:08Z
- **Tasks:** 2 (each RED then GREEN)
- **Files created:** 8

## Accomplishments

- `dock-mouth.json`: 20 fixtures. Coriolis has 17 (winner dock 6, faceplate 5, tris 1, hull 3, none 2) and the buoy has 3 (all hull). Seven are `edge: true`: four slot-edge beams (both x sides, both y sides) and three faceplate-edge beams. Every fixture re-derives within 1e-9 from the six vendored meshes, and the oracle's own octree model of the C agrees on every winner, within tolerance.
- `octree-collide.json`: 23 fixtures. There are 16 `isHitByOctree` pairs (4 on float32-exact boundaries, 7 with `wegoliteBasis`, 1 `prunedCorner`) and 7 `doOctreesCollide` compositions.
- The self-test re-derives everything and holds hand anchors next to it: a slot-centre beam is won by the dock at 2749.7439 m, the far beam is `none`, plus the depth rule, the subentity rule and the octree helpers. Each prime-role fixture flips under its own mutant. The oblique basis defeats every quaternion port that negates one component. A seeded loop of 1000 depth-2 cases shows soundness and completeness within the derived slack.

## Task Commits

1. **Task 1: dock-mouth fixtures (tracer)**: `79cc5d0` (test, RED), `df1f118` (feat, GREEN)
2. **Task 2: octree reference and fixtures**: `b885ae9` (test, RED), `516f886` (feat, GREEN)

## TDD Gate Compliance

- Task 1 RED: `holds at least ten fixtures ...` failed with "expected 0 to be greater than or equal to 10" on the empty fixture file. The classifier returned RED_EVIDENCE_OK. Semantic check: the target ran and failed on the planned assertion, and the reader, cube, rule and depth anchors passed.
- Task 2 RED: `holds at least fourteen fixtures ...` failed with "expected 0 to be greater than or equal to 14". The classifier returned RED_EVIDENCE_OK. Semantic check: the helper, single-cell and property-loop tests passed. My first RED run also failed the property loop's non-vacuity floor (20 deep cases against a floor of more than 20). I raised the loop from 600 to 1000 cases, did not lower the floor, and reran RED before committing.
- Tracer gate (auto mode): after Task 1 GREEN I reran `vitest run tests/oracles/combat/geometry tests/guards/oracle-independence.test.ts` and `typecheck`. Both were green, so Task 2 went ahead.

## Tolerance Rule and the Depths It Assumes

`tol = sqrt(3) h + 2 h / sin(alpha)`. Here `h` is the leaf half-width of the struck part and `alpha` is the angle between the beam and the struck plane. A fixture uses the larger of its winner's and runner-up's values. The sources:
- `isHitByLine` returns the distance to the centre of the first solid node it visits (`Octree.m:347-366`).
- The root half-width is `0.5 + MaxDimensionFromOrigin` (`OOMeshToOctreeConverter.m:260-286`).
- The depth comes from `octreeDepth` (`OOMesh.m:590-623`, constants `:65-71`).
- The leaf rule is at `OOMeshToOctreeConverter.m:289-305`, with `OCTREE_MIN_HALF_WIDTH` 1.0.
- Eight solid children fold into one node (`Octree.m:851-877`).

Other rules: a beam under 30 degrees to the struck plane is never used. Every part a beam misses is cleared by one leaf diagonal `2 sqrt(3) h`. The winner beats the runner-up by at least `2 tol`. Plan 18-04 checks these depths against the emitted octree; a mismatch is a dispute, not a reason to widen a tolerance.

| Mesh | Depth | Root half-width | Leaf h |
|------|-------|-----------------|--------|
| oolite_coriolis.dat | 6 | 500.5 | 7.8203125 |
| oolite_coriolis_faceplate.dat | 6 | 534.798 | 8.35621875 |
| oolite_coriolis_tris.dat | 6 | 500.5 | 7.8203125 |
| oolite_coriolis_dock.dat | 5 | 250.5 | 7.828125 |
| oolite_buoy.dat | 5 | 58.22786 | 1.819620625 |
| oolite_buoy_subents.dat | 5 | 24.3478 | 0.76086875 |

Per-fixture tolerances. Start and direction are in Oolite model axes. "Edge dist" is the lateral distance to the nearest point with a different exact winner; the minimum is 4h: 33.425 m on the station, 7.278 m on the buoy.

| Fixture | Edge | Winner | Distance | Incidence | Runner-up | Tolerance | Margin | Edge dist |
|---------|------|--------|----------|-----------|-----------|-----------|--------|-----------|
| dock-slot-through-dock-back-wall | no | dock | 2749.7439 | 90.00 | hull | 29.2150 | 750.256 | 37.20 |
| dock-slot-lower-left-dock-back-wall | no | dock | 2749.7439 | 90.00 | hull | 29.2150 | 750.256 | 35.99 |
| dock-slot-edge-plus-x-dock | yes | dock | 2749.7439 | 90.00 | hull | 29.2150 | 750.256 | 33.43 |
| dock-slot-edge-minus-x-dock | yes | dock | 2749.7439 | 90.00 | hull | 29.2150 | 750.256 | 33.94 |
| dock-slot-edge-plus-y-dock | yes | dock | 2749.7439 | 90.00 | hull | 29.2150 | 750.256 | 33.94 |
| dock-slot-edge-minus-y-dock | yes | dock | 2749.7439 | 90.00 | hull | 29.2150 | 750.256 | 33.94 |
| dock-faceplate-edge-plus-x-beside-slot | yes | faceplate | 2478.7990 | 90.00 | hull | 31.1858 | 1021.201 | 33.94 |
| dock-faceplate-edge-minus-x-beside-slot | yes | faceplate | 2478.7990 | 90.00 | hull | 31.1858 | 1021.201 | 33.43 |
| dock-faceplate-edge-outer-diagonal | yes | faceplate | 2500.0000 | 90.00 | hull | 31.1858 | 1000.000 | 33.94 |
| dock-faceplate-beside-slot-x | no | faceplate | 2487.9803 | 87.81 | hull | 31.1981 | 1012.020 | 101.80 |
| dock-faceplate-beside-slot-y | no | faceplate | 2503.3400 | 90.00 | hull | 31.1858 | 996.660 | 81.91 |
| dock-tris-corner-oblique | no | tris | 2599.9994 | 35.26 | - | 40.6356 | - | 67.99 |
| dock-hull-alone-from-minus-x | no | hull | 2500.0000 | 90.00 | - | 29.1858 | - | none |
| dock-hull-alone-from-plus-y | no | hull | 2500.0000 | 90.00 | - | 29.1858 | - | none |
| dock-hull-back-face-before-dock | no | hull | 2500.0000 | 90.00 | dock | 29.2150 | 750.256 | none |
| dock-near-miss-at-clearance | no | none | - | - | - | 0 | - | 29.95 (by design) |
| dock-far-miss | no | none | - | - | - | 0 | - | none |
| dock-buoy-hull-front-before-subentity | no | hull | 2948.0326 | 51.73 | subentity | 7.7870 | 56.631 | 7.96 |
| dock-buoy-hull-back-face | no | hull | 2955.9680 | 89.79 | - | 6.7909 | - | 10.46 |
| dock-buoy-hull-alone-from-minus-x | no | hull | 2952.2532 | 59.82 | - | 7.3617 | - | 8.00 |

Geometry findings: the hull model has no front face. A beam through the slot stops on the dock's back wall at z = 250.2561 (authored 500.2561 less the model's 250 m depth), and the hull's runner-up is its back face at z = -500. The slot edges are x = +/-48.2043 (at y = 3) and y = +/-108.198 (at x = 3). The faceplate's outer edge on the diagonal is at x = y = 252.04.

## Dropped Candidates

| Candidate (start, direction) | Exact answer | Why dropped |
|------------------------------|--------------|-------------|
| station (3, 140, 3000), -z | faceplate | dock (behind) clearance 19.06 < 27.12 |
| station (3, 141.625, 3000), -z: faceplate beam 4h outside the slot's +y edge | faceplate | dock clearance 20.68 < 27.12. Faceplate edge beams therefore use the slot's x edges and the outer diagonal |
| station (340, 160, 3000), -z: outer slant | faceplate | tris clearance 2.89 < 27.09; edge distance 3.95 |
| station (0, 0, 3000) and (2000, 0, 3000), -z | dock / none | on every octree's centre planes (x = 0), where the visiting order is not ray order. The slot centre stays a self-test hand anchor only |
| buoy (10, 20, 3000), -z | hull | octree model reports 10.23 m early against tolerance 8.79 (the tolerance was not widened) |
| buoy (-14.5, -2.75, 3000), -z | hull | edge distance 3.96 < 7.28 |
| buoy (-17, -6, 3000), -z | hull | subentity clearance 0.54 < 2.64 |
| buoy (13, 3000, -22), -y | hull | incidence 27.28 deg < 30 |
| buoy (23, -3, -3000), +z | hull | subentity clearance 1.61 < 2.64; model error -7.19 beyond tolerance 7.01 |
| buoy subentity wins, best of 992 grid beams: (0.5, 3000, 1) -y and (-0.5, -4.5, 3000) -z | subentity | margins 3.79 and 3.89 m against 13.58 and 13.96 needed: no subentity fixture |

## Octree Fixture Groups and Their C Lines

- Single cells, boundaries, empty roots: `Octree.m:473-525`. The prunes are `:497-503` and `:504-512`, which reject only on strict `<`/`>`, so cubes touching on a face count as a hit. The boundary fixtures use integer and half coordinates.
- Depth-2 contact, gap, deep overlap, clear miss: `Octree.m:517-594`, `change_oct` `:70`, `offsetForOctant` `:158-161`.
- Rotations, the pruned corner and the transposed placement: `Octree.m:504-512` and `:550-554`, with `resolveVectorInIJK` at `OOTriangle.h:58-65`. Relative ijk comes from `ShipEntity.m:1884-1894`.
- Prime role: `ShipEntity.m:1897` calls `[prime_octree isHitByOctree:other_octree ...]`. The method is at `Octree.m:597-607`.
- Composition: `ShipEntity.m:1878-1942`; subentity placement at `Entity.m:632-646` and `ShipEntity.m:2008-2025`; `canCollide` at `ShipEntity.m:1858-1876`.

## Ambiguous or Surprising C Lines

1. **`Octree.m:552` is transposed relative to `:507`.** `relative_ijk_of_other.v[a]` is the other's axis a in the prime's frame (`ShipEntity.m:1889-1894`), so with those axes as columns, B maps the other's frame into the prime's. `resolveVectorInIJK` computes `B^T v`. At `:507` that is correct: the axial centre goes into the other's frame. At `:552` the other's child offsets need `B` but get `B^T`, so a rotated other is decomposed as if turned the opposite way. The oracle keeps the C as written. `octree-rotated-decomposition-transposed` has the C miss a 3.33 m overlap, deeper than any prune slack, and a scratch variant with `B` at `:552` reports the hit. Plan 18-09 must port the transpose, not fix it.
2. **The plan's strict soundness property does not hold for the C.** The crude prune compares the smaller node's inscribed-sphere box with the larger node's cube. With rotated frames, a solid pair can pass while up to `(sqrt(3) - 1) r` apart (the box corner reaches past the turned cube), and a pair overlapping by less than that can be rejected. The self-test derives this slack and asserts both properties within it. For identity poses it asserts exact equality with brute force, and it draws symmetric poses only, where `:552` matches geometry.
3. **`isHitByLine` does not return the nearest hit for oblique beams.** It returns the first solid node in its visiting order (entry octant, then the x, y, z neighbours: `Octree.m:400-450`), and it folds eight solid children into one node. All dock-mouth beams are therefore axis-parallel and off the octree centre planes, and each one is screened by the oracle's own model of the C.
4. **`Octree.m:640-645` (cited in the plan for the node layout) is `volumeOfOctree`.** Children are read as `&buffer[offset + oct]` at `:537-551` and `:568-590`, and are written in `x*4+y*2+z` order at `OOMeshToOctreeConverter.m:391-402`.
5. **Stage 4 of `doOctreesCollide` (`:1925-1938`) is unreachable for real contacts.** Stage 2 recurses with the whole other, so a subentity-against-subentity contact returns `other` (`octree-sub-sub-returns-other`). The oracle keeps stage 4 literally.

## Hand Trace: `octree-prime-smaller-axial-prime` Through `Octree.m:519-594`

Inputs:
- Prime (axial): radius 2, root `[0,0,0,-1,0,0,-1,0]` (solid octants 3 = -x+y+z and 6 = +x+y-z).
- Other: radius 4, root `[0,0,0,-1,0,0,-1,-1]` (solid octants 3, 6 and 7).
- Origin `p = (-2, 1.5, -1.5)`.
- ijk = 45 degrees about z: `v0 = (0.70711, 0.70711, 0)`, `v1 = (-0.70711, 0.70711, 0)`, `v2 = (0, 0, 1)`.

Trace:
1. Root pair (aR 2, oR 4). `oR < aR` is false, so the `:504-512` prune runs. `d2 = (2, -1.5, 1.5)`, and the axial centre in the other's frame is `(d2.v0, d2.v1, d2.v2) = (0.35355, -2.47487, 1.5)`. Every component is within `aR + oR = 6`, so the pair passes.
2. The axial root is not solid (`:517` fails), so the axial tree is decomposed (`:568-594`). `nearest_oct = (p.x>0?4:0)|(p.y>0?2:0)|(p.z>0?1:0) = 2`, and the visiting order `2 ^ change_oct` is 2, 3, 0, 6, 1, 7, 4, 5. Octant 2 is empty. Octant 3 is solid: `next = p + offsetForOctant(3, 2) = (-2+1, 1.5-1, -1.5-1) = (-1, 0.5, -2.5)`, with axial radius 1.
3. Pair (aR 1, oR 4) runs the `:504-512` prune. `d2 = (1, -0.5, 2.5)` maps to `(0.35355, -1.06066, 2.5)`, within 5, so the pair passes.
4. The axial node is solid and the other is not, so the other is decomposed (`:533-559`). `nearest_oct = (p.x>0?0:4)|(p.y>0?0:2)|(p.z>0?0:1) = 5`, and the order is 5, 4, 7, 1, 6, 0, 3, 2. Octants 5 and 4 are empty. Octant 7 is solid: `voff = resolveVectorInIJK(offsetForOctant(7, 4) = (-2,-2,-2), ijk) = (-2.82843, 0, -2)`, so `next = p - voff = (1.82843, 0.5, -0.5)`, with other radius 2.
5. Pair (aR 1, oR 2) runs the `:504-512` prune. `d2 = (-1.82843, -0.5, 0.5)` maps to `(-1.64645, 0.93934, 0.5)`, within 3, so the pair passes. Both nodes are solid, so the result is YES (`:518-525`).

Expected `hit: true`. The larger-always-axial mutant makes the radius-4 tree axial. Its three solid octants each meet the whole prime as an equal-radius pair (2 against 2), where `:504-512` tests the radius-4 octant's sphere box against the prime's cube in the prime's frame, and all three are rejected. The mutant returns `false`.

`octree-prime-larger-axial-prime` turns on the same pair of prunes. The C decomposes the prime (radius 4); its octant 6 against the radius-2 other passes `:504-512` (the prime octant's sphere box against the other's cube). The smaller-always-axial mutant instead decomposes the prime as the other, with the transposed placement, and tests the cell's sphere box against the prime octant's cube, which is rejected.

## Decisions Made

See key-decisions in the frontmatter: axis-parallel beams, the transposed placement kept as written, the property loop with its slack, and no buoy subentity fixture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The soundness property as written in the plan is false for the C**
- **Found during:** Task 2
- **Issue:** The plan asked for "whenever the reference reports a hit, some pair of solid cells really overlaps". The crude prune makes this untrue for rotated frames (ambiguity 2 above).
- **Fix:** Soundness is asserted within the derived slack. Identity poses must match brute force exactly. The loop uses symmetric poses (the transposed `:552` is pinned by its own fixture).
- **Files modified:** tests/oracles/combat/geometry/geometry.self.test.ts
- **Committed in:** b885ae9

**2. [Rule 2 - Missing critical] An octree model of the C screens every beam fixture**
- **Found during:** Task 1
- **Issue:** The tolerance formula does not cover `isHitByLine`'s visiting order, node folding, or near grazes of the winning part's own other triangles. The first buoy candidate's octree answer came 10.23 m early against an 8.79 m tolerance.
- **Fix:** `derive.ts` rebuilds the octree lazily (closed-cube triangle overlap, fold rule) and runs a float64 transliteration of `isHitByLine` and `OOVoxel.m`. Candidates that disagree are dropped, and the self-test asserts agreement for every fixture. No tolerance was widened.
- **Files modified:** tests/oracles/combat/geometry/derive.ts, geometry.self.test.ts
- **Committed in:** 79cc5d0, df1f118

**3. [Rule 1 - Bug] The plan cited `Octree.m:640-645` for the node layout**
- **Found during:** Task 2
- **Issue:** Those lines are `volumeOfOctree`.
- **Fix:** The code cites `:537-551`, `:568-590` and `OOMeshToOctreeConverter.m:391-402` instead.
- **Committed in:** b885ae9

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 2). **Impact:** the oracle matches the C as written. No threshold was changed and no package was installed.

## Issues Encountered

- `-0` against `0`: `S B S` yields `-0` and JSON stores `0`, so the basis check compares numerically within 1e-12.
- Rotations about z leave `S B S = B`. The quaternion-negation check therefore runs on the oblique fixture, which is what the plan asked for.

## Verification

- `docker compose run --rm test npx vitest run tests/oracles/combat/geometry tests/guards/oracle-independence.test.ts`: 42 passed.
- `docker compose run --rm test`: 238 files, 6530 passed, 10 skipped, exit 0, no coverage-threshold error.
- `lint` and `typecheck`: exit 0.
- Acceptance greps all pass. dock-mouth.json: 20 `dock-` ids, 6 `dock` winners, 5 `faceplate` winners, 7 `"edge": true`, 20 `"incidenceDeg"`. octree-collide.json: 23 `octree-` ids, 1 `prunedCorner`, `prime-smaller` and `prime-larger` once each, 7 `wegoliteBasis`, the sub-sub id present. The self-test mentions `completeness` twice, "larger by radius" appears nowhere, octree-collide.ts has 3 exported reference functions, and there is no diff to the guard since 76229f5.

## User Setup Required

None.

## Next Phase Readiness

- 18-04 and 18-09 can consume both fixture files. 18-04 must check the depths table against the emitted octree. 18-09 must port the transposed `:552` placement and keep the prime axial.
- 18-20 measures only the `edge: false` dock-mouth fixtures on real Oolite.

## Self-Check: PASSED

All 8 created files exist. Commits 79cc5d0, df1f118, b885ae9 and 516f886 are ancestors of HEAD. `check evaluation-scope --plan 18-02` resolves them.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-19*
