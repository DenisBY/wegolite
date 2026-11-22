---
phase: 19-equipment-damage-and-repair
verified: 2026-11-21T19:45:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/19-equipment-damage-and-repair/19-01-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-01-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-02-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-02-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-03-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-03-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-04-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-04-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-05-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-05-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-06-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-06-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-07-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-07-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-08-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-08-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-09-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-09-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-10-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-10-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-11-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-11-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-12-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-12-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-13-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-13-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-14-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-14-SUMMARY.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-15-PLAN.md"
  - ".planning/phases/19-equipment-damage-and-repair/19-15-SUMMARY.md"
  - "CHANGELOG.md"
  - "FIDELITY.md"
  - "src/app/game-session.ts"
  - "src/app/probe.ts"
  - "src/app/session/context.ts"
  - "src/app/session/event-router.ts"
  - "src/app/session/probe-publisher.ts"
  - "src/app/session/sim-driver.ts"
  - "src/app/session/station-controller.ts"
  - "src/app/session/step-options.ts"
  - "src/content/generated/equipment.json"
  - "src/content/generated/manifest.json"
  - "src/content/schemas/equipment.ts"
  - "src/main.ts"
  - "src/persistence/autosave.ts"
  - "src/persistence/save.ts"
  - "src/sim/combat/internal-damage.ts"
  - "src/sim/combat/ledger.ts"
  - "src/sim/combat/shields.ts"
  - "src/sim/combat/step.ts"
  - "src/sim/economy/cargo.ts"
  - "src/sim/events.ts"
  - "src/sim/flight/state.ts"
  - "src/sim/player/damage.ts"
  - "src/sim/player/outfitting.ts"
  - "src/sim/player/profile.ts"
  - "src/sim/rng.ts"
  - "src/ui/station-model.ts"
  - "tests/app/session/event-router-damage.test.ts"
  - "tests/app/session/tick-parity.test.ts"
  - "tests/e2e/combat.spec.ts"
  - "tests/persistence/save-v5.test.ts"
  - "tests/sim/combat/internal-damage.test.ts"
  - "tests/sim/player/damaged-installed.test.ts"
covered_digest: "v4:sha256:ab3566d1cfbf76892c24bc17b0566f00a0816dfca3c02330fccfc3cad1368a28"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Fly a fight in the browser (hook-spawned shooter, `?test=1`) with the four damageable F3 items granted, take hits until the HUD prints `<item> damaged.`, then dock and open F3 and F5."
    expected: "The HUD message reads naturally and clears the previous one; F5 lists `<name> (damaged)` before the working items; F3 shows `Repair: <name>` at half price in the station palette; repairing it makes F5 list the item as working again."
    why_human: "Text and state are asserted by unit and Playwright tests, but how the message, the F5 line and the F3 row look and read in play (spacing, colour, legibility) is a visual judgement."
---

# Phase 19: Equipment Damage and Repair Verification Report

**Phase Goal:** A hit on the player can damage the ship's equipment, the damage survives a reload, a damaged item stops counting as installed, and the player repairs it at F3 for Oolite's price
**Verified:** 2026-11-21T19:45:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

The code, the tests and the save format achieve the goal. The only open item is a visual and feel check that no test can make (see Human Verification Required). No gap, no blocker.

## Goal Achievement

