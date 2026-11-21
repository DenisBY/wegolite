---
created: 2026-11-21T00:00:00.000Z
title: Take Oolite's damaged-item clauses with the first autopilot, galactic-jump and ANA consumer (D-06)
source: Phase 19 decision D-06 (plan 19-15)
area: sim
severity: minor
files:
  - src/sim/dock/computer.ts
  - src/sim/player/outfitting.ts
  - tests/guards/damaged-equipment-in-use.test.ts
---

## Problem

Phase 19 makes installed equipment damageable (D-03, D-06). Oolite's in-use behaviour has three clauses that
depend on an in-use state Wegolite does not have yet, so none of them can be ported or tested today. Each is
"not applicable today"; the tripwire `tests/guards/damaged-equipment-in-use.test.ts` fails, naming this todo, the
moment the first consumer appears.

### 1. Autopilot disengages when the docking computer is damaged

- Oolite: `src/Core/Entities/ShipEntity.m:3327-3330`. When equipment is removed (damage swaps the key for its
  `_DAMAGED` twin), "if all docking computers are damaged while active": a player in
  `STATUS_AUTOPILOT_ENGAGED` with no `hasDockingComputer` gets `disengageAutopilot`, which shows
  "Autopilot disengaged." (`third_party/oolite/Config/descriptions.plist:494`, key `autopilot-off`).
- Not applicable today: Shift+C docks instantly with no engaged autopilot (`src/sim/dock/computer.ts` header,
  decision D-12). There is no autopilot state that could be engaged while the computer breaks. The docking
  computer refusal itself (a damaged computer does not dock) holds through the installed set (plan 19-03).
- First consumer must: disengage the autopilot with Oolite's "Autopilot disengaged." text when the docking
  computer is damaged while the autopilot is engaged.

### 2. Galactic jump aborts with a damaged drive

- Oolite: `src/Core/Entities/PlayerEntity.m:3432-3440` ("damaged gal drive? abort!"). While a galactic
  witchjump is counting down, `![self hasEquipmentItem:@"EQ_GAL_DRIVE"]` clears `galactic_witchjump`, returns
  the player to `STATUS_IN_FLIGHT`, plays the hyperspace-aborted sound and posts `playerJumpFailed` with
  "malfunction". The same check means a damaged drive (held as `EQ_GAL_DRIVE_DAMAGED`) cannot start a jump.
- Not applicable today: no galactic jump exists (PROJECT.md "galactic hyperdrive - later milestone"); the key is
  only an F3 listing and a single-instance purchase.
- First consumer must: refuse to start a galactic jump with a damaged drive and abort a running countdown the
  moment the drive is damaged, using the exact-key test (`hasEquipmentItem`), not a "provides" test.

### 3. The ANA stops providing when damaged

- Oolite: `hasEquipmentItemProviding:` matches only the exact key, or an item that `provides:` it
  (`src/Core/Entities/ShipEntity.m:2803-2818`), so a damaged ANA (held as
  `EQ_ADVANCED_NAVIGATIONAL_ARRAY_DAMAGED`) provides nothing. Every ANA consumer then falls back to its plain
  behaviour:
  - the long-range chart's ANA route (`src/Core/GuiDisplayGen.m:1696`);
  - the ANA mode keys, next and previous (`src/Core/Entities/PlayerEntityControls.m:1895`);
  - the next-hop target, which returns the plain target system without an ANA (`PlayerEntity.m:601`);
  - the mission-screen ANA charts, which fall back to the plain short, custom or long chart
    (`PlayerEntity.m:11210-11244`).
- Not applicable today: there is no chart or route consumer of the ANA (research audit, "Installed-set
  consumers"); the key is only an F3 listing and a single-instance purchase.
- First consumer must: stop showing what the ANA provides while the ANA is damaged, and fall back to the plain
  behaviour of each surface above.

### The tripwire is limited

`tests/guards/damaged-equipment-in-use.test.ts` flags a consumer that spells `autopilot`, `EQ_GAL_DRIVE` or
`EQ_ADVANCED_NAVIGATIONAL_ARRAY` in non-comment code outside the pinned token counts of
`src/sim/player/outfitting.ts`. A consumer that reads a key from an existing list by position, or names its
feature differently (for example `autoDock`), is not caught. The word `autopilot` may also match an unrelated
identifier; that false positive only makes a human read this todo, which is its purpose.

## Goal

When the first autopilot, galactic-jump or ANA consumer is scheduled, port the matching clause above together
with it, and add a damaged-item test at that consumer's own simulation boundary (a damaged item changes the
outcome there), so the clause does not depend on the tripwire. Then retire or narrow the matching trigger of the
tripwire and move this todo to done.
