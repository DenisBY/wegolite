# Fidelity map: Wegolite against Oolite

This document maps each mechanic that the v1 single-player loop ports from Oolite to the Wegolite file that implements it, and to the Oolite source that defines it. Each row states whether Wegolite is `faithful` or a recorded `divergence`, and every divergence names its row in the PROJECT.md Key Decisions table. The scope is the single-player loop shipped in v1: launch, flight, docking, trade, outfitting and hyperspace, plus the build-time ship mass of v2.1 (DATA-11). The source of truth is Oolite release 1.93.1-241 at commit `7437f22` (`third_party/oolite/pin.json`). Every excerpt below is copied from that commit, not from a checkout's HEAD.

## Attribution

The quoted excerpts are from Oolite, Copyright © 2004-2026 Giles C Williams, Jens Ayton and contributors, and are licensed under GPL-2.0-or-later. They are quoted unmodified, taken from `git show 7437f22:<path>`, so each one can be checked against that commit. The quotation is recorded as one row in ASSETS.md.

## How to check a row

The Wegolite cell is a `src/` path and a line. For a build-time mechanic it is the schema field in `src/` that carries the compiled value, and the Mechanic cell names the `tools/` module that computes it. The Oolite cell is the Oolite file and line range, and the excerpt with the same id quotes those lines verbatim. The contract test in `tests/contract/fidelity.test.ts` checks every row on every run. When `OOLITE_SRC` points at a tree at commit `7437f22`, it also checks each excerpt against that tree.

## Mechanics

