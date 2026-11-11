# Feature Landscape: v2.0 Foundation & Combat

**Domain:** Faithful browser port of Oolite's NPC traffic, priority AI, combat, legal status, death/escape and sound
**Milestone:** v2.0 Foundation & Combat (subsequent milestone; v1 flight, docking, trading, outfitting, hyperspace and saves already ship)
**Researched:** 2026-11-11
**Overall confidence:** HIGH for every number cited to a source line (read directly from the Oolite checkout); MEDIUM for derived arithmetic (marked "derived"); LOW items are flagged inline.

## How to read this file

- **Source of truth.** The Oolite checkout at `/home/opencode/git/oolite` (HEAD `4bb1f53de`). FIDELITY.md pins `7437f22`. Between the pin and HEAD only `PlayerEntityControls.m`, `PlayerEntityKeyMapper.m`, `PlayerEntityLoadSave.m`, `PlayerEntityStickMapper.m`, `HeadUpDisplay.m`, joystick files and `descriptions.plist` (47 lines) changed. Rules in `PlayerEntity.m`, `ShipEntity.m`, `StationEntity.m`, `DockEntity.m`, `Universe.m`, all other plists in `Resources/Config`, and all `Resources/Scripts` / `Resources/AIs` are identical at both commits. **Citations to `PlayerEntityControls.m` and `HeadUpDisplay.m` are pin (`7437f22`) line numbers**; `descriptions.plist` strings are cited by key.
- **Path shorthand.** `E/` = `src/Core/Entities/`, `C/` = `src/Core/`, `Cfg/` = `Resources/Config/`, `S/` = `Resources/Scripts/`, `AI/` = `Resources/AIs/`.
- **Units.** Oolite credits are integer decicredits (dc). A `bounty` of 50 pays `10 * 50 = 500 dc = 50.0 Cr`. Distances are metres. `SCANNER_MAX_RANGE` = 25 600 m (`E/Entity.h:49`).
- **Complexity** is for a TypeScript port inside the new multi-entity world model: Low (data plus a few lines), Med (a subsystem with several rules), High (new infrastructure or a long tail of rules).
- **Test-first.** Each area ends with a **Player can ...** list that can be lifted into requirements as testable statements.

---

## Table Stakes

Missing any of these and the game does not feel like Oolite combat.

