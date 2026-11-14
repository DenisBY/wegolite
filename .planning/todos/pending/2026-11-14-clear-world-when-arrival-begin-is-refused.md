---
created: 2026-11-14T21:00:00.000Z
title: Clear the origin world when a hyperspace arrival's begin() is refused (review finding WR-01)
area: app
resolves_phase: 13
severity: minor
files:
  - src/app/session/hyperspace-controller.ts
  - src/app/session/world-lifecycle.ts
  - .planning/phases/12-inert-ships-and-the-world-lifecycle/12-REVIEW.md
audit_acknowledged:
  milestone: v2.1
  at: 2026-11-14
---

## Problem

Phase 12 code review finding WR-01 (Warning, owner decision 2026-11-14: not fixed in Phase 12; the verifier did not
count it as a gap). At a hyperspace arrival `worldLifecycle.begin()` returns silently when the epoch is at or above
`MAX_LIVE_EPOCH` (0xfffffffe) or the seed is not finite. `handleHyperspaceJumped` never calls `end()` first, so the
origin system's world stays installed: its 12 inert ships are drawn in the destination, shown on the scanner, mass-lock
the torus, block jumps, and the leg anchor (`anchorNextEntityId`) is stale. This breaks WORLD-14 ("cleared at each jump
commit") for that case.

Reachability: only a hand-edited or corrupt save with `epoch` exactly 4,294,967,294 triggers the epoch branch; normal
play adds one per jump, and the non-finite seed branch is unreachable. The harm stays in that player's own offline
session.

## Solution

Call `worldLifecycle?.end()` before `begin()` in `src/app/session/hyperspace-controller.ts` (around line 239), or make
`begin` clear the world and the anchor on every refusal. Add a controller-level test: a save at epoch 4294967294
arrives, `begin()` is refused, and no origin entity remains in the world afterwards. Gates: Vitest, lint, typecheck,
then `verify` on the remote runner.

Take it together with the other open review items when planning Phases 13 and 14:
- IN-01: a running torus drive stopped by mass lock still prints "Torus disengaged"; Oolite prints "Hyperspeed
  mass-locked." there too (`PlayerEntity.m:2755-2758`), and the CHANGELOG wording needs adjusting.
- IN-02: `aiFaulted` is emitted but nothing records or logs it.
- IN-03: the "spawnEntity never throws" doc is false for an `init` with a throwing accessor (no real caller).
- IN-04: a failed NPC model is never retried, yet the ship still blocks and shows on the scanner.
