# Feature Landscape: v2.4 Pirates and Police

**Domain:** Faithful browser port of Oolite's living-system traffic and its consequences: the system populator (traders, pirates, police), the priority AI for those roles, legal status with bounties and fines, cargo scooping and the combat rating
**Milestone:** v2.4 Pirates and Police (subsequent milestone; v2.3 already ships the damage ledger, the idempotent kill path, debris and cargo pods, NPC laser fire through the fire gate, collisions, equipment damage and player death; v2.2 ships the NPC flight model and the native steering behaviours)
**Researched:** 2026-11-25
**Overall confidence:** HIGH for every number cited to an Oolite source line (read directly from the local checkout; the files cited are byte-identical at the pin `7437f22` and at the checkout HEAD, only `descriptions.plist` differs and its cited lines match the vendored copy). MEDIUM for "derived" arithmetic (marked). LOW only where flagged inline.

## How to read this file

- **Source of truth.** The Oolite checkout `/home/opencode/git/oolite` (pin `7437f22`, `third_party/oolite/pin.json`). No library documentation or web search was needed: every finding is read from the local Oolite source and the Wegolite code, so the research-plan/Context7 seam was not used.
- **Path shorthand.** `POP` = `Resources/Scripts/oolite-populator.js`. `PAI` = `Resources/Scripts/oolite-priorityai.js`. `AI/x` = `Resources/AIs/oolite-x.js`. `E/` = `src/Core/Entities/`. `Cfg/` = `Resources/Config/`. `Univ` = `src/Core/Universe.m`. `POP:N` is line N of the populator, and so on. Wegolite paths are relative to the repository root.
- **Complexity** is for a TypeScript port inside the existing deterministic multi-entity world: **Low** (data plus a few lines), **Med** (a subsystem with several rules), **High** (new infrastructure, a snapshot or save bump, or a long tail of rules).
- **Tick facts.** Wegolite steps at 1/120 s; Oolite works in float seconds, so every Oolite per-second constant below is a rate, not a tick count.
- **Fidelity rule.** Oolite's behaviour is the default; every "divergence" proposed below needs a `FIDELITY.md` row, two reviewer models in agreement, and the owner's standing rule (AGENTS.md).

## 0. Findings that shape the roadmap

These are the points where the milestone text and the Oolite source disagree, or where a hidden dependency decides the phase order. Each is expanded in the sections below.

1. **Oolite pays a bounty at the kill, not on docking.** `PlayerEntity.collectBountyFor:` does `credits += score` the moment a laser kill lands (`E/PlayerEntity.m:6042-6087`, called from `E/ShipEntity.m:8806-8808` and `11561`). The only things paid or charged on docking are fines (`getFined`, `E/PlayerEntity.m:6363-6369`, `10450-10472`) and escape-pod rescue rewards (deferred). The milestone's "bounties ... paid on docking" is therefore either a deliberate divergence or a conflation of bounty and fine. **Owner decision Q1.** Default recommendation: follow Oolite (immediate credit, the "Bounty: N / Total: M" message).
2. **Oolite's initial population is several times larger than today's 12 inert ships.** Derived from the populator's own formulas over the compiled galaxy 1 data: a Dictatorship like Lave starts with about 5.6 traders, 2.8 independent pirate groups (about 10 ships), 1.6 pirate packs (4, 7 or 13 ships each), 1.0 hunter groups and 0.6 police groups, plus the station patrol; an Anarchy starts with about 5 independent groups and 5 packs; a Corporate State with 5 police patrols. Plan for 30 to 60 live NPCs at arrival and up to about 100 in the steady state (Oolite's own caps: 40 pirates, 30 hunters, 30 police). This meets the v2.3 entity cap of 256 shared with debris and pods (see PITFALLS).
3. **NPC docking, NPC launching from a station and NPC witchspace exit do not exist yet, and the AI library and the populator need all three.** The shipped code says so in several places (`src/sim/npc/track.ts:19`, `fly-to-destination.ts:12`, `face-destination.ts:9`: "no NPC docks in v2.2"). Traders end their life by docking (`templateReturnToBase`, `PAI:6299`) or jumping (`PAI:6417-6474`); police and hunters return to dock; pirates return to base or land on the planet; the repopulator launches ships from the station and the planet (`POP:2639-2736`) and brings others in at the witchpoint (`POP:2348`). Without a sink the population only grows to Oolite's caps and stays there. **This is the largest hidden dependency of the milestone** (Q3).
4. **Only nine NPC hulls are vendored, and the populator needs roles that none of them has.** Missing: every freighter (`trader` Python, Boa, Boa Mk II, Anaconda and the Cobra Mk III trader), `pirate-medium-freighter`, `pirate-heavy-freighter`, `pirate-heavy-fighter`, `interceptor`, `wingman`, `hunter-heavy`. The populator itself tolerates missing roles by falling back to `pirate` or `hunter` (`_roleExists`, `POP:2162-2169`, used at `POP:1457`, `1530`, `1630`, `1739`, `1798`), but `_addPolicePatrol` and the interceptor wings do not check, so a Tech Level 10+ system silently gets no police patrols (`POP:2052-2076`; the `interceptor` role is `viper-interceptor`, `Cfg/shipdata.plist:3969`). Composition is compared against headless Oolite at acceptance, so the roster is a scope decision (Q4).
5. **The AI library is large, and the three roles use a lot of it.** Counted by script over the role AI files and the templates they expand: trader 48 library functions, pirate family (pirate, pirate fighter, pirate freighter, pirate interceptor) 79, police 50, escort/wingman 28, main station 12; the union is 128 (58 conditions, 27 behaviours, 34 configurations, 6 templates, 3 waypoint generators). `PAI` is 6,838 lines. A "hand-port" is a port of this decision surface, not of the file.
6. **The player's legal and pirate-victim status runs through a hidden "player role" system.** Pirates choose victims by `oolite-pirate-victim` role category, which contains `player-unknown`, the role every new commander starts with in all eight slots (`E/PlayerEntity.m:1781-1785`, `Cfg/role-categories.plist:8-12`); the police forgive one accidental hit only when the sampled player role is a friendly one (`PAI:988-1027`); roles drift with play (`addRoleForAggression`, `E/PlayerEntity.m:4486-4510`; selling cargo adds `trader`, `E/PlayerEntityContracts.m:308,338,908`). A technical minimum fixes the role at `player-unknown` and records a divergence; the consequence is that the first laser hit on any clean ship makes the player an Offender, with no forgiveness and no role drift (Q5).
7. **The kill tally feeds the AI.** `Ship.threatAssessment` adds `score^0.33/10` (0 to 1.8) for the player (`src/Core/Scripting/OOJSShip.m:3797-3860`, `PAI:1381-1395`; `score` is `ship_kills`, `E/PlayerEntityScriptMethods.m:40`), so the combat rating changes how willing pirates are to attack (`oddsAssessment >= 1.2`, `PAI:1078-1167`, `1448-1451`). Rating and AI cannot be built in isolation.
8. **Hunters are the law of Anarchy and Feudal systems, and the owner's list leaves them out.** For government 0 and 1 the populator sets `police = 0` and adds the police rate to light bounty hunters instead (`POP:574-582`). If hunters are deferred, the two most pirate-heavy governments have no law away from the station. The light hunter AI is 122 lines and 90 percent shared with the police AI (`AI/bountyHunterAI.js`). Recommended as a small, flagged inclusion (Q6).
9. **Without jettisoning cargo the player cannot pay a pirate off.** Pirates demand cargo ("Your cargo or your life, ... N barrels", `Cfg/descriptions.plist:653`) and stand down when the dropped count reaches the demand (`PAI:2028-2087`, `5002-5011`). There is no jettison command in Wegolite and none in the milestone. The demand message would be a promise the game cannot keep; pirates simply fight on (the "cargo demands met" branch never fires). Either suppress the demand line or add jettison (Q7).
10. **Existing tripwires fire in this milestone and must be handled by the first plan that crosses them.** `tests/guards/kill-credit-consumers.test.ts` fails on the first reader of `killer` (todo `2026-11-18-mutual-kill-credit-symmetry`: the same-tick mutual-kill credit asymmetry must be settled before bounty, rating or legal status reads it). The missiles/ECM todo asks this milestone to add a guard that fails when an AI is given a missile-carrying record or `EQ_MISSILE` becomes purchasable. The cargo-legality todo (`2026-11-25-cargo-legality-penalties`) stays deferred.

