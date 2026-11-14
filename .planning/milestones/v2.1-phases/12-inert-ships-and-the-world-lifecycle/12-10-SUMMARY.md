---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 10
subsystem: hud
tags: [scanner, hud-model, npc-contacts, id-scope, traffic-fixture, oolite-colours]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-07 populateInertWorld and the Lave golden inputs; plan 12-08 traffic.ts (trafficContent, createInertPopulate) and ctx.core.worldLifecycle with traffic on"
provides:
  - "src/sim/world/contacts.ts: NpcContact, NpcContactKind, npcContacts(world), the only world-to-presentation channel for NPC ships; plain id-free snapshots with copied vectors"
  - "HUD contact kinds ship and police on the existing scanner (HudContact widened), HUD_SCANNER_POLICE_COLOR #8000ff (Oolite police_color1), scannerContactColor exported"
  - "buildHudModel(..., npc): one contact per inert ship after the three static ones; the render driver passes npcContacts(ctx.core.worldLifecycle?.world) each rendered frame"
  - "tests/helpers/traffic-fixture.ts: laveInertWorld(epoch) and poseNearFirstShip(epoch, metres), the shared Node-importable geometry for the HUD row here and plan 12-12's browser reload check"
affects: [12-11, 12-12]
status: complete
actuals:
  tokens: 8100
  tasks: 2
  commits: 2
plan_head_before: da44d92e2278f792670ff2c9a4a34a7edb2f816d
plan_head_after: b71c690c0cc0e16bbed31f8b5d7e16802ab58e3b
tech-stack:
  added: []
  patterns:
    - "a presentation holder receives id-free snapshots rebuilt each frame from the live world; no contact carries an entity id, so nothing outside the world can outlive it"
    - "an optional trailing HUD-model parameter defaults to empty, so no world or traffic off leaves exactly today's three contacts"
    - "a render-driver row drives the real renderFrame in flight over a scene double and a recording HUD double"
key-files:
  created:
    - src/sim/world/contacts.ts
    - tests/sim/world/contacts.test.ts
    - tests/helpers/traffic-fixture.ts
  modified:
    - src/app/hud-model.ts
    - src/render/hud/draw.ts
    - src/app/session/render-driver.ts
    - tests/ui/hud-model.test.ts
    - tests/app/session/render-driver.test.ts
    - tests/hud/projection.test.ts
    - CHANGELOG.md
key-decisions:
  - "Ships reach the scanner as id-free NpcContact snapshots (kind police for CLASS_POLICE, neutral otherwise) rebuilt every rendered frame from the live world; the HUD kind is ship or police, drawn in Oolite's neutral yellow and police purple, with no new HUD element."
requirements-completed: []
coverage:
  - id: D1
    description: "npcContacts returns id-free copies of the live ships in ascending id order, police for CLASS_POLICE and neutral otherwise, empty for no world"
    requirement: "WORLD-15"
    verification:
      - kind: unit
        ref: "tests/sim/world/contacts.test.ts"
        status: pass
      - kind: unit
        ref: "tests/guards/entity-id-scope.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "With traffic on every inert ship appears on the existing scanner as a ship or police contact (visible within range plus radius), in Oolite's yellow and police purple, with no new HUD element; with no world the contacts are exactly the three static ones"
    requirement: "WORLD-15"
    verification:
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#buildHudModel NPC contacts (WORLD-15)"
        status: pass
      - kind: unit
        ref: "tests/hud/projection.test.ts#scannerContactColor"
        status: pass
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#renderFrame NPC contacts (WORLD-15)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The shared fixture builds the regenerated Lave inert world and a pose 5,000 m from its first ship, and at that pose the scanner lists that ship as visible"
    requirement: "WORLD-15"
    verification:
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#the regenerated Lave world next to a ship (WORLD-15, plan 12-12's fixture)"
        status: pass
    human_judgment: false
  - id: D4
    description: "How the lollipops of the ships look on the real canvas (colour on screen, stalk heights) is not asserted by a Node test; plan 12-12's opt-in browser spec reads probe.hud.contacts"
    requirement: "WORLD-15"
    verification: []
    human_judgment: true
    rationale: "The pixel appearance needs a browser; the model and colour mapping are covered, the opt-in traffic spec of plan 12-12 reads the probe"
---

# Phase 12 Plan 10: Inert ships on the existing scanner Summary

With traffic on, every inert ship now shows on the existing scanner as an id-free contact: police Vipers in Oolite's police purple (#8000ff), every other ship in the neutral yellow, with no new HUD element. WORLD-15's scanner half is delivered; the requirement is not marked complete because plans 12-11 (drawing) and 12-12 (browser proof) follow.

## Accomplishments