| Mechanic                                                                                                                                                                                                                                                                                                                                                                                                                                           | Wegolite                                          | Oolite (7437f22)                                        | Fidelity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Excerpt |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Commodity stock and price for each good at system generation (ECON-01, ECON-02)                                                                                                                                                                                                                                                                                                                                                                    | `src/sim/economy/market.ts:180`                   | `src/Core/OOCommodities.m:261-278`                      | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-01    |
| Chart distance with C integer truncation (NAV-01)                                                                                                                                                                                                                                                                                                                                                                                                  | `src/sim/hyperspace/jump.ts:89`                   | `src/Core/legacy_random.h:154-160`                      | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-02    |
| Witchpoint exit offset on arrival (NAV-05)                                                                                                                                                                                                                                                                                                                                                                                                         | `src/sim/hyperspace/arrival.ts:125`               | `src/Core/Entities/PlayerEntity.m:6913-6928`            | divergence: the offset is drawn from the seeded PRNG at jump commit, not from Oolite's global Ranrot stream. PROJECT.md: "Draw the arrival pose from the seeded PRNG at jump commit, in three dimensions as Oolite does"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-03    |
| Pitch and roll rates and their damping (FLGT-02)                                                                                                                                                                                                                                                                                                                                                                                                   | `src/sim/flight/attitude.ts:34`                   | `src/Core/Entities/PlayerEntityControls.m:3726-3728`    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-04    |
| Speed ramp toward the torus cap                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/sim/flight/speed.ts:37`                      | `src/Core/Entities/PlayerEntity.m:2745-2748`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-05    |
| Torus factor from the nearest body (FLGT-04)                                                                                                                                                                                                                                                                                                                                                                                                       | `src/sim/flight/torus.ts:79`                      | `src/Core/Entities/PlayerEntity.m:2958-2967`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-06    |
| Torus mass lock near a body (planet branch)                                                                                                                                                                                                                                                                                                                                                                                                        | `src/sim/flight/torus.ts:99`                      | `src/Core/Entities/PlayerEntity.m:3019-3024`            | divergence: the torus disengages on any pilot input, which is stricter than Oolite's speed and mass-lock rule. PROJECT.md: "Torus disengages on any pilot input (deliberately stricter than Oolite)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | E-07    |
| Launch roll basis taken from the station                                                                                                                                                                                                                                                                                                                                                                                                           | `src/sim/flight/launch.ts:116`                    | `src/Core/Entities/PlayerEntity.m:6469-6470`            | divergence: launch roll is expressed in the station's world basis, not Oolite's ship-relative value. During the launch Wegolite rolls the hull with the station (D-10), whereas Oolite saves the station's spin and sets `flightRoll` to 0 while it shows the break pattern (`PlayerEntity.m:6469-6470`) and restores it once the pattern no longer hides the world (`PlayerEntity.m:3521-3522`). Since quick 261118-spu the HUD roll bar reads 0 while launching, faithful to E-08, while the hull keeps the station's roll; Oolite's bar shows the station spin again in the last moments, once at most five break-pattern rings remain (`Universe.m:3516-3520`), whereas Wegolite holds 0 to handover, where `completeLaunch` zeroes the roll rate, so the bar does not jump. PROJECT.md: "Launch roll is expressed in the station's world basis (D-10 reconciliation)" | E-08    |
| Station and planet aegis                                                                                                                                                                                                                                                                                                                                                                                                                           | `src/sim/world/aegis.ts:34`                       | `src/Core/Entities/ShipEntity.m:6699-6702`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-09    |
| System layout: the sun clears the witchpoint by six sun radii                                                                                                                                                                                                                                                                                                                                                                                      | `src/sim/world/layout.ts:139`                     | `src/Core/Universe.m:1473-1473`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-10    |
| Docking corridor auto-centre and the y guard                                                                                                                                                                                                                                                                                                                                                                                                       | `src/sim/dock/corridor.ts:344`                    | `src/Core/Entities/DockEntity.m:748-755`                | divergence: the y auto-centre guard is symmetric. PROJECT.md: "Apply the y auto-centre guard symmetrically"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | E-11    |
| Dock latch arming past the contact proxy                                                                                                                                                                                                                                                                                                                                                                                                           | `src/sim/dock/step.ts:163`                        | `src/Core/Entities/DockEntity.m:716-720`                | divergence: the latch arms only once the contact proxy is clear, not at the mouth plane. PROJECT.md: "Arm the dock latch past the contact proxy, not at the mouth plane"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-12    |
| Docking computer tech-level gate (TL 9)                                                                                                                                                                                                                                                                                                                                                                                                            | `src/sim/player/outfitting.ts:303`                | `src/Core/Entities/PlayerEntity.m:8293-8295`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-13    |
| Cargo pod and unit boundaries                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/sim/economy/cargo.ts:22`                     | `src/Core/Entities/PlayerEntity.h:1294-1297`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-14    |
| Buying in kg and g, clamped to the hold                                                                                                                                                                                                                                                                                                                                                                                                            | `src/sim/economy/cargo.ts:156`                    | `src/Core/Entities/PlayerEntity.m:10029-10040`          | divergence: a partially filled hold is clamped exactly. PROJECT.md: "Clamp kg/g buys exactly in a partially filled hold (improves on Oolite)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | E-15    |
| Market lifetime across reload and system changes                                                                                                                                                                                                                                                                                                                                                                                                   | `src/sim/economy/market.ts:41`                    | `src/Core/Universe.m:7173-7191`                         | divergence: Wegolite persists one market seed and regenerates from it, so a reload reproduces every price. PROJECT.md: "Stable market across reload: persist the seed (deliberate modernisation)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | E-16    |
| Missile removal trade-in                                                                                                                                                                                                                                                                                                                                                                                                                           | `src/sim/player/outfitting.ts:443`                | `src/Core/Entities/PlayerEntity.m:9326-9330`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-17    |
| Missile cap                                                                                                                                                                                                                                                                                                                                                                                                                                        | `src/sim/player/outfitting.ts:47`                 | `src/Core/Entities/PlayerEntity.h:284-286`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-18    |
| Hyperspace fuel cost                                                                                                                                                                                                                                                                                                                                                                                                                               | `src/sim/hyperspace/jump.ts:116`                  | `src/Core/Entities/PlayerEntity.m:6630-6633`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-19    |
| Hyperspace jump clock                                                                                                                                                                                                                                                                                                                                                                                                                              | `src/sim/hyperspace/jump.ts:106`                  | `src/Core/Entities/PlayerEntity.m:6884-6886`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-20    |
| Hyperspace countdown cancelled by a dock                                                                                                                                                                                                                                                                                                                                                                                                           | `src/sim/flight/step.ts:272`                      | `src/Core/Entities/PlayerEntity.m:3296-3297`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-21    |
| Mass blockage at jump completion (Coriolis station, both buoys and NPC ships)                                                                                                                                                                                                                                                                                                                                                                      | `src/sim/hyperspace/countdown.ts:110`             | `src/Core/Entities/ShipEntity.m:12526-12530`            | divergence: only for the stations without a recorded mass: the 224 dodecahedron and icosahedron systems do not block (D-03). The Coriolis station, NPC ships (WORLD-10, Phase 12) and both live buoys (D-09, Phase 18 plan 18-07) block as in Oolite, the buoys from their live position with their live mass, and a destroyed buoy never blocks. PROJECT.md: "Block a witchspace jump that completes inside Oolite's mass-blockage radius of a Coriolis station"; the buoys are the row "Buoys block a completing jump (Phase 18, D-09)"                                                                                                                                                                                                                                                                                                                                  | E-22    |
| Pods and plates never block a completing jump and never mass-lock; buoys never mass-lock (D-08)                                                                                                                                                                                                                                                                                                                                                    | `src/sim/world/ship-field.ts:131`                 | `src/Core/Entities/ShipEntity.m:12526-12530`            | divergence: Oolite's blockage loop is class-free, so a cargo pod (mass 993.37) within 9.97 m and an alloy plate (mass 273.44) within 5.23 m of the player's centre would block; Wegolite's pods and plates have no entry in the NPC mass list and never block. Plan 18-20 measured the class-free rule in a running Oolite on a cargo-class surrogate (SAME for the rule). The difference can matter only while the piece sits inside the Cobra's 72.7 m hull, where Oolite's collision has already acted. The mass-lock half is faithful (`CLASS_CARGO` and `CLASS_BUOY` never lock, `PlayerEntity.m:3044-3061`). PROJECT.md: "Buoys block a completing jump (Phase 18, D-09)"                                                                                                                                                                                            | E-22    |
| Coriolis station mass for blockage                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/sim/hyperspace/countdown.ts:61`              | `src/Core/Entities/ShipEntity.m:12504-12504`            | divergence: the cited comment's 455,223,200 predates the current meshes; blockage uses the mass Oolite computes for the pinned meshes (E-27, E-28). PROJECT.md: "Coriolis blockage mass: Oolite's computed 515,483,904 replaces the 455,223,200 source comment (Phase 10, D-04)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | E-23    |
| Chart orientation: a larger galaxy y is drawn lower                                                                                                                                                                                                                                                                                                                                                                                                | `src/ui/chart-model.ts:206`                       | `src/Core/GuiDisplayGen.m:1575-1575`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-24    |
| Chart star placement                                                                                                                                                                                                                                                                                                                                                                                                                               | `src/ui/chart-model.ts:206`                       | `src/Core/GuiDisplayGen.m:1947-1948`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-25    |
| Planet surface colour classes (PlanetMix thresholds only; see open items)                                                                                                                                                                                                                                                                                                                                                                          | `src/render/shaders/planet.glsl.ts:219`           | `src/Core/Materials/OOPlanetTextureGenerator.m:666-679` | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-26    |
| Ship mass from the hull octree, density x 20 x volume (DATA-11; computed in `tools/oolite-ingest/convert/ship-mass.ts`)                                                                                                                                                                                                                                                                                                                            | `src/content/schemas/ship-npc.ts:36`              | `src/Core/Entities/ShipEntity.m:417-419`                | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-27    |
| Solid subentity masses added to the parent (the Coriolis faceplate, tris and dock; flashers excluded)                                                                                                                                                                                                                                                                                                                                              | `src/content/schemas/ship.ts:97`                  | `src/Core/Entities/ShipEntity.m:2034-2041`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-28    |
| Station and buoy collision radius: the hull radius extended by each solid subentity to the distance of its position plus its own radius, flashers excluded (build time, `tools/oolite-ingest/convert/ship-radius.ts`)                                                                                                                                                                                                                              | `src/sim/world/layout.ts:71`                      | `src/Core/Entities/ShipEntity.m:2033-2041`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-89    |
| Octree depth from the mesh size (computed in `tools/oolite-ingest/convert/octree.ts`)                                                                                                                                                                                                                                                                                                                                                              | `src/content/schemas/ship-npc.ts:36`              | `src/Core/OOMesh.m:609-619`                             | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-29    |
| Octree volume summed to five levels whatever the build depth                                                                                                                                                                                                                                                                                                                                                                                       | `src/content/schemas/ship-npc.ts:36`              | `src/Core/Octree.m:672-680`                             | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-30    |
| Mass lock by NPC ships (WORLD-10)                                                                                                                                                                                                                                                                                                                                                                                                                  | `src/sim/world/ship-field.ts:112`                 | `src/Core/Entities/PlayerEntity.m:3044-3061`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-31    |
| Torus factor from the nearest body, ships excluded                                                                                                                                                                                                                                                                                                                                                                                                 | `src/sim/flight/torus.ts:53`                      | `src/Core/Entities/PlayerEntity.m:2918-2934`            | divergence: Oolite's factor takes the nearest collidable entity including ships; Wegolite keeps the five bodies, because WORLD-10 does not ask for it and the factor differs only above 102.4 km from every body. PROJECT.md: "Torus factor ignores NPC ships"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | E-32    |
| Torus factor's nearest surface reads the layout buoys                                                                                                                                                                                                                                                                                                                                                                                              | `src/sim/flight/torus.ts:53`                      | `src/Core/Entities/PlayerEntity.m:2918-2934`            | divergence: `nearestSurfaceDistance` (`src/sim/flight/torus.ts:53-71`, used at :160 and :252) still reads `layout.navBuoy` and `layout.witchpoint`, so since Phase 18 a destroyed witchpoint beacon still caps the factor within 102.4 km of where it was and a moved buoy counts at its layout position, while Oolite takes the nearest live collidable entity (`PlayerEntity.m:2917-2924`). Deterministic, so no hash risk; plan 18-07 was at its file limit, so the fix is the todo 2026-11-20-torus-nearest-surface-live-buoys. PROJECT.md: "Buoys block a completing jump (Phase 18, D-09)"                                                                                                                                                                                                                                                                           | E-32    |
| NPC ship collision radius (build time, `tools/oolite-ingest/convert/ship-radius.ts`; no solid subentity)                                                                                                                                                                                                                                                                                                                                           | `src/content/schemas/ship-npc.ts:42`              | `src/Core/OOMesh.m:1803-1822`                           | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-33    |
| Populator location codes (LANE_WP, LANE_WS, LANE_PS, LANE_WPS, STATION_AEGIS)                                                                                                                                                                                                                                                                                                                                                                      | `src/sim/world/placement.ts:177`                  | `src/Core/Universe.m:1796-1815`                         | divergence: every rejection loop is capped at 256 tries with a last-candidate fallback (Oolite loops are uncapped); no committed galaxy-0 system takes the fallback. PROJECT.md: "First inert populator (WORLD-15)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | E-34    |
| First populator: which ships, where (fixed 12-ship table, singles, no rates or groups)                                                                                                                                                                                                                                                                                                                                                             | `src/sim/world/populate.ts:90`                    | `src/Core/Universe.m:2648-2648`                         | divergence: Oolite's populator rolls its own counts, rates and groups per system (oolite-populator.js, not under src/); Wegolite places a fixed table of 12 single ships and puts shuttles and scavengers at STATION_AEGIS. PROJECT.md: "First inert populator (WORLD-15)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | E-35    |
| Laser fire gate: refused while the facing's laser is at or above 85 % of its temperature limit (CBT-05)                                                                                                                                                                                                                                                                                                                                            | `src/sim/combat/weapons.ts:52`                    | `src/Core/Entities/PlayerEntity.m:5460-5464`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-36    |
| Laser fire gate: refused when the energy bank is at or below the shot's cost, strict (CBT-05)                                                                                                                                                                                                                                                                                                                                                      | `src/sim/combat/weapons.ts:58`                    | `src/Core/Entities/PlayerEntity.m:5478-5481`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-37    |
| Shot cost: energy, the facing's laser heat and its shot timer reset (CBT-05)                                                                                                                                                                                                                                                                                                                                                                       | `src/sim/combat/weapons.ts:68`                    | `src/Core/Entities/PlayerEntity.m:5485-5491`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-38    |
| Weapon cooling each step, floored at 0 (CBT-05)                                                                                                                                                                                                                                                                                                                                                                                                    | `src/sim/combat/weapons.ts:84`                    | `src/Core/Entities/PlayerEntity.m:2481-2485`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-39    |
| Laser recharge gate: a held fire key fires again only once the facing's shot timer exceeds the laser's recharge rate (CBT-05)                                                                                                                                                                                                                                                                                                                      | `src/sim/combat/weapons.ts:51`                    | `src/Core/Entities/PlayerEntityControls.m:1185-1185`    | divergence: the timer counts fixed ticks, so the gate is a strict comparison in integer ticks. PROJECT.md: "Quantise the laser recharge gate to integer ticks and keep the strict `>`"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | E-40    |
| Energy bank recharge first, then each shield's recharge capped by its room (CBT-06)                                                                                                                                                                                                                                                                                                                                                                | `src/sim/combat/shields.ts:51`                    | `src/Core/Entities/PlayerEntity.m:2581-2597`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-41    |
| Energy available to the shields (a quarter of the bank held back while both shields are above a quarter) and the lower shield served first (CBT-06)                                                                                                                                                                                                                                                                                                | `src/sim/combat/shields.ts:66`                    | `src/Core/Entities/PlayerEntity.m:2603-2616`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-42    |
| Shields gain, the bank pays, shields and energy clamp to their maxima (CBT-06)                                                                                                                                                                                                                                                                                                                                                                     | `src/sim/combat/shields.ts:85`                    | `src/Core/Entities/PlayerEntity.m:2619-2625`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-43    |
| Hit routing: the attacker's side picks the shield, the forward one when ahead or abeam (CBT-06)                                                                                                                                                                                                                                                                                                                                                    | `src/sim/combat/shields.ts:132`                   | `src/Core/Entities/PlayerEntity.m:5646-5662`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-44    |
| Overflow to the energy bank and cabin heat from energy damage (CBT-06)                                                                                                                                                                                                                                                                                                                                                                             | `src/sim/combat/shields.ts:152`                   | `src/Core/Entities/PlayerEntity.m:5666-5677`            | divergence: the energy bank floors at 0, because player death and ejection are outside this milestone. PROJECT.md: "Floor the player's energy at 0 until a death phase exists"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | E-45    |
| Cabin cooling in space (CBT-06)                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/sim/combat/shields.ts:175`                   | `src/Core/Entities/PlayerEntity.m:2662-2672`            | divergence: the external temperature is 0 and the sun branch is not ported. PROJECT.md: "External cabin temperature is 0; sun and atmosphere heating stay out (D-05)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | E-46    |
| Docking restores both shields, the energy bank, the laser temperature and the cabin temperature (DOCK-10)                                                                                                                                                                                                                                                                                                                                          | `src/sim/combat/state.ts:114`                     | `src/Core/Entities/PlayerEntity.m:6321-6325`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-47    |
| Laser hit stage B, Oolite's subentity rule: the hull octree, then each subentity's octree with the segment shifted by its authored position; the smallest non-zero distance wins and the hull keeps an exact tie (CBT-07, CBT-17)                                                                                                                                                                                                                  | `src/sim/combat/hit.ts:183`                       | `src/Core/Entities/ShipEntity.m:1337-1354`              | divergence: the main station only absorbs a hit, with no energy change (Oolite lowers its energy only while the amount is below it and recharges 100 per second, `StationEntity.m:1110-1160`), and shooting it carries no legal or police consequence (Oolite marks the shooter an offender and launches police, `StationEntity.m:1128-1141`). PROJECT.md: "Statics are laser targets through Oolite's subentity rule (Phase 18, CBT-17)"                                                                                                                                                                                                                                                                                                                                                                                                                                  | E-48    |
| Two-stage laser hit: the bounding-sphere test, then the octree with its subentities (E-48), nearest hit wins (CBT-07)                                                                                                                                                                                                                                                                                                                              | `src/sim/combat/hit.ts:155`                       | `src/Core/Universe.m:5615-5628`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-118   |
| Buoy energy: 250 in the static health (the buoy's `max_energy`), lowered by each laser hit and destroyed once at 0, and recharged by `energy_recharge_rate` 2 per second up to the maximum on every stepped tick, only while alive (CBT-17)                                                                                                                                                                                                        | `src/sim/combat/step.ts:342`                      | `src/Core/Entities/ShipEntity.m:2417-2425`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-56    |
| A destroyed buoy releases no debris: Oolite's alloy count `sqrtf(sqrtf(mass / 6000))` is about 3.29 for the buoy, so it releases 3 wrecks and then 0 to 3 plates (CBT-17)                                                                                                                                                                                                                                                                          | `src/sim/world/kill.ts:179`                       | `src/Core/Entities/ShipEntity.m:7915-7916`              | divergence: `destroyBuoy` releases nothing; Oolite's buoy releases 3 wrecks (`ShipEntity.m:8050-8056`) and `randf() * n_alloys` plates (`ShipEntity.m:8068, 8081`), drawn from a per-entity stream that the statics do not have; the buoy's blast is plan 18-19's. PROJECT.md: "Statics are laser targets through Oolite's subentity rule (Phase 18, CBT-17)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | E-76    |
| Buoy tumble at roll 0.10 and pitch 0.15 rad/s (`performBuoyTumble`, `ShipEntityAI.m:458-464`) as the closed form roll(+Z, 0.10 t) x pitch(+X, 0.15 t) of the flight clock, the one pose the laser hits and the renderer draws (CBT-17)                                                                                                                                                                                                             | `src/sim/world/statics.ts:130`                    | `src/Core/Entities/ShipEntity.m:3724-3727`              | divergence: Oolite applies roll then pitch incrementally in the body frame each frame through `behaviour_tumble` and `applySticks`, a different rotation for t > 0; the closed form is deterministic and is now a hit and collision pose rather than a drawn one, and the buoy is nearly symmetric, so the effect on hits is small. PROJECT.md: "Statics are laser targets through Oolite's subentity rule (Phase 18, CBT-17)"                                                                                                                                                                                                                                                                                                                                                                                                                                             | E-119   |
| Frangible subentity damage (PD-01): a laser hit routed to a buoy's subentity puts 1 % of the damage on the buoy and then the full damage on the subentity, as two hit records on the static ids 4 or 5 and 6 or 7 (CBT-17)                                                                                                                                                                                                                         | `src/sim/combat/step.ts:577`                      | `src/Core/Entities/ShipEntity.m:10409-10416`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-120   |
| Sticky subentity routing (PD-01): a shot whose winning part is a buoy's subentity sets the buoy's flag; while it is set, every laser hit on that buoy from any shooter, hull hits included, is routed 1 % and 100 % (`ShipEntity.m:10202`, `10409` read the flag), and detachment clears it (`ShipEntity.m:8187-8188`) (CBT-17)                                                                                                                    | `src/sim/combat/step.ts:614`                      | `src/Core/Universe.m:5633-5636`                         | divergence: within one tick every shot is routed from the flag as it stood when the shots were resolved, so a second shot in the tick that detaches the subentity is still split and its 100 % part changes nothing, where Oolite's second shooter would meet the cleared flag and hit the hull in full; the flag is set in ascending shooter id, not in Oolite's update order; and Oolite's precise target reticle also sets the flag every frame without firing (`HeadUpDisplay.m:3311, 3318` through `Universe.m:5756`), which Wegolite does not port. PROJECT.md: "Statics are laser targets through Oolite's subentity rule (Phase 18, CBT-17)"                                                                                                                                                                                                                       | E-121   |
| Buoy subentity energy (PD-01): 200 (the default `max_energy`), lowered by each routed hit, and recharged by the default `energy_recharge_rate` 1 per second up to 200 on every stepped tick, only while attached and while its buoy is alive (CBT-17)                                                                                                                                                                                              | `src/sim/combat/step.ts:370`                      | `src/Core/Entities/ShipEntity.m:291-292`                | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-122   |
| Buoy subentity detachment (PD-01): at 0 energy the routing flag clears and the subentity leaves the hit test for the life of its world (CBT-17)                                                                                                                                                                                                                                                                                                    | `src/sim/combat/ledger.ts:173`                    | `src/Core/Entities/ShipEntity.m:8185-8193`              | divergence: the detached subentity gets no explosion and no debris, where Oolite's explodes through `becomeExplosion` (`ShipEntity.m:7901`) like a ship; its mass drop and hidden mesh land in plans 18-07, 18-08 and 18-18 and its blast push in 18-19. PROJECT.md: "Statics are laser targets through Oolite's subentity rule (Phase 18, CBT-17)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | E-123   |
| A cargo pod or alloy plate is a laser target (D-07): energy 1, so one pulse kills it through `killShip`, which removes it silently; a wreck is never a candidate (`canCollide`, `ShipEntity.m:1858-1868`) (CBT-17)                                                                                                                                                                                                                                 | `src/sim/world/kill.ts:147`                       | `src/Core/Entities/ShipEntity.m:7957-7965`              | divergence: no explosion is drawn for a destroyed pod or plate, where Oolite adds its default explosion cloud and flash; its blast push is plan 18-19's. PROJECT.md: "Debris is not a target in Phase 16"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | E-124   |
| Octree line test: the distance to the first solid leaf reached, resolved at the cube of the array node that holds it (CBT-07)                                                                                                                                                                                                                                                                                                                      | `src/sim/combat/octree.ts:345`                    | `src/Core/Octree.m:361-366`                             | divergence: the maths run in float64, not float32. PROJECT.md: "Run the octree ray maths in float64, so only boundary rays may differ from Oolite's float32"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | E-49    |
| Octree visiting order: the intersected octant, three neighbours, the back three, the diagonal (CBT-07)                                                                                                                                                                                                                                                                                                                                             | `src/sim/combat/octree.ts:405`                    | `src/Core/Octree.m:413-422`                             | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-50    |
| Laser frame: the view rotates the weapon about the ship's up axis (aft pi, port +pi/2, starboard -pi/2) (CBT-04, CBT-05)                                                                                                                                                                                                                                                                                                                           | `src/sim/combat/aim.ts:63`                        | `src/Core/Universe.m:5587-5603`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-51    |
| Ident acquisition: the nearest target whose collision sphere the view axis crosses, within 100 m of the scanner range: the station and both buoys (statics 3 to 5, live position, layout radius, unless destroyed) first, then ships, pods and plates in ascending id; never a wreck (INPUT-01, CBT-17)                                                                                                                                            | `src/sim/combat/ident.ts:158`                     | `src/Core/Universe.m:5689-5707`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-52    |
| Ident key: clears a standing lock, engages ident and re-acquires on the next pass (INPUT-01; owner-confirmed 2026-11-15)                                                                                                                                                                                                                                                                                                                           | `src/sim/combat/ident.ts:146`                     | `src/Core/Entities/PlayerEntityControls.m:4758-4773`    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-53    |
| Untarget key: drops the lock and switches ident off (INPUT-01)                                                                                                                                                                                                                                                                                                                                                                                     | `src/sim/combat/ident.ts:146`                     | `src/Core/Entities/PlayerEntityControls.m:1404-1419`    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-54    |
| Laser purchase and trade-in: the full price against the credits, then the replaced laser refunded (CBT-05)                                                                                                                                                                                                                                                                                                                                         | `src/sim/player/outfitting.ts:623`                | `src/Core/Entities/PlayerEntity.m:9210-9217`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-55    |
| NPC energy bank recharge each stepped tick, capped at the maximum (CBT-07)                                                                                                                                                                                                                                                                                                                                                                         | `src/sim/combat/step.ts:321`                      | `src/Core/Entities/ShipEntity.m:2417-2425`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-56    |
| `applySticks:` roll and pitch rates: the sticks slew at 2 and 4 per second, four times faster against the current rate, twice as fast again at accuracy 7.5 or above with a centred stick (AI-01)                                                                                                                                                                                                                                                  | `src/sim/npc/flight.ts:53`                        | `src/Core/Entities/ShipEntity.m:7021-7039`              | divergence: the stick and flight rates are float64 where Oolite stores GLfloat, and yaw is not modelled. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | E-57    |
| `applyThrust:` TUMBLE return, the clamp of the desired speed, the ramp up and down without overshoot, and the move along the nose (AI-01)                                                                                                                                                                                                                                                                                                          | `src/sim/npc/flight.ts:151`                       | `src/Core/Entities/ShipEntity.m:5826-5843`              | divergence: the idle fallback ramps thrust for TRACK_AS_TURRET and ENERGY_BOMB_COUNTDOWN, where Oolite turns it off, and does not move TRACTORED ships by Oolite's rule; the speed is float64. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | E-58    |
| The attitude step `applyRoll:climb:andYaw:`: roll about z, climb about x, composed into the orientation (AI-01)                                                                                                                                                                                                                                                                                                                                    | `src/sim/npc/flight.ts:99`                        | `src/Core/Entities/ShipEntity.m:5881-5897`              | divergence: yaw is not modelled, and the composition is written in Wegolite's frame (z negated) in float64. PROJECT.md: "Phase 14 NPC steering scope"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | E-59    |
| `trackDestination:` dead band at 95 % of the desired range and the zero-vector guard (AI-01)                                                                                                                                                                                                                                                                                                                                                       | `src/sim/npc/track.ts:118`                        | `src/Core/Entities/ShipEntity.m:9477-9496`              | divergence: the `d_forward` cosine is clamped into [-1, 1] before any compare (a Wegolite addition), the docking branches are not ported and the locals are float64. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | E-60    |
| Fly to destination: arrival inside the desired range, the `shipAchievedDesiredRange` event and the IDLE hand-over (AI-01)                                                                                                                                                                                                                                                                                                                          | `src/sim/npc/behaviours/fly-to-destination.ts:82` | `src/Core/Entities/ShipEntity.m:5049-5065`              | divergence: the frustration counter is floored at 0 after a report, where Oolite's can go negative, the docking branch is not ported and the plist-only message is not posted. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | E-61    |
| Face destination: settle test, the `shipNowFacingDestination` event, the IDLE hand-over and the frustration escape at 15 over the pitch rate (AI-01)                                                                                                                                                                                                                                                                                               | `src/sim/npc/behaviours/face-destination.ts:36`   | `src/Core/Entities/ShipEntity.m:4929-4948`              | divergence: `shipAIFrustrated` carries no behaviour name, and the docking branch is not ported. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | E-62    |
| `trackPrimaryTarget:` lost-target entry: no target or a target that cannot be tracked goes IDLE and returns 0 (AI-01)                                                                                                                                                                                                                                                                                                                              | `src/sim/npc/track.ts:291`                        | `src/Core/Entities/ShipEntity.m:9034-9046`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-63    |
| `startTrackingCurve`: four copies of the target's position at the times now, a third, two thirds and the whole reaction time back (AI-01)                                                                                                                                                                                                                                                                                                          | `src/sim/npc/tracking-curve.ts:58`                | `src/Core/Entities/ShipEntity.m:5425-5442`              | divergence: the clock is the whole-tick counter, the sample gate is a fixed 60 ticks where Oolite's `universal_time` gives 60 or 61, and the curve is started by `setTarget` and the world step. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-64    |
| Intercept target: full speed, the per-update `shipAchievedDesiredRange` event inside the desired range, speed scaled by the tracking confidence (AI-01)                                                                                                                                                                                                                                                                                            | `src/sim/npc/behaviours/intercept.ts:28`          | `src/Core/Entities/ShipEntity.m:3817-3826`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-65    |
| `performFlee`: the guard under FLEE_EVASIVE_ACTION, the 400 evasive jink, and the aspect test that picks EVASIVE_ACTION with chance 0.15 (AI-01)                                                                                                                                                                                                                                                                                                   | `src/sim/npc/enter.ts:91`                         | `src/Core/Entities/ShipEntityAI.m:379-392`              | divergence: the aspect read and the jink draws happen at the ship's next update, one update after Oolite's. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | E-66    |
| The attack dispatcher's forward-weapon selection: sniper above 12,500 m, six or twelve below accuracy 0, else fly to target (AI-01)                                                                                                                                                                                                                                                                                                                | `src/sim/npc/behaviours/attack.ts:241`            | `src/Core/Entities/ShipEntity.m:4156-4170`              | divergence: the approach aspect snaps a residue under 1e-12 to 0, and the forward weapon is the compiled one at weapon temperature 0. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | E-67    |
| `avoidCollision`: the saved condition, the midpoint destination, the desired range of ten radii and the AVOID_COLLISION entry (AI-01)                                                                                                                                                                                                                                                                                                              | `src/sim/npc/avoid.ts:69`                         | `src/Core/Entities/ShipEntity.m:5917-5934`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-68    |
| `setProximityAlert:` zone: twice the ship's radius plus the other's, in the ship's frame, with the forward stretch for a body ahead (AI-01)                                                                                                                                                                                                                                                                                                        | `src/sim/npc/proximity.ts:105`                    | `src/Core/Entities/ShipEntity.m:6119-6131`              | divergence: the collision-chain prefilter covers only pairs that include a buoy (Phase 18, PD-08), pairs are visited in ascending id, every ship counts as crewed and an inert ship holds no alert. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | E-69    |
| The navigation buoys are proximity candidates: every live buoy at its live pose, a destroyed buoy absent from the view, and a buoy never alerted (AI-01, CBT-18, PD-06)                                                                                                                                                                                                                                                                            | `src/sim/npc/proximity.ts:280`                    | `src/Core/CollisionRegion.m:284-303`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-142   |
| The collision-chain prefilter, `filterSortedLists`: a body that cannot collide is filtered out, and the downward walks never run, so no collidable body is eliminated (PD-08)                                                                                                                                                                                                                                                                      | `src/sim/npc/collision-chain.ts:176`              | `src/Core/Universe.m:6713-6732`                         | divergence: the prefilter gates only pairs that include a buoy; every other pair keeps the plain pair trigger (todo `2026-11-20-collision-chain-prefilter-all-pairs`). PROJECT.md: "Navigation buoys in the NPC proximity pass behind Oolite's collision chain (Phase 18, PD-06, PD-08; plan 18-21)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | E-143   |
| The z collision chain: lists sorted by lower edge, a body joins the run while its `z - 2r` lies below the running `z + 2r` finish, and a pair is tested only inside one chain (PD-08)                                                                                                                                                                                                                                                              | `src/sim/npc/collision-chain.ts:119`              | `src/Core/Universe.m:7045-7064`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-144   |
| The escort destination refresh: each follower of a steered leader gets its slot's coordinates (AI-01)                                                                                                                                                                                                                                                                                                                                              | `src/sim/npc/escort.ts:72`                        | `src/Core/Entities/ShipEntity.m:2427-2436`              | divergence: escort slots are fixed per follower and an inert leader refreshes nobody. PROJECT.md: "Phase 14 recorded divergences from Oolite"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | E-70    |
| Pod survival at the explosion: a 70 % chance per capsule, falling by 30 to a floor of 10 after each survivor, at most 15 pods (WORLD-17)                                                                                                                                                                                                                                                                                                           | `src/sim/world/debris.ts:669`                     | `src/Core/Entities/ShipEntity.m:7823-7841`              | divergence: the survival draws come from the victim's own combat stream, not Oolite's global `Ranrot`, and the player's step of 20 is unreachable because the player is never a victim. PROJECT.md: "Destroyed ships explode into Oolite's debris on their own combat stream, in one fixed order"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | E-71    |
| Pod and plate placement: a random point of the victim's bounding box, a -3 to 3 m jitter per axis, and a kick of 0.1 x (rand % 200 - 100) per axis added to the victim's drift (WORLD-17)                                                                                                                                                                                                                                                          | `src/sim/world/debris.ts:490`                     | `src/Core/Entities/ShipEntity.m:7847-7859`              | divergence: the box offset is added unrotated in Wegolite axes (D16-18) and the drift is clamped into the sanitiser's velocity bound. PROJECT.md: "Destroyed ships explode into Oolite's debris on their own combat stream, in one fixed order"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | E-72    |
| The victim's bounding box for the pod and plate placement: the float32 extremes of the hull `.dat` vertices in Oolite's model axes, computed by `tools/oolite-ingest/convert/npc-ships.ts` (DATA-16)                                                                                                                                                                                                                                               | `src/content/schemas/ship-npc.ts:137`             | `src/Core/Entities/ShipEntity.m:7847-7859`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-72    |
| The pod and plate gate `add_debris`: fewer than 0.95 of the entity cap live (WORLD-17)                                                                                                                                                                                                                                                                                                                                                             | `src/sim/world/debris.ts:364`                     | `src/Core/Entities/ShipEntity.m:7939-7939`              | divergence: tested before each piece instead of once per explosion, against Wegolite's live dynamic entities, with the frame-time term dropped. PROJECT.md: "Debris is shed per piece at the entity cap: pods and plates below 0.95 x 256, wreckage below 0.50 x 256"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | E-73    |
| The wreckage gate: fewer than 0.50 of the entity cap live (WORLD-17)                                                                                                                                                                                                                                                                                                                                                                               | `src/sim/world/debris.ts:372`                     | `src/Core/Entities/ShipEntity.m:8047-8047`              | divergence: tested before each wreck instead of once per explosion, against Wegolite's live dynamic entities. PROJECT.md: "Debris is shed per piece at the entity cap: pods and plates below 0.95 x 256, wreckage below 0.50 x 256"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | E-74    |
| Wreck count and placement: `floor(randf x (n_alloys + 2))` below three, else three, each at a random solid point of the victim's octree rotated into the world, with lifetime `750 randf + 250 i + 100` (WORLD-17)                                                                                                                                                                                                                                 | `src/sim/world/debris.ts:687`                     | `src/Core/Entities/ShipEntity.m:8044-8063`              | divergence: a fixed budget of 7 octant draws per wreck, the model drawn uniformly from the five wreck entries, and no sub-entity wreckage. PROJECT.md: "Destroyed ships explode into Oolite's debris on their own combat stream, in one fixed order"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | E-75    |
| The alloy count before the wreck loop, `sqrtf(sqrtf(mass / 6000))`, and the kick range of 200 (WORLD-17)                                                                                                                                                                                                                                                                                                                                           | `src/sim/world/debris.ts:381`                     | `src/Core/Entities/ShipEntity.m:7915-7916`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-76    |
| The alloy plates: `n_alloys = randf x n_alloys`, none without `canFragment`, `floorf` to the plate count, each plate from the `alloy` role (WORLD-17)                                                                                                                                                                                                                                                                                              | `src/sim/world/debris.ts:761`                     | `src/Core/Entities/ShipEntity.m:8068-8086`              | divergence: one plate look (`alloy`) with no role draw, and the clamp to one plate when `add_debris` fails is replaced by the per-piece gate. PROJECT.md: "Debris assets are vendored from the local Oolite checkout and compiled with only what is drawn"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | E-77    |
| What a pod holds: Oolite draws a commodity and an amount and picks a commodity-specific pod half the time (WORLD-17)                                                                                                                                                                                                                                                                                                                               | `src/sim/world/debris.ts:662`                     | `src/Core/Universe.m:3863-3878`                         | divergence: no commodity draw; every pod is one anonymous `barrel` cargopod with no commodity or amount (OC-1). PROJECT.md: "Destroyed ships explode into Oolite's debris on their own combat stream, in one fixed order"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | E-78    |
| The wreck itself: mass 0.1 x the victim's mass x (0.75 to 1.25), a uniform rescale by the cube root, the victim's velocity, a random orientation, temperature 1000 and energy lifetime / 2 (WORLD-17)                                                                                                                                                                                                                                              | `src/sim/world/debris.ts:707`                     | `src/Core/Universe.m:5501-5519`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-79    |
| Wreck burn-down: the temperature falls by 10 per second from 1000 and drains `dt x temperature` of energy while above 256 (WORLD-17)                                                                                                                                                                                                                                                                                                               | `src/sim/world/debris.ts:275`                     | `src/Core/Entities/ShipEntity.m:2254-2272`              | divergence: the temperature is a closed function of the age from the hashed spawn tick, with no temperature field, and the lifetime has never been measured in a running Oolite. PROJECT.md: "Wreckage burns down by Oolite's heat damage, about E/1000 seconds (LOW confidence)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | E-80    |
| The blast: every ship in range gets `amount x desired_range / max(0.1, d^2 - r^2)` along the line from the explosion (WORLD-17)                                                                                                                                                                                                                                                                                                                    | `src/sim/world/debris.ts:600`                     | `src/Core/Entities/ShipEntity.m:7680-7698`              | divergence: only pods, plates and wrecks are pushed, each velocity component clamped at the sanitiser bound; ships and the player are never pushed (OC-4). PROJECT.md: "The explosion's blast pushes debris only"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | E-81    |
| The blast's amount and range: `0.125 x mass` within `2.5 x collision radius` (WORLD-17)                                                                                                                                                                                                                                                                                                                                                            | `src/sim/world/debris.ts:607`                     | `src/Core/Entities/ShipEntity.m:8123-8126`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-82    |
| A random solid point of a hull octree: one octant draw per level, the first full octant from it, the octant's offset added (WORLD-17)                                                                                                                                                                                                                                                                                                              | `src/sim/combat/octree.ts:469`                    | `src/Core/Octree.m:695-714`                             | divergence: the octant draws come from a fixed budget of 7 taken before the walk, so the draw count does not depend on the hull's depth. PROJECT.md: "Destroyed ships explode into Oolite's debris on their own combat stream, in one fixed order"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | E-83    |
| Explosion cloud particle count: the plist's count, capped at 10 at a detail level up to shaders (WORLD-17)                                                                                                                                                                                                                                                                                                                                         | `src/render/bodies/explosions.ts:112`             | `src/Core/Entities/OOExplosionCloudEntity.m:60-73`      | divergence: always 10 particles; no burn-out cloud and no fragment sprites. PROJECT.md: "Explosions and debris live only in the render layer"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | E-84    |
| Explosion flash: white, 0.4 s, alpha 0.5, growth at least 600 per second (WORLD-17)                                                                                                                                                                                                                                                                                                                                                                | `src/render/bodies/explosions.ts:115`             | `src/Core/Entities/OOFlashEffectEntity.m:55-60`         | divergence: the flash does not move with the dead ship's velocity and has no distance attenuation, because the event carries no velocity. PROJECT.md: "Explosions and debris live only in the render layer"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | E-85    |
| Debris tumble: `performTumble` sets roll and pitch to uniform draws within the maximum rates (WORLD-17)                                                                                                                                                                                                                                                                                                                                            | `src/render/bodies/debris.ts:154`                 | `src/Core/Entities/ShipEntityAI.m:473-479`              | divergence: the tumble is a render rule built from the piece's orientation and the flight time, never a sim draw or the entity id (OC-2). PROJECT.md: "Explosions and debris live only in the render layer"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | E-86    |
| Escort release when the leader dies: `escortCheckMother` drops a leader that no longer accepts escorts (polled every 2.5, 7.5 or 15 s by `escortAI.plist`)                                                                                                                                                                                                                                                                                         | `src/sim/npc/behaviours/formation.ts:53`          | `src/Core/Entities/ShipEntityAI.m:1591-1605`            | divergence: not ported; no populator, traffic or hook path gives a ship an escort owner, so the formation reader never sees a dead leader; D16-25 stands and the port comes with the first phase that spawns escorts. PROJECT.md: "Phase 15 carry-overs closed in Phase 16"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | E-87    |
| A dying leader refuses escorts: `acceptAsEscort` returns NO once `becomeExplosion` has set STATUS_DEAD (`ShipEntity.m:7924`)                                                                                                                                                                                                                                                                                                                       | `src/sim/npc/behaviours/formation.ts:53`          | `src/Core/Entities/ShipEntity.m:11926-11934`            | divergence: not ported with the release; with no escort spawned, no follower asks a dead leader, so D16-25 stands. PROJECT.md: "Phase 15 carry-overs closed in Phase 16"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-88    |
| Forward-view frustum: Oolite's default `fov-value` 57.2° spans the window width when it is at least 4:3 wide; a narrower window keeps the 4:3 vertical angle; the title view uses the GUI ratio 0.5 inside a 4:3 box; only the angular extent is ported, and the near plane's `distanceFactor` cancels out of the ratio (WORLD-02)                                                                                                                 | `src/render/viewport.ts:101`                      | `src/Core/Universe.m:4445-4452`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-90    |
| Scanner forward-view lines: the flight view's horizontal half-angle tangent, times 0.75 × width/height when the window is narrower than 4:3 (FLGT-05)                                                                                                                                                                                                                                                                                              | `src/render/hud/draw.ts:484`                      | `src/Core/HeadUpDisplay.m:4002-4006`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-91    |
| HUD message rows: a new message scrolls the area up one row and takes the bottom row with its own duration; all ten rows are kept and drawn (FLGT-05)                                                                                                                                                                                                                                                                                              | `src/render/hud/messages.ts:170`                  | `src/Core/GuiDisplayGen.m:751-766`                      | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-92    |
| HUD message row countdown: each row counts its own duration down on every frame, docked screens included, blanks at zero without moving the other rows, and fades over its last second (FLGT-05)                                                                                                                                                                                                                                                   | `src/render/hud/messages.ts:150`                  | `src/Core/GuiDisplayGen.m:1327-1336`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-93    |
| HUD message repeat rule: a message equal to the last shown one is dropped within 6 s of it, unless the last message was cleared, as every hyperspace refusal does first (FLGT-05)                                                                                                                                                                                                                                                                  | `src/render/hud/messages.ts:169`                  | `src/Core/Universe.m:6340-6355`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-94    |
| J refused under mass lock: the jump-mass-locked reply is posted at once for 1.5 s (FLGT-04)                                                                                                                                                                                                                                                                                                                                                        | `src/app/session/event-router.ts:357`             | `src/Core/Entities/PlayerEntityControls.m:1166-1175`    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-95    |
| HUD condition light from the alert flags in space, while launching and in flight: no flag is green, any flag yellow, a flag above 0x03f (anything but mass lock) red; green only while docked, where the flight HUD is hidden; the launch pre-roll draws the launch start state, yellow (quick 261118-spu) (FLGT-05)                                                                                                                               | `src/sim/combat/alert.ts:139`                     | `src/Core/Entities/PlayerEntity.m:5122-5138`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-96    |
| Alert flags in space: mass lock; hostiles targeting the player in scanner range; energy below 64 and below 0.8 of maximum; heat level above 0.9; altitude dial below 0.1 (FLGT-05)                                                                                                                                                                                                                                                                 | `src/sim/combat/alert.ts:117`                     | `src/Core/Entities/PlayerEntity.m:2976-2993`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-97    |
| Market Legal column from both legality fields: clear is an em dash, import-legal only is Im, export-legal only is Ex, neither is Re (ECON-04)                                                                                                                                                                                                                                                                                                      | `src/ui/station-model.ts:105`                     | `src/Core/Entities/PlayerEntity.m:9675-9690`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-98    |
| Market cash-and-load line under the table: "Cash: [credits]. Load [currentCargo] of [cargoCapacity] t.", the load in pods used of the capacity left after the berths (ECON-04)                                                                                                                                                                                                                                                                     | `src/ui/station-model.ts:459`                     | `src/Core/Entities/PlayerEntity.m:9979-9986`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-99    |
| Market sort: Oolite's name, price, market-quantity, hold-quantity and mass-unit comparators, ascending; ties keep the catalogue order in both directions (Wegolite's choice); no legality sorter (ECON-04)                                                                                                                                                                                                                                         | `src/ui/station-model.ts:215`                     | `src/Core/Entities/PlayerEntity.m:9612-9628`            | divergence: a click on a column heading sorts ascending, a second click descending and a third restores the default order, where Oolite cycles the sorters with one key and only ascending. The tie order (the catalogue order in both directions) is Wegolite's choice, not Oolite's rule: Oolite's `sortedArrayUsingFunction:` calls (`PlayerEntity.m:9616-9624`) leave the order of equal keys to the Foundation implementation. PROJECT.md: "Sort the F8 market by clicking a column header"                                                                                                                                                                                                                                                                                                                                                                           | E-100   |
| Manifest header: "Cargo [current] t ([max] t)" with the pods used of the capacity, and "Passenger Cabins [current] / [max]" with the passengers aboard (always 0) of the berths (ECON-06)                                                                                                                                                                                                                                                          | `src/ui/station-model.ts:626`                     | `src/Core/Entities/PlayerEntityContracts.m:1058-1066`   | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-101   |
| Manifest goods: one "[quantity] [units] × [commodityName]" line per good carried, in market order, or "No cargo carried."; Wegolite draws one column where Oolite fills two (ECON-06)                                                                                                                                                                                                                                                              | `src/ui/station-model.ts:603`                     | `src/Core/Entities/PlayerEntityContracts.m:1068-1083`   | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-102   |
| Galactic chart title: "Galactic Chart N" with the galaxy index plus 1 (NAV-01)                                                                                                                                                                                                                                                                                                                                                                     | `src/ui/chart-model.ts:170`                       | `src/Core/GuiDisplayGen.m:1541-1541`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-103   |
| Chart marker size: Oolite's blob diameter max(0.5, (1 + 0.0017 x planet radius) / zoom) GUI units, mapped through Oolite's 480-unit GUI over 64 x zoom chart-x units with zoom = spanX / 64, so the diameter in chart-x units is max(0.5 x zoom, 1 + 0.0017 x radius) x 64 / 480, times the projection scale (NAV-01)                                                                                                                              | `src/ui/chart-model.ts:199`                       | `src/Core/GuiDisplayGen.m:1788-1792`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-104   |
| Chart marker colour: each blob is filled with its system's sun colour, Oolite's default SUNCOLOR mode (NAV-01)                                                                                                                                                                                                                                                                                                                                     | `src/ui/chart-model.ts:220`                       | `src/Core/GuiDisplayGen.m:1846-1860`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-105   |
| Planet search match: every system whose lower-cased name starts with the lower-cased text is marked, and the first in system-index order is chosen (NAV-02)                                                                                                                                                                                                                                                                                        | `src/ui/chart-model.ts:237`                       | `src/Core/Universe.m:7745-7764`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-106   |
| Find planet input: typing searches and selects the first match, which moves the chart to it (NAV-02)                                                                                                                                                                                                                                                                                                                                               | `src/app/session/chart-controller.ts:199`         | `src/Core/Entities/PlayerEntityControls.m:1836-1855`    | divergence: a text box focused with / takes the text, Down and Up step through the matches, Enter commits the selection as the target, and a text with no match keeps the text and says No match where Oolite clears it. PROJECT.md: "Find planet on the galactic chart through a text box"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | E-107   |
| Outfitting list: F3 lists an item only when the station offers it, the tech level allows it and it can be added now (pylons, cargo space, fuel, already fitted, something to remove); an item the commander cannot afford is still listed (equipmentAllowed, ECON-05)                                                                                                                                                                              | `src/sim/player/outfitting.ts:192`                | `src/Core/Entities/PlayerEntity.m:8293-8302`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-108   |
| HUD hyperspace countdown: Oolite's text written into the bottom message row without scrolling, only when it changed and its 1 s repeat time has passed, with a 1 s row time (FLGT-05)                                                                                                                                                                                                                                                              | `src/render/hud/messages.ts:175`                  | `src/Core/Universe.m:6258-6267`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-109   |
| HUD scale and anchor: hud.plist's 480-unit height scaled to the window height at 16:9 and wider, x from the centre, y from the bottom edge (FLGT-05)                                                                                                                                                                                                                                                                                               | `src/render/hud/draw.ts:213`                      | `src/Core/HeadUpDisplay.m:1075-1078`                    | divergence: the HUD block except the crosshair, the ident frame and the clock rests on the document disclaimer's top edge (about 62 px above the window bottom at 1280x720) instead of the window bottom; the clock and its hyperspace line stay at the top left, not under the scanner (owner decision 2026-11-18). PROJECT.md: "Rest the flight HUD on the document disclaimer"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | E-110   |
| Compass blip: the 3D direction to the target in the ship frame, normalised, x and y times 0.4 of the compass size (FLGT-05)                                                                                                                                                                                                                                                                                                                        | `src/render/hud/projection.ts:161`                | `src/Core/HeadUpDisplay.m:1500-1507`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-111   |
| Compass modes need the Advanced Space Compass: without EQ_ADVANCED_COMPASS the compass stays basic (station inside either aegis, else planet), the cycle and target-station keys do nothing and a non-basic mode falls back to basic, as `PlayerEntity.m:10258-10260` does (FLGT-05)                                                                                                                                                               | `src/sim/flight/step.ts:213`                      | `src/Core/Entities/PlayerEntityControls.m:3629-3637`    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-115   |
| Scanner buoy colour alternates friendly and neutral on a 0.25 s flash (FLGT-05)                                                                                                                                                                                                                                                                                                                                                                    | `src/render/hud/draw.ts:421`                      | `src/Core/Entities/ShipEntity.m:5667-5671`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-112   |
| Launch presentation: a 1.5 s pre-roll in the dock slot with the sim docked, then the cockpit view flies out of the slot; no break pattern (FLGT-01)                                                                                                                                                                                                                                                                                                | `src/render/launch-camera.ts:306`                 | `src/Core/Universe.m:2895-2913`                         | divergence: Oolite has no pre-roll; it draws ten slot-shaped rings while launching and hides the world only while more than five of them are alive (`Universe.m:3516-3520`); Wegolite plays a 1.5 s presentation pre-roll from the inner end of the slot while the sim stays docked (no game time passes), then draws the live cockpit view along one path out through the mouth to the cockpit pose, with the sim launch unchanged. Since quick 261118-spu the flight HUD is drawn through the pre-roll and the launch, the pre-roll HUD reading the launch start values. PROJECT.md: "Launch shows the live cockpit view from inside the dock slot instead of Oolite's break pattern"                                                                                                                                                                                    | E-113   |
| Flight HUD drawn while launching and in the launch pre-roll; only dead, the escape sequence and game start skip it (FLGT-05, quick 261118-spu)                                                                                                                                                                                                                                                                                                     | `src/app/session/render-driver.ts:368`            | `src/Core/Universe.m:4718-4733`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-116   |
| Compass ring and ticks drawn, target blip hidden while launching; Wegolite draws no ASC target line, so there is nothing else to hide (FLGT-05, quick 261118-spu)                                                                                                                                                                                                                                                                                  | `src/render/hud/draw.ts:595`                      | `src/Core/HeadUpDisplay.m:1480-1494`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-117   |
| Compass leaves a destroyed witchpoint beacon: with the witchpoint mode selected and the witchpoint buoy destroyed, the mode and the target become the planet on the first stepped tick that sees the destruction, for the life of the world (CBT-17, D-05)                                                                                                                                                                                         | `src/sim/flight/step.ts:454`                      | `src/Core/Entities/PlayerEntity.m:4655-4659`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-125   |
| Compass cycle model: Wegolite cycles auto -> planet -> station -> witchpoint -> auto, Oolite PLANET -> STATION/SUN -> TARGET -> BEACONS -> PLANET (`PlayerEntity.m:4761-4808`); a destroyed witchpoint beacon is skipped, station -> auto (CBT-17, D-05)                                                                                                                                                                                           | `src/sim/world/aegis.ts:75`                       | `src/Core/Entities/PlayerEntity.m:4789-4807`            | divergence: Wegolite has no sun, target or beacon-list compass mode and keeps its own order. Oolite's cycle walks only the beacons left in the universe (a destroyed one is cleared from the list, `Universe.m:3446-3463`, `9615-9619`); D-05's destroyed-beacon effect is ported into Wegolite's model as the skip of the destroyed witchpoint. The nav buoy has no compass mode, so its destruction changes only the scanner and the view. PROJECT.md: "Keep Wegolite's compass cycle and skip a destroyed witchpoint beacon (Phase 18, D-05, A7)"                                                                                                                                                                                                                                                                                                                       | E-126   |
| A destroyed, moved or stripped buoy lasts only as long as its world: every new world (each launch, hyperspace arrival and Load) restores both buoys at 250 energy, unmoved and with whole subentities, and a save never carries buoy state (CBT-17, D-04)                                                                                                                                                                                          | `src/app/session/world-lifecycle.ts:149`          | `src/Core/Universe.m:1088-1091`                         | divergence: Oolite rebuilds the universe at launch only when the station is in witchspace (`setUpUniverseFromStation`); in a system a dock and relaunch keep every entity, so a destroyed buoy stays destroyed for the whole visit, where Wegolite builds a new world on every launch. This is the world-lifecycle divergence the NPC ships share. PROJECT.md: "World lifecycle and epoch bump points: no world while docked"                                                                                                                                                                                                                                                                                                                                                                                                                                              | E-127   |
| Buoys as the player sees them: the scene, the scanner and the witchpoint compass read each buoy's live position (layout position plus offset), a destroyed buoy is neither drawn nor plotted from the next frame, and a detached subentity's mesh is hidden (CBT-17, D-05, PD-01, PD-02)                                                                                                                                                           | `src/app/session/render-driver.ts:268`            | `src/Core/HeadUpDisplay.m:1112-1120`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-128   |
| Roll bar at zero while launching (FLGT-05, quick 261118-spu)                                                                                                                                                                                                                                                                                                                                                                                       | `src/app/hud-model.ts:321`                        | `src/Core/Entities/PlayerEntity.m:6469-6470`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-08    |
| Launch orientation: rolled 90 degrees about the launch axis when the dock port and the ship lie differently (FLGT-01)                                                                                                                                                                                                                                                                                                                              | `src/sim/flight/launch.ts:83`                     | `src/Core/Entities/DockEntity.m:819-827`                | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-114   |
| Collision response between the player, NPC ships, pods and plates: after octree contact, Oolite's `collideWithShip` with `v2b` along the line of centres, nothing when the pair separates faster than 1 m/s, the 1 m step and the 1 m/s anti-conjoin solution, and damage `m_other x v2b^2 / 50,000,000` on each side above the 0.05 floor, the player's through the shield on the other's side and then energy, without cabin heat (CBT-18, D-01) | `src/sim/combat/collide.ts:755`                   | `src/Core/Entities/ShipEntity.m:11072-11091`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-129   |
| Collision order: the player first, then every other collider by its distance from the player, nearest first, after Oolite's update order over `sortedEntities` (CBT-18)                                                                                                                                                                                                                                                                            | `src/sim/combat/collide.ts:283`                   | `src/Core/Universe.m:6557-6567`                         | divergence: Wegolite sorts the colliders exactly by the squared distance from the player's position at the stage, ties by ascending id and a non-finite distance last, where Oolite keeps `sortedEntities` sorted incrementally, one bubble step per update, so its order can lag the true distances. PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-130   |
| Each body runs its own collision list: a call that collides removes self from the other's list, so a contact resolves once; a call that returns early because the pair separates faster than 1 m/s leaves it, and the other calls in its own turn (CBT-18)                                                                                                                                                                                         | `src/sim/combat/collide.ts:323`                   | `src/Core/Entities/ShipEntity.m:11149-11150`            | divergence: each list runs in the other's rank order, where Oolite's runs in the order the collision region found the contacts (`CollisionRegion.m:345-351`); and the stage runs once after every body has moved, not between the bodies' own updates, so the other side's call sees the same relative velocity as the first call and also returns early. The 1 m/s push that plan 18-20 measured in Oolite, where the buoy's own call in the same frame found zero relative speed after the player's call had returned early (`ShipEntity.m:11080, 11096-11099`), therefore does not occur. So too for plan 18-18's buoy rams: at 1/120 s the nudge leaves the player outside the buoy, and its call collides and leaves the buoy's list. PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                              | E-131   |
| Destroyed flags of a collision: `dam1 > energy` and `dam2 > other energy` decide the inelastic reversal and skip the nudge (CBT-18)                                                                                                                                                                                                                                                                                                                | `src/sim/combat/collide.ts:620`                   | `src/Core/Entities/ShipEntity.m:11111-11112`            | divergence: the flags read each body's energy as it stood before this tick's ledger, because collision damage is queued and applied after the laser records; Oolite reads the energy after any earlier damage of the same frame, so when a body has two contacts, or a contact and a laser hit, in one tick the reversal and nudge decision can differ from the ledger's lethality. Deterministic. PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                                      | E-132   |
| A drifting player meets the station's dock face (CBT-18, D-02)                                                                                                                                                                                                                                                                                                                                                                                     | `src/sim/dock/step.ts:136`                        | `src/Core/Entities/StationEntity.m:1159-1163`           | divergence: the drift's inward part is reflected with restitution 0.5 by plan 18-10's own contact rule (`BOUNCE_RESTITUTION`), where Oolite runs `collideWithShip` with the station's mass (`ShipEntity.m:11089`) and the station's `adjustVelocity:` override keeps it still. The station is not a collider, so its hull stays damage-free (DOCK-09). PROJECT.md: "Drift beside the engine speed (Phase 18, D-02)"                                                                                                                                                                                                                                                                                                                                                                                                                                                        | E-133   |
| The collision nudge: unless a side was destroyed, self moves by `loc x t x v1a` and the other by `loc x t x v2b` (CBT-18)                                                                                                                                                                                                                                                                                                                          | `src/sim/combat/response.ts:315`                  | `src/Core/Entities/ShipEntity.m:11137-11147`            | divergence: `t` is the fixed `10 x DT` with `DT = 1/120`, where Oolite's is `10 x [UNIVERSE getTimeDelta]`, which depends on the frame time (plan 18-20 measured 0.16 s frames carrying the buoy 129 m), so the nudge is equal at 30, 60 and 144 Hz. PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | E-134   |
| The octree contact test's prime: the lower-ranked body of each pair is `doOctreesCollide`'s prime (CBT-18)                                                                                                                                                                                                                                                                                                                                         | `src/sim/combat/collide.ts:706`                   | `src/Core/CollisionRegion.m:341-343`                    | divergence: Oolite's prime is `e1` of the collision-chain sweep, independent of the update order. The prime decides which side's subentities are routed (`ShipEntity.m:1899-1918`), and Oolite may process a subentity contact a second time from the other side when the first response leaves less than 1 m/s of separation (`ShipEntity.m:11150`). PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                                                                                   | E-135   |
| A rammed pod or plate takes damage and is destroyed at 0 (PD-05, CBT-18)                                                                                                                                                                                                                                                                                                                                                                           | `src/sim/combat/collide.ts:479`                   | `src/Core/Entities/ShipEntity.m:11035-11042`            | divergence: scooping is out of phase, so the `canScoop` branch is not ported: a pod the player or a ship rams takes collision damage (above 15.3 m/s against the player it dies) where Oolite would scoop it into a ship fitted with fuel scoops. PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | E-136   |
| The launching player is not a collider (CBT-18, A3)                                                                                                                                                                                                                                                                                                                                                                                                | `src/sim/combat/collide.ts:436`                   | `src/Core/Entities/PlayerEntity.m:2242-2254`            | divergence: Oolite's player `canCollide` is YES while launching (only docking, docked, dead, the escape sequence and game start say NO), and `takeScrapeDamage` then returns early for a launching party after the player's shields were drained; Wegolite skips any pair with the launching player, whose launch path runs inside the station where no NPC launches in this milestone. PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                                                 | E-137   |
| The player's drift braking: the drift is braked every in-flight tick by `dt x thrust x thrust factor`, with the cleanup terms above 2,000 m/s (CBT-18, D-02)                                                                                                                                                                                                                                                                                       | `src/sim/flight/drift.ts:57`                      | `src/Core/Entities/PlayerEntity.m:3387-3405`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-138   |
| A buoy is a collider and a mover: its share of a ram goes to its own velocity and position, and it then brakes by its own thrust (CBT-18, PD-02)                                                                                                                                                                                                                                                                                                   | `src/sim/combat/collide.ts:628`                   | `src/Core/Entities/ShipEntity.m:11102-11109`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-139   |
| A contact on a buoy's frangible subentity: the subentity's mass and energy decide the response, all of `dam2` goes to the subentity and the buoy is pushed (CBT-18, PD-01)                                                                                                                                                                                                                                                                         | `src/sim/combat/collide.ts:731`                   | `src/Core/Entities/ShipEntity.m:11123-11128`            | divergence: the C's nudge of a contacted subentity (`[other setPosition:]` at 11143-11146 with `other` the subentity) moves the subentity inside its parent; Wegolite keeps the subentity at its authored offset and applies only the parent's `adjustVelocity:`. A ram has no 1 % bleed-through on the buoy, as in Oolite (`takeScrapeDamage:` has none, `ShipEntity.m:11639-11673`; the bleed is the laser rule). PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                     | E-140   |
| A buoy whose subentity is detached collides with the hull's mass, 691,044.375 (CBT-18, PD-01)                                                                                                                                                                                                                                                                                                                                                      | `src/sim/combat/collide.ts:458`                   | `src/Core/Entities/ShipEntity.m:8185-8193`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-123   |
| The player is never `destroyable` in a collision before Phase 20 (CBT-18, D-13)                                                                                                                                                                                                                                                                                                                                                                    | `src/sim/combat/collide.ts:239`                   | `src/Core/Entities/ShipEntity.m:11111-11112`            | divergence: interim until Phase 20 gives the player a death: `selfDestroyed` and `otherDestroyed` never hold for the player, so a lethal ram on the player takes no inelastic reversal and keeps the nudge, and the ledger floors its energy at 0. The tripwire `tests/guards/collision-player-death.test.ts` and the todo `2026-11-19-collision-reversal-on-player-death` hold the fix. PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                                                | E-132   |
| A ram's velocity change at any closing speed, buoys included (CBT-18)                                                                                                                                                                                                                                                                                                                                                                              | `src/sim/combat/collide.ts:642`                   | `src/Core/Entities/ShipEntity.m:11173-11176`            | divergence: buoys do not mass-lock (D-08), so a ram at torus speed is possible, where Oolite's `v1a` can exceed 1e4 m/s; Wegolite holds each velocity component at `MAX_ENTITY_VELOCITY` (1e4 m/s) and each buoy offset component at `MAX_BUOY_OFFSET` (1e6 m) at the write. Deterministic. PROJECT.md: "Collisions follow Oolite's collideWithShip, octree against octree (Phase 18, CBT-18)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | E-141   |

