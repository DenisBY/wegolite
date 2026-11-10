---
created: 2026-11-10T12:00:00.000Z
title: Do not report "Torus disengaged" when the torus never engaged
area: flight
severity: minor
files:
  - src/app/game-session.ts
  - src/sim/flight/torus.ts
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