## 1. Oolite rules reference (the numbers the roadmap needs)

### R1. The populator (`POP`, `Univ`)

**R1.1 Cadence and placement**

| Rule | Value | Source |
|------|-------|--------|
| Initial population runs at arrival through `system.setPopulator` entries sorted by priority; each entry has a `location` code, a `groupCount` and a callback | priority 5 buoy, 10 witch buoy, 20 asteroids, 40 all traffic, 99 offlane hermit | `POP:97-213`, `Univ:1696-1765` |
| Repopulation tick | every 20 s (`SYSTEM_REPOPULATION_INTERVAL`); the first one after a random 0 to 20 s | `Univ.h:167`, `Univ.m:1293`, `1679`, `6410-6420` |
| Hourly rates become per-tick probabilities | rate / 180 (180 ticks an hour) | `POP:613-624` |
| Each tick, each source class rolls `Math.random() < rate` once | one group per success | `POP:1027-1305` |
| `randomise(count)` | `count * (0.25 + 0.75 * (r1 + r2))` then floor plus a fractional-remainder roll; the mean equals `count` | `POP:644-653` |
| Location codes | `WITCHPOINT` (within a scanner range of the origin), `LANE_WP/WS/PS` (a 51,200 m wide cylinder, 3 body radii clear), `LANE_WPS` (lane chosen by length), `STATION_AEGIS` (shell from 1.2 station radii to 2 scanner ranges), `PLANET_ORBIT_HIGH` | `Univ:1772-1833`, `LANE_WIDTH` `Univ.m:112`, `SCANNER_MAX_RANGE` 25,600 `E/Entity.h:49` |
| Incoming ships appear 2,000 to 5,000 m from the witchpoint in a random direction (z flipped when within 1,000 m of the witchbuoy axis behind it) | `Vector3D.randomDirection() * (2000 + rand * 3000)` | `POP:2348-2356` |
| Ships launched from a station queue behind the docks: a station is ready when the free launch slots total at least 8 (16 per dock minus its queue) | | `POP:2639-2652` |
| Pirates launch only from stations with allegiance `pirate` or `chaotic`, otherwise from the main planet's surface (125 to 250 m above it, at max speed, on the sun/station-avoiding vector) | | `POP:2683-2698`, `2418-2452` |
| Traders launch from the main station 67 percent of the time if ready, else a neutral, galcop or chaotic NPC-traffic station, else the main station | | `POP:2656-2680` |
| Hunters and police launch from the main station (or a `hunter`/`galcop` station if it has NPC traffic) | | `POP:2702-2736` |
| Per-class caps when repopulating | pirate 40, light pirate freighter leaders 6, medium 4, heavy 2, hunters 30, medium hunters 6 (5 incoming), heavy 3, police 30, interceptor wings 30, assassins 30 | `POP:1064-1296` |
| Shuttles | `0.005 * techlevel` per tick, launched from a trade station | `POP:1299-1304` (deferred by the owner) |

**R1.2 Rates (groups per hour, before the /180 conversion)**. Government 0 to 7 is Anarchy to Corporate State; economy 0 to 7.

| Class | Rule | Source |
|-------|------|--------|
| Freighters (per system in 7 LY range) | `ecomatch = -(eco - 3.5)(localEco - 3.5)`; danger `trdanger = (4 - gov) * 2.5` for each end below Communist; good match `60 / (30 + trdanger)`, bad match `60 / (120 + 2 * trdanger)` | `POP:275-306` |
| Couriers | per local system `(20 / (10 + (14 - TL) * 5)) / secondsInRange`; outgoing `20 / (10 + (14 - TL) * 5)` | `POP:310-326` |
| Smugglers | per local system `(20 / (10 + TL * 5)) / secondsInRange` | `POP:318-327` |
| Independent pirate groups | `(1 - gov / 12) * traders`, times 1.2 under Multi-Government, times 1.2 again under Anarchy; halved while above 10 | `POP:343`, `362`, `370`, `377-380` |
| Pirate packs, local source | light `3/5` below Confederacy; `+3/5` below Dictatorship; Feudal and below `+6/5` light, medium `3/4`, heavy `1/8`; Anarchy x1.5 light and medium, x2 heavy | `POP:345-376` |
| Remote and returning packs | only from systems within 3.5 LY with a lower government; light packs a third as likely to jump | `POP:391-465`, `407-409` |
| Light hunters | `60 / (10 + 5 * (abs(gov - 4.5) - 0.5))`, capped at twice the pirate rate, divided by 3 | `POP:472-480` |
| Police | `60 / (5 * (8 - gov))`, capped at traders plus pirates, divided by 3; **zero for government 0 and 1** (added to light hunters) | `POP:568-582` |
| Interceptor wings | only Tech Level 9 and above: `pflightremote / 2 + pfmediumremote + 2 * pfheavyremote` | `POP:586-589` |
| Aegis raiders | Anarchy with TL below 8 only: `1 / (8 - TL)` | `POP:333-340` (anti-scope) |

**R1.3 Initial group counts.** Each is `randomise(rate * laneLength / 600000)` (traders) or `/ 900000` (hunters, police), where `l1` is witchpoint to planet, `l2` planet to sun, `l3` witchpoint to sun (`POP:630-639`, `656-948`). Traders: `freighters * l1/600000`, times `1 - 0.15 * (4 - gov)` below Dictatorship (`POP:656-667`); a tenth as many again at `STATION_AEGIS` (`POP:668-674`). Independent pirates: `pind * (2/3 * lane / 600000) * (1 - 0.05 * gov)`, 5/6 on lane 1 and 1/12 on each other lane (`POP:755-778`). Pirate packs: three quarters on lane 1 and a quarter on the triangle (`POP:781-853`). Police: `police * 5/6 * (2 * l1 / 900000) * (1 - 0.1 * (7 - gov))` on lane 1, the rest on the triangle, plus one station patrol at `STATION_AEGIS` (`POP:926-948`).

**R1.4 Derived expected counts (galaxy 1 data, scratch model; MEDIUM)**