- **Tracer (Task 1).** `npcContacts(world)` in `src/sim/world/contacts.ts` walks the live store in ascending id, skips dead and non-ship entities and returns `{ position, orientation, radius, specKey, kind }` copies, with no id field and no `EntityId` name in the module. `HudContact` widens to ids `ship` and kinds `ship` and `police`; `HUD_SCANNER_POLICE_COLOR = "#8000ff"` cites `ShipEntity.m:5585` (`police_color1 {0.5, 0, 1}`); `scannerContactColor` is exported and maps ship to the neutral yellow. `buildHudModel` takes a trailing `npc` parameter (default empty) and appends one projected contact per ship after the three static ones, using each ship's radius so a ship just past the range but touching it is pinned to the rim and drawn. The render driver computes `npcContacts(ctx.core.worldLifecycle?.world)` once per drawn frame and never keeps it, so `probe.hud.contacts` (ids of visible contacts, unchanged code) gains `ship` entries.
- **Fixture and record (Task 2).** `tests/helpers/traffic-fixture.ts` builds `laveInertWorld(epoch)` through `trafficContent` and `createInertPopulate` over `worldSeedFor(marketSeedForSystem("g0-s7"), epoch)` (12 ships, ids 101 to 112, equal to the plan 12-07 launch world at epoch 1) and `poseNearFirstShip(epoch, metres)` (the lowest-id ship's position plus `metres` along +x, identity orientation, speed 0). The HUD row at that pose lists the ship as a visible `ship` or `police` contact at 5,000 m. The CHANGELOG entry of plan 12-08 now says the ships "show on the scanner (police Vipers in purple, others in yellow)".

## Task Commits

| Task | Name | Commit |
| --- | --- | --- |
| 1 | show inert ships on the existing scanner as id-free contacts in Oolite's colours (tracer) | 79f0bb1 |
| 2 | share a regenerated Lave world fixture and show its ship on the scanner | b71c690 |

Tracer gate: the automated-only `<verify>` (targeted Vitest plus the id-scope guard) passed after the commit's content was final (5 files, 54 passed), so expansion proceeded with no checkpoint.

## Gates run (all in Docker)

| Gate | Result |
| --- | --- |
| Targeted Vitest contacts, hud-model, render-driver, projection, entity-id-scope (Task 1) | 5 files, 54 passed (a first run found two geometry mistakes in my own hud-model rows: a contact placed at an absolute x instead of relative to the player; fixed, then green) |
| `docker compose run --rm typecheck` (local) | exit 0 |
| `docker compose run --rm lint` (local, ESLint and Prettier) | exit 0 |
| `docker compose run --rm test` (full, local, with coverage) | exit 0: 150 files passed, 2,966 passed, 2 skipped, no coverage error |
| `docker compose run --rm verify` via `remote-run.sh` on committed HEAD b71c690 | exit 0 in 125 s: lint, typecheck, drift, Vitest 150 files passed, build, e2e smoke subset 27 passed. Not re-run locally; there was no disagreement to arbitrate |

Acceptance greps: `export function npcContacts` 1; `EntityId` in contacts.ts absent; `HUD_SCANNER_POLICE_COLOR = "#8000ff"` 1; `npcContacts(` in render-driver.ts 1; `export function (laveInertWorld|poseNearFirstShip)` 2; `poseNearFirstShip` in hud-model.test.ts 4; `police Vipers in purple` in CHANGELOG.md 1. The id-scope guard passes unchanged.

## Deviations from Plan

### Departures worth a reviewer's eye (no rule triggered)

- **Fixture file placement.** The plan puts the fixture in Task 2; the Task 1 HUD rows used the existing `tests/helpers/inert-world.ts` (epoch-1 world) instead, so Task 1 stood alone. Task 2's rows compare the new fixture with that helper.
- **`scannerContactColor` is now exported** (it was module-private) so its mapping is asserted directly; `tests/hud/projection.test.ts` (not in the plan's file list) gained the colour row.
- **Test-first order.** The behaviour rows were written with the code and run once together (green after fixing my own geometry mistake); no separate red run was recorded.
- **Probe unchanged.** No probe key was added (frozen shape); `hud.contacts` carries the new ids through the existing mapping. The render-driver row asserts the model the driver hands to the HUD, which is what the probe maps.
- **Commits.** The plan's brief says "do not commit"; the dispatch required per-task commits. Nothing was pushed or tagged.

**Total deviations:** 0 rule-triggered. **Impact:** none.

## Known Stubs

None.

## Threat Flags

None. T-12-27 (entity ids outside the world) is mitigated as the plan states: contacts carry no id, `contacts.ts` never names `EntityId`, the entity-id-scope guard passes unchanged, and a test asserts the contact's five fields and the absence of any id key.

## Next Phase Readiness

Plan 12-11 draws the ships with an instanced layer and the lazy NPC models; plan 12-12's opt-in traffic spec can place the player with `poseNearFirstShip` so its scanner check is not vacuous.

## Self-Check: PASSED

Created files exist (src/sim/world/contacts.ts, tests/sim/world/contacts.test.ts, tests/helpers/traffic-fixture.ts); commits 79f0bb1 and b71c690 are ancestors of HEAD.