### Observable Truths (the five ROADMAP success criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | A hit that reaches the energy bank runs Oolite's `(rand & 31) < amount` loop, minus 32 per iteration; the draw is seeded and frame-rate independent; the simulation reports an event and the app commits the profile in one atomic update | VERIFIED | `src/sim/combat/internal-damage.ts` `rollInternalDamage` (gate `floor(u*32) < amount`, `amount -= 32`) and `resolveInternalDamage` compared line by line with `PlayerEntity.m:5690-5697, 5746-5752, 6097-6185`: same `n_considered = (cap + mass/10000) * 95 / 100`, die, cargo branch, reversed die, `canBeDamaged`-only slot count and odds (CR-01 fixed in `b7b9ae9`), strict `>` weighted pick. Stateless per-tick stream `internalDamageSeed(worldSeed, tick)` (`mix32(forkSeed(worldSeed, PLAYER_ID, "damage"), tick)`), never stored or hashed. `ledger.ts:205-228` calls it on the player branch for a scrape always and for a laser only while `combat.energy > 0` (Oolite's two sources). `createDamageFlow` (`event-router.ts:646`) applies `applyEquipmentDamaged` / `applyCargoDestroyed` and commits once through `commitProfile`, printing only if the commit took effect. Facts reach every step from the live profile (`sim-driver.ts:142-225`, `internalDamageFactsFor`). The 30/60/144 Hz proof is `tests/sim/combat/internal-damage-cadence.test.ts` (passed in this run). |
| 2 | A damaged item is shown as damaged (F5, F3, one HUD message) and does not count as installed | VERIFIED | The item moves from `profile.equipment` to `profile.damagedEquipment` (`src/sim/player/damage.ts`), so every installed-set reader sees it absent: `equipmentSet()` (`station-controller.ts:211`) builds from `profile.equipment`, which feeds `stepFlight` (`options.equipment.has(DOCK_COMPUTER_KEY)` at `flight/step.ts:199`, `ADVANCED_COMPASS_KEY` at `:174`). `tests/sim/player/damaged-installed.test.ts` (4 tests passed) drives a damaged docking computer to `dockDenied notInstalled` and a damaged compass back to auto. HUD: `EQUIPMENT_DAMAGED_TEMPLATE = "%@ damaged."` with `clearPrevious` then 4.5 s (`event-router.ts:615-690`). F5: `<name> (damaged)` listed first (`station-model.ts:604-607`). F3: `Repair: <name>` row at the purchase row's position (`station-model.ts:1025-1045`). The Playwright CBT-08 spec asserts the HUD row `<name> damaged.`. D-06 in-use clauses that Wegolite cannot exercise (autopilot in progress, galactic jump countdown, ANA) are recorded in `.planning/todos/pending/2026-11-21-damaged-equipment-in-use.md` with a tripwire (19-15); the dock is instantaneous and there is no galactic jump, so no in-use path exists today. |
| 3 | At F3 the player repairs a damaged item at Oolite's repair price through the allow-listed money path; it counts as installed again; an unaffordable repair is refused with its reason | VERIFIED | `outfitting.ts` `repairPrice` = `ceil(price/2)` (Oolite `tryBuyingItem` halves, `PlayerEntity.m:9115-9118`; the four compiled prices are even), `repairTechLevel` one lower (`:8270-8271`), `checkRepair` (allow-list first, then validity, damaged, tech level, credits last so an unaffordable row stays listed with `insufficientCredits`), `applyRepair` returns identity on any refusal, charges, removes from `damagedEquipment` and appends to `equipment`. Wired through the station controller (`station-controller.ts:524/573` `commitProfile`). `tests/sim/player/outfitting.test.ts` (98 tests passed) and `tests/guards/damageable-equipment.test.ts` pass. Texts match D-07 (`" Repair:%@"` rendered `Repair: X`, `(Price is for repairing the existing system).`). |
| 4 | Saves move to schema v5 with `damagedEquipment`, no migration (older saves corrupt), worst case under 65,536 characters, and a damaged item is still damaged after Continue or Load | VERIFIED | `SAVE_VERSION = 5`, `SaveV5Schema` with `damagedEquipment` (max 16 keys) in `save.ts`; `parseSave` accepts only `SAVE_VERSION`, any other recognised not-newer version returns `corrupt` (`save.ts:538-539`), not `unreadable`. The semantic validator keeps rejecting `_DAMAGED` keys, requires the damaged list to be duplicate-free, damageable, disjoint from `equipment`, and counts both lists against the 64-key bound (`save.ts:608-621`). `autosave.ts:124, 241` carry the list through snapshot and restore. `tests/persistence/save-v5.test.ts` (115 tests passed) includes the worst-case size test, the v1 to v4 corrupt classification over the checked-in goldens and the damaged-list contract table. Measured worst case 46,796 characters (schema maxima) and 40,605 reachable, both under the cap (IN-02 comment fix `e2f7fa3`). Continue and Load durability is proved in a real browser by 19-09 (`economy.damagedEquipment` probe, `tests/e2e/save-load.spec.ts`; the remote `verify-full` at `75de63c` ran green with 147 Playwright specs). |
| 5 | CBT-08 holds end to end in one hook-spawned fight: the enemy is destroyed with its debris and the player leaves with a damaged item | VERIFIED | `tests/e2e/combat.spec.ts:570` "CBT-08 end to end" grants the four F3 items, spawns the shooter through the hook, asserts nothing is damaged before the fight, the first damage on the Node twin's tick with the HUD message, the scanner losing exactly the shooter, the damaged list equal to the twin's literal at the kill, entities and debris counts from the twin (at least one debris piece, models fetched), and the world hash 60 ticks later equal to the twin's literal. The Node twin is in `tests/app/session/tick-parity.test.ts`. The orchestrator ran the combat spec remotely at `e2f7fa3` (exit 0, 2 passed); the damage comes from the ledger, the roll and the commit, not from a hook shortcut. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/sim/combat/internal-damage.ts` | Pure, total port of the gate loop and `takeInternalDamage` | VERIFIED | 254 lines, exact against `PlayerEntity.m`; 256-iteration cap recorded as divergence E-167 |
| `src/sim/player/damage.ts` | `applyEquipmentDamaged`, `applyCargoDestroyed`, identity on refusal | VERIFIED | Wired from `createDamageFlow` |
| `src/sim/player/outfitting.ts` | `DAMAGEABLE_EQUIPMENT_KEYS`, repair door | VERIFIED | Four keys (dock computer, galactic drive, advanced compass, ANA), matching the seven `damage_probability = 0` records in the plist and the compiled `equipment.json` |
| `src/content/generated/equipment.json`, `schemas/equipment.ts` | `damageProbability` on all 41 records | VERIFIED | Seven zeros (cargo bay, passenger berth, missiles, mine, tutorial, trumble) match `equipment.plist` (7 entries) |
| `src/persistence/save.ts`, `autosave.ts` | v5 schema and damaged list round trip | VERIFIED | See truth 4 |
| `src/app/session/event-router.ts` | `damageFlow` row, templates | VERIFIED | `equipmentDamaged` and `cargoDestroyed` routed to `damageFlow` alone |
| `src/ui/station-model.ts` | F5 `(damaged)`, F3 `Repair:` row | VERIFIED | |
| `FIDELITY.md` | Rows E-154 to E-170 for every divergence and mechanic | VERIFIED | Rows present with verbatim Oolite excerpts; "Repair: X" is not recorded as a divergence (D-07/D-12); `(damaged)` and the F5 order are recorded |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `sim-driver.ts` `internalDamageFacts()` | `ctx.core.profile` (live) | cache keyed on profile, catalogue, commodities identity | WIRED | Rebuilt after each commit, so a second hit never sees a damaged item as installed |
| `step-options.ts` | `combat.internalDamage` | `buildStepOptions` | WIRED | Omitted until both catalogues load (no guessed odds) |
| `combat/step.ts:805` | `applyLedger` trailing argument | `options.combat.internalDamage` | WIRED | |
| `ledger.ts` player branch | `rollInternalDamage` | per-call work copy and one stream | WIRED | One stream per ledger call, events pushed in order |
| `event-router.ts` `damageFlow` | `commitProfile` (station controller) | `game-session.ts:461` | WIRED | |
| `commitProfile` | probe `economy.damagedEquipment` | `probe-publisher.ts:156` | WIRED | Docked commits render the station view; in-flight commits sync the probe only (WR-01, `37fb48c`) |
| F3 repair row | `applyRepair` | `repairFitKey` composite key parsed by membership | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Roll facts | `items`, `capacityPods`, `pods` | live `profile.equipment`, cargo, compiled catalogue | Yes | FLOWING |
| F5 damaged lines | `profile.damagedEquipment` | committed by `damageFlow`, restored by `profileFromSave` | Yes | FLOWING |
| F3 repair row | `profile.damagedEquipment`, catalogue price | same | Yes | FLOWING |
| HUD message name | catalogue `name` | `ctx.core.equipmentCatalogue` | Yes (falls back to the key) | FLOWING |

