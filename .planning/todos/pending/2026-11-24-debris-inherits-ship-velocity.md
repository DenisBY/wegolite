---
created: 2026-11-24T00:00:00.000Z
title: Debris released by a dying ship should inherit the ship's flight velocity
area: combat
severity: minor
files:
  - src/sim/world/debris.ts
  - .planning/phases/16-wreckage-cargo-and-the-entity-cap/16-RESEARCH.md
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
