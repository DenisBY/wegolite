---
created: 2026-11-10T12:00:00.000Z
title: Do not report "Torus disengaged" when the torus never engaged
area: flight
severity: minor
resolves_phase: 12
files:
  - src/app/game-session.ts
  - src/sim/flight/torus.ts
audit_acknowledged:
  milestone: v2.0
  at: 2026-11-13
---

## Problem

Review finding L9 in `.planning/reviews/2026-11-09-logic-security-review.md`: a torus attempt refused under mass lock is
reported as "Torus disengaged" although the drive never engaged. The message
is printed for every `torusDisengaged` event in `handleEvent`
(`src/app/game-session.ts`). Not re-verified on 2026-11-10 beyond the message
site: confirm in `src/sim/flight/torus.ts` which event a refused attempt
emits before changing anything.

## Solution

Give a refused attempt its own copy (Oolite's wording, from
`descriptions.plist`), or emit a distinct event for a refusal and keep
"Torus disengaged" for a drive that was running.

> Note (2026-11-13): v2.0 was narrowed to Phase 8; this todo now belongs to v2.1 (Phase 12 in the v2.1 section of ROADMAP.md).

## Resolution

Closed by Phase 12 plan 12-05 (WORLD-10): a refused attempt now emits
`torusRefused` and the HUD prints Oolite's "Hyperspeed mass-locked.";
"Torus disengaged" remains for a drive that was running.