## Excerpts

### E-01 src/Core/OOCommodities.m:261-278

```objc
    foreachkey(commodity, _commodityLists)
    {
        good = [_commodityLists oo_dictionaryForKey:commodity];
        OOCargoQuantity q = [self generateQuantityForGood:good inEconomy:economy];
        // main system market limited to 127 units of each item
        OOCargoQuantity cap = [good oo_unsignedIntForKey:kOOCommodityCapacity defaultValue:MAIN_SYSTEM_MARKET_LIMIT];
        if (q > cap) {
            q = cap;
        }
        OOCreditsQuantity p = [self generatePriceForGood:good inEconomy:economy];
        good = [self createDefinitionFrom:good price:p andQuantity:q forKey:commodity atStation:nil inSystem:[UNIVERSE currentSystemID]];

        if (script != nil) {
            good = [self modifyGood:good withScript:script atStation:nil inSystem:[UNIVERSE currentSystemID] localMode:YES];
        }
        [market setGood:commodity withInfo:good];
    }
    return [market autorelease];
```

### E-02 src/Core/legacy_random.h:154-160

```objc
OOINLINE double distanceBetweenPlanetPositions(int x1, int y1, int x2, int y2)
{
    int dx = x1 - x2;
    int dy = (y1 - y2) / 2;
    int dist = sqrt(dx * dx + dy * dy); // N.b. Rounding error due to truncation is desired.
    return 0.4 * dist;
}
```

### E-03 src/Core/Entities/PlayerEntity.m:6913-6928

```objc
- (void)leaveWitchspace
{
    double d1 = SCANNER_MAX_RANGE * ((Ranrot() & 255) / 256.0 - 0.5);
    HPVector pos = [UNIVERSE getWitchspaceExitPosition]; // no need to reset the PRNG
    Quaternion q1;
    HPVector whpos, exitpos;

    double min_d1 = [UNIVERSE safeWitchspaceExitDistance];
    quaternion_set_random(&q1);
    if (abs((int)d1) < min_d1) {
        d1 += ((d1 > 0.0) ? min_d1 : -min_d1); // not too close to the buoy.
    }
    HPVector v1 = HPvector_forward_from_quaternion(q1);
    exitpos = HPvector_add(pos, HPvector_multiply_scalar(v1, d1)); // randomise exit position
    position = exitpos;
    [self setOrientation:[UNIVERSE getWitchspaceExitRotation]];
```

### E-04 src/Core/Entities/PlayerEntityControls.m:3726-3728

```objc
    double roll_dampner = ROLL_DAMPING_FACTOR * delta_t;
    double pitch_dampner = PITCH_DAMPING_FACTOR * delta_t;
    double yaw_dampner = YAW_DAMPING_FACTOR * delta_t;
```

### E-05 src/Core/Entities/PlayerEntity.m:2745-2748

```objc
        if (flightSpeed < maxFlightSpeed * HYPERSPEED_FACTOR)
            flightSpeed += (float)(speed_delta * delta_t * HYPERSPEED_FACTOR);
        if (flightSpeed > maxFlightSpeed * HYPERSPEED_FACTOR)
            flightSpeed = (float)(maxFlightSpeed * HYPERSPEED_FACTOR);
```

### E-06 src/Core/Entities/PlayerEntity.m:2958-2967

```objc
        hyperspeedFactor = MIN_HYPERSPEED_FACTOR;
    } else {
        // once nearest object is >4x scanner range
        // start increasing torus speed
        double factor = hsnDistance / (4 * SCANNER_MAX_RANGE);
        if (factor < 1.0) {
            hyperspeedFactor = MIN_HYPERSPEED_FACTOR;
        } else {
            hyperspeedFactor = MIN_HYPERSPEED_FACTOR * sqrt(factor);
            if (hyperspeedFactor > MAX_HYPERSPEED_FACTOR) {
```

### E-07 src/Core/Entities/PlayerEntity.m:3019-3024

```objc
    if (EXPECT_NOT([ent isStellarObject])) {
        Entity<OOStellarBody>* stellar = (Entity<OOStellarBody>*)ent;
        if (EXPECT([stellar planetType] != STELLAR_TYPE_MINIATURE)) {
            double dist = stellar->zero_distance;
            double rad = stellar->collision_radius;
            double factor = ([stellar isSun]) ? 2.0 : 4.0;
```

### E-08 src/Core/Entities/PlayerEntity.m:6469-6470

```objc
    launchRoll = -flightRoll; // save the station's spin. (inverted for player)
    flightRoll = 0; // don't spin when showing the break pattern.
```

### E-09 src/Core/Entities/ShipEntity.m:6699-6702

```objc
    if (sd2 < SCANNER_MAX_RANGE2 * 4.0f) // double scanner range
    {
        result = AEGIS_IN_DOCKING_RANGE;
    } else if (EXPECT_NOT(isNearPlanetSurface || d2 < cr2 * 9.0f)) // to 3x radius of any planet/moon - or 500m of tiny ones,
```

### E-10 src/Core/Universe.m:1473-1473

```objc
    safeDistance = 36 * sun_radius * sun_radius; // 6 times the sun radius
```

### E-11 src/Core/Entities/DockEntity.m:748-755

```objc
            if (arbb.max.x < ww && arbb.min.x > -ww) {
                // x is okay - no need to correct
                delta.x = 0.0f;
            }
            if (arbb.max.y > hh && arbb.min.y > -hh) {
                // y is okay - no need to correct
                delta.y = 0.0f;
            }
```

### E-12 src/Core/Entities/DockEntity.m:716-720

```objc
    }

    if ([ship status] == STATUS_LAUNCHING) {
        return YES;
    }
```

### E-13 src/Core/Entities/PlayerEntity.m:8293-8295

```objc
            if (isOK) {
                if (techlevel < minTechLevel)
                    isOK = NO;
```

### E-14 src/Core/Entities/PlayerEntity.h:1294-1297

```objc
#define KILOGRAMS_PER_POD 1000
#define MAX_KILOGRAMS_IN_SAFE ((KILOGRAMS_PER_POD / 2) - 1)
#define GRAMS_PER_POD (KILOGRAMS_PER_POD * 1000)
#define MAX_GRAMS_IN_SAFE ((GRAMS_PER_POD / 2) - 1)
```

### E-15 src/Core/Entities/PlayerEntity.m:10029-10040

```objc
    // TODO - fix brokenness here...
    if (unit == UNITS_TONS && purchase + current_cargo > [self maxAvailableCargoSpace]) {
        purchase = [self availableCargoSpace]; // limit to available cargo space
    } else {
        if (current_cargo == [self maxAvailableCargoSpace]) {
            // other cases are fine so long as buying is limited to <1000kg / <1000000g
            // but if this case is true, we need to see if there is more space in
            // the manifest (safe) or an already-accounted-for pod
            if (unit == UNITS_KILOGRAMS) {
                if (manifest_quantity % KILOGRAMS_PER_POD <= MAX_KILOGRAMS_IN_SAFE && (manifest_quantity + purchase) % KILOGRAMS_PER_POD > MAX_KILOGRAMS_IN_SAFE) {
                    // going from < n500 to >= n500 would increase pods needed by 1
                    purchase = MAX_KILOGRAMS_IN_SAFE - manifest_quantity; // max possible
```

### E-16 src/Core/Universe.m:7173-7191

```objc
- (void)setSystemTo:(OOSystemID)s
{
    NSDictionary* systemData;
    PlayerEntity* player = PLAYER;
    OOEconomyID economy;
    NSString* scriptName;

    [self setGalaxyTo:[player galaxyNumber]];

    systemID = s;
    targetSystemID = s;

    systemData = [self generateSystemData:targetSystemID];
    economy = [systemData oo_unsignedCharForKey:KEY_ECONOMY];
    scriptName = [systemData oo_stringForKey:@"market_script" defaultValue:nil];

    DESTROY(commodityMarket);
    commodityMarket = [[commodities generateMarketForSystemWithEconomy:economy andScript:scriptName] retain];
}
```

### E-17 src/Core/Entities/PlayerEntity.m:9326-9330

```objc
    if ([eqKey isEqualToString:@"EQ_MISSILE_REMOVAL"]) {
        credits -= price;
        tradeIn += [self removeMissiles];
        [self doTradeIn:tradeIn forPriceFactor:priceFactor];
        return YES;
```

### E-18 src/Core/Entities/PlayerEntity.h:284-286

```objc
#define PLAYER_MAX_MISSILES 16
#define PLAYER_STARTING_MAX_MISSILES 4
#define PLAYER_STARTING_MISSILES 3
```

### E-19 src/Core/Entities/PlayerEntity.m:6630-6633

```objc
- (OOFuelQuantity)fuelRequiredForJump
{
    return 10.0 * MAX(0.1, [self hyperspaceJumpDistance]);
}
```

### E-20 src/Core/Entities/PlayerEntity.m:6884-6886

```objc
    if (!misjump) {
        ship_clock_adjust += distance * distance * 3600.0;
        [self setSystemID:sTo];
```

### E-21 src/Core/Entities/PlayerEntity.m:3296-3297

```objc
    if ([self status] == STATUS_WITCHSPACE_COUNTDOWN)
        [self cancelWitchspaceCountdown]; // cancel witchspace countdown properly
```

### E-22 src/Core/Entities/ShipEntity.m:12526-12530

```objc
        GLfloat d2 = HPmagnitude2(delta);
        if (![ship isPlayer] || ![PLAYER isDocked]) { // player doesn't block if docked
            if ((k * [ship mass] > d2) && (d2 < SCANNER_MAX_RANGE2)) // if you go off (typical) scanner from a blocker - it ceases to block
                result = [ship universalID];
        }
```

### E-23 src/Core/Entities/ShipEntity.m:12504-12504

```objc
    // coriolis station is mass 455,223,200
```

### E-24 src/Core/GuiDisplayGen.m:1575-1575

```objc
    double vscale = -size_in_pixels.height / (2 * CHART_HEIGHT_AT_MAX_ZOOM * zoom);
```

### E-25 src/Core/GuiDisplayGen.m:1947-1948

```objc
        star.x = (float)(sys_coordinates.x * hscale + hoffset);
        star.y = (float)(sys_coordinates.y * vscale + voffset);
```

### E-26 src/Core/Materials/OOPlanetTextureGenerator.m:666-679

```objc
    } else if (q < COASTLINE_PORTION) {
        // Coastline.
        specular = q * RECIP_COASTLINE_PORTION;
        diffuse = Blend(specular, info->landColor, info->paleSeaColor);
        specular = 1.0f - specular;
    } else if (q > 1.0f) {
        // High up - snow-capped peaks. With overrides q can range between -2 to +2.
        diffuse = white;
    } else if (q > info->mix_hi) {
        diffuse = Blend((q - info->mix_hi) * info->mix_ih, white, info->paleLandColor); // Snowline.
    } else {
        // Normal land.
        diffuse = Blend((info->mix_hi - q) * info->mix_oh, info->landColor, info->paleLandColor);
    }
```

### E-27 src/Core/Entities/ShipEntity.m:417-419

```objc
    float density = [shipDict oo_floatForKey:@"density" defaultValue:1.0f];
    if (octree)
        mass = (GLfloat)(density * 20.0f * [octree volume]);
```

### E-28 src/Core/Entities/ShipEntity.m:2034-2041

```objc
    if ([subent isKindOfClass:[ShipEntity class]]) // Solid subentity
    {
        if (distance > collision_radius) {
            collision_radius = distance;
        }

        mass += [subent mass];
    }
```

### E-29 src/Core/OOMesh.m:609-619

```objc
    size = (xs + ys) / 2.0f; // Use average of two largest

    if (size < kOctreeSmallSizeThreshold)
        result = kSmallOctreeDepth;
    else
        while (result < kMaxOctreeDepth) {
            if (size < threshold)
                break;
            threshold *= 2.0f;
            result++;
        }
```

