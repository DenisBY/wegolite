# Feature Landscape: v2.3 Combat and Death

**Domain:** Faithful browser port of Oolite's combat consequences: NPC laser fire, hits on stations and buoys, ship destruction with wreckage and cargo, collision damage, and player death with game over
**Milestone:** v2.3 Combat and Death (subsequent milestone; v2.2 already ships the player's lasers, shields, energy banks, the octree hit rule, NPC steering and ident)
**Researched:** 2026-11-16
**Overall confidence:** HIGH for every number cited to an Oolite source line (read directly from the checkout); MEDIUM for derived arithmetic (marked "derived") and for Wegolite-side effort estimates; LOW items are flagged inline.

## How to read this file

- **Source of truth.** The Oolite checkout at `/home/opencode/git/oolite` (FIDELITY.md pins `7437f22`; the files cited here are the ones the earlier v2.0 research found identical at both commits). No library documentation was needed: every finding comes from the local Oolite source and the Wegolite code, so the Context7/web seam was not used.
- **Path shorthand.** `E/` = `src/Core/Entities/`, `C/` = `src/Core/`, `Cfg/` = `Resources/Config/`. `ShipEntity.m:N` means `E/ShipEntity.m` line N. All Wegolite paths are relative to the repository root.
- **Complexity** is for a TypeScript port inside the existing multi-entity world: Low (data plus a few lines), Med (a subsystem with several rules), High (new infrastructure, a snapshot or save bump, or a long tail of rules).
- **Tick facts.** Wegolite steps at 1/120 s. Oolite works in float seconds, so every Oolite per-second constant below is a rate, not a tick count.

## 0. The finding that shapes the roadmap

Production NPCs are inert. The populator spawns the 12 ships with `ai: null` (`src/sim/world/populate.ts:264`, D-02), and only the test pilot and the acceptance flight script ever call `ShipControl.fire`. The Phase 14 behaviours skip Oolite's `fireMainWeapon:` calls on purpose (`src/sim/npc/behaviours/attack.ts`, `attack-evade.ts`, `evasive.ts`). In Oolite the thing that turns "I was hit" into "I attack back" is the AI (`respondToAttackFrom` posts `ATTACKED`, `ShipEntity.m:2647-2692`), and the priority AI, pirates, police and traffic are out of this milestone.

Consequence: after v2.3 an NPC will fire in the shipped game only if something gives it a hostile target. That is a **scope decision for the owner**, not a detail (see Open Question Q1). This file treats NPC fire as "the engine can do it, by Oolite's rules, and tests and a minimal retaliation hook prove it", and marks a generic retaliation response as a differentiator with a recorded divergence, not table stakes.

## Oolite rules reference (the numbers the roadmap needs)

### R1. Damage to an NPC, station or buoy (`-[ShipEntity takeEnergyDamage:...]`, `ShipEntity.m:11418-11574`)

| Rule | Value | Line |
|------|-------|------|
| Dead ships ignore damage; zero or negative amount ignored | `status == DEAD` or `amount <= 0` returns | 11420-11423 |
| NPCs have no shields: the hit goes straight to `energy` | `energy -= amount` | 11431 |
| Cabin heat from the hit, capped, never causes overheating by itself | `ship_temperature += amount * SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR / heatInsulation`, only while `< 256`, clamped at 256 | 11435-11440 |
| Heat factor | `mass > 400000 ? 200000 / mass : 0.5` | `ShipEntity.h:67` |
| Death | `energy <= 0` calls `getDestroyedBy:`, except the main station never dies | 11557-11563 |
| Escape pod, 25 % chance below 12.5 % energy | **Out of scope** (escape pods) | 11569 |
| A hit makes the victim hostile to the shooter and posts `ATTACKED` | AI-side; see section 0 | 11454-11482 |
| A smart ship (accuracy >= 5) switches to `EVASIVE_ACTION` when hit while it has a hostile target | already ported in Phase 14 (evasive behaviours) | 7728-7739 |

### R2. NPC weapon gate (`-[ShipEntity fireWeapon:direction:range:]`, `ShipEntity.m:9912-10007`)

A shot is refused unless every line passes, in this order:

1. weapon temperature below the cutout: `temp / 256 >= 0.85` refuses (`ShipEntity.h:116-117`, 9935);
2. energy: `energy > weapon_energy_use` (times barrel count when multiplying) (9944);
3. recharge: `shot_time >= weapon_recharge_rate` (9946);
4. range: `range <= randf() * weaponRange * (accuracy + 7.5)` and `range <= weaponRange` (9949-9952);
5. aim: `onTarget:` is true (9954; `onTarget` at 9851-9910: facing cosine `dq` against `currentAimTolerance`, or one third of the target's subtended half angle; plus a 3-in-4 refusal when the shooter is sunlit and the target is not, 9868).

A fired shot costs `energy -= weapon_energy_use` and raises the facing's weapon temperature by `weapon_shot_temperature` (9968-9985). All four temperatures cool at `6 / s` (`WEAPON_COOLING_FACTOR`, `ShipEntity.h:115`; update at `ShipEntity.m:2213-2218`). `shot_time` advances every update (2221). NPC energy recharges by `energy_recharge_rate * dt` up to `maxEnergy` (2417-2425).

Weapon data per laser (`Cfg/equipment.plist:131-195`, derived reading of the `weapon_info` dicts): pulse range 12500 / energy 0.8 / damage 15 / recharge 0.5 s / shot temperature 7; beam 15000 / 0.5 / 6 / 0.1 s / 3.2; military 30000 / 1.1 / 12 / 0.1 s / 4.25; mining 12500 / 1.4 / 50 / 2.5 s / 10. Wegolite already has these in `src/sim/combat/constants.ts` (`LASER_STATS`); re-check them against the plist before extending them to NPCs.

**What the existing Wegolite NPC path skips** (decision row "NPC fire shares only the hit and damage rule with the player's laser", RESEARCH A7): no laser heat, no shot timer, no energy cost, no range-accuracy roll, no `onTarget` gate. "NPC laser fire by Oolite's rules" means putting items 1-5 and the energy and temperature bookkeeping on the NPC path. Those are new per-entity fields (weapon temperature, shot time), and PROJECT.md row 291 freezes the `Entity.steer` record: another field means another world-snapshot version and another deliberate regeneration of `tests/golden/world/inert-lave-epoch1.json`.

The call sites to un-skip, by behaviour (`fireMainWeapon:` at `ShipEntity.m`): `behaviour_evasive_action` 4035 (the "occasional opportunist" shot), `behaviour_attack_sniper` 4454, `behaviour_fly_to_target_six` 4575 (also serves ATTACK_FLY_TO_TARGET_TWELVE, dispatch at 2522-2523) and `behaviour_attack_fly_to_target` 4711. `behaviour_attack_target`, `attack_fly_from_target`, `attack_slow_dogfight` and `attack_break_off_target` never fire themselves. Not for the nine hulls: mining 4607, running defense 4821-4823 and scripted AI 5391-5397 (out of scope), flee 4891 (fires only a turret laser, so thargoids), broadside port and starboard 4328-4330 (no compiled record has a side or aft weapon, PROJECT.md row 292).

### R3. Laser hit candidates (`-[Universe firstShipHitByLaserFromShip:...]`, `Universe.m:5549-5647`)

Candidates are every entity that `isShip` and `canCollide`, except the shooter and its parent (5576-5581). That list includes the main station, both buoys, cargo pods, alloy plates, rocks and every NPC. It excludes wreckage (`canCollide` returns NO for `isWreckage`, `ShipEntity.m:1865-1867`), dead ships and ships being scooped (1860-1863). Two stages: a sphere test on `collision_radius` in the laser frame (5611-5617), then `doesHitLine:` against the octree **and every solid subentity octree** (`ShipEntity.m:1323-1357`).

Consequences for stations and buoys, read from `Cfg/shipdata.plist`:

- Coriolis: `max_energy 25000`, `energy_recharge_rate 100`, `frangible 0`, scan class `CLASS_STATION` (shipdata lines 1695, 1697, 1732, 1741). It has three solid subentities (faceplate, tris, dock, lines ~1714-1730 and `oolite_coriolis_*.dat`). Not frangible means the whole hit lands on the station itself (`ShipEntity.m:10409-10414`), and it can never be destroyed (11559). A pulse laser (30 damage/s at the full fire rate) cannot out-damage 100/s recharge.
- Navigation buoy: `max_energy 250`, `energy_recharge_rate 2` (shipdata 1018, 1021), frangible by default (`ShipEntity.m:376`), one solid subentity `oolite_buoy_subentity` (shipdata 4954) with the default `max_energy 200` (`ShipEntity.m:291`). A frangible parent with a struck subentity takes 1 % of the damage and the **subentity takes the full amount** (10409-10414). Both buoys use the same record family (witchpoint beacon: shipdata 1109-1111).
- Wegolite today lists neither as a hit candidate (PROJECT.md row "Statics are neither laser nor ident targets", todo `2026-11-15-lasers-and-ident-hit-stations-and-buoys`), and `firstShipHit` does not port the subentity branch (`src/sim/combat/hit.ts` header: "Not ported: the subentity branch").

### R4. Ident targeting (`-[Universe firstEntityTargetedByPlayer]`, `Universe.m:5649-5721`)

Candidates: every ship that is not the player, plus wormholes (5660-5664); the entity must `canCollide` and not be `CLASS_NO_DRAW` (5691); the test is a **sphere** test: ahead of the view, inside `25600 - 100` m, and the lateral miss distance inside `collisionRadius` (5693-5705). No octree. So stations, buoys, cargo pods and rocks are all lockable, and the lock message is "Ident system locked onto [target]." (`Cfg/descriptions.plist:527`) with the record's `name` ("Navigation Buoy", "Witchpoint Beacon"; shipdata 1030 and 1115). Wegolite's ident already follows this rule for ships (`src/sim/combat/ident.ts`, `IDENT_ACQUIRE_RANGE`); the work is adding the statics (and later pods) to its candidate list with a stable non-id key (the per-world id rule stops a static id leaving the world, so the lock uses the spec key plus a layout key; `identTargetSnapshot` already reads position and radius).

### R5. Destruction (`-[ShipEntity becomeExplosion]`, `ShipEntity.m:7891-8143`; `getDestroyedBy:`, 7768-7773)

`getDestroyedBy` = `noteKilledBy` (script events) + `abortDocking` + `becomeExplosion`. `becomeExplosion` in order:

1. A dead ship cannot explode twice (7920-7924).
2. Visual effects: ring if `mass > 500000` with 25 % chance (7931), explosion cloud and flash (7958-7964). Cosmetic.
3. **Debris only when the universe has room**: `n_entities < 0.95 * 2048` **and** frame time under 0.125 s (7939). `UNIVERSE_MAX_ENTITIES = 2048` (`C/OOTypes.h:166`).
4. **Cargo**: `releaseCargoPodsDebris` (7989, defined 7814-7879).
5. Asteroid/boulder rock branch (7992-8040): **out of scope** (mining, asteroids).
6. **Wreckage** `(n_alloys && canFragment) || canReleaseSubWreckage` (8044): `n_alloys = (mass / 6000)^(1/4)` (7916, `sqrtf(sqrtf(...))`). Only when `n_entities < 0.50 * 2048` (8047). `n_wreckage = n_alloys < 3 ? floor(randf() * (n_alloys + 2)) : 3` (8055). Each piece: a random octree point rotated into world space, role `wreckage`, lifetime `750 * randf() + 250 * i + 100` passed as `lifetime / 2` (8059-8067); `n_alloys` is then re-rolled `= randf() * n_alloys` (8068).
7. **Scrap metal**: `numAlloys = floor(n_alloys)` entities of role `alloy`, scan class `CLASS_CARGO`, commodity `alloys` x1, random point in the bounding box (+-3 m), velocity `0.1 * ((rand % 200) - 100)` per axis plus the ship's (8085-8111). Skipped when `canFragment` is false; at most 1 when the universe is nearly full (8072-8078).
8. Subentities explode (8114-8120); momentum push on neighbours `0.125 * mass` within `2.5 * collision_radius` (8123-8126, `dealMomentumWithinDesiredRange` 7680-7700; derived effect `velocity += normal * amount * range / d^2 / mass`).
9. `canFragment = oo_fuzzyBooleanForKey("fragment_chance", 0.9)` is rolled **once at spawn** (`ShipEntity.m:372`); the wreckage template has `fragment_chance 0` (shipdata 4234).

**Cargo rule** (`releaseCargoPodsDebris`, 7814-7879): the ship's `cargo` list is cleared; for each item, `Ranrot() % 100 < cargo_chance` with `cargo_chance` starting at 70. Each **survivor** lowers the chance by 30 for an NPC (20 for the player) while it is above 10, so the sequence is 70, 40, 10, 10, ... for an NPC and 70, 50, 30, 10 for the player. At most **15** pods survive (`limit = 15`, 7826, 7875). Each pod: a template pod becomes a real one via `cargoPodFromTemplate` (`C/Universe.m:3863-3878`): amount is 1 for tonnes, `1 + r%6 + r%6 + r%6` for kg, `4 + r%16 + r%11 + r%6` for g (`Universe.m:3990-4010`), and a 50 % chance of a commodity-specific pod role before falling back to `cargopod`. Position: a random point in the bounding box plus +-3 m; velocity `0.1 * ((rand % 200) - 100)` per axis (about +-10 m/s) added to the ship's; random orientation; scan class `CLASS_CARGO`. The pod record (shipdata 603-640) has `max_energy 1`, `ai_type dumbAI.plist`, `heat_insulation 0.3`, no lifetime: **pods live until collided, scooped or the system is left**.

**Where an NPC's cargo comes from** (needed or no pods ever drop): the populator calls `setCargoFlag:`: trader `CARGO_FLAG_FULL_SCARCE` (`C/Universe.m:2538`), with a 1-in-4 sunskimmer `FULL_PLENTIFUL` (2541), pirate `CARGO_FLAG_PIRATE` (2554), and the witchspace-arrival trader path 2654-2676. `setCargoFlag:` (`ShipEntity.m:7323-7370`) fills `num = likely_cargo * (0.5 + randf())` pods (all free space when `likely_cargo` is 0; capped at 200), chosen by `getContainersOfGoods:scarce:legal:` from the **current system's market quantities** (`Universe.m:3880-3938`: each good weighted `min(q,64) * 100 / 64`, scarce goods reversed `64 - q`, illegal goods nearly excluded when `legal`). The pirate flag draws `Ranrot() % (1 + num / 2)` illegal goods. Shuttles and scavengers get flags from the station (`StationEntity.m:1629`, 1262), not the populator. Compiled facts for the nine Wegolite hulls (shipdata): `likely_cargo` adder 2, cobramk1 10, gecko 3, krait 2, mamba 3, moray 5, shuttle none (max_cargo 30), viper and sidewinder none in the lines read here; `frangible 0` on gecko, mamba and viper; viper `has_escape_pod yes`. Wegolite's `ships-npc.json` carries none of these cargo fields yet (it has energy, recharge, weapon, mass, radius).

**Wreckage lifetime** (`Universe.m:5497-5522`, `addWreckageFrom:`): the wreck is a role `wreckage` ship rescaled so its mass is `0.1 * ship_mass * (0.75 + 0.5 * randf())`, temperature 1000, heat insulation `1e7` ("take 1000e heat damage per second", comment at 5516), energy = the lifetime argument, `isWreckage` set, then `performTumble`. Wreckage is `CLASS_NO_DRAW`, `max_energy 20000`, no AI, never collides (shipdata 4227-4246). **Derived and LOW confidence on the real duration:** the heat loop of `ShipEntity.m:2256-2272` costs about `1000 - 10 t` energy per second, so lifetime `E` lasts roughly `E / 1000` s (0.05-0.6 s for the `lifetime / 2` values above). Check that against a running Oolite or Latest.log before pinning a duration; the port should pin the formula, not a remembered "several seconds".

**NPC dying with an escape pod, bounties, kill credit, legal response, `shipDied` scripts and the cascade (Q-mine) path are all out of scope.**

### R6. Collision damage (`-[ShipEntity collideWithShip:]`, `ShipEntity.m:11020-11156`)

Detection (`C/CollisionRegion.m:226-374`, `ShipEntity.m:1944-2003`, `Octree.m:473-595`): per region, for each pair `dist2 < (r1 + r2)^2` (the plain sphere test at 297-324), then the hull test `doOctreesCollide` (octree against octree, then each solid subentity against the other hull, `ShipEntity.m:1878-1942`; the octree walk is `isHitByOctree`, 473-595, about 120 lines). A station is skipped when the other ship is in its docking corridor (`CollisionRegion.m:327-340`). Entities with `canCollide` NO are filtered out (`Universe.m:6729`): dead, being scooped, wreckage, cockpit display, unfused missiles.

Resolution (`collideWithShip:`; each pair is resolved once, because the first ship to process it removes itself from the other's list, 11150):

- `loc` = unit vector between centres; `v` = relative velocity; `v2b = v . loc` (11048-11072);
- **moving apart faster than 1 m/s (`v2b < -1`): nothing happens** (11079-11081); between -1 and 0 the ship is nudged 1 m and the damage uses `v2b^2` (11083-11085);
- **`dam1 = m2 * v2b^2 / 50 000 000` to self, `dam2 = m1 * v2b^2 / 50 000 000` to the other** (11089-11090), where `m` is `mass`;
- a ship whose damage exceeds its energy is "destroyed"; a station is never destroyed and never moved (11111-11112, 11143);
- damage applies only above 0.05 (11114, 11123) through `takeScrapeDamage:` (`ShipEntity.m:11641-11676`: ignored while either ship is `STATUS_LAUNCHING`; `energy -= amount`; at `<= 0` `getDestroyedBy`);
- velocities are adjusted (elastic, `v1a = sqrt(v2b^2 * m2 / m1)`), a 1 m/s minimum separation is enforced, and a destroyed ship hands back explosion velocity (11092-11135);
- scoop first: `canScoop` pre-empts damage when the collider has a scoop and a front-facing pod (11035-11042); a ship with a scoop is a scavenger in the Wegolite table (scooping is out of scope, so this is a recorded deviation: pods hit a scavenger as ordinary collisions).

Player: `-[PlayerEntity takeScrapeDamage:]` (`PlayerEntity.m:5701-5753`) drains the facing shield first (by the sign of the collider's forward offset), the remainder goes to `energy` via the ship rule, and the **internal damage loop runs on the post-shield remainder** (5746-5752).

**Derived consequences worth pinning in tests:** the Cobra (mass 214,737.6875 in `ships-client.json`) hitting a navigation buoy (mass 698,691.1875) at closing speed `v` takes `698691 * v^2 / 5e7` (14 at 10 m/s, 140 at 31.6 m/s, 1,258 at 95 m/s) and the buoy takes `214737 * v^2 / 5e7`, so a 250-energy buoy survives up to about `v = 241 m/s`. Ramming the Coriolis (mass 515,483,904) costs `10.3 * v^2`: about 258 at 5 m/s, which is lethal to a Cobra with full shields (2 x 256 absorb one bank, 256 energy behind it). `ships-client.json` already holds both masses.

### R7. Damage to the player (`-[PlayerEntity takeEnergyDamage:...]`, `PlayerEntity.m:5599-5699`)

Wegolite already ports the shield half (`routeDamage`, `src/sim/combat/shields.ts`). The parts v2.3 adds:

- **Death**: after the shield, `energy -= amount`; `energy <= 0` calls `getDestroyedBy:` (5683-5689). Today Wegolite floors the player's energy at 0 (PROJECT.md row "Floor the player's energy at 0 until a death phase exists", a reversible stub) and floors NPC energy at 0 (N2, `src/sim/combat/step.ts:344`).
- **Internal damage loop** (else branch, 5690-5698): `while amount > 0: if (rand & 31) < amount: takeInternalDamage; amount -= 32` (`PLAYER_INTERNAL_DAMAGE_FACTOR 31`, `PlayerEntity.h:331`). Only the energy that passed the shield counts, so shields up means no internal damage; a 15-damage pulse through bare hull is a 15/32 = 47 % chance per hit (derived).
- **`takeInternalDamage`** (`PlayerEntity.m:6097-6185`): `n_considered = (maxAvailableCargoSpace + mass / 10000) * ship_trade_in_factor / 100` (stock factor 95, set at 1739 and 1063; cargo bay and berths change `maxAvailableCargoSpace`); `damage_to = rand % n_considered`.
  1. `damage_to < cargo pod count`: **that pod is destroyed**, message "[commodity] destroyed." (`Cfg/descriptions.plist:896`), 4.5 s.
  2. else `damage_to = n_considered - (damage_to + 1)`; if `< damageableCounter` (installed items that `canBeDamaged`): one is chosen **weighted by `damage_probability`** (default 1.0), removed, and `<key>_DAMAGED` is added; "[name] damaged." message (`:6159-6170`).
  3. else cosmetic: `(damage_to & 7) == 7 && trade_in_factor > 75` lowers `ship_trade_in_factor` by 1 (6180-6183).
- Items that **cannot** be damaged (`damage_probability 0`, `Cfg/equipment.plist:23, 32, 239, 252, 286, 383, 486`): missiles, `EQ_CARGO_BAY`, `EQ_TRUMBLE`, `EQ_PASSENGER_BERTH`, hardened missile, Q-mine, tutorial controls. Lasers are not in the equipment list at all (they live in the facing mounts; `addEquipmentItem` refuses a working `EQ_WEAPON*` key, `ShipEntity.m:3221-3224`), so lasers are never damaged. Of Wegolite's F3 set, the damageable ones are **`EQ_DOCK_COMP`, `EQ_GAL_DRIVE`, `EQ_ADVANCED_COMPASS`, `EQ_ADVANCED_NAVIGATIONAL_ARRAY`**.
- **In flight the player's hold is a list of physical pods** (`PlayerEntity.m:9440-9505`: `loadCargoPodsForType` when undocked; one pod per tonne, kg pods of `KILOGRAMS_PER_POD 1000`, g pods of `GRAMS_PER_POD 1,000,000`, `PlayerEntity.h:1294-1297`). Wegolite's profile holds a quantity map, so the in-flight pod list is a derived view that must be rebuilt at launch and folded back at dock and at save.
- **Repair** is the same purchase: re-buying a `_DAMAGED` item costs **50 %** of the price and restores it (`PlayerEntity.m:9109-9120, 9336-9338`; F3 shows "(N/A)" in the status list, 7202-7212, and "price is for repairing", 8569-8572). **Repair is CBT-12, which this milestone excludes** (Open Question Q3: without it, damaged equipment is a permanent loss).
- NPCs have **no** internal damage; `takeInternalDamage` exists only on the player (`PlayerEntity.h:1037`).

### R8. Player death and game over (`PlayerEntity.m:6187-6223`, `3551-3644`, `Universe.m:2961-2968`)

`getDestroyedBy:` on the player: returns if docked (6189); stores the save path to load (6194-6196); `energy = 0`; autopilot off; view aft (6203); `noteKilledBy` script event; `becomeLargeExplosion:4.0` (also sets `STATUS_DEAD` and spills the player's cargo with the same pod rule, `ShipEntity.m:8300-8336`); speed 160, rates zeroed; messages cleared; **`removeAllEquipment`**; other ships lose the player as target (`loseTargetStatus`, 6225-6242); `showGameOver` (6222).

`showGameOver` (3630-3644): HUD reset, then "Game Over", a blank line, "Score: [rating], [credits] Cr" (rating from kills, `ship_kills`), a blank line, "Press Space" (`Cfg/descriptions.plist:2037, 2036, 2038`). While dead, `performDeadUpdates` (3551-3564) fades to black and white over 5 s (`gameover-seconds-to-bw-fadeout`, shader detail only) and after **`kDeadResetTime = 30 s`** (`PlayerEntity.m:99`) calls `[UNIVERSE handleGameOver]`. **Space skips the wait** (`PlayerEntityControls.m:4032-4043`). `handleGameOver` (`Universe.m:2961-2968`): **if a save path is known, load that save; otherwise restart to the title/demo**. A player in `STATUS_DEAD` is neither collidable (`canCollide`) nor damageable (`PlayerEntity.m:5607`). `getDestroyedBy:` is the single death entry for every cause: laser (`:5689`), scrape (`ShipEntity.m:11655-11669` through `[super takeScrapeDamage:]`), heat (`ShipEntity.m:11696-11697`), planet and sun contact (`ShipEntity.m:11006-11009`). The last three are out of scope but must be able to call the same entry.

Wegolite stub points already in place: `SimEvent` `playerDestroyed { position }` is reserved (`src/sim/events.ts:172`), `shipDestroyed` carries `id, position, radius, specKey, killer` (139-146). The app has one save slot (the `autosave` key, also written by manual Save), a warm in-session Load and a cold Continue, so "load the last save" is the existing restore path.

---

## Table Stakes

A faithful result is missing these if they are absent. Ordered roughly by dependency.

| Feature | Why expected (Oolite rule) | Complexity | Notes and dependencies on existing code |
|---------|----------------------------|------------|------------------------------------------|
| **TS-1 NPC destruction at zero energy** | R1: `energy <= 0` calls `getDestroyedBy:`; the station is exempt (`ShipEntity.m:11557-11563`) | Med | Replace the N2 floor in `resolveShotHits` (`src/sim/combat/step.ts:344`) with a death path: mark `dead`, emit `shipDestroyed` (event already reserved), commit removal through the existing `stepWorld` commit (`entityRemoved`, ascending ids). One shared destruction function so collisions, lasers and later heat use it. |
| **TS-2 NPC energy-gated, heat-gated, timed laser fire (R2)** | "NPC laser fire by Oolite's rules" is the milestone text; the current path has no cost, heat, timer, range roll or aim gate (RESEARCH A7) | High | New per-entity fields (weapon temperature per facing, shot time) need **world snapshot version 4** and a **fourth deliberate regeneration** of `tests/golden/world/inert-lave-epoch1.json` (rows 287 and 291 are the precedent; row 291 freezes `steer`, so these fields live beside it). Un-skip the `fireMainWeapon:` sites in `src/sim/npc/behaviours/*.ts` per R2. Reuses `currentAimTolerance` (`src/sim/npc/target.ts:129`), `npcLaserRay` (`src/sim/combat/aim.ts`) and the `fireQueue`/`drainFireQueue` path. The accuracy draw stream is the entity's `combat` stream. |
| **TS-3 NPC energy recharge and kill by NPC-vs-NPC fire** | `ShipEntity.m:2417-2425`; the hit rule is shared (CBT-07) | Low | `rechargeShips` already exists. Needs only that a target destroyed by another NPC takes the same path as TS-1; test with two test pilots. |
| **TS-4 NPC laser hits the player through shields, energy and cabin heat** | `PlayerEntity.m:5646-5677`; already ported for any shooter | Low | Exists (`routeDamage`). New: the hit that takes energy to 0 triggers TS-12. Add `shipHit` consumers for the HUD flash if absent. |
| **TS-5 Cargo pods and scrap drop on destruction (R5 cargo and alloy rules)** | `releaseCargoPodsDebris`, 70/40/10 chance, limit 15, pod amounts, +-10 m/s drift, `CLASS_CARGO` | High | Needs: (a) NPC cargo at spawn (`setCargoFlag:` from the current system's market, so `populate` must receive a market snapshot, a new input and **new spawn-time draws**); (b) a pod entity (`kind: "cargo"` already exists in `ENTITY_KINDS`) with commodity and amount fields (snapshot bump, same as TS-2); (c) the compiled record fields `likely_cargo`, `max_cargo`, `fragment_chance` in `ships-npc.json`; (d) a pod model, `oolite_barrel.dat` and `oolite_alloy.dat`, which are **not vendored** (`third_party/oolite/Models` lacks them), so a vendoring step under the owner's network exception rule (PROJECT.md row 257 covers only the 42 Phase 9 files) or a copy from the local checkout with `CHECKSUMS.sha256` and `ASSETS.md` provenance; (e) render instancing (draw-call budget 50, `QUAL-09` is later but the container budget spec exists). |
| **TS-6 Entity cap on debris (R5 steps 3 and 6)** | `n_entities < 0.95 * max` for pods and debris, `< 0.50 * max` for wreckage; with a full universe at most 1 alloy | Low | Wegolite's cap is `MAX_ENTITIES = 256` non-dead dynamic entities (`src/sim/world/ids.ts:53`), so the thresholds become 243 and 128 (derived, scaled proportionally from 2048). **Drop the frame-time term** (`getTimeDelta < 0.125`): a deterministic sim cannot read it; record the divergence. A refused `spawnEntity` (`storeFull`) must leave the id counter untouched (already guaranteed, row 240). |
| **TS-7 Wreckage chunks** | R5 step 6: up to 3 per kill, `(mass/6000)^(1/4)` rule, fade by heat | Med | `kind: "wreckage"` exists. Non-colliding, `CLASS_NO_DRAW`, off the scanner, tumbling, energy-decay lifetime (see R5, LOW confidence on duration). Model `wreck1.dat` not vendored (as TS-5). Hash and snapshot cost is the same bump as TS-5. |
| **TS-8 Lasers hit the station and buoys (R3)** | `canCollide` ships all join the laser candidate list; a beam stops at the hull | High | Closes todo `2026-11-15-lasers-and-ident-hit-stations-and-buoys`. Needs hull tables (octree plus the solid subentities) for `coriolis-station` and `buoy` in the lazy hull artifact (the build-time octrees already exist for mass, rows 259 and 260, but the runtime artifact holds only ten hulls), and a **subentity branch in `firstShipHit`** (the file says it is not ported). Statics are `StaticEntity` records with fixed ids 1-5 and no energy field, so the station and buoys need an energy bank (25000 / 100 s and 250 / 2 s) to take damage. |
| **TS-9 Ident locks the station and buoys, and later pods (R4)** | `firstEntityTargetedByPlayer` takes every non-player ship that can collide | Med | Sphere test only, no hull needed; needs the static collision radii (row "Draw Oolite's navigation buoy" keeps the simulation radius of both buoys at 10 m while the model is ~100 m across; the radius must come from the compiled hull or the sphere test will be wrong). Lock key must not be an entity id outside the world (row 277 admits exactly one holder); use spec key plus layout key. Update the two FIDELITY.md divergence rows and the PROJECT.md row 284. |
| **TS-10 Ship-ship collision damage by mass and closing speed (R6)** | `dam1 = m2*v^2/5e7`, `dam2 = m1*v^2/5e7`, threshold 0.05, 1 m/s apart rule, elastic velocity change | High | New: the collision pass (sphere test, then hull-vs-hull). Needs `isHitByOctree` (`Octree.m:473-595`, about 120 lines, with subentity handling for the station and buoy) beside the existing `isHitByLine`, the player's hull (already in the table as `PLAYER_HULL_KEY`) and a deterministic pair order (ascending id, one resolution per pair). Following the Phase 14 precedent, give it an independent source-cited oracle with fixtures. Collisions change flight dynamics, so the **frozen 20-seed acceptance run must be rerun by hand** after `src/sim/npc/**` or `src/sim/world/**` changes (AGENTS.md), and the "no unexcused hull crossing" detector now has a physical counterpart. |
| **TS-11 Ship-buoy collision damage (R6)** | The buoy is a ship; player and NPC hits scrape it | Med | Same pass as TS-10 plus a buoy hull and a collision radius from the compiled model. A destroyed buoy must be removable from a **static** record (statics are never removed today): the scanner, ident, the witchpoint beacon and `hyperspace-failure.spec.ts` (which parks at 0 m from the witchpoint buoy, row 264) all read it. Decide what a destroyed beacon means (Oolite simply loses it for the visit; jumping rebuilds the system). |
| **TS-12 Player death at zero energy from any cause (R7, R8)** | `getDestroyedBy:` is the one entry for laser, scrape, heat and body contact | Med | Remove the player's energy floor (reversible stub, row 280). One sim-side death function emits `playerDestroyed` and puts the flight state in a terminal `dead` state; hashes of runs that never die must not change (new mode value only when dead). Docked, the player cannot die (6189); `launching` ignores scrape damage (11646). |
| **TS-13 Game-over screen and load of the last save** | "Game Over", score line, "Press Space"; Space skips the 30 s wait; handleGameOver loads the saved game, else the title | Med | App-side. One death path that **autosave, pause and the title flow respect**: no autosave may write the dead state (`canOverwrite`/`autosave()` in `src/app/session/save-controller.ts`); pause, double-Escape and P must not resume a dead ship or unfreeze the timer; with no readable save, return to the title instead of looping. Reuses the warm Load and cold Continue restore (`resetForRestore`, `resume`) and the leg anchor (a death in flight loads the docked or arrival anchor). Rating text depends on kills (LAW-04, out): print "Game Over" and credits only. Two possible dead ends to test: a corrupt or future-version save, and a `?test=1`-tainted session. |
| **TS-14 Player internal damage: cargo pod loss and equipment loss (R7)** | `takeInternalDamage` on every post-shield point of energy damage, collision or laser | High | CBT-08 names it. Needs the in-flight pod-list view of the hold, the damageable-equipment set (4 items in F3), a `_DAMAGED` representation and **save schema v5** (damaged equipment and, if kept, `ship_trade_in_factor`), because a dock or arrival autosave persists the loss; today `profile.equipment` is allow-listed and a `_DAMAGED` key is corrupt. Messages "[x] destroyed." and "[x] damaged." need a HUD message path (exists for other messages). Without a repair path the loss is permanent (Q3). |
| **TS-15 Destroyed ships leave the scanner, targets and world cleanly** | `entityRemoved`, `identLost` on target removal, mass lock recomputed | Low | Existing event plumbing; ident already clears a lock whose ship left (`updateIdentTarget`). Add a test that a destroyed ident target emits `identLost` and no stale id survives (per-world id scope). |
| **TS-16 A visible, non-sim explosion and removal** | Oolite always draws a cloud and flash at destruction (`ShipEntity.m:7958-7964`) | Med | Render-side consumer of `shipDestroyed` (position, radius). No simulation state, no hash. `Cfg/explosions.plist` `oolite-default-ship-explosion`: `count 25, duration 1.5 s, growth_rate 1.5, size 2.5, alpha 0.85`, texture `oolite-particle-cloud2.png` (texture not yet vendored). A flash or burst is enough for the milestone; exact particle fidelity is a differentiator. |

## Differentiators

Valued by an Oolite player and cheap to explain, but the milestone is complete without them.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **D-1 Minimal retaliation, "attacked then attack back"** | Without it a shot NPC just sits there and dies (section 0) | Med | Not Oolite (Oolite delegates to the AI). Could be a generic `shipBeingAttacked` hook that sets the aggressor as target and enters ATTACK_TARGET for the nine hulls, behind a recorded divergence row, until the priority-AI phase replaces it. Recommended only if Q1 is answered "visible fights". |
| **D-2 Evasive reaction on being hit (`noteTakingDamage`)** | A hit smart ship jinks (`ShipEntity.m:7728-7739`) | Low | Behaviours already exist (Phase 14); needs the trigger on `shipHit` for ships that have a hostile target. |
| **D-3 Explosion momentum on neighbours** | A kill pushes nearby ships (`dealMomentumWithinDesiredRange`, `ShipEntity.m:7680-7700`) | Low | `0.125 * mass` over `2.5 * collision_radius`; deterministic, cheap, easy to unit test. |
| **D-4 Hull sparks and low-energy burning** | Visual damage state below 20 % energy (`ShipEntity.m:2275-2285`, `Universe.m:5528-5546`) | Med | Render only. |
| **D-5 Oolite explosion-cloud particles, ring, flash** | Authentic look (`explosions.plist`) | Med | Render only; `ring` at `mass > 500000` with 25 %. |
| **D-6 World keeps running during the 30 s game-over window** | Oolite keeps the universe live while the player's wreck drifts (`performDeadUpdates`) | Low-Med | Wegolite may simply freeze the world; either is valid, but pick one and test that the dead state hashes deterministically. |
| **D-7 Game-over black-and-white fade** | Authentic (`PlayerEntity.m:3566-3590`, 5 s) | Low | CSS filter on the canvas; no sim effect. |
| **D-8 Minimal 50 % repair at F3 (CBT-12 slice)** | Removes the permanent-loss dead end of TS-14 | Med | `price / 2` re-buy of `<key>_DAMAGED` (R7). Pulls the F3 view-model and `checkFit`/`applyFit` allow-list into the milestone (PROJECT.md row 172, the D-11 peaceful set). Recommended if the owner accepts any permanent equipment loss as "too harsh" (Q3). |
| **D-9 `ship_trade_in_factor` cosmetic wear** | Faithful vulnerability drift (R7 step 3) | Low if saved, trivial if reset on restore | Recommended: do not persist it; reset to 95 on every dock and load, and record the divergence. Persisting it costs another save field for a 75..95 multiplier. |
| **D-10 Buoy subentity fidelity** | The core subentity takes the buoy's laser damage (R3) | Med | The faithful frangible-subentity branch (parent takes 1 %, core takes the rest and detaches when dead). Recommended default: one hull for parent plus core, parent energy only, recorded divergence. |
| **D-11 Station laser response** | None in Oolite without the law layer | n/a | Listed so nobody adds it: stations shot by the player do nothing in v2.3 (`broadcastHitByLaserFrom` is the legal path, LAW-01, out). |

## Anti-Features

Explicitly **not** in v2.3.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|--------------------|
| Missiles, ECM, mines, cascade (Q-mine) damage | Out by the milestone text; `dealEnergyDamage:atRange:` (`ShipEntity.m:7599-7658`) is the missile blast rule | Keep `cascadeIfAppropriate` and `dealEnergyDamage` unported; do not stub them. |
| Escape pod (player and NPC), auto-eject at low energy | DEATH-02, out | The death entry has no pod branch; record the single hook where one will go (`getDestroyedBy:` is called only after the energy check). NPC `abandonShip` (`ShipEntity.m:11569-11572`) is skipped, so Vipers die instead of ejecting. |
| Bounty, kill credit, combat rating, legal status, police response | LAW-01..04, out | Game-over text omits the rating; `shipDestroyed.killer` carries the id for later use. Do not raise offender status for hitting a station or buoy. |
| Scooping cargo, fuel scoop, tractor beam, pod AI beyond `dumbAI` tumble | CBT-11, out | Pods are inert drifting entities. `canScoop` is ignored, so a scavenger flying into a pod takes ordinary collision damage (recorded deviation). |
| Sun, planet, atmosphere, heat damage, alert condition | DEATH-03 and DEATH-05, DOCK-08, out (todo `add-planet-and-sun-collision`) | `getDestroyedBy` stays the one entry they will call later. Cabin heat from energy hits is already capped at 256 and never kills (`PlayerEntity.m:5669-5677`), so no heat death is reachable. |
| Docking-slot scrape damage and station-hull contact damage | DOCK-09, out; the v1 contact response (Phase 4 union contact proxy, damage-free) stays | **Do not** route station-hull contact through TS-10. Oolite would, and a 5 m/s bump into the Coriolis would then be lethal (R6), but that path also carries the docking-corridor exemption (`CollisionRegion.m:327-340`) that Wegolite models differently. Q4 asks the owner to confirm. |
| Audio (explosion, hit, game-over sounds) | AUD-*, out | Events already exist for a later consumer. |
| Asteroids, boulders, rock splintering, mining laser effects, `being_mined` | Mining, out | The rock branch of `becomeExplosion` (`ShipEntity.m:7992-8040`) is not ported. |
| NPC internal damage or equipment loss | Oolite does not have it | Only the player has `takeInternalDamage`. |
| A server, a new database, or saving a dead state | AGENTS.md constraint 3; PROJECT.md | The dead state is never written; the existing slot is read back. |
| Raising `MAX_ENTITIES` to match Oolite's 2048 | Changes the hash domain and the draw budget | Scale the 0.95 and 0.50 thresholds to 256 instead (TS-6). |
| Unbounded per-frame effect entities in the sim | Particles are not simulation state | Explosion clouds, sparks and flashes stay render-only (TS-16). |
| Calling `Math.random`, the clock or frame time in the new code | `src/sim` rule (FOUND-12) | Every new draw uses the entity's `combat` stream (or the world stream for the populator); the `getTimeDelta < 0.125` term is dropped. |

## Feature Dependencies

```
Vendored pod / alloy / wreck models + compiled cargo fields  -> TS-5, TS-7
NPC cargo at spawn (system market into populate)              -> TS-5
World snapshot v4 + inert golden regeneration (4th)           -> TS-2, TS-5, TS-7, D-6
TS-1 destruction function  -> TS-3, TS-5, TS-7, TS-11, TS-12, TS-15, TS-16
TS-2 NPC fire gate          -> (needs TS-1 to matter) -> TS-3
Hull tables for station and buoy (octree + subentities)       -> TS-8, TS-10 (station/buoy part), TS-11
isHitByOctree port + collision pass                           -> TS-10, TS-11
Static energy banks and removable buoy                        -> TS-8, TS-11
Static collision radii from compiled hulls                    -> TS-9, TS-10, TS-11
TS-12 death function -> TS-13 game over -> existing warm Load / Continue, save-controller guards
TS-14 internal damage -> in-flight pod-list view + save schema v5 (+ optional D-8 repair)
Arrival and launch poses must not overlap the buoy hull       -> TS-11 (see Q5)
```

Cross-cutting rules every item above inherits: determinism (FOUND-12), per-world id scope (no id held outside a world, rows 238, 269, 277), `FIDELITY.md` row per ported mechanic, a Key Decisions row per divergence, and AGENTS.md gates (`verify` for browser-facing code, `verify-full` for persistence, render and input; the 20-seed acceptance run by hand after `src/sim/npc/**` or `src/sim/world/**`).

## MVP Recommendation

Prioritise, in this order (each step is shippable and testable on its own):

1. **Destruction core, no spawn side effects** (TS-1, TS-15, TS-3): NPCs die at zero energy and are removed, the station is immune. Smallest change that makes lasers consequential; reuses the existing commit path.
2. **Hits on statics and ident** (TS-8, TS-9): hull tables for station and buoy and the subentity branch; closes the open todo and is a prerequisite for collisions with both.
3. **Player death and game over** (TS-12, TS-13): the one death function and the screen that loads the last save. Test with the player's own lasers on a test pilot and with injected damage; no other system is needed.
4. **NPC fire by Oolite's gate** (TS-2, TS-4): the snapshot bump, the new fields and the un-skipped `fireMainWeapon:` sites; run the 20-seed acceptance run.
5. **Cargo, scrap and wreckage with the cap** (TS-5, TS-6, TS-7, TS-16): content vendoring, spawn-time cargo from the market, pods and chunks, the explosion effect.
6. **Collisions** (TS-10, TS-11): the collision pass and `isHitByOctree`, with the buoy as a removable static.
7. **Internal damage** (TS-14, with D-8 if accepted): save schema v5 and the in-flight pod view; last because it needs the persistence work and a damage source (steps 4 and 6) to be reachable.

Include one differentiator only if it is nearly free: **D-3** (explosion momentum) and **D-2** (evasive on hit) are Low. **D-1** (retaliation) is the one owner-gated choice (Q1).

Defer: D-4, D-5, D-7 (render polish), D-10 (buoy core fidelity), D-9 (trade-in wear persistence).

## Open Questions for the owner (the roadmap should not proceed past these)

| # | Question | Recommendation |
|---|----------|----------------|
| Q1 | Who pulls the trigger? With `ai: null` ships and no priority AI, NPCs never fire in the shipped game. Accept "engine only, proven by test pilots" or add a minimal retaliation (D-1)? | Add D-1 as a recorded divergence only if the milestone must be visible to a player; otherwise keep it test-proven and say so in the requirements. |
| Q2 | Buoy hull: port the frangible core-subentity branch (D-10) or one merged hull? | Merged hull, recorded divergence. |
| Q3 | Permanent equipment loss without repair, or add the 50 % repair slice (D-8)? | Add D-8; a permanently lost 15,000 dc docking computer with no recourse is a dead end the owner is unlikely to want. |
| Q4 | Station-hull contact stays damage-free (v1 response)? | Yes, until DOCK-09. State it in the requirements so a reviewer does not "fix" it. |
| Q5 | Arrival and launch poses vs new buoy collision: Wegolite draws the arrival offset itself (rows 181, 182) and `hyperspace-failure.spec.ts` parks at 0 m from the witchpoint buoy. Confirm that a sanctioned fixture change is allowed (the same constraint blocked buoys from blocking hyperspace, row 264). | Allow it with a Key Decisions row; assert in a unit test that no arrival draw overlaps the buoy hull. |
| Q6 | Is a wreckage lifetime pinned from the source formula (LOW confidence) or measured against a running Oolite first? | Pin the formula, mark it LOW in FIDELITY.md, and add it to the deferred real-Oolite check todo (`2026-11-14-measure-oolite-reference-in-docker`). |

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Damage, destruction, cargo, collision and death rules (R1, R5, R6, R7, R8) | HIGH | Read line by line from the checkout; the arithmetic examples are marked derived. |
| NPC fire gate (R2) | HIGH | Read in full (`fireWeapon:`, `onTarget:`, cooling); the laser numbers are plist values to re-verify against `LASER_STATS`. |
| Wreckage duration (R5) | LOW | Derived from the heat loop only; no running Oolite here. |
| Station and buoy hit rules (R3, R4) | HIGH for the rules, MEDIUM for the subentity details | Frangible and subentity behaviour read at `ShipEntity.m:10409-10414` and `1323-1357`, but the compiled subentity radius and octree of the station were not re-derived. |
| Wegolite dependency and effort claims | MEDIUM | From reading `src/sim/combat/step.ts`, `hit.ts`, `world/populate.ts`, `control-impl.ts`, `outfitting.ts` and PROJECT.md; the snapshot and save bumps are inferred from the frozen-record rules, not prototyped. |

## Sources

- Oolite checkout `/home/opencode/git/oolite`: `src/Core/Entities/ShipEntity.m` (1858-2003, 2213-2425, 7599-7773, 7814-8336, 9851-10007, 10360-10466, 10856-11156, 11418-11676), `ShipEntity.h` (60-120), `PlayerEntity.m` (99, 3551-3644, 5599-5753, 6097-6242, 7145-7215, 8560-8600, 9109-9338, 9440-9540), `PlayerEntity.h` (315, 331, 1294-1297), `PlayerEntityControls.m` (4032-4043), `Universe.m` (2538-2680, 2961-2968, 3854-4010, 5497-5721), `CollisionRegion.m` (226-374), `Octree.m` (473-595), `OOTypes.h` (166), `OOEquipmentType.m` (210-247, 504-520), `Resources/Config/shipdata.plist`, `equipment.plist`, `descriptions.plist`, `explosions.plist`.
- Wegolite: `.planning/PROJECT.md` (Key Decisions rows 172, 238-240, 259-260, 264, 277-295), `.planning/milestones/v2.0-REQUIREMENTS.md` (CBT-08, CBT-15, DEATH-01..05, DOCK-09, LAW-*), `.planning/todos/pending/2026-11-15-lasers-and-ident-hit-stations-and-buoys.md`, `src/sim/combat/{step,hit,aim,ident,shields}.ts`, `src/sim/world/{populate,control-impl,ids,entity}.ts`, `src/sim/npc/behaviours/*.ts`, `src/sim/events.ts`, `src/sim/player/outfitting.ts`, `src/app/session/save-controller.ts`, `src/content/generated/ships-client.json` and `ships-npc.json`, `third_party/oolite/Models`.
