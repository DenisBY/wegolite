---
created: 2026-11-10T12:00:00.000Z
title: Decide whether the F6 chart should pause the flight
area: app
severity: minor
files:
  - src/app/game-session.ts
---

## Problem

Opening the chart in flight stops the simulation, including a running
hyperspace countdown: the `chartOpen` branch of `frame()` drains input and
returns before the fixed step. Oolite keeps running behind its chart. The
player is not told the game is frozen. Source: section 2 of `.planning/reviews/2026-11-09-logic-security-review.md`;
re-checked on 2026-11-10.

## Solution

Either keep stepping while the chart is open (the chart is opaque, so only the
simulation runs, not the scene draw), or keep the freeze and say "Paused" on
the chart. The first matches Oolite; check what it means for the autosave and
for the hyperspace countdown tests in `tests/e2e/hyperspace.spec.ts`.
