---
created: 2026-11-17T09:00:00.000Z
title: Phase 16 code review info items IN-01 to IN-06 (no action needed now)
area: sim, render, tooling
severity: minor
files:
  - .planning/phases/16-wreckage-cargo-and-the-entity-cap/16-REVIEW.md
  - src/app/session/render-driver.ts
  - src/sim/world/contacts.ts
  - src/render/bodies/explosions.ts
  - src/sim/world/kill.ts
  - src/app/npc-models.ts
  - scripts/vendor-oolite.sh
---

## Problem

The Phase 16 code review (`16-REVIEW.md`) left six Info findings open after WR-01 to WR-03 were fixed. None
changes behaviour; the owner decided on 2026-11-17 to record them and not fix them now.

## Items and when to act

- IN-01 (debris contacts allocate about 730 short-lived objects per frame at the entity cap): act only if the
  frame budget or GC shows up in `budget.spec.ts` or UAT. Fix: a `forEachDebrisContact` visitor with scratch
  values, no ids.
- IN-06 (debris and explosions drawn at the stepped position, camera interpolated): act only if pods judder at
  144 Hz on a real GPU. Same shape as NPC ships. Fix: previous-tick position on contacts, lerp by alpha.
- IN-02 (explosion layer header overstates "no allocation" and "exact Oolite colour"): reword with the next edit
  of `src/render/bodies/explosions.ts`.
- IN-04 (stale layering comment in `src/sim/world/kill.ts`): update with the next edit of that file.
- IN-05 (a debris key could collide with an NPC ship key): add a disjointness check in
  `tools/oolite-ingest/generate.ts` or a content test when Phase 18 adds debris kinds.
- IN-03 (`--export-pin` repo check compares path text only): low value, the script is human-run; fix only if
  the script is touched again.

Each item has its file, line and suggested fix in `16-REVIEW.md` under "Info".

## Update 2026-11-17 (owner check on a real GPU)

The owner played the production preview on a real GPU with the new "Show FPS" counter: 60 FPS steady, an occasional 58, and the explosion, flash and drifting cargo containers looked good. No stutter or frame-budget problem is visible, so IN-01 and IN-06 stay low priority and are only worth revisiting if a later phase raises the debris load (for example the Phase 18 collision debris) or a measurement with the reference-desktop protocol in `docs/PERFORMANCE.md` shows otherwise.
