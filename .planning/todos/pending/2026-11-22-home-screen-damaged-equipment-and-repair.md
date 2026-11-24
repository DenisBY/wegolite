---
created: 2026-11-22T00:00:00.000Z
title: Show damaged equipment on the docked Home screen with a repair action, like fuel
source: Phase 19 UAT (owner request, 2026-11-22)
area: ui
severity: minor
files:
  - src/ui/station-model.ts
  - src/ui/docked.ts
  - src/sim/player/outfitting.ts
  - src/app/session/station-controller.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

After a fight, damaged equipment is visible only on F5 (`<name> (damaged)`) and repairable only from F3
(`Repair: <name>`). The docked Home screen already shows fuel with a one-click refuel button
(`HomeModel.fuelText`, `refuelButtonText`, `canRefuel` in `src/ui/station-model.ts`), but it says nothing about
damage. A player who docks after taking hits has to open F5 to notice that something is broken.

## Proposal

- On docking, the Home screen lists every damaged item (from `profile.damagedEquipment`) in a block next to
  the fuel block.
- Each item gets a repair action on the same screen, with its price and its refusal reason, as the refuel
  button does for fuel.
- The repair must go through the existing door: `checkRepair` / `applyRepair` in
  `src/sim/player/outfitting.ts` and the station controller's `commitProfile`. Use the same allow-list,
  half-price rule, tech-level-minus-one rule (an item that this station cannot repair is shown with its reason,
  for example "not available at this tech level", not hidden) and credits check. Do not add a second money path.
- With nothing damaged, the block is absent and Home looks as it does today.

## Fidelity

Oolite has no Home screen; damage appears on F5 and repair on F3 only. This is a UI-only convenience on top of
the same rules. When it is built, record it as a divergence row in `FIDELITY.md` (reason: clarity) after the
reviewers agree, per the fidelity rule in `AGENTS.md`.

## Done when

- A damaged item shows on Home after docking; repairing it there charges the F3 repair price, removes the item
  from `damagedEquipment` and re-installs it, and F5/F3 agree.
- A repair the station cannot do (tech level) or the player cannot afford is shown with its reason and refused.
- Unit tests on the Home model, plus a browser check through the existing `economy.damagedEquipment` probe.