### E-30 src/Core/Octree.m:672-680

```objc
     calculation to five levels. Raising the limit means lower calculated
     volumes for large ships.

     EMMSTRAN: consider raising the limit but fudging mass lock calculations
     to compensate. See http://aegidian.org/bb/viewtopic.php?f=3&t=9176 .
     Then again, five levels of iteration might be fine.
     -- Ahruman 2011-03-10
     */
    return volumeOfOctree([self octreeDetails], 5);
```

### E-31 src/Core/Entities/PlayerEntity.m:3044-3061

```objc
            break;
        case CLASS_PLAYER:
        case CLASS_BUOY:
        case CLASS_ROCK:
        case CLASS_CARGO:
        case CLASS_MINE:
        case CLASS_VISUAL_EFFECT:
            break;

        case CLASS_THARGOID:
        case CLASS_MISSILE:
        case CLASS_STATION:
        case CLASS_POLICE:
        case CLASS_MILITARY:
        case CLASS_WORMHOLE:
        default:
            massLocked = YES;
            break;
```

### E-32 src/Core/Entities/PlayerEntity.m:2918-2934

```objc
#if OO_VARIABLE_TORUS_SPEED
        if (EXPECT_NOT(needHyperspeedNearest)) {
            // not visual effects, waypoints, ships, etc.
            if (scannedEntity != self && [scannedEntity canCollide] && (![scannedEntity isShip] || ![self collisionExceptedFor:(ShipEntity*)scannedEntity])) {
                hsnDistance = sqrt(scannedEntity->zero_distance) - [scannedEntity collisionRadius];
                needHyperspeedNearest = NO;
            }
        } else if ([scannedEntity isStellarObject]) {
            // planets, stars might be closest surface even if not
            // closest centre. That could be true of others, but the
            // error is negligible there.
            double thisHSN = sqrt(scannedEntity->zero_distance) - [scannedEntity collisionRadius];
            if (thisHSN < hsnDistance) {
                hsnDistance = thisHSN;
            }
        }
#endif
```

### E-33 src/Core/OOMesh.m:1803-1822

```objc
            result = d_squared;
        bounding_box_add_vector(&boundingBox, _vertices[i]);
    }

    length_longest_axis = boundingBox.max.x - boundingBox.min.x;
    if (boundingBox.max.y - boundingBox.min.y > length_longest_axis)
        length_longest_axis = boundingBox.max.y - boundingBox.min.y;
    if (boundingBox.max.z - boundingBox.min.z > length_longest_axis)
        length_longest_axis = boundingBox.max.z - boundingBox.min.z;

    length_shortest_axis = boundingBox.max.x - boundingBox.min.x;
    if (boundingBox.max.y - boundingBox.min.y < length_shortest_axis)
        length_shortest_axis = boundingBox.max.y - boundingBox.min.y;
    if (boundingBox.max.z - boundingBox.min.z < length_shortest_axis)
        length_shortest_axis = boundingBox.max.z - boundingBox.min.z;

    d_squared = (length_longest_axis + length_shortest_axis) * (length_longest_axis + length_shortest_axis) * 0.25; // square of average length
    maxDrawDistance = d_squared * NO_DRAW_DISTANCE_FACTOR * NO_DRAW_DISTANCE_FACTOR; // no longer based on the collision radius

    collisionRadius = sqrtf(result);
```

### E-34 src/Core/Universe.m:1796-1815

```objc
            double total = l1 + l2 + l3;
            float choice = randf();
            if (choice < l1 / total) {
                return [self locationByCode:@"LANE_WP" withSun:sun andPlanet:planet];
            } else if (choice < (l1 + l2) / total) {
                return [self locationByCode:@"LANE_PS" withSun:sun andPlanet:planet];
            } else {
                return [self locationByCode:@"LANE_WS" withSun:sun andPlanet:planet];
            }
        } else if ([code isEqualToString:@"LANE_WP"]) {
            result = OORandomPositionInCylinder(kZeroHPVector, SCANNER_MAX_RANGE, [planet position], [planet radius] * 3, LANE_WIDTH);
        } else if ([code isEqualToString:@"LANE_WS"]) {
            result = OORandomPositionInCylinder(kZeroHPVector, SCANNER_MAX_RANGE, [sun position], [sun radius] * 3, LANE_WIDTH);
        } else if ([code isEqualToString:@"LANE_PS"]) {
            result = OORandomPositionInCylinder([planet position], [planet radius] * 3, [sun position], [sun radius] * 3, LANE_WIDTH);
        } else if ([code isEqualToString:@"STATION_AEGIS"]) {
            do {
                result = OORandomPositionInShell([[self station] position], [[self station] collisionRadius] * 1.2, SCANNER_MAX_RANGE * 2.0);
            } while (HPdistance2(result, [planet position]) < [planet radius] * [planet radius] * 1.5);
            // loop to make sure not generated too close to the planet's surface
```

### E-35 src/Core/Universe.m:2648-2648

```objc
        [ship setOrientation:OORandomQuaternion()];
```

### E-36 src/Core/Entities/PlayerEntity.m:5460-5464

```objc
    if (weapon_temp / PLAYER_MAX_WEAPON_TEMP >= WEAPON_COOLING_CUTOUT) {
        [self playWeaponOverheated:[[self currentLaserOffset] oo_vectorAtIndex:0]];
        [UNIVERSE addMessage:DESC(@"weapon-overheat") forCount:3.0];
        return NO;
    }
```

### E-37 src/Core/Entities/PlayerEntity.m:5478-5481

```objc
    if (energy <= weapon_energy_use * multiplier) {
        [UNIVERSE addMessage:DESC(@"weapon-out-of-juice") forCount:3.0];
        return NO;
    }
```

### E-38 src/Core/Entities/PlayerEntity.m:5485-5491

```objc
    energy -= weapon_energy_use * multiplier;

    switch (currentWeaponFacing) {
    case WEAPON_FACING_FORWARD:
        forward_weapon_temp += weapon_shot_temperature * multiplier;
        forward_shot_time = 0.0;
        break;
```

### E-39 src/Core/Entities/PlayerEntity.m:2481-2485

```objc
    float coolAmount = WEAPON_COOLING_FACTOR * delta_t;
    forward_weapon_temp = fdim(forward_weapon_temp, coolAmount);
    aft_weapon_temp = fdim(aft_weapon_temp, coolAmount);
    port_weapon_temp = fdim(port_weapon_temp, coolAmount);
    starboard_weapon_temp = fdim(starboard_weapon_temp, coolAmount);
```

### E-40 src/Core/Entities/PlayerEntityControls.m:1185-1185

```objc
                if ((([self checkNavKeyPress:n_key_fire_lasers]) || ((mouse_control_on) && ([gameView isDown:gvMouseLeftButton]) && ([UNIVERSE viewDirection] <= VIEW_STARBOARD || ![gameView isCapsLockOn])) || joyButtonState[BUTTON_FIRE]) && (shot_time > weapon_recharge_rate)) {
```

### E-41 src/Core/Entities/PlayerEntity.m:2581-2597

```objc
    energy += [self energyRechargeRate] * delta_t;

    // 2. Calculate shield recharge rates
    float fwdMax = [self maxForwardShieldLevel];
    float aftMax = [self maxAftShieldLevel];
    float shieldRechargeFwd = [self forwardShieldRechargeRate] * delta_t;
    float shieldRechargeAft = [self aftShieldRechargeRate] * delta_t;
    /* there is potential for negative rechargeFwd and rechargeAFt values here
       (e.g. getting shield boosters damaged while shields are full). This may
       lead to energy being gained rather than consumed when recharging. Leaving
       as-is for now, as there might be OXPs that rely in such behaviour.
       Boosters case example mentioned above is the only known core equipment
       occurrence at this time and it has been fixed inside the
       oolite-equipment-control.js script. - Nikos 20160104.
     */
    float rechargeFwd = MIN(shieldRechargeFwd, fwdMax - forward_shield);
    float rechargeAft = MIN(shieldRechargeAft, aftMax - aft_shield);
```

### E-42 src/Core/Entities/PlayerEntity.m:2603-2616

```objc
    float energyForShields = energy;
    if ((forward_shield > fwdMax * 0.25) && (aft_shield > aftMax * 0.25)) {
        // TODO: Can this be cached anywhere sensibly (without adding another member variable)?
        float minEnergyBankLevel = [[UNIVERSE globalSettings] oo_floatForKey:@"shield_charge_energybank_threshold" defaultValue:0.25];
        energyForShields = MAX(0.0, energy - 0.1 - (maxEnergy * minEnergyBankLevel)); // NB: The - 0.1 ensures the energy value does not 'bounce' across the critical energy message and causes spurious energy-low warnings
    }

    if (forward_shield < aft_shield) {
        rechargeFwd = MIN(rechargeFwd, energyForShields);
        rechargeAft = MIN(rechargeAft, energyForShields - rechargeFwd);
    } else {
        rechargeAft = MIN(rechargeAft, energyForShields);
        rechargeFwd = MIN(rechargeFwd, energyForShields - rechargeAft);
    }
```

### E-43 src/Core/Entities/PlayerEntity.m:2619-2625

```objc
    forward_shield += rechargeFwd;
    aft_shield += rechargeAft;
    energy -= rechargeFwd + rechargeAft;

    forward_shield = OOClamp_0_max_f(forward_shield, fwdMax);
    aft_shield = OOClamp_0_max_f(aft_shield, aftMax);
    energy = OOClamp_0_max_f(energy, maxEnergy);
```

### E-44 src/Core/Entities/PlayerEntity.m:5646-5662

```objc
    if (d_forward >= 0) {
        forward_shield -= amount;
        if (forward_shield < 0.0) {
            amount = -forward_shield;
            forward_shield = 0.0f;
        } else {
            amount = 0.0;
        }
    } else {
        aft_shield -= amount;
        if (aft_shield < 0.0) {
            amount = -aft_shield;
            aft_shield = 0.0f;
        } else {
            amount = 0.0;
        }
    }
```

### E-45 src/Core/Entities/PlayerEntity.m:5666-5677

```objc
    if (amount > 0.0) {
        energy -= amount;
        [self playDirectHit:relative weaponIdentifier:weaponIdentifier];
        if (ship_temperature < SHIP_MAX_CABIN_TEMP) {
            /* Heat increase from energy impacts will never directly cause
             * overheating - too easy for missile hits to cause an uncredited
             * death by overheating against NPCs, so same rules for player */
            ship_temperature += amount * SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR / [self heatInsulation];
            if (ship_temperature > SHIP_MAX_CABIN_TEMP) {
                ship_temperature = SHIP_MAX_CABIN_TEMP;
            }
        }
```

### E-46 src/Core/Entities/PlayerEntity.m:2662-2672

```objc
        float heatInsulation = [self heatInsulation]; // Optimisation, suggested by EricW
        float deltaInsulation = delta_t / heatInsulation;
        float heatThreshold = heatInsulation * 100.0f;
        ship_temperature += (float)(flightSpeed * air_friction * deltaInsulation); // wind_speed

        if (external_temp > heatThreshold && external_temp > ship_temperature)
            ship_temperature += (float)((external_temp - ship_temperature) * SHIP_INSULATION_FACTOR * deltaInsulation);
        else {
            if (ship_temperature > SHIP_MIN_CABIN_TEMP)
                ship_temperature += (float)((external_temp - heatThreshold - ship_temperature) * SHIP_COOLING_FACTOR * deltaInsulation);
        }
```

### E-47 src/Core/Entities/PlayerEntity.m:6321-6325

```objc
    forward_shield = [self maxForwardShieldLevel];
    aft_shield = [self maxAftShieldLevel];
    energy = maxEnergy;
    weapon_temp = 0.0f;
    ship_temperature = 60.0f;
```

### E-48 src/Core/Entities/ShipEntity.m:1337-1354

```objc
    NSEnumerator* subEnum = nil;
    ShipEntity* se = nil;
    for (subEnum = [self shipSubEntityEnumerator]; (se = [subEnum nextObject]);) {
        HPVector p0 = [se absolutePositionForSubentity];
        Triangle ijk = [se absoluteIJKForSubentity];
        u0 = HPVectorToVector(HPvector_between(p0, v0));
        u1 = HPVectorToVector(HPvector_between(p0, v1));
        w0 = resolveVectorInIJK(u0, ijk);
        w1 = resolveVectorInIJK(u1, ijk);

        GLfloat hitSub = [se->octree isHitByLine:w0 v1:w1];
        if (hitSub && (hit_distance == 0 || hit_distance > hitSub)) {
            hit_distance = hitSub;
            if (hitEntity) {
                *hitEntity = se;
            }
        }
    }
```

### E-49 src/Core/Octree.m:361-366

```objc
    if (octbuffer[level] == -1) {
        OctreeDebugLog(@"DEBUG Hit a solid octant: [%d]", level);
        collbuffer[level] = 2; // green
        hit_dist = sqrt(u0.x * u0.x + u0.y * u0.y + u0.z * u0.z);
        return YES;
    }
```

### E-50 src/Core/Octree.m:413-422

```objc
    // first test the intersected octant, then the three adjacent, then the next three adjacent, the finally the diagonal octant
    int oct0, oct1, oct2, oct3; // test oct0 then oct1, oct2, oct3 then (7 - oct1), (7 - oct2), (7 - oct3) then (7 - oct0)
    oct0 = octantIntersected;
    oct1 = oct0 ^ 0x01; // adjacent x
    oct2 = oct0 ^ 0x02; // adjacent y
    oct3 = oct0 ^ 0x04; // adjacent z

    OctreeDebugLog(@"----> testing first octant hit [+%d]", oct0);
    if (isHitByLineSub(octbuffer, collbuffer, nextLevel, rad, rd2, u0, u1, oct0))
        return YES; // first octant
```

### E-51 src/Core/Universe.m:5587-5603

```objc
    switch (direction) {
    case WEAPON_FACING_FORWARD:
    case WEAPON_FACING_NONE:
        break;

    case WEAPON_FACING_AFT:
        quaternion_rotate_about_axis(&q1, u1, M_PI);
        break;

    case WEAPON_FACING_PORT:
        quaternion_rotate_about_axis(&q1, u1, M_PI / 2.0);
        break;

    case WEAPON_FACING_STARBOARD:
        quaternion_rotate_about_axis(&q1, u1, -M_PI / 2.0);
        break;
    }
```

### E-52 src/Core/Universe.m:5689-5707

```objc
    for (i = 0; i < ship_count; i++) {
        Entity* e2 = my_entities[i];
        if ([e2 canCollide] && [e2 scanClass] != CLASS_NO_DRAW) {
            Vector rp = HPVectorToVector(HPvector_subtract([e2 position], p1));
            OOScalar dist2 = magnitude2(rp);
            if (dist2 < nearest2) {
                OOScalar df = dot_product(f1, rp);
                if (df > 0.0 && df * df < nearest2) {
                    OOScalar du = dot_product(u1, rp);
                    OOScalar dr = dot_product(r1, rp);
                    OOScalar cr = [e2 collisionRadius];
                    if (du * du + dr * dr < cr * cr) {
                        hit_entity = e2;
                        nearest2 = dist2;
                    }
                }
            }
        }
    }
```

### E-53 src/Core/Entities/PlayerEntityControls.m:4758-4773

```objc
- (void)handleButtonIdent
{
    // Clear current target if we're already in Ident mode
    if (ident_engaged)
        [self noteLostTarget];

    [self safeAllMissiles];
    ident_engaged = YES;
    if ([self primaryTarget] == nil) {
        [self playIdentOn];
        [UNIVERSE addMessage:OOExpandKey(@"ident-on") forCount:2.0];
    } else {
        [self playIdentLockedOn];
        [self printIdentLockedOnForMissile:NO];
    }
}
```

### E-54 src/Core/Entities/PlayerEntityControls.m:1404-1419

```objc
                if ([self checkKeyPress:n_key_untarget_missile] || joyButtonState[BUTTON_UNARM]) {
                    if (!safety_pressed) {
                        // targeting off in both cases!
                        if ([self primaryTarget] != nil)
                            [self noteLostTarget];
                        DESTROY(_primaryTarget);
                        [self safeAllMissiles];
                        if (!ident_engaged && [self weaponsOnline]) {
                            [UNIVERSE addMessage:DESC(@"missile-safe") forCount:2.0];
                            [self playMissileSafe];
                        } else {
                            [UNIVERSE addMessage:DESC(@"ident-off") forCount:2.0];
                            [self playIdentOff];
                        }
                        ident_engaged = NO;
                    }
```

### E-55 src/Core/Entities/PlayerEntity.m:9210-9217

```objc
        credits -= price;

        // Refund current_weapon
        if (current_weapon != nil) {
            tradeIn = [UNIVERSE getEquipmentPriceForKey:OOEquipmentIdentifierFromWeaponType(current_weapon)] * multiplier;
        }

        [self doTradeIn:tradeIn forPriceFactor:priceFactor];
```

### E-56 src/Core/Entities/ShipEntity.m:2417-2425

```objc
        // manage energy
        if (energy < maxEnergy) {
            energy += energy_recharge_rate * delta_t;
            if (energy > maxEnergy) {
                energy = maxEnergy;
                [self doScriptEvent:OOJSID("shipEnergyBecameFull")];
                [shipAI message:@"ENERGY_FULL"];
            }
        }
```

### E-57 src/Core/Entities/ShipEntity.m:7021-7039

```objc
    double rate1 = 2.0 * delta_t; // roll
    double rate2 = 4.0 * delta_t; // pitch
    double rate3 = 4.0 * delta_t; // yaw

    if (((stick_roll > 0.0) && (flightRoll < 0.0)) || ((stick_roll < 0.0) && (flightRoll > 0.0)))
        rate1 *= 4.0; // much faster correction
    if (((stick_pitch > 0.0) && (flightPitch < 0.0)) || ((stick_pitch < 0.0) && (flightPitch > 0.0)))
        rate2 *= 4.0; // much faster correction
    if (((stick_yaw > 0.0) && (flightYaw < 0.0)) || ((stick_yaw < 0.0) && (flightYaw > 0.0)))
        rate3 *= 4.0; // much faster correction

    if (accuracy >= COMBAT_AI_TRACKS_CLOSER) {
        if (stick_roll == 0.0)
            rate1 *= 2.0; // faster correction
        if (stick_pitch == 0.0)
            rate2 *= 2.0; // faster correction
        if (stick_yaw == 0.0)
            rate3 *= 2.0; // faster correction
    }
```

### E-58 src/Core/Entities/ShipEntity.m:5826-5843

```objc
    if (behaviour == BEHAVIOUR_TUMBLE)
        return;

    // check for speed
    if (desired_speed > max_available_speed)
        desired_speed = max_available_speed;

    if (flightSpeed > desired_speed) {
        [self decrease_flight_speed:dt_thrust];
        if (flightSpeed < desired_speed)
            flightSpeed = desired_speed;
    }
    if (flightSpeed < desired_speed) {
        [self increase_flight_speed:dt_thrust];
        if (flightSpeed > desired_speed)
            flightSpeed = desired_speed;
    }
    [self moveForward:delta_t * flightSpeed];
```

### E-59 src/Core/Entities/ShipEntity.m:5881-5897

```objc
- (void)applyRoll:(GLfloat)roll1 climb:(GLfloat)climb1 andYaw:(GLfloat)yaw1
{
    if ((roll1 == 0.0) && (climb1 == 0.0) && (yaw1 == 0.0) && (!hasRotated))
        return;

    Quaternion q1 = kIdentityQuaternion;

    if (roll1)
        quaternion_rotate_about_z(&q1, -roll1);
    if (climb1)
        quaternion_rotate_about_x(&q1, -climb1);
    if (yaw1)
        quaternion_rotate_about_y(&q1, -yaw1);

    orientation = quaternion_multiply(q1, orientation);
    [self orientationChanged];
}
```

### E-60 src/Core/Entities/ShipEntity.m:9477-9496

```objc
    double range2 = magnitude2(relPos);
    double desired_range2 = desired_range * desired_range;

    /*	2009-7-18 Eric: We need to aim well inide the desired_range sphere round the target and not at the surface of the sphere.
            Because of the framerate most ships normally overshoot the target and they end up flying clearly on a path
            through the sphere. Those ships give no problems, but ships with a very low turnrate will aim close to the surface and will than
            have large trouble with reaching their destination. When those ships enter the slowdown range, they have almost no speed vector
            in the direction of the target. I now used 95% of desired_range to aim at, but a smaller value might even be better.
    */
    if (range2 > desired_range2) {
        max_cos = sqrt(1 - precision * desired_range2 / range2); // Head for a point within 95% of desired_range.
        if (max_cos >= 0.99999) {
            max_cos = 0.99999;
        }
    }

    if (!vector_equal(relPos, kZeroVector))
        relPos = vector_normal(relPos);
    else
        relPos.z = 1.0;
```

### E-61 src/Core/Entities/ShipEntity.m:5049-5065

```objc
- (void)behaviour_fly_to_destination:(double)delta_t
{
    double distance = [self rangeToDestination];
    // double desiredRange = (dockingInstructions != nil) ? 1.2 * desired_range : desired_range; // stop a bit earlyer when docking.
    if (distance < desired_range) // + collision_radius)
    {
        // desired range achieved
        [shipAI message:@"DESIRED_RANGE_ACHIEVED"];
        [self doScriptEvent:OOJSID("shipAchievedDesiredRange")];

        if (!docking_match_rotation) // IDLE stops rotating while docking
        {
            behaviour = BEHAVIOUR_IDLE;
            desired_speed = 0.0;
        }
        frustration = 0.0;
    } else {
```

### E-62 src/Core/Entities/ShipEntity.m:4929-4948

```objc
    double confidenceFactor = [self trackDestination:delta_t retreat:NO];
    if (confidenceFactor >= max_cos && flightPitch == 0.0) {
        // desired facing achieved and movement stabilised.
        [shipAI message:@"FACING_DESTINATION"];
        [self doScriptEvent:OOJSID("shipNowFacingDestination")];
        frustration = 0.0;
        if (docking_match_rotation) // IDLE stops rotating while docking
        {
            behaviour = BEHAVIOUR_FLY_TO_DESTINATION;
        } else {
            behaviour = BEHAVIOUR_IDLE;
        }
    }

    if (flightSpeed == 0)
        frustration += delta_t;
    if (frustration > 15.0 / max_flight_pitch) // allow more time for slow ships.
    {
        frustration = 0.0;
        [self noteFrustration:@"BEHAVIOUR_FACE_DESTINATION"];
```

### E-63 src/Core/Entities/ShipEntity.m:9034-9046

```objc
- (double)trackPrimaryTarget:(double)delta_t retreat:(BOOL)retreat
{
    Entity* target = [self primaryTarget];

    if (!target) // leave now!
    {
        [self noteLostTargetAndGoIdle]; // NOTE: was AI message: rather than reactToMessage:
        return 0.0;
    }

    if (![self canStillTrackPrimaryTarget]) {
        [self noteLostTargetAndGoIdle]; // NOTE: was AI message: rather than reactToMessage:
        return 0.0;
```

### E-64 src/Core/Entities/ShipEntity.m:5425-5442

```objc
- (void)startTrackingCurve
{
    Entity* target = [self primaryTarget];
    if (target == nil) {
        return;
    }
    OOTimeAbsolute now = [UNIVERSE getTime];
    trackingCurvePositions[0] = [target position];
    trackingCurvePositions[1] = [target position];
    trackingCurvePositions[2] = [target position];
    trackingCurvePositions[3] = [target position];
    trackingCurveTimes[0] = now;
    trackingCurveTimes[1] = now - reactionTime / 3.0;
    trackingCurveTimes[2] = now - reactionTime * 2.0 / 3.0;
    trackingCurveTimes[3] = now - reactionTime;
    [self calculateTrackingCurve];
    return;
}
```

### E-65 src/Core/Entities/ShipEntity.m:3817-3826

```objc
- (void)behaviour_intercept_target:(double)delta_t
{
    double range = [self rangeToPrimaryTarget];
    if (behaviour == BEHAVIOUR_INTERCEPT_TARGET) {
        desired_speed = maxFlightSpeed;
        if (range < desired_range) {
            [shipAI reactToMessage:@"DESIRED_RANGE_ACHIEVED" context:@"BEHAVIOUR_INTERCEPT_TARGET"];
            [self doScriptEvent:OOJSID("shipAchievedDesiredRange")];
        }
        desired_speed = maxFlightSpeed * [self trackPrimaryTarget:delta_t retreat:NO];
```

### E-66 src/Core/Entities/ShipEntityAI.m:379-392

```objc
- (void)performFlee
{
    if (behaviour != BEHAVIOUR_FLEE_EVASIVE_ACTION) {
        behaviour = BEHAVIOUR_FLEE_TARGET;
        [self setEvasiveJink:400.0];
        frustration = 0.0;
        if (accuracy > COMBAT_AI_ISNT_AWFUL) {
            // alert! they've got us in their sights! react!!
            if ([self approachAspectToPrimaryTarget] > 0.9995) {
                behaviour = randf() < 0.15 ? BEHAVIOUR_EVASIVE_ACTION : BEHAVIOUR_FLEE_EVASIVE_ACTION;
            }
        }
    }
}
```

### E-67 src/Core/Entities/ShipEntity.m:4156-4170

```objc
            } else if (forward_weapon_ready) {
                jink = kZeroVector; // almost all behaviours

                // TODO: good pilots use behaviour_attack_sniper sometimes
                if (getWeaponRangeFromType(forward_weapon_real_type) > 12500 && range > 12500) {
                    behaviour = BEHAVIOUR_ATTACK_SNIPER;
                }
                // generally not good tactics the next two
                else if (accuracy < COMBAT_AI_ISNT_AWFUL && aspect < 0) {
                    behaviour = BEHAVIOUR_ATTACK_FLY_TO_TARGET_SIX;
                } else if (accuracy < COMBAT_AI_ISNT_AWFUL) {
                    behaviour = BEHAVIOUR_ATTACK_FLY_TO_TARGET_TWELVE;
                } else {
                    behaviour = BEHAVIOUR_ATTACK_FLY_TO_TARGET;
                }
```

