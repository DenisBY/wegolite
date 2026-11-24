---
created: 2026-11-20T00:00:00.000Z
title: Push a launching player with the explosion blast as Oolite does (E-147)
source: Phase 18 UAT owner decision 2026-11-20
area: sim
severity: minor
files:
  - src/sim/combat/step.ts
  - src/sim/flight/state.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

FIDELITY.md row E-147 (`src/Core/Entities/Entity.m:1033-1046`): the blast does not push the player while
launching.

Key sentence from the row: "a launching (or docked) player is never pushed, where Oolite pushes every ship
whose `isInSpace` is YES, and that lists `STATUS_LAUNCHING` (`Entity.m:1038`), so Oolite also pushes a
launching player; Wegolite's scripted launch takes no push."

Goal: decide with the owner, when this is scheduled, whether to port Oolite's behaviour or keep the recorded divergence (owner undecided, 2026-11-20).
