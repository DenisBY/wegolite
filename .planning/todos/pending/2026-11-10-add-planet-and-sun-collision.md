---
created: 2026-11-10T12:00:00.000Z
title: Stop the player flying through the planet, the sun and the navigation buoys
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

The two navigation buoys (the one 10 km in front of the station dock and the
one at the witchpoint) can also be flown through. They have been drawn with
Oolite's real model since quick task 261111-g5n, which makes it more visible;
it was already true of the placeholder marker. In Oolite a buoy is a solid
body: a collision pushes the ship away and damages it. The owner reported this
on 2026-11-11.

## Deferred

On 2026-11-11 the owner deferred this whole item (planet, sun and buoys) until
shields exist, that is until v2 requirement CBT-01 in
`.planning/REQUIREMENTS.md`, so that a collision can cost shield energy as in
Oolite instead of being a bounce with no consequence. Do not start it before
then.

## Solution

Not designed. Read Oolite's behaviour first (`/home/opencode/git/oolite/src`,
planet collision and sun proximity in `PlayerEntity` and `PlanetEntity`).
v1 has no damage model (combat is v2), so the smallest faithful step is a
decision between a bounce at the planet radius and ending the flight. Record
the choice in PROJECT.md Key Decisions. Keep it in the pure simulation, with
unit tests on the fixed step. The simulation radius of both buoys is 10 m
(`NAV_BUOY_RADIUS` and `WITCHPOINT_RADIUS` in `src/sim/world/layout.ts`) while
the drawn model is about 100 m across, so the collision radius has to be
decided as part of this work.