### E-68 src/Core/Entities/ShipEntity.m:5917-5934

```objc
        previousCondition = [[NSMutableDictionary dictionaryWithCapacity:5] retain];

        [previousCondition oo_setInteger:behaviour forKey:@"behaviour"];
        if ([self primaryTarget] != nil) {
            // must use the weak ref here to prevent potential over-retention
            [previousCondition setObject:[[self primaryTarget] weakSelf] forKey:@"primaryTarget"];
        }
        [previousCondition oo_setFloat:desired_range forKey:@"desired_range"];
        [previousCondition oo_setFloat:desired_speed forKey:@"desired_speed"];
        [previousCondition oo_setHPVector:_destination forKey:@"destination"];

        _destination = [prox_ship position];
        _destination = OOHPVectorInterpolate(position, [prox_ship position], 0.5); // point between us and them

        desired_range = prox_ship->collision_radius * PROXIMITY_AVOID_DISTANCE_FACTOR;

        behaviour = BEHAVIOUR_AVOID_COLLISION;
        pitching_over = YES;
```

### E-69 src/Core/Entities/ShipEntity.m:6119-6131

```objc
    // check vectors
    Vector vdiff = HPVectorToVector(HPvector_between(position, other->position));
    GLfloat d_forward = dot_product(vdiff, v_forward);
    GLfloat d_up = dot_product(vdiff, v_up);
    GLfloat d_right = dot_product(vdiff, v_right);
    if ((d_forward > 0.0) && (flightSpeed > 0.0)) // it's ahead of us and we're moving forward
        d_forward *= 0.25 * maxFlightSpeed / flightSpeed; // extend the collision zone forward up to 400%
    double d2 = d_forward * d_forward + d_up * d_up + d_right * d_right;
    double cr2 = collision_radius * 2.0 + other->collision_radius;
    cr2 *= cr2; // check with twice the combined radius

    if (d2 > cr2) // we're okay
        return;
```

### E-70 src/Core/Entities/ShipEntity.m:2427-2436

```objc
        if (!isSubEnt) {
            // update destination position for escorts
            [self refreshEscortPositions];
            if ([self hasEscorts]) {
                ShipEntity* escort = nil;
                unsigned i = 0;
                // Note: works on escortArray rather than escortEnumerator because escorts may be mutated.
                foreach (escort, [self escortArray]) {
                    [escort setEscortDestination:[self coordinatesForEscortPosition:i++]];
                }
```

### E-71 src/Core/Entities/ShipEntity.m:7823-7841

```objc
    unsigned cargo_chance = 70;
    jetsam = [NSArray arrayWithArray:cargo]; // what the ship is carrying
    [cargo removeAllObjects]; // dispense with it!
    unsigned limit = 15;
    //  Throw out cargo
    NSUInteger n_jetsam = [jetsam count];

    for (i = 0; i < n_jetsam; i++) {
        if (Ranrot() % 100 < cargo_chance) //  chance of any given piece of cargo surviving decompression
        {
            // a higher chance of getting at least a couple of bits of cargo out
            if (cargo_chance > 10) {
                if (EXPECT_NOT([self isPlayer])) {
                    cargo_chance -= 20;
                } else {
                    cargo_chance -= 30;
                }
            }
            limit--;
```

### E-72 src/Core/Entities/ShipEntity.m:7847-7859

```objc
            HPVector rpos = xposition;
            Vector rrand = OORandomPositionInBoundingBox(boundingBox);
            rpos.x += rrand.x;
            rpos.y += rrand.y;
            rpos.z += rrand.z;
            rpos.x += (ranrot_rand() % 7) - 3;
            rpos.y += (ranrot_rand() % 7) - 3;
            rpos.z += (ranrot_rand() % 7) - 3;
            [container setPosition:rpos];
            v.x = 0.1 * ((ranrot_rand() % speed_low) - speed_low / 2);
            v.y = 0.1 * ((ranrot_rand() % speed_low) - speed_low / 2);
            v.z = 0.1 * ((ranrot_rand() % speed_low) - speed_low / 2);
            [container setVelocity:vector_add(v, [self velocity])];
```

### E-73 src/Core/Entities/ShipEntity.m:7939-7939

```objc
            BOOL add_debris = (UNIVERSE->n_entities < 0.95 * UNIVERSE_MAX_ENTITIES) && ([UNIVERSE getTimeDelta] < 0.125); // FPS > 8
```

### E-74 src/Core/Entities/ShipEntity.m:8047-8047

```objc
                    if (UNIVERSE->n_entities < 0.50 * UNIVERSE_MAX_ENTITIES) {
```

### E-75 src/Core/Entities/ShipEntity.m:8044-8063

```objc
                if ((n_alloys && canFragment) || canReleaseSubWreckage) {
                    NSUInteger n_wreckage = 0;

                    if (UNIVERSE->n_entities < 0.50 * UNIVERSE_MAX_ENTITIES) {
                        // Create wreckage only when UNIVERSE is less than half full.
                        // (condition set in r906 - was < 0.75 before) --Kaks 2011.10.17
                        NSUInteger maxWrecks = 3;
                        if (n_alloys == 0) {
                            // must be sub-wreckage here
                            n_wreckage = (mass > 600.0 && randf() < 0.2) ? 2 : 0;
                        } else {
                            n_wreckage = (n_alloys < maxWrecks) ? floorf(randf() * (n_alloys + 2)) : maxWrecks;
                        }
                    }

                    for (i = 0; i < n_wreckage; i++) {
                        Vector r1 = [octree randomPoint];
                        Vector dir = quaternion_rotate_vector([self normalOrientation], r1);
                        HPVector rpos = HPvector_add(vectorToHPVector(dir), xposition);
                        GLfloat lifetime = 750.0 * randf() + 250.0 * i + 100.0;
```

### E-76 src/Core/Entities/ShipEntity.m:7915-7916

```objc
    int speed_low = 200;
    GLfloat n_alloys = sqrtf(sqrtf(mass / 6000.0f));
```

### E-77 src/Core/Entities/ShipEntity.m:8068-8086

```objc
                    n_alloys = randf() * n_alloys;
                }
            }

            if (!canFragment) {
                n_alloys = 0.0;
            }
            // If UNIVERSE is almost full, don't create more than 1 piece of scrap metal.
            else if (!add_debris) {
                n_alloys = (n_alloys > 1.0) ? 1.0 : 0.0;
            }

            // now convert to uint
            numAlloys = floorf(n_alloys);

            // Throw out scrap metal
            //
            for (i = 0; i < numAlloys; i++) {
                ShipEntity* plate = [UNIVERSE newShipWithRole:@"alloy"]; // retain count = 1
```

### E-78 src/Core/Universe.m:3863-3878

```objc
- (ShipEntity*)cargoPodFromTemplate:(ShipEntity*)cargoObj
{
    ShipEntity* container = nil;
    // this is a template container, so we need to make a real one
    OOCommodityType co_type = [cargoObj commodityType];
    OOCargoQuantity co_amount = [UNIVERSE getRandomAmountOfCommodity:co_type];
    if (randf() < 0.5) // stops OXP monopolising pods for commodities
    {
        container = [UNIVERSE newShipWithRole:co_type]; // newShipWithRole returns retained object
    }
    if (container == nil) {
        container = [UNIVERSE newShipWithRole:@"cargopod"];
    }
    [container setCommodity:co_type andAmount:co_amount];
    return [container autorelease];
}
```

### E-79 src/Core/Universe.m:5501-5519

```objc
    if (wreck) {
        GLfloat expected_mass = 0.1f * [ship mass] * (0.75 + 0.5 * randf());
        GLfloat wreck_mass = [wreck mass];
        GLfloat scale_factor = powf(expected_mass / wreck_mass, 0.33333333f) * scale; // cube root of volume ratio
        [wreck rescaleBy:scale_factor writeToCache:NO];

        [wreck setPosition:rpos];

        [wreck setVelocity:[ship velocity]];

        quaternion_set_random(&q);
        [wreck setOrientation:q];

        [wreck setTemperature:1000.0]; // take 1000e heat damage per second
        [wreck setHeatInsulation:1.0e7]; // very large! so it won't cool down
        [wreck setEnergy:lifetime];

        [wreck setIsWreckage:YES];

```

### E-80 src/Core/Entities/ShipEntity.m:2254-2272

```objc
        // work on the ship temperature
        //
        float heatThreshold = [self heatInsulation] * 100.0f;
        if (external_temp > heatThreshold && external_temp > ship_temperature)
            ship_temperature += (external_temp - ship_temperature) * delta_t * SHIP_INSULATION_FACTOR / [self heatInsulation];
        else {
            if (ship_temperature > SHIP_MIN_CABIN_TEMP) {
                ship_temperature += (external_temp - heatThreshold - ship_temperature) * delta_t * SHIP_COOLING_FACTOR / [self heatInsulation];
                if (ship_temperature < SHIP_MIN_CABIN_TEMP)
                    ship_temperature = SHIP_MIN_CABIN_TEMP;
            }
        }
    } else // subents
    {
        ship_temperature = [[self owner] temperature];
    }

    if (ship_temperature > SHIP_MAX_CABIN_TEMP)
        [self takeHeatDamage:delta_t * ship_temperature];
```

### E-81 src/Core/Entities/ShipEntity.m:7680-7698

```objc
- (void)dealMomentumWithinDesiredRange:(double)amount
{
    NSArray* targets = [UNIVERSE entitiesWithinRange:desired_range ofEntity:self];
    if ([targets count] > 0) {
        unsigned i;
        for (i = 0; i < [targets count]; i++) {
            ShipEntity* e2 = (ShipEntity*)[targets objectAtIndex:i];
            if ([e2 isShip] && [e2 isInSpace]) {
                Vector p2 = [self vectorTo:e2];
                double ecr = [e2 collisionRadius];
                double d2 = magnitude2(p2) - ecr * ecr;
                // limit momentum transfer to relatively sensible levels
                if (d2 < 0.1) {
                    d2 = 0.1;
                }
                double moment = amount * desired_range / d2;
                [e2 addImpactMoment:vector_normal(p2) fraction:moment];
            }
        }
```

### E-82 src/Core/Entities/ShipEntity.m:8123-8126

```objc
        if (!suppressExplosion) {
            desired_range = collision_radius * 2.5f;
            [self dealMomentumWithinDesiredRange:0.125f * mass];
        }
```

### E-83 src/Core/Octree.m:695-714

```objc
    Octree_details nextDetails;
    int nextLevel = octBuffer[0];
    const int* nextBuffer = &octBuffer[nextLevel];
    unsigned i, oct;

    nextDetails.radius = 0.5f * octRadius;
    nextDetails.octree_collision = NULL;
    oct = Ranrot() & 7;

    for (i = 0; i < 8; i++) {
        int octant = oct ^ i;
        if (nextBuffer[octant]) // don't test empty octants
        {
            nextDetails.octree = &nextBuffer[octant];
            Vector voff = vector_add(offset, offsetForOctant(octant, octRadius));
            return randomFullNodeFrom(nextDetails, voff);
        }
    }
    return offset;
}
```

### E-84 src/Core/Entities/OOExplosionCloudEntity.m:60-73

```objc
    unsigned maxCount = [UNIVERSE detailLevel] <= DETAIL_LEVEL_SHADERS ? 10 : 25;
    HPVector pos = [entity position];
    Vector vel = [entity velocity];

    if (settings == nil) {
        _settings = [[NSDictionary dictionary] retain];
    } else {
        _settings = [settings retain];
    }

    unsigned count = [_settings oo_unsignedIntForKey:kExplosionCount defaultValue:25];
    if (count > maxCount) {
        count = maxCount;
    }
```

### E-85 src/Core/Entities/OOFlashEffectEntity.m:55-60

```objc
- (id)initExplosionFlashWithPosition:(HPVector)pos velocity:(Vector)vel size:(float)size
{
    if ((self = [self initWithPosition:pos size:size color:[OOColor whiteColor] duration:kExplosionFlashDuration])) {
        _growthRate = fmax(_growthRate, kMinExplosionGrowth);
        _alpha = kExplosionFlashAlpha;
        [self setVelocity:vel];
```

### E-86 src/Core/Entities/ShipEntityAI.m:473-479

```objc
- (void)performTumble
{
    stick_roll = max_flight_roll * 2.0 * (randf() - 0.5);
    stick_pitch = max_flight_pitch * 2.0 * (randf() - 0.5);
    behaviour = BEHAVIOUR_TUMBLE;
    frustration = 0.0;
}
```

### E-87 src/Core/Entities/ShipEntityAI.m:1591-1605

```objc
- (void)escortCheckMother
{
    ShipEntity* mother = [self owner];

    if ([mother acceptAsEscort:self]) {
        [self setOwner:mother];
        [self setGroup:[mother escortGroup]];
        [shipAI message:@"ESCORTING"];
    } else {
        [self setOwner:self];
        if ([self group] == [mother escortGroup])
            [self setGroup:nil];
        [shipAI message:@"NOT_ESCORTING"];
    }
}
```

### E-88 src/Core/Entities/ShipEntity.m:11926-11934

```objc
- (BOOL)acceptAsEscort:(ShipEntity*)other_ship
{
    // can't pair with self
    if (self == other_ship)
        return NO;

    // no longer in flight, probably entered wormhole without telling escorts.
    if ([self status] != STATUS_IN_FLIGHT)
        return NO;
```

### E-89 src/Core/Entities/ShipEntity.m:2033-2041

```objc
    double distance = HPmagnitude([subent position]) + [subent findCollisionRadius];
    if ([subent isKindOfClass:[ShipEntity class]]) // Solid subentity
    {
        if (distance > collision_radius) {
            collision_radius = distance;
        }

        mass += [subent mass];
    }
```

### E-90 src/Core/Universe.m:4445-4452

```objc
                float ratio = (displayGUI ? 0.5 : [gameView fov:YES]) * nearPlane / distanceFactor; // 0.5 is field of view ratio for GUIs

                OOGLResetProjection();
                if ((displayGUI && 4 * aspect >= 3) || (!displayGUI && 4 * aspect <= 3)) {
                    OOGLFrustum(-ratio, ratio, -aspect * ratio, aspect * ratio, nearPlane / distanceFactor, farPlane);
                } else {
                    OOGLFrustum(-3 * ratio / aspect / 4, 3 * ratio / aspect / 4, -3 * ratio / 4, 3 * ratio / 4, nearPlane / distanceFactor, farPlane);
                }
```

### E-91 src/Core/HeadUpDisplay.m:4002-4006

```objc
    double tanfov = [gameView fov:YES];
    GLfloat aspect = [gameView viewSize].width / [gameView viewSize].height;
    if (aspect < 4.0 / 3.0) {
        tanfov *= 0.75 * aspect;
    }
```

### E-92 src/Core/GuiDisplayGen.m:751-766

```objc
    }

    OOGUIRow row = currentRow;
    if (row == (OOGUIRow)n_rows - 1)
        [self scrollUp:1];
    NSSize chSize = pixel_text_size;
    NSSize strsize = OORectFromString(str, 0.0f, 0.0f, chSize).size;
    if (strsize.width < size_in_pixels.width) {
        [self setText:str forRow:row align:alignment];
        if (text_color)
            [self setColor:text_color forRow:row];
        if (text_key)
            [self setKey:text_key forRow:row];
        rowFadeTime[row] = text_fade;
        if (currentRow < (OOGUIRow)n_rows - 1)
            currentRow++;
```

### E-93 src/Core/GuiDisplayGen.m:1327-1336

```objc
        if (rowFadeTime[i] > 0.0f && ![UNIVERSE permanentMessageLog]) {
            rowFadeTime[i] -= (float)delta_t;
            if (rowFadeTime[i] <= 0.0f) {
                [rowText replaceObjectAtIndex:i withObject:@""];
                rowFadeTime[i] = 0.0f;
                continue;
            }
            if ((rowFadeTime[i] > 0.0f) && (rowFadeTime[i] < 1.0)) {
                row_alpha[i] *= rowFadeTime[i];
                if (backgroundAlpha < row_alpha[i])
```

### E-94 src/Core/Universe.m:6340-6355

```objc
- (void)addMessage:(NSString*)text forCount:(OOTimeDelta)count forceDisplay:(BOOL)forceDisplay
{
    if (![currentMessage isEqual:text] || forceDisplay || universal_time >= messageRepeatTime) {
        if ([PLAYER isSpeechOn] == OOSPEECHSETTINGS_ALL) {
            [self speakWithSubstitutions:text];
        }

        [self showGUIMessage:text withScroll:YES andColor:[message_gui textColor] overDuration:count];

        [PLAYER doScriptEvent:OOJSID("consoleMessageReceived") withArgument:text];

        [currentMessage release];
        currentMessage = [text retain];
        messageRepeatTime = universal_time + 6.0;
    }
}
```

### E-95 src/Core/Entities/PlayerEntityControls.m:1166-1175

```objc
                    if (!jump_pressed) {
                        if (!hyperspeed_engaged) {
                            hyperspeed_locked = [self massLocked];
                            hyperspeed_engaged = !hyperspeed_locked;
                            if (hyperspeed_locked) {
                                [self playJumpMassLocked];
                                [UNIVERSE addMessage:DESC(@"jump-mass-locked") forCount:1.5];
                            }
                        } else {
                            hyperspeed_engaged = NO;
```

### E-96 src/Core/Entities/PlayerEntity.m:5122-5138

```objc
- (OOAlertCondition)alertCondition
{
    OOAlertCondition old_alert_condition = alertCondition;
    alertCondition = ALERT_CONDITION_GREEN;

    [self setAlertFlag:ALERT_FLAG_DOCKED to:[self status] == STATUS_DOCKED];

    if (alertFlags & ALERT_FLAG_DOCKED) {
        alertCondition = ALERT_CONDITION_DOCKED;
    } else {
        if (alertFlags != 0) {
            alertCondition = ALERT_CONDITION_YELLOW;
        }
        if (alertFlags > ALERT_FLAG_YELLOW_LIMIT) {
            alertCondition = ALERT_CONDITION_RED;
        }
    }
```

### E-97 src/Core/Entities/PlayerEntity.m:2976-2993

```objc
    [self setAlertFlag:ALERT_FLAG_MASS_LOCK
                    to:massLocked];

    [self setAlertFlag:ALERT_FLAG_HOSTILES to:foundHostiles];

    for (i = 0; i < ent_count; i++) {
        [my_entities[i] release]; //	released
    }

    BOOL energyCritical = NO;
    if (energy < 64 && energy < maxEnergy * 0.8) {
        energyCritical = YES;
    }
    [self setAlertFlag:ALERT_FLAG_ENERGY to:energyCritical];

    [self setAlertFlag:ALERT_FLAG_TEMP to:([self hullHeatLevel] > .90)];

    [self setAlertFlag:ALERT_FLAG_ALT to:([self dialAltitude] < .10)];
```

### E-98 src/Core/Entities/PlayerEntity.m:9675-9690

```objc
    NSUInteger import_legality = [localMarket importLegalityForGood:good];
    NSUInteger export_legality = [localMarket exportLegalityForGood:good];
    NSString* legaldesc = nil;
    if (import_legality == 0) {
        if (export_legality == 0) {
            legaldesc = DESC(@"oolite-legality-clear");
        } else {
            legaldesc = DESC(@"oolite-legality-import");
        }
    } else {
        if (export_legality == 0) {
            legaldesc = DESC(@"oolite-legality-export");
        } else {
            legaldesc = DESC(@"oolite-legality-neither");
        }
    }
```

### E-99 src/Core/Entities/PlayerEntity.m:9979-9986

```objc
- (void)showMarketCashAndLoadLine
{
    GuiDisplayGen* gui = [UNIVERSE gui];
    OOCargoQuantity currentCargo = current_cargo;
    OOCargoQuantity cargoCapacity = [self maxAvailableCargoSpace];
    [gui setText:OOExpandKey(@"market-cash-and-load", credits, currentCargo, cargoCapacity) forRow:GUI_ROW_MARKET_CASH];
    [gui setColor:[gui colorFromSetting:kGuiMarketCashColor defaultValue:[OOColor yellowColor]] forRow:GUI_ROW_MARKET_CASH];
}
```

### E-100 src/Core/Entities/PlayerEntity.m:9612-9628

```objc
- (NSArray*)applyMarketSorter:(NSArray*)goods onMarket:(OOCommodityMarket*)market
{
    switch (marketSorterMode) {
    case MARKET_SORTER_MODE_ALPHA:
        return [goods sortedArrayUsingFunction:marketSorterByName context:market];
    case MARKET_SORTER_MODE_PRICE:
        return [goods sortedArrayUsingFunction:marketSorterByPrice context:market];
    case MARKET_SORTER_MODE_STOCK:
        return [goods sortedArrayUsingFunction:marketSorterByQuantity context:market];
    case MARKET_SORTER_MODE_HOLD:
        return [goods sortedArrayUsingFunction:marketSorterByQuantity context:shipCommodityData];
    case MARKET_SORTER_MODE_UNIT:
        return [goods sortedArrayUsingFunction:marketSorterByMassUnit context:market];
    case MARKET_SORTER_MODE_OFF:
        // keep default sort order
        break;
    }
```

### E-101 src/Core/Entities/PlayerEntityContracts.m:1058-1066

```objc
        current = current_cargo;
        max = [self maxAvailableCargoSpace];
        NSString* cargoString = OOExpandKey(@"oolite-manifest-cargo", current, max);
        current = [[self passengerList] count];
        max = max_passengers;
        NSString* cabinString = OOExpandKey(@"oolite-manifest-cabins", current, max);
        NSArray* manifestHeader = [NSArray arrayWithObjects:cargoString, cabinString, nil];

        SET_MANIFEST_ROW(manifestHeader, entryColor, cargoRow - 1);
```

### E-102 src/Core/Entities/PlayerEntityContracts.m:1068-1083

```objc
        if (manifestCount > 0) {
            for (i = 0; i < cargoRowCount; i++) {
                NSMutableArray* row_info = [NSMutableArray arrayWithCapacity:3];
                // i is always smaller than manifest_count, no need to test.
                [row_info addObject:[cargoManifest objectAtIndex:i]];
                if (i + cargoRowCount < manifestCount) {
                    [row_info addObject:[cargoManifest objectAtIndex:i + cargoRowCount]];
                } else {
                    [row_info addObject:@""];
                }
                SET_MANIFEST_ROW((NSArray*)row_info, subheadColor, cargoRow + i);
            }
        } else {
            SET_MANIFEST_ROW((DESC(@"manifest-none")), subheadColor, cargoRow);
            cargoRowCount = 1;
        }
```

### E-103 src/Core/GuiDisplayGen.m:1541-1541

```objc
            [self setTitle:[NSString stringWithFormat:DESC(@"long-range-chart-title-d"), galaxy_number + 1]];
```

### E-104 src/Core/GuiDisplayGen.m:1788-1792

```objc
        NSDictionary* systemInfo = [systemManager getPropertiesForSystem:i inGalaxy:galaxy_id];
        float blob_factor = [guiUserSettings oo_floatForKey:kGuiChartCircleScale defaultValue:0.0017];
        float blob_size = (1.0f + blob_factor * [systemInfo oo_floatForKey:@"radius"]) / zoom;
        if (blob_size < 0.5)
            blob_size = 0.5;
```

### E-105 src/Core/GuiDisplayGen.m:1846-1860

```objc
            case OOLRC_MODE_UNKNOWN:
            case OOLRC_MODE_SUNCOLOR:
                if (EXPECT(noNova)) {
                    r = g = b = 1.0;
                    OOColor* sunColor = [OOColor colorWithDescription:[[UNIVERSE systemManager] getProperty:@"sun_color" forSystem:i inGalaxy:galaxy_id]];
                    if (sunColor != nil) {
                        [sunColor getRed:&r green:&g blue:&b alpha:&alpha];
                        alpha = 1.0; // reset
                    }
                } else {
                    r = 1.0;
                    g = 0.2;
                    b = 0.0;
                }
                OOGL(glColor4f(r, g, b, alpha));
```

### E-106 src/Core/Universe.m:7745-7764

```objc
- (NSPoint)findSystemCoordinatesWithPrefix:(NSString*)p_fix exactMatch:(BOOL)exactMatch
{
    NSString* system_name = nil;
    NSPoint system_coords = NSMakePoint(-1.0, -1.0);
    int i;
    int result = -1;
    for (i = 0; i < 256; i++) {
        system_found[i] = NO;
        system_name = [system_names[i] lowercaseString];
        if ((exactMatch && [system_name isEqualToString:p_fix]) || (!exactMatch && [system_name hasPrefix:p_fix])) {
            /* Only used in player-based search routines */
            NSDictionary* systemInfo = [systemManager getPropertiesForSystem:i inGalaxy:galaxyID];
            NSInteger concealment = [systemInfo oo_intForKey:@"concealment" defaultValue:OO_SYSTEMCONCEALMENT_NONE];
            if (concealment >= OO_SYSTEMCONCEALMENT_NONAME) {
                // system is not known
                continue;
            }

            system_found[i] = YES;
            if (result < 0) {
```

### E-107 src/Core/Entities/PlayerEntityControls.m:1836-1855

```objc
            if ([[gameView typedString] length] > 0) {
                planetSearchString = [[[gameView typedString] lowercaseString] retain];
                NSPoint search_coords = [UNIVERSE findSystemCoordinatesWithPrefix:planetSearchString];
                if ((search_coords.x >= 0.0) && (search_coords.y >= 0.0)) {
                    // always reset the found system index at the beginning of a new search
                    if ([planetSearchString length] == 1)
                        [[UNIVERSE gui] targetNextFoundSystem:0];

                    // Always select the right one out of 2 overlapping systems.
                    [self targetNewSystem:0 whileTyping:YES];
                } else {
                    found_system_id = -1;
                    [self clearPlanetSearchString];
                }
            } else {
                if ([gameView isDown:gvDeleteKey]) // did we just delete the string ?
                {
                    found_system_id = -1;
                    [UNIVERSE findSystemCoordinatesWithPrefix:@""];
                }
```

