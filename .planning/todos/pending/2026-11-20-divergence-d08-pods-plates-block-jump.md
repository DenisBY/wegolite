---
created: 2026-11-20T00:00:00.000Z
title: Let cargo pods and alloy plates block a jump as Oolite's mass rule does (D-08)
source: Phase 18 UAT owner decision 2026-11-20
area: sim
severity: minor
files:
  - src/sim/world/ship-field.ts
  - src/sim/npc/mass.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

FIDELITY.md row E-22 (the decision D-08, `src/Core/Entities/ShipEntity.m:12526-12530`): pods and plates never
block a jump in Wegolite; real Oolite (measured in 18-20) blocks within 9.967 m (pod) and 5.229 m (plate) by
its mass rule.

Key sentence from the row: "Oolite's blockage loop is class-free, so a cargo pod (mass 993.37) within 9.97 m
and an alloy plate (mass 273.44) within 5.23 m of the player's centre would block; Wegolite's pods and plates
have no entry in the NPC mass list and never block."

Goal: decide with the owner, when this is scheduled, whether to port Oolite's behaviour or keep the recorded divergence (owner undecided, 2026-11-20).
