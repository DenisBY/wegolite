# Phase 19: Equipment Damage and Repair - Research

**Researched:** 2026-11-21
**Domain:** Deterministic simulation port (Oolite internal-damage roll), profile/save schema v5, F3 money path, F5/HUD presentation
**Confidence:** HIGH on Oolite semantics and repo evidence (source files read this session); MEDIUM on design choices marked `[ASSUMED]`

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### The internal-damage roll (carried from the roadmap and the Oolite source)
- **D-01:** Port the roll exactly: `while (amount > 0) { if ((rand & 31) < amount) takeInternalDamage(); amount -= 32; }` after the hit reaches the energy bank. It runs on both damage sources: `takeEnergyDamage` (`PlayerEntity.m` 5684-5697, only while energy stays above 0) and `takeScrapeDamage` (`PlayerEntity.m` ~5745-5752, collisions). Every draw comes from a seeded, frame-rate-independent stream. The simulation emits events and the app commits the profile in one atomic update (roadmap SC1).
- **D-02:** `takeInternalDamage` (`PlayerEntity.m` 6097-6185) is ported as one die roll over `n_considered = (maxAvailableCargoSpace + mass/10000) * ship_trade_in_factor / 100`, with its three branches in order: cargo, then equipment (the die reversed), then cosmetic.
- **D-03:** Damageable items follow Oolite's rule: an installed item with `damage_probability > 0` (default 1.0), never a missile or mine (`OOEquipmentType.m` 247, 504-520). Lasers are not equipment items in Oolite and are never internally damaged. `EQ_CARGO_BAY` and `EQ_PASSENGER_BERTH` carry `damage_probability = 0`. Within today's F3 set that leaves `EQ_DOCK_COMP`, `EQ_GAL_DRIVE`, `EQ_ADVANCED_COMPASS` and `EQ_ADVANCED_NAVIGATIONAL_ARRAY`. `damage_probability` is compiled from `equipment.plist` behind the strict schema, the golden and the drift gate.

#### Cargo loss branch
- **D-04:** Port the cargo branch. When `damage_to < cargo container count`, one container is destroyed and removed from the hold, the HUD shows Oolite's `"@-destroyed"` = `"%@ destroyed."` with the commodity's display name (4.5 s, after clearing the previous message), and no equipment is damaged on that roll. It goes through the same event and the same atomic profile update as equipment damage. The odds match Oolite, so FIDELITY.md gets no divergence row for this branch. Research must establish how Oolite's in-flight `cargo` array maps onto Wegolite's hold: one pod per tonne for t-unit goods; how kg and g goods are grouped into pods; which pod index `damage_to` selects. The pod order must be deterministic. — **Reversibility:** reversible

#### Hull wear (cosmetic branch) and the trade-in factor
- **D-05:** `ship_trade_in_factor` is a constant 100. It is not persisted, never changes, and the cosmetic branch (`(damage_to & 7) == 7 && factor > 75` → `factor--`) is not ported. Record this as a divergence row in FIDELITY.md, with a todo that ties it to `EQ_RENOVATION` and the fuel-price effect as one later piece of work. The factor of 100 still enters `n_considered`, so the cargo and equipment odds are exact for a ship in Oolite's new-ship state. — **Reversibility:** reversible — porting later adds one saved field and its own save bump.

#### A breakdown while the item is in use
- **D-06:** Behave as Oolite does:
  - Docking computer damaged while the autopilot is engaged: the autopilot disengages (`ShipEntity.m` ~3327-3330, `disengageAutopilot`, `"autopilot-off"` = `"Autopilot disengaged."`) and the player flies the rest of the approach by hand. A damaged docking computer cannot be engaged at all (roadmap SC2).
  - Galactic hyperdrive damaged during the galactic jump countdown: the jump is aborted, as in `PlayerEntity.m` 3432-3440 ("damaged gal drive? abort!"). A damaged drive cannot start a galactic jump.
  - Advanced compass damaged: the compass falls back to basic mode (`PlayerEntity.m` 10256-10260).
  - ANA damaged: the chart stops showing what the ANA provides.

  Only the effects these items already have in Wegolite need the check. Research lists which of them exist today (`src/sim/flight/step.ts` reads the docking computer and the advanced compass from the equipment set).

#### Texts
- **D-07:** Use Oolite's strings verbatim, with one exception:
  - HUD: `"@-damaged"` = `"%@ damaged."` (4.5 s, after clearing the previous message) and `"@-destroyed"` for cargo.
  - F3 row: `"equip-repair-@"` with a real space, shown as `Repair: Docking Computers`. Oolite's leading space is only its own alignment, and the missing space after the colon is not copied.
  - F3 detail: `"upgradeinfo-@-price-is-for-repairing"` = `"%@ (Price is for repairing the existing system)."`.
  - F5: damaged items are listed first, as `<name> (damaged)` instead of Oolite's `"equipment-@-not-available"` = `"%@ (N/A)"`, which reads as "not for sale". This is one deliberate UI divergence row in FIDELITY.md.

