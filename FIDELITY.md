# Fidelity map: Wegolite against Oolite

This document maps each mechanic that the v1 single-player loop ports from Oolite to the Wegolite file that implements it, and to the Oolite source that defines it. Each row states whether Wegolite is `faithful` or a recorded `divergence`, and every divergence names its row in the PROJECT.md Key Decisions table. The scope is the single-player loop shipped in v1: launch, flight, docking, trade, outfitting and hyperspace, plus the build-time ship mass of v2.1 (DATA-11). The source of truth is Oolite release 1.93.1-241 at commit `7437f22` (`third_party/oolite/pin.json`). Every excerpt below is copied from that commit, not from a checkout's HEAD.

## Attribution

The quoted excerpts are from Oolite, Copyright © 2004-2026 Giles C Williams, Jens Ayton and contributors, and are licensed under GPL-2.0-or-later. They are quoted unmodified, taken from `git show 7437f22:<path>`, so each one can be checked against that commit. The quotation is recorded as one row in ASSETS.md.

## How to check a row

The Wegolite cell is a `src/` path and a line. For a build-time mechanic it is the schema field in `src/` that carries the compiled value, and the Mechanic cell names the `tools/` module that computes it. The Oolite cell is the Oolite file and line range, and the excerpt with the same id quotes those lines verbatim. The contract test in `tests/contract/fidelity.test.ts` checks every row on every run. When `OOLITE_SRC` points at a tree at commit `7437f22`, it also checks each excerpt against that tree.

## Mechanics