| Government | Traders (ships) | Independent pirate groups | Pirate packs | Hunter groups | Police groups |
|-----------|-----------------|---------------------------|--------------|---------------|---------------|
| 0 Anarchy | 3.7 | 5.1 | 5.0 | 0.6 | 0 (hunters instead) |
| 1 Feudal | 5.2 | 4.3 | 3.3 | 0.9 | 0 (hunters instead) |
| 2 Multi-Government | 5.7 | 3.9 | 1.8 | 0.8 | 0.5 |
| 3 Dictatorship | 7.3 | 3.6 | 1.8 | 1.2 | 0.7 |
| 4 Communist | 10.8 | 3.8 | 0.9 | 2.3 | 1.2 |
| 5 Confederacy | 9.9 | 2.8 | 1.0 | 2.4 | 1.6 |
| 6 Democracy | 12.1 | 2.9 | 0.4 | 2.1 | 3.1 |
| 7 Corporate State | 9.0 | 1.6 | 0.5 | 1.6 | 5.3 |

Lave (Dictatorship, Rich Agricultural): traders 5.6, independent pirate groups 2.8, packs 1.6, hunter groups 1.0, police groups 0.6. The model uses a 7 LY neighbourhood from the chart data and assumes `E[randomise(x)] = x`; treat it as a sizing aid and replace it with the headless-Oolite measurement (`tools/oolite-reference`) at acceptance.

**R1.5 Group composition**

| Group | Composition | Bounty and kit | Source |
|-------|-------------|----------------|--------|
| Freighter / trader | 1 ship of role `trader`; 5 percent are offenders (bounty `ceil(rand * 20)`, half of those become opportunists with `PIRATE_GOODS`) | outgoing carry `PLENTIFUL_GOODS`, incoming `SCARCE_GOODS`; incoming may have used missiles (`rand * 8 > gov`) | `POP:1383-1452` |
| Courier | 1 `trader-courier`, bounty 0, no docking before its destination | | `POP:1455-1525`, `AI/traderAI.js:40-46` |
| Smuggler | 1 `trader-smuggler`, bounty `ceil(rand * 20)` capped at 2 x hold, `ILLEGAL_GOODS`, injectors, weapons bias 1.2, flees preemptively | | `POP:1528-1575`, `AI/traderAI.js:37-40` |
| Independent pirates | `size = floor(rand*3) + floor(rand*3) + 2` (2 to 6, mean 4), cut to `1 + floor(rand * size)` when `size > 8 - gov`; spread 2.5 km | each ship bounty `20 + gov + size + floor(rand * 8)`; `PIRATE_GOODS`; weapons bias 1.75 (hyperspace-capable) or 1.3; skill bias `4 - gov`; missiles with `rand * 16 < gov` | `POP:1696-1734` |
| Light pirate pack | leader (`pirate-light-freighter`), about 2 light fighters, 1 medium fighter (about 4 ships) | leader bounty `60 + gov + floor(rand * 8)`, fighters `20 + gov + floor(rand * 12)`, interceptors `50 + gov + floor(rand * 36)`; leader weapons bias 2.8, skill bias 3, `EQ_SHIELD_BOOSTER` and `EQ_ECM` if auto-weapons | `POP:1737-1873` |
| Medium pack | leader, 3 light, 2 medium, 0 heavy, 1 interceptor (about 7 ships) | as above | `POP:1901-1924` |
| Heavy pack | leader, 4 light, 4 medium, 2 heavy, 2 interceptors (about 13 ships) | as above | `POP:1927-1951` |
| Light hunters | group of 2 to 4 (`floor(rand*2) + floor(rand*2) + 2`), bounty 0, weapons bias 1.5, skill bias -1 | | `POP:1578-1590` |
| Police patrol | group of 2 to 4 of role `police`, or `interceptor` when `9 + rand * 6 < TL`; bounty 0 | missiles upgraded at TL 14 | `POP:2052-2076` |
| Station patrol | 1 `police` (or `interceptor`) with primary role `police-station-patrol`, group = the station's, `maxEscorts` 16 | | `POP:2079-2100` |

**R1.6 Kit helpers**. `_setWeapons(ship, level)`: the level is a float; `choice = floor(level) + (frac > rand ? 1 : 0)`; 1 or below = forward pulse, 2 = forward beam, 3 = forward and aft beam, 4 = forward military and aft beam, 5 or above = forward and aft military; only for ships with `auto_weapons` (`POP:2217-2273`). `_setSkill(ship, bias)` pulls `accuracy` toward the cap 4.99 (positive bias) or -5 (negative) by `|bias|` rolls (`POP:2276-2294`). `_setMissiles(ship, bias)` removes missiles with probability `1 - 0.5^|bias|` each (`POP:2301-2319`). `_setFuel` is `7 - distance to home system` (`POP:2322-2345`). Accuracy default at spawn is uniform in -5 to 5 (negated if negative for police and military) (`E/ShipEntity.m:658-676`); the fire-decision code already reads accuracy (`src/sim/npc/fire.ts`).

### R2. Priority AI (`PAI`, `AI/*`)

**R2.1 Engine.** An AI is an ordered list of entries `{preconfiguration?, condition?/notcondition?, configuration?, behaviour?, truebranch?, falsebranch?, reconsider?}`. `_reconsiderList` walks the list top to bottom, calls the preconfiguration, tests the condition, calls the configuration, and the first entry with a behaviour wins; a branch with nothing usable falls through (`PAI:87-194`). The chosen behaviour runs once, installs an event-handler set, and calls a native `perform*` verb (`performAttack`, `performFlee`, `performCollect`, `performIdle`, ...). The AI sleeps for the entry's `reconsider` seconds (5, 10, 15, 20, 30, 60) and wakes sooner on events through `reconsiderNow`, which waits `0.1 + (10 - accuracy) / 10` s (`PAI:198-241`, `459-467`). A short per-wake cache and a 60 s long cache hold scan results and the nearest station (`PAI:48-50`, `203-213`). Nothing in it needs the JavaScript runtime; the state that must be serialised is the parameter map, the two caches, the intership map (`cargodemand`, `cargodemanded`, `cargodemandpaid`, `oolite_player_role`) and the group links.

**R2.2 Role AIs (the decision surface).**

| AI | Top priorities in order | Source |
|----|-------------------------|--------|
| Trader (freighter, courier, smuggler) | losing combat: pay off pirates if a demand was made and the hold has at least the demanded cargo, else flee; in combat: repel the target (fire back); leave a hostile station; if not near a friendly station, keep away from `oolite-trader-dislike` roles (smugglers: `oolite-smuggler-dislike`); if the cargo is profitable here, return to base and dock, else jump out or sunskim; else dock or approach a friendly station; fall back to witchspace jump | `AI/oolite-traderAI.js:28-133` |
| Pirate, pirate fighter | losing combat: flee; if cargo demands are met, repel only hostile attackers, else destroy the combat target; collect salvage for the group; leave a hostile station; leave hunters (police, main station and `oolite-bounty-hunter` roles); regroup; enough loot: return to base or planet; else lead the pirate mission (leader) or follow the leader | `AI/oolite-pirateAI.js:28-142`, `oolite-pirateFighterAI.js:28-129` |
| Pirate freighter (pack leader) | the same combat and loot block, then a destination-aware plan: local piracy, jump to the destination system with the group, work abroad and jump home when the loot or attrition limit is reached | `AI/oolite-pirateFreighterAI.js:28-162` |
| Police | losing combat: flee (lights on); in combat: destroy; answer distress calls; a fugitive (bounty above 50) or a serious offender (bounty above the fine threshold) on the scanner: attack at once, reconsider every 1 s; a fineable offender: lights off and `markTargetForFines`; collect escape pods; regroup; patrol by group role (station patrol, witchpoint patrol, spacelane patrol); the leader sometimes follows a suspicious `oolite-police-dislike` ship | `AI/oolite-policeAI.js:28-207` |
| Escort / wingman | flee when losing; defend or help the mothership; repel own attacker; dock or offer to escort a ship needing one | `AI/oolite-escortAI.js:28-116` |
| Main station | launch defence ships when in combat; answer distress calls; launch a patrol if none is out (one at a time, 60 s reconsider); manage alert level | `AI/oolite-stationAI.js:28-73`, `PAI:3795-3950` |
| Bounty hunter (light) | police-like fight block, then attack fugitives and any "huntable" offender (bounty above half the fine threshold) unless the odds are bad, collect loot, patrol | `AI/oolite-bountyHunterAI.js:28-122` |

