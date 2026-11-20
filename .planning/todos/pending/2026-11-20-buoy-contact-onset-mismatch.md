---
created: 2026-11-20T15:40:00.000Z
title: Buoy first-contact onset differs from Oolite when Oolite's octree prime is the buoy
area: sim
severity: minor
files:
  - src/sim/combat/collide.ts
  - src/sim/npc/collision-chain.ts
  - FIDELITY.md
---

## Problem

Plan 18-18 compared the collision stage's first contact between the player
and the nav buoy with plan 18-20's real-Oolite sessions. Along the buoy's
+right axis the stage touched at about 100 m, while Oolite touched at 79.8 m and
not at 92.2 m. 18-20 logged neither the player's roll nor the buoy's spin, so
the owner asked for a re-measure with both orientations logged (2026-11-20).

The re-measure (FIDELITY.md, "Phase 18 real-Oolite measurements (PD-03)",
paragraph "Buoy first-contact re-measure with both orientations logged") shows:

- `doOctreesCollide` with `fullHullTable()` reproduces Oolite at matched
  orientations on all 11 sessions and all 222 logged frames, **provided the
  prime is Oolite's prime**.
- The octree test is not symmetric. At the same pose the onset can differ by
  about 24 m between the two primes (`ram-right-neg-r0`: player prime
  102.45 m, buoy prime 77.97 m).
- Oolite's prime is `e1` of the collision chain: the body with the lower
  `z - collision_radius` in Oolite axes (`Entity.m:247`, `Universe.m:7044-7073`,
  `CollisionRegion.m:287`; Oolite z is Wegolite -z). The stage's prime is the
  lower-ranked body (`src/sim/combat/collide.ts:700-713`), which is always the
  player in a pair that includes it (`colliderRank`). FIDELITY row E-135 records
  this divergence, but only for subentity routing.
- With the stage's prime, 5 of the 11 sessions are a MISMATCH: 3.77, 15.37,
  11.42, 22.36 and 5.88 m outside Oolite's bracket. Each of them is a session
  in which Oolite's prime was the buoy. The other 6 are SAME.
- 18-20's +right session had the buoy as Oolite's prime (the player was higher
  in z); its +forward session had the player as prime. That is why only the
  +right comparison in 18-18 disagreed.

The divergence also applies to NPC pairs (ship-ship, ship-buoy, ship-station):
whichever body Wegolite ranks lower is the prime, and Oolite's is decided by z.

## Evidence

- Sessions 2026-11-20T15:12:10Z to 15:24:42Z on the headless Oolite 1.93.1-255
  reference, from Wegolite `c988e17` with a clean tool tree, each
  `exit=0 container_exit=0`.
- Probe OXP, steps files, logs, parsed frames and the scratch replay:
  `/tmp/remeasure-1818/` (outside the repository; `src/`, `runs/<name>/out/`,
  `analysis/<name>.json`, `analysis/_replay-<name>.out.json`,
  `replay/replay.test.ts`).
- Replay command:
  `docker compose run --rm -v /tmp/remeasure-1818:/scratch test npx vitest run --config /scratch/replay/vitest.config.mjs`.

## Solution (to triage at 18-12; owner decision)

Options:

1. Port Oolite's prime order to the narrow phase: for each pair, make the body
   with the lower Oolite `z - collision_radius` (Wegolite `-z - r`) the prime,
   as `src/sim/npc/collision-chain.ts` already sorts. The response order
   (`runContactCalls`, rank order) stays as it is. This would close the
   MISMATCH. It changes contact timing for every pair, so the collision cost,
   cadence and twin-hash pins, the 18-18 buoy fixtures and possibly the NPC
   acceptance totals would need checking or re-pinning (owner trailer rules
   apply to frozen detectors).
2. Accept the divergence: widen the E-135 row's text to state the measured
   effect on the hull-on-hull onset (up to about 22 m for the player against
   the buoy) and close this todo.

No code, fixture or tolerance was changed by the re-measure. No tripwire guard
was added: the follow-up was docs-only by instruction, and the first consumer
is the 18-12 triage itself.