### Behavioral Spot-Checks

Run in Docker (`docker compose run --rm test npx vitest run ...`) in this verification:

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Roll port, property, cadence, save v5, not-installed proof, repair door, damage router, all guards | targeted Vitest over `tests/sim/combat/internal-damage*.test.ts`, `tests/persistence/save-v5.test.ts`, `tests/sim/player/damaged-installed.test.ts`, `tests/sim/player/outfitting.test.ts`, `tests/app/session/event-router-damage.test.ts`, `tests/guards` | 27 files, 580 tests passed | PASS |
| Full suite, lint, typecheck | orchestrator evidence: `test` 280 files / 7340 passed; remote `verify` at `e2f7fa3` exit 0 | not re-run (spot-checked above) | PASS (reported) |
| CBT-08 end to end in a browser | orchestrator evidence: remote combat spec at `e2f7fa3` exit 0 (2 passed); remote `verify-full` at `75de63c` exit 0 (147 specs) | not re-run (needs the remote machine) | PASS (reported) |

### Probe Execution

No `probe-*.sh` probes are declared for this phase: SKIPPED.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| CBT-08 | 19-01, 19-02, 19-03, 19-04, 19-10, 19-11, 19-13, 19-14, 19-15 | Destruction clauses (Phase 16) plus internal hits damage the player's equipment | SATISFIED | Truths 1, 2, 5; staged requirement, so this phase completes it |
| CBT-12 | 19-01, 19-03, 19-05, 19-10, 19-12, 19-14, 19-15 | Damaged equipment is shown as damaged and repairable at F3 at Oolite's repair price | SATISFIED | Truths 2, 3 |
| SAVE-09 | 19-03, 19-06, 19-07, 19-08, 19-09, 19-14 | Schema v5 with `damagedEquipment`, no migration, a damaged item does not count as installed | SATISFIED | Truths 2, 4 |

