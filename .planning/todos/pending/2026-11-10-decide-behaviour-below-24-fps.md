---
created: 2026-11-10T12:00:00.000Z
title: Decide what happens when the frame rate falls below 24 fps
area: app
severity: minor
files:
  - src/sim/time.ts
  - src/app/game-loop.ts
---

## Problem

Review finding I3 in `.planning/reviews/2026-11-09-logic-security-review.md`: the loop runs at most `MAX_STEPS_PER_FRAME`
fixed steps per rendered frame, so below 24 frames a second the game runs in
slow motion instead of dropping frames. That is deliberate (it bounds the
catch-up after a stall) but nothing tells the player, and the High graphics
quality makes a slow GPU more likely to get there.

## Solution

Options: a Low graphics level or a pixel-ratio cap (review item P6), an
automatic drop from High to Standard when frames stay slow, or a one-line
notice. Measure on a weak GPU first; there is no evidence yet of how often
this happens.
