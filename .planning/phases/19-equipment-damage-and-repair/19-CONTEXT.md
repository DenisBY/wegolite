# Phase 19: Equipment Damage and Repair - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A hit that gets through to the player's energy bank (an NPC or test-pilot laser through `takeEnergyDamage`, or a Phase 18 collision through `takeScrapeDamage`) runs Oolite's internal-damage roll. The roll can destroy one cargo container or damage one installed item. A damaged item does not count as installed, survives a reload in save schema v5 (`damagedEquipment`, no migration), is shown as damaged (F5, F3 and one HUD message), and is repaired at F3 for Oolite's repair price through the allow-listed money path. One hook-spawned fight proves CBT-08 end to end. Requirements: CBT-08 (completes it), CBT-12, SAVE-09.

Not in this phase: player death (Phase 20), hull wear and `EQ_RENOVATION`, NPC equipment damage, heat damage, any new equipment for sale.

</domain>

<decisions>
## Implementation Decisions

### The internal-damage roll (carried from the roadmap and the Oolite source)
- **D-01:** Port the roll exactly: `while (amount > 0) { if ((rand & 31) < amount) takeInternalDamage(); amount -= 32; }` after the hit reaches the energy bank. It runs on both damage sources: `takeEnergyDamage` (`PlayerEntity.m` 5684-5697, only while energy stays above 0) and `takeScrapeDamage` (`PlayerEntity.m` ~5745-5752, collisions). Every draw comes from a seeded, frame-rate-independent stream. The simulation emits events and the app commits the profile in one atomic update (roadmap SC1).
- **D-02:** `takeInternalDamage` (`PlayerEntity.m` 6097-6185) is ported as one die roll over `n_considered = (maxAvailableCargoSpace + mass/10000) * ship_trade_in_factor / 100`, with its three branches in order: cargo, then equipment (the die reversed), then cosmetic.
- **D-03:** Damageable items follow Oolite's rule: an installed item with `damage_probability > 0` (default 1.0), never a missile or mine (`OOEquipmentType.m` 247, 504-520). Lasers are not equipment items in Oolite and are never internally damaged. `EQ_CARGO_BAY` and `EQ_PASSENGER_BERTH` carry `damage_probability = 0`. Within today's F3 set that leaves `EQ_DOCK_COMP`, `EQ_GAL_DRIVE`, `EQ_ADVANCED_COMPASS` and `EQ_ADVANCED_NAVIGATIONAL_ARRAY`. `damage_probability` is compiled from `equipment.plist` behind the strict schema, the golden and the drift gate.

### Cargo loss branch
- **D-04:** Port the cargo branch. When `damage_to < cargo container count`, one container is destroyed and removed from the hold, the HUD shows Oolite's `"@-destroyed"` = `"%@ destroyed."` with the commodity's display name (4.5 s, after clearing the previous message), and no equipment is damaged on that roll. It goes through the same event and the same atomic profile update as equipment damage. The odds match Oolite, so FIDELITY.md gets no divergence row for this branch. Research must establish how Oolite's in-flight `cargo` array maps onto Wegolite's hold: one pod per tonne for t-unit goods; how kg and g goods are grouped into pods; which pod index `damage_to` selects. The pod order must be deterministic. — **Reversibility:** reversible

### Hull wear (cosmetic branch) and the trade-in factor
- **D-05:** `ship_trade_in_factor` is a constant 100. It is not persisted, never changes, and the cosmetic branch (`(damage_to & 7) == 7 && factor > 75` → `factor--`) is not ported. Record this as a divergence row in FIDELITY.md, with a todo that ties it to `EQ_RENOVATION` and the fuel-price effect as one later piece of work. The factor of 100 still enters `n_considered`, so the cargo and equipment odds are exact for a ship in Oolite's new-ship state. — **Reversibility:** reversible — porting later adds one saved field and its own save bump.