### E-108 src/Core/Entities/PlayerEntity.m:8293-8302

```objc
            if (isOK) {
                if (techlevel < minTechLevel)
                    isOK = NO;
                if (![self canAddEquipment:eqKey inContext:@"purchase"])
                    isOK = NO;
                if (available_facings == 0 && [eqType isPrimaryWeapon])
                    isOK = NO;
                if (isOK)
                    [equipmentAllowed addObject:eqKey];
            }
```

### E-109 src/Core/Universe.m:6258-6267

```objc
- (void)displayCountdownMessage:(NSString*)text forCount:(OOTimeDelta)count
{
    if (![currentMessage isEqual:text] && universal_time >= countdown_messageRepeatTime) {
        if (currentMessage)
            [currentMessage release];
        currentMessage = [text retain];
        countdown_messageRepeatTime = universal_time + count;
        [self showGUIMessage:text withScroll:NO andColor:[message_gui textColor] overDuration:count];
    }
}
```

### E-110 src/Core/HeadUpDisplay.m:1075-1078

```objc
        x = useDefined(cached.x, SCANNER_CENTRE_X) + [[UNIVERSE gameView] x_offset] * cached.x0;
        y = useDefined(cached.y, SCANNER_CENTRE_Y) + [[UNIVERSE gameView] y_offset] * cached.y0;
        siz.width = useDefined(cached.width, SCANNER_WIDTH);
        siz.height = useDefined(cached.height, SCANNER_HEIGHT);
```

### E-111 src/Core/HeadUpDisplay.m:1500-1507

```objc
        Vector relativePosition = [PLAYER vectorTo:reference];
        relativePosition = OOVectorMultiplyMatrix(relativePosition, rotMatrix);
        relativePosition = vector_normal_or_fallback(relativePosition, kBasisZVector);

        relativePosition.x *= siz.width * 0.4;
        relativePosition.y *= siz.height * 0.4;
        relativePosition.x += x;
        relativePosition.y += y;
```

### E-112 src/Core/Entities/ShipEntity.m:5667-5671

```objc
    case CLASS_BUOY:
        if (flash)
            return friendly_color;
        else
            return neutral_color;
```

### E-113 src/Core/Universe.m:2895-2913

```objc
    if (forDocking) {
        NSDictionary* info = [[PLAYER dockedStation] shipInfoDictionary];
        sides = [info oo_unsignedIntForKey:@"tunnel_corners" defaultValue:4];
        startAngle = [info oo_floatForKey:@"tunnel_start_angle" defaultValue:45.0f];
        aspectRatio = [info oo_floatForKey:@"tunnel_aspect_ratio" defaultValue:2.67f];
    }

    for (i = 1; i < 11; i++) {
        ring = [OOBreakPatternEntity breakPatternWithPolygonSides:sides startAngle:startAngle aspectRatio:aspectRatio];
        if (!forDocking) {
            [ring setInnerColor:col1 outerColor:col2];
        }

        Vector offset = vector_multiply_scalar(v, i * BREAK_PATTERN_RING_SPACING);
        [ring setPosition:HPvector_add(pos, vectorToHPVector(offset))]; // ahead of the player
        [ring setOrientation:q];
        [ring setVelocity:vel];
        [ring setLifetime:i * BREAK_PATTERN_RING_SPACING];

```

### E-114 src/Core/Entities/DockEntity.m:819-827

```objc
    Quaternion q1 = [station orientation];
    q1 = quaternion_multiply(orientation, q1);
    Vector launchVector = vector_forward_from_quaternion(q1);

    // launch orientation
    if ((port_dimensions.x < port_dimensions.y) ^ (bb.max.x - bb.min.x < bb.max.y - bb.min.y)) {
        quaternion_rotate_about_axis(&q1, launchVector, M_PI * 0.5); // to account for the slot being at 90 degrees to vertical
    }
    [ship setNormalOrientation:q1];
```

### E-115 src/Core/Entities/PlayerEntityControls.m:3629-3637

```objc
        // Compass mode '\'
        if ([self checkKeyPress:n_key_next_compass_mode] || joyButtonState[BUTTON_COMPASSMODE]) // look for the '\' key
        {
            if ((!next_compass_mode_pressed) && (compassMode != COMPASS_MODE_BASIC))
                [self setNextCompassMode];
            next_compass_mode_pressed = YES;
        } else {
            next_compass_mode_pressed = NO;
        }
```

### E-116 src/Core/Universe.m:4718-4733

```objc
            switch (v_status) {
            case STATUS_DEAD:
            case STATUS_ESCAPE_SEQUENCE:
            case STATUS_START_GAME:
                // no HUD rendering in these modes
                break;
            default:
                switch ([player guiScreen]) {
                // case GUI_SCREEN_KEYBOARD:
                //  no HUD rendering on this screen
                // break;
                default:
                    [theHUD setLineWidth:lineWidth];
                    [theHUD renderHUD];
                }
            }
```

### E-117 src/Core/HeadUpDisplay.m:1480-1494

```objc
    GLDrawOval(x, y, z1, siz, 12);
    OOGL(glColor4f(compass_color[0], compass_color[1], compass_color[2], 0.5f * alpha));
    OOGLBEGIN(GL_LINES);
    glVertex3f(x - w1, y, z1);
    glVertex3f(x - w3, y, z1);
    glVertex3f(x + w1, y, z1);
    glVertex3f(x + w3, y, z1);
    glVertex3f(x, y - h1, z1);
    glVertex3f(x, y - h3, z1);
    glVertex3f(x, y + h1, z1);
    glVertex3f(x, y + h3, z1);
    OOGLEND();
    OOGL(GLScaledLineWidth(lineWidth)); // thinner

    if ([self checkPlayerInSystemFlight] && [PLAYER status] != STATUS_LAUNCHING) // normal system
```

### E-118 src/Core/Universe.m:5615-5628

```objc
        if (v_off.z > 0.0 && v_off.z < nearest + cr && // ahead AND within range
            v_off.x < cr && v_off.x > -cr && v_off.y < cr && v_off.y > -cr && // AND not off to one side or another
            v_off.x * v_off.x + v_off.y * v_off.y < cr * cr) // AND not off to both sides
        {
            ShipEntity* entHit = nil;
            GLfloat hit = [(ShipEntity*)e2 doesHitLine:p0 v1:p1 hitEntity:&entHit]; // octree detection

            if (hit > 0.0 && hit < nearest) {
                if ([entHit isSubEntity]) {
                    hit_subentity = entHit;
                }
                hit_entity = e2;
                nearest = hit;
                p1 = HPvector_add(p0, vectorToHPVector(vector_multiply_scalar(f1, nearest)));
```

### E-119 src/Core/Entities/ShipEntity.m:3724-3727

```objc
- (void)behaviour_tumble:(double)delta_t
{
    [self applySticks:delta_t];
}
```

### E-120 src/Core/Entities/ShipEntity.m:10409-10416

```objc
            ShipEntity* subent = [victim subEntityTakingDamage];
            if (subent != nil && [victim isFrangible]) {
                // do 1% bleed-through damage...
                [victim takeEnergyDamage:0.01 * effective_damage from:self becauseOf:self weaponIdentifier:weaponIdentifier];
                victim = subent;
            }

            if (hit_at_range * hit_at_range < range_limit2) {
```

### E-121 src/Core/Universe.m:5633-5636

```objc
    if (hit_entity) {
        // I think the above code does not guarantee that the closest hit_subentity belongs to the closest hit_entity.
        if (hit_subentity && [hit_subentity owner] == hit_entity)
            [hit_entity setSubEntityTakingDamage:hit_subentity];
```

### E-122 src/Core/Entities/ShipEntity.m:291-292

```objc
    maxEnergy = [shipDict oo_floatForKey:@"max_energy" defaultValue:200.0f];
    energy_recharge_rate = [shipDict oo_floatForKey:@"energy_recharge_rate" defaultValue:1.0f];
```

### E-123 src/Core/Entities/ShipEntity.m:8185-8193

```objc
- (void)subEntityDied:(ShipEntity*)sub
{
    if ([self subEntityTakingDamage] == sub)
        [self setSubEntityTakingDamage:nil];

    [sub setOwner:nil];
    // TODO? Recalculating collision radius should increase collision testing efficiency,
    // but for most ship models the difference would be marginal. -- Kaks 20110429
    mass -= [sub mass]; // missing subents affect fuel charge rate, etc..
```

### E-124 src/Core/Entities/ShipEntity.m:7957-7965

```objc
                } else {
                    NSString* explosionKey = @"oolite-default-ship-explosion";
                    NSDictionary* explosion = nil;
                    if (explosionType == nil) {
                        explosion = [UNIVERSE explosionSetting:explosionKey];
                        [UNIVERSE addEntity:[OOExplosionCloudEntity explosionCloudFromEntity:self withSettings:explosion]];
                        // 3. flash
                        [UNIVERSE addEntity:[OOFlashEffectEntity explosionFlashFromEntity:self]];
                    }
```

### E-125 src/Core/Entities/PlayerEntity.m:4655-4659

```objc

        if (new_target == nil || [new_target status] < STATUS_ACTIVE || [new_target status] == STATUS_IN_HOLD) {
            [self setCompassMode:COMPASS_MODE_PLANET];
            new_target = the_planet;
        }
```

### E-126 src/Core/Entities/PlayerEntity.m:4789-4807

```objc
    case COMPASS_MODE_TARGET:
        beacon = [UNIVERSE firstBeacon];
        while (beacon != nil && [beacon isJammingScanning]) {
            beacon = [beacon nextBeacon];
        }
        [self setNextBeacon:beacon];

        if (beacon != nil)
            [self setCompassMode:COMPASS_MODE_BEACONS];
        else
            [self setCompassMode:COMPASS_MODE_PLANET];
        break;

    case COMPASS_MODE_BEACONS:
        beacon = [self nextBeacon];
        do {
            beacon = [beacon nextBeacon];
        } while (beacon != nil && [beacon isJammingScanning]);
        [self setNextBeacon:beacon];
```

### E-127 src/Core/Universe.m:1088-1091

```objc
- (void)setUpUniverseFromStation
{
    if (![self sun]) {
        // we're in witchspace...
```

### E-128 src/Core/HeadUpDisplay.m:1112-1120

```objc
    // use a non-mutable copy so this can't be changed under us.
    int ent_count = UNIVERSE->n_entities;
    Entity** uni_entities = UNIVERSE->sortedEntities; // grab the public sorted list
    Entity* my_entities[ent_count];
    Entity* scannedEntity = nil;

    for (i = 0; i < ent_count; i++) {
        my_entities[i] = [uni_entities[i] retain]; // retained
    }
```

### E-129 src/Core/Entities/ShipEntity.m:11072-11091

```objc
    GLfloat v2b = dot_product(v, loc); // velocity of other along loc before collision

    GLfloat v1a = sqrt(v2b * v2b * m2 / m1); // velocity of self along loc after elastic collision
    if (v2b < 0.0f)
        v1a = -v1a; // in same direction as v2b

    // are they moving apart at over 1m/s already?
    if (v2b < 0.0f) {
        if (v2b < -1.0f)
            return NO;
        else {
            position = HPvector_subtract(position, hploc); // adjust self position
            v = kZeroVector; // go for the 1m/s solution
        }
    }

    // convert change in velocity into damage energy (KE)
    dam1 = m2 * v2b * v2b / 50000000;
    dam2 = m1 * v2b * v2b / 50000000;

```

### E-130 src/Core/Universe.m:6557-6567

```objc
                // maintain distance-from-player list
                GLfloat z_distance = thing->zero_distance;

                int index = thing->zero_index;
                while (index > 0 && z_distance < sortedEntities[index - 1]->zero_distance) {
                    sortedEntities[index] = sortedEntities[index - 1]; // bubble up the list, usually by just one position
                    sortedEntities[index - 1] = thing;
                    thing->zero_index = index - 1;
                    sortedEntities[index]->zero_index = index;
                    index--;
                }
```

### E-131 src/Core/Entities/ShipEntity.m:11149-11150

```objc
    // remove self from other's collision list
    [[other collisionArray] removeObject:self];
```

### E-132 src/Core/Entities/ShipEntity.m:11111-11112

```objc
    BOOL selfDestroyed = (dam1 > energy);
    BOOL otherDestroyed = (dam2 > [other energy]) && !otherIsStation;
```

### E-133 src/Core/Entities/StationEntity.m:1159-1163

```objc
- (void)adjustVelocity:(Vector)xVel
{
    if (self != [UNIVERSE station])
        [super adjustVelocity:xVel]; // dont get moved
}
```

### E-134 src/Core/Entities/ShipEntity.m:11137-11147

```objc
    if (!selfDestroyed && !otherDestroyed) {
        float t = 10.0 * [UNIVERSE getTimeDelta]; // 10 ticks

        HPVector pos1a = HPvector_add([self position], vectorToHPVector(vector_multiply_scalar(loc, t * v1a)));
        [self setPosition:pos1a];

        if (!otherIsStation) {
            HPVector pos2a = HPvector_add([other position], vectorToHPVector(vector_multiply_scalar(loc, t * v2b)));
            [other setPosition:pos2a];
        }
    }
```

### E-135 src/Core/CollisionRegion.m:341-343

```objc
                        } else {
                            collision = [e1 checkCloseCollisionWith:e2];
                        }
```

### E-136 src/Core/Entities/ShipEntity.m:11035-11042

```objc
    if ([self canScoop:other]) {
        [self scoopIn:other];
        return NO;
    }
    if ([other canScoop:self]) {
        [other scoopIn:self];
        return NO;
    }
```

### E-137 src/Core/Entities/PlayerEntity.m:2242-2254

```objc
- (BOOL)canCollide
{
    switch ([self status]) {
    case STATUS_START_GAME:
    case STATUS_DOCKING:
    case STATUS_DOCKED:
    case STATUS_DEAD:
    case STATUS_ESCAPE_SEQUENCE:
        return NO;

    default:
        return YES;
    }
```

### E-138 src/Core/Entities/PlayerEntity.m:3387-3405

```objc
    GLfloat velmag = magnitude(velocity);
    GLfloat velmag2 = velmag - (float)delta_t * thrust * thrust_factor;
    if (velmag > 0) {
        UPDATE_STAGE(@"applying power braking");

        if (velmag > VELOCITY_CLEANUP_MIN) {
            GLfloat rate;
            // Fix up extremely ridiculous speeds that can happen in collisions or explosions
            if (velmag > VELOCITY_CLEANUP_FULL)
                rate = VELOCITY_CLEANUP_RATE;
            else
                rate = (velmag - VELOCITY_CLEANUP_MIN) / (VELOCITY_CLEANUP_FULL - VELOCITY_CLEANUP_MIN) * VELOCITY_CLEANUP_RATE;
            velmag2 -= velmag * rate;
        }
        if (velmag2 < 0.0f)
            velocity = kZeroVector;
        else
            velocity = vector_multiply_scalar(velocity, velmag2 / velmag);
    }
```

### E-139 src/Core/Entities/ShipEntity.m:11102-11109

```objc
    // apply change in velocity
    if (otherParent != nil) {
        [otherParent adjustVelocity:vel2a]; // move the otherParent not the subentity
    } else {
        [other adjustVelocity:vel2a];
    }

    [self adjustVelocity:vel1a];
```

### E-140 src/Core/Entities/ShipEntity.m:11123-11128

```objc
    if (dam2 > 0.05) {
        if (otherParent != nil && ![otherParent isFrangible]) {
            [otherParent takeScrapeDamage:dam2 from:self];
        } else {
            [other takeScrapeDamage:dam2 from:self];
        }
```

### E-141 src/Core/Entities/ShipEntity.m:11173-11176

```objc
- (void)adjustVelocity:(Vector)xVel
{
    velocity = vector_add(velocity, xVel);
}
```

### E-142 src/Core/CollisionRegion.m:284-303

```objc
        r1 = e1->collision_radius;

        // check against the first in the collision chain
        e2 = e1->collision_chain;
        while (e2 != nil) {
            checks_this_tick++;
            if (e1->isShip && e2->isShip &&
                [(ShipEntity*)e1 collisionExceptedFor:(ShipEntity*)e2]) {
                // nothing happens
            } else {

                r2 = e2->collision_radius;
                r0 = r1 + r2;
                dist2 = HPdistance2(e2->position, p1);
                min_dist2 = r0 * r0;
                if (dist2 < PROXIMITY_WARN_DISTANCE2 * min_dist2) {
#ifdef OO_DEBUG_MONITOR_ENABLED
                    if (gDebugFlags & DEBUG_COLLISIONS) {
                        OOLog(@"collisionRegion.debug", @"DEBUG Testing collision between %@ (%@) and %@ (%@)",
                            e1, (e1->collisionTestFilter == 3) ? @"YES" : @"NO", e2, (e2->collisionTestFilter == 3) ? @"YES" : @"NO");
```

### E-143 src/Core/Universe.m:6713-6732

```objc
- (void)filterSortedLists
{
    /*
    Eric, 17-10-2010: raised the area to be not filtered out, from the combined collision size to 2x this size.
    This allows this filtered list to be used also for proximity_alert and not only for collisions. Before the
    proximity_alert could only trigger when already very near a collision. To late for ships to react.
    This does raise the number of entities in the collision chain with as result that the number of pairs to compair
    becomes significant larger. However, almost all of these extra pairs are dealt with by a simple distance check.
    I currently see no noticeable negative effect while playing, but this change might still give some trouble I missed.
    */
    Entity *e0, *next, *prev;
    OOHPScalar start, finish, next_start, next_finish, prev_start, prev_finish;

    // using the z_list - set or clear collisionTestFilter and clear collision_chain
    e0 = z_list_start;
    while (e0) {
        e0->collisionTestFilter = [e0 canCollide] ? 0 : 3;
        e0->collision_chain = nil;
        e0 = e0->z_next;
    }
```

### E-144 src/Core/Universe.m:7045-7064

```objc
    // finally, repeat the z_list - this time building collision chains...
    e0 = z_list_start;
    while (e0) {
        // here we are either at the start of the list or just past a gap
        start = e0->position.z - 2.0f * e0->collision_radius;
        finish = start + 4.0f * e0->collision_radius;
        next = e0->z_next;
        while ((next) && (next->collisionTestFilter == 3)) // next has been eliminated from the list of possible colliders - so skip it
            next = next->z_next;
        if (next) {
            next_start = next->position.z - 2.0f * next->collision_radius;
            if (next_start < finish) {
                // e0 and next overlap
                while ((next) && (next_start < finish)) {
                    // chain e0 to next in collision
                    e0->collision_chain = next;
                    // skip forward to the next gap or the end of the list
                    next_finish = next_start + 4.0f * next->collision_radius;
                    if (next_finish > finish)
                        finish = next_finish;
```

## Constants ledger

