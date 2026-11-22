---
created: 2026-11-22T00:00:00.000Z
title: "Bug: a second F6 press leaves the chart and returns to the previous docked screen"
source: Phase 19 UAT (owner report, 2026-11-22)
area: input
severity: minor
type: bug
files:
  - src/input/actions.ts
  - src/ui/docked.ts
  - src/app/session/station-controller.ts
---

## Problem

Owner report: on F4 Interfaces, F6 opens the Chart; pressing F6 again goes back to F4 Interfaces. F6 acts as a
toggle back to the previous screen instead of a "go to Chart" key.

Expected: F6 on the chart stays on the chart. Check Oolite's behaviour before fixing: in Oolite a repeated F6
switches between the short-range and the galactic chart (`key_chart_screen`, `PlayerEntity` GUI handling in
`src/Core/Entities/PlayerEntityControls.m:3940-3960` in the Oolite checkout). Port that or record the divergence in
`FIDELITY.md`; do not keep the return-to-previous behaviour silently. The Tab key (`chartRange`) is the
current range switch.

Probably related to `2026-11-22-bug-docked-f-keys-unreliable.md`; fix them together.

## Done when

- A second F6 on the chart does what Oolite does (or the recorded divergence), never returns to the previous
  screen; a browser spec covers F4 -> F6 -> F6.
