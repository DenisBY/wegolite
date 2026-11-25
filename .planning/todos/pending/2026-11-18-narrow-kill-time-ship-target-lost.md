---
created: 2026-11-18T09:00:00.000Z
title: Narrow the kill-time shipTargetLost before a second AI module defines onEvent
area: sim
severity: minor
resolves_phase: 23
files:
  - src/sim/world/kill.ts
  - src/sim/ai/pilots/flight-script.ts
  - src/sim/ai/registry.ts
  - tests/guards/on-event-handlers.test.ts
  - .planning/phases/17-npc-fire-and-hits-on-the-player/17-CONTEXT.md
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

When a ship dies, the kill path (`notifyKill` in `src/sim/world/kill.ts`, Phase 15 criterion 1) posts
`shipTargetLost` at kill time to every live ship whose `nav.targetId` is the victim, and tells the killer
regardless of its own target. Oolite gates `noteTargetDestroyed` on the primary target and tells third parties one
update later through `noteLostTargetAndGoIdle`. So a holder can receive `shipTargetLost` twice (at kill time, then
from its own steering on its next update), and every `onEvent` must be idempotent for that event.

That is harmless today: the one AI module with an `onEvent` handler, `flight-script`, takes `shipTargetLost`
idempotently (it finishes the script once; a second delivery finds the phase already done). `test-pilot` has
`think` only. Phase 17 (D-12) adds no second handler: fire reads its target from `nav`, and the gate and the
behaviours refuse a dead or missing target.

The risk is a later AI module with its own `onEvent`: it would receive the kill-time broadcast and could treat it
as news, or act twice.

## When to act

The first time a second module in `AI_REGISTRY` defines `onEvent` (a combat, escort or trader AI that reacts to
target loss). Narrowing the kill-time notification changes the wording of Phase 15 criterion 1, so it needs the
owner's edit to that criterion before any code change: this phase does not make that edit. The plan that adds the
handler must:

- put the owner edit in its `read_first` and get it approved,
- decide which recipients keep `shipTargetLost` (the killer, ships whose `nav` target is the victim, escort
  groups),
- test that a ship killed while two others target it queues exactly one `shipTargetLost` to each, and that
  `flight-script` stays idempotent when it receives it twice.

## Guard

`tests/guards/on-event-handlers.test.ts` (D-13.3) counts the modules in `AI_REGISTRY` that define `onEvent` and
fails above one. Its failure message names this file and the owner edit to Phase 15 criterion 1. The commit that
adds the second handler raises `MAX_ON_EVENT_HANDLERS` together with the narrowing decision.
