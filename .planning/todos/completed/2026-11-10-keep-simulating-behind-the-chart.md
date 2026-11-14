---
created: 2026-11-10T12:00:00.000Z
title: Decide whether the F6 chart should pause the flight
area: app
severity: minor
resolves_phase: 12
files:
  - src/app/game-session.ts
audit_acknowledged:
  milestone: v2.0
  at: 2026-11-13
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

> Note (2026-11-13): v2.0 was narrowed to Phase 8; this todo now belongs to v2.1 (Phase 12 in the v2.1 section of ROADMAP.md).

## Resolution

Closed by Phase 12 plans 12-13 and 12-14 (WORLD-11, owner decision D3): in
flight the simulation, the world and a running hyperspace countdown keep
advancing behind the opaque chart with no pilot input; a chart opened while
docked stays frozen; a dock or an arrival behind the chart closes it;
`advanceTicks` steps behind it in flight. The one v1 freeze check in
`tests/e2e/hyperspace.spec.ts` was inverted.