### A breakdown while the item is in use
- **D-06:** Behave as Oolite does:
  - Docking computer damaged while the autopilot is engaged: the autopilot disengages (`ShipEntity.m` ~3327-3330, `disengageAutopilot`, `"autopilot-off"` = `"Autopilot disengaged."`) and the player flies the rest of the approach by hand. A damaged docking computer cannot be engaged at all (roadmap SC2).
  - Galactic hyperdrive damaged during the galactic jump countdown: the jump is aborted, as in `PlayerEntity.m` 3432-3440 ("damaged gal drive? abort!"). A damaged drive cannot start a galactic jump.
  - Advanced compass damaged: the compass falls back to basic mode (`PlayerEntity.m` 10256-10260).
  - ANA damaged: the chart stops showing what the ANA provides.

  Only the effects these items already have in Wegolite need the check. Research lists which of them exist today (`src/sim/flight/step.ts` reads the docking computer and the advanced compass from the equipment set).

### Texts
- **D-07:** Use Oolite's strings verbatim, with one exception:
  - HUD: `"@-damaged"` = `"%@ damaged."` (4.5 s, after clearing the previous message) and `"@-destroyed"` for cargo.
  - F3 row: `"equip-repair-@"` with a real space, shown as `Repair: Docking Computers`. Oolite's leading space is only its own alignment, and the missing space after the colon is not copied.
  - F3 detail: `"upgradeinfo-@-price-is-for-repairing"` = `"%@ (Price is for repairing the existing system)."`.
  - F5: damaged items are listed first, as `<name> (damaged)` instead of Oolite's `"equipment-@-not-available"` = `"%@ (N/A)"`, which reads as "not for sale". This is one deliberate UI divergence row in FIDELITY.md.