The AI is attached by role through `autoAImap.plist` when a ship has `auto_ai`, and set explicitly by the populator for packs and leaders (`Cfg/autoAImap.plist`, vendored in `third_party/oolite/Config`).

**R2.3 Odds, losing and surrender.** `oddsAssessment` = sum of `threatAssessment` over self, group, leader's group and escorts within scanner range, divided by the same sum for the target's side (`PAI:1078-1167`). Thresholds: terrible below 0.375 (below 0.65 for ships that "surrender early", the traders), bad below 0.65 (0.375 for "surrender late"), good at 1.2 and above, excellent at 2.5 and above (`PAI:1422-1457`). A ship is **losing** (and flees) when: it is in combat and energy is below a quarter; or odds are terrible; or energy is below half and odds are bad; or it has dumped cargo; or the thing that attacked it is still within 1.25 scanner ranges; or a hostile station is near (`PAI:1573-1677`). `threatAssessment` is 2.5 plus speed (`(max - 300) / 1000`), energy (`(max - 200) / 1000`), missiles (0.5 above two, else `n/5`), turrets, then for the full check pilot skill (`accuracy / 5`, or `score^0.33 / 10` for the player) plus laser values (pulse 0.0, beam 0.5, military 1.0, no forward laser -1.5, aft `+1 + w`), ECM and injectors +0.5 each; fleeing ships count 0.2 (`src/Core/Scripting/OOJSShip.m:3797-3916`, `Cfg/equipment.plist` `threat_assessment`). Derived (MEDIUM-LOW): a lone Sidewinder (about 3.2 at the Anarchy skill bias) against a stock Cobra Mk III (about 3.6 out of combat) gives odds near 0.9, so it does not attack alone; two do (about 1.8). This matches the populator's comment that a group below 3 is "probably too small to actually attack" (`POP:1698`).

**R2.4 How a pirate attacks the player unprompted.** In `templateLeadPirateMission` (`PAI:6263-6296`) the leader forgets any earlier demand, scans for a victim (`oolite-pirate-victim`, with `cargoSpaceCapacity > 0`, not already paid: `PAI:2295-2305`; the player qualifies through role `player-unknown`), acquires it, and if the odds are good runs `behaviourRobTarget` (`PAI:3594-3703`): demand `ceil(holdCapacity / 20 * (1 + rand + (8 - gov) / 8))` (doubled-ish with `1 + rand` when the odds are excellent), at least 2, at most what the group can scoop, halved while above 5 per scooper; then `performAttack`, a comms line and a call for help to the group. Otherwise the pirate goes to a lurk point on lane 1 (70 percent), lane PS, lane WS or the witchpoint (`PAI:4556-4611`). A ship that is attacked in return enters `conditionInCombat` (`alertCondition == 3`, i.e. a hostile target or energy below a quarter: `E/ShipEntity.m:12868-12878`) and switches to destroy-the-target until the cargo demand is met.

**R2.5 Events the AI reacts to (the standard handler set).** `shipBeingAttacked` (the largest: friendly-fire filtering, marking offenders, distress broadcast, defence targets, target switching, surrender, `PAI:5330-5503`), `offenceCommittedNearby` (`PAI:5123-5177`, station variant `5997-6046`), `helpRequestReceived` (`5069-5121`), `distressMessageReceived` (`5038-5060`), `cargoDumpedNearby` (`4998-5011`), `shipKilledOther`, `shipLaunchedEscapePod`, `shipLaunchedFromStation`, `playerWillEnterWitchspace`, `shipTargetLost`, plus missile and cascade events (`PAI:4888-4925`). The v2.2 event vocabulary already reserves most of these names (`src/sim/ai/types.ts:55-80`).

**R2.6 Comms lines the player sees.** The AI "communicates" with priority gating (priority 2: 10 s since last sent; 3 and 4 also need 10 or 60 s of quiet received, `PAI:339-375`). The lines a player meets in this milestone: pirate demand `Your cargo or your life, <name>. <n> barrels and we'll let you go.` (`Cfg/descriptions.plist:653`), police warning from the eight `police-attack-warning` variants (`:639-650`, `:665`), mark-for-fines `This is the police. ...` (four variants, `:658-663`), a trader's `beg-for-mercy` surrender (eight variants, `:568-577`), distress call (`:595`), `thanks for help`, and `%H Station does NOT welcome fugitives!` (`:726`). Wegolite has the reserved `commsMessage` event and the HUD message path.

### R3. Legal status, bounty and fines

