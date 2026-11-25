---
created: 2026-11-18T09:00:00.000Z
title: Settle the asymmetric same-tick mutual-kill credit when kill credit gets its first consumer
area: sim
severity: minor
resolves_phase: 25
files:
  - src/sim/world/kill.ts
  - src/sim/combat/ledger.ts
  - src/sim/combat/step.ts
  - tests/guards/kill-credit-consumers.test.ts
  - .planning/phases/17-npc-fire-and-hits-on-the-player/17-CONTEXT.md
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

When two ships kill each other in the same tick, the damage ledger credits the lower-id victim to the other
ship and leaves the higher-id victim with no killer. The result depends on entity ids, not on who fired first.
Oolite decides this by update order: the ship updated first applies its damage first, so the credit follows the
frame's update sequence. The difference is a recorded divergence (Phase 17, D-10), accepted because nothing reads
the credit yet: `shipDestroyed.killer` and the kill notifications `shipTargetDestroyed` and `shipKilledOther`
feed no score, bounty, rating or message today.

Since Phase 18 rams are a second producer (plan 18-11, CBT-18): the collision stage queues each side's ram
damage as a scrape record into the same ledger, so a ram that is lethal both ways is a same-tick mutual kill,
routine wherever two ships collide fast enough. The credit outcome follows the same ledger rule and is pinned
by 18-11's both-lethal case, "two Kraits that kill each other in one ram" in
`tests/sim/combat/collision-stage.test.ts`: the lower-id Krait is credited to the other, and the higher-id one
carries no killer (`NO_ENTITY`). The trigger and the guard below are unchanged.

## When to act

The first time anything consumes kill credit: a bounty or credit reward, the kill tally and combat rating, legal
status for killing a clean ship, a "you destroyed X" or "X destroyed Y" message, or an AI that reacts to
`shipTargetDestroyed` or `shipKilledOther`. That plan must first decide one of:

- keep the asymmetry and say why it is harmless for that consumer,
- make the credit symmetric (both victims credited to the other ship), or
- order the credit by Oolite's update sequence, which needs the world's per-tick ship update order to be
  specified and tested.

Add the decision to that plan's `read_first` and acceptance criteria, with a test of a same-tick mutual kill.

## Guard

`tests/guards/kill-credit-consumers.test.ts` (D-13.1) fails as soon as a `src` file outside the kill path
(`src/sim/world/kill.ts`, `src/sim/combat/ledger.ts`, `src/sim/combat/step.ts`, `src/sim/events.ts`,
`src/sim/ai/types.ts`) names `shipTargetDestroyed` or `shipKilledOther`, or reads the credit (`.killer`,
`?.killer`, `["killer"]`, or `killer` as a key in an object destructuring pattern). Its failure message names this
file. The commit that adds the consumer updates the guard's allowlist and records the decision above.

## Phase 20 check (2026-11-23)

Checked in Phase 20 (D-09, plan 20-10): the player-versus-NPC mutual kill adds no consumer of kill
credit. The cause line names the culprit from the lethal ledger record's source (D-04) and the
score reads no kill tally (D-05), so `tests/guards/kill-credit-consumers.test.ts` stays as it is
and this todo stays open for LAW-*.