### Repair (carried from the Oolite source)
- **D-08:** The repair price is 50 % of the catalogue price (`tryBuyingItem`, `PlayerEntity.m` 9115-9118). It is a new allow-listed entry on the F3 money path (the visible set grows by the repair rows), and an unaffordable repair is refused with its reason like any other purchase.
- **D-09:** A damaged item is offered for repair at a system one tech level lower than buying it requires (`PlayerEntity.m` 8270-8271). The same raw-tech-level rule as purchase applies.
- **D-10:** A repair is applied at once, with no repair time and no clock advance (D-12 carried from Phase 5; Oolite's `repairTime` is not ported).

### Saves (carried from the roadmap)
- **D-11:** Schema v5 adds `damagedEquipment`. A damaged item lives only there. It is removed from `equipment` and is never the `_DAMAGED` suffix key, which the validator keeps rejecting. There is no migration: v1-v4 saves go through the existing unreadable path. The worst case (every damageable item damaged, at maximum lengths) has a size test under `MAX_SAVE_CHARS` (65,536). The damage becomes durable at the existing autosave triggers (dock, hyperspace arrival); there is no new write on damage. The same applies to cargo lost to D-04. — **Reversibility:** one-way — older saves are rejected, which is accepted for the alpha.

### Divergence policy
- **D-12:** The project-wide fidelity rule applies (AGENTS.md "Fidelity rule"; PROJECT.md Key Decisions row "Diverge from Oolite where it is clearly better and the reviewer models agree", 2026-11-21). A divergence needs a concrete benefit, the reviewer models' agreement and a FIDELITY.md row. D-07's "(damaged)" and the space in "Repair: X" are its first instances.

### Claude's Discretion
- The seeded stream and how it is keyed. It must be deterministic at 30, 60 and 144 Hz, with its own draws so existing streams and goldens do not shift.
- The fixed iteration order for the weighted equipment pick (Oolite iterates an `NSDictionary`, whose order is not defined). Pick a stable order, such as catalogue or profile order, and record it.
- The event names and payloads, the event router row, the probe shape and the HUD closed-set additions.
- How Oolite's `randf()` for the weighted pick maps onto the stream.
- The plan split and the hook-spawned CBT-08 fight scenario.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § "Phase 19: Equipment Damage and Repair" — goal, success criteria, implied work, pitfalls, decisions to settle
- `.planning/REQUIREMENTS.md` — CBT-08, CBT-12, SAVE-09
- `.planning/PROJECT.md` § Key Decisions — D-12 (no install delay), the autosave triggers, the strict save schema rows
- `.planning/research/PITFALLS.md` — pitfalls 13, 18, 22 (if the file has moved, find it under `.planning/milestones/`)
- `FIDELITY.md` — new rows for D-05 and D-07

### Oolite source (read from `/home/opencode/git/oolite`)
- `src/Core/Entities/PlayerEntity.m` 5599-5700 (`takeEnergyDamage` and its internal-damage loop), ~5700-5753 (`takeScrapeDamage` and its loop), 6097-6185 (`takeInternalDamage`)
- `src/Core/Entities/PlayerEntity.m` 9105-9125 (`tryBuyingItem`, repair at 50 %), 8262-8275 (repair one tech level lower), 8378-8410 and 8565-8575 (F3 repair row and detail text), 7140-7245 (`equipmentList`: damaged items first)
- `src/Core/Entities/PlayerEntity.m` 3430-3440 (galactic jump aborted when the drive is damaged), 10256-10260 (compass falls back to basic)
- `src/Core/Entities/ShipEntity.m` 3267-3335 (`removeEquipmentItem`: autopilot disengages when the docking computer is damaged)
- `src/Core/OOEquipmentType.m` 200-250, 500-520 (`damageProbability`, `canBeDamaged`)
- `Resources/Config/equipment.plist` (`damage_probability` per item), `Resources/Config/descriptions.plist` 493-494, 895-896, 1595-1597, 1891-1892 (the strings in D-06 and D-07)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sim/combat/ledger.ts` — the one damage ledger. It has the player branch, the laser (`takeEnergyDamage`) and scrape sources, and floors the player's energy at 0. The internal-damage roll hangs off the player branch.
- `src/sim/combat/shields.ts` — routes a hit through the shields into the energy bank (`routeDamage`, the scrape variant). It knows the remainder that reaches the bank, which is the roll's `amount`.
- `src/sim/player/outfitting.ts` — the F3 money path, with `VISIBLE_EQUIPMENT_KEYS`, `checkFit`/`applyFit` and the separate laser door. The repair rows become one more allow-listed door in the same pattern.
- `src/sim/player/profile.ts` — `PlayerProfile.equipment`, `canPurchase`/`purchase`, `MAX_EQUIPMENT_KEYS`.
- `src/persistence/save.ts` — the strict save schema (now v4), `MAX_SAVE_CHARS = 65_536`, and the unreadable path for old versions.
- `src/sim/dock/computer.ts` (`DOCK_COMPUTER_KEY`) and `src/sim/flight/step.ts` (`ADVANCED_COMPASS_KEY`, reads `options.equipment`) — the installed-item checks that must see a damaged item as absent.
- `src/app/session/event-router.ts` — the closed event router table that the new events join. The HUD message path already exists.

### Established Patterns
- The simulation decides and emits events; the app commits the profile atomically (Phase 13 laser purchase, roadmap SC1).
- Closed sets grow by design: router table, probe shape, HUD (pitfall 22).
- New combat code is total on malformed input and covered by a fast-check property.
- At least 90 % of new behavioural assertions are Vitest scenarios. Browser specs are opt-in smoke checks with traffic off.

### Integration Points
- Ledger player branch → internal-damage roll → events (`equipmentDamaged`, `cargoDestroyed` or similar) → app profile update and HUD message.
- The installed set seen by the flight step, the docking computer, the chart (ANA) and the galactic jump: everything that reads `profile.equipment`.
- F3 (`src/ui/station-model.ts`, `src/ui/station.ts`) and F5 (`src/ui/docked.ts` / `station-tabs.ts`) views.

</code_context>

<specifics>
## Specific Ideas

- F5 says "(damaged)", not Oolite's "(N/A)": the owner found "N/A" ambiguous ("not for sale"). All other strings follow Oolite.
- Odds parity with Oolite: a fuller hold makes equipment damage rarer, as in Oolite. This is why the cargo branch is ported, not stubbed.

</specifics>

<deferred>
## Deferred Ideas

- Hull wear (`ship_trade_in_factor`), `EQ_RENOVATION` and the fuel-price effect, as one later piece of work. Record a todo when D-05 lands.

### Reviewed Todos (not folded)
- `2026-11-11-cargo-purchase-cost-basis-tracking.md` — needs its own ordered save bump after v5 and stays unscheduled (roadmap).
- The keyword matcher flagged about 30 other todos (HUD, collisions, NPC, CI). None of them is about equipment damage or repair, so none is folded.

</deferred>

---

*Phase: 19-equipment-damage-and-repair*
*Context gathered: 2026-11-21*