### TS-1 View directions and weapon facings

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Four flight views | Keys `1` forward, `2` aft, `3` port, `4` starboard (F1-F4 are alternate codes in flight). A switch shows a 3 s message "Forward View" / "Aft View" / "Port View" / "Starboard View". From a GUI screen the switch first returns to the main view. | `PlayerEntityControls.m:368-371, 1075-1089`; `C/Universe.m:6074-6130`; `descriptions.plist` keys `forward-view-string` ... | Low |
| View selects the weapon facing | `switchToThisView` sets `currentWeaponFacing` to the matching facing and reloads that weapon's stats. Each of the four facings owns its laser type, heat and shot timer. | `PlayerEntityControls.m:4608-4645`; `E/PlayerEntity.m:2481-2510` | Low |
| Facing without a laser | `fireMainWeapon` returns NO for `WEAPON_NONE`: no heat, no sound, no message. A new Cobra has a **pulse** laser forward only (`oolite_template_cobra3-player` overrides the Cobra III's beam); `weapon_facings = 15` allows all four mounts. | `E/PlayerEntity.m:5452-5480`; `Cfg/shipdata.plist:1348, 1441` | Low |
| Targeting follows the view | `firstEntityTargetedByPlayer` rotates the aim axis by the view (aft 180 deg, port +90, starboard -90) and picks the nearest ship or wormhole whose collision radius contains the axis, within `SCANNER_MAX_RANGE - 100` m. | `C/Universe.m:5649-5722` | Med |
| Alert condition | Docked, green, yellow (mass lock), red when any of: hull temperature > 0.90, altitude dial < 0.10 (under 4 km), energy < 64 and < 80 % of max, a ship hostile and targeting the player, or a cascade weapon. Entering red plays `warning.ogg` once. | `E/PlayerEntity.h:223-229`; `E/PlayerEntity.m:2893-2994, 5122-5143` | Med |

**Player can ...**
- press 1/2/3/4 in flight and see the camera look forward/aft/port/starboard with the matching view message;
- fire the laser mounted on the facing they are looking along, and fire nothing (no heat, no sound) on a facing with no laser;
- see the condition indicator go red when a hostile ship targets them, when energy is critical, when hull temperature is above 90 %, or when they are below 4 km altitude.

### TS-2 Lasers: types, firing, heat

Tuples in `equipment.plist` are `(techLevel, priceDc, name, key, description, {...})`; `weapon_info` carries the rest.

| Laser | TL | Price dc | Range m | Energy/shot | Damage | Recharge s | Heat/shot | Continuous fire to cutout (derived) | Colour |
|---|---|---|---|---|---|---|---|---|---|
| Pulse `EQ_WEAPON_PULSE_LASER` | 3 | 4000 | 12 500 | 0.8 | 15 | 0.5 | 7.0 | about 27 s | red |
| Beam `EQ_WEAPON_BEAM_LASER` | 4 | 10 000 | 15 000 | 0.5 | 6 | 0.1 | 3.2 | about 8.4 s | yellow |
| Military `EQ_WEAPON_MILITARY_LASER` | 10 | 60 000 | 30 000 | 1.1 | 12 | 0.1 | 4.25 | about 6.0 s | magenta |
| Mining `EQ_WEAPON_MINING_LASER` | 10 | 8000 | 12 500 | 1.4 | 50 | 2.5 | 10.0 | never (4/s heat < 6/s cooling) | blue |

Source: `Cfg/equipment.plist:126-205` (pulse :126, beam :144, mining :164, military :185). The Thargoid laser (:357) is NPC-only. Derivation: net heat rate = `heat/recharge - 6`; time to the 217.6 cutout = `217.6 / net`.

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Fire gate | Key `a` (held). Allowed when `shot_time > weapon_recharge_rate` (strict) for the current facing, weapons online, temperature below the cutout, and `energy > energy_use`. | `PlayerEntityControls.m:1185-1190`; `E/PlayerEntity.m:5452-5500` | Low |
| Heat model | Per-facing temperature, max 256. Cooling `6.0/s` on all four facings every update. Cutout at `0.85 * 256 = 217.6`: fire refused with "Weapon system overheated." (3 s). `[weapon-overheat]` has no mapped sound. | `E/ShipEntity.h:115-117`; `E/PlayerEntity.h:277`; `E/PlayerEntity.m:2481-2485, 5460-5465` | Low |
| Energy cost | `energy -= weapon_energy_use`; if `energy <= use` the shot is refused with "Weapon system inactive (no energy left)." (3 s). | `E/PlayerEntity.m:5472-5480` | Low |
| Hit-scan | An instant ray from the facing's weapon-port offset along the facing axis (no convergence). It tests every collidable ship (bounding-sphere gate, then hull octree), takes the nearest hit within laser range and applies `weapon_damage` via `takeEnergyDamage`. **Planets and suns never block it.** A miss that passes within cosine 0.995 of the player's locked target warns that ship (`ATTACKER_MISSED`). | `C/Universe.m:5549-5648`; `E/ShipEntity.m:10360-10450` | High (ray vs hull in the world model) |
| Beam visual | The shot entity lives 0.09 s as a flickering beam in the laser colour; a hit also spawns a flash, or, if the target is below 50 % energy, a hull-spark cloud and (probability `energy*rand < damage`) a wreckage chunk. | `E/OOLaserShotEntity.m:36-51`; `C/Universe.m:5528-5547` | Med |
| Buying lasers | Outfitting shows the laser, then a facing sub-list (Forward / Aft / Port / Starboard) with price per facing. The old laser on that facing is traded in at full catalogue price. "Remove Laser" (`EQ_WEAPON_NONE`) is free. | `E/PlayerEntity.m:8410-8470, 9190-9215, 9345-9390`; `Cfg/equipment.plist:109-125` | Med |

**Player can ...**
- hold `a` and see a red pulse beam fire twice per second, with the laser-temperature gauge rising, and the shot refused with "Weapon system overheated." after roughly 27 s of continuous fire;
- see a beam laser fire ten times per second and overheat in about 8 s;
- fire again once the laser temperature has fallen below 85 %;
- hit a ship at 12.4 km with a pulse laser but not at 12.6 km;
- buy a beam laser for the aft mount in F3 and have the old aft laser refunded at full price.

### TS-3 Energy banks and shields

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Player pools | Cobra `max_energy = 256`, `energy_recharge_rate = 4`/s. Forward and aft shields start and max at 128 (`BASELINE_SHIELD_LEVEL`), recharge 2.0/s each. The HUD draws `max_energy/64` = 4 energy-bank bars. | `Cfg/shipdata.plist:1296, 1333`; `E/ShipEntity.h:101`; `E/PlayerEntity.m:1533-1537`; `HeadUpDisplay.m:1974-2000` | Low |
| Recharge allocation | Each update: `energy += recharge*dt`; each shield's deficit capped at `shield_rate*dt`. If either shield is under 25 % of max, all banked energy may go to shields; otherwise shields only take energy above `0.1 + 25 % of max_energy`. The weaker shield is charged first. Energy given to shields is deducted from the banks. | `E/PlayerEntity.m:2575-2630` | Med |
| Which shield takes a hit | The side is the sign of the attacker's forward offset (`d_forward >= 0` is forward, else aft). Shield absorbs first, overflow reduces `energy`; `energy <= 0` is death. | `E/PlayerEntity.m:5646-5690` | Low |
| Damage heats the cabin | Damage that reaches the banks adds `amount * (mass > 400000 ? 200000/mass : 0.5) / heatInsulation` to cabin temperature, never above 256 from this source. | `E/PlayerEntity.m:5668-5678`; `E/ShipEntity.h:64-67` | Low |
| NPC "shields" | NPCs have no shield pools. `EQ_SHIELD_BOOSTER` adds +256 to an NPC's max energy; `EQ_SHIELD_ENHANCER` also x1.5 recharge. NPCs lose `energy` directly. | `E/ShipEntity.m:3240-3250, 3290-3305, 11418-11570` | Low |
| Docking restores | On docking: shields and energy to max, laser temperature 0, cabin temperature 60. | `E/PlayerEntity.m:6321-6325` | Low |
| Gauges | Shield bars red < 25 %, yellow < 80 %, else green. Cabin temperature bar green to 25 %, yellow to 80 %, red above, flashing above 90 %. Laser temperature green to 25 %, yellow to 80 %, red above. | `HeadUpDisplay.m:2045-2075, 2188-2250` | Med (HUD) |

**Player can ...**
- see forward and aft shield bars full on launch, and four energy-bank bars;
- take a hit from the front and see only the forward shield drop, then recover at about 2 units/s;
- take a hit from behind and see only the aft shield drop;
- see the energy bars drop only after the facing shield reaches zero;
- dock and find shields, energy and laser temperature fully restored.

### TS-4 Damage, equipment damage, destruction

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Internal damage rolls | When damage reaches the banks, repeat while `amount > 0`: internal hit if `(rand & 31) < amount`, then `amount -= 32`. Damage of at least 32 always rolls once. | `E/PlayerEntity.m:5690-5698`; `E/PlayerEntity.h:331` | Low |
| What an internal hit breaks | `n_considered = (maxCargo + mass/10000) * tradeInFactor/100`; `rand % n_considered` below the pod count destroys that pod ("X destroyed.", 4.5 s); then equipment, weighted by `damage_probability` (default 1.0; 0 for missiles, large cargo bay, passenger berths, trumbles); then cosmetic trade-in loss. | `E/PlayerEntity.m:6097-6185`; `Cfg/equipment.plist` `damage_probability` | Med (needs ship mass) |
| Equipment damage effect | The item is removed and `<KEY>_DAMAGED` added; message "X damaged." (4.5 s). The function stops (ECM will not fire, scoops stop, docking computer fails). F3 offers "Repair: X" at **50 %** of catalogue price; F5 shows "X (N/A)". | `E/PlayerEntity.m:6144-6170, 8372-8412, 9113-9119, 9333-9340`; keys `@-damaged`, `equip-repair-@`, `equipment-@-not-available` | Med |
| Collision damage | Ship vs ship (including the station hull): each side takes `otherMass * closingSpeedAlongLoc^2 / 50 000 000` when > 0.05, through shields for the player. A Coriolis (mass 455 223 200) at 10 m/s is about 910 damage. | `E/ShipEntity.m:11020-11182, 12504` | High (mass plus hull contact) |
| Dock-slot scrape damage | In the docking slot a scrape applies `5 * dt * flightSpeed` damage per tick; a ship straddling opposite slot edges is a fatal collision. **v1 deliberately has no damage here** (`src/sim/dock/step.ts` emits `scrape` only). | `E/DockEntity.m:698, 730-740` | Med |
| NPC death | `energy <= 0`: `noteTargetDestroyed` credits the killer, then `becomeExplosion`. Before that, a ship under 12.5 % energy (or under 64 and under twice the hit) with an escape pod ejects 25 % of the time. | `E/ShipEntity.m:11555-11585, 7768-7772` | Med |
| NPC explosion | Cloud + flash; ships above 500 000 mass add a ring 25 % of the time; sub-entities explode; `dealMomentumWithinDesiredRange(0.125*mass)` shoves neighbours. **Explosions are silent in core Oolite.** | `E/ShipEntity.m:7891-8130, 7680-7700` | Med |
| Wreckage | `n_alloys = (mass/6000)^0.25`; wrecks `floor(rand*(n_alloys+2))` capped at 3, only when entity count < 50 % of max. Wreck mass is 10 % of the ship (cube-root rescale), temperature 1000, huge insulation, energy = half a 100-850 lifetime, so heat damage (`dt*1000`) burns it out fast (derived 0.05-0.4 s, LOW confidence: verify in-engine); non-colliding, non-scoopable. | `E/ShipEntity.m:8040-8070, 1858-1870, 2272`; `C/Universe.m:5497-5526` | Med |
| Scrap metal | `floor(rand*n_alloys)` scoopable `alloys` pods (1 t, `CLASS_CARGO`); a Cobra III (about 215 000 mass) yields 0-2. | `E/ShipEntity.m:7916, 8078-8107` | Low |

**Player can ...**
- be hit with shields down and occasionally see "X damaged.", then find that system dead (a damaged ECM does not fire) until repaired;
- see a destroyed cargo pod listed ("Food destroyed.") and lose that pod from the hold;
- repair a damaged ECM from the F3 screen at half its original price;
- shoot a trader to zero energy and see it explode with a flash, loose cargo pods and a few alloy pods;
- scrape the docking slot at speed and lose shield, then energy.

### TS-5 Missiles and ECM

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Arm / lock / fire / safe / cycle | `t` arms the active pylon; with a ship in the crosshair it locks ("Missile locked onto X."), otherwise "Missile armed." `m` fires **only when locked**. `u` makes all missiles safe ("Missiles on safety."). `y` selects the next pylon. HUD icons: green safe, yellow armed, red locked. Weapons offline blocks it all. | `PlayerEntityControls.m:1216-1232, 1393-1425, 4775-4810`; `HeadUpDisplay.m:2370-2390` | Med |
| Lock acquisition and loss | While armed with no target, every update scans the view cone. A locked target beyond scanner range, cloaked, docked, entering witchspace or scooped is dropped: "Target lost." + boop; status reverts to armed. | `E/PlayerEntity.m:3595-3640, 3699-3740` | Med |
| Launch | New ship from role `EQ_MISSILE` at the pylon, velocity = forward * (speed + 250), initial speed 150, owner = player, target = locked ship. The target gets `INCOMING_MISSILE` (a player victim sees "Incoming missile." 4.5 s and hears `warning.ogg`). Not collidable for its first 0.25 s. | `E/PlayerEntity.m:5230-5270, 5160-5166`; `E/ShipEntity.m:10563-10675, 1858-1870` | Med |
| Missile stats | `ai_type oolite-missileAI.js`, max speed 750, thrust 250, `max_energy 5`, `CLASS_MISSILE`, `oolite_missile_range 30000`, `proximity 25`, `blastPower 180`, `blastRadius 32.5`, `blastShaping 0.1`. | `Cfg/shipdata.plist:2680-2722` (energy :2701, speed :2704, blast :2712-2716, thrust :2718) | Low (data) |
| Missile behaviour | Priorities: self-destruct beyond 30 km travelled; intercept target; if target cloaks, fly to last known coordinates; with no target, self-destruct. Within `proximity` 25 m it "achieves desired range": blast and explode. | `AI/oolite-missileAI.js:33-85`; `S/oolite-priorityai.js:2690-2700, 3738-3765, 5755-5775` | High (AI port plus steering) |
| Blast damage | `dealEnergyDamage(180, 32.5, 0.1)`: every entity within `min(range*sqrt(180), 25 600)` m takes 180 within 32.5 m of its surface, `180/d^2` beyond (d = surface distance / 32.5). Credited to the missile's owner. 180 on a full-shield Cobra: shield 128 to 0, 52 to energy. | `E/ShipEntity.m:7599-7650` | Med |
| Lasers kill missiles | A missile has 5 energy: any laser hit (>= 6 damage) destroys it (plain explosion, no blast). | `Cfg/shipdata.plist:2701`; `E/ShipEntity.m:11418-11570` | Low (falls out of damage) |
| ECM (player) | `e` with `EQ_ECM` fitted, weapons online, not already running: `ecm.ogg`, "ECM system activated." (3 s). Drains 20 energy/s for at most 2.5 s (about 50) or until energy runs out ("ECM system deactivated (no energy left)."). | `PlayerEntityControls.m:1426-1437`; `E/PlayerEntity.m:2540-2556`; `E/PlayerEntity.h:270-271` | Low |
| ECM effect | An invisible blast entity emits 4 pulses at 0.5 s steps with radii 6400, 12 800, 19 200, 25 600 m. Every ship in radius gets the `ECM` message: standard missiles explode on the first pulse that reaches them; hardened missiles ignore 90 % of pulses (of the 10 %, half detonate in place, half explode harmlessly). A ship hit plays `[player-hit-by-ecm]`; the player's scanner fuzzes for 1.25 s. | `E/OOECMBlastEntity.m:33-100`; `S/oolite-priorityai.js:5669-5715`; `AI/oolite-missileAI.js:90-106`; `E/PlayerEntity.m:5172-5174, 5367-5382`; `E/PlayerEntity.h:329` | Med |
| NPC use | Ships with `EQ_ECM` fire it when attacked with a missile (stations too); `has_ecm` is a fuzzy probability per ship (0.15 on a Cobra III). | `S/oolite-priorityai.js:5250-5290, 5740-5775`; `E/ShipEntity.m:336-343` | Med (AI port) |
| Purchase | `EQ_ECM` TL2 6000 dc; `EQ_HARDENED_MISSILE` TL9 3500 dc (launch sound `[ecm-missile-launch]`); standard missile 300 dc already in F3. | `Cfg/equipment.plist:37-44, 278-292` | Low |

**Player can ...**
- press `t` with a ship in the crosshair, see "Missile locked onto <ship>." and the missile icon turn red, press `m` and see the missile leave the pylon and hit;
- press `m` with no lock and see no missile leave;
- press `u` and see "Missiles on safety.";
- press `e` and see standard missiles within 25 km explode, with about 50 energy drained;
- see "Incoming missile." and hear a warning when an enemy fires at them;
- shoot a missile with the laser and see it explode.

### TS-6 Cargo pods, scooping, jettison

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Cargo on death | Each pod survives with chance 70 %, reduced after each success by 30 points for NPCs (70, 40, 10, 10 ...) or 20 for the player (70, 50, 30, 10), never below 10 %; at most 15 pods. Pods appear at random points in the hull box with +/-10 m/s drift plus ship velocity, random orientation, `CLASS_CARGO`. | `E/ShipEntity.m:7814-7888` | Med |
| What NPCs carry | `setCargoFlag`: `num = likely_cargo*(0.5+rand)` capped by hold size (and 200); plentiful/scarce/contraband/pirate pools by role (traders plentiful or scarce goods; pirates `rand % (1 + num/2)` illegal pods). | `E/ShipEntity.m:7320-7370`; `S/oolite-populator.js:1383-1450, 1696-1735` | Med |
| Scoop eligibility | The ship needs a cargo scoop (`EQ_FUEL_SCOOPS` provides `EQ_CARGO_SCOOPS`), a hold that is not full, a target of `CLASS_CARGO` with a cargo type, **in front** of the ship and, for the player, **below** the up axis (underside). | `E/ShipEntity.m:11183-11210, 3537-3548`; `E/PlayerEntity.m:4430-4435`; `Cfg/equipment.plist:45-53` | Med |
| Tractor sequence | On contact the pod gets `BEHAVIOUR_TRACTORED` (AI suspended); spring forces (`TRACTOR_FORCE` 2500 / mass) pull it in; it is taken in at `2 * radius`, and lost if more than 250 m from the scooper or the scoop stops working. | `E/ShipEntity.m:3729-3800, 11211-11245`; `E/ShipEntity.h:94` | Med |
| Scooped result | Commodity message (e.g. "1 t Food", 4.5 s); `scoop.ogg` every 0.5 s while scooping; pod goes to the front of the hold. A full hold gives `[hold-full]` boop and "Cargo hold full." (4.5 s). On docking, goods enter the manifest as ordinary cargo. | `E/ShipEntity.m:11249-11350`; `E/PlayerEntity.m:3099-3110, 5152-5160`; `E/PlayerEntitySound.m:386-400` | Med |
| Jettison | `D` (Shift-d) ejects the front pod ("X ejected."); refused above 4x max speed ("Cargo ejection system offline (speed too high)."); 0.5 s between pods; `R` rotates the next commodity. Ejected pods can be re-scooped. | `E/PlayerEntity.m:5928-5945`; `PlayerEntityControls.m:1467-1480` | Low |
| Hold bookkeeping | Pods load into the hold at launch and unload into the manifest on docking. | `E/PlayerEntity.m:6336, 6425` | Med (v1 manifest) |

**Player can ...**
- destroy a loaded freighter and see up to 15 cargo pods drift from the wreck;
- fly the underside of a Cobra with fuel scoops over a pod and see it pulled in with "1 t <Commodity>" and a scoop sound;
- fly a pod above the nose and see it not scooped;
- see "Cargo hold full." with a full hold;
- dock and find the scooped goods in the F5 manifest and sellable at F8;
- press Shift-D to eject cargo and re-scoop it.

### TS-7 Legal status, bounty, police, kills, rating

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Status bands | `legalStatus` int: 0 **Clean**, 1-50 **Offender**, 51 and above **Fugitive** (`< 1`, `< 51`). F5 shows the band. Saved as `legal_status`. | `C/OOConstToString.m:404-422`; key `legal_status`; `E/PlayerEntity.m:843, 1414` | Low |
| Offences are bit flags | `markAsOffender(v)` does `legalStatus \|= v` (**bitwise OR, not addition**). Values: **7** seen by police (hitting a clean ship in sight), **8** distress-call aggressor, **15** attacked a police ship, **63** attacked the main station (native path also marks 64, or 96 for a mine, x1.5 when the attacker's bounty is already at least that), **64** killed a police ship (`collectBountyFor`), contraband exports = sum of legality x tons. | `E/PlayerEntity.m:6024-6040, 6042-6075`; `S/oolite-priorityai.js:5161-5170, 5362-5372, 5987, 6033`; `E/StationEntity.m:1116-1145`; `E/ShipEntity.m:8338-8345, 11520-11535` | Med |
| Who sees an offence | Hitting a ship whose `bounty` is already > 0 is not an offence. For a clean victim of class neutral/station/buoy/police/military/player: the **main station, only if the victim is inside station aegis**, and every **police ship within scanner range of the victim** get `offenceCommittedNearby` and mark the attacker. Both-clean fights are re-attributed when the victim is already fighting. | `E/ShipEntity.m:12261-12304`; `S/oolite-priorityai.js:5111-5172` | Med |
| New-system amnesty | Every hyperspace arrival (and wormhole exit) halves legal status. | `E/PlayerEntity.m:6887`; `C/Universe.m:1061` | Low |
| Escape-pod reset | Ejecting sets legal status 0. | `E/PlayerEntity.m:5893-5894` | Low |
| Smuggling | Every Coriolis, dodecahedron and icosahedron station is `market_monitored`. Leaving the dock marks the player with the sum of `legality_export * tons held` (`slaves` 1, `firearms` 1, `narcotics` 2 per ton). Import legality is 0. | `E/PlayerEntity.m:6407-6416`; `Cfg/shipdata.plist:1706, 1895, 2352`; `Cfg/trade-goods.plist` | Low |
| Police response (AI) | Priority list: fight; respond to distress; **attack any fugitive (bounty > 50)** on sight; attack "serious" offenders (bounty > `fineThreshold`); "fine" offenders with `0 < bounty <= fineThreshold` that are neutral ships or the player (`markTargetForFines`); collect escape pods. `fineThreshold = 50 - government*6` (Anarchy 50 ... Corporate State 8; Lave, a Dictatorship, 32). | `AI/oolite-policeAI.js:60-100`; `S/oolite-priorityai.js:841-848, 2185-2225, 3146-3160` | High (AI port) |
| Fines | A police ship marks the player (`being_fined`). At the next dock at the **main** station: `fine = (500 + (gov < 2 or gov > 5 ? 500 : 0)) * legalStatus` dc. If credits fall short, status drops by the proportion paid and credits go to 0; otherwise status resets to 0 and credits fall by the fine. Costs 24 h. `being_fined` clears on witchspace exit. | `E/PlayerEntity.m:10450-10478, 6363-6369, 6980`; `E/ShipEntity.m:12434-12440`; keys `fined-@-credits`, `oolite-comms-markForFines` | Med |
| Docking computer and fines | A fast autodock with `legalStatus > 0` marks the player for fines when `((rand & 1023) / (1 + government)) < legalStatus`. It also costs 20 min. | `PlayerEntityControls.m:4724-4740` | Low |
| Station refuses | The main station refuses docking instructions and docking-computer use to a **fugitive** (`legalStatus > 50`): "Station refuses to issue docking instructions." (4.5 s), `warning.ogg`, autopilot disengages; comms `[station-docking-refused-to-fugitive]` ("%H Station does NOT welcome fugitives!"). **Manual docking through the slot is not blocked.** NPC fugitives dock as normal. | `E/StationEntity.m:401-416`; `PlayerEntityControls.m:4700-4715`; `E/PlayerEntity.m:5174-5186` | Low |
| Red-alert lockout | Fast autodock (Shift-C, Wegolite's `dockingComputer`) is refused while alert is red: "Red Alert! Cannot engage autopilot." This changes the existing v1 docking computer. | `PlayerEntityControls.m:4653-4665`; key `autopilot-red-alert` | Low |
| Attacking the main station | Marks the attacker (63 / 64+), raises station alert, launches police. The main station cannot be destroyed (damage is dropped when `amount >= energy`). | `E/StationEntity.m:1116-1160` | Med |
| Bounty payout | On a kill, `credits += 10 * victim.bounty` dc; message "Bounty: N / Total: M" when the payout is at least 1.0 Cr. Missile and mine kills credit the owner. | `E/PlayerEntity.m:6042-6096`; `E/ShipEntity.m:7599-7650` | Low |
| Kill count | `ship_kills++` for every kill whose ship has `counts_as_kill` (default YES), **including clean innocents (who pay nothing)**. Cargo-class kills with contents, buoys and rocks pay 1/10 and do not count. Every 256 kills: "Right On, Commander!". | `E/PlayerEntity.m:6042-6096`; `E/ShipEntity.m:1527-1530` | Low |
| Rating | `ship_kills`: Harmless < 8, Mostly Harmless < 16, Poor < 32, Average < 64, Above Average < 128, Competent < 512, Dangerous < 2560, Deadly < 6400, ELITE above. Shown on F5 and the game-over screen ("rating (kills)"). | `C/OOConstToString.m:373-402`; key `rating` | Low |

**Player can ...**
- see "Clean" on F5 at start, and "Offender" after shooting an innocent trader in sight of police or inside station aegis;
- shoot a pirate (bounty > 0) in front of police and stay Clean;
- shoot a clean trader with no police and no station nearby and stay Clean (no witness);
- see police turn hostile to a fugitive, and be left alone as a minor offender until police scan them in a lax system;
- jump to another system and see their legal status halved;
- dock after being scanned and see "You have been fined ... Cr" for `500 * status` dc (1000 per point in Anarchy, Feudal, Democracy, Corporate State);
- use the docking computer as a fugitive, read "Station refuses to issue docking instructions.", then dock manually;
- kill a pirate with bounty 35 and see "Bounty: 35.0", the kill count rise, and the F5 rating change at 8 kills.

### TS-8 Player death, escape pod, game over

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Death | `energy <= 0` after shields, heat death or planet/sun collision: view forced aft, large explosion (4.0), ship stops, equipment wiped, `[game-over]` (`bigbang.ogg`). Cannot die while docked. | `E/PlayerEntity.m:6187-6224` | Med |
| Game-over screen | Fades to black and white over 5 s; shows "Game Over", "Score: <rating> (<kills>), <credits> Cr", "Press Space"; restarts after 30 s or on Space, back to the last save or title. | `E/PlayerEntity.m:99, 3551-3650`; keys `gameoverscreen-*` | Med |
| Eject | Escape key (double press within `KEY_REPEAT_INTERVAL` unless `escape-pod-activation-immediate`) with `EQ_ESCAPE_POD` fitted, any time not docked. **There is no automatic ejection for the player**: the key must be pressed before energy reaches 0. | `PlayerEntityControls.m:1439-1466`; `E/PlayerEntity.m:5599-5700` | Low |
| Eject effects | Clock `+43 200 + 5400*(rand & 127)` s (12 h to about 8.2 days); a doppelganger of the ship drifts on; the pod gets an impulse (up 15, back 90); one `EQ_ESCAPE_POD` is removed; **legal status 0**; **cargo and trumbles wiped**; player roles partly forgotten; energy 25; "Escape sequence active." (4.5 s). Ship, equipment, missiles, fuel, credits, kills are kept. | `E/PlayerEntity.m:5806-5925` | Med |
| Pod flight and rescue | For 10 s (`ESCAPE_SEQUENCE_TIME`) the pod coasts, then the player docks at the main station (doppelganger destroyed, ship restored, shields and energy refilled). With no station (interstellar) it ends in game over "Life Support Failure!". | `E/PlayerEntity.m:2678-2745` | Med |
| What "insurance" means | **No cash payout to the player.** Insurance is (a) the pod keeping ship and equipment and (b) rewards for rescuing NPC pods: a rescuee with `insuranceCredits` pays `10 * insuranceCredits` dc; with a bounty it pays the bounty or insurance minus bounty depending on a government roll; no insurance and a bounty pays `(5 + gov) * legalStatus`; neither gives a slave (+1 `slaves`). Processed on docking. | `E/PlayerEntityContracts.m:61-125`; `E/ShipEntity.m:11318-11334` | Med |

**Player can ...**
- fly to zero energy with no pod and see the explosion, aft view, "Game Over / Score: ... / Press Space", then return to the title or last save;
- buy an escape pod in F3 (TL6, 10 000 dc), press Escape twice quickly while taking fire, see "Escape sequence active.", and be docked about 10 s later with the same ship and equipment, no cargo, a Clean record and a clock jump of at least 12 h.

### TS-9 Planet and sun collision, cabin temperature, solar scooping

| Feature | Rule and numbers | Source | Cx |
|---|---|---|---|
| Collision = death | A ship overlapping a stellar body's collision radius is destroyed immediately (`HitAPlanet` / `HitASun`); shields are irrelevant and there is no time to eject. | `E/ShipEntity.m:10991, 11006` | Low |
| Cabin temperature | Starts 60 (`SHIP_MIN_CABIN_TEMP`); heat damage above 256. Each update: `T += speed*airFriction*dt/ins`; if `ext > 100*ins` and `ext > T`: `T += (ext-T)*0.00175*dt/ins`; else if `T > 60`: `T += (ext - 100*ins - T)*0.1*dt/ins`. `ext = 1250*(sunRadius/distance)^2`, x3 if the sun will go nova, x100 if gone nova. | `E/PlayerEntity.m:2605-2680`; `E/ShipEntity.h:63-74` | Med |
| Atmospheric friction | Only planets with an atmosphere: within `10*500 = 5000` m of the surface `airResistanceFactor = clamp(1 - altitude/5000)`; heating uses `0.5*factor` (ignored below 0.005). At 350 m/s near the surface that is +175/s, overheating in about a second. | `E/OOPlanetEntity.m:82, 189, 515-570`; `E/PlayerEntity.m:2461-2475, 2658-2672` | Med |
| Overheat damage | When `T > 256`: `takeHeatDamage(dt*T)` every update, half to each shield, then energy (about 256/s): death within seconds. | `E/PlayerEntity.m:2675, 5755-5790`; `E/ShipEntity.m:11678-11700` | Low |
| Worked sun numbers (derived) | Skimming at `(R/d)^2 = 0.75` gives ext 937.5: from 60 the cabin reaches 256 in about 145 s with insulation 1 and about 290 s with `EQ_HEAT_SHIELD` (insulation 2.0, TL4, 15 000 dc). | arithmetic on the rules above | Low |
| Fuel scoops at the sun | With `EQ_FUEL_SCOOPS`, `(R/d)^2 > 0.75` (distance < 1.155 R) and fuel below capacity: `accumulator += dt*speed*0.01/fuelChargeRate`; +1 fuel unit (0.1 LY) per whole unit; speed must exceed 0.1. "Fuel scoop active." (1 s) and the scoop sound. | `E/PlayerEntity.m:2638-2655, 3099-3110`; `E/PlayerEntitySound.m:386-400` | Low |
| Gauges | Cabin bar = T/256; altitude dial = nearest stellar altitude / 40 000 clamped 0..1; red alert under 0.10 (4 km). | `E/ShipEntity.m:8399-8403`; `E/PlayerEntity.m:4330-4345`; `E/PlayerEntity.h:287` | Low |

**Player can ...**
- see the cabin temperature bar rise as they dive towards the sun and fall as they leave;
- be destroyed by flying into the planet or the sun, with the explosion, aft view and game-over screen;
- see "Fuel scoop active." and the fuel gauge climb when skimming the corona with scoops while the temperature bar reddens;
- lose shields and then energy and die when the cabin passes the limit;
- survive longer near the sun with External Heat Shielding fitted.

### TS-10 Populator: who flies the system

Oolite computes traffic **rates per hour** from the system's government (0 Anarchy ... 7 Corporate State), economy (0-7), tech level, and the systems within **7 LY (`locals`)** and **3.5 LY (`verylocals`)**. It spawns an initial population along the lanes (`LANE_WP` witchpoint-planet, `LANE_PS` planet-sun, `LANE_WS` witchpoint-sun, `LANE_WPS` triangle) and every 20 s of game time repopulates with probability `rate/180` per frequency key. Repopulation keeps running while the player is docked.

| Population | Rule (hourly rate unless noted) | Source | Cx |
|---|---|---|---|
| Update loop | `SYSTEM_REPOPULATION_INTERVAL = 20` s; first delay `rand*20`; each key tested with `Math.random() < freq/180`. | `C/Universe.h:167`; `C/Universe.m:1293, 6410-6430`; `S/oolite-populator.js:612-625, 1027-1310` | Med |
| Freighters | For each neighbour: economy match `m = -(ecoHere-3.5)(ecoThere-3.5)`; danger `d = (4-gov)*2.5` when gov < 4, plus the same for the neighbour; rate `60/(30+d)` if `m > 0`, else `60/(120+2d)`. Initial count `freighters * lane/600000`, reduced 15 % per government step below 4. | `S/oolite-populator.js:268-304, 640-670` | High (neighbour graph) |
| Couriers, smugglers | Couriers `20/(10+(14-neighbourTL)*5)/secondsCount`; smugglers `20/(10+neighbourTL*5)/secondsCount`. | `S/oolite-populator.js:305-326` | Med |
| Independent pirates | `(1 - gov/12) * totalTraders`, x1.2 at gov < 2 and x1.2 again at gov 0; groups of 2-6 (safer systems may have lost ships); bounty `20 + gov + size + rand(8)`. | `S/oolite-populator.js:343-380, 1696-1735` | Med |
| Organised pirate packs | Light 0.6/h if gov < 6, +0.6 if < 4, +1.2 if < 2; medium 0.375 if < 4, +0.375 if < 2; heavy 0.125 if < 2; Anarchy x1.5 / x1.5 / x2; packs also arrive from lower-government neighbours. Lave (gov 3): light 1.2, medium 0.375, heavy 0 (domestic). | `S/oolite-populator.js:344-470` | Med |
| Hunters | Light `60/(10+5(abs(gov-4.5)-0.5))`, capped at twice the pirate rate, then /3, peaking at Communist/Confederacy; medium from Corporate/Democracy to neighbours <= 5; heavy toward Feudal/Anarchy neighbours. | `S/oolite-populator.js:472-565, 1578-1690` | Med |
| Police | `60/(5*(8-gov))`, capped by `traders + pirates`, then /3. **Government <= 1 gets no patrols**; the rate becomes hunters. Patrol group `2 + floor(2*rand)` of role `police`, or `interceptor` when `9 + rand*6 < techlevel`; TL >= 14 add missiles. One **station-patrol** police ship is always placed at the aegis (up to 16 escorts). | `S/oolite-populator.js:568-584, 943-955, 2052-2125` | Med |
| Interceptors | TL >= 9 systems add `pflightremote/2 + pfmediumremote + 2*pfheavyremote` wings (`viper-interceptor`), half at the witchpoint. | `S/oolite-populator.js:585-593, 930-960` | Low |
| Assassins | `couriers*(rand+rand)*2/(gov+1)`, capped at 2 initial groups at the witchpoint (more only with high-risk contracts: out of scope). | `S/oolite-populator.js:595-601, 855-940` | Low |
| Scenery | Navigation buoy 10 km ahead of the station and a witchpoint buoy (already in v1); `2*(1+floor(4*rand))` rock clusters of 1-11 rocks; a rock hermit with probability `size/31`; always at least one hermit. | `S/oolite-populator.js:97-232` | Med (assets) |
| Station launches | Stations launch traders, pirates (pirate/chaotic stations), hunters and police by `allegiance`, only if the dock queue has room (`_launchReady`, space >= 8). | `S/oolite-populator.js:2639-2736`; `AI/oolite-stationAI.js:39-69` | Med |

**Player can ...**
- fly the witchpoint-planet lane and meet traders, police patrols and occasional pirate packs, with more pirates and fewer police in Anarchy and Feudal systems and many police in Corporate State and Democracy;
- see a station-patrol Viper at the station;
- see new traders arrive from the witchpoint over time and leave through it;
- arrive in the same system twice and see traffic drawn from the same rates (not identical ships).

### TS-11 Sound and music

All player-audible sounds are keys in `Cfg/customsounds.plist`; files are in `Resources/Sounds` (26 `.ogg`, 412 KB) and `Resources/Music` (2 tracks, 7.9 MB). Core Oolite plays **no sound for NPC lasers, NPC explosions or NPC missile launches**: only the player's own actions and hits are audible.

| Trigger | Key and file | Source |
|---|---|---|
| Player laser fires: miss / hit | `[player-laser-miss]` `laser.ogg` / `[player-laser-hit]` `laserhits.ogg`; beam `beamlaser_laser` / `_laserhits`; military `millaser_*`; mining `mininglaser_*`; pulse uses the generic pair | `PlayerEntityControls.m:1187-1189`; `customsounds.plist:75-76, 107-114`; `equipment.plist:144-205` |
| Player hit, shields up / down | `[player-hit-by-weapon]` `hit.ogg`; shields down also `[player-direct-hit]` `hullbang.ogg` (both play) | `E/PlayerEntity.m:5639, 5668`; `customsounds.plist:70-71` |
| Scrape / collision | `[player-scrape-damage]` `hullbang.ogg` | `E/PlayerEntity.m:5725`; `customsounds.plist:72` |
| Missile armed / locked / safe / next | armed and locked = `beep.ogg`; safe = `boop.ogg`; next = `guiclick.ogg` | `PlayerEntityControls.m:4775-4810`; `customsounds.plist:15-22` |
| Missile launched | `[missile-launched]` `missile.ogg`; hardened `[ecm-missile-launch]` `ecm_missile_launch.ogg` | `E/PlayerEntity.m:5265`; `customsounds.plist:18, 115`; `equipment.plist:278-292` |
| ECM fired / hit by ECM | `[player-fired-ecm]` / `[player-hit-by-ecm]` both `ecm.ogg` | `customsounds.plist:97-98`; `E/PlayerEntity.m:5172` |
| Warnings | `[incoming-missile]`, `[alert-condition-red]`, `[hostile-warning]`, `[autopilot-denied]` = `warning.ogg`; `[energy-low]` and `[weapon-overheat]` are unmapped (silent) | `customsounds.plist:81-85`; `E/PlayerEntity.m:5143, 5160-5166` |
| Scooping | `[scoop]` `scoop.ogg` every 0.5 s while scooping; `[hold-full]` boop | `E/PlayerEntitySound.m:386-400`; `customsounds.plist:57` |
| Jettison / weapons toggle | `[cargo-jettisoned]` beep; `[weapons-online]` beep, `[weapons-offline]` boop | `customsounds.plist:24-25, 36` |
| Death | `[game-over]` `bigbang.ogg` (not played when the player ejects) | `E/PlayerEntity.m:2731, 6218`; `customsounds.plist:100` |
| Ident, target lost | `[ident-on]` beep, `[ident-off]` boop, `[target-lost]` boop | `customsounds.plist:14-17, 42` |
| Break pattern | `[player-launch-from-station]`, `[player-dock-with-station]`, `[player-exit-witchspace]` = `breakpattern.ogg` | `customsounds.plist:91-94` |
| Station UI (built, silent today) | `buy.ogg`, `sell.ogg`, `guiclick.ogg`, beep/boop for refusals | `customsounds.plist:26-40, 52-56` |
| Hyperspace (built, silent today) | countdown beep, abort boop, jump refusals `witchabort.ogg` | `customsounds.plist:60-66` |
| Music | Title: `OoliteTheme.ogg` looped. While the docking computer flies: `BlueDanube.ogg` looped (stopped on disengage, abort or dock). Docked music requests `OoliteDocked.ogg`, which is **not shipped**. | `C/OOMusicController.m:106-135`; `E/PlayerEntity.m:3302, 3326, 5183, 6354` |

**Player can ...**
- hear a laser shot when firing and a different sound when it hits;
- hear a hit sound when shot, with an added thud when shields are down;
- hear a beep on arming or locking a missile and a boop on safing it;
- hear a warning tone on an incoming missile and on red alert;
- hear the scoop sound while collecting pods;
- hear the Blue Danube while the docking computer docks them;
- start audio only after the first key press or click (autoplay-safe) and silence it from settings.

### TS-12 Existing surfaces that must change (v1 to v2)

| Surface | v1 state | v2 requirement | Source |
|---|---|---|---|
| F5 status | Legal status and Rating hard-coded to label index 0 (Clean, Harmless); Condition hard-coded "Docked" | Real legal band, kills/rating, condition (Docked/Green/Yellow/Red), damaged equipment as "X (N/A)" | `src/ui/station-model.ts:344-345`; `C/OOConstToString.m:373-422` |
| HUD | 11 pinned elements: crosshair, scanner, compass, aegis, speed, roll, pitch, fuel, clock, condition, message | Add forward/aft shield bars, 4 energy-bank bars, cabin and laser temperature, altitude, missile icons and lock state, scoop status, weapons-offline text | `src/render/hud/draw.ts:71-83`; `HeadUpDisplay.m:2045-2400` |
| F3 outfitting | Ten visible keys; the money path refuses everything else (`notOffered`) | Open ECM, fuel scoops, escape pod, lasers (with facing choice), energy unit, shield booster, heat shield, hardened missile, repair rows | `src/sim/player/outfitting.ts:55-66` |
| Scanner | Stations, planet, sun | Ship blips coloured by class (police blue and flashing when hostile, cargo, missile, neutral, hostile) | `E/ShipEntity.m:5592-5690` |
| Mass lock | Bodies and station | Police, military, missile, neutral ships within scanner range mass-lock; cargo, rocks, buoys do not | `E/PlayerEntity.m:3014-3073` |
| Jump blockage | Coriolis only | Any mass-locking ship blocks a completing jump | `E/ShipEntity.m:12498-12531`; PROJECT.md 06-16 |
| Docking computer | Works when in range | Refuses in red alert and for fugitives; may mark for fines; 20 min | `PlayerEntityControls.m:4653-4740` |
| Dock contact | Non-damaging scrape/bounce | Scrape damage through shields | `E/DockEntity.m:698, 739-740` |
| Saves | Credits, cargo, fuel, missile count, equipment keys, pose | Legal status, kills, per-facing lasers, missile roles, damaged flags, pod state, world entities, populator timer | `E/PlayerEntity.m:809-870, 1387-1420` |

---

## Differentiators

Valued and faithful but the game plays without them. All are cheap once the world model and damage rules exist.

| Feature | Value | Cx | Notes |
|---|---|---|---|
| Hardened missile and ECM-proof response | Counter-play to ECM | Low | TL9, 3500 dc; 10 % pulse response (`AI/oolite-missileAI.js:90-106`) |
| Energy unit, shield booster, heat shield | Visible progression after first fights | Low | Energy unit x1.8 recharge (TL8, 15 000 dc); booster +128 shields (TL10, 147 500 dc); heat shield +1.0 insulation (TL4, 15 000 dc) via `script_info`: `equipment.plist:65-84, 388-399, 419-430`; `S/oolite-equipment-control.js:96-240` |
| Weapons-online toggle (`_`) | Safeties; blocks fire and missiles | Low | `PlayerEntityControls.m:1193-1210` |
| Pirate demands and cargo jettison | Drop cargo to appease pirates, who scoop it and break off | Med | `AI/oolite-pirateAI.js:40-62`; `S/oolite-priorityai.js:2028-2060, 3686` |
| NPC escape pods and rescue | Scoop pods for insurance, capture bounty or slaves | Med | `E/PlayerEntityContracts.m:61-125`; pods launched at `E/ShipEntity.m:10808-10850, 11569-11600` |
| Smuggling check on launch | Contraband export raises status | Low | `E/PlayerEntity.m:6407-6416`; goods already tradeable in v1 |
| Fast-dock fine chance and 20-min cost | Makes the computer a risk when wanted | Low | `PlayerEntityControls.m:4724-4740` |
| ECM scanner fuzz | Cosmetic reaction to being ECM'd (1.25 s) | Low | `E/PlayerEntity.m:5367-5382` |
| Asteroid field and rock hermit as scenery plus collision | Looks right; scavengers need them | Med | `S/oolite-populator.js:97-232`; no models vendored |
| Mining laser (TL10, 8000 dc) | Needs asteroids, boulders, splinters, minerals | Med | `Cfg/equipment.plist:164-184`; defer until mining content exists |
| Aegis raiders and assassins | Pirate variety | Low | `S/oolite-populator.js:1954-2050` |
| Sun-skimming traders | Distinct NPC route | Med | `AI/route2sunskimAI.plist`, role `sunskim-trader` |
| Hull sparks and shield flashes | Feel | Med | `C/Universe.m:5528-5547` |
| Station defence ships and salvage launches | Rich station response | Med | `AI/oolite-stationAI.js:39-69` |
| Docking music (`BlueDanube.ogg`) | Atmosphere | Low | 7.9 MB: lazy-load |

---

## Anti-Features

Do not build in v2.0.

| Anti-feature | Why avoid | What to do instead |
|---|---|---|
| Missions, contracts, passengers, parcels, assassin contracts | Out of milestone scope | Leave the populator's parcel/passenger risk bonuses off |
| Thargoids, witchspace interception, Thargoid laser, thargons, Quirium cascade mines, energy bomb | Out of scope; need witchspace and chain-reaction rules | Keep roles in data; omit `_addThargoid*` populators |
| Cloaking device, military jammer (MASC'M), scanner filter, naval energy unit and shield boosters, shield enhancer for the player | Gated by mission scripts or a TL 99 hack in core | Not purchasable (`S/oolite-conditions.js:40-95`) |
| Trumbles | Out of scope; novelty | Omit `[trumble-*]` sounds |
| Cosmetic trade-in damage and Maintenance Overhaul (`EQ_RENOVATION`) | Needs the shipyard and trade-in model (PROG-03) | Skip `ship_trade_in_factor`; equipment damage and repair still ship |
| Docking-clearance protocol (`L` request, clearance fines) | `stations_require_docking_clearance = no` in `Cfg/planetinfo.plist:17` | Honour only the fugitive refusal on autopilot |
| Target memory, multi-target, integrated targeting, advanced scanner display | Not in the v2 scope | Omit (`Cfg/equipment.plist:302-356`) |
| Custom views and view pan/rotate | Not needed for combat | Four fixed views |
| NPC laser, explosion and missile-launch sounds | Core Oolite has none; inventing them breaks fidelity | Keep NPC combat silent; only player-bound sounds |
| Simulating the world in real time while docked | v1 freezes the clock docked; Oolite keeps running | Re-roll traffic at launch; record as a deviation |
| Octree-exact hull hit test as a hard requirement | Wegolite has only OBB/SAT for the dock | Bounding-sphere gate plus a per-ship oriented box or coarse hull; record as a divergence |
| Joystick or touch fire controls | Deferred | Keep input abstract |

---

## Feature Dependencies

```
World model (stable ids, broadphase, world serialisation)
  -> NPC ships, missiles, cargo pods, wreckage, buoys
       -> Ray test (laser) and sphere/box collision (collision, scoop, missile fuse)
       -> Ship mass (density * 20 * octree volume) [content build must emit it]
            -> internal-damage odds, collision damage, alloy and wreckage counts
  -> Seeded sim PRNG for every roll (damage, cargo survival, wreckage, populator, fine chance)

Views 1-4 -> weapon facing -> per-facing laser state (type, heat, shot timer)
Laser fire -> energy banks -> shields -> takeEnergyDamage -> internal damage -> equipment damage -> F3 repair
Missiles -> targeting (view cone) -> missile AI (intercept, proximity, range) -> blast damage
ECM -> blast entity (4 pulses) -> missile response (explode / 10 % hardened)
Damage -> death -> game over / escape pod
Kill -> bounty + ship_kills -> rating (F5)
Offence rules -> legalStatus bits -> F5 band + police AI + fines at main-station docking
  + hyperspace halving (v1 hyperspace) + smuggling on launch (v1 market goods)
Hazards: planet/sun collision (existing bodies) -> death; cabin temperature (existing sun) -> heat damage
Populator -> neighbour systems (7 LY / 3.5 LY from the v1 chart) -> roles -> ship models
Sound -> Web Audio, autoplay-safe start -> keys from customsounds.plist
```

### Dependencies on existing Wegolite

| Existing feature | Needed change |
|---|---|
| `src/app/game-session.ts` (single session) | Split into subsystems; world entities serialise into saves and determinism hashes |
| Mass lock (bodies only) and Coriolis jump blockage | Extend to NPC ships (`checkEntityForMassLock`, blockage predicate) |
| Docking computer (`dockingComputer`, Shift-C fast dock) | Refuse on red alert and for fugitives; 20 min clock; fine chance |
| Dock contact scrape/bounce | Add scrape damage |
| Hyperspace | Halve legal status on arrival; repopulate the new system |
| Outfitting `VISIBLE_EQUIPMENT_KEYS` money-path gate (D-11) | Open lasers (per facing), ECM, scoops, escape pod, energy unit, shield booster, heat shield, hardened missile |
| F5 labels and the 11 pinned HUD elements | Real values; add gauges (changes the pinned element set) |
| Saves v2 | v3 with combat, legal and world state and an ordered migration |
| Key bindings (`src/input/actions.ts`) | `Escape` is **pause** in v1 but is Oolite's **escape-pod** key; `KeyR` is `targetStation` in v1 but Oolite's ident key. Choose a pod binding and an ident/target scheme |
| Assets | **Only 17 of 194 ship records have a model vendored** (Cobra family, Coriolis, dock parts). Populator roles need about 37 more models: adder, anaconda, asp, boa, boa-mk2, cobramk1, ferdelance, gecko, krait, mamba, moray, python, python-trader, sidewinder, viper, viper-interceptor, shuttle, transporter, worm, missile, ecm-proof missile, barrel, alloy, escape capsule, asteroid/boulder/splinter (two variants each), rock hermit, five wreckage models. Sounds (26 files, 412 KB) and music (7.9 MB) are not vendored |

---

## MVP Recommendation

Prioritise (each slice leaves a playable game):

1. **Foundation plus hazards that need no NPCs:** world model; planet/sun collision death; cabin temperature and gauges; shield/energy gauges; death to game-over screen. Testable alone with existing bodies.
2. **Player lasers against a target:** four views and facings; pulse laser; heat; energy; shield recharge; ray hit against a drone or NPC; fire and hit sounds.
3. **Legal and kill loop with a minimal NPC set:** Viper police, Cobra trader, Cobra pirate (Cobra models are already vendored); offence rules; bounty, kills, rating; fines; fugitive refusal; scoopable cargo.
4. **Missiles and ECM:** missile model, lock/fire/blast, ECM pulses, incoming-missile warning, hardened missile.
5. **Escape pod and equipment damage/repair:** pod flow and F3 repair rows.
6. **Populator and role AIs:** traders, pirates, hunters, police, scavengers, shuttles, station patrols, interceptors, by the rates above.
7. **Sound and music:** player-bound sounds can start in slice 2; music last.

Defer: mining laser, asteroids and hermits as gameplay, NPC pod rescue, pirate demands, sun-skimmer routes, station defence launches, docking music.

Everything in TS-1 to TS-12 is table stakes for a faithful release; the Differentiators list is the cut line.

---

## Open Questions and Risks

- **Meaning of "insurance".** Core Oolite pays the player no insurance: it keeps the ship through the pod and pays rescuers for NPC pods (`E/PlayerEntityContracts.m:61-125`). Requirements must say which meaning is intended; recommendation: keep Oolite's.
- **Ship mass** is `density * 20 * octree volume` (`E/ShipEntity.m:417-419`). The content build must emit it per ship, as `dock-port.json` does for geometry, or internal-damage odds, collision damage and wreckage counts cannot be faithful.
- **Wreckage lifetime** (derived 0.05-0.4 s) looks shorter than the original feels. LOW confidence: verify in the engine or set a visual lifetime and record a divergence.
- **Determinism.** Every Oolite `Ranrot()` / `randf()` becomes a draw from the sim's seeded PRNG; its state must be saved.
- **Docked-world rule.** Oolite repopulates while docked; v1 freezes the clock. Pick repopulate-on-launch and record it.
- **Hit geometry.** Oolite tests each hull's octree; a lighter proxy will change hit feel for small missiles and pods.
- **Performance and size.** 37 models, textures and 8 MB of music against the 20 MiB cold start and the 60 fps budget (QUAL-01) need lazy loading and a draw-call budget for traffic.
- **Clock jumps.** Escape pod (12 h to 8 d), fines (24 h), fast dock (20 min) and repair time advance the clock; confirm the v1 clock model accepts them.

---

## Sources

All Oolite paths are relative to `/home/opencode/git/oolite` (HEAD `4bb1f53de`, pin `7437f22`).

- `Resources/Config/equipment.plist` (lasers :109-205, ECM :37, scoops :45, escape pod :54, energy units :65-84, shield boosters :388-412, heat shield :419, hardened missile :278)
- `Resources/Config/shipdata.plist` (`oolite_template_cobra3` :1226-1350, `-player` :1437, missile :2680-2722, ecm-proof missile :2054-2084, stations :1706, 1895, 2352)
- `Resources/Config/customsounds.plist`, `trade-goods.plist` (`legality_export`), `planetinfo.plist:17`, `descriptions.plist`
- `Resources/Scripts/oolite-populator.js` (rates :97-1310, spawners :1383-2736), `oolite-priorityai.js` (:841-848, :2185-2225, :5111-5172, :5250-5290, :5300-5380, :5669-5775, :5960-6040), `oolite-equipment-control.js:96-240`, `oolite-conditions.js`
- `Resources/AIs/oolite-policeAI.js`, `oolite-missileAI.js`, `oolite-pirateAI.js`, `oolite-stationAI.js`
- `src/Core/Entities/PlayerEntity.m`, `PlayerEntity.h`, `PlayerEntityControls.m` (pin), `PlayerEntityContracts.m`, `PlayerEntitySound.m`, `ShipEntity.m`, `ShipEntity.h`, `StationEntity.m`, `DockEntity.m`, `OOECMBlastEntity.m`, `OOLaserShotEntity.m`, `OOPlanetEntity.m`
- `src/Core/Universe.m`, `Universe.h`, `HeadUpDisplay.m` (pin), `OOConstToString.m`, `OOMusicController.m`
- Wegolite v1 context: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `FIDELITY.md`, `src/input/actions.ts`, `src/sim/player/outfitting.ts`, `src/sim/dock/step.ts`, `src/ui/station-model.ts`, `src/render/hud/draw.ts`, `src/content/generated/ships.json`, `src/content/generated/systems/g0.json`
