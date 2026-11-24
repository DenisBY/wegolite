---
created: 2026-11-24T00:00:00.000Z
title: Dust draws as still streaks while the game is paused in flight
area: render
severity: minor
files:
  - src/app/session/render-driver.ts
  - src/render/bodies/dust.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

This is inferred from the code and has not been observed in the browser. While
paused in flight, after the first paused frame, `render-driver` passes
`dust.update` a zero camera delta with a non-zero speed. The stationary branch
in `dust.ts` then draws each mote as a still, randomly oriented streak of
`clamp(speed * 0.02, 0.5, 40)` m. This is the same defect seen on the Phase 20
death view.

A related point: dust drawn as streaks in normal flight may be an unrecorded
divergence. Oolite's `DustEntity` draws `GL_POINTS` except at hyperspeed.
Source: `.planning/debug/death-scene-frozen-and-flyer-no-wreckage.md`.

## Solution direction

Confirm the defect in the browser behind the pause overlay first. If it is
confirmed, pass speed 0 (or freeze the last streak geometry) while paused, and
add a test on the arguments passed to `dust.update`. Also check whether the
Phase 20 gap-closure fix for the dead view already covers this case. Separately,
decide whether the streak rendering in normal flight is a divergence from
Oolite that needs a FIDELITY.md row.
