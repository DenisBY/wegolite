---
created: 2026-11-25T18:00:00.000Z
title: Port missiles and ECM for the player and NPCs
area: combat
severity: major
files:
  - src/sim/
---

## Problem

Milestone v2.4 (Pirates and Police) makes NPCs fight in ordinary play, but
lasers only: missiles and ECM were deferred by the owner on 2026-11-25 to keep
the milestone at its technical minimum. In Oolite, pirates and police often
carry and launch missiles (`missiles` / `missile_role` in `shipdata.plist`),
and the player can buy missiles, hardheads and an ECM system at F3
(`equipment.plist`). Until this is ported, Wegolite's fights are a recorded
divergence from Oolite.

## Solution

Schedule it as the next combat milestone (or a phase of one): player missile
purchase, targeting and launch, NPC missile use in the priority AI, ECM for
both sides, missile hits through the existing damage ledger. When v2.4 lands
its divergence row in FIDELITY.md, link it here. v2.4 should also add a
tripwire guard test (`tests/guards/`) that fails, naming this todo, as soon as
a compiled NPC record with missiles is given to an AI that would fire them, or
`EQ_MISSILE` / `EQ_ECM` becomes purchasable without this work.