Each constant below is the value Wegolite compiles, its unit (a mass is Oolite's float32 mass in its own units; a length is in metres), the Oolite lines it follows, and the test that pins it.

| Constant                                                                                                                                                                                                         | Value                                                                                                                                                                                                                                                                  | Oolite (7437f22)                                                                                                  | Pinned by                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mass factor and default density                                                                                                                                                                                  | 20 and 1.0                                                                                                                                                                                                                                                             | `ShipEntity.m:417-419`                                                                                            | `tools/oolite-ingest/convert/ship-mass.test.ts`                                                                                                                     |
| Octree depth                                                                                                                                                                                                     | 4 below a size of 20, 5 below 900, 6 below 1,800, else 7 (size is the mean of the two largest bounding-box spans over all vertices)                                                                                                                                    | `OOMesh.m:60-70` and `591-623`, `Octree.h:81-83`                                                                  | `tools/oolite-ingest/convert/octree.test.ts`                                                                                                                        |
| Octree minimum half-width, root padding, volume depth limit                                                                                                                                                      | 1.0 m, 0.5 m, 5                                                                                                                                                                                                                                                        | `Octree.h:31`, `OOMeshToOctreeConverter.m:263`, `Octree.m:680`                                                    | `tools/oolite-ingest/convert/octree.test.ts`                                                                                                                        |
| Cobra Mk III (`oolite_template_cobra3-player`) mass                                                                                                                                                              | 214,737.6875                                                                                                                                                                                                                                                           | `ShipEntity.m:417-419`                                                                                            | `tools/oolite-ingest/convert/ship-mass.test.ts`, `tests/content/ships-client.test.ts`                                                                               |
| Viper mass                                                                                                                                                                                                       | 34,040.6796875                                                                                                                                                                                                                                                         | `ShipEntity.m:417-419`                                                                                            | `tools/oolite-ingest/convert/ship-mass.test.ts`, `tests/golden/content/ships-npc.json`                                                                              |
| Coriolis station mass: hull 228,650,880 + faceplate 58,255,096 + tris 220,998,576 + dock 7,579,321                                                                                                               | float32 running sum in shipdata order, each step rounded: 515,483,904 (exact decimal sum 515,483,873)                                                                                                                                                                  | `ShipEntity.m:417-419` and `2034-2041`                                                                            | `tools/oolite-ingest/convert/ship-mass.test.ts`, `tests/content/ships-client.test.ts`                                                                               |
| Navigation buoy mass                                                                                                                                                                                             | 698,691.1875 = 691,044.375 + 7,646.7861328125                                                                                                                                                                                                                          | `ShipEntity.m:2034-2041`                                                                                          | `tools/oolite-ingest/convert/ship-mass.test.ts`; stored in `src/content/generated/ships-client.json` (entry `buoy`), pinned by `tests/content/ships-client.test.ts` |
| Coriolis blockage mass `CORIOLIS_STATION_MASS`                                                                                                                                                                   | 515,483,904, the computed mass (owner decision 2026-11-14, plan 10-03); the source comment's 455,223,200 predates the current meshes. PROJECT.md: the row that starts "Coriolis blockage mass:"                                                                        | `ShipEntity.m:12504`                                                                                              | `tests/sim/hyperspace-blockage.test.ts`                                                                                                                             |
| Laser stats (range m, energy per shot, damage, recharge s, shot temperature): pulse 12,500, 0.8, 15, 0.5, 7; beam 15,000, 0.5, 6, 0.1, 3.2; mining 12,500, 1.4, 50, 2.5, 10; military 30,000, 1.1, 12, 0.1, 4.25 | recharge also held as integer ticks, `round(rate * 120)`: 60, 12, 300, 12 (the strict gate makes the periods 61, 13, 301, 13)                                                                                                                                          | `Resources/Config/equipment.plist:125-136`, `143-154`, `163-174`, `184-195`                                       | `tests/sim/combat/constants.test.ts`                                                                                                                                |
| Weapon heat: cooling factor, maximum temperature, cut-out fraction, initial shot time                                                                                                                            | 6 per second, 256, 0.85, 100 s                                                                                                                                                                                                                                         | `ShipEntity.h:115`, `PlayerEntity.h:277`, `ShipEntity.h:117`, `ShipEntity.h:102`                                  | `tests/sim/combat/constants.test.ts`, `tests/sim/combat/weapons.test.ts`                                                                                            |
| Shield and energy: baseline shield, shield recharge rate, Cobra maximum energy and recharge rate                                                                                                                 | 128, 2 per second each, 256, 4 per second                                                                                                                                                                                                                              | `ShipEntity.h:101`, `PlayerEntity.m:1536-1537` and `1949-1950`, `Resources/Config/shipdata.plist:1333` and `1296` | `tests/sim/combat/constants.test.ts`, `tests/sim/combat/shields.test.ts`                                                                                            |
| Energy bank threshold kept before the shields charge (`shield_charge_energybank_threshold`)                                                                                                                      | 0.25. The code default decides: `PlayerEntity.m:2606` reads it with `defaultValue:0.25`, while the comment in `global-settings.plist:20-26` says "Default: 0.0" and the commented-out example is 0.75 (RESEARCH F9)                                                    | `PlayerEntity.m:2606`                                                                                             | `tests/sim/combat/shields.test.ts`                                                                                                                                  |
| Cabin temperature: cooling factor, maximum, minimum, player heat insulation                                                                                                                                      | 0.1, 256, 60, 1                                                                                                                                                                                                                                                        | `ShipEntity.h:63`, `:69`, `:70`, `PlayerEntity.m:1531`                                                            | `tests/sim/combat/constants.test.ts`, `tests/sim/combat/shields.test.ts`                                                                                            |
| Cabin heat per point of energy damage (`SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR`)                                                                                                                                      | 0.5: the macro is `mass > 400000 ? 200000 / mass : 0.5` and the Cobra mass is 214,737.6875                                                                                                                                                                             | `ShipEntity.h:67`                                                                                                 | `tests/sim/combat/constants.test.ts`                                                                                                                                |
| Scanner range, ident acquisition range                                                                                                                                                                           | 25,600 m, 25,500 m (100 m shorter than the range at which the target is lost)                                                                                                                                                                                          | `Entity.h:49`, `Universe.m:5653`                                                                                  | `tests/sim/combat/constants.test.ts`, `tests/sim/combat/ident.test.ts`                                                                                              |
| Laser shot lifetime (`kLaserDuration`)                                                                                                                                                                           | 0.09 s                                                                                                                                                                                                                                                                 | `OOLaserShotEntity.m:36`                                                                                          | `tests/sim/combat/constants.test.ts`, `tests/render/laser-shots.test.ts`                                                                                            |
| NPC flight model: thrust factor, stick roll and pitch rates, reversal factor, centred-stick factor, hyperspace decay factor                                                                                      | 5, 2 and 4 per second, 4, 2 and 32                                                                                                                                                                                                                                     | `ShipEntity.h:46`, `ShipEntity.m:7021-7039`, `PlayerEntity.h:296`                                                 | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/flight.test.ts`                                                                                                   |
| NPC flight defaults of a record without the keys: maximum speed, roll, pitch and thrust                                                                                                                          | 160, 2.0, 1.0 and 15.0; the nine stock records author all four                                                                                                                                                                                                         | `ShipEntity.m:263-270`                                                                                            | `tools/oolite-ingest/convert/npc-ships.test.ts`, `tests/sim/npc/constants.test.ts`                                                                                  |
| Navigation aim: precision, aim cosine ceiling, off-course pitch fallback, pitch-over cosine                                                                                                                      | 0.9025, 0.99999, 0.01, 0.707                                                                                                                                                                                                                                           | `ShipEntity.m:9466`, `:9488-9490`, `:9564`, `:9513`                                                               | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/track.test.ts`                                                                                                    |
| Fly to destination and face: ETA speed factor, fly-to frustration limit, face frustration limit                                                                                                                  | 0.51, 15 s, 15 s over the maximum pitch rate                                                                                                                                                                                                                           | `ShipEntity.m:5085`, `:5124`, `:4945`                                                                             | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/navigation.oracle.test.ts`                                                                                        |
| Target tracking: squared loss range, AI reaction time, sample gate                                                                                                                                               | 1.5625 of the scanner range squared (1.25 ranges of 25,600 m), 1.5 s, 60 ticks                                                                                                                                                                                         | `ShipEntity.m:8706`, `ShipEntity.h:136-137`, `ShipEntity.m:5444-5449`                                             | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/target.test.ts`, `tests/sim/npc/tracking-curve.test.ts`                                                           |
| Proximity and avoid collision: pair trigger squared factor, minimum alerting mass, avoid desired range factor                                                                                                    | 16 (four radii), 2,000 kg, 10 radii                                                                                                                                                                                                                                    | `Universe.h:99-101`, `CollisionRegion.m:304-312`, `ShipEntity.m:6107`, `:5931`                                    | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/proximity.test.ts`                                                                                                |
| Flee: evasive jink z, evasive aspect threshold, evasive chance                                                                                                                                                   | 400, 0.9995, 0.15                                                                                                                                                                                                                                                      | `ShipEntity.m:9098`, `ShipEntityAI.m:383-388`                                                                     | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/flee.test.ts`                                                                                                     |
| Attack dispatcher: nearby share of the weapon range, sniper entry range, desired-range draw, range of a ship with no weapon                                                                                      | 0.035, 12,500 m, 1250 u + 750 m, 0 m                                                                                                                                                                                                                                   | `ShipEntity.h:56`, `ShipEntity.m:4160`, `ShipEntityAI.m:354`, `ShipEntity.m:443-466`                              | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/attack-dispatch.test.ts`                                                                                          |
| Escort: pattern spacing factor, form-up speed slope per second of ETA, frustration limit                                                                                                                         | 3, 0.05, 15 s                                                                                                                                                                                                                                                          | `Resources/Scripts/oolite-global-prefix.js:174-175`, `ShipEntity.m:5011`, `:5035`                                 | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/escort-refresh.test.ts`                                                                                           |
| Approach aspect zero snap: a Wegolite addition, not an Oolite number                                                                                                                                             | 1e-12                                                                                                                                                                                                                                                                  | none (Oolite's exact basis vectors give 0, `ShipEntity.m:4100`, `:3977`, `:4164`)                                 | `tests/sim/npc/constants.test.ts`, `tests/sim/npc/attack-dispatch.test.ts`                                                                                          |
| Pod survival: start chance, step after a survivor, floor, pod limit                                                                                                                                              | 70 %, 30, 10, 15                                                                                                                                                                                                                                                       | `ShipEntity.m:7823-7841`                                                                                          | `tests/sim/world/debris.test.ts`                                                                                                                                    |
| Pod and plate kick and jitter: speed range, speed scale, jitter range                                                                                                                                            | 200 (kick `0.1 x (rand % 200 - 100)` m/s per axis), 0.1, 7 (-3 to 3 m)                                                                                                                                                                                                 | `ShipEntity.m:7820`, `7852-7858`                                                                                  | `tests/sim/world/debris.test.ts`                                                                                                                                    |
| Alloy count mass unit, wrecks per kill                                                                                                                                                                           | 6000 (`sqrt(sqrt(mass / 6000))`), at most 3                                                                                                                                                                                                                            | `ShipEntity.m:7916`, `8050-8055`                                                                                  | `tests/sim/world/debris.test.ts`                                                                                                                                    |
| Wreck lifetime terms (energy is half the lifetime)                                                                                                                                                               | `750 randf + 250 i + 100`, so energy 50 to 675                                                                                                                                                                                                                         | `ShipEntity.m:8063-8064`                                                                                          | `tests/sim/world/debris.test.ts`                                                                                                                                    |
| Wreck mass and rescale                                                                                                                                                                                           | 0.1 x the victim's mass x (0.75 + 0.5 randf), radius scaled by the cube root of the mass ratio                                                                                                                                                                         | `Universe.m:5502-5505`                                                                                            | `tests/sim/world/debris.test.ts`                                                                                                                                    |
| Wreck burn-down: start temperature, cooling, damage threshold                                                                                                                                                    | 1000 K, falling 10 per second, energy drained `dt x temperature` while above 256 (7 to 82 ticks at 120 Hz)                                                                                                                                                             | `Universe.m:5514-5515`, `ShipEntity.m:2254-2272`                                                                  | `tests/sim/world/debris.test.ts`                                                                                                                                    |
| Blast: momentum factor, range factor, distance floor                                                                                                                                                             | 0.125 x mass, 2.5 x the victim's radius, 0.1                                                                                                                                                                                                                           | `ShipEntity.m:8123-8126`, `7680-7698`                                                                             | `tests/sim/world/debris.test.ts`                                                                                                                                    |
| Debris cap thresholds against `MAX_ENTITIES` 256: pods and plates, wreckage                                                                                                                                      | 243.2 (spawn while at most 243 live), 128 (while at most 127 live)                                                                                                                                                                                                     | `ShipEntity.m:7939`, `8047`                                                                                       | `tests/sim/world/debris-cap.test.ts`                                                                                                                                |
| Fragment chance default, pod and plate energy                                                                                                                                                                    | 0.9 (`fragment_chance`), 1 of 1 with no recharge                                                                                                                                                                                                                       | `ShipEntity.m:372`                                                                                                | `tests/sim/world/debris.test.ts`                                                                                                                                    |
| Explosion cloud particles per explosion                                                                                                                                                                          | 10 (Oolite's cap at a detail level up to shaders; the plist says 25)                                                                                                                                                                                                   | `OOExplosionCloudEntity.m:60-73`                                                                                  | `tests/render/explosion-layer.test.ts`                                                                                                                              |
| Explosion flash: duration, alpha, growth factor, minimum growth                                                                                                                                                  | 0.4 s, 0.5, 150 per metre of radius per second, 600 per second                                                                                                                                                                                                         | `OOFlashEffectEntity.m:33-38`, `55-60`                                                                            | `tests/render/explosion-layer.test.ts`                                                                                                                              |
| Credit digit grouping                                                                                                                                                                                            | groups of 3 integer digits from the right, from 5 integer digits up, separator U+00A0 (non-breaking space): 9999.9 ₢, 10 000.0 ₢                                                                                                                                       | `descriptions.plist:80-83`, `oolite-locale-functions.js:60-92` (`Resources/Config`, `Resources/Scripts`)          | `tests/ui/station-status.test.ts`                                                                                                                                   |
| Chart blob factor, blob floor, GUI width, chart width at maximum zoom                                                                                                                                            | 0.0017 per km of planet radius, 0.5 GUI units, 480 GUI units, 64 chart-x units (zoom 4 is the galactic chart)                                                                                                                                                          | `GuiDisplayGen.m:1789-1792`, `GuiDisplayGen.h:39`, `PlayerEntity.h:94-97`                                         | `tests/ui/chart-model.test.ts`                                                                                                                                      |
| HUD geometry: one hud.plist unit in design px; scanner, compass, aegis, status light; bar width and surround; message area and rows                                                                              | 2.25 (1080 / 480); scanner 288 x 64 at (0, 68); compass size 28 at (132, 32); aegis 24 x 24 at (-132, 32); status light 8 x 8 at (-108, 32); bars 80 wide, surround 2 out; message area 252 x 140 at (128, -60), rows of 14 (all `y_origin = -1` but the message area) | `Resources/Config/hud.plist:19-59`, `67-198`, `368-380`, `HeadUpDisplay.h:57`, `src/SDL/MyOpenGLView.m:498-505`   | `tests/ui/hud-model.test.ts`, `tests/hud/projection.test.ts`, `tests/hud/clock-lines.test.ts`                                                                       |
| HUD text capital height per Oolite font cell (`drawCharacterQuad` lifts the quad 1/8 cell, `HeadUpDisplay.m:3607`); placement in the cell; the cell of each text                                                 | 0.5625 (36 of 64 texture rows; Oolite 1280x720 caps 8-9, 11 and 12-13 px in 10, 12 and 14-unit cells); centred 2/3 up the cell; legends at their hud.plist cells, E1-E4 12, readouts 10, W 2 blips; narrower than Oolite (owner 2026-11-18); messages sized by width   | `HeadUpDisplay.m:3599-3619`, `2019-2021`, `4127`; `Resources/Textures/oolite-font.png`; `hud.plist:244-350`       | `tests/hud/cap-text.test.ts`                                                                                                                                        |

Reading of ROADMAP Phase 10 criterion 2: "reproduce Oolite's mass within a stated tolerance" is read as Oolite's algorithm run on the pinned meshes, re-derived independently in float64 within a relative 1e-6, plus the community VariableMasslock table to the whole tonne, because no Oolite runtime is available to observe the mass. Owner answer on this reading: accepted, 2026-11-14 (plan 10-03), on condition that it is easy to change later. It is revisable: a real-Oolite check (for example a tiny out-of-repo test script logging `ship.mass` of the Coriolis station and the buoy to Latest.log) is a deferred follow-up task after the phase, and if it disagrees only the `CORIOLIS_STATION_MASS` constant, its test pins and this paragraph change. The real-Oolite check ran in quick task 261117-jji on 2026-11-17 and agreed for every measured mass, so no constant, pin or paragraph changed.

Tolerances and what is not reproduced: the golden values are bit-exact float32. The worked examples are re-derived independently in float64 from terminal-node counts and the mesh radius and agree within a relative 1e-6. Nine hull masses equal the community VariableMasslock table (wiki.alioth.net) when divided by 1,000 and rounded to whole tonnes. No Oolite runtime was available when the composites were derived, so the Coriolis and buoy composites were derived from the source; they were then observed in a running Oolite (quick task 261117-jji, next paragraph). The source constants 455,223,200 (`ShipEntity.m:12504`; the computed mass is 1.1324 times it, the hull alone 0.5023 times) and 185,580 (`PlayerEntity.m:191-192`, the Cobra fallback; the computed mass is 15.71 % above it) predate the current meshes and are not reproduced.

Measured in a running Oolite (quick task 261117-jji, 2026-11-17): the session ran on the headless Oolite 1.93.1-255 reference (`tools/oolite-reference/README.md`). A throwaway OXP kept outside the repository logged `ship.mass`, `ship.collisionRadius` and the solid subentities of each ship at `startUpComplete`, after the system was populated (Lave, docked). Mass and collision radius are `GLfloat` in Oolite (`Entity.h:103`, `:138`) and the JS getters widen them to a double exactly (`OOJSEntity.m:193-194`, `:213-214`), so the comparison with Wegolite's float32 values is bit-exact. All 13 masses are equal, bit for bit. The blockage radius is `sqrt(0.1 x mass)`.

- Coriolis station (`coriolis-station`, the main station of Lave): Oolite 515,483,904, Wegolite 515,483,904 (`CORIOLIS_STATION_MASS` too), EQUAL. Subentities: faceplate 58,255,096, tris 220,998,576, dock 7,579,321. Blockage radius 7,179.7 m.
- Navigation buoy (`buoy`): Oolite 698,691.1875, Wegolite 698,691.1875, EQUAL. Its one solid subentity (`oolite_buoy_subentity`) has mass 7,646.7861328125. Blockage radius 264.3 m.
- Witchpoint buoy (`buoy-witchpoint`): Oolite 698,691.1875, Wegolite 698,691.1875 (the `buoy` entry), EQUAL, the same as the navigation buoy as expected. Blockage radius 264.3 m.
- Cobra Mk III (`cobra3-player`): Oolite 214,737.6875, Wegolite 214,737.6875 (`oolite_template_cobra3-player`), EQUAL. Blockage radius 146.5 m.
- Adder (`adder`): Oolite 16,045.4931640625, Wegolite 16,045.4931640625, EQUAL. Blockage radius 40.1 m.
- Cobra Mk I (`cobramk1`): Oolite 52,291.8359375, Wegolite 52,291.8359375, EQUAL. Blockage radius 72.3 m.
- Gecko (`gecko`): Oolite 24,669.99609375, Wegolite 24,669.99609375, EQUAL. Blockage radius 49.7 m.
- Krait (`krait`): Oolite 93,291.40625, Wegolite 93,291.40625, EQUAL. Blockage radius 96.6 m.
- Mamba (`mamba`): Oolite 35,806.9921875, Wegolite 35,806.9921875, EQUAL. Blockage radius 59.8 m.
- Moray (`moray`): Oolite 51,203.4375, Wegolite 51,203.4375, EQUAL. Blockage radius 71.6 m.
- Shuttle (`shuttle`): Oolite 11,317.5634765625, Wegolite 11,317.5634765625, EQUAL. Blockage radius 33.6 m.
- Sidewinder (`sidewinder`): Oolite 25,087.62109375, Wegolite 25,087.62109375, EQUAL. Blockage radius 50.1 m.
- Viper (`viper`): Oolite 34,040.6796875, Wegolite 34,040.6796875, EQUAL. Blockage radius 58.3 m.
- Collision radii: the nine NPC radii and the Cobra Mk III radius (72.69734954833984, `PLAYER_COLLISION_RADIUS_M`) are EQUAL to the compiled values. The Coriolis radius 779.3702392578125 m (it includes the dock subentity) and the buoy radius 59.13554763793945 m (both buoys) are also EQUAL: the content build compiles them by the subentity rule (E-89) into `src/content/generated/ships-client.json`, and the layout uses them (`src/sim/world/layout.ts:71-73`, pinned by `tests/sim/layout.test.ts`; quick task 261117-k1l).

Mass lock and jump blockage measured in a running Oolite (quick task 261117-lka, 2026-11-17): the session ran on the headless Oolite 1.93.1-255 reference (`tools/oolite-reference/README.md`). A throwaway OXP kept outside the repository stopped the player at an empty point 300 km from the witchpoint, spawned one real entity at a time, froze it at an exact centre-to-centre offset just inside or just outside the boundary, and logged the exact squared distance with each result. The mass lock is `player.alertMassLocked`, the flag the torus refusal reads (`PlayerEntity.m:2751`, `:2976-2977`, `:3990-3993`), sampled five times over at least 0.5 s after a 1 s settle. The blockage is the `playerJumpFailed` reason at the end of a 5 s countdown; the fuel was set to 0 after the countdown began, so an unblocked jump ended as "insufficient fuel" and the player never left Lave. Every trial was stable with no other ship within 30 km, and a control trial in each family (no entity) was unlocked and clear. The 20 trials and 2 radii are classified against Wegolite's predicates applied to the measured squared distance; the full table is in the quick task's SUMMARY.

- NPC mass lock (krait, `CLASS_NEUTRAL`) at 25,599, 25,600 and 25,601 m: locked, unlocked, unlocked in Oolite, and the same in Wegolite (`src/sim/world/ship-field.ts:123-124`, strict `<`). SAME. The strict outer gate for every ship is `PlayerEntity.m:2936`.
- Station mass lock (a spawned `coriolis-station`, `CLASS_STATION`) at 25,599, 25,600 and 25,601 m: Oolite gives locked, unlocked, unlocked; Wegolite at 42c4394 gave locked, LOCKED, unlocked. DIFFERS at exactly 25,600 m (squared distance 655,360,000, exact), SAME at the other two. Cause: a station is a ship, so the strict outer gate `zero_distance < SCANNER_MAX_RANGE2` (`PlayerEntity.m:2936`) decides, and the inclusive inner `<=` (`:3037`) never changes a ship's result. Wegolite's station rule was inclusive (`src/sim/flight/torus.ts:103`). Quick task 261117-mne fixed it on the owner's decision of 2026-11-17: `src/sim/flight/torus.ts:103` is now strict `<`, so Wegolite now gives locked, unlocked, unlocked, SAME.
- Buoy (`CLASS_BUOY`): never locks, at 1,000 and 25,599 m. SAME.
- Planet and sun: at 2r - 1 and 2r + 1 m (82,319 and 82,321 m) the planet is locked and unlocked; at sqrt(2) r - 1 and sqrt(2) r + 1 m (119,428.05 and 119,430.05 m) the sun is locked and unlocked. Wegolite's rules agree in all four trials, SAME. The planet radius is 41,160 m in Oolite and in Wegolite, EQUAL. The sun radius is 84,449.09375 m in Oolite (float32) and 84,449.095459 m compiled, relative difference 2.0e-8, ROUNDING.
- Blockage at the blockage radius minus and plus 1 m: the krait (96.6 m, mass 93,291.40625) is blocked at 95.6 m and clear at 97.6 m, SAME. The Coriolis (7,179.7 m, mass 515,483,904) is blocked at 7,178.7 m and clear at 7,180.7 m, SAME. The navigation buoy (264.3 m, mass 698,691.1875) is blocked at 263.3 m and clear at 265.3 m in Oolite. Wegolite blocked on no buoy until Phase 18 (KNOWN at the time, owner decision 2026-11-14, option A); since plan 18-07 both live buoys block with this mass, and `tests/sim/hyperspace-blockage.test.ts` pins 263.3 m refused and 265.3 m committed: SAME. The check runs at countdown end only, centre to centre, over every ship whatever its scan class (`ShipEntity.m:12498-12531`), so a buoy counts there although it never mass-locks.

### Phase 18 real-Oolite measurements (PD-03)

Plan 18-20 checked the three research claims of Phase 18 on the headless Oolite 1.93.1-255 reference (`tools/oolite-reference/README.md`, AppImage SHA256 `4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`), from Wegolite `ebe8e23` with a clean tool tree, on 2026-11-19. Each session started a new commander at Lave, launched through `player.ship.launch()` and held the engine at rest with `player.ship.maxSpeed = 0`. A throwaway world-script OXP kept outside the repository did the measuring and logged with the two-argument `log()`. The OXP, the steps files and every output stayed under `/tmp`. A session id is the `start_utc` line of its `session.txt`. Every session ended with `exit=0 container_exit=0`. Verdicts: SAME, KNOWN (an existing recorded divergence), MISMATCH, or INCONCLUSIVE. INCONCLUSIVE means the quantity could not be measured cleanly; it opens no todo and stops nothing, and it becomes an owner question at plan 18-12.

**Dock mouth (claim 1).** One `edge: false` fixture of `tests/oracles/combat/geometry/fixtures/dock-mouth.json` per winning part, with one measured shot per session. Shooting the main station makes Oolite mark the shooter and launch police (`StationEntity.m:1128-1141`), so each session fired exactly one pulse-laser shot and ended. Method:

- Every frame callback took the body's position and its right, up and forward vectors. It converted the fixture ray from the model frame to world space as `P + x R + y U + z F`, the frame `doesHitLine` uses (`ShipEntity.m:1323-1330`). It turned the player onto the ray direction and put the forward weapon origin on the ray start. The origin is the logged `weaponPositionForward`, (-0.0961, 0.9367, 43.4655), rotated by the ship's basis (`Universe.m:5585`). The callback zeroed the velocity and put a fresh `barrel` (radius 5.7986 m, AI `oolite-nullAI.js`, energy raised to 1,000 so a hit leaves it alive) on the ray at the bracket distance.
- Frame callbacks run after `[UNIVERSE update:]` (`GameController.m:348-355`). The player is first in the update order (its `zero_distance` is 0, `Entity.m:858`), and it fires inside its own update (`PlayerEntity.m:2405`, `PlayerEntityControls.m:1184-1186`). So the shot of frame N+1 uses exactly the pose sample of callback N, before the body moves.
- The steps file pressed `a` once after the probe logged that it was ready. The probe detected the shot as a rise in `laserHeatLevelForward` and then removed the forward weapon. The victim is the entity named by the `shipAttackedOther` event of the shot frame (`ShipEntity.m:2694`); the energy drop confirms it where it is visible.
- Distance by bracket: in one session the target sat at the expected distance minus the tolerance minus the target radius minus 1 m, and the beam had to reach it. In the other it sat at the expected distance plus the tolerance plus the target radius plus 1 m, and the body had to stop the beam first. For the `none` fixture a single session put the target beyond the station.
- The JavaScript API does not expose the beam length. `OOLaserShotEntity` keeps it in `_range` and its collision radius (`OOLaserShotEntity.m:142-146`), but a laser shot is not visible to scripts (the `Entity` default `isVisibleToScripts` NO, `EntityOOJavaScriptExtensions.m:39-42`, with no override), so the bracket is the measurement.

Check of every measured session: the weapon origin was at most 0.0008 m off the ray in the body frame of the firing frame, and the player's forward vector matched the ray direction within 2e-7. The engine speed was 0, the target had not moved (0 m) and was `STATUS_IN_FLIGHT`, and no other ship was within 200 m of the ray. The frame time was 0.15 to 0.18 s (llvmpipe).

| Fixture                            | Expected (winner, distance, tolerance) | Session (`start_utc`) | Target at | Observed victim  | Verdict |
| ---------------------------------- | -------------------------------------- | --------------------- | --------- | ---------------- | ------- |
| `dock-slot-through-dock-back-wall` | dock, 2,749.7439 m, 29.2150 m          | 2026-11-19T19:26:14Z  | 2,713.730 | barrel (reached) | SAME    |
| `dock-slot-through-dock-back-wall` |                                        | 2026-11-19T19:27:17Z  | 2,785.757 | station          | SAME    |
| `dock-faceplate-beside-slot-y`     | faceplate, 2,503.3400 m, 31.1858 m     | 2026-11-19T19:27:52Z  | 2,465.356 | barrel (reached) | SAME    |
| `dock-faceplate-beside-slot-y`     |                                        | 2026-11-19T19:28:28Z  | 2,541.324 | station          | SAME    |
| `dock-hull-alone-from-minus-x`     | hull, 2,500.0000 m, 29.1858 m          | 2026-11-19T19:29:03Z  | 2,464.016 | barrel (reached) | SAME    |
| `dock-hull-alone-from-minus-x`     |                                        | 2026-11-19T19:29:44Z  | 2,535.984 | station          | SAME    |
| `dock-far-miss`                    | none                                   | 2026-11-19T19:30:19Z  | 3,000.000 | barrel (reached) | SAME    |
| `dock-buoy-hull-back-face`         | buoy hull, 2,955.9680 m, 6.7909 m      | 2026-11-19T19:30:54Z  | 2,942.378 | barrel (reached) | SAME    |
| `dock-buoy-hull-back-face`         |                                        | 2026-11-19T19:31:29Z  | 2,969.558 | buoy (hull)      | SAME    |

Each pair puts Oolite's hit, as `isHitByLine` returns it, inside the fixture's window widened by the target's radius and 1 m. On the slot ray, the beam reached a target 286.27 m in front of the station centre, inside the slot, and was stopped before 214.24 m. Only the dock's back wall (z = 250.26) lies between those two points; the faceplate and hull fronts (z of about 500) are passed and the hull's back face (z = -500) is never reached. In the buoy pair the buoy's own energy fell by 14.64 (15 less recharge), not by the 1 % bleed-through of a subentity hit, so the hull took the shot. Nine measured sessions, nine station or buoy shots, nine SAME.

Two earlier slot sessions (2026-11-19T19:23:29Z and 19:25:13Z) were discarded as INCONCLUSIVE set-ups, with no verdict. A barrel left in the slot was taken in by the dock within one or two frames (`DockEntity.m:695-713`), so it could not be hit at the firing frame and the shot went to the station. The accepted method above spawns a fresh barrel at every frame callback. It is hittable at the next shot because the player fires before the dock's collision pass.

**Player-against-buoy ram (claim 2, PD-02).** The probe found the navigation buoy (`buoy`, mass 698,691.1875, radius 59.1355, energy 250, thrust 100). Its subentity `oolite_buoy_subentity` has mass 7,646.7861, radius 25.8226 and energy 200. The probe removed every other ship within 30 km. It then held the player for 1 s, 150 m from the buoy's centre on one of the buoy's axes, nose to the buoy, with full shields (128/128) and energy, engine speed 0 (`maxSpeed = 0`) and zero velocity. Then it set the velocity toward the buoy (the `velocity` setter is `setTotalVelocity`, `ShipEntity.m:11164-11167`). Every frame callback logged the frame time, the engine speed, the player's position, velocity, shields and energy, and the buoy's position, velocity and energy, plus the subentity's energy, until 3 s after the first `shipCollided`. The engine speed was 0 on every frame before contact in every session. A scratch script under `/tmp`, run in the `test` container, fed `collideWithShipReference` (18-03) each contact. Its inputs were the state of the callback before the contact (`manageCollisions` runs at the start of the player's update, `PlayerEntity.m:2401-2402`, before it moves) and the contact frame's time delta (the C's `10 x getTimeDelta`, `ShipEntity.m:11138`). The script followed the reference with the player's braking (move, then brake) and the buoy's (brake, then move), and compared the result with the next callback. The fixtures `collide-player-buoy-100` and `collide-player-buoy-350` were not changed.

| Session (`start_utc`) | Approach                     | Centre distance, first contact frame (frame before) | Closing speed | Frame time |
| --------------------- | ---------------------------- | --------------------------------------------------- | ------------- | ---------- |
| 2026-11-19T19:34:26Z  | 100 m/s along buoy +forward  | 91.607 m (105.125 m, no contact)                    | 79.7814 m/s   | 0.16211 s  |
| 2026-11-19T19:35:46Z  | 100 m/s along buoy +right    | 79.827 m (92.154 m, no contact)                     | 75.0558 m/s   | 0.16053 s  |
| 2026-11-19T19:36:20Z  | 350 m/s along buoy +forward  | 88.139 m (150.000 m, start)                         | 344.3442 m/s  | n/a        |
| 2026-11-19T19:39:19Z  | 350 m/s, repeat with logging | 92.946 m (150.000 m, start)                         | 344.7836 m/s  | 0.15611 s  |
| 2026-11-19T19:36:51Z  | 350 m/s, player energy 5,000 | 87.211 m (150.000 m, start)                         | 344.2593 m/s  | 0.17735 s  |

The closing speed is below the set speed because the drift is braked at 32 m/s² until contact (`PlayerEntity.m:3387-3388`). In every session, frames with the centres well inside the 131.83 m sphere sum (for example 119.2 m and 105.1 m) had no contact; the hulls first touched between 79.8 m and 92.9 m. This is the real-hull octree-against-octree evidence (Cobra Mk III against the buoy, nose first, the buoy at whatever spin it had) that plan 18-18 compares with its stage. Every contact was with the buoy's hull. Its subentity's energy stayed at 200 while the buoy's fell, so the verdict uses the whole-buoy rows.

Plan 18-18 compared its stage with these sessions. It flew the player nose first along the buoy's forward and right axes at the observed closing speeds (79.7814 and 75.0558 m/s), with the stage's tumble at several start times. Along forward the stage first touched at 95.48 to 100.80 m, inside Oolite's bracket (91.607 m touching, 105.125 m not). Along right, with the player's roll fixed by the probe's pose, it first touched at 99.96 to 100.59 m, outside Oolite's bracket (79.827 m touching, 92.154 m not). The first-contact distance along right depends on the player's roll about its nose and on the buoy's spin about that axis. Scanning both in the stage's octree test gives 81.40 to 103.25 m along right, which contains Oolite's bracket (for example 87.7 m at a 90 degree roll and 81.4 m at 270 degrees), and a constant 103.25 m along forward. The sessions did not log the player's roll or the buoy's spin at contact, so this comparison cannot settle the remaining difference. The damage at the observed speeds equals the reference's (88.944 and 27.336; 78.720 and 24.194).

First contact at 100 m/s, along forward (along right in brackets), the reference at the observed closing speed and frame time against Oolite:

- Player damage: reference dam1 88.944 (78.720). Oolite's shields plus energy fell by 88.620 (78.399), all on the forward shield. The gap equals the shield recharge in that frame, 2/s x 0.162 s. SAME.
- Buoy damage: reference dam2 27.336 (24.194). The buoy's energy fell by 27.012 (23.873), the gap again one frame of recharge. SAME.
- Player rebound: the reference gives -v1a = -143.910 m/s (-135.386) along the line of centres. After the frame's braking the player's velocity changed by -138.722 m/s (-130.249), and Oolite's changed by -138.722 (-130.249). Speed after: 58.941 (55.193) in both. SAME.
- Player nudge: `self += loc x t x v1a`, toward the buoy (`ShipEntity.m:11140-11141`). It moved the player 233.291 m (217.340 m) and left it 1.95 m (7.34 m) from the buoy's centre. Position error against the reference: 0.000 m. SAME.
- Buoy rebound: +v2b = 79.781 m/s (75.056). In the same frame the buoy's thrust brakes it to 0 (`5 x 100 x 0.162` = 81 m/s), as the reference does: observed speed 0. SAME.
- Buoy displacement: nudge `t x v2b` = 129.333 m (120.490 m), observed 129.333 m (120.490 m), position error 0.000 m. SAME.

After the first contact the player sits inside the buoy, and the C resolves it over further contacts. There were two more full contacts, one 1 m/s anti-conjoin contact and frames of zero relative speed. The reference reproduced every full contact with 0.000 m position error. The one step it does not reproduce with the player as self is the anti-conjoin step, and the C explains it. The player's own call returned early because the pair was separating faster than 1 m/s (`ShipEntity.m:11080`). That early return skips the removal from the buoy's collision list (`:11149-11150`). The buoy's call in the same frame then saw zero relative speed after the player's braking and pushed the player away at 1 m/s (`:11096-11099`). Observed: 1.000 m/s. Total buoy displacement until it stopped: 107.171 m (96.776 m), equal to the sum of the reference's per-contact displacements. The carry depends on the frame time, because the nudge is 10 frame times of the contact speed. At the reference's 0.16 s frames one contact moves the buoy about 130 m. At Wegolite's fixed 1/120 s the same C gives the fixture's 8.333 m nudge plus 9.583 m of braked drift, about 17.9 m in total.

350 m/s: in the real session the player is destroyed. Reference dam1 is 1,661.149 against energy 256, so `selfDestroyed` (`:11111`). The buoy is destroyed too (dam2 510.542 > 250), and both are gone at the next callback; `shipDied` reported "scrape damage" from the buoy. The fixture masks the player's death (`destroyable: false`; the player's death belongs to Phase 20). The session with the player's energy raised to 5,000 reproduces that contract. Oolite's shields plus energy fell by 1,655.391 against reference dam1 1,656.101 (the gap is one frame of shield and energy recharge). The buoy was destroyed (reference dam2 508.991 > 250). There was no nudge. The player's velocity changed only by the frame's braking: reference speed 338.584 m/s, observed 338.558 m/s, position error 0.005 m. The residual 0.026 m/s is 0.008 % and is not attributed; the same frame also carries the buoy's explosion, which this comparison does not model. With the other ship destroyed, the C reverses `vel1a` (`:11130-11133`), so there is no net rebound. SAME.