| Rule | Value | Source |
|------|-------|--------|
| Legal status is the player's `bounty`, an integer; offences are OR-ed in, never added | | `E/PlayerEntity.m:5993-6016`, `6019-6040`, `E/ShipEntity.m:11827-11850` |
| Display | 0 `Clean`, 1 to 50 `Offender`, 51 and above `Fugitive` (`legal_status` list in `descriptions.plist`) | `src/Core/OOConstToString.m:404-421`, `Cfg/descriptions.plist:116-121`, shown on F5 `E/PlayerEntity.m:7061` |
| Offence bits | seen by police committing an offence against a clean ship: OR 7; attacked police (hit): OR 15; killed police: OR 64; attacked main station (any non-friend hit, new-style AI): OR 64, or 96 for a cascade weapon, and the value is multiplied by 1.5 when the shooter's status is already that high; distress call against an innocent: OR 8; illegal imports and exports: deferred | `PAI:5169`, `5367`, `E/PlayerEntity.m:6066-6069`, `E/StationEntity.m:1118-1148`, `PAI:5052`, `5987` |
| Who sees an offence | `broadcastHitByLaserFrom`: when a **clean** (bounty 0) ship of class neutral, station, buoy, police, military or player is hit by a laser, every police ship within one scanner range of the victim and the main station (if the victim is in its aegis) get `offenceCommittedNearby`; they mark the attacker only if the attacker is within the receiving ship's scanner range | `E/ShipEntity.m:12263-12304`, `PAI:5123-5177`, `5997-6046` |
| Forgiveness | `ignorePlayerFriendlyFire`: not if the victim is the player's current target; yes if the player recently assisted this ship; once per ship if both are clean (or both dirty) and the player's sampled role is one of the AI's friendly roles. With the static `player-unknown` role the forgiveness never applies | `PAI:988-1027` |
| Police and hunters never carry a bounty; ships of Thargoid or station class take none except at setup | | `E/ShipEntity.m:7102-7112`, `11832-11850` |
| Fine threshold | `50 - 6 * government` (50, 44, 38, 32, 26, 20, 14, 8 for Anarchy to Corporate State) | `PAI:841-848` |
| Police response to the player (and any ship) | bounty above 50: **attack on sight** (`conditionScannerContainsFugitive`); bounty above the fine threshold: **attack on sight** (`SeriousOffender`); bounty 1 to the threshold on a neutral ship or the player not already marked: lights off, **mark for fines** (`markForFines` only if `legalStatus > 0`, once) and one of four warning lines | `PAI:2189-2220`, `3146-3160`, `AI/oolite-policeAI.js:86-108`, `E/ShipEntity.m:12429-12440` |
| Fine | applied only when docking at the **main station** and only if marked: `fine = (500 + (gov < 2 or gov > 5 ? 500 : 0)) * legalStatus` decicredits; if the fine exceeds credits, pay all and reduce the status by `legalStatus * credits / fine`; else pay and status becomes 0; message `You have been fined %@, ...` (3 variants); +24 h on the ship clock; mark cleared at witchspace exit (`being_fined = NO`, `PlayerEntity.m:6980`) | `E/PlayerEntity.m:6363-6369`, `10450-10472`, `Cfg/descriptions.plist:731-735` |
| Decay | on every arrival at a new system `legalStatus / 2` (integer division; a misjump changes nothing); a galactic jump sets 0 | `E/PlayerEntity.m:6887`, `6737`, `Univ:1061` |
| The docking check | the main station (and any station) refuses docking instructions to a player whose status exceeds 50 with `%H Station does NOT welcome fugitives!`; the docking computer is denied for a fugitive at the main station with `Station refuses to issue docking instructions.`; fast docking on red alert is refused; fast docking while `legalStatus > 0` has a chance `rand(0..1023) / (1 + gov) < legalStatus` to mark the player for fines and costs 20 minutes on the clock. Manual docking is not physically blocked (verified: `legalStatus` is read in `StationEntity` only at `E/StationEntity.m:412`) | `E/StationEntity.m:412`, `E/PlayerEntityControls.m:4676-4757`, `Cfg/descriptions.plist:499,501,726` |
| Kill bounty | on a laser or ram kill by the player: `credits += 10 * victimBounty` decicredits, with the message `Bounty: <n>` / `Total: <n>` when at least 10 decicredits; pods, buoys and rocks pay a tenth and count no kill; stations never | `E/PlayerEntity.m:6042-6097`, `Cfg/descriptions.plist:489` |
| Typical numbers | independent pirate 20 + gov + size + 0..7 (about 24 to 45 Cr), pack fighters 20 + gov + 0..11, leaders 60 + gov + 0..7, pirate interceptors 50 + gov + 0..35 | `POP:1710`, `1760`, `1779`, `1807` |

### R4. Cargo scooping

| Rule | Value | Source |
|------|-------|--------|
| Equipment | `EQ_FUEL_SCOOPS`, "Fuel Scoops", tech level 5, 5250 decicredits (525 Cr), `provides EQ_CARGO_SCOOPS`; one item provides both cargo and fuel scooping | `Cfg/equipment.plist:43-51`, `E/ShipEntity.m:3532-3546` |
| Trigger | a cargo pod (scan class `CLASS_CARGO`, cargo type not "not cargo", not a station) that collides with a ship that `canScoop` it gets tractored | `E/ShipEntity.m:11035-11042`, `11183-11213`, `11235-11242` |
| `canScoop` | has a cargo scoop; hold not full (`cargo count < maxAvailableCargoSpace`); the scooper is not itself cargo; the pod is **in front** of the scooper (`dot(forward, toPod) >= 0`), and for the **player** also on the **underside** (`dot(up, toPod) <= 0`) ("player has to scoop on underside, give more flexibility to NPCs") | `E/ShipEntity.m:11183-11213`, `E/PlayerEntity.m:4430-4435` |
| Tractor | the pod's AI is replaced by nullAI, status `BEING_SCOOPED`, it spring-pulls toward the hauler's `scoop_position` (`TRACTOR_FORCE` 2500, three force terms) and is scooped when within twice its collision radius; any other ship targeting the pod loses it | `E/ShipEntity.m:3729-3775`, `11215-11233`, `E/ShipEntity.h:94`, `scoop_position` `E/ShipEntity.m:483` (already compiled: `src/content/generated/ships.json`) |
| Scoop-up | a full hold bounces the pod back to flight; otherwise the pod joins the hold at index 0 (`cargo_flag = CANISTERS`), the pod is tumbled and removed; the player sees the commodity description (`N t of Food`-style, 4.5 s); the AI gets `CARGO_SCOOPED` and `HOLD_FULL`; event `shipScoopedOther` | `E/ShipEntity.m:11244-11380`, `Univ:4008-4045` |
| Hold | in flight the hold is a list of pods; docking unloads it into the manifest (`unloadCargoPods`) before the market opens | `E/PlayerEntity.m:6336` |
| Not in this milestone | escape capsules and slaves (character rescue rewards), fuel gas scooping at the sun, scooping with scripted items | `E/ShipEntity.m:11273-11309` |
| NPCs scoop too | pirates, hunters and police run `behaviourCollectSalvage` (`performCollect`, `BEHAVIOUR_COLLECT_TARGET`: close at full speed, never injectors, slow down near the target) and count loot against hold space, which is what ends a pirate's mission (`conditionGroupHasEnoughLoot`: a ship without a scoop reads "enough loot" immediately) | `PAI:2882-2890`, `2089-2129`, `E/ShipEntity.m:3828-3870`, `E/ShipEntityAI.m:361-364` |

### R5. Combat rating and kills

| Rule | Value | Source |
|------|-------|--------|
| Rating names | Harmless, Mostly Harmless, Poor, Average, Above Average, Competent, Dangerous, ☆ Deadly ☆, ★★★ E L I T E ★★★ (the vendored `rating` list) | `Cfg/descriptions.plist:122-133` |
| Thresholds (kills below the value) | 8, 16, 32, 64, 128, 512, 2,560, 6,400; 6,400 and above is Elite | `OOConstToString.m:373-398` |
| F5 line | `Rating: <name>   (<kills>)` (three spaces) | `OOConstToString.m:401`, `E/PlayerEntity.m:7062`; Wegolite's `formatRating` already matches (`src/ui/station-model.ts:617`) |
| What counts | `ship_kills++` only when `collectBountyFor` runs for a ship whose record has `counts_as_kill` (default yes), and not for pods, buoys or rocks; clean traders and police count; a kill of a police ship also marks the player OR 64 | `E/PlayerEntity.m:6063-6094`, `E/ShipEntity.m:1527-1530` |
| Milestone message | `Right On, Commander!` at every multiple of 256 kills | `E/PlayerEntity.m:6089-6093`, `Cfg/descriptions.plist:490` |
| Saved | `legal_status` and `ship_kills` in the commander dictionary | `E/PlayerEntity.m:843-845`, `1414-1416` |
| Game over screen | prints the rating and kills | `E/PlayerEntity.m:3632-3635` |
| Feeds the AI | `score` (= `ship_kills`) in `threatAssessment` as above | `PlayerEntityScriptMethods.m:40` |

## 2. Feature landscape

