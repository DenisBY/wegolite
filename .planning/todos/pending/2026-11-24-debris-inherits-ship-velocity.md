---
created: 2026-11-24T00:00:00.000Z
title: Debris released by a dying ship should inherit the ship's flight velocity
area: combat
severity: minor
files:
  - src/sim/world/debris.ts
  - .planning/phases/16-wreckage-cargo-and-the-entity-cap/16-RESEARCH.md
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

In Oolite, `ShipEntity`'s `- (Vector)velocity` returns `[super velocity]`
plus the thrust vector (ShipEntity.m:11163-11166 at pin 7437f22; ShipEntity.h:925
describes it as "the instantaneous velocity"). Cargo pods, alloy plates and
wrecks released by `becomeExplosion` and `addWreckageFrom` therefore carry the
flight speed of the ship that died.

`16-RESEARCH.md` (line 149) says the opposite. `src/sim/world/debris.ts` gives
debris only its own drift and never the flight speed of the ship it came from.
As a result, debris from a fast ship stays near the kill point instead of
travelling on with the wreck. This was found during the Phase 20 UAT diagnosis
(`.planning/debug/death-scene-frozen-and-flyer-no-wreckage.md`).

## Solution direction

Add the dying ship's velocity, including its thrust, to the velocity of the
debris it releases, as Oolite does. This changes the hashed debris velocities
and the values Phase 16 pinned, so the pins must be re-pinned with the measured
cause recorded. If any part of the behaviour is kept different from Oolite,
add a FIDELITY.md note for it. Add a guard test that pins debris velocity equal
to the ship velocity plus the kick.

## Related: the explosion drift (added 2026-11-24, Phase 20 Round 3 review)

The same Oolite rule moves the explosions. Each fragment burst takes the dying
ship's total velocity at the moment of the explosion: the small burst 1x
(`OOParticleSystem.m:274` at pin 7437f22), the big burst 0.85x (`:324`), where
the velocity is the drift plus forward x flight speed
(`ShipEntity.m:11158-11166`). Wegolite's explosions stay where the ship died, a
divergence FIDELITY E-173 records ("the absent velocity drift").

Unlike the debris, the explosion layer is render-only and outside the world hash
(Phase 20 D-01, `src/render/bodies/explosions.ts`), so giving the bursts the
death velocity changes no hashed value and needs no re-pin. It matters more
since the Phase 20 gap closure (plan 20-12, D-01e): the dead camera coasts away
at 160 m/s, so Wegolite's fireball always recedes, while Oolite's comes toward
the camera after a fast death. A burst centre closes the 100 m gap at `v - 160`
(small) or `0.85 v - 160` (big), so within the burst lifetimes it reaches the
camera only above about 227 m/s (small, 1.5 s) or 306 m/s (big, 1.0 s); at
350 m/s it does so after 0.53 s and 0.73 s.

Solution direction for this part: carry the dying ship's velocity in the
explosion event (the player's from `killPlayer`, an NPC's from `killShip`) and
offset each burst's centre by `velocity x t` in the layer, with the 0.85 factor
for big bursts; update E-173 and E-179.
