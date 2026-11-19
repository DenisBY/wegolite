---
created: 2026-11-19T03:00:00.000Z
title: Let targetTargetsSelf see the player's ident lock
area: sim
severity: minor
files:
  - src/sim/npc/behaviours/attack.ts
  - src/sim/npc/target.ts
  - .planning/phases/17-npc-fire-and-hits-on-the-player/17-REVIEW.md
---

## Problem

Phase 17 code review WR-01. `targetTargetsSelf` (`src/sim/npc/behaviours/attack.ts:90-106`) always reports
that the player does not target the NPC; its doc says the player "never targets an NPC". Since Phase 13 the
player can ident-lock an NPC, and in Oolite that lock sets the player's `primaryTarget`
(`PlayerEntity.m:3739-3746`). Phase 17 made weapon heat live, so the ATTACK_TARGET weapons-heating back-off
(`ShipEntity.m:4122`) is now reachable: an opted-in attacker (the `?test=1` attacker hook) backs off once its
weapon heats even while the player has it locked, where Oolite would keep attacking.

No effect in ordinary play: populated ships have `ai: null` and never steer or fire.

## Fix

Expose the player's ident target to the NPC view and read it in `targetTargetsSelf`, or record the divergence
explicitly in the Phase 14 divergences row. Fixing it moves the attacker's trajectory once it heats, so the Node
twin and browser pins that depend on a heated attacker need re-measuring. Owner decision (raised at Phase 17
sign-off).
