---
created: 2026-11-18T10:00:00.000Z
title: Port Oolite's bargain tech days to the outfitting screen
area: economy
severity: minor
files:
  - src/ui/station-model.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

Oolite occasionally offers equipment one to three tech levels below its `techlevel` ("bargain tech days"):
when the station's tech level is below an item's minimum but within three of it, a day- and system-seeded value
lowers the minimum about one day in eight (`src/Core/Entities/PlayerEntity.m:8274-8285`, and repairs of a
damaged item one level lower at :8270-8272). Wegolite applies the plain tech-level check, so such items are never
offered there. Found while deciding to hide unavailable F3 items (owner, 2026-11-18).

## Solution

Port the rule in the sim-side availability check (deterministic: the day from the ship clock, the system id, the
item index as Oolite uses it), with unit tests against hand-computed Oolite cases. Check how Wegolite orders the
equipment list, because Oolite's seed uses the item's index in its equipment array.