IDs are suggestions for the requirements file. "Dep" lists the existing Wegolite capability the feature stands on.

### 2.1 Table stakes (the acceptance text fails without these)

| ID | Feature | Why expected | Complexity | Dep and notes |
|----|---------|--------------|------------|---------------|
| POP-01 | Initial population by Oolite's formulas: `systemsInRange` neighbourhoods, trader, courier, smuggler, independent-pirate and pack, hunter and police group counts per lane code, `randomise`, the group builders (R1.2 to R1.5) | "the populator fills each system by economy and government" | Med | Replaces `INERT_POPULATION` (`src/sim/world/populate.ts:98-111`), re-pins `tests/golden/world/inert-lave-epoch1.json`. Needs chart-distance neighbours (`src/sim/hyperspace/jump.ts`), `LANE_*` and `STATION_AEGIS` placement (done, `placement.ts:165-224`), plus `WITCHPOINT`. Needs a group-spawn primitive (leader, followers, spread) |
| POP-02 | Per-ship kit helpers: weapons level, skill bias, bounty values, missile bias recorded but inert | pirates must be armed and skilled as Oolite arms them; the player's reward and the law's threshold depend on the bounty values | Low | R1.5 and R1.6; the missile bias is a no-op recorded in `FIDELITY.md` (tripwire, finding 10); `accuracy` already resolved at spawn |
| POP-03 | Repopulation tick every 20 s with incoming (witchpoint) and outgoing (station or planet launch) groups, caps, and the pack, return and outbound variants | "witchpoint arrivals" and a system that keeps producing traffic; without it a cleared system stays empty | Med | R1.1. Needs the sinks of NPC-LIFE-01 or the population only grows |
| POP-04 | Pirate-pack leader and follower structure: ship groups, leader appointment, formation and escort links | packs are the main danger; follower AIs key on the leader | Med | v2.2 has `escort.ts` and `behaviours/formation.ts` natively; add `group`, `escortGroup` as hashed state |
| AI-01 | Priority AI controller (engine R2.1): ordered entries, branches, `reconsider` timers, parameter map, caches, handler set, deterministic seeded `Math.random` replacement, serialisable state | the foundation of every role | High | Typed seam exists (`src/sim/ai/types.ts`); state must enter the snapshot and the world hash; a non-serialisable closure design is already rejected (PROJECT.md Key Decisions). One of the two largest items |
| AI-02 | Library subset: the conditions, behaviours and configurations the three roles use (R2.2: about 100 of the 128), including odds and losing-combat logic, scanner predicates, destination, waypoint and lurk selection | "Oolite's priority AI hand-ported" | High | Native `perform*` verbs mostly exist from v2.2 (attack, flee, intercept, face, fly-to, escort, idle, tumble, avoid); `performCollect` and docking are new |
| AI-03 | Trader AI (freighter, courier, smuggler) | traders must fight back, flee, pay pirates off, avoid pirates and finish their trips | Med | Cargo profitability reads the market (`price_economic`, peak export or import: `PAI:2500-2560`) |
| AI-04 | Pirate AI family (pirate, fighter, freighter leader; pirate interceptor only if the hull is vendored) | "pirates attack the player unprompted" | High | Needs the odds, rob, lurk, salvage, loot and attrition pieces; `behaviourRobTarget` demand logic; pirate loot cycle needs NPC scooping (SCP-03) |
| AI-05 | Police AI (patrol, station patrol, witchpoint patrol; escort and wingman followers) | "police attack an offender"; stations send police | High | Needs the legal-status reads (LAW-01..03), `markForFines`, waypoint generators (`PAI:6477-6670`), `conditionScannerContainsSuspiciousShip` |
| AI-06 | Standard event handlers (R2.5) wired to the existing event bus: being attacked, offence nearby, help request, distress, cargo dumped, killed other, launched from station, player jumping | without them an attacked NPC never responds or marks offenders | Med | Reserved names exist in `AI_EVENT_NAMES`; `offenceCommittedNearby` is the key carrier of legal status |
| AI-07 | NPCs fire autonomously through the existing fire gate (`ctx.fire`) from `performAttack` | the milestone's wording; "lasers only" | Low | Fire gate shipped in v2.3 (`src/sim/npc/fire.ts`); behaviours skip `fireMainWeapon:` today on purpose (`attack.ts`, `attack-evade.ts`, `evasive.ts`) and must start calling it |
| AI-08 | Comms messages to the player: pirate demand, police warning, fine marking, trader surrender, distress, thanks (R2.6) | the only in-game explanation of why a ship is attacking or what a demand is | Low | `commsMessage` event and HUD messages exist; respect the HUD message length guard (`tests/guards/hud-message-length.test.ts`) |
| NPC-LIFE-01 | NPC departure and arrival sinks: docking at the station (or a recorded stand-in), landing on the planet, witchspace jump out (countdown, then removal) and in (arrival at the witchpoint offset) | the population must turn over; the trader and pirate plans end in them | High if Oolite's docking is ported (StationEntity 2,192 lines, DockEntity 1,176, `dockingAI.plist`, the docking branches of `ShipEntity`), Med for a simplified stand-in with a `FIDELITY.md` row | **Q3.** The shipped steering has no docking branch (`src/sim/npc/track.ts:19`). Stand-in proposed: approach the dock mouth and despawn (and spawn at the mouth on launch) |
| NPC-LIFE-02 | Station launches: a launch queue (or an immediate spawn at the dock mouth) with the population's launch rules (R1.1) | traders, police and hunters appear from the station; "station launches" | Med | Planet launch for pirates is a position function (`_repositionForLaunch`, `POP:2418-2452`): Low |
| LAW-01 | Legal status on the profile: Clean, Offender, Fugitive from the integer, F5 label, `legalStatusChanged` event, save (schema bump, no migration by the alpha rule), halving on every arrival, zero on a galactic jump | the core of "legal status" | Low | `profile.ts` has no field today; `station-model.ts:668` hard-codes Clean; the v5 save has no slot (v6 bump, golden re-pin) |
| LAW-02 | Offence detection: laser hit on a clean ship produces `offenceCommittedNearby` for police within a scanner range of the victim and the main station when the victim is in aegis; police and station mark the attacker OR 7 with the swap and forgiveness rules; hit on police OR 15; kill of police OR 64 | "firing on a trader makes the player an Offender" | Med | Needs the AI handler (AI-06), `withinStationAegis` (`src/sim/world/aegis.ts`) and the v2.3 hit event. Resolves the kill-credit tripwire first |
| LAW-03 | Police response by status and government: attack fugitives and serious offenders, mark fineable ones, the four fine-marking lines | "police attack an offender" | Med | Part of AI-05; `fineThreshold` per government |
| LAW-04 | Fine at main-station docking: formula, partial payment, message, +24 h clock, mark cleared at jump | the second half of the legal loop | Low | Hooks the existing dock event and the ship clock; reads the F5 manifest credits |
| LAW-05 | The docking check: fugitive refused docking instructions text and the docking computer refused at the main station; docking computer fine chance and red-alert refusal | "the docking check" | Low | `src/sim/dock/computer.ts` exists; Wegolite has no clearance-request protocol, so only the autopilot path and the instruction text apply (`stations_require_docking_clearance = no`, `Cfg/planetinfo.plist:17`, so no unauthorised-docking fine) |
| LAW-06 | Main station hit by a laser: the shooter is marked 64 (fugitive at once) and the station launches police | closing the loop on "attacking the station" (v2.3 already hits the station damage-free) | Low-Med | `E/StationEntity.m:1118-1148`; needs police launch from the station (NPC-LIFE-02) |
| LAW-07 | Kill bounty to credits at the kill with Oolite's message | "bounty" | Low | Needs the kill-credit decision (Q2). Bounty `10 * bounty` decicredits; pods, buoys and rocks a tenth, no kill |
| SCP-01 | Player cargo scooping with Fuel Scoops: collision trigger, front and underside rule, tractor pull, hold capacity, commodity into the hold, message, F5 manifest | "cargo scooping" | Med | Collision code already skips the scoop branch on purpose and says "deferred with scooping (CBT-11)" (`src/sim/combat/response.ts:17`, `collide.ts:557`, `world/contacts.ts:76`); `EQ_FUEL_SCOOPS` and `scoop_position` are compiled; pods carry commodity and amount (v2.3); the hold is a commodity map, not pods (see ARCHITECTURE) |
| SCP-02 | Scooping hold-full and not-installed states shown as the HUD scoop light | players need to know why a pod bounced | Low | `hud.plist:60` scoop light; optional if the HUD layout is fixed |
| SCP-03 | NPC cargo scooping for pirates, hunters, police (`performCollect`) | the pirate loot loop and the police salvage block | Med | Same collision path as SCP-01 for any scooper; `has_scoop` is a probability in the records |
| RAT-01 | Kill tally on the profile, incremented per qualifying kill, combat rating from the thresholds, F5 `Rating`, save (same schema bump as LAW-01) | "combat rating and the kill tally, saved and shown on F5" | Low | `formatRating` and the labels exist; `station-model.ts:659-665` hard-codes 0 kills |
| DATA-20 | Compile the record fields the AI and populator read: `bounty` (default 0), `accuracy`, `auto_ai`, `auto_weapons`, `has_scoop`, `has_ecm`, `has_escape_pod`, `escorts`/`escort_roles`, `missiles`, `weapon_facings`, `counts_as_kill`, `heat_insulation`, `max_missiles`; plus `role-categories.plist` and `autoAImap.plist` (both vendored); plus the station fields (`max_police`, `max_defense_ships`, `allegiance`, `has_npc_traffic`) | the AI keys on all of these | Low-Med | Today's `ships-npc.json` has `aiType`, `likelyCargo`, `maxCargo`, energy and speeds but none of the others (checked) |

