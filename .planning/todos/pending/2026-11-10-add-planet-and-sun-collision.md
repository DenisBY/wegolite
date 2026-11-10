---
created: 2026-11-10T12:00:00.000Z
title: Stop the player flying through the planet and the sun
area: flight
severity: major
files:
  - src/sim/flight/step.ts
  - src/sim/world/layout.ts
---

## Problem

`stepFlight` resolves contact with the station only. The player can fly
through the planet and through the sun with no effect. For a port of Elite
this is the most visible gap in flight. Source: section 2 of `.planning/reviews/2026-11-09-logic-security-review.md`;
re-checked on 2026-11-10 (`src/sim/flight/step.ts` has no planet or sun
contact).

## Solution

Not designed. Read Oolite's behaviour first (`/home/opencode/git/oolite/src`,
planet collision and sun proximity in `PlayerEntity` and `PlanetEntity`).
v1 has no damage model (combat is v2), so the smallest faithful step is a
decision between a bounce at the planet radius and ending the flight. Record
the choice in PROJECT.md Key Decisions. Keep it in the pure simulation, with
unit tests on the fixed step.