Verdict for the buoy ram: SAME on every quantity (closing speed, damage, both rebounds, displacement, contact distance), with the engine speed 0 before every contact. This settles the three figures plan 18-03 disputed, in the oracle's favour:

- PD-02's "about 10 m after a 100 m/s ram" counts only the braked drift. The C adds the nudge, which Oolite applies.
- "About 122 m after 350 m/s" does not happen. A 350 m/s ram destroys the buoy (and, unmasked, the player).
- "Rebounds at 631 m/s" does not happen. When the buoy dies the player's net velocity change is 0.

These are planning-text figures, not fixtures, so they open no mismatch. PD-02's decision (buoys move when rammed) stands.

**Pod and plate blockage (claim 3, D-08 evidence).** A real pod (blockage radius 9.97 m) or plate (5.23 m) cannot be measured directly. Its centre would have to lie deep inside the Cobra's 72.7 m hull, and the collision would move or destroy it before `witchJumpChecklist` runs. What needs evidence is the rule itself: Oolite blocks on `k x mass > d^2 && d^2 < SCANNER_MAX_RANGE2` with `k = 0.1`, over every ship except the player, whatever its scan class (`ShipEntity.m:12498-12531`). That would include cargo. The probe therefore defined a surrogate in its own `shipdata.plist`: `wegolite-pd03-heavy-barrel`, `like_ship = "barrel"`, `scan_class = "CLASS_CARGO"`, `density = 1611`. The mass is `density x 20 x octree volume` (`ShipEntity.m:417-419`); the logged mass was 1,600,319.125 (`CLASS_CARGO`, radius 5.80 m), so R = sqrt(0.1 x 1,600,319.125) = 400.040 m. The method is quick task 261117-lka's:

- Put the player 300 km from the origin (P0 = 119595, -275131, 0), with no other ship within 30 km.
- Set the nearest system as the target (55, Leesti) and call `beginHyperspaceCountdown(5)`, then set the fuel to 0. An unblocked jump then ends as "insufficient fuel" (`PlayerEntity.m:6544-6560` checks blockage first).
- Keep the surrogate parked 100 km away until 3.5 s into the countdown, then hold it at the trial distance on every frame.
- Log the `playerJumpFailed` reason, with the surrogate's distance and movement, on the completion frame.

At both trial distances the surrogate is far outside both hulls and well inside scanner range, so only the blockage rule decides.

| Session (`start_utc`) | Distance (centre to centre)    | d^2         | 0.1 x mass | Oolite                          | Expected    | Verdict |
| --------------------- | ------------------------------ | ----------- | ---------- | ------------------------------- | ----------- | ------- |
| 2026-11-19T19:41:40Z  | 0.95 R = 380.038 m (moved 0 m) | 144,428.801 | 160,031.91 | blocked                         | blocked     | SAME    |
| 2026-11-19T19:42:15Z  | 1.05 R = 420.042 m (moved 0 m) | 176,435.184 | 160,031.91 | not blocked (insufficient fuel) | not blocked | SAME    |

Both countdowns completed (4.88 s and 4.85 s after the countdown began, the surrogate placed from 3.55 s and 3.51 s). Neither the player nor the surrogate moved, and no other ship was within 30 km. A cargo-class ship blocks the jump in Oolite by mass and distance alone. Applied to the compiled masses, the same measured rule makes a cargo pod (mass 993.37006, `collide-player-pod-100`) block within 9.967 m of the player's centre and an alloy plate (mass 273.4375, `collide-player-plate-100`) within 5.229 m. This is the observed behaviour behind D-08's divergence row, which plan 18-07 records: Wegolite's pods and plates never block. The difference can matter only while a pod or plate centre sits inside the Cobra's hull, where Oolite's collision has already acted. Verdict on the pod and plate blockage claim: SAME for the rule. The Wegolite side is the KNOWN divergence D-08.

## Open items

These are gaps the table cannot close on its own. Each one is stated so a reviewer can check it.

- **Planet noise budget (E-26).** E-26 quotes only the PlanetMix thresholds. The noise field is generated under a fixed budget in `src/render/planet-noise.ts:40-48` (six surface octaves, one relief tap, one cloud octave, nine evaluations). No excerpt covers Oolite's noise generator, and no PROJECT.md Key Decisions row records the budget. The planet-surface row is therefore faithful for the colour classes only.
- **Aegis near-surface clause (E-09).** Oolite's `isNearPlanetSurface` clause (`src/Core/Entities/ShipEntity.m:6681-6682`) is not modelled. It can change the result only for a planet with a radius below about 250 m, where the 500 m surface band reaches past the 3x-radius test. The v1 layouts were not checked against every one of the 2,048 systems.
- **Torus mass lock, station branch (E-07).** E-07 quotes the planet branch only. The station check in `src/sim/flight/torus.ts:99-103` uses the scanner range and is not covered by an excerpt. Measured in a running Oolite (quick task 261117-lka): a station at exactly 25,600 m does not lock, and since quick task 261117-mne the station check is strict `<` as well, as Oolite's outer gate (`PlayerEntity.m:2936`) is for every ship (see the next bullet); 25,599 m locks and 25,601 m does not, as in Wegolite.
- **Station mass-lock boundary (resolved in quick task 261117-mne).** Quick task 261117-lka measured that Oolite does not lock a station at exactly 25,600 m (squared distance 655,360,000, exact), because the outer gate `zero_distance < SCANNER_MAX_RANGE2` (`src/Core/Entities/PlayerEntity.m:2936`) is strict for every ship, and a station is a ship (`src/Core/Entities/StationEntity.m:573`, `isShip = YES`). The inner `<=` at `PlayerEntity.m:3037` never decides for a ship. On the owner's decision of 2026-11-17, `src/sim/flight/torus.ts:103` uses `<`. `tests/sim/mass-lock.test.ts` and `tests/sim/torus.test.ts` pin 25,599 and 25,599.999 m locked and 25,600 and 25,601 m clear on exact geometry (station at the origin, squared distance asserted). The `src/sim/world/ship-field.ts` header comment, which called the inclusive rule faithful, was corrected.
- **NPC collision radius (E-33).** E-33 quotes `src/Core/OOMesh.m:1803-1822`, the running maximum and the `sqrtf`; the `magnitude2` line that feeds the maximum is `OOMesh.m:1801`, 22 lines from the `sqrtf` and so outside one 20-line excerpt. The subentity extension of the radius (`src/Core/Entities/ShipEntity.m:2028-2044`) is now ported for the client entries (E-89, quick task 261117-k1l); the NPC path still fails the build on a solid subentity: no NPC ship has one, so it is not exercised, and `computeShipRadii` fails the build if one appears.
- **Populator lane lengths (E-34).** E-34 quotes `src/Core/Universe.m:1796-1815`, from the `total` line through the `STATION_AEGIS` loop; the three lane lengths it divides by (`l1`, `l2`, `l3`, `Universe.m:1793-1795`) sit just above the 20-line cap and are not quoted. They are the lengths of the planet, planet-to-sun and sun vectors, as `locationByCode` in `src/sim/world/placement.ts` computes them. The other location codes of `locationByCode` (the orbits, `TRIANGLE`, the system regions) are not ported: the first populator uses five.
- **Docking computer TL, station override (E-13).** Oolite's docked-station override of the tech level (`src/Core/Entities/PlayerEntity.m:8229-8232`) is not modelled. The only `equivalent_tech_level` in the pinned data is on the rock-hermit template (`Resources/Config/shipdata.plist:3247`), and the Coriolis template (`Resources/Config/shipdata.plist:1690`) sets none, so the override never applies to the v1 station.
- **Missile trade-in price factor (E-17).** `PlayerEntity.m:9434-9435` scales a trade-in only when the station's price factor is below 1.0. The Coriolis template sets no `equipment_price_factor`, and `src/Core/Entities/StationEntity.m:601` defaults it to 1.0, so no scaling applies to the v1 station.
- **Octree leaf resolution (E-49).** Oolite reaches a solid leaf without testing the line against it, so a hit resolves at the cube of the array node that holds the leaf (`src/Core/Octree.m:361-366`). The port keeps that faithfully (plan 13-03, RESEARCH Pitfall 4) and does not tidy it, so a hit distance is the distance to a cell centre, not to the hull surface.
- **Ident key and message (E-53, E-54).** The ident rows follow Oolite. CONTEXT D-04 words the lifecycle as "pressing R again clears the lock" and D-03 asks for the target's name and class; the PROJECT.md rows that start "D-04, advisor-recommended deviation" and "D-03, advisor-recommended deviation" record the two readings and were confirmed by the owner on 2026-11-15.
- **Stations and buoys as laser and ident targets (E-48, E-118, E-52).** Phase 18 supersedes the row that starts "Statics are neither laser nor ident targets": since plan 18-04 a laser stops at the main station through Oolite's subentity rule (`src/Core/Entities/ShipEntity.m:1323-1357`; E-48 quotes its subentity loop, 1337-1354, within the 20-line cap), and the station only absorbs the hit. Oolite also lowers the main station's energy while the amount is below it (recharging 100 per second, `src/Core/Entities/StationEntity.m:1110-1160`), and when the station has a JS AI it marks a player who shoots it an offender (bounty 64, or 96 for an energy mine, raised by half for a shooter already at that bounty) and launches police (`src/Core/Entities/StationEntity.m:1128-1141`); Wegolite applies no legal or behavioural consequence in this phase. Since plan 18-05 the buoys are laser targets as well: 250 energy, recharging 2 per second while alive (E-56), destroyed once at 0 for the life of their world, at the layout position plus their per-world offset and the closed-form tumble (E-119, a divergence from Oolite's incremental `behaviour_tumble`). A destroyed buoy releases no debris (E-76, a divergence: Oolite's releases 3 wrecks and 0 to 3 plates). Since plan 18-15 the buoy's frangible subentity is ported (PD-01, E-120 to E-123): a hit routed to it puts 1 % on the buoy and the full damage on the subentity (200 energy, recharging 1 per second), the routing is sticky as in Oolite, and at 0 the subentity detaches without an explosion or debris (a divergence). Cargo pods and alloy plates are laser targets from the same plan and leave without an explosion (E-124, a divergence); wrecks are not targets. Since plan 18-06 ident locks the station, both buoys at their live position, pods and plates by Oolite's `canCollide` rule (E-52), with the layout radius as a static's collision radius; never a wreck, a destroyed buoy or a buoy's subentity, and a buoy destroyed on a tick loses its lock on that tick. Since plan 18-08 the player sees each buoy as it is (E-128): the scene, the scanner and the witchpoint compass read its live position, a destroyed buoy leaves the view and the scanner, and a detached subentity's mesh is hidden; a compass left on a destroyed witchpoint beacon turns to the planet (E-125), the manual cycle skips it (E-126), and a new world restores both buoys (E-127, a divergence: Oolite keeps a destroyed buoy through a dock and relaunch).
- **NPC fire has no recharge gate (E-56 and the NPC fire decision).** An NPC fires on every think of its AI through `ShipControl.fire`; it has no laser heat, no shot timer and no energy cost (CBT-15 owns autonomous NPC fire), so the only rate limit is the AI's own think interval (15 ticks for the test pilot). Only the hit and damage rule and the energy recharge (E-56) are ported.
- **Weapon-none ordering (E-36, E-37).** Oolite tests the temperature before it tests `isWeaponNone`; `fireGate` tests the empty mount first. A laser can only be removed while docked, where every temperature is reset to 0 (E-47), so a hot empty mount cannot occur and the order is not observable.
- **No browser evidence for the visuals.** The four views (not mirrored or clipped), the one-pixel laser shots and the ident frame placement are covered by unit tests only (`tests/render/launch-camera.test.ts`, `tests/render/laser-shots.test.ts`, `tests/hud/projection.test.ts`) and need a human look; the opt-in browser smoke (`tests/e2e/combat.spec.ts`) reads probe values, not pixels.
- **NPC steering excerpts cover one site per mechanic (E-57 to E-70).** The contract allows one Oolite path and range and at most 20 lines per row, so each of the fourteen rows quotes the one site that decides the mechanic. The other steering sites (the remaining attack sub-behaviours, flee and evasive action, the tracking curve's evaluation, the proximity call sites) are cited in the doc comments of `src/sim/npc/` and exercised by the 139 independent oracle fixtures under `tests/oracles/npc/`, not quoted here. The recorded divergences are the list of the PROJECT.md row that starts "Phase 14 recorded divergences from Oolite".
- **The steering oracle and the port read the same source.** Both were written from `ShipEntity.m` at the pinned commit by separate plans and agents, so a shared misreading of an Oolite line would pass every fixture. The fidelity report `.planning/phases/14-npc-flight-and-steering-fidelity-gate/14-FIDELITY-REPORT.md` states this limit.
- **Steering sites without an excerpt or an oracle.** The accuracy 9 dodge of attack fly-to (`src/Core/Entities/ShipEntity.m:4721-4729`) needs the target's weapon types, which a body view does not carry, so it is not ported and no fixture reaches it; the docking branches, the afterburner, missiles, cloaking, turrets and the broadside and running-defense behaviours are scope cuts of the PROJECT.md row that starts "Phase 14 NPC steering scope".
- **Wreck lifetime and the debris look are unmeasured (E-80, E-84 to E-86).** The burn-down follows the C exactly as written (about E/1000 seconds, 7 to 82 ticks), but no wreck has been watched burning out in a running Oolite, and the explosion cloud, flash, wreckage and tumble have had no side-by-side look. Both joined the measurement todo `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md` (the PROJECT.md row that starts "Wreckage burns down by Oolite's heat damage").
- **Reference Oolite for measurements.** A headless Oolite 1.93.1-255 (AppImage SHA256 `4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`) now runs on the test machine from [tools/oolite-reference/README.md](./tools/oolite-reference/README.md). It is 14 commits after the 1.93.1-241 pin (`7437f22`). Those commits touch joystick and key mapping, load/save, a HUD distance-unit string and descriptions.plist text, and none touches ShipEntity, Octree, OOMesh or Universe. A measured difference therefore applies to the pinned excerpts, unless it lands in one of those files. The ship masses were measured with it in quick task 261117-jji (Constants ledger). The mass-lock range and the jump blockage were measured with it in quick task 261117-lka (Constants ledger). The UI screens were compared with it in quick task 261117-nfn (next bullet). The wreck lifetime and the explosion and debris look stay open in `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`.
- **UI screens compared with a running Oolite (quick task 261117-nfn).** Oolite 1.93.1-255 against Wegolite `5a4e4cd`, a new commander at Lave, 1280x720, no NPC traffic, the ship stopped just after the launch; F7 was compared with the chart hover card because commit `c1c9897` removed F7. Ranked R1 (information): the "Hyperspeed mass-locked." reply to J came 14.7 s late, queued behind first-use hints on a one-line FIFO, where Oolite shows it at once in a multi-row area (fixed in quick task 261117-pij); an extra "Mass locked" message (fixed in quick task 261117-pij); the condition light is always green (Oolite yellow while mass-locked) (fixed in quick task 261117-pij); the clock starts at 00:00:00, not Oolite's 20:13:24 (fixed in quick task 261117-pij); extra "7.0 LY" and "0.000 LS" readouts (decided in quick task 261118-cyn: keep); no scanner zoom indicator (later, owner decision 2026-11-18); no default hyperspace target ("(Unknown)" for Lave) (fixed in quick task 261117-pij); the market legality column prints "Ex" where Oolite prints "Im" (fixed in quick task 261117-pij); no market filter, sort or load line (load line and sort fixed in quick task 261118-cyo; the filter decided in quick task 261118-cyo: not to fix); no kill count after the rating (fixed in quick task 261117-pij); "Cobra Mk III" for "Cobra Mark III" (fixed in quick task 261117-pij); "Cr" for "₢" (fixed in quick task 261117-pij); a manifest table instead of Oolite's capacity, cabins and "No cargo carried." lines (fixed in quick task 261118-cyo); no dashboard under the docked screens (decided in quick task 261118-cyo: not to fix); no galaxy number in the chart title (fixed in quick task 261118-cyo); uniform chart markers (Oolite colours them by sun and sizes them by planet radius) (fixed in quick task 261118-cyo); no planet search (fixed in quick task 261118-cyo); an extra 7 ly jump graph (decided in quick task 261118-cyo: not to fix); an extra "Inhabitants" label on the hover card (fixed in quick task 261118-cyo). Ranked R2 (layout): the forward view uses 57.2° vertically where Oolite uses it horizontally at 16:9, so everything ahead looks about 1.78 times smaller (fixed in quick task 261117-o8q); the clock, condition light and message line sit elsewhere (the condition light and message area fixed in quick task 261118-cyn; the clock stays at the top left by owner decision 2026-11-18); the page overlay overprints the clock in flight (the version text hidden in flight in quick task 261118-cyn; the system line stays by owner decision 2026-11-18); the scanner and crosshair are smaller (the HUD scale fixed in quick task 261118-cyn, resting on the disclaimer, E-110); 11 of 17 market rows and no status equipment list fit at 1280x720 (fixed in quick task 261118-cyo); the galaxy-preset labels overprint each other (fixed in quick task 261118-cyo). Six R3 (style) items (the buoy flash, the yellow message text, the compass and the aegis glyph fixed in quick task 261118-cyn, E-111, E-112); the station and chart palette and colours (decided in quick task 261118-cyo: not to fix). Decided: the tab strip and Home screen, the F7 removal (`c1c9897`), the chart presets, framing and label thinning, the hyperspace target on the clock line, the shared footer and disclaimer, and the first-use hints (`89c3b41`); market values differ only because both games draw a random market. Noise (llvmpipe against SwiftShader, fonts, antialiasing, star field, planet texture, station roll) was ignored, and no pair was dropped. The work is in `.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md`, `.planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md` and `.planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md`.
- **Flight HUD geometry checked against Oolite (quick task 261118-cyn).** At 1280x720 against the 261117-nfn Oolite captures, after the disclaimer lift (61.6 px), the scanner, compass, aegis glyph, condition light, missile row and the SPD, FWD and side surrounds are within 1 px of Oolite, the crosshair arms within 4 px, the message text within 3.5 px of its centre and 1 px of its width. Open: the condition light's alpha pulse (`src/Core/HeadUpDisplay.m:2560` at 7437f22); Oolite's word wrap of a long message into a second row; below 16:9 the HUD letterboxes by width where Oolite stays height-scaled down to 4:3 (`src/SDL/MyOpenGLView.m:498-505`); the scanner zoom and its "1:1" indicator (later, owner decision 2026-11-18). Tracked in `.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md`.
- **Coriolis and buoy layout radii (resolved in quick task 261117-k1l).** Quick task 261117-jji measured the Coriolis station at 779.3702392578125 m and the buoys at 59.13554763793945 m, against Wegolite's own 500 and 10; the layout now uses the measured values, compiled from the meshes (E-89) and pinned in `src/sim/world/layout.ts:71-73`. These radii never fed the dock collision (that is the hull SAT of `dock-port.json`); they feed NPC proximity and avoidance, the STATION_AEGIS shell, the witchpoint arrival safety, the torus nearest-surface distance and the scanner rim. The buoy decision todo `.planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md` can use the measured buoy masses (698,691.1875, blockage radius 264.3 m).
- **Outfitting list presentation (E-108).** List membership follows Oolite's `equipmentAllowed` (`src/Core/Entities/PlayerEntity.m:8293-8302`): F3 lists an item only when the station offers it, the raw tech level allows it and it can be added now. Oolite draws an item the commander cannot afford in its normal option colour (`PlayerEntity.m:8381-8384`, the item's `displayColor` or `equipment_option_color`) with no marker, and refuses it only when the purchase is tried (`PlayerEntity.m:9134`); Wegolite dims the row and shows "Not enough credits" (owner decision 2026-11-18, quick task 261118-emk). Showing the normal colour would be a one-line change to the row's `dimmed` flag in `src/ui/station-model.ts`. Wegolite's integrity refusals (an invalid price or a malformed condition) hide the row, as a failing condition does in Oolite. Oolite's bargain tech days (`PlayerEntity.m:8274-8285`), which on some days offer an item up to two tech levels above the system's, are not modelled; see the todo `.planning/todos/pending/2026-11-18-outfitting-bargain-tech-days.md`.
- **HUD alpha (open).** Oolite draws the HUD dials at `overall_alpha` 0.75 (`Resources/Config/hud.plist:392` at 7437f22), the aegis glyph at 0.5 x 0.75 (`src/Core/HeadUpDisplay.m:1645`), the crosshair arms fading from 0.75 at the inner end to 0.25 at the outer end (`Resources/Config/crosshairs.plist:45-51`, the `OTHER` set the pulse laser uses; each segment is alpha, x, y, alpha, x, y as `OOCrosshairs.m:142-147` reads it) and the scanner lollipop tails at one third alpha (`src/Core/HeadUpDisplay.m:1339`), while Wegolite draws them opaque. Not changed (owner decision 2026-11-18, quick 261118-n7z); tracked in `.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md`.