All three IDs from the roadmap appear in the plans' `requirements` fields and in `REQUIREMENTS.md` (lines 26, 28, 37; traceability rows 88-90). No orphaned requirement: `REQUIREMENTS.md` maps no other ID to Phase 19. The checkboxes and the "Pending" traceability cells in `REQUIREMENTS.md`, and the phase header checkbox in `ROADMAP.md`, are still unchecked; closing them is the orchestrator's phase-close bookkeeping, not an implementation gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| none | | `TBD`, `FIXME`, `XXX` scan over the phase's main source files found no marker | | |

Code-review findings: CR-01 (zero-probability items counted as damageable slots) and WR-01 (in-flight commit rebuilt the station view) and IN-02 were fixed after the plans and re-checked here in the code (`internal-damage.ts:201-210`; `commitProfile` renders only while docked). IN-01 was accepted by decision (deliberate totality). No open finding.

### Recorded Divergences (not gaps)

- The cosmetic hull-wear branch and `ship_trade_in_factor` (constant 95): FIDELITY E-159, todo and tripwire `2026-11-21-hull-wear-renovation-and-fuel-price.md`.
- The 256-iteration cap of the gate loop (E-167): observable only on a scrape above 8,192 points, which would kill Oolite's player.
- F5 `(damaged)` instead of `(N/A)` and the damage-order sort of the damaged group (E-165, E-168, E-169).
- No repair time is charged (D-10).

### Human Verification Required

#### 1. Damage, F5 and F3 in play

**Test:** Run the dev or preview build with `?test=1`, grant the four F3 items, launch, take hits from a hook-spawned shooter until a damage message appears, dock, then open F5 and F3 and repair the item.
**Expected:** `<item> damaged.` shows on the HUD for 4.5 s after clearing the previous message; F5 lists `<name> (damaged)` first; F3 shows `Repair: <name>` at half price in a readable colour; after repair F5 lists the item as working.
**Why human:** every string and state is asserted by tests, but the look and readability in play (spacing, colour, the station palette decision) is a visual judgement.

### Gaps Summary

No gaps. All five roadmap success criteria are met with code, test and (reported) browser evidence; the three requirement IDs are accounted for. The status is `human_needed` only because one visual check cannot be automated; it does not block the phase.

---

_Verified: 2026-11-21T19:45:00Z_
_Verifier: Claude (gsd-verifier)_