#### Repair (carried from the Oolite source)
- **D-08:** The repair price is 50 % of the catalogue price (`tryBuyingItem`, `PlayerEntity.m` 9115-9118). It is a new allow-listed entry on the F3 money path (the visible set grows by the repair rows), and an unaffordable repair is refused with its reason like any other purchase.
- **D-09:** A damaged item is offered for repair at a system one tech level lower than buying it requires (`PlayerEntity.m` 8270-8271). The same raw-tech-level rule as purchase applies.
- **D-10:** A repair is applied at once, with no repair time and no clock advance (D-12 carried from Phase 5; Oolite's `repairTime` is not ported).

#### Saves (carried from the roadmap)
- **D-11:** Schema v5 adds `damagedEquipment`. A damaged item lives only there. It is removed from `equipment` and is never the `_DAMAGED` suffix key, which the validator keeps rejecting. There is no migration: v1-v4 saves go through the existing unreadable path. The worst case (every damageable item damaged, at maximum lengths) has a size test under `MAX_SAVE_CHARS` (65,536). The damage becomes durable at the existing autosave triggers (dock, hyperspace arrival); there is no new write on damage. The same applies to cargo lost to D-04. — **Reversibility:** one-way — older saves are rejected, which is accepted for the alpha.

#### Divergence policy
- **D-12:** The project-wide fidelity rule applies (AGENTS.md "Fidelity rule"; PROJECT.md Key Decisions row "Diverge from Oolite where it is clearly better and the reviewer models agree", 2026-11-21). A divergence needs a concrete benefit, the reviewer models' agreement and a FIDELITY.md row. D-07's "(damaged)" and the space in "Repair: X" are its first instances.

### Claude's Discretion
- The seeded stream and how it is keyed. It must be deterministic at 30, 60 and 144 Hz, with its own draws so existing streams and goldens do not shift.
- The fixed iteration order for the weighted equipment pick (Oolite iterates an `NSDictionary`, whose order is not defined). Pick a stable order, such as catalogue or profile order, and record it.
- The event names and payloads, the event router row, the probe shape and the HUD closed-set additions.
- How Oolite's `randf()` for the weighted pick maps onto the stream.
- The plan split and the hook-spawned CBT-08 fight scenario.

### Deferred Ideas (OUT OF SCOPE)
- Hull wear (`ship_trade_in_factor`), `EQ_RENOVATION` and the fuel-price effect, as one later piece of work. Record a todo when D-05 lands.
- Reviewed todos not folded: `2026-11-11-cargo-purchase-cost-basis-tracking.md` (needs its own ordered save bump after v5, stays unscheduled); about 30 keyword-matched todos (HUD, collisions, NPC, CI) none of which is about equipment damage or repair.
- Not in this phase: player death (Phase 20), hull wear and `EQ_RENOVATION`, NPC equipment damage, heat damage, any new equipment for sale.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CBT-08 | A ship at zero energy explodes into wreckage, alloy plates and cargo pods...; internal hits damage the player's equipment. (Phase 19 completes the internal-damage clause.) | Sections "The roll, exactly", "Stream design", "Pod list", "Event + atomic update", "CBT-08 scenario" |
| CBT-12 | Damaged equipment is shown as damaged and can be repaired at F3 at Oolite's repair price. | "F3 repair door", "F5 list", "Repair price", "HUD messages" |
| SAVE-09 | Saves move to schema v5 with `damagedEquipment`, no migration; a damaged item does not count as installed. | "Save schema v5", "Worst-case size", "Installed-set consumers" |
</phase_requirements>

## Summary

The port is small in simulation terms and wide in plumbing. Oolite's rule (`takeEnergyDamage`/`takeScrapeDamage` loop, then `takeInternalDamage`) is fully read; it needs three inputs the sim does not have today: the installed items with their compiled damage probability, the hold's pod list, and a seeded stream. All three can be handed to the ledger as read-only per-step facts in `CombatOptions` (the same pattern as `mounts`, `hulls`, `debris`), so no sim module imports the profile type. The sim emits two new events (`equipmentDamaged { key }`, `cargoDestroyed { commodity, amount }`); a new app subscriber commits one immutable profile replacement per event through the existing `commitProfile`, and `hudMessages` prints Oolite's strings. Because a damaged key simply leaves `profile.equipment`, every existing "installed" consumer (`options.equipment.has(...)`) sees it as absent with no new code.

Five findings change or sharpen the locked decisions and need the planner's attention before plans are written (details in "Open Questions" and the sections below): (1) Oolite's new-ship `ship_trade_in_factor` is **95**, not 100 (`PlayerEntity.m:1739`, default `:1063`), so D-05's constant 100 does not give "exact odds for a new ship"; (2) in Oolite `_equipment` is an `NSMutableArray` (insertion order), not an `NSDictionary`, so the weighted pick order is already defined and equals `profile.equipment` order; (3) Oolite's displayed repair row is `" Repair: Name "` (the `" %@ "` name wrapper supplies the space), so "Repair: Docking Computers" is Oolite-exact and needs **no** divergence row; (4) the D-06 in-use clauses have no in-use state in Wegolite today (instant Shift+C dock, no galactic jump, ANA has no consumer), only the compass fallback exists and it already reads the installed set; (5) the roadmap's "existing unreadable path" for v1-v4 saves is, in code, the `corrupt` classification (the `unreadable` status disables saving for the whole session).

**Primary recommendation:** Keep the roll in a new pure module `src/sim/combat/internal-damage.ts`, called from `applyLedger`'s player branch with a stateless per-tick stream `createRngState(mix32(forkSeed(world.worldSeed, PLAYER_ID, "damage"), player.tick))` (new purpose code 5), fed by a `CombatOptions.internalDamage` facts object built once per profile identity; commit damage and repair as immutable profile replacements with `damagedEquipment` disjoint from `equipment`; add `repair` as a separate allow-listed money door beside `checkFit`/`checkLaserFit`.

## Architectural Responsibility Map

Wegolite is a static client; the tiers are its own layers (AGENTS.md "Conventions").

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Internal-damage roll, pod pick, weighted pick, events | Simulation core (`src/sim/combat/`) | -- | Pure, fixed-step, deterministic; may not import Three.js, DOM or the profile type |
| Stream seed | Simulation core (`src/sim/rng.ts`) | -- | One-way seed contract lives there (`RNG_PURPOSE_CODES`) |
| Pod list from the manifest | Simulation core (`src/sim/economy/cargo.ts`) | App (supplies cargo + commodity units) | Hold accounting already lives there (`podsFor`, `holdPodsUsed`) |
| Applying damage to the profile (move key, remove pod) | Pure profile ops (`src/sim/player/`) | App session subscriber (commits) | Profile is app-owned and immutable; sim only reports |
| Per-item damage probability | Content build (`tools/oolite-ingest`) | Content loader/schema | Compiled behind strict schema, golden, drift gate |
| Repair price/tech/affordability, allow-list | Simulation core (`src/sim/player/outfitting.ts`) | UI model (`src/ui/station-model.ts`) | The F3 money path is a sim-side boundary; view model only presents |
| F3 repair row, F5 "(damaged)" list | UI model + shell (`src/ui/`) | App controller (confirm flow) | Presentation only |
| HUD message | App event router (`hudMessages`) | `MessageQueue` | Events carry no strings; app owns wording |
| Save v5 (`damagedEquipment`) | Persistence (`src/persistence/`) | App (`main.ts` allow-lists) | Strict schema + shared semantic validator |
| Installed-set consumers (dock computer, compass) | Simulation core (read `options.equipment`) | -- | Already read-only set per step; damaged key absent |

## Standard Stack

No new runtime or dev dependency. Everything is existing in-repo code plus the installed toolchain.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.6.7 `[VERIFIED: package.json]` | Strict save/equipment schemas | Already the trust boundary for every blob and catalogue |
| vitest | 5.0.5 `[VERIFIED: package.json]` | Unit/integration | Project test runner (Docker only) |
| fast-check | 4.10.2 `[VERIFIED: package.json]` | Totality property tests on new combat code | Established in `tests/sim/combat/*.property.test.ts` |
| TypeScript | 6.0.2 `[VERIFIED: package.json]` | Strict typing, `tsconfig.sim.json` zone | -- |
| Playwright | repo-pinned `[VERIFIED: package.json scripts test:e2e]` | Opt-in browser smoke | Browsers baked in the image |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stateless per-tick stream (recommended) | Stateful combat-state stream hashed when non-pristine (PITFALLS 13's text) | A stateful stream draws on every bank hit even when nothing is damageable, so the pinned twin literals in `tests/app/session/tick-parity.test.ts` and `tests/e2e/combat.spec.ts` (bank energy, hash 60 ticks after the kill) would shift; stateless keeps every existing hash and snapshot byte-identical |
| New `damageFlow` router subscriber (recommended) | Extend `stationFlow` deps with `commitProfile` | Fewer touched tests, but `stationFlow` is documented as "launched, launchComplete and docked"; mixing profile commits into it blurs the closed set |

**Installation:** none. **Package Legitimacy Audit:** no external package is added or upgraded, so the audit table is empty (`gsd_run query package-legitimacy check` not needed). `[VERIFIED: package.json lines read]`

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | -- | -- | -- | -- | -- | No packages installed in this phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                 (sim, pure TS, fixed 120 Hz)                          (app, DOM allowed)
 NPC laser / test pilot ─┐
                          ├─► HitRecord{kind,target:PLAYER_ID,amount,sourcePosition}
 Phase 18 collision ─────┘            (resolveShots, combat/step.ts:746)
                                       │
                                       ▼
                    applyLedger(...) player branch (ledger.ts:160-179)
                      routeDamage / routeScrapeDamage  ──►  result.applied (amount past the shield)
                                       │  events: shipHit
                    laser kind: only if combat.energy > 0 after the hit (Oolite 5688)
                    scrape kind: always (Oolite 5746)
                                       ▼
        for (a = applied; a > 0; a -= 32)  gate: floor(u*32) < a   ◄── stream: createRngState(
                                       │                                   mix32(forkSeed(worldSeed,PLAYER_ID,"damage"), tick))
                                       ▼  takeInternalDamage (working copies of items + pods)
        n = floor((capacityPods + floor(PLAYER_MASS_KG/10000)) * F / 100)
        d = floor(u*n)
          d < pods.length ─► pod d destroyed ─────────────► event cargoDestroyed{commodity,amount}
          else d' = n-(d+1); d' < #damageable ─► weighted pick (u*sumOdds over items in profile order)
                                              ─► event equipmentDamaged{key}
          else (cosmetic branch, not ported: D-05)
                                       │  SimEvent[] returned by stepSim
                                       ▼
        sim-driver.stepOnce  ──► router.dispatch(event)  (sim-driver.ts:204)
                                       │
              EVENT_KIND_SUBSCRIBER:  damageFlow ──► commitProfile(next)  (one immutable replace)
                                      hudMessages ─► clearPrevious(); enqueue("%@ damaged.", 4.5)
                                       ▼
        ctx.core.profile (new object) ─► equipmentSet() cache invalidates by array identity
                                       ─► next step: options.equipment lacks the key (dock computer, compass)
                                       ─► F5 "(damaged)" first, F3 "Repair: X" at half price
                                       ─► autosave at dock / hyperspace arrival writes save v5 damagedEquipment
```

### Recommended Project Structure
```
src/sim/combat/internal-damage.ts   # NEW: the roll (pure, total), constants with Oolite file:line
src/sim/combat/ledger.ts            # EDIT: player branch calls the roll after routeDamage/routeScrapeDamage
src/sim/combat/step.ts              # EDIT: CombatOptions.internalDamage; build roll context in resolveShots
src/sim/events.ts                   # EDIT: equipmentDamaged, cargoDestroyed (non-reserved kinds)
src/sim/rng.ts                      # EDIT: RngPurpose "damage" = 5 (+ pinned vector in tests/sim/rng.test.ts)
src/sim/economy/cargo.ts            # EDIT: holdPods(cargo, commodities) = Oolite's loadCargoPodsForType order
src/sim/player/profile.ts           # EDIT: PlayerProfile.damagedEquipment, newProfile()
src/sim/player/damage.ts            # NEW (or inside profile.ts): applyEquipmentDamaged, applyCargoDestroyed (identity on refusal)
src/sim/player/outfitting.ts        # EDIT: REPAIRABLE_EQUIPMENT_KEYS, checkRepair/applyRepair, repairFitKey parse; checkFit refuses a damaged key
src/persistence/save.ts, autosave.ts# EDIT: SaveV5, damagedEquipment, validator, encode/snapshot/profileFromSave
src/content/schemas/equipment.ts    # EDIT: damageProbability (strict)
tools/oolite-ingest/convert/equipment.ts  # EDIT: compile damageProbability (+ test, golden, manifest via assets build)
src/app/session/event-router.ts     # EDIT: 2 routed kinds, new damageFlow subscriber, hudMessages arms
src/app/session/step-options.ts     # EDIT: internalDamage facts input
src/ui/station-model.ts             # EDIT: F3 repair row/detail, F5 damaged list
```

### Pattern 1: The roll, exactly (D-01, D-02)
**What:** Port both Oolite loops and `takeInternalDamage` with these verified facts.

Oolite source, read this session (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m`; the four source files `PlayerEntity.m`, `PlayerEntity.h`, `ShipEntity.m`, `OOEquipmentType.m` have **no diff** between the pinned commit `7437f22` and the checkout HEAD, so these line numbers are pin-valid `[VERIFIED: git diff --stat 7437f22 HEAD empty]`):
- `PlayerEntity.h:331`: `#define PLAYER_INTERNAL_DAMAGE_FACTOR 31`.
- `takeEnergyDamage` 5599-5700: after the shield drain `amount` is what reached the bank; `if (energy <= 0.0) { ...getDestroyedBy... } else { while (amount > 0.0) { internal_damage = ((ranrot_rand() & PLAYER_INTERNAL_DAMAGE_FACTOR) < amount); if (internal_damage) { [self takeInternalDamage]; } amount -= (PLAYER_INTERNAL_DAMAGE_FACTOR + 1); } }` (5686-5697). The loop runs only on the `else` of the lethal test.
- `takeScrapeDamage` 5701-5753: shield drain, `[super takeScrapeDamage:amount from:ent];`, then the same `while (amount > 0.0)` loop (5746-5752) **unconditionally** (not gated on energy).
- `takeInternalDamage` 6097-6185, quoted in full below in "Code Examples".

Mapping to Wegolite:
- `amount` = `DamageResult.applied` from `routeDamage`/`routeScrapeDamage` (`shields.ts:97-103, 159-179, 199-212`: "The damage that got past the shield, before energy floors at 0"). A fully absorbed hit has `applied: 0` and the loop never runs.
- Laser records roll only if `combat.energy > 0` after `routeDamage`. Wegolite floors energy at 0 (`shields.ts:169`), Oolite's `energy <= 0.0` is therefore exactly `combat.energy === 0` here. Scrape records roll regardless (Oolite 5746). Phase 20 will make energy 0 lethal and must keep the laser-side gate.
- `ranrot_rand() & 31` = `Math.floor(rngNext(s) * 32)`; `ranrot_rand() % n` = `Math.floor(rngNext(s) * n)`; `randf()` = `rngNext(s)`. This is the repo's own convention `[VERIFIED: src/sim/world/debris.ts:10-11 "Oolite's `Ranrot() % N` and `ranrot_rand() % N` are `Math.floor(u * N)` and `randf()` is `u`"]`. Oolite's `randf` is `(Ranrot() & 0xffff) / 65536` (`legacy_random.c:142-144`) so a float64 `u` is strictly finer; record this in the ledger comment.
- `int < double` comparison: `Math.floor(u*32) < a` with fractional `a` matches C (`5.5` admits draws 0..5).
- Draw order per hit: one gate draw per loop iteration; on a gate pass: one die draw (`ranrot_rand() % n_considered`, skipped when `n_considered == 0`), then, only when the equipment branch is reached with `damage_to < damageableCounter`, one `randf()` pick draw.

### Pattern 2: Stream design (Claude's discretion; recommendation)
**What:** A stateless per-tick stream, created lazily inside `applyLedger` the first time a player record needs a roll:
`seed = mix32(forkSeed(world.worldSeed, PLAYER_ID, "damage"), player.tick >>> 0)`; `const rng = createRngState(seed)`; draws are sequential across the tick's player records in ledger order (ascending shooter id, already deterministic, `ledger.ts:11-12`).

Why (evidence):
- `forkSeed(worldSeed, entityId, purpose)` needs an integer uint32 `entityId` and a key of `RNG_PURPOSE_CODES` (`rng.ts:131-142`); `PLAYER_ID = 100` and dynamic ids start at 101 (`ids.ts`), so `(worldSeed, 100, purpose)` collides with no entity stream. `RNG_PURPOSE_CODES` is `{ world: 1, ai: 2, combat: 3, cargo: 4 }` with the contract "Looked up by key, never iterated ... adding a purpose cannot renumber another" (`rng.ts:82-88`). Add `damage: 5` and a pinned literal vector in `tests/sim/rng.test.ts`. The `"cargo"` purpose (plan 15-03) is the precedent for a stateless purpose "never stored on an entity" (`rng.ts:69-74`).
- Nothing new is stored, hashed, serialised or snapshotted: `hashWorld` (`serialize.ts:258-295`), `isNeverSpawned`, the world snapshot codec and `isPristineCombat` are untouched, so **no golden, twin literal or acceptance hash shifts** even though the roll draws on every bank hit. This matters because the existing fights already push about 30 hits through the bank (`tick-parity.test.ts:640-690` documents 6-point hits, 52 shots, bank at kill 83.8) and every one would draw from a stateful hashed stream even with an empty profile.
- `player.tick` increments once per fixed step (`flight/state.ts:39` field, `stepFlight` advances it) so the key is identical at 30, 60 and 144 Hz render cadence; the cadence proof pattern is `src/sim/cadence.test.ts` / `tests/sim/flight-cadence.test.ts` (tick-indexed log, hashes equal across `[30, 60, 144]`).
- It touches `src/sim/rng.ts` and `src/sim/combat/**` only, not `src/sim/npc/**` or `src/sim/world/**`, so the AGENTS.md hand-run NPC acceptance run is **not** triggered `[VERIFIED: AGENTS.md "Docker workflow" paragraph on test:acceptance]`.

The sim must skip the roll (no event, no draw) when there is no world, no `options.combat.internalDamage`, or no combat state. That keeps every existing `applyLedger` test, the acceptance harness and the frozen twins byte-identical, because none passes the new facts.

### Pattern 3: Per-step facts (read-only, like `mounts`)
Add `readonly internalDamage?: InternalDamageFacts` to `CombatOptions` (`combat/step.ts:118-146`, same "derived from the profile and the loaded content and never carried in a command" rule):

```ts
interface InternalDamageFacts {
  /** profile.equipment order (= Oolite's _equipment insertion order), with the compiled probability. */
  readonly items: readonly { readonly key: string; readonly damageProbability: number }[];
  /** maxAvailableCargoSpace: capacityPodsFor(equipment, passengerBerths) (cargo.ts:117-124). */
  readonly capacityPods: number;
  /** Oolite's in-flight cargo array, see Pattern 4. */
  readonly pods: readonly { readonly commodity: string; readonly amount: number }[];
}
```
`buildStepOptions` runs every step (`sim-driver.ts:159-188`) at 120 Hz: cache the derived arrays on `ctx.core` keyed by the profile object identity (the same trick as `equipmentSet()`, `station-controller.ts:208-214`, which keys on the `profile.equipment` array identity because profiles are immutable and replaced on change). Absent when the equipment catalogue has not loaded (`ctx.core.equipmentCatalogue` undefined): then no roll, never a guessed probability.

Inside the roll keep **working copies** of `items` and `pods`: a tick can hold several player records and a loop of several iterations; the second roll must not pick an item the first one just damaged or a pod it just destroyed. The app applies the emitted events in order, so profile and working copies stay consistent. Cross-tick consistency is guaranteed because the app replaces the profile after each step's events and the facts are rebuilt from the new profile identity.

### Pattern 4: Oolite's `cargo` array = the pod list (D-04, answers the research question)
Oolite loads the player's hold into the `cargo` array at launch and unloads at dock (`PlayerEntity.m:6425` `[self loadCargoPods]`; `:6336` `[self unloadCargoPods]`). `loadCargoPods` (410-418) iterates `[shipCommodityData goods]` and calls `loadCargoPodsForType:fromManifest:` (299-357). `goods` is sorted ascending by the commodity's `sortOrder` (`OOCommodityMarket.m:66-73, 341-350` `goodsSorter`), which is the compiled commodity `sortOrder`: food 100, textiles 200, radioactives 300, slaves 400, liquor_wines 500, luxuries 600, narcotics 700, computers 800, machinery 900, alloys 1000, firearms 1100, furs 1200, minerals 1300, gold 1400 (kg), platinum 1500 (kg), gem_stones 1600 (g), alien_items 1700 (not tradeable) `[VERIFIED: src/content/generated/commodities.json read via node]`.
- Unit `t`: `quantity` pods of 1 t each (`for (j = 0; j < quantity; j++) createCargoPodWithType:type andAmount:1`).
- Unit `kg`/`g`: the first 499 kg / 499,999 g stay in the manifest "safe" (no pod); the rest is split into pods of 1000 kg / 1,000,000 g, full pods first, the last pod takes the remainder ("last pod gets the dregs"); a quantity that is an exact multiple of the pod size yields no empty pod. Quantity <= the safe amount makes no pod.
- This equals Wegolite's existing `podsFor` pod count: `floor((podSize - safe - 1 + quantity) / podSize)` (`cargo.ts:26-27, 57-63`; constants `KILOGRAMS_PER_POD = 1000`, `MAX_KILOGRAMS_IN_SAFE = 499`, `GRAMS_PER_POD = 1_000_000`, `MAX_GRAMS_IN_SAFE = 499_999`). Add `holdPods(cargo, commodities)` to `cargo.ts` (not a new economy file: `tests/guards/economy-purity.test.ts:39-44` pins the four economy files `cargo.ts, market.ts, ranrot.ts, trade.ts`), returning `{commodity, amount}[]` in `sortOrder` order, per commodity full pods then the dregs pod, and assert `holdPods(...).length === holdPodsUsed(...)`.
- `damage_to` indexes that array directly (`[cargo objectAtIndex:damage_to]`, 6106). Destroying pod `i` subtracts its `amount` from `profile.cargo[commodity]` (zero entries removed, `setCargo` in `cargo.ts:178-189`). Re-deriving the list from the reduced quantity gives the same multiset Oolite's remaining pod objects have (k full pods plus an optional dregs pod), so the working copy and a later re-derivation agree; add a property test for this.
- `n_cargo` of `n_considered` is `maxAvailableCargoSpace` = `max_cargo - equipment_weight` (`ShipEntity.m:7198-7201`), i.e. hold **capacity**, not pods carried: `capacityPodsFor(equipment, passengerBerths)` = 20, +15 with `EQ_CARGO_BAY`, -5 per berth (`cargo.ts:117-124`). `n_mass = [self mass] / 10000` with `mass` the constant hull mass (`Entity.m:671`, set at setup `ShipEntity.m:419/1077`), `PLAYER_MASS_KG = 214_737.6875` (`constants.ts:171`), truncated to 21 by the `unsigned` assignment. So `n_considered` is `(20 + 21) * F / 100` = 41 at F=100 (38 at F=95), 56 with the bay at F=100 (53 at F=95).

### Pattern 5: Equipment pick order (answers the discretion item, and corrects CONTEXT)
Oolite's `equipmentEnumerator` is `[_equipment objectEnumerator]` (`ShipEntity.m:3257-3260`) and `_equipment` is an `NSMutableArray` (`ShipEntity.h:447`, allocated `ShipEntity.m:3228`), appended on add (`ShipEntity.m` `addEquipmentItem`: `[_equipment addObject:equipmentKey]`). CONTEXT says `NSDictionary`; it is an ordered array. So the pick iterates **purchase (insertion) order**. Wegolite's `profile.equipment` is append-on-purchase (`profile.ts:221`) and persisted in order (`autosave.ts:123` `equipment: [...profile.equipment]`), so iterating `profile.equipment` is exact, not merely "a stable order". A repaired item is appended last in Oolite (`addEquipmentItem` after removing `_DAMAGED`, `ShipEntity.m` 3195-3250) and `applyRepair` should append likewise. In Oolite the `_DAMAGED` entries sit in the same array but contribute probability 0 (nil type), so omitting them is equivalent. Record "profile order = Oolite insertion order" in the code comment; no FIDELITY row.

The weighted pick, verbatim logic: `damageableCounter` = installed items with `canBeDamaged`; `damageableOdds` = their summed probability; equipment branch only if `damage_to < damageableCounter` (with `damage_to = n_considered - (damage_to + 1)`); `target = randf() * damageableOdds`; walk all installed items accumulating `damageProbability` and take the first with `accumulator > target`. Wegolite compiled data: only the four F3 items have probability 1.0, so the pick is a uniform choice among installed damageable items.

### Pattern 6: Event + atomic update (Pitfall 13, 22)
- Events (non-reserved kinds, like `laserRefused`; the 15-kind `RESERVED_EVENT_KINDS` pin in `events.ts:215-231` is untouched): `{ kind: "equipmentDamaged"; key: string }` and `{ kind: "cargoDestroyed"; commodity: string; amount: number }`. No ids, no strings (events.ts header: "No UI copy lives here").
- Emitted from `applyLedger` right after the record's `shipHit`, in roll order. Update the event-order doc in `resolveShots` (`step.ts:739-741`).
- Router: add both to `ROUTED_EVENT_KINDS` (22 -> 24, `event-router.ts:65-91`) and the `Record<RoutedKind, ...>` table (typecheck forces completeness). Recommended rows: `equipmentDamaged: ["damageFlow", "hudMessages"]`, `cargoDestroyed: ["damageFlow", "hudMessages"]`, with a new gameplay subscriber `damageFlow` inserted in `EVENT_SUBSCRIBER_ORDER` (`event-router.ts:41-47`, currently `stationFlow, worldLifecycle, hudMessages, dockFeedback, hyperspaceFlow`) as `stationFlow, worldLifecycle, damageFlow, hudMessages, dockFeedback, hyperspaceFlow` so the profile commits before the message is printed. Touched pins: `tests/app/session-order.test.ts` (order, the literal table, `toHaveLength(22)`, the "twenty kinds have one subscriber" loop at lines 150-170), every `createEventRouter(ctx, {...})` call in tests (`session-order`, `world-lifecycle`, `tick-parity`, `sim-driver`, `event-router-ident`; the type `EventRouterSubscribers` requires every gameplay subscriber) and the harness in `tick-parity.test.ts:120-310` which stubs subscribers with `quiet`. The lower-churn alternative (commit inside `stationFlow` by adding a `commitProfile` dep; used by `createStationFlow` in `game-session.ts:447` and `render-driver.test.ts:1253`) conflates a closed set; recommend the new subscriber.
- `damageFlow` calls the pure profile op then `commitProfile(next)` (`station-controller.ts:746-752`: identity check, replace `ctx.core.profile`, `onProfileChanged`, `renderStation()`); a refused op returns the same object and commits nothing. `equipmentSet()` (`station-controller.ts:208-214`) then rebuilds because the `equipment` array identity changed.
- HUD (`hudMessages`): `messages.clearPrevious(); messages.enqueue(text, 4.5)` (both exist on `MessageQueue`, `messages.ts:60-95`; `hyperspaceRefused` is the pattern, `event-router.ts:420-431`). Texts: `%@ damaged.` with the catalogue `name` (`ctx.core.equipmentCatalogue`, e.g. "Docking Computers"), `%@ destroyed.` with the commodity `name` (`ctx.core.commodities`). Oolite posts the damaged message only if the item is really damaged (`PlayerEntity.m:6165-6171`); here the sim only emits for an item it picked from the installed list. No throttle (Oolite has none); `CombatMessageKind` (`context.ts:102-119`) stays unchanged.
- Pinned strings, vendored copy lines (the vendored `descriptions.plist` is the licence-audited input and its line numbers differ from the checkout HEAD cited in CONTEXT): `third_party/oolite/Config/descriptions.plist` 494 `"autopilot-off" = "Autopilot disengaged.";`, 895 `"@-damaged" = "%@ damaged.";`, 896 `"@-destroyed" = "%@ destroyed.";`, 1584 `"equipment-@-not-available" = "%@ (N/A)";`, 1846 `"equip-repair-@" = " Repair:%@";`, 1847 `"upgradeinfo-@-price-is-for-repairing" = "%@ (Price is for repairing the existing system).";` `[VERIFIED: rg on the vendored file]`. Follow the `OUTFITTING_EMPTY_TEXT` pattern (literal in app + a test that reads the vendored plist, `station-model.ts:810-818`).
- `tests/guards/hud-message-length.test.ts` scans every string literal of the HUD subscriber and compiled-content-built messages against `MAX_MESSAGE_CHARS` (60). Extend its content loops to the new templates over every catalogue item name and commodity name (longest candidate "Advanced Navigational Array damaged." is 36 characters).

### Pattern 7: F3 repair door (D-08, D-09, D-10; the money-path closed set)
Facts read: `VISIBLE_EQUIPMENT_KEYS` is `["EQ_FUEL","EQ_CARGO_BAY","EQ_DOCK_COMP","EQ_GAL_DRIVE","EQ_ADVANCED_COMPASS","EQ_ADVANCED_NAVIGATIONAL_ARRAY","EQ_MISSILE","EQ_PASSENGER_BERTH","EQ_PASSENGER_BERTH_REMOVAL","EQ_MISSILE_REMOVAL"]` (`outfitting.ts:74-85`); `SINGLE_INSTANCE_KEYS` is `EQ_CARGO_BAY, EQ_DOCK_COMP, EQ_GAL_DRIVE, EQ_ADVANCED_COMPASS, EQ_ADVANCED_NAVIGATIONAL_ARRAY` (`:93-99`); `checkFit`/`applyFit` refuse anything outside the visible set with `notOffered` (`:331-333`); lasers have their own door with composite `key@facing` row keys and `parseLaserFitKey` (`:521-563`).
Recommended shape (same pattern as the laser door, so the allow-list stays a money-path invariant, not a display filter):
- `REPAIRABLE_EQUIPMENT_KEYS = ["EQ_DOCK_COMP","EQ_GAL_DRIVE","EQ_ADVANCED_COMPASS","EQ_ADVANCED_NAVIGATIONAL_ARRAY"] as const` (literal allow-list) plus a test that it equals {`SINGLE_INSTANCE_KEYS` with compiled `damageProbability > 0`} read from the real catalogue, so a future edit cannot drift.
- Composite F3 row key for the repair row, parsed strictly through that allow-list (forged keys such as `EQ_ECM`, `EQ_CARGO_BAY`, a laser, an unknown suffix must return `null`), mirroring `parseLaserFitKey`.
- `checkRepair(profile, item, ctx)` order: allow-list -> valid price (`isValidPrice`, `profile.ts:147-151`) -> key present in `profile.damagedEquipment` (new reason, e.g. `notDamaged`) -> tech rule -> credits. `applyRepair` re-runs `checkRepair`, returns the same profile on refusal, otherwise moves the key from `damagedEquipment` to the **end** of `equipment` and charges the repair price. No clock advance (D-10).
- `checkFit` must refuse a purchase of a key that is currently damaged (a new `FitRefusal`, which must also be classified in `LISTED_REFUSALS` at `outfitting.ts:157-170` as hidden, and given short copy in `fitReason`, `station-model.ts:826-853`); otherwise the player could buy a second copy at full price while the repair row exists, and the profile would hold the key in both lists. In Oolite the repair row **replaces** the purchase row for that item (`PlayerEntity.m:8383-8398`), so `buildOutfittingModel` (`station-model.ts:915-1051`) should emit the repair row in the same position as the purchase row would have had, via `checkRepair` instead of `checkFit`.
- Price: Oolite halves in double (`price /= 2.0`, `tryBuyingItem` 9115-9118) then `credits -= price` truncates the credit balance, so an odd price costs `ceil(price / 2)`. All four items are even (compiled prices 6500, 22500, 15000, 50000 `[VERIFIED: src/content/generated/equipment.json via node]`) so the rounding is unobservable; implement `Math.ceil(price / 2)` fail-closed with `isValidPrice` and pin the four values (E-17 style "unobservable" note).
- Tech rule: Oolite lowers the minimum by one for a damaged item when it is non-zero (`PlayerEntity.m:8268-8272`, "if you have a damaged system you can get it repaired at a tech level one less than that required to buy it") and compares against the system's raw tech level; `canPurchase` already compares `techLevelRaw < item.techLevel` (`profile.ts:175-186`). Compiled tech levels: EQ_DOCK_COMP 9, EQ_GAL_DRIVE 10, EQ_ADVANCED_COMPASS 7, EQ_ADVANCED_NAVIGATIONAL_ARRAY 6 -> repair at raw TL >= 8, 9, 6, 5. **Lave is raw TL 4** (`profile.ts` header comment "Lave (raw 4) refuses a TL 9 item"), so no damaged item is repairable at Lave and the F3 list simply omits the row (`isListedForPurchase`: only a credit shortfall keeps a row listed, `outfitting.ts:157-194`). Repair tests need a TL >= 8 system fixture. The unported "bargain tech days" (todo `2026-11-18-outfitting-bargain-tech-days.md`) are not part of this phase.
- Row copy (D-07): label `Repair: <name>`; detail `<description> (Price is for repairing the existing system).` (`PlayerEntity.m:8570-8573`, `upgradeinfo-@-price-is-for-repairing`); the F3 confirm prompt is Wegolite's own `Buy ${row.name} for ${cost}? [Y/N]` (`station-controller.ts:708`), so a repair row needs a "Repair ... ? [Y/N]" verb; make the verb a model field instead of hard-coding. The unaffordable refusal reuses `Not enough credits`.
- `lastTrade.kind` (`probe.ts:185-190`: `"buy" | "sell" | "fit" | "removal"`) needs `"repair"` for the probe/e2e (the shape fixture is value-free so a union widening does not change `tests/fixtures/probe-shape.json`).
- `?test=1` seam `applyTestEquipment` (`probe-publisher.ts:325-335`) must refuse a key that is currently damaged; do not add a debug path that damages equipment (Pitfall 13).

### Pattern 8: F5 list (D-07)
`buildStatusModel` (`station-model.ts:552-632`) builds `equipment: string[]` from `profile.equipment` names, then missiles, berths, lasers. Prepend `${name} (damaged)` for each `profile.damagedEquipment` entry (damage order), then the rest. Oolite lists damaged first (`equipmentList`, `PlayerEntity.m:7144-7248`, "list damaged first, then working") but with `(N/A)`; the "(damaged)" wording is the one UI divergence (D-07). The shell already hides the heading only when the list is empty (`station.ts:324-330`).

### Anti-Patterns to Avoid
- **A stateful hashed damage stream:** shifts every pinned fight literal (see Alternatives).
- **Storing `KEY_DAMAGED` strings anywhere:** keep damage in its own field; `damagedEquipment` and `equipment` must be disjoint, enforced in `validateSaveSemantics` and by the profile ops.
- **Letting the sim see the profile type or the catalogue:** pass facts (`items`, `capacityPods`, `pods`) in `CombatOptions`; the sim may import only `content/types.ts` type-only (`tests/guards/content-boundary.test.ts`).
- **A third copy of the installed check:** read `options.equipment` as today; nothing else.
- **Rolling on a lethal laser hit:** Oolite rolls only in the `else` of `energy <= 0`.
- **Mutating the shared facts inside the roll:** copy first, so a replayed tick is a pure function of `(facts, tick, records)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded draws | A new PRNG or `Math.random`/`Date` | `rngNext`, `createRngState`, `forkSeed`, `mix32` (`rng.ts`) | `sim-determinism-bans` guard; one-way seed contract |
| Hold accounting / pod counts | A parallel pod rule | `podsFor`, `holdPodsUsed`, `capacityPodsFor` + new `holdPods` beside them | One cargo rule; `podsFor` already equals Oolite's pod count |
| Save validation | Hand checks on the parsed blob | The shared `validateSaveSemantics` used by reader and writer (`save.ts:633-757`) | The writer gate (`isEncodedSaveValid`) must reject what the reader rejects (T-05-19, T-06-36) |
| Money checks | Inline credit arithmetic in the UI | `isValidPrice`, `isSafeCredits`, the `check*`/`apply*` pattern returning the same object on refusal | Atomic, identity-comparable, fail-closed |
| HUD wording plumbing | A new HUD element | `MessageQueue.clearPrevious` + `enqueue`, strings in `hudMessages` | "No twelfth HUD element"; closed set (Pitfall 22) |
| Probe/event closed sets | Ad-hoc fields | Edit the typed table / union; extend the pinned tests intentionally | Typecheck enforces completeness |

**Key insight:** every piece except the roll itself already has an owner module; the phase is wiring plus two schema bumps (content record, save). Most risk sits in the pinned tests and goldens that must be updated deliberately.

## Runtime State Inventory

Omitted: this is not a rename/refactor/migration phase (the save bump is explicitly "no migration").

## Common Pitfalls

### Pitfall 1: D-05's factor is not the new-ship value
**What goes wrong:** With `ship_trade_in_factor = 100`, `n_considered` is 41 (56 with the bay); a new Oolite ship has 95 -> 38 (53). Equipment-damage odds are 100/95 = ~5-8 % too low relative to a fresh Oolite ship, and the CONTEXT claim "exact for a ship in Oolite's new-ship state" is false.
**Why:** `PlayerEntity.m:1739` `ship_trade_in_factor = 95;` in new-game setup and `:1063` default 95 for a loaded commander; 100 is reached only through `EQ_RENOVATION` (`:9287-9289`, capped at 100; `:6783` "force no misjumps on first jump" treats >= 100 as pristine) `[VERIFIED: PlayerEntity.m read]`.
**How to avoid:** Use one constant `SHIP_TRADE_IN_FACTOR` with the Oolite file:line comment and a pinning test (Pitfall 23). Recommend **95** (achieves D-05's stated purpose); if the owner keeps 100, the FIDELITY row must say the odds diverge and why (the fidelity rule forbids a silent divergence).
**Warning signs:** a plan that asserts "exact odds" and uses 100.

### Pitfall 2: Treating the roadmap's "unreadable path" literally
**What goes wrong:** In `parseSave` an unsupported numeric version falls to the final `else` and returns `corrupt` (`save.ts:593-597`: "A numeric version this build knows is historical/current ... positively this family, so corrupt"). `unreadable` is returned only for oversize, unparseable or no-numeric-version blobs (`:547, 554, 570`). The boot code makes `unreadable` untouchable: `canOverwrite` is only `absent|valid` (`save-controller.ts:97-99`), so choosing `unreadable` for an old v4 blob disables autosave for the whole session and New game cannot clear it (`canClear`, `:107-109`).
**How to avoid:** v1-v4 -> `corrupt` (backed up once, `shouldConfirmNewGame("corrupt")` true, New game clears and re-enables saving, `title.ts`). Add a parse test per old version. Flagged as Open Question 2.

### Pitfall 3: Worst-case size is tight if the damaged list is bounded like `equipment`
**What goes wrong:** Measured replica of the v4 worst case (64 equipment keys x 64 six-character-escaped chars, 17 cargo, 17 market goods, flight pose, 4 military lasers) is **40,583** characters; adding `damagedEquipment` with 64 such keys makes **65,372**, only 164 under `MAX_SAVE_CHARS = 65_536` `[VERIFIED: scratch script reproducing WORST_CASE_INPUTS of tests/persistence/save-v4.test.ts:545-606; arithmetic only, the Docker test is the authority]`. With 16 keys it is 46,796, with 8 it is 43,700.
**How to avoid:** Schema bound `MAX_SAVE_DAMAGED_EQUIPMENT` (recommend 16: far above the 4 damageable items and any foreseeable catalogue growth) plus a semantic rule `equipment.length + damagedEquipment.length <= MAX_SAVE_EQUIPMENT (64)` (the profile invariant: `purchase` refuses at 64, `profile.ts:214`), and a worst-case test that builds the schema-maximum shape. Do not rely on the 64 bound: the unscheduled cost-basis todo adds another field after v5.

### Pitfall 4: Stateful stream shifts pinned literals
See Alternatives. The twins' literals (`ENERGY_AT_KILL`, `ENERGY_AFTER_SHOOTING`, the debris twin's hash 60 ticks after the kill) are never to be edited to make a test pass (`combat.spec.ts` header).

### Pitfall 5: Unbounded roll loop
**What goes wrong:** `amount` is not capped by the energy bank (a hard collision can push thousands of points past the shield). Oolite loops `ceil(amount/32)` times; with a hostile or corrupted finite amount (1e9) that is 31 million iterations in one tick.
**How to avoid:** Keep Oolite's loop but clamp the iteration count (e.g. 256 iterations, comfortably above any Oolite-scale amount, noting that once every pod and item is gone further iterations change nothing); the ledger already skips non-finite and non-positive amounts (`ledger.ts:159`). Cover with a fast-check totality property (NaN, negative capacity, empty lists, huge amount, duplicate keys, probabilities NaN/negative -> treated as 0).

### Pitfall 6: Two records in one tick and the working copies
A tick can carry a laser record and a scrape record for the player. The second must see the first's outcome; the stream is shared and sequential in ledger order. Test: two records, first destroys the only damageable item, second must not re-damage it.

### Pitfall 7: Confirm prompt and row identity
`station-controller.ts` hard-codes `Buy ${row.name} for ...` and selects rows by `key`; a repair row for `EQ_DOCK_COMP` and the purchase row share the base key. Use a distinct composite row key, a model-supplied verb, and make `ensureOutfittingSelection`/position clamp work with it.

### Pitfall 8: Taint blocks the save proof in the hook fight
The `?test=1` hook taints the session and autosave refuses a tainted profile (`probe-publisher.ts:300-322`, `markHookMutation`). The hook-spawned CBT-08 fight therefore cannot prove durability in the same session. Prove "damaged after Continue/Load" with a v5 save fixture written through production `encodeSave` (`tests/e2e/helpers/save-fixtures.ts` pattern, which passes the strict boot reader and is untainted) and with Vitest save round trips.

### Pitfall 9: Required profile/save fields churn many test literals
`PlayerProfile.damagedEquipment` and `SaveInputs.damagedEquipment` and `SaveAllowLists.damageableEquipment` (recommended, so a forged non-damageable key such as `EQ_CARGO_BAY` is corrupt in `damagedEquipment`) are required fields. 17 files contain `passengerBerths:` literals (src: `cargo.ts, profile.ts, probe.ts, probe-publisher.ts, save.ts, autosave.ts`; tests: `player-profile, outfitting, station-outfitting, station-status, save-controller, save-v2/v3/v4, save, autosave, e2e save-fixtures`), and `SaveAllowLists` literals are built in `main.ts:178-195` and in several persistence tests. Budget a mechanical task for this.

### Pitfall 10: Save test and golden suite is large
`SAVE_VERSION = 4` today (`save.ts:64`) with schemas `SaveV1Schema..SaveV4Schema`, three `migrateV*` functions, goldens `tests/golden/save/{v1-*,v2-*,v3-*,v4-*}.json` (11 files) and tests `save.test.ts`, `save-v2/v3/v4.test.ts`, `save-golden.test.ts`, `autosave.test.ts`, `restore-drift.test.ts` (3,794 lines in `tests/persistence/`). "No migration" means removing the chain and its goldens (keeping at most a v4 literal fixture to prove rejection) and writing `save-v5.test.ts`, including the "older builds keep a v5 save inert" frozen-classifier test (transcribe the v4 build's two future-version checks with `SAVE_VERSION_V4 = 4`, as `save-v4.test.ts:620-660` did for v3) and the padded worst case read as `unreadable`.

### Pitfall 11: FIDELITY.md contract is strict
`tests/contract/fidelity.test.ts` requires per row: a `src/...:line` Wegolite cell whose line exists, an Oolite cell `src/Core/...:a-b` with exactly one `### E-nnn` excerpt of the same range (<= 20 lines, block length = range), fidelity `faithful` or `divergence: ... "<exact substring of a PROJECT.md Key Decisions row>"`. The last excerpt id today is **E-153**; new ids start at E-154. `takeInternalDamage` is 89 lines, so cite it in several rows (cargo branch 6097-6116, equipment pick, the damaged-key bookkeeping, cosmetic) of at most 20 lines each. Every divergence needs its Key Decisions row **first**.

## Code Examples

### The Oolite source being ported (verbatim, `PlayerEntity.m`)
```objc
// 5686-5697 (takeEnergyDamage, the non-lethal branch)
    } else {
        while (amount > 0.0) {
            internal_damage = ((ranrot_rand() & PLAYER_INTERNAL_DAMAGE_FACTOR) < amount); // base chance of damage to systems
            if (internal_damage) {
                [self takeInternalDamage];
            }
            amount -= (PLAYER_INTERNAL_DAMAGE_FACTOR + 1);
        }
    }

// 6097-6116 (takeInternalDamage, die and cargo branch)
- (BOOL)takeInternalDamage
{
    unsigned n_cargo = [self maxAvailableCargoSpace];
    unsigned n_mass = [self mass] / 10000;
    unsigned n_considered = (n_cargo + n_mass) * ship_trade_in_factor / 100; // a lower value of n_considered means more vulnerable to damage.
    unsigned damage_to = n_considered ? (ranrot_rand() % n_considered) : 0; // n_considered can be 0 for small ships.
    BOOL result = NO;
    // cargo damage
    if (damage_to < [cargo count]) {
        ShipEntity* pod = (ShipEntity*)[cargo objectAtIndex:damage_to];
        NSString* cargo_desc = [UNIVERSE displayNameForCommodity:[pod commodityType]];
        if (!cargo_desc)
            return NO;
        [UNIVERSE clearPreviousMessage];
        [UNIVERSE addMessage:[NSString stringWithFormat:DESC(@"@-destroyed"), cargo_desc] forCount:4.5];
        [cargo removeObject:pod];
        return YES;
    } else {
        damage_to = n_considered - (damage_to + 1); // reverse the die-roll
    }
```
(equipment pick 6117-6174 and cosmetic 6179-6184 are read in full; see Pattern 5.)

### The port skeleton (TypeScript, `src/sim/combat/internal-damage.ts`)
```ts
// Values in this skeleton: PLAYER_INTERNAL_DAMAGE_FACTOR 31 (PlayerEntity.h:331); PLAYER_MASS_KG
// (constants.ts:171 "export const PLAYER_MASS_KG = 214_737.6875;"); rngNext/createRngState (rng.ts:36, 27).
export function rollInternalDamage(
  applied: number,                 // DamageResult.applied: what got past the shield
  facts: WorkingFacts,             // mutable copies of items and pods, made once per ledger call
  rng: RngState,                   // stateless stream, see Pattern 2
  events: SimEvent[],
): void {
  if (!Number.isFinite(applied)) return;
  let rolls = 0;
  for (let amount = applied; amount > 0 && rolls < MAX_ROLLS; amount -= 32, rolls += 1) {
    if (Math.floor(rngNext(rng) * 32) < amount) takeInternalDamage(facts, rng, events);
  }
}

function takeInternalDamage(f: WorkingFacts, rng: RngState, events: SimEvent[]): void {
  const nConsidered = Math.floor(
    ((Math.max(0, f.capacityPods) + Math.floor(PLAYER_MASS_KG / 10_000)) * SHIP_TRADE_IN_FACTOR) / 100,
  );
  let damageTo = nConsidered > 0 ? Math.floor(rngNext(rng) * nConsidered) : 0;
  if (damageTo < f.pods.length) {            // cargo branch
    const [pod] = f.pods.splice(damageTo, 1);
    if (pod !== undefined) events.push({ kind: "cargoDestroyed", commodity: pod.commodity, amount: pod.amount });
    return;
  }
  damageTo = nConsidered - (damageTo + 1);   // reverse the die
  const damageable = f.items.filter((i) => i.damageProbability > 0);
  if (damageTo < damageable.length) {        // equipment branch
    const odds = damageable.reduce((s, i) => s + i.damageProbability, 0);
    const target = rngNext(rng) * odds;      // randf() * damageableOdds
    let acc = 0;
    for (const item of f.items) {            // profile order = Oolite _equipment order
      acc += Math.max(0, item.damageProbability);
      if (acc > target) { /* remove from f.items, push equipmentDamaged { key } */ return; }
    }
  }
  // cosmetic branch (D-05): not ported
}
```
The skeleton is a shape, not final code: sanitise non-finite probabilities, keep the clamp, and keep draw order exactly as in Pattern 1.

### Stateless seed (ledger call site)
```ts
// Source: rng.ts:131-142 forkSeed, rng.ts:65-67 mix32; ids.ts PLAYER_ID = 100
const seed = mix32(forkSeed(world.worldSeed, PLAYER_ID, "damage"), player.tick >>> 0);
const rng = createRngState(seed);
```

### F3 label and detail (D-07)
```ts
// Oolite shows " Repair:%@" applied to " %@ " (PlayerEntity.m:8383, 8397): " Repair: Docking Computers ".
const label = `Repair: ${item.name}`;                       // equals the trimmed Oolite row: NOT a divergence
const detail = `${item.description} (Price is for repairing the existing system).`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PITFALLS 13: remove the key, no repair | Save v5 `damagedEquipment` + F3 repair | Owner decision 2026-11-16 (ROADMAP scope note) | Pitfall 13's "stateless removal" alternative is not taken; its stream/event/atomic-update advice still applies |
| PITFALLS 13: stream owned by combat state, hashed when non-pristine | Stateless per-tick fork (this research) | 2026-11-21 | Keeps all pinned hashes |
| `unreadable` wording in ROADMAP SC4 | `corrupt` classification for v1-v4 | this research | Keeps New game and autosave usable (Open Question 2) |

**Deprecated/outdated:** CONTEXT's "NSDictionary" (it is an array); CONTEXT's checkout line numbers for `descriptions.plist` (use the vendored copy: 494, 895, 896, 1584, 1846, 1847).

## Installed-set consumers (D-06 audit, SC2)

Evidence from `rg` and file reads over `src/`:
| Item | Consumer in Wegolite today | Effect of "damaged = key absent" | D-06 in-use clause |
|------|----------------------------|----------------------------------|--------------------|
| `EQ_DOCK_COMP` | `flight/step.ts:199` `options?.equipment?.has(DOCK_COMPUTER_KEY)` -> `dockWithComputer` -> `dockDenied { reason: "notInstalled" }` (`dock/computer.ts:30, 40-45`). Shift+C docks **instantly** on the same tick (`computer.ts` header: "transitioned instantly ... no fly-in, no animation, no timer") | A damaged computer cannot dock | **No in-use state exists**: there is no engaged autopilot to disengage (no `STATUS_AUTOPILOT_ENGAGED` analogue; `rg -i autopilot src` finds only comments and key bindings). Record "not applicable today"; no code |
| `EQ_ADVANCED_COMPASS` | `flight/step.ts:57, 168-176`: `hasAdvancedCompass` from `options.equipment`; a non-"auto" `compassMode` is forced to `"auto"` every step without it (Oolite 10258-10260) | Falls back to basic on the next step automatically | Already implemented by the installed-set read; add a guard test |
| `EQ_GAL_DRIVE` | Only the F3 purchase row (`outfitting.ts:78, 96`); no galactic jump exists (PROJECT.md line 86: "galactic hyperdrive — later milestone") | None | No countdown to abort; not applicable |
| `EQ_ADVANCED_NAVIGATIONAL_ARRAY` | Only the F3 row; `rg` finds no chart or route consumer in `src/ui/chart*.ts`, `chart-controller.ts` | None | Nothing for the chart to stop showing; not applicable |
| `EQ_CARGO_BAY` | `capacityPodsFor` (`cargo.ts:117-124`); `damage_probability = 0` so never damaged | n/a | n/a |
Oolite also calls `takeInternalDamage` from the misjump malfunction (`PlayerEntity.m:6796`); Wegolite has no misjump (`rg -i misjump` finds nothing), so that caller is out of scope.

## Save schema v5 (SAVE-09)

Evidence: `SAVE_VERSION = 4 as const` (`save.ts:64`), `MAX_SAVE_CHARS = 65_536` (`:86`), `MAX_SAVE_EQUIPMENT = 64`, `MAX_SAVE_EQUIPMENT_KEY_CHARS = 64` (`:89-92`); `SaveV4Schema = z.strictObject({ ...SaveV3Schema.shape, version: z.literal(SAVE_VERSION), laserMounts: LaserMountsSchema })` (`:351-355`); `FORBIDDEN_EQUIPMENT` is `EQ_FUEL, EQ_MISSILE_REMOVAL, EQ_PASSENGER_BERTH_REMOVAL, ...LASER_KEYS, NO_LASER, EQ_WEAPON_THARGOID_LASER` (`:435-442`) — **it does not contain `_DAMAGED`**; a `_DAMAGED` key is rejected today only because it is not in `allow.equipment` (`main.ts:192` builds the set from catalogue keys; `validateSaveSemantics` `:648-649`). Keep that rule: `damagedEquipment` entries are base catalogue keys, never suffixed, so a `EQ_DOCK_COMP_DAMAGED` string fails the allow-list in either field; pin with tests in both fields.

Recommended v5 contract:
- `SaveV5Schema = z.strictObject({ ...(current shape), version: z.literal(5), damagedEquipment: z.array(z.string().min(1).max(64)).max(MAX_SAVE_DAMAGED_EQUIPMENT) })` — required field (a v5 blob must carry it, `[]` when none).
- Semantic rules (shared reader/writer stage): each key in `allow.damageableEquipment` (new allow-list built in `main.ts` from catalogue records with `damageProbability > 0`), no duplicates, disjoint from `equipment`, not in `FORBIDDEN_EQUIPMENT`, `equipment.length + damagedEquipment.length <= 64`.
- A damaged item is not counted in `capacityPodsFor(save.equipment, ...)` (cargo bay cannot be damaged, so capacity is unaffected).
- `parseSave` accepts only v5; `version > 5` stays `future-version`; v1-v4 numeric versions -> `corrupt` (see Pitfall 2). Remove `SaveV1..V4` schemas and `migrateV*` (dead code otherwise) and their goldens; keep one literal v4 blob in the new test to prove rejection and that it is the backed-up `corrupt` path.
- Plumbing: `SaveInputs.damagedEquipment`, `encodeSave` (copy `[...inputs.damagedEquipment]`; keep `"version"` first so the 256-char sniff still sees it), `snapshotForSave` (`autosave.ts:123`), `profileFromSave` (`:215`; copy arrays), `restoreFromSave`, `game-session.ts:57` and `main.ts:45` types (`SaveV4` -> `SaveV5`), `tests/e2e/helpers/save-fixtures.ts`.
- Durability: no new write on damage (D-11). The existing triggers write the committed profile: dock (`event-router.ts:258`, `autosave()` in the `docked` arm), hyperspace arrival (`hyperspace-controller.ts:62` `autosave` dep), pre-launch anchor, F3/F8 commits. Add the Pitfall 13 test: damage event -> `commitProfile` -> `snapshotForSave` shows `damagedEquipment`; and an in-flight arrival save carries damage taken en route.
- A load restores the saved profile, so damage taken after the last save is lost on a death reload (Phase 20); no code here.

## Content build (D-03)

- `damage_probability` is currently only carried verbatim in the open `conditions` record (`EQ_CARGO_BAY`, `EQ_PASSENGER_BERTH`, `EQ_MISSILE`, `EQ_HARDENED_MISSILE`, `EQ_QC_MINE`, `EQ_TRUMBLE`, `EQ_OOLITE_TUTORIAL_CONTROLS` with `0`, as a number; seven `damage_probability` lines in `third_party/oolite/Config/equipment.plist`: 23, 32, 239, 252, 286, 383, 486 `[VERIFIED: rg + node over equipment.json]`). The four F3 items have no authored value, i.e. Oolite's default 1.0 (`OOEquipmentType.m:210` `_damageProbability = 1.0`, `:247` `oo_floatForKey:@"damage_probability" defaultValue:(_isMissileOrMine ? 0.0 : 1.0)`). `damageProbability` returns 0 for a missile or mine (`:504-510`), `canBeDamaged` = not missile/mine and probability > 0 (`:512-521`); `_isMissileOrMine` is implied by a key suffix `_MISSILE`/`_MINE` (`:200-205`) or `is_external_store` (no entry in the plist uses it).
- Implement in `tools/oolite-ingest/convert/equipment.ts`'s `project()` (it already reads `purchase_sort_order` off the conditions the same way): add a typed `damageProbability: z.number().min(0)` to `EquipmentSchema` (`src/content/schemas/equipment.ts`, a `strictObject`), computed as `0` when the key ends in `_MISSILE`/`_MINE` (or `is_external_store` true), else the authored finite non-negative number, else `1`; a non-number value fails the build with `SCHEMA` naming the key (fail closed, like the existing integer checks). Emit it in `emitEquipment` (field order is explicit there).
- Regenerate with `docker compose run --rm assets` (updates `src/content/generated/equipment.json` and `manifest.json` sha256), extend `tools/oolite-ingest/convert/equipment.test.ts` (golden fixture `tests/golden/content/equipment.json` currently `{ version: 1, entries: { KEY: { techLevel, price } } }`; add `damageProbability` and bump the fixture version) and run `docker compose run --rm assets npm run assets:check` (drift). A test must pin the four F3 items at 1 and the seven authored zeros plus the missile/mine suffix rule.
- The loader `parseEquipment` (`src/content/equipment.ts`) validates every record with the strict schema; hand-built `Equipment` literals exist only in `tests/sim/player-profile.test.ts` (2 `priceUnit` occurrences) so churn is small.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A stateless tick-keyed stream satisfies roadmap SC1's "seeded stream" wording | Pattern 2 | If the owner wants a persistent per-player stream, twin literals shift and a stateful design is needed (more churn) |
| A2 | `MAX_SAVE_DAMAGED_EQUIPMENT = 16` is a sound resource bound | Pitfall 3 | Too low blocks a future damageable catalogue; the cap can be raised in a later bump |
| A3 | v1-v4 saves should classify as `corrupt` (clearable) rather than literal `unreadable` | Pitfall 2 | If the owner means `unreadable`, old saves become untouchable and block autosave until storage is cleared |
| A4 | A roll-iteration clamp of 256 is above every reachable Oolite-scale amount | Pitfall 5 | A real damage amount above 8192 would be under-rolled (changes nothing once all items/pods are gone) |
| A5 | New `damageFlow` subscriber is the right router shape | Pattern 6 | Lower-churn alternative exists; either satisfies Pitfall 22 |
| A6 | Per-bank-hit odds and the ~40 % chance of equipment damage in the existing 672-tick fight (6 points a hit: gate 6/32; 4 damageable of 41) are derived arithmetic, not measured | CBT-08 scenario | The twin must pin an actual outcome by scanning, so a wrong estimate only changes the search effort |

## Open Questions

1. **D-05's factor: 95 or 100?**
   - Known: Oolite's new-ship value is 95 (`PlayerEntity.m:1739`, `:1063`); D-05 states 100 and justifies it as exact for the new-ship state.
   - Unclear: whether the owner wants "exact odds for a new ship" (95) or "pristine/never worn" (100).
   - Recommendation: implement 95 and tell the owner at plan review; if 100 is kept, the FIDELITY row must record the odds divergence with its Key Decisions row. This is the one place the research contradicts a locked decision's premise; treat as a confirmation checkpoint.
2. **What does "rejected through the existing unreadable path" mean?** Known: code returns `corrupt` for an unsupported numeric version; `unreadable` disables saving for the session. Recommendation: `corrupt` (Pitfall 2); confirm in plan review.
3. **D-06 clauses with no in-use state** (docking-computer disengage, galactic-jump abort, ANA chart). Recommendation: plan records "not applicable in Wegolite today", adds a guard test that a damaged item behaves as not installed for the two real consumers, and leaves a pointer for the milestone that adds autopilot/galactic jump/ANA.
4. **D-07/D-12 "space in Repair: X" is not a divergence.** Oolite's rendered row has the space (name wrapper `@" %@ "`, `PlayerEntity.m:8383`). Recommendation: no FIDELITY divergence row for it; only `(damaged)` (and D-05 if 100 is kept). Confirm with reviewers per the fidelity rule.
5. **Hook-spawned CBT-08 fight scenario.** Known: the existing shooter lands 6-point hits (gate 6/32 per bank hit); with all four damageable items granted and no bay `n_considered` is 41, so per roll P(equipment) = 4/41; the existing 672-tick fight pushes about 30 hits through the bank, so about a 40 % chance of at least one equipment damage. Recommendation: in the Node twin (`tick-parity.test.ts`) grant the four items through `hook.grantEquipment` (`probe.ts` test hook), and scan the spawn tick offset (the stream is keyed by tick) for a scenario that damages exactly one item and destroys the shooter; pin that offset and the damaged key as literals in both the twin and `combat.spec.ts`. Assert the shooter kill and debris counts unchanged from the existing debris twin.
6. **Probe exposure.** The probe has no equipment field today. Recommended additive `economy.damagedEquipment: string[]` (and `lastTrade.kind` "repair"), under an explicit sanction note and a `WEGOLITE_PROBE_SHAPE_WRITE=1` fixture write on the remote machine (Pitfall 22, `probe-shape.spec.ts` header). Lower-churn alternative: assert through the F5 DOM text after docking.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Compose | every test, build, gate (AGENTS.md rule 1) | yes (local) | 29.8.2 `[VERIFIED: docker --version]` | Remote test machine via `/home/opencode/.claude/scripts/wegolite-remote-run.sh` (present) |
| Oolite checkout | reading behaviour | yes | HEAD `21978c37b`; pin `7437f22` is an ancestor commit and the four source files are unchanged between them `[VERIFIED: git]` | -- |
| Host Node | scratch arithmetic only | yes (v26.10.0) | not authoritative | Docker |

**Missing dependencies with no fallback:** none. Host `node_modules` is absent, so nothing here was executed against the repo's tests; all test evidence must come from Docker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (unit project, Node), fast-check 4.10.2, Playwright (opt-in smoke) |
| Config file | `/home/opencode/git/wegolite/vitest.config.ts` (coverage floors per glob: `src/sim/**` lines 93, `src/persistence/**` lines 88, `src/content/**` lines 66) |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` then `lint`, `typecheck`; browser-facing/persistence changes: `docker compose run --rm verify` / `verify-full` on the remote machine |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CBT-08 (SC1) | Gate loop, `n_considered`, die reversal, cargo branch, weighted pick, draw order, laser-only-if-energy>0, scrape always | unit, hand-derived draws | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage.test.ts` | Wave 0 |
| CBT-08 (SC1) | Ledger emits `equipmentDamaged`/`cargoDestroyed` after `shipHit`, in order; no facts -> no event | unit | `... vitest run tests/sim/combat/ledger.test.ts` | exists (extend) |
| CBT-08 (SC1) | Same fight, same item at 30/60/144 Hz | cadence | `... vitest run tests/sim/combat/internal-damage-cadence.test.ts` (pattern `tests/sim/flight-cadence.test.ts`) | Wave 0 |
| CBT-08 | Totality: NaN/negative/huge/empty/duplicates | property (fast-check) | `... vitest run tests/sim/combat/internal-damage.property.test.ts` | Wave 0 |
| CBT-08 | Pod list = `holdPods`, length = `holdPodsUsed`, re-derivation consistent | unit + property | `... vitest run tests/sim/economy/` (extend cargo tests) | extend |
| CBT-08 | Pinned constants (31, factor, 21 mass term, purposes) | pinning | `... vitest run tests/sim/combat/constants.test.ts tests/sim/rng.test.ts` | exists (extend) |
| CBT-08 (SC5) | Hook-spawned fight: shooter killed with debris, player has a damaged item, HUD message routed | scenario twin | `... vitest run tests/app/session/tick-parity.test.ts` | exists (extend) |
| CBT-08 (SC5) | Same in a real session | opt-in browser | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"` | exists (extend) |
| CBT-12 (SC2) | Damaged key leaves `options.equipment`; dock computer refuses (`notInstalled`); compass falls back | unit | `... vitest run tests/sim/dock-computer.test.ts tests/sim/flight-controller.test.ts` | exists (extend) |
| CBT-12 (SC2) | HUD `%@ damaged.` / `%@ destroyed.` 4.5 s after `clearPrevious`; names from catalogue; length guard | unit | `... vitest run tests/app/session/event-router-damage.test.ts tests/guards/hud-message-length.test.ts` | Wave 0 / extend |
| CBT-12 (SC2) | Router pins: order, table, 24 kinds, `damageFlow` before `hudMessages` | pinned | `... vitest run tests/app/session-order.test.ts` | exists (update) |
| CBT-12 (SC2) | Atomic update: one `commitProfile` per event; equipment set invalidates; identity on refusal | unit | `... vitest run tests/sim/player/damage.test.ts tests/app/session/station-controller.test.ts` | Wave 0 / extend |
| CBT-12 (SC3) | Repair door: allow-list closed set, forged keys, price `ceil(p/2)`, TL-1 rule, credits, key moves to end of equipment, no clock | unit | `... vitest run tests/sim/player/outfitting.test.ts` | exists (extend) |
| CBT-12 (SC3) | F3 rows: repair replaces buy row, label/detail verbatim, unaffordable shows "Not enough credits", hidden below TL-1, confirm verb | view-model | `... vitest run tests/ui/station-outfitting.test.ts` | exists (extend) |
| CBT-12 | F5 "(damaged)" first | view-model | `... vitest run tests/ui/station-status.test.ts` | exists (extend) |
| CBT-12 | Normal-play: buy -> damage -> repair through the real controller | integration | `... vitest run tests/app/session/station-controller.test.ts` | exists (extend) |
| SAVE-09 (SC4) | v5 schema, strict extras rejected, `_DAMAGED` key rejected in both fields, disjointness, allow-list, combined <= 64, v1-v4 -> corrupt, future version, older-build-inert, padded worst case unreadable | unit | `... vitest run tests/persistence/save-v5.test.ts` | Wave 0 |
| SAVE-09 (SC4) | Worst-case v5 under `MAX_SAVE_CHARS` at schema maxima | unit | same file | Wave 0 |
| SAVE-09 (SC4) | Round trip `snapshotForSave` -> `encodeSave` -> `parseSave` -> `profileFromSave`; damage then autosave bytes | unit | `... vitest run tests/persistence/autosave.test.ts tests/persistence/restore-drift.test.ts` | exists (update) |
| SAVE-09 (SC4) | Continue/Load shows the damaged item | browser (v5 fixture, untainted) | `... playwright test tests/e2e/save-load.spec.ts` | exists (extend) |
| D-03 | `damageProbability` compiled, golden, drift | ingest | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/equipment.test.ts tools/oolite-ingest/drift.test.ts`; `docker compose run --rm assets npm run assets:check` | exists (extend) |
| D-05/D-07/D-12 | FIDELITY rows + Key Decisions rows valid | contract | `... vitest run tests/contract/fidelity.test.ts` | exists (extend) |
| Purity | New sim files obey bans/zone; economy file list pinned | guards | `... vitest run tests/guards/` | exists (update `PLAYER_FILES` if a new player file is added) |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>` for the files touched.
- **Per wave merge:** `docker compose run --rm test`, `lint`, `typecheck`.
- **Phase gate:** `docker compose run --rm verify`, and `verify-full` for the persistence and money-path change, both on the remote test machine; the 20-seed NPC acceptance run is not required (no change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`).

### Wave 0 Gaps
- [ ] `tests/sim/combat/internal-damage.test.ts`, `...-cadence.test.ts`, `...property.test.ts` — roll, cadence, totality
- [ ] `tests/sim/player/damage.test.ts` — pure profile ops
- [ ] `tests/persistence/save-v5.test.ts` — replaces `save-v2/v3/v4` and golden chain tests
- [ ] `tests/app/session/event-router-damage.test.ts` — router rows, HUD copy, commit
- [ ] Extended: `ledger`, `constants`, `rng`, `cargo` (holdPods), `outfitting`, `station-outfitting`, `station-status`, `station-controller`, `tick-parity`, `combat.spec`, `save-load.spec`, `equipment.test` (+ golden), `fidelity`, `hud-message-length`, `session-order`, `economy-purity`
- [ ] A TL >= 8 system fixture for repair tests (Lave is raw TL 4)
- Framework install: none.

## Security Domain

`security_enforcement` is enabled (absent = enabled, `.planning/config.json` `security_enforcement: true`, ASVS level 1).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | yes (money-path allow-list) | `REPAIRABLE_EQUIPMENT_KEYS` + strict composite-key parse, `notOffered` on anything else |
| V5 Input Validation | yes | zod `strictObject` for the save and equipment schema; shared semantic validator; `isValidPrice`; size cap before `JSON.parse` |
| V6 Cryptography | no (the sim PRNG is a deterministic game stream, not a security control) | do not hand-roll; use `rng.ts` |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged save: `damagedEquipment` with unknown/suffixed/duplicate/overlapping keys, an oversized array | Tampering | strict schema bound, allow-list of damageable keys, disjointness, combined cap, `MAX_SAVE_CHARS` before parse |
| Forged F3 row key reaching `applyRepair` (ECM, laser, cargo bay, `repair@...` variants) | Elevation/Tampering | literal allow-list + strict parse; re-check in `applyRepair`; same-object refusal |
| Fractional/NaN/overflow repair price | Tampering | `isValidPrice`, integer `ceil(p/2)`, `isSafeCredits` before and after |
| Unbounded roll loop on a corrupt damage amount | Denial of service | iteration clamp, ledger's finite/positive filter |
| Debug seam damaging equipment without taint | Repudiation/Tampering | no such seam; `?test=1` mutations taint and autosave refuses (`probe-publisher.ts`) |
| Event payload id lifetime | Information integrity | events carry keys and amounts only, never entity ids (`entity-id-scope` guard) |

## Sources

### Primary (HIGH confidence, read this session)
- Oolite checkout `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m` (5599-5753, 6097-6185, 7144-7248, 8250-8420, 8555-8585, 9060-9330, 3425-3445, 1060-1064, 1728-1741, 6775-6800, 195-420), `PlayerEntity.h:331`, `ShipEntity.m` (3180-3335, 7198-7216), `ShipEntity.h:447`, `OOEquipmentType.m` (195-260, 495-525), `Entity.m:665-675`, `legacy_random.c/.h`, `OOCommodityMarket.m`, `OOCommodities.m:129-148`
- Vendored data `third_party/oolite/Config/descriptions.plist`, `equipment.plist`, `pin.json`
- Repo: `src/sim/combat/{ledger,shields,state,step,constants}.ts`, `src/sim/{rng,events,sim,state,step}.ts`, `src/sim/economy/cargo.ts`, `src/sim/player/{profile,outfitting}.ts`, `src/sim/dock/computer.ts`, `src/sim/flight/step.ts`, `src/sim/world/{ids,world,serialize}.ts`, `src/persistence/{save,autosave}.ts`, `src/main.ts`, `src/app/session/{event-router,sim-driver,step-options,station-controller,probe-publisher,save-controller}.ts`, `src/app/{probe,game-session}.ts`, `src/ui/{station-model,title}.ts`, `src/render/hud/messages.ts`, `src/content/{equipment.ts,schemas/equipment.ts,types.ts}`, `tools/oolite-ingest/convert/equipment.ts(+test)`, `tests/{app/session-order,app/session/tick-parity,contract/fidelity,persistence/save-v4,guards/*,e2e/combat}`, `vitest.config.ts`, `package.json`, `.planning/{config.json,research/PITFALLS.md,ROADMAP.md,REQUIREMENTS.md}`, `FIDELITY.md`, `AGENTS.md`

### Secondary (MEDIUM confidence)
- Scratch arithmetic for the worst-case size (reproduces the test's input shape; the Docker test is authoritative)

### Tertiary (LOW confidence)
- None. No web search or external library documentation was needed: the phase has no new library, and Oolite is read from the local checkout per project rules.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependency, versions read from `package.json`
- Architecture: HIGH for Oolite semantics and the existing seams (all read); MEDIUM for the stream and router-shape choices (`[ASSUMED]`, A1, A5)
- Pitfalls: HIGH - each tied to a read file:line or a pinned test

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 (stable; invalidated if Phase 20 changes the ledger's player branch or the router subscriber set first)