| Mechanic                                                                                                                                            | Wegolite                                | Oolite (7437f22)                                        | Fidelity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Excerpt |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Commodity stock and price for each good at system generation (ECON-01, ECON-02)                                                                     | `src/sim/economy/market.ts:180`         | `src/Core/OOCommodities.m:261-278`                      | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-01    |
| Chart distance with C integer truncation (NAV-01)                                                                                                   | `src/sim/hyperspace/jump.ts:89`         | `src/Core/legacy_random.h:154-160`                      | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-02    |
| Witchpoint exit offset on arrival (NAV-05)                                                                                                          | `src/sim/hyperspace/arrival.ts:125`     | `src/Core/Entities/PlayerEntity.m:6913-6928`            | divergence: the offset is drawn from the seeded PRNG at jump commit, not from Oolite's global Ranrot stream. PROJECT.md: "Draw the arrival pose from the seeded PRNG at jump commit, in three dimensions as Oolite does"                                                                                                                                                                                                                                                                                                                                                                                                   | E-03    |
| Pitch and roll rates and their damping (FLGT-02)                                                                                                    | `src/sim/flight/attitude.ts:34`         | `src/Core/Entities/PlayerEntityControls.m:3726-3728`    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-04    |
| Speed ramp toward the torus cap                                                                                                                     | `src/sim/flight/speed.ts:37`            | `src/Core/Entities/PlayerEntity.m:2745-2748`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-05    |
| Torus factor from the nearest body (FLGT-04)                                                                                                        | `src/sim/flight/torus.ts:79`            | `src/Core/Entities/PlayerEntity.m:2958-2967`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-06    |
| Torus mass lock near a body (planet branch)                                                                                                         | `src/sim/flight/torus.ts:99`            | `src/Core/Entities/PlayerEntity.m:3019-3024`            | divergence: the torus disengages on any pilot input, which is stricter than Oolite's speed and mass-lock rule. PROJECT.md: "Torus disengages on any pilot input (deliberately stricter than Oolite)"                                                                                                                                                                                                                                                                                                                                                                                                                       | E-07    |
| Launch roll basis taken from the station                                                                                                            | `src/sim/flight/launch.ts:58`           | `src/Core/Entities/PlayerEntity.m:6469-6470`            | divergence: launch roll is expressed in the station's world basis, not Oolite's ship-relative value. PROJECT.md: "Launch roll is expressed in the station's world basis (D-10 reconciliation)"                                                                                                                                                                                                                                                                                                                                                                                                                             | E-08    |
| Station and planet aegis                                                                                                                            | `src/sim/world/aegis.ts:34`             | `src/Core/Entities/ShipEntity.m:6699-6702`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-09    |
| System layout: the sun clears the witchpoint by six sun radii                                                                                       | `src/sim/world/layout.ts:139`           | `src/Core/Universe.m:1473-1473`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-10    |
| Docking corridor auto-centre and the y guard                                                                                                        | `src/sim/dock/corridor.ts:325`          | `src/Core/Entities/DockEntity.m:748-755`                | divergence: the y auto-centre guard is symmetric. PROJECT.md: "Apply the y auto-centre guard symmetrically"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | E-11    |
| Dock latch arming past the contact proxy                                                                                                            | `src/sim/dock/step.ts:163`              | `src/Core/Entities/DockEntity.m:716-720`                | divergence: the latch arms only once the contact proxy is clear, not at the mouth plane. PROJECT.md: "Arm the dock latch past the contact proxy, not at the mouth plane"                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-12    |
| Docking computer tech-level gate (TL 9)                                                                                                             | `src/sim/player/outfitting.ts:303`      | `src/Core/Entities/PlayerEntity.m:8293-8295`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-13    |
| Cargo pod and unit boundaries                                                                                                                       | `src/sim/economy/cargo.ts:22`           | `src/Core/Entities/PlayerEntity.h:1294-1297`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-14    |
| Buying in kg and g, clamped to the hold                                                                                                             | `src/sim/economy/cargo.ts:156`          | `src/Core/Entities/PlayerEntity.m:10029-10040`          | divergence: a partially filled hold is clamped exactly. PROJECT.md: "Clamp kg/g buys exactly in a partially filled hold (improves on Oolite)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | E-15    |
| Market lifetime across reload and system changes                                                                                                    | `src/sim/economy/market.ts:41`          | `src/Core/Universe.m:7173-7191`                         | divergence: Wegolite persists one market seed and regenerates from it, so a reload reproduces every price. PROJECT.md: "Stable market across reload: persist the seed (deliberate modernisation)"                                                                                                                                                                                                                                                                                                                                                                                                                          | E-16    |
| Missile removal trade-in                                                                                                                            | `src/sim/player/outfitting.ts:443`      | `src/Core/Entities/PlayerEntity.m:9326-9330`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-17    |
| Missile cap                                                                                                                                         | `src/sim/player/outfitting.ts:47`       | `src/Core/Entities/PlayerEntity.h:284-286`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-18    |
| Hyperspace fuel cost                                                                                                                                | `src/sim/hyperspace/jump.ts:116`        | `src/Core/Entities/PlayerEntity.m:6630-6633`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-19    |
| Hyperspace jump clock                                                                                                                               | `src/sim/hyperspace/jump.ts:106`        | `src/Core/Entities/PlayerEntity.m:6884-6886`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-20    |
| Hyperspace countdown cancelled by a dock                                                                                                            | `src/sim/flight/step.ts:227`            | `src/Core/Entities/PlayerEntity.m:3296-3297`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-21    |
| Mass blockage at jump completion (Coriolis station and NPC ships)                                                                                   | `src/sim/hyperspace/countdown.ts:81`    | `src/Core/Entities/ShipEntity.m:12526-12530`            | divergence: the Coriolis station and NPC ships block (WORLD-10, Phase 12). The two navigation buoys stay non-blocking by owner decision 2026-11-14 (option A), because tests/e2e/hyperspace-failure.spec.ts completes a countdown 0 m from the witchpoint buoy, inside its 264.3 m blockage radius, so blocking buoys would change an existing browser spec; the revisit is the todo 2026-11-14-make-buoys-block-hyperspace-like-oolite. The 224 dodecahedron and icosahedron systems have no mass (D-03). PROJECT.md: "Block a witchspace jump that completes inside Oolite's mass-blockage radius of a Coriolis station" | E-22    |
| Coriolis station mass for blockage                                                                                                                  | `src/sim/hyperspace/countdown.ts:63`    | `src/Core/Entities/ShipEntity.m:12504-12504`            | divergence: the cited comment's 455,223,200 predates the current meshes; blockage uses the mass Oolite computes for the pinned meshes (E-27, E-28). PROJECT.md: "Coriolis blockage mass: Oolite's computed 515,483,904 replaces the 455,223,200 source comment (Phase 10, D-04)"                                                                                                                                                                                                                                                                                                                                           | E-23    |
| Chart orientation: a larger galaxy y is drawn lower                                                                                                 | `src/ui/chart-model.ts:206`             | `src/Core/GuiDisplayGen.m:1575-1575`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-24    |
| Chart star placement                                                                                                                                | `src/ui/chart-model.ts:206`             | `src/Core/GuiDisplayGen.m:1947-1948`                    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-25    |
| Planet surface colour classes (PlanetMix thresholds only; see open items)                                                                           | `src/render/shaders/planet.glsl.ts:219` | `src/Core/Materials/OOPlanetTextureGenerator.m:666-679` | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-26    |
| Ship mass from the hull octree, density x 20 x volume (DATA-11; computed in `tools/oolite-ingest/convert/ship-mass.ts`)                             | `src/content/schemas/ship-npc.ts:36`    | `src/Core/Entities/ShipEntity.m:417-419`                | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-27    |
| Solid subentity masses added to the parent (the Coriolis faceplate, tris and dock; flashers excluded)                                               | `src/content/schemas/ship.ts:97`        | `src/Core/Entities/ShipEntity.m:2034-2041`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-28    |
| Octree depth from the mesh size (computed in `tools/oolite-ingest/convert/octree.ts`)                                                               | `src/content/schemas/ship-npc.ts:36`    | `src/Core/OOMesh.m:609-619`                             | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-29    |
| Octree volume summed to five levels whatever the build depth                                                                                        | `src/content/schemas/ship-npc.ts:36`    | `src/Core/Octree.m:672-680`                             | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-30    |
| Mass lock by NPC ships (WORLD-10)                                                                                                                   | `src/sim/world/ship-field.ts:82`        | `src/Core/Entities/PlayerEntity.m:3044-3061`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-31    |
| Torus factor from the nearest body, ships excluded                                                                                                  | `src/sim/flight/torus.ts:53`            | `src/Core/Entities/PlayerEntity.m:2918-2934`            | divergence: Oolite's factor takes the nearest collidable entity including ships; Wegolite keeps the five bodies, because WORLD-10 does not ask for it and the factor differs only above 102.4 km from every body. PROJECT.md: "Torus factor ignores NPC ships"                                                                                                                                                                                                                                                                                                                                                             | E-32    |
| NPC ship collision radius (build time, `tools/oolite-ingest/convert/ship-radius.ts`; no solid subentity)                                            | `src/content/schemas/ship-npc.ts:42`    | `src/Core/OOMesh.m:1803-1822`                           | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-33    |
| Populator location codes (LANE_WP, LANE_WS, LANE_PS, LANE_WPS, STATION_AEGIS)                                                                       | `src/sim/world/placement.ts:177`        | `src/Core/Universe.m:1796-1815`                         | divergence: every rejection loop is capped at 256 tries with a last-candidate fallback (Oolite loops are uncapped); no committed galaxy-0 system takes the fallback. PROJECT.md: "First inert populator (WORLD-15)"                                                                                                                                                                                                                                                                                                                                                                                                        | E-34    |
| First populator: which ships, where (fixed 12-ship table, singles, no rates or groups)                                                              | `src/sim/world/populate.ts:90`          | `src/Core/Universe.m:2648-2648`                         | divergence: Oolite's populator rolls its own counts, rates and groups per system (oolite-populator.js, not under src/); Wegolite places a fixed table of 12 single ships and puts shuttles and scavengers at STATION_AEGIS. PROJECT.md: "First inert populator (WORLD-15)"                                                                                                                                                                                                                                                                                                                                                 | E-35    |
| Laser fire gate: refused while the facing's laser is at or above 85 % of its temperature limit (CBT-05)                                             | `src/sim/combat/weapons.ts:52`          | `src/Core/Entities/PlayerEntity.m:5460-5464`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-36    |
| Laser fire gate: refused when the energy bank is at or below the shot's cost, strict (CBT-05)                                                       | `src/sim/combat/weapons.ts:58`          | `src/Core/Entities/PlayerEntity.m:5478-5481`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-37    |
| Shot cost: energy, the facing's laser heat and its shot timer reset (CBT-05)                                                                        | `src/sim/combat/weapons.ts:68`          | `src/Core/Entities/PlayerEntity.m:5485-5491`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-38    |
| Weapon cooling each step, floored at 0 (CBT-05)                                                                                                     | `src/sim/combat/weapons.ts:84`          | `src/Core/Entities/PlayerEntity.m:2481-2485`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-39    |
| Laser recharge gate: a held fire key fires again only once the facing's shot timer exceeds the laser's recharge rate (CBT-05)                       | `src/sim/combat/weapons.ts:51`          | `src/Core/Entities/PlayerEntityControls.m:1185-1185`    | divergence: the timer counts fixed ticks, so the gate is a strict comparison in integer ticks. PROJECT.md: "Quantise the laser recharge gate to integer ticks and keep the strict `>`"                                                                                                                                                                                                                                                                                                                                                                                                                                     | E-40    |
| Energy bank recharge first, then each shield's recharge capped by its room (CBT-06)                                                                 | `src/sim/combat/shields.ts:51`          | `src/Core/Entities/PlayerEntity.m:2581-2597`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-41    |
| Energy available to the shields (a quarter of the bank held back while both shields are above a quarter) and the lower shield served first (CBT-06) | `src/sim/combat/shields.ts:66`          | `src/Core/Entities/PlayerEntity.m:2603-2616`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-42    |
| Shields gain, the bank pays, shields and energy clamp to their maxima (CBT-06)                                                                      | `src/sim/combat/shields.ts:85`          | `src/Core/Entities/PlayerEntity.m:2619-2625`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-43    |
| Hit routing: the attacker's side picks the shield, the forward one when ahead or abeam (CBT-06)                                                     | `src/sim/combat/shields.ts:132`         | `src/Core/Entities/PlayerEntity.m:5646-5662`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-44    |
| Overflow to the energy bank and cabin heat from energy damage (CBT-06)                                                                              | `src/sim/combat/shields.ts:152`         | `src/Core/Entities/PlayerEntity.m:5666-5677`            | divergence: the energy bank floors at 0, because player death and ejection are outside this milestone. PROJECT.md: "Floor the player's energy at 0 until a death phase exists"                                                                                                                                                                                                                                                                                                                                                                                                                                             | E-45    |
| Cabin cooling in space (CBT-06)                                                                                                                     | `src/sim/combat/shields.ts:175`         | `src/Core/Entities/PlayerEntity.m:2662-2672`            | divergence: the external temperature is 0 and the sun branch is not ported. PROJECT.md: "External cabin temperature is 0; sun and atmosphere heating stay out (D-05)"                                                                                                                                                                                                                                                                                                                                                                                                                                                      | E-46    |
| Docking restores both shields, the energy bank, the laser temperature and the cabin temperature (DOCK-10)                                           | `src/sim/combat/state.ts:114`           | `src/Core/Entities/PlayerEntity.m:6321-6325`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-47    |
| Two-stage laser hit: the bounding-sphere test, then the octree, nearest hit wins (CBT-07)                                                           | `src/sim/combat/hit.ts:71`              | `src/Core/Universe.m:5615-5628`                         | divergence: the stations and buoys are static entities and are never hit. PROJECT.md: "Statics are neither laser nor ident targets (OQ4, F10), advisor-resolved, PENDING OWNER CONFIRMATION"                                                                                                                                                                                                                                                                                                                                                                                                                               | E-48    |
| Octree line test: the distance to the first solid leaf reached, resolved at the cube of the array node that holds it (CBT-07)                       | `src/sim/combat/octree.ts:345`          | `src/Core/Octree.m:361-366`                             | divergence: the maths run in float64, not float32. PROJECT.md: "Run the octree ray maths in float64, so only boundary rays may differ from Oolite's float32"                                                                                                                                                                                                                                                                                                                                                                                                                                                               | E-49    |
| Octree visiting order: the intersected octant, three neighbours, the back three, the diagonal (CBT-07)                                              | `src/sim/combat/octree.ts:405`          | `src/Core/Octree.m:413-422`                             | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-50    |
| Laser frame: the view rotates the weapon about the ship's up axis (aft pi, port +pi/2, starboard -pi/2) (CBT-04, CBT-05)                            | `src/sim/combat/aim.ts:63`              | `src/Core/Universe.m:5587-5603`                         | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-51    |
| Ident acquisition: the nearest ship whose collision sphere the view axis crosses, within 100 m of the scanner range (INPUT-01)                      | `src/sim/combat/ident.ts:91`            | `src/Core/Universe.m:5689-5707`                         | divergence: stations and buoys are static entities and are never locked. PROJECT.md: "Statics are neither laser nor ident targets (OQ4, F10), advisor-resolved, PENDING OWNER CONFIRMATION"                                                                                                                                                                                                                                                                                                                                                                                                                                | E-52    |
| Ident key: clears a standing lock, engages ident and re-acquires on the next pass (INPUT-01; the owner's D-04 reading is pending, see Open items)   | `src/sim/combat/ident.ts:146`           | `src/Core/Entities/PlayerEntityControls.m:4758-4773`    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-53    |
| Untarget key: drops the lock and switches ident off (INPUT-01)                                                                                      | `src/sim/combat/ident.ts:146`           | `src/Core/Entities/PlayerEntityControls.m:1404-1419`    | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-54    |
| Laser purchase and trade-in: the full price against the credits, then the replaced laser refunded (CBT-05)                                          | `src/sim/player/outfitting.ts:623`      | `src/Core/Entities/PlayerEntity.m:9210-9217`            | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-55    |
| NPC energy bank recharge each stepped tick, capped at the maximum (CBT-07)                                                                          | `src/sim/combat/step.ts:223`            | `src/Core/Entities/ShipEntity.m:2417-2425`              | faithful                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E-56    |

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

### E-48 src/Core/Universe.m:5615-5628

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

## Constants ledger

Each constant below is the value Wegolite compiles, its unit (a mass is Oolite's float32 mass in its own units; a length is in metres), the Oolite lines it follows, and the test that pins it.

| Constant                                                                                                                                                                                                         | Value                                                                                                                                                                                                               | Oolite (7437f22)                                                                                                  | Pinned by                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mass factor and default density                                                                                                                                                                                  | 20 and 1.0                                                                                                                                                                                                          | `ShipEntity.m:417-419`                                                                                            | `tools/oolite-ingest/convert/ship-mass.test.ts`                                                                                                                     |
| Octree depth                                                                                                                                                                                                     | 4 below a size of 20, 5 below 900, 6 below 1,800, else 7 (size is the mean of the two largest bounding-box spans over all vertices)                                                                                 | `OOMesh.m:60-70` and `591-623`, `Octree.h:81-83`                                                                  | `tools/oolite-ingest/convert/octree.test.ts`                                                                                                                        |
| Octree minimum half-width, root padding, volume depth limit                                                                                                                                                      | 1.0 m, 0.5 m, 5                                                                                                                                                                                                     | `Octree.h:31`, `OOMeshToOctreeConverter.m:263`, `Octree.m:680`                                                    | `tools/oolite-ingest/convert/octree.test.ts`                                                                                                                        |
| Cobra Mk III (`oolite_template_cobra3-player`) mass                                                                                                                                                              | 214,737.6875                                                                                                                                                                                                        | `ShipEntity.m:417-419`                                                                                            | `tools/oolite-ingest/convert/ship-mass.test.ts`, `tests/content/ships-client.test.ts`                                                                               |
| Viper mass                                                                                                                                                                                                       | 34,040.6796875                                                                                                                                                                                                      | `ShipEntity.m:417-419`                                                                                            | `tools/oolite-ingest/convert/ship-mass.test.ts`, `tests/golden/content/ships-npc.json`                                                                              |
| Coriolis station mass: hull 228,650,880 + faceplate 58,255,096 + tris 220,998,576 + dock 7,579,321                                                                                                               | float32 running sum in shipdata order, each step rounded: 515,483,904 (exact decimal sum 515,483,873)                                                                                                               | `ShipEntity.m:417-419` and `2034-2041`                                                                            | `tools/oolite-ingest/convert/ship-mass.test.ts`, `tests/content/ships-client.test.ts`                                                                               |
| Navigation buoy mass                                                                                                                                                                                             | 698,691.1875 = 691,044.375 + 7,646.7861328125                                                                                                                                                                       | `ShipEntity.m:2034-2041`                                                                                          | `tools/oolite-ingest/convert/ship-mass.test.ts`; stored in `src/content/generated/ships-client.json` (entry `buoy`), pinned by `tests/content/ships-client.test.ts` |
| Coriolis blockage mass `CORIOLIS_STATION_MASS`                                                                                                                                                                   | 515,483,904, the computed mass (owner decision 2026-11-14, plan 10-03); the source comment's 455,223,200 predates the current meshes. PROJECT.md: the row that starts "Coriolis blockage mass:"                     | `ShipEntity.m:12504`                                                                                              | `tests/sim/hyperspace-blockage.test.ts`                                                                                                                             |
| Laser stats (range m, energy per shot, damage, recharge s, shot temperature): pulse 12,500, 0.8, 15, 0.5, 7; beam 15,000, 0.5, 6, 0.1, 3.2; mining 12,500, 1.4, 50, 2.5, 10; military 30,000, 1.1, 12, 0.1, 4.25 | recharge also held as integer ticks, `round(rate * 120)`: 60, 12, 300, 12 (the strict gate makes the periods 61, 13, 301, 13)                                                                                       | `Resources/Config/equipment.plist:125-136`, `143-154`, `163-174`, `184-195`                                       | `tests/sim/combat/constants.test.ts`                                                                                                                                |
| Weapon heat: cooling factor, maximum temperature, cut-out fraction, initial shot time                                                                                                                            | 6 per second, 256, 0.85, 100 s                                                                                                                                                                                      | `ShipEntity.h:115`, `PlayerEntity.h:277`, `ShipEntity.h:117`, `ShipEntity.h:102`                                  | `tests/sim/combat/constants.test.ts`, `tests/sim/combat/weapons.test.ts`                                                                                            |
| Shield and energy: baseline shield, shield recharge rate, Cobra maximum energy and recharge rate                                                                                                                 | 128, 2 per second each, 256, 4 per second                                                                                                                                                                           | `ShipEntity.h:101`, `PlayerEntity.m:1536-1537` and `1949-1950`, `Resources/Config/shipdata.plist:1333` and `1296` | `tests/sim/combat/constants.test.ts`, `tests/sim/combat/shields.test.ts`                                                                                            |
| Energy bank threshold kept before the shields charge (`shield_charge_energybank_threshold`)                                                                                                                      | 0.25. The code default decides: `PlayerEntity.m:2606` reads it with `defaultValue:0.25`, while the comment in `global-settings.plist:20-26` says "Default: 0.0" and the commented-out example is 0.75 (RESEARCH F9) | `PlayerEntity.m:2606`                                                                                             | `tests/sim/combat/shields.test.ts`                                                                                                                                  |
| Cabin temperature: cooling factor, maximum, minimum, player heat insulation                                                                                                                                      | 0.1, 256, 60, 1                                                                                                                                                                                                     | `ShipEntity.h:63`, `:69`, `:70`, `PlayerEntity.m:1531`                                                            | `tests/sim/combat/constants.test.ts`, `tests/sim/combat/shields.test.ts`                                                                                            |
| Cabin heat per point of energy damage (`SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR`)                                                                                                                                      | 0.5: the macro is `mass > 400000 ? 200000 / mass : 0.5` and the Cobra mass is 214,737.6875                                                                                                                          | `ShipEntity.h:67`                                                                                                 | `tests/sim/combat/constants.test.ts`                                                                                                                                |
| Scanner range, ident acquisition range                                                                                                                                                                           | 25,600 m, 25,500 m (100 m shorter than the range at which the target is lost)                                                                                                                                       | `Entity.h:49`, `Universe.m:5653`                                                                                  | `tests/sim/combat/constants.test.ts`, `tests/sim/combat/ident.test.ts`                                                                                              |
| Laser shot lifetime (`kLaserDuration`)                                                                                                                                                                           | 0.09 s                                                                                                                                                                                                              | `OOLaserShotEntity.m:36`                                                                                          | `tests/sim/combat/constants.test.ts`, `tests/render/laser-shots.test.ts`                                                                                            |

Reading of ROADMAP Phase 10 criterion 2: "reproduce Oolite's mass within a stated tolerance" is read as Oolite's algorithm run on the pinned meshes, re-derived independently in float64 within a relative 1e-6, plus the community VariableMasslock table to the whole tonne, because no Oolite runtime is available to observe the mass. Owner answer on this reading: accepted, 2026-11-14 (plan 10-03), on condition that it is easy to change later. It is revisable: a real-Oolite check (for example a tiny out-of-repo test script logging `ship.mass` of the Coriolis station and the buoy to Latest.log) is a deferred follow-up task after the phase, and if it disagrees only the `CORIOLIS_STATION_MASS` constant, its test pins and this paragraph change.

Tolerances and what is not reproduced: the golden values are bit-exact float32. The worked examples are re-derived independently in float64 from terminal-node counts and the mesh radius and agree within a relative 1e-6. Nine hull masses equal the community VariableMasslock table (wiki.alioth.net) when divided by 1,000 and rounded to whole tonnes. No Oolite runtime was available, so the Coriolis and buoy composites are derived from the source, not observed. The source constants 455,223,200 (`ShipEntity.m:12504`; the computed mass is 1.1324 times it, the hull alone 0.5023 times) and 185,580 (`PlayerEntity.m:191-192`, the Cobra fallback; the computed mass is 15.71 % above it) predate the current meshes and are not reproduced.

## Open items

These are gaps the table cannot close on its own. Each one is stated so a reviewer can check it.

- **Planet noise budget (E-26).** E-26 quotes only the PlanetMix thresholds. The noise field is generated under a fixed budget in `src/render/planet-noise.ts:40-48` (six surface octaves, one relief tap, one cloud octave, nine evaluations). No excerpt covers Oolite's noise generator, and no PROJECT.md Key Decisions row records the budget. The planet-surface row is therefore faithful for the colour classes only.
- **Aegis near-surface clause (E-09).** Oolite's `isNearPlanetSurface` clause (`src/Core/Entities/ShipEntity.m:6681-6682`) is not modelled. It can change the result only for a planet with a radius below about 250 m, where the 500 m surface band reaches past the 3x-radius test. The v1 layouts were not checked against every one of the 2,048 systems.
- **Torus mass lock, station branch (E-07).** E-07 quotes the planet branch only. The station check in `src/sim/flight/torus.ts:99-103` uses the scanner range and is not covered by an excerpt.
- **NPC collision radius (E-33).** E-33 quotes `src/Core/OOMesh.m:1803-1822`, the running maximum and the `sqrtf`; the `magnitude2` line that feeds the maximum is `OOMesh.m:1801`, 22 lines from the `sqrtf` and so outside one 20-line excerpt. The subentity extension of the radius (`src/Core/Entities/ShipEntity.m:2028-2044`) is not ported: no NPC ship has a solid subentity, so it is not exercised, and `computeShipRadii` fails the build if one appears.
- **Populator lane lengths (E-34).** E-34 quotes `src/Core/Universe.m:1796-1815`, from the `total` line through the `STATION_AEGIS` loop; the three lane lengths it divides by (`l1`, `l2`, `l3`, `Universe.m:1793-1795`) sit just above the 20-line cap and are not quoted. They are the lengths of the planet, planet-to-sun and sun vectors, as `locationByCode` in `src/sim/world/placement.ts` computes them. The other location codes of `locationByCode` (the orbits, `TRIANGLE`, the system regions) are not ported: the first populator uses five.
- **Docking computer TL, station override (E-13).** Oolite's docked-station override of the tech level (`src/Core/Entities/PlayerEntity.m:8229-8232`) is not modelled. The only `equivalent_tech_level` in the pinned data is on the rock-hermit template (`Resources/Config/shipdata.plist:3247`), and the Coriolis template (`Resources/Config/shipdata.plist:1690`) sets none, so the override never applies to the v1 station.
- **Missile trade-in price factor (E-17).** `PlayerEntity.m:9434-9435` scales a trade-in only when the station's price factor is below 1.0. The Coriolis template sets no `equipment_price_factor`, and `src/Core/Entities/StationEntity.m:601` defaults it to 1.0, so no scaling applies to the v1 station.
- **Octree leaf resolution (E-49).** Oolite reaches a solid leaf without testing the line against it, so a hit resolves at the cube of the array node that holds the leaf (`src/Core/Octree.m:361-366`). The port keeps that faithfully (plan 13-03, RESEARCH Pitfall 4) and does not tidy it, so a hit distance is the distance to a cell centre, not to the hull surface.
- **Ident key and message (E-53, E-54).** The ident rows follow Oolite. CONTEXT D-04 words the lifecycle as "pressing R again clears the lock" and D-03 asks for the target's name and class; the PROJECT.md rows that start "D-04, advisor-recommended deviation" and "D-03, advisor-recommended deviation" record the two readings and are pending owner confirmation. Neither has been confirmed.
- **Stations and buoys are not hit or locked (E-48, E-52).** Pending owner confirmation (the PROJECT.md row that starts "Statics are neither laser nor ident targets").
- **NPC fire has no recharge gate (E-56 and the NPC fire decision).** An NPC fires on every think of its AI through `ShipControl.fire`; it has no laser heat, no shot timer and no energy cost (CBT-15 owns autonomous NPC fire), so the only rate limit is the AI's own think interval (15 ticks for the test pilot). Only the hit and damage rule and the energy recharge (E-56) are ported.
- **Weapon-none ordering (E-36, E-37).** Oolite tests the temperature before it tests `isWeaponNone`; `fireGate` tests the empty mount first. A laser can only be removed while docked, where every temperature is reset to 0 (E-47), so a hot empty mount cannot occur and the order is not observable.
- **No browser evidence for the visuals.** The four views (not mirrored or clipped), the one-pixel laser shots and the ident frame placement are covered by unit tests only (`tests/render/launch-camera.test.ts`, `tests/render/laser-shots.test.ts`, `tests/hud/projection.test.ts`) and need a human look; the opt-in browser smoke (`tests/e2e/combat.spec.ts`) reads probe values, not pixels.