### 2.2 Differentiators (valuable, not required for the acceptance text)

| ID | Feature | Value | Complexity | Notes |
|----|---------|-------|------------|-------|
| POP-05 | Light bounty hunters in the populator and `oolite-bountyHunterAI` (no medium or heavy hunter packs) | gives Anarchy and Feudal their law and gives pirates something to fear; also reproduces "hunters" in the pirate AI's `conditionScannerContainsHunters` | Med | The police AI covers about 90 percent; `POP:1578-1590`; recommended (Q6) |
| POP-06 | Vendor the freighter and interceptor hulls the roles need (Python, Boa, Boa Mk II, Anaconda, Cobra Mk III trader, Viper Interceptor, Cobra III pirate, Asp) | composition matches headless Oolite; big freighters carry escorts | Med (content build, provenance, models) | Q4. Without them the "heavy pack" is thirteen small ships and TL 10+ systems have no police patrol |
| AI-09 | Station AI: alert level, launching defence ships and patrols on red alert, answering distress | the station fights for the player when attacked, and the Coriolis is not otherwise a participant | Med | `AI/oolite-stationAI.js`; `PAI:3795-3950`; coupled to NPC-LIFE-02 |
| LAW-08 | Player role system: slots, `addRoleForAggression`, trader role from selling cargo, `playerRoleAssessment` per group | makes forgiveness, pirate target selection and police suspicion depend on play | Med | Needs a save field (eight slots) and `roleWeightFlags`; Q5 recommends the static role first |
| RAT-02 | `Right On, Commander!` every 256 kills; rating and kills on the game-over screen | small fidelity touches | Low | `E/PlayerEntity.m:6089`, `3632` |
| SCP-04 | Jettison cargo (the `j` pods) so the player can pay a pirate demand, plus the `cargoDumpedNearby` event and `oolite_cargoDropped` accounting | makes the demand line true and lets traders and players share one mechanic | Med | Not in the milestone; Q7 |
| AI-10 | Trader opportunist (offender traders that act like pirates) and assassin AIs | richer traffic | Low-Med | `AI/oolite-traderOpportunistAI.js` (120 lines), `oolite-assassinAI.js` (123): defer |
| LAW-09 | Tripwires and divergence rows for every deferred rule (missiles, ECM, escape pods, contraband, hunters, player roles) | keeps the deferred work discoverable | Low | Standing practice (AGENTS.md); required for the missile guard (finding 10) |

### 2.3 Anti-features (do NOT build in v2.4)

| Anti-feature | Why avoid | What to do instead |
|--------------|-----------|--------------------|
| Missiles and ECM for NPCs or the player (including NPC `_setMissiles` effects and `fireECM`) | owner-deferred; missile logic is threaded through the populator, `threatAssessment`, `conditionLosingCombat`, `shipFiredMissile` handlers and the pirate leaders' `EQ_ECM` | Keep the records carrying `missiles` inert; add the guard test the missiles todo asks for; a `FIDELITY.md` row |
| Escape pods and insurance, including NPC `abandonShip` (25 percent at low energy) and `launchEscapeCapsule`, police collecting pods, "scoop rescued character" rewards | owner-deferred; `takeEnergyDamage` calls `abandonShip` for ships with pods | Compile `has_escape_pod` as false for NPCs so no NPC ever ejects; record it |
| Scavengers and shuttles in the populator and the station's `launchScavenger` / `launchShuttle`; the existing inert shuttle and scavenger | owner-deferred | Remove them from the populator table; keep the hulls loaded |
| Fuel scooping at the sun, `behaviourSunskim`, the sunskim templates (`templateWitchspaceJump*` sunskim branch) | owner-deferred; needs solar heat | Make `conditionSunskimPossible` false and let ships without a jump route lurk at the witchpoint |
| Contraband penalties on docking and launch | owner-deferred (todo `2026-11-25-cargo-legality-penalties`) | The status machinery accepts an offence value; nothing calls it for legality yet |
| Rock hermits, asteroid fields, aegis raiders, assassins, thargoid scouts and strike forces, interceptor wings tied to remote heavy packs, Q-bombs, the nova populator | outside "traders, pirates and police"; each needs its own hulls and AI | Pirates launch from the planet only (no pirate-allegiance stations); skip `oolite-assassins`, `oolite-thargoid-*`, `oolite-interceptors-*` |
| Medium and heavy hunter packs, `bountyHunterLeaderAI`, escorts of hunters | needs witchspace-capable groups and the freighter-class economy | Light hunters only (Q6) |
| Running Oolite's JavaScript AI at runtime | rejected in v2.0 (state cannot be serialised or hashed) | Hand-port, as the milestone says |
| Dynamic player roles in v2.4 (see LAW-08) | adds a hashed save field and an AI-side dependency for little first-play value | Static `player-unknown`, recorded divergence |
| Rewriting the native steering | v2.2 oracle and frozen acceptance run | Add only `performCollect` and the docking stand-in behind the existing dispatch |

