---
created: 2026-11-17T10:30:00.000Z
title: Skip shipHit for a target already lethal in the same tick, when shipHit gets its first consumer
area: sim, audio
severity: minor
files:
  - src/sim/combat/ledger.ts
  - src/sim/combat/step.ts
  - .planning/phases/16-wreckage-cargo-and-the-entity-cap/16-VERIFICATION.md
---

## Problem

A ship doomed earlier in a tick still receives `shipHit` from a later hit in the same tick, so a hit sound or
hit flash would double over the explosion. Phase 15's review named the fix: skip `shipHit` for a target that is
already lethal inside `applyLedger`. Phase 16 did not change it, because `shipHit` has no consumer today (no
audio, no hit flash), so nothing can double. The owner accepted that on 2026-11-17 (UAT test 5, D16-14) on
condition that this is not forgotten.

## When to act

The first time anything subscribes to `shipHit`: audio (AUD-01..AUD-03, unscheduled), a hit flash or screen
shake on the player (check Phase 17, NPC fire and hits on the player), or a HUD hit indicator. Add this check
to that plan's `read_first` and acceptance criteria, with a test that a ship killed by two hits in one tick
emits one `shipDestroyed` and no `shipHit` after the lethal one.