## 3. Feature dependencies

```
DATA-20 (record fields, role categories, AI map, station fields)
    ├──> POP-01..POP-04 (populator)
    ├──> AI-01..AI-06 (priority AI)
    └──> SCP-01, SCP-03 (hasScoop, hold capacity)

Kill-credit decision (Q2, todo mutual-kill-credit-symmetry)
    ├──> LAW-07 (bounty to credits)
    ├──> RAT-01 (kill tally)
    └──> LAW-02 (killing police marks the player)

LAW-01 (legal status on the profile, schema v6) ──> LAW-02..LAW-06, RAT-01 (same bump)
AI-01 (controller) ──> AI-02 (library) ──> AI-03/04/05 (role AIs) ──> POP-01 (groups carry AIs)
AI-06 (handlers) ──> LAW-02 (offence marking) ──> LAW-03 (police response) ──> LAW-04 (fines)
AI-07 (autonomous fire) ──> "pirates attack unprompted" acceptance
NPC-LIFE-01/02 (sinks and launches) ──> POP-03 (repopulation), AI-03 (traders end), AI-05 (police patrol returns), LAW-06 (police launch)
SCP-01 (player scooping) and SCP-03 (NPC scooping) share one collision hook
RAT-01 ──enhances──> AI-02 (threatAssessment uses score)
LAW-08 (player roles) ──enhances──> LAW-02 forgiveness, AI-04 victim choice (optional)
POP-05 (hunters) ──enhances──> Anarchy and Feudal law, AI-04 pirate fear
Missiles/ECM, escape pods, contraband, sunskim ──conflict with──> technical-minimum scope (guard tests, divergence rows)
```

### Dependency notes

- **AI before populator, populator before repopulation.** Group builders attach an AI by role; repopulation needs the sinks; the sinks need either a docking port or the stand-in.
- **Legal status needs the AI event, not the other way round.** The offence marks are produced by AI handlers on police and the station; implementing them before AI-06 means bypassing the handler (do not).
- **One schema bump.** Legal status and kills share a single v6 bump (alpha rule: no migration, as v2.3 did).
- **World hash.** Group links, intership state (`cargodemand*`), per-ship bounty, AI parameters and the repopulation clock must enter the world snapshot and hash; the 20-seed acceptance run (frozen thresholds, owner trailer to change) and the cadence hashes must keep holding.
- **Entity cap.** Oolite's population caps (40, 30, 30) together with debris, plates and pods under the v2.3 cap of 256 need an eviction policy decision (debris before ships).

## 4. MVP recommendation

Prioritise (in dependency order, as the roadmap's phases will want them):

1. **Data and decisions first** (DATA-20; Q1 to Q7 answered; kill-credit tripwire settled): record fields, role categories, AI map, station fields, hull roster, kill-credit rule, bounty timing, NPC-LIFE stand-in decision.
2. **Priority AI core and the trader, pirate and police role AIs with autonomous fire** (AI-01 to AI-08), proven on scripted scenes before any populator, so a pirate pack and a trader can be dropped in a test world and behave.
3. **Populator and repopulation with the NPC sinks and launches** (POP-01 to POP-04, NPC-LIFE-01 and 02), including the headless-Oolite composition comparison.
4. **Legal status, bounty, fines and the docking check** (LAW-01 to LAW-07), then the **kill tally and rating** (RAT-01), sharing the schema v6 bump.
5. **Scooping** (SCP-01, SCP-03; SCP-02 if the HUD light fits), which also lets pirates finish their loot cycle.
6. **One differentiator, light hunters** (POP-05), because it closes the Anarchy and Feudal gap cheaply.

Defer: dynamic player roles (LAW-08), station defence ships (AI-09), jettison (SCP-04), trader opportunists and assassins (AI-10), the vendored freighter and interceptor hulls (POP-06) unless the owner wants composition parity, and every anti-feature above.

## 5. Open questions for the owner (each one changes scope or fidelity)

| Q | Question | Recommendation |
|---|----------|----------------|
| Q1 | Bounty on kill (Oolite) or "paid on docking" as the milestone text reads? | Follow Oolite: credit at the kill with the "Bounty / Total" message. Docking pays only fines |
| Q2 | Mutual-kill credit symmetry (todo) and ram kills: settle before the first consumer | Make credit symmetric for the two consumers here (bounty, rating) and record why; the kill-credit guard names the todo |
| Q3 | NPC docking and station launching: port Oolite's docking AI or ship a stand-in (approach, vanish, spawn at the dock mouth) with a `FIDELITY.md` row? | Stand-in first, behind one seam, so a later phase can replace it; it is the single biggest cost lever |
| Q4 | Which hulls does the milestone compile (nine now; freighters, interceptor, Cobra III variants, Asp)? | Compile the missing roles' hulls only if composition parity with headless Oolite is a hard acceptance; otherwise accept fallbacks and record them. At minimum make police patrols not vanish at TL 10+ |
| Q5 | Player role system: static `player-unknown` or dynamic? | Static, with a divergence row: first laser hit on a clean ship is an offence with no forgiveness |
| Q6 | Light hunters in or out? | In, light hunters only; otherwise the Anarchy and Feudal systems have no law |
| Q7 | Jettison cargo, or suppress the pirate demand line, or keep the line and let pirates fight on? | Keep Oolite's line and add no jettison in v2.4; record the divergence (the demand can only be met by killing the pirate) or add a minimal `j` jettison in the scooping phase if the owner prefers |

## Sources

- Oolite source checkout `/home/opencode/git/oolite` (HIGH): `Resources/Scripts/oolite-populator.js`, `Resources/Scripts/oolite-priorityai.js`, `Resources/AIs/oolite-{traderAI,pirateAI,pirateFighterAI,pirateFreighterAI,policeAI,escortAI,stationAI,bountyHunterAI}.js`, `Resources/Config/{shipdata,role-categories,autoAImap,descriptions,equipment,planetinfo}.plist`, `src/Core/Universe.{h,m}`, `src/Core/Entities/{PlayerEntity,PlayerEntityControls,PlayerEntityContracts,PlayerEntityScriptMethods,ShipEntity,ShipEntityAI,StationEntity}.m`, `src/Core/OOConstToString.m`, `src/Core/Scripting/OOJSShip.m`.
- Wegolite (HIGH): `.planning/PROJECT.md`, `AGENTS.md`, `src/sim/world/populate.ts`, `placement.ts`, `src/sim/ai/types.ts`, `src/sim/events.ts`, `src/sim/npc/*`, `src/sim/combat/{alert,collide,response}.ts`, `src/ui/station-model.ts`, `src/sim/player/profile.ts`, `src/content/generated/{ships-npc.json,systems/g0.json}`, `third_party/oolite/pin.json`, todos `2026-11-18-mutual-kill-credit-symmetry`, `2026-11-25-missiles-and-ecm`, `2026-11-25-cargo-legality-penalties`, guard `tests/guards/kill-credit-consumers.test.ts`.
- Derived figures (population table, odds example, pack sizes) are computed from the cited formulas with a scratch script over the compiled galaxy data (MEDIUM); the headless-Oolite reference (`tools/oolite-reference`) is the intended check.
- No web or Context7 provider was used; the research-plan and classify-confidence seams were not needed because every source is the local checkout.
